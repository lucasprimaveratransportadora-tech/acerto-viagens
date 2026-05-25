const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

// Whitelist: trip_id NUNCA pode vir do cliente — senão move abastecimento
// entre viagens (potencialmente cross-tenant).
const FUEL_PATCH_FIELDS = [
  'data', 'litros', 'preco_litro', 'posto_cnpj', 'nota_fiscal', 'km', 'valor_total',
];

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

async function verifyFuelOwnership(fuelId, empresaId) {
  const fuel = await prisma.fuel.findFirst({
    where: {
      id: fuelId,
      trip: {
        deleted_at: null,
        truck: { empresa_id: empresaId, deleted_at: null },
      },
    },
  });
  if (!fuel) throw ApiError.notFound('Abastecimento não encontrado.');
  return fuel;
}

async function create(tripId, empresaId, req, { data, litros, preco_litro, posto_cnpj, nota_fiscal, km, valor_total }) {
  await verifyTripOwnership(tripId, empresaId);

  const fuel = await prisma.fuel.create({
    data: {
      trip_id: tripId,
      data: data ? new Date(data) : null,
      litros,
      preco_litro,
      posto_cnpj,
      nota_fiscal,
      km,
      valor_total,
    },
  });
  await audit.log({ req, empresaId, entity: 'FUEL', action: 'CREATE', entityId: fuel.id, before: null, after: fuel });
  return fuel;
}

async function update(id, empresaId, req, data) {
  const before = await verifyFuelOwnership(id, empresaId);

  const patch = pick(data, FUEL_PATCH_FIELDS);
  if (patch.data) patch.data = new Date(patch.data);

  const after = await prisma.fuel.update({
    where: { id },
    data: patch,
  });
  await audit.log({ req, empresaId, entity: 'FUEL', action: 'UPDATE', entityId: id, before, after });
  return after;
}

async function remove(id, empresaId, req) {
  const before = await verifyFuelOwnership(id, empresaId);

  const after = await prisma.fuel.delete({
    where: { id },
  });
  await audit.log({ req, empresaId, entity: 'FUEL', action: 'DELETE', entityId: id, before, after });
  return after;
}

module.exports = { create, update, remove };
