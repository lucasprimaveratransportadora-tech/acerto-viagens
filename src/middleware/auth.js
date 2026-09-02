const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const { resolveEffectiveUser } = require('../services/auth-context');

// Auth middleware: encaminha qualquer falha via next(err) pra que o
// errorHandler estruturado anexe requestId, codigo e log JSON consistentes
// com o resto da API. Antes respondia direto com res.status().json()
// — quebrava a correlacao por requestId que foi introduzida no Pacote 1.
async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Token não fornecido.');
    }

    const token = authHeader.split(' ')[1];
    // jwt.verify lanca JsonWebTokenError / TokenExpiredError — o
    // errorHandler.classify() ja mapeia esses dois pra 401 com codigo.
    const decoded = jwt.verify(token, config.jwt.secret);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true, empresa_id: true, nome: true, email: true, role: true, permissoes: true, ativo: true,
        empresa: { select: { id: true, nome: true, ativo: true, logo_url: true, logo_mime: true, cor_primaria: true, capa_mime: true, capa_tamanho: true, capa_posicao: true } },
      },
    });

    if (!user || !user.ativo) {
      throw ApiError.unauthorized('Usuário inativo ou não encontrado.');
    }

    const context = resolveEffectiveUser(user, decoded);
    if (context.impersonating) {
      const target = await prisma.empresa.findFirst({
        where: { id: context.user.empresa_id, ativo: true },
        select: { id: true, nome: true, ativo: true, logo_url: true, logo_mime: true, cor_primaria: true, capa_mime: true, capa_tamanho: true, capa_posicao: true },
      });
      if (!target) throw ApiError.unauthorized('Empresa impersonada inativa ou não encontrada.');
      context.user.empresa = target;
    }
    req.user = context.user;
    req.realUser = context.realUser;
    req.impersonating = context.impersonating;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = auth;
