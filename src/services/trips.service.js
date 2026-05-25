const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

// Campos do anexo de viagem que NÃO podem voltar em listagens (Bytes pesado)
const TRIP_ANEXO_LIST_SELECT = {
  id: true, trip_id: true, tipo: true, nome: true, url: true,
  mime_type: true, tamanho: true, descricao: true, created_by_id: true,
  created_at: true,
};

// Whitelist explícito do que o cliente pode editar via PATCH/POST.
// Antes, `data` (= req.body) ia direto pro Prisma — abrindo brecha de
// mass-assignment (cliente podia mandar truck_id e mover viagem entre tenants).
const TRIP_PATCH_FIELDS = [
  'data_inicio', 'data_fim', 'origem', 'destino', 'carga', 'motorista',
  'km_total', 'status', 'adiantamento', 'observacoes',
  'km_inicial', 'km_final',
];
const TRIP_CREATE_FIELDS = [...TRIP_PATCH_FIELDS, 'imported_batch'];

function pick(src, fields) {
  const out = {};
  for (const f of fields) {
    if (src && Object.prototype.hasOwnProperty.call(src, f)) out[f] = src[f];
  }
  return out;
}

function normalizeTripFields(patch) {
  if (patch.data_inicio) patch.data_inicio = new Date(patch.data_inicio);
  if (patch.data_fim) patch.data_fim = new Date(patch.data_fim);
  // string vazia em motorista vira null (consistente com create() antigo)
  if (patch.motorista !== undefined) patch.motorista = patch.motorista || null;
  return patch;
}

// CTE/Fuel aninhados em payload de trip — também com whitelist explícito.
function normalizeCte(c) {
  return {
    data: c?.data ? new Date(c.data) : null,
    numero: c?.numero ?? null,
    origem: c?.origem ?? null,
    destino: c?.destino ?? null,
    valor: c?.valor ?? 0,
  };
}

function normalizeFuel(f) {
  return {
    data: f?.data ? new Date(f.data) : null,
    litros: f?.litros ?? 0,
    preco_litro: f?.preco_litro ?? 0,
    posto_cnpj: f?.posto_cnpj ?? null,
    nota_fiscal: f?.nota_fiscal ?? null,
    km: f?.km == null || f.km === '' ? null : Math.round(Number(f.km)),
    valor_total: f?.valor_total ?? 0,
  };
}

async function verifyTruckOwnership(truckId, empresaId) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');
  return truck;
}

async function verifyTripOwnership(tripId, empresaId) {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      deleted_at: null,
      truck: { empresa_id: empresaId, deleted_at: null },
    },
  });
  if (!trip) throw ApiError.notFound('Viagem não encontrada.');
  return trip;
}

async function listByTruck(truckId, empresaId) {
  await verifyTruckOwnership(truckId, empresaId);

  return prisma.trip.findMany({
    where: { truck_id: truckId, deleted_at: null },
    include: {
      ctes: true,
      fuels: true,
      expenses: true,
      _count: { select: { trip_anexos: { where: { deleted_at: null } } } },
    },
    orderBy: { data_inicio: 'desc' },
  });
}

async function getById(id, empresaId) {
  const trip = await prisma.trip.findFirst({
    where: {
      id,
      deleted_at: null,
      truck: { empresa_id: empresaId, deleted_at: null },
    },
    include: {
      ctes: true,
      fuels: true,
      expenses: true,
      truck: { select: { id: true, placa: true, modelo: true, motorista: true } },
      trip_anexos: {
        where: { deleted_at: null },
        orderBy: { created_at: 'desc' },
        select: TRIP_ANEXO_LIST_SELECT,
      },
    },
  });
  if (!trip) throw ApiError.notFound('Viagem não encontrada.');
  return trip;
}

async function create(truckId, empresaId, req, data) {
  await verifyTruckOwnership(truckId, empresaId);

  const tripData = normalizeTripFields(pick(data, TRIP_CREATE_FIELDS));
  const ctes = Array.isArray(data?.ctes) ? data.ctes.map(normalizeCte) : null;
  const fuels = Array.isArray(data?.fuels) ? data.fuels.map(normalizeFuel) : null;

  // Atomicidade: ou tudo entra, ou nada. Antes o front fazia N+M+1
  // requests separados — qualquer falha no meio deixava viagem
  // parcialmente preenchida.
  const trip = await prisma.$transaction(async (tx) => {
    const created = await tx.trip.create({
      data: { ...tripData, truck_id: truckId },
    });
    if (ctes && ctes.length > 0) {
      await tx.cte.createMany({
        data: ctes.map((c) => ({ ...c, trip_id: created.id })),
      });
    }
    if (fuels && fuels.length > 0) {
      await tx.fuel.createMany({
        data: fuels.map((f) => ({ ...f, trip_id: created.id })),
      });
    }
    return tx.trip.findUnique({
      where: { id: created.id },
      include: { ctes: true, fuels: true, expenses: true },
    });
  });

  await audit.log({ req, empresaId, entity: 'TRIP', action: 'CREATE', entityId: trip.id, before: null, after: trip });
  return trip;
}

