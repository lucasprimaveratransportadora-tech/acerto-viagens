const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

// audit_logs.empresa_id é NOT NULL no schema. Se req.user.empresa_id for
// undefined (SUPER_ADMIN detached, edge cases), o insert no audit falha
// silenciosamente — pra empresas justamente onde mais precisamos do log.
// Fallback pro id da empresa afetada cobre esse caso.
function auditEmpresaId(req, empresa) {
  return req.user?.empresa_id || empresa?.id;
}

// Whitelist explícito: validator só checa shape, não strip campos extras.
// Sem isso, PATCH /empresas/:id { ativo: false } passava pelo Prisma e
// soft-deletava sem usar o endpoint dedicado de remove (que tem audit
// com action: DELETE). Resultado: registro fica inativo com action: UPDATE.
const EMPRESA_PATCH_FIELDS = ['nome', 'cnpj', 'logo_url'];

function pick(src, fields) {
  const out = {};
  for (const f of fields) {
    if (src && Object.prototype.hasOwnProperty.call(src, f)) out[f] = src[f];
  }
  return out;
}

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
  await audit.log({
    req, empresaId: auditEmpresaId(req, empresa), entity: 'EMPRESA',
    action: 'CREATE', entityId: empresa.id, before: null, after: empresa,
  });
  return empresa;
}

async function update(id, req, data) {
  const before = await prisma.empresa.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Empresa não encontrada.');

  const patch = pick(data, EMPRESA_PATCH_FIELDS);

  if (patch.cnpj && patch.cnpj !== before.cnpj) {
    const existing = await prisma.empresa.findUnique({ where: { cnpj: patch.cnpj } });
    if (existing) throw ApiError.conflict('CNPJ já cadastrado.');
  }

  const after = await prisma.empresa.update({
    where: { id },
    data: patch,
  });
  await audit.log({
    req, empresaId: auditEmpresaId(req, after), entity: 'EMPRESA',
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
    req, empresaId: auditEmpresaId(req, after), entity: 'EMPRESA',
    action: 'DELETE', entityId: id, before, after,
  });
  return after;
}

module.exports = { list, getById, create, update, remove };
