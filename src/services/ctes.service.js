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

async function create(tripId, empresaId, { data, numero, origem, destino, valor }) {
  await verifyTripOwnership(tripId, empresaId);

  return prisma.cte.create({
    data: {
      trip_id: tripId,
      data,
      numero,
      origem,
      destino,
      valor,
    },
  });
}

async function update(id, empresaId, data) {
  await verifyCteOwnership(id, empresaId);

  return prisma.cte.update({
    where: { id },
    data,
  });
}

async function remove(id, empresaId) {
  await verifyCteOwnership(id, empresaId);

  return prisma.cte.delete({
    where: { id },
  });
}

module.exports = { create, update, remove };
