const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

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

async function upsertAll(tripId, empresaId, req, expenses) {
  await verifyTripOwnership(tripId, empresaId);

  const results = [];
  for (const [categoria, valor] of Object.entries(expenses)) {
    const before = await prisma.expense.findUnique({
      where: { trip_id_categoria: { trip_id: tripId, categoria } },
    });
    const after = await prisma.expense.upsert({
      where: { trip_id_categoria: { trip_id: tripId, categoria } },
      update: { valor },
      create: { trip_id: tripId, categoria, valor },
    });
    await audit.log({
      req, empresaId, entity: 'EXPENSE',
      action: before ? 'UPDATE' : 'CREATE',
      entityId: after.id,
      before, after,
    });
    results.push(after);
  }
  return results;
}

async function updateOne(tripId, empresaId, req, categoria, valor) {
  await verifyTripOwnership(tripId, empresaId);

  const before = await prisma.expense.findUnique({
    where: { trip_id_categoria: { trip_id: tripId, categoria } },
  });
  const after = await prisma.expense.upsert({
    where: { trip_id_categoria: { trip_id: tripId, categoria } },
    update: { valor },
    create: { trip_id: tripId, categoria, valor },
  });
  await audit.log({
    req, empresaId, entity: 'EXPENSE',
    action: before ? 'UPDATE' : 'CREATE',
    entityId: after.id,
    before, after,
  });
  return after;
}

async function getByTrip(tripId, empresaId) {
  await verifyTripOwnership(tripId, empresaId);

  return prisma.expense.findMany({
    where: { trip_id: tripId },
    orderBy: { categoria: 'asc' },
  });
}

module.exports = { upsertAll, updateOne, getByTrip };
