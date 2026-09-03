const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const { hashPassword } = require('./auth.service');
const audit = require('./audit.service');

const VALID_MODULES = ['frota', 'frete-terceiro', 'veiculos', 'rentabilidade', 'controle-viagens'];
const DEFAULT_PERMISSOES = ['frota', 'frete-terceiro', 'veiculos', 'rentabilidade', 'controle-viagens'];

const USER_SELECT = {
  id: true, nome: true, email: true, role: true,
  permissoes: true, ativo: true, created_at: true,
};

function sanitizePermissoes(arr) {
  if (!Array.isArray(arr)) return null;
  const unique = [...new Set(arr.filter(v => VALID_MODULES.includes(v)))];
  return unique;
}

function canAssignAdmin(req) {
  return req.realUser?.role === 'SUPER_ADMIN' || req.user?.role === 'SUPER_ADMIN';
}

function assertAdmin(req, action = 'gerenciar usuários') {
  if (req.user?.role !== 'ADMIN') {
    throw ApiError.forbidden(`Apenas ADMIN pode ${action}.`);
  }
}

function getEmpresaId(req) {
  return req.user?.empresa_id;
}

async function list(req) {
  const empresaId = getEmpresaId(req);
  return prisma.user.findMany({
    where: { empresa_id: empresaId },
    select: USER_SELECT,
    orderBy: { nome: 'asc' },
  });
}

async function create(req, { nome, email, senha, role, permissoes }) {
  assertAdmin(req, 'criar usuários');
  const empresaId = getEmpresaId(req);
  const senha_hash = await hashPassword(senha);
  const perms = sanitizePermissoes(permissoes);
  const resolvedRole = role === 'ADMIN' && canAssignAdmin(req) ? 'ADMIN' : 'GESTOR';
  const user = await prisma.user.create({
    data: {
      nome,
      email,
      senha_hash,
      role: resolvedRole,
      permissoes: perms && perms.length ? perms : DEFAULT_PERMISSOES,
      empresa_id: empresaId,
    },
    select: USER_SELECT,
  });
  await audit.log({
    req, empresaId, entity: 'USER', action: 'CREATE',
    entityId: user.id,
    before: null,
    after: user,
  });
  return user;
}

async function update(id, req, { nome, role, ativo, permissoes }) {
  assertAdmin(req);
  const empresaId = getEmpresaId(req);
  if (req.user.id === id) {
    throw ApiError.forbidden('Você não pode alterar a própria conta por aqui.');
  }
  const before = await prisma.user.findFirst({
    where: { id, empresa_id: empresaId },
    select: USER_SELECT,
  });
  if (!before) throw ApiError.notFound('Usuário não encontrado.');

  const data = {};
  if (nome !== undefined) data.nome = nome;
  if (role !== undefined) data.role = role === 'ADMIN' && canAssignAdmin(req) ? 'ADMIN' : 'GESTOR';
  if (ativo !== undefined) data.ativo = ativo;
  if (permissoes !== undefined) {
    const perms = sanitizePermissoes(permissoes);
    if (!perms) throw ApiError.badRequest('Permissões devem ser um array.');
    data.permissoes = perms;
  }

  const after = await prisma.user.update({
    where: { id },
    data,
    select: USER_SELECT,
  });
  await audit.log({
    req, empresaId, entity: 'USER', action: 'UPDATE',
    entityId: id, before, after,
  });
  return after;
}

async function deactivate(id, req) {
  if (req.user.id === id) {
    throw ApiError.forbidden('Você não pode desativar a própria conta.');
  }
  return update(id, req, { ativo: false });
}

async function resetPassword(id, req, novaSenha) {
  assertAdmin(req);
  const empresaId = getEmpresaId(req);
  if (req.user.id === id) {
    throw ApiError.forbidden('Você não pode resetar a própria senha por aqui.');
  }
  const target = await prisma.user.findFirst({
    where: { id, empresa_id: empresaId },
    select: { id: true, nome: true, email: true },
  });
  if (!target) throw ApiError.notFound('Usuário não encontrado.');

  const senha_hash = await hashPassword(novaSenha);

  const sessions_revoked = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { senha_hash } });
    const revoked = await tx.refreshToken.deleteMany({ where: { user_id: id } });
    return revoked.count;
  });

  await audit.log({
    req, empresaId, entity: 'USER', action: 'UPDATE',
    entityId: id,
    before: target,
    after: { ...target, password_reset: true, sessions_revoked },
  });

  return { sessions_revoked };
}

async function revokeSessions(id, req) {
  assertAdmin(req);
  const empresaId = getEmpresaId(req);
  if (req.user.id === id) {
    throw ApiError.forbidden('Você não pode encerrar suas próprias sessões por aqui.');
  }
  const target = await prisma.user.findFirst({
    where: { id, empresa_id: empresaId },
    select: { id: true, nome: true, email: true },
  });
  if (!target) throw ApiError.notFound('Usuário não encontrado.');

  const { count } = await prisma.refreshToken.deleteMany({ where: { user_id: id } });

  await audit.log({
    req, empresaId, entity: 'USER', action: 'UPDATE',
    entityId: id,
    before: target,
    after: { ...target, sessions_revoked: count },
  });

  return { revoked: count };
}

module.exports = { list, create, update, deactivate, resetPassword, revokeSessions, VALID_MODULES };
