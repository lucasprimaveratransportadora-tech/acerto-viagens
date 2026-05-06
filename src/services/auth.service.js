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
    include: { empresa: { select: { id: true, nome: true, ativo: true } } },
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
      await prisma.refreshToken.delete({ where: { id: stored.id } });
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
  await prisma.refreshToken.delete({ where: { id: stored.id } });

  const accessToken = generateAccessToken(stored.user);
  const newRefreshToken = await generateRefreshToken(stored.user.id);

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

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, empresa_id: user.empresa_id, role: user.role, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
}

async function generateRefreshToken(userId) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + config.jwt.refreshExpiresMs);

  await prisma.refreshToken.create({
    data: { token, user_id: userId, expires_at: expiresAt },
  });

  // Cleanup: remove expired tokens for this user
  await prisma.refreshToken.deleteMany({
    where: { user_id: userId, expires_at: { lt: new Date() } },
  });

  return token;
}

async function hashPassword(senha) {
  return bcrypt.hash(senha, config.bcryptRounds);
}

module.exports = { login, refresh, logout, hashPassword };
