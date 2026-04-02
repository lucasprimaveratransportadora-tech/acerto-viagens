const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');

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
    },
  });
  if (!trip) throw ApiError.notFound('Viagem não encontrada.');
  return trip;
}

async function create(truckId, empresaId, data) {
  await verifyTruckOwnership(truckId, empresaId);

  return prisma.trip.create({
    data: {
      truck_id: truckId,
      data_inicio: data.data_inicio,
      data_fim: data.data_fim,
      origem: data.origem,
      destino: data.destino,
      carga: data.carga,
      km_total: data.km_total,
      status: data.status,
      adiantamento: data.adiantamento,
      observacoes: data.observacoes,
      km_inicial: data.km_inicial,
      km_final: data.km_final,
    },
    include: {
      ctes: true,
      fuels: true,
      expenses: true,
    },
  });
}

async function update(id, empresaId, data) {
  await verifyTripOwnership(id, empresaId);

  return prisma.trip.update({
    where: { id },
    data,
    include: {
      ctes: true,
      fuels: true,
      expenses: true,
    },
  });
}

async function remove(id, empresaId) {
  await verifyTripOwnership(id, empresaId);

  return prisma.trip.update({
    where: { id },
    data: { deleted_at: new Date() },
  });
}

module.exports = { listByTruck, getById, create, update, remove };
