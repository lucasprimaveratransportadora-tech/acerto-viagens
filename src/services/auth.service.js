const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/database');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const loginEvents = require('./loginEvents.service');

async function login(email, senha, reqMeta) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { empresa: { select: { id: true, nome: true, ativo: true, logo_url: true, logo_mime: true, logo_tamanho: true, cor_primaria: true, capa_mime: true, capa_tamanho: true, capa_posicao: true } } },
  });

  if (!user || !user.ativo) {
    // Bcrypt dummy work para igualar timing e evitar enumeracao de usuarios.
    // Usar hash() em vez de compare() porque nao temos hash valido fixo.
    try { await bcrypt.hash('dummy', config.bcryptRounds); } catch (_) { /* ignore */ }
    await loginEvents.log({
      req: reqMeta,
      action: 'LOGIN_FAILED',
      user: user || null,
      emailAttempt: email,
    });
    throw ApiError.unauthorized('Email ou senha inválidos.');
  }

  if (!user.empresa.ativo) {
    await loginEvents.log({
      req: reqMeta,
      action: 'LOGIN_FAILED',
      user,
      emailAttempt: email,
    });
    throw ApiError.unauthorized('Empresa inativa. Contate o administrador.');
  }

  const senhaValida = await bcrypt.compare(senha, user.senha_hash);
  if (!senhaValida) {
    await loginEvents.log({
      req: reqMeta,
      action: 'LOGIN_FAILED',
      user,
      emailAttempt: email,
    });
    throw ApiError.unauthorized('Email ou senha inválidos.');
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  await loginEvents.log({
    req: reqMeta,
    action: 'LOGIN_SUCCESS',
    user,
    emailAttempt: email,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      permissoes: user.permissoes || [],
      empresa: user.empresa,
    },
  };
}

async function refresh(refreshTokenValue, reqMeta) {
  if (!refreshTokenValue) {
    await loginEvents.log({
      req: reqMeta,
      action: 'REFRESH_FAILED',
      user: null,
      emailAttempt: 'unknown',
    });
    throw ApiError.unauthorized('Refresh token não fornecido.');
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshTokenValue },
    include: { user: { include: { empresa: { select: { id: true, nome: true, ativo: true } } } } },
  });

  if (!stored || stored.expires_at < new Date()) {
    if (stored) {
      // deleteMany pra ser idempotente: se outra request paralela já apagou
      // o token (race quando o usuário tem 2 abas dando refresh ao mesmo
      // tempo), .delete() throwa P2025; deleteMany retorna 0 e segue.
      await prisma.refreshToken.deleteMany({ where: { id: stored.id } });
    }
    await loginEvents.log({
      req: reqMeta,
      action: 'REFRESH_FAILED',
      user: stored?.user || null,
      emailAttempt: stored?.user?.email || 'unknown',
    });
    throw ApiError.unauthorized('Refresh token inválido ou expirado.');
  }

  if (!stored.user.ativo || !stored.user.empresa.ativo) {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    await loginEvents.log({
      req: reqMeta,
      action: 'REFRESH_FAILED',
      user: stored.user,
      emailAttempt: stored.user.email,
    });
    throw ApiError.unauthorized('Usuário ou empresa inativos.');
  }

  // Rotate: delete old, create new
  // deleteMany pra ser idempotente — se outra aba paralela ja rotacionou
  // o mesmo token, .delete() lanca P2025 (404). Com deleteMany e checagem
  // do count, detectamos o race-lost e devolvemos 401 (cliente deve usar
  // o token novo emitido pela primeira request).
  const deleted = await prisma.refreshToken.deleteMany({ where: { id: stored.id } });
  if (deleted.count === 0) {
    throw ApiError.unauthorized('Refresh token já rotacionado (race entre abas).');
  }

  if (stored.impersonated_empresa_id) {
    const target = await prisma.empresa.findFirst({
      where: { id: stored.impersonated_empresa_id, ativo: true }, select: { id: true },
    });
    if (!target || stored.user.role !== 'SUPER_ADMIN') {
      throw ApiError.unauthorized('Impersonação inválida ou empresa inativa.');
    }
  }

  const accessToken = generateAccessToken(stored.user, stored.impersonated_empresa_id);
  const newRefreshToken = await generateRefreshToken(stored.user.id, stored.impersonated_empresa_id);

  return { accessToken, refreshToken: newRefreshToken };
}

