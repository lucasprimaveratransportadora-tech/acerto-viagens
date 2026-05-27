const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');

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
      select: { id: true, empresa_id: true, nome: true, email: true, role: true, permissoes: true, ativo: true },
    });

    if (!user || !user.ativo) {
      throw ApiError.unauthorized('Usuário inativo ou não encontrado.');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = auth;
