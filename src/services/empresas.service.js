const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');
const { empresaBrandSelect, normalizeCoverPosition, validateCoverFile } = require('./empresa-brand');

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
const EMPRESA_PATCH_FIELDS = ['nome', 'cnpj', 'logo_url', 'cor_primaria'];

function pick(src, fields) {
  const out = {};
  for (const f of fields) {
    if (src && Object.prototype.hasOwnProperty.call(src, f)) out[f] = src[f];
  }
  return out;
}

async function list() {
  return prisma.empresa.findMany({
    orderBy: { nome: 'asc' },
    select: { ...empresaBrandSelect(), cnpj: true, ativo: true, created_at: true, _count: { select: { users: true, trucks: true } } },
  });
}

async function getById(id) {
  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa) throw ApiError.notFound('Empresa não encontrada.');
  return empresa;
}

async function create(req, { nome, cnpj, logo_url, cor_primaria, admin_nome, admin_email, admin_senha }) {
  if (cnpj) {
    const existing = await prisma.empresa.findUnique({ where: { cnpj } });
    if (existing) throw ApiError.conflict('CNPJ já cadastrado.');
  }

  const emailExists = await prisma.user.findUnique({ where: { email: admin_email } });
  if (emailExists) throw ApiError.conflict('Email do administrador já cadastrado.');
  const bcrypt = require('bcrypt');
  const config = require('../config');
  const senha_hash = await bcrypt.hash(admin_senha, config.bcryptRounds);
  const empresa = await prisma.$transaction(async (tx) => tx.empresa.create({
    data: {
      nome, cnpj: cnpj || null, logo_url: logo_url || null, cor_primaria: cor_primaria || '#E30613',
      users: { create: { nome: admin_nome, email: admin_email, senha_hash, role: 'ADMIN' } },
    },
    include: { users: { select: { id: true, nome: true, email: true, role: true } } },
  }));
  await audit.log({
    req, empresaId: auditEmpresaId(req, empresa), entity: 'EMPRESA',
    action: 'CREATE', entityId: empresa.id, before: null, after: empresa,
  });
  return empresa;
}

async function saveLogo(id, req, file) {
  if (!file) throw ApiError.badRequest('Arquivo de logo obrigatório.');
  const before = await prisma.empresa.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Empresa não encontrada.');
  const after = await prisma.empresa.update({ where: { id }, data: {
    logo_dados: file.buffer, logo_mime: file.mimetype, logo_tamanho: file.size, logo_url: null,
  }});
  await audit.log({ req, empresaId: id, entity: 'EMPRESA', action: 'UPDATE', entityId: id, before: { logo_mime: before.logo_mime }, after: { logo_mime: after.logo_mime, logo_tamanho: after.logo_tamanho } });
  return { logo_url: `/api/empresas/${id}/logo`, logo_mime: after.logo_mime, logo_tamanho: after.logo_tamanho };
}

async function getLogo(id) {
  const e = await prisma.empresa.findUnique({ where: { id }, select: { logo_dados: true, logo_mime: true } });
  if (!e?.logo_dados) throw ApiError.notFound('Logo não encontrada.');
  return e;
}

async function saveCapa(id, req, file, position) {
  const validation = validateCoverFile(file);
  if (!validation.ok) throw ApiError.badRequest(validation.error);
  const before = await prisma.empresa.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Empresa não encontrada.');
  const capa_posicao = normalizeCoverPosition(position);
  const after = await prisma.empresa.update({ where: { id }, data: {
    capa_dados: file.buffer, capa_mime: file.mimetype, capa_tamanho: file.size, capa_posicao,
  }});
  await audit.log({
    req, empresaId: id, entity: 'EMPRESA', action: 'UPDATE', entityId: id,
    before: { capa_mime: before.capa_mime, capa_tamanho: before.capa_tamanho, capa_posicao: before.capa_posicao },
    after: { capa_mime: after.capa_mime, capa_tamanho: after.capa_tamanho, capa_posicao: after.capa_posicao },
  });
  return { capa_url: `/api/empresas/${id}/capa`, capa_mime: after.capa_mime, capa_tamanho: after.capa_tamanho, capa_posicao: after.capa_posicao };
}

async function getCapa(id) {
  const e = await prisma.empresa.findUnique({ where: { id }, select: { capa_dados: true, capa_mime: true } });
  if (!e?.capa_dados) throw ApiError.notFound('Capa não encontrada.');
  return e;
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

async function setStatus(id, req, ativo) {
  const before = await prisma.empresa.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Empresa não encontrada.');
  const after = await prisma.empresa.update({ where: { id }, data: { ativo } });
  await audit.log({ req, empresaId: id, entity: 'EMPRESA', action: 'UPDATE', entityId: id, before: { ativo: before.ativo }, after: { ativo } });
  return after;
}

module.exports = { list, getById, create, update, remove, saveLogo, getLogo, saveCapa, getCapa, setStatus };