async function logout(refreshTokenValue, reqMeta) {
  if (refreshTokenValue) {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshTokenValue },
      include: { user: true },
    });
    await prisma.refreshToken.deleteMany({ where: { token: refreshTokenValue } });
    if (stored?.user && reqMeta) {
      await loginEvents.log({
        req: reqMeta,
        action: 'LOGOUT',
        user: stored.user,
        emailAttempt: stored.user.email,
      });
    }
  }
}

function generateAccessToken(user, impersonatedEmpresaId = null) {
  return jwt.sign(
    {
      id: user.id, empresa_id: user.empresa_id, role: user.role, email: user.email,
      ...(impersonatedEmpresaId ? { su_empresa: impersonatedEmpresaId } : {}),
    },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
}

async function generateRefreshToken(userId, impersonatedEmpresaId = null) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + config.jwt.refreshExpiresMs);

  await prisma.refreshToken.create({
    data: { token, user_id: userId, expires_at: expiresAt, impersonated_empresa_id: impersonatedEmpresaId },
  });

  // Cleanup: remove expired tokens for this user
  await prisma.refreshToken.deleteMany({
    where: { user_id: userId, expires_at: { lt: new Date() } },
  });

  return token;
}

async function switchImpersonation(userId, currentRefreshToken, empresaId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'SUPER_ADMIN') throw ApiError.forbidden('Apenas SUPER_ADMIN pode entrar em outra empresa.');
  const empresa = await prisma.empresa.findFirst({
    where: { id: empresaId, ativo: true },
    select: { id: true, nome: true, logo_url: true, cor_primaria: true, logo_mime: true, logo_tamanho: true, capa_mime: true, capa_tamanho: true, capa_posicao: true },
  });
  if (!empresa) throw ApiError.notFound('Empresa ativa não encontrada.');
  if (currentRefreshToken) await prisma.refreshToken.deleteMany({ where: { token: currentRefreshToken, user_id: userId } });
  const refreshToken = await generateRefreshToken(user.id, empresa.id);
  return { accessToken: generateAccessToken(user, empresa.id), refreshToken, empresa };
}

async function stopImpersonation(userId, currentRefreshToken) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'SUPER_ADMIN') throw ApiError.forbidden('Impersonação inválida.');
  if (currentRefreshToken) await prisma.refreshToken.deleteMany({ where: { token: currentRefreshToken, user_id: userId } });
  const refreshToken = await generateRefreshToken(user.id);
  return { accessToken: generateAccessToken(user), refreshToken };
}

async function hashPassword(senha) {
  return bcrypt.hash(senha, config.bcryptRounds);
}

async function changePassword(userId, senhaAtual, novaSenha) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, senha_hash: true, ativo: true },
  });
  if (!user || !user.ativo) {
    throw ApiError.unauthorized('Usuário inativo ou não encontrado.');
  }

  const senhaAtualConfere = await bcrypt.compare(senhaAtual, user.senha_hash);
  if (!senhaAtualConfere) {
    throw ApiError.unauthorized('Senha atual incorreta.');
  }

  const senha_hash = await hashPassword(novaSenha);
  const sessions_revoked = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { senha_hash } });
    const revoked = await tx.refreshToken.deleteMany({ where: { user_id: userId } });
    return revoked.count;
  });

  return { sessions_revoked };
}

module.exports = { login, refresh, logout, hashPassword, changePassword, switchImpersonation, stopImpersonation };
