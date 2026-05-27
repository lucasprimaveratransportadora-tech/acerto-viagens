const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const activity = require('./controleViagensActivity.service');
const audit = require('./audit.service');

const VALID_STATUS = ['PLANEJADA', 'EM_CURSO', 'FINALIZADA', 'CANCELADA'];

// Campos editáveis numa viagem via PATCH (whitelist).
const EDITABLE_FIELDS = [
  'origem', 'destino', 'carga_descricao', 'fabrica', 'cliente_descarga',
  'valor_frete',
  'data_coleta', 'data_carregamento', 'data_agendamento_entrega',
  'observacoes',
];

const DATE_FIELDS = ['data_coleta', 'data_carregamento', 'data_agendamento_entrega'];

function normalizeField(field, value) {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  if (DATE_FIELDS.includes(field)) return new Date(value);
  if (field === 'valor_frete') {
    const n = Number(value);
    return isNaN(n) ? null : n;
  }
  return value;
}

async function assertTruckBelongsToEmpresa(truckId, empresaId) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');
}

async function getById(viagemId, empresaId) {
  const viagem = await prisma.truckViagem.findFirst({
    where: { id: viagemId, deleted_at: null },
    include: {
      truck: { select: { id: true, empresa_id: true, placa: true } },
      created_by: { select: { id: true, nome: true, email: true } },
    },
  });
  if (!viagem) throw ApiError.notFound('Viagem não encontrada.');
  if (viagem.truck.empresa_id !== empresaId) throw ApiError.notFound('Viagem não encontrada.');
  return viagem;
}

async function listByTruck(truckId, empresaId, { status, limit = 100 } = {}) {
  await assertTruckBelongsToEmpresa(truckId, empresaId);
  const where = { truck_id: truckId, deleted_at: null };
  if (status) where.status_viagem = status;
  return prisma.truckViagem.findMany({
    where,
    orderBy: [
      { status_viagem: 'asc' },  // EM_CURSO/PLANEJADA antes de FINALIZADA/CANCELADA
      { created_at: 'desc' },
    ],
    take: Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500),
  });
}

async function create(truckId, empresaId, req, body) {
  await assertTruckBelongsToEmpresa(truckId, empresaId);

  const data = { truck_id: truckId, created_by_id: req.user.id, status_viagem: 'PLANEJADA' };
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      data[field] = normalizeField(field, body[field]);
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const v = await tx.truckViagem.create({ data });
    await activity.record({
      tx, truckId, viagemId: v.id, tipo: 'VIAGEM_CREATED',
      payload: { snapshot: v },
      author: req.user,
    });
    return v;
  });

  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'CREATE', entityId: truckId, before: null, after: { viagem: created } });
  return created;
}

async function update(viagemId, empresaId, req, body) {
  const before = await getById(viagemId, empresaId);

  const patch = {};
  const edits = []; // [{ field, before, after }]
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      const newVal = normalizeField(field, body[field]);
      const oldVal = before[field];
      // Comparação por toString (cobre Date, Decimal, null, string)
      const same = (oldVal === null && newVal === null) ||
                   (oldVal != null && newVal != null && String(oldVal) === String(newVal));
      if (!same) {
        patch[field] = newVal;
        edits.push({ field, before: oldVal, after: newVal });
      }
    }
  }

  if (edits.length === 0) return before;

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.truckViagem.update({
      where: { id: viagemId },
      data: patch,
    });
    for (const edit of edits) {
      await activity.record({
        tx, truckId: before.truck_id, viagemId,
        tipo: 'VIAGEM_FIELD_EDITED',
        payload: edit,
        author: req.user,
      });
    }
    return updated;
  });

  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: before.truck_id, before: { viagem: before }, after: { viagem: after } });
  return after;
}

async function start(viagemId, empresaId, req) {
  const v = await getById(viagemId, empresaId);
  if (v.status_viagem !== 'PLANEJADA') {
    throw ApiError.badRequest('Só viagens PLANEJADAS podem ser iniciadas.');
  }
  // Garante que não há outra EM_CURSO no truck
  const existing = await prisma.truckViagem.findFirst({
    where: { truck_id: v.truck_id, status_viagem: 'EM_CURSO', deleted_at: null },
  });
  if (existing) {
    throw ApiError.conflict('Este caminhão já tem uma viagem em curso.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.truckViagem.update({
      where: { id: viagemId },
      data: { status_viagem: 'EM_CURSO' },
    });
    await activity.record({
      tx, truckId: v.truck_id, viagemId,
      tipo: 'VIAGEM_STARTED',
      payload: {},
      author: req.user,
    });
    return u;
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: v.truck_id, before: { viagem: v }, after: { viagem: updated } });
  return updated;
}

async function finalize(viagemId, empresaId, req, body) {
  const v = await getById(viagemId, empresaId);
  if (v.status_viagem === 'FINALIZADA' || v.status_viagem === 'CANCELADA') {
    throw ApiError.badRequest('Viagem já encerrada.');
  }

  const dataEntrega = body?.data_entrega_realizada
    ? new Date(body.data_entrega_realizada)
    : new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.truckViagem.update({
      where: { id: viagemId },
      data: {
        status_viagem: 'FINALIZADA',
        finalized_at: new Date(),
        data_entrega_realizada: dataEntrega,
      },
    });
    await activity.record({
      tx, truckId: v.truck_id, viagemId,
      tipo: 'VIAGEM_FINALIZED',
      payload: { data_entrega_realizada: dataEntrega },
      author: req.user,
    });
    return u;
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: v.truck_id, before: { viagem: v }, after: { viagem: updated } });
  return updated;
}

async function cancel(viagemId, empresaId, req, body) {
  const v = await getById(viagemId, empresaId);
  if (v.status_viagem === 'FINALIZADA' || v.status_viagem === 'CANCELADA') {
    throw ApiError.badRequest('Viagem já encerrada.');
  }
  const motivo = (body?.motivo || '').trim() || null;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.truckViagem.update({
      where: { id: viagemId },
      data: {
        status_viagem: 'CANCELADA',
        cancelled_at: new Date(),
        cancel_motivo: motivo,
      },
    });
    await activity.record({
      tx, truckId: v.truck_id, viagemId,
      tipo: 'VIAGEM_CANCELLED',
      payload: { motivo },
      author: req.user,
    });
    return u;
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: v.truck_id, before: { viagem: v }, after: { viagem: updated } });
  return updated;
}

async function remove(viagemId, empresaId, req) {
  const v = await getById(viagemId, empresaId);
  if (v.status_viagem !== 'PLANEJADA') {
    throw ApiError.badRequest('Só viagens PLANEJADAS podem ser apagadas. Use cancelar.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.truckViagem.update({
      where: { id: viagemId },
      data: { deleted_at: new Date() },
    });
    await activity.record({
      tx, truckId: v.truck_id, viagemId,
      tipo: 'VIAGEM_DELETED',
      payload: { snapshot: v },
      author: req.user,
    });
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'DELETE', entityId: v.truck_id, before: { viagem: v }, after: null });
  return { ok: true };
}

module.exports = {
  listByTruck, getById, create, update,
  start, finalize, cancel, remove,
  VALID_STATUS, EDITABLE_FIELDS,
};
