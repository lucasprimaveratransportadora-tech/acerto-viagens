const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

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

async function create(req, { nome, cnpj, logo_url }) {
  if (cnpj) {
    const existing = await prisma.empresa.findUnique({ where: { cnpj } });
    if (existing) throw ApiError.conflict('CNPJ já cadastrado.');
  }

  const empresa = await prisma.empresa.create({
    data: { nome, cnpj, logo_url },
  });
  // Audit fica scope na empresa do ADMIN que disparou — não na empresa criada
  // (que pode ter id diferente). Os outros services seguem o mesmo padrão.
  await audit.log({
    req, empresaId: req.user?.empresa_id, entity: 'EMPRESA',
    action: 'CREATE', entityId: empresa.id, before: null, after: empresa,
  });
  return empresa;
}

async function update(id, req, data) {
  const before = await prisma.empresa.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Empresa não encontrada.');

  if (data.cnpj && data.cnpj !== before.cnpj) {
    const existing = await prisma.empresa.findUnique({ where: { cnpj: data.cnpj } });
    if (existing) throw ApiError.conflict('CNPJ já cadastrado.');
  }

  const after = await prisma.empresa.update({
    where: { id },
    data,
  });
  await audit.log({
    req, empresaId: req.user?.empresa_id, entity: 'EMPRESA',
    action: 'UPDATE', entityId: id, before, after,
  });
  return after;
}

async function remove(id, req) {
  const before = await prisma.empresa.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Empresa não encontrada.');

  const after = await prisma.empresa.update({
    where: { id },
    data: { ativo: false },
  });
  await audit.log({
    req, empresaId: req.user?.empresa_id, entity: 'EMPRESA',
    action: 'DELETE', entityId: id, before, after,
  });
  return after;
}

module.exports = { list, getById, create, update, remove };
