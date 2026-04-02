const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');

async function list() {
  return prisma.empresa.findMany({
    where: { ativo: true },
    orderBy: { nome: 'asc' },
  });
}

async function getById(id) {
  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa) throw ApiError.notFound('Empresa não encontrada.');
  return empresa;
}

async function create({ nome, cnpj, logo_url }) {
  if (cnpj) {
    const existing = await prisma.empresa.findUnique({ where: { cnpj } });
    if (existing) throw ApiError.conflict('CNPJ já cadastrado.');
  }

  return prisma.empresa.create({
    data: { nome, cnpj, logo_url },
  });
}

async function update(id, data) {
  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa) throw ApiError.notFound('Empresa não encontrada.');

  if (data.cnpj && data.cnpj !== empresa.cnpj) {
    const existing = await prisma.empresa.findUnique({ where: { cnpj: data.cnpj } });
    if (existing) throw ApiError.conflict('CNPJ já cadastrado.');
  }

  return prisma.empresa.update({
    where: { id },
    data,
  });
}

async function remove(id) {
  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa) throw ApiError.notFound('Empresa não encontrada.');

  return prisma.empresa.update({
    where: { id },
    data: { ativo: false },
  });
}

module.exports = { list, getById, create, update, remove };
