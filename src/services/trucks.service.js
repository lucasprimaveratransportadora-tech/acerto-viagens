const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');

async function list(empresaId) {
  return prisma.truck.findMany({
    where: { empresa_id: empresaId, deleted_at: null },
    orderBy: { placa: 'asc' },
  });
}

async function getById(id, empresaId) {
  const truck = await prisma.truck.findFirst({
    where: { id, empresa_id: empresaId, deleted_at: null },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');
  return truck;
}

async function create(empresaId, { placa, modelo, motorista }) {
  const existing = await prisma.truck.findUnique({ where: { placa } });
  if (existing && existing.deleted_at === null) {
    throw ApiError.conflict('Placa já cadastrada.');
  }

  return prisma.truck.create({
    data: { empresa_id: empresaId, placa, modelo, motorista },
  });
}

async function update(id, empresaId, data) {
  const truck = await prisma.truck.findFirst({
    where: { id, empresa_id: empresaId, deleted_at: null },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  if (data.placa && data.placa !== truck.placa) {
    const existing = await prisma.truck.findUnique({ where: { placa: data.placa } });
    if (existing && existing.deleted_at === null) {
      throw ApiError.conflict('Placa já cadastrada.');
    }
  }

  return prisma.truck.update({
    where: { id },
    data,
  });
}

async function remove(id, empresaId) {
  const truck = await prisma.truck.findFirst({
    where: { id, empresa_id: empresaId, deleted_at: null },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  return prisma.truck.update({
    where: { id },
    data: { deleted_at: new Date() },
  });
}

module.exports = { list, getById, create, update, remove };
