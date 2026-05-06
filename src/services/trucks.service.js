const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

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

async function create(empresaId, req, { placa, modelo, motorista }) {
  const existing = await prisma.truck.findUnique({ where: { placa } });
  if (existing && existing.deleted_at === null) {
    throw ApiError.conflict('Placa já cadastrada.');
  }

  const truck = await prisma.truck.create({
    data: { empresa_id: empresaId, placa, modelo, motorista },
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'CREATE', entityId: truck.id, before: null, after: truck });
  return truck;
}

async function update(id, empresaId, req, data) {
  const before = await prisma.truck.findFirst({
    where: { id, empresa_id: empresaId, deleted_at: null },
  });
  if (!before) throw ApiError.notFound('Caminhão não encontrado.');

  if (data.placa && data.placa !== before.placa) {
    const existing = await prisma.truck.findUnique({ where: { placa: data.placa } });
    if (existing && existing.deleted_at === null) {
      throw ApiError.conflict('Placa já cadastrada.');
    }
  }

  const after = await prisma.truck.update({
    where: { id },
    data,
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: id, before, after });
  return after;
}

async function remove(id, empresaId, req) {
  const before = await prisma.truck.findFirst({
    where: { id, empresa_id: empresaId, deleted_at: null },
  });
  if (!before) throw ApiError.notFound('Caminhão não encontrado.');

  const after = await prisma.truck.update({
    where: { id },
    data: { deleted_at: new Date() },
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'DELETE', entityId: id, before, after });
  return after;
}

module.exports = { list, getById, create, update, remove };
