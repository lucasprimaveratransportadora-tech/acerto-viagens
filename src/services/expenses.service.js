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

async function upsertAll(tripId, empresaId, expenses) {
  await verifyTripOwnership(tripId, empresaId);

  const operations = Object.entries(expenses).map(([categoria, valor]) =>
    prisma.expense.upsert({
      where: { trip_id_categoria: { trip_id: tripId, categoria } },
      update: { valor },
      create: { trip_id: tripId, categoria, valor },
    })
  );

  return prisma.$transaction(operations);
}

async function updateOne(tripId, empresaId, categoria, valor) {
  await verifyTripOwnership(tripId, empresaId);

  return prisma.expense.upsert({
    where: { trip_id_categoria: { trip_id: tripId, categoria } },
    update: { valor },
    create: { trip_id: tripId, categoria, valor },
  });
}

async function getByTrip(tripId, empresaId) {
  await verifyTripOwnership(tripId, empresaId);

  return prisma.expense.findMany({
    where: { trip_id: tripId },
    orderBy: { categoria: 'asc' },
  });
}

module.exports = { upsertAll, updateOne, getByTrip };
