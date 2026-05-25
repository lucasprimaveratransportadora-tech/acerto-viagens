const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

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

async function verifyCteOwnership(cteId, empresaId) {
  const cte = await prisma.cte.findFirst({
    where: {
      id: cteId,
      trip: {
        deleted_at: null,
        truck: { empresa_id: empresaId, deleted_at: null },
      },
    },
  });
  if (!cte) throw ApiError.notFound('CT-e não encontrado.');
  return cte;
}

async function create(tripId, empresaId, req, { data, numero, origem, destino, valor }) {
  await verifyTripOwnership(tripId, empresaId);

  const cte = await prisma.cte.create({
    data: {
      trip_id: tripId,
      data: data ? new Date(data) : null,
      numero,
      origem,
      destino,
      valor,
    },
  });
  await audit.log({ req, empresaId, entity: 'CTE', action: 'CREATE', entityId: cte.id, before: null, after: cte });
  return cte;
}

async function update(id, empresaId, req, data) {
  const before = await verifyCteOwnership(id, empresaId);

  const patch = pick(data, CTE_PATCH_FIELDS);
  if (patch.data) patch.data = new Date(patch.data);

  const after = await prisma.cte.update({
    where: { id },
    data: patch,
  });
  await audit.log({ req, empresaId, entity: 'CTE', action: 'UPDATE', entityId: id, before, after });
  return after;
}

async function remove(id, empresaId, req) {
  const before = await verifyCteOwnership(id, empresaId);

  const after = await prisma.cte.delete({
    where: { id },
  });
  await audit.log({ req, empresaId, entity: 'CTE', action: 'DELETE', entityId: id, before, after });
  return after;
}

module.exports = { create, update, remove };