async function update(id, empresaId, req, data) {
  await verifyTripOwnership(id, empresaId);

  const tripPatch = normalizeTripFields(pick(data, TRIP_PATCH_FIELDS));
  // Semântica: se a chave `ctes`/`fuels` vier no body, é a lista COMPLETA
  // nova (replace all). Se não vier, não toca nas linhas existentes.
  const ctes = Array.isArray(data?.ctes) ? data.ctes.map(normalizeCte) : null;
  const fuels = Array.isArray(data?.fuels) ? data.fuels.map(normalizeFuel) : null;

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.trip.findUnique({
      where: { id },
      include: { ctes: true, fuels: true, expenses: true },
    });

    if (Object.keys(tripPatch).length > 0) {
      await tx.trip.update({ where: { id }, data: tripPatch });
    }

    if (ctes !== null) {
      await tx.cte.deleteMany({ where: { trip_id: id } });
      if (ctes.length > 0) {
        await tx.cte.createMany({
          data: ctes.map((c) => ({ ...c, trip_id: id })),
        });
      }
    }

    if (fuels !== null) {
      await tx.fuel.deleteMany({ where: { trip_id: id } });
      if (fuels.length > 0) {
        await tx.fuel.createMany({
          data: fuels.map((f) => ({ ...f, trip_id: id })),
        });
      }
    }

    const after = await tx.trip.findUnique({
      where: { id },
      include: { ctes: true, fuels: true, expenses: true },
    });
    return { before, after };
  });

  await audit.log({ req, empresaId, entity: 'TRIP', action: 'UPDATE', entityId: id, before: result.before, after: result.after });
  return result.after;
}

async function remove(id, empresaId, req) {
  await verifyTripOwnership(id, empresaId);

  const before = await prisma.trip.findUnique({ where: { id } });
  const after = await prisma.trip.update({
    where: { id },
    data: { deleted_at: new Date() },
  });
  await audit.log({ req, empresaId, entity: 'TRIP', action: 'DELETE', entityId: id, before, after });
  return after;
}

/* ============================================================
   ANEXOS DA VIAGEM — folha de acerto digitalizada, comprovantes.
   Mesmo padrão de TruckAnexo / FreteTerceiroAnexo.
   ============================================================ */

async function addAnexo(tripId, empresaId, req, data) {
  await verifyTripOwnership(tripId, empresaId);
  if (!data.url)  throw ApiError.badRequest('URL do anexo obrigatória.');
  if (!data.nome) throw ApiError.badRequest('Nome do anexo obrigatório.');
  const anexo = await prisma.tripAnexo.create({
    data: {
      trip_id:        tripId,
      tipo:           data.tipo || 'FOLHA_ACERTO',
      nome:           data.nome,
      url:            data.url,
      descricao:      data.descricao || null,
      created_by_id:  req.user.id,
    },
    select: TRIP_ANEXO_LIST_SELECT,
  });
  await audit.log({ req, empresaId, entity: 'TRIP_ANEXO', action: 'CREATE', entityId: anexo.id, before: null, after: anexo });
  return anexo;
}

async function addAnexoFile(tripId, empresaId, req, file, meta) {
  await verifyTripOwnership(tripId, empresaId);
  if (!file || !file.buffer) throw ApiError.badRequest('Arquivo obrigatório.');
  const nome = (meta?.nome && meta.nome.trim()) || file.originalname || 'anexo';
  const anexo = await prisma.tripAnexo.create({
    data: {
      trip_id:        tripId,
      tipo:           meta?.tipo || 'FOLHA_ACERTO',
      nome,
      url:            null,
      dados:          file.buffer,
      mime_type:      file.mimetype || 'application/octet-stream',
      tamanho:        file.size || file.buffer.length,
      descricao:      meta?.descricao || null,
      created_by_id:  req.user.id,
    },
    select: TRIP_ANEXO_LIST_SELECT,
  });
  await audit.log({ req, empresaId, entity: 'TRIP_ANEXO', action: 'CREATE', entityId: anexo.id, before: null, after: anexo });
  return anexo;
}

async function getAnexoFile(tripId, anexoId, empresaId) {
  await verifyTripOwnership(tripId, empresaId);
  const anexo = await prisma.tripAnexo.findFirst({
    where: { id: anexoId, trip_id: tripId, deleted_at: null },
  });
  if (!anexo) throw ApiError.notFound('Anexo não encontrado.');
  if (!anexo.dados) throw ApiError.notFound('Este anexo é um link externo, abra pela URL.');
  return anexo;
}

async function removeAnexo(tripId, anexoId, empresaId, req) {
  await verifyTripOwnership(tripId, empresaId);
  const anexo = await prisma.tripAnexo.findFirst({
    where: { id: anexoId, trip_id: tripId, deleted_at: null },
  });
  if (!anexo) throw ApiError.notFound('Anexo não encontrado.');
  await prisma.tripAnexo.update({
    where: { id: anexoId },
    data: { deleted_at: new Date() },
  });
  await audit.log({ req, empresaId, entity: 'TRIP_ANEXO', action: 'DELETE', entityId: anexoId, before: { anexo }, after: null });
  return { ok: true };
}

module.exports = {
  listByTruck, getById, create, update, remove,
  addAnexo, addAnexoFile, getAnexoFile, removeAnexo,
};
