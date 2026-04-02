const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');

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

async function create(tripId, empresaId, { data, litros, preco_litro, posto_cnpj, nota_fiscal, km, valor_total }) {
  await verifyTripOwnership(tripId, empresaId);

  return prisma.fuel.create({
    data: {
      trip_id: tripId,
      data,
      litros,
      preco_litro,
      posto_cnpj,
      nota_fiscal,
      km,
      valor_total,
    },
  });
}

async function update(id, empresaId, data) {
  await verifyFuelOwnership(id, empresaId);

  return prisma.fuel.update({
    where: { id },
    data,
  });
}

async function remove(id, empresaId) {
  await verifyFuelOwnership(id, empresaId);

  return prisma.fuel.delete({
    where: { id },
  });
}

module.exports = { create, update, remove };
