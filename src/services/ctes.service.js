const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');
const { lockForLink, withLinkTransaction } = require('./fretesTerceiros.service');

// Só os dados necessários para identificar o frete; nunca usuários/baixas/anexos.
const FRETE_SELECT = {
  id: true, numero: true, trip_id: true, empresa_pagadora: true, data: true, motorista: true,
  veiculo: true, origem: true, destino: true, valor_total: true, status: true,
};
const CTE_INCLUDE = { frete_terceiro: { select: FRETE_SELECT } };

// Whitelist: trip_id NUNCA pode vir do cliente — senão move CT-e entre viagens
// (potencialmente cross-tenant via verifyCteOwnership da viagem antiga).
const CTE_PATCH_FIELDS = ['data', 'numero', 'origem', 'destino', 'valor'];

function pick(src, fields) {
  const out = {};
  for (const f of fields) {
    if (src && Object.prototype.hasOwnProperty.call(src, f)) out[f] = src[f];
  }
  return out;
}

function requireEmpresa(empresaId) {
  if (!empresaId) throw ApiError.unauthorized('Empresa não identificada.');
}

function cteAudit(cte) {
  // Converte Decimal/Date antes do sanitizador e exclui os dados pessoais do frete.
  return JSON.parse(JSON.stringify(pick(cte, ['id', 'trip_id', 'frete_terceiro_id', ...CTE_PATCH_FIELDS])));
}

async function verifyTripOwnership(tripId, empresaId, client = prisma) {
  requireEmpresa(empresaId);
  const trip = await client.trip.findFirst({
    where: {
      id: tripId,
      empresa_id: empresaId,
      deleted_at: null,
      truck: { empresa_id: empresaId, deleted_at: null },
    },
  });
  if (!trip) throw ApiError.notFound('Viagem não encontrada.');
  return trip;
}

async function verifyCteOwnership(cteId, empresaId, client = prisma) {
  requireEmpresa(empresaId);
  const cte = await client.cte.findFirst({
    where: {
      id: cteId,
      trip: {
        empresa_id: empresaId,
        deleted_at: null,
        truck: { empresa_id: empresaId, deleted_at: null },
      },
    },
    include: CTE_INCLUDE,
  });
  if (!cte) throw ApiError.notFound('CT-e não encontrado.');
  return cte;
}

async function listFretesDisponiveis(empresaId, q = '') {
  requireEmpresa(empresaId);
  if (typeof q !== 'string' || q.length > 200) throw ApiError.badRequest('Busca inválida.');
  const where = {
    empresa_id: empresaId, deleted_at: null, trip_id: null,
    status: { not: 'CANCELADO' }, cte: { is: null },
  };
  const search = q.trim();
  if (search) {
    const contains = { contains: search, mode: 'insensitive' };
    where.OR = ['numero', 'empresa_pagadora', 'motorista', 'veiculo', 'origem', 'destino', 'observacoes']
      .map(field => ({ [field]: contains }));
    // Mantém também a busca textual dos anexos legados, além do número estruturado.
    where.OR.push({ anexos: { some: {
      tipo: 'CTE', deleted_at: null, OR: [{ nome: contains }, { descricao: contains }],
    } } });
  }
  return prisma.freteTerceiro.findMany({
    where, select: FRETE_SELECT, orderBy: [{ data: 'desc' }, { id: 'asc' }], take: 100,
  });
}

async function listByTrip(tripId, empresaId) {
  await verifyTripOwnership(tripId, empresaId);
  return prisma.cte.findMany({
    where: { trip_id: tripId, trip: { empresa_id: empresaId } },
    include: CTE_INCLUDE, orderBy: [{ data: 'asc' }, { created_at: 'asc' }],
  });
}

async function create(tripId, empresaId, req, { data, numero, origem, destino, valor, frete_terceiro_id }) {
  requireEmpresa(empresaId);
  const cte = await withLinkTransaction(async tx => {
    await verifyTripOwnership(tripId, empresaId, tx);
    if (frete_terceiro_id != null) {
      const frete = await lockForLink(tx, frete_terceiro_id, empresaId);
      if (frete.trip_id || frete.cte || frete.status === 'CANCELADO') {
        throw ApiError.conflict('Frete indisponível para vínculo.');
      }
      await tx.freteTerceiro.update({
        where: { id: frete.id, empresa_id: empresaId }, data: { trip_id: tripId },
      });
    }
    return tx.cte.create({
      data: {
        trip_id: tripId, frete_terceiro_id: frete_terceiro_id ?? null,
        data: data ? new Date(data) : null, numero, origem, destino, valor,
      },
      include: CTE_INCLUDE,
    });
  });
  await audit.log({ req, empresaId, entity: 'CTE', action: 'CREATE', entityId: cte.id, before: null, after: cteAudit(cte) });
  if (cte.frete_terceiro_id) {
    await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: cte.frete_terceiro_id,
      before: { trip_id: null, cte_id: null }, after: { trip_id: tripId, cte_id: cte.id } });
  }
  return cte;
}

async function update(id, empresaId, req, data) {
  const patch = pick(data, CTE_PATCH_FIELDS);
  if (patch.data) patch.data = new Date(patch.data);

  const { before, after } = await withLinkTransaction(async tx => {
    let before = await verifyCteOwnership(id, empresaId, tx);
    if (before.frete_terceiro_id) {
      await lockForLink(tx, before.frete_terceiro_id, empresaId);
      before = await verifyCteOwnership(id, empresaId, tx);
    }
    const after = await tx.cte.update({
      where: { id, trip: { empresa_id: empresaId } }, data: patch, include: CTE_INCLUDE,
    });
    return { before, after };
  });
  await audit.log({ req, empresaId, entity: 'CTE', action: 'UPDATE', entityId: id, before: cteAudit(before), after: cteAudit(after) });
  return after;
}

async function remove(id, empresaId, req) {
  const { before, after } = await withLinkTransaction(async tx => {
    let before = await verifyCteOwnership(id, empresaId, tx);
    if (before.frete_terceiro_id) {
      await lockForLink(tx, before.frete_terceiro_id, empresaId);
      // Releitura depois do lock: um unlink concorrente pode ter acabado de liberar o frete.
      before = await verifyCteOwnership(id, empresaId, tx);
    }
    const after = await tx.cte.delete({ where: { id, trip: { empresa_id: empresaId } } });
    if (before.frete_terceiro_id) {
      await tx.freteTerceiro.updateMany({
        where: { id: before.frete_terceiro_id, empresa_id: empresaId, trip_id: before.trip_id },
        data: { trip_id: null },
      });
    }
    return { before, after };
  });
  await audit.log({ req, empresaId, entity: 'CTE', action: 'DELETE', entityId: id, before: cteAudit(before), after: null });
  if (before.frete_terceiro_id) {
    await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: before.frete_terceiro_id,
      before: { trip_id: before.trip_id, cte_id: id }, after: { trip_id: null, cte_id: null } });
  }
  return after;
}

module.exports = { CTE_INCLUDE, listFretesDisponiveis, listByTrip, create, update, remove };
