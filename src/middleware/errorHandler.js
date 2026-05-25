const multer = require('multer');
const config = require('../config');

// Antes: tudo que não fosse P2002/P2025 virava 500 opaco. Agora mapeamos
// erros conhecidos (Multer, Prisma, JWT, JSON malformado) pro status
// correto, anexamos um requestId pra correlação e logamos JSON estruturado.

function classify(err) {
  if (err.statusCode) {
    return { status: err.statusCode, message: err.message };
  }

  // Prisma
  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] || 'campo';
    return { status: 409, code: 'UNIQUE_CONSTRAINT', message: `Já existe um registro com este ${field}.` };
  }
  if (err.code === 'P2025') {
    return { status: 404, code: 'NOT_FOUND', message: 'Registro não encontrado.' };
  }
  if (err.code === 'P2003') {
    return { status: 400, code: 'FK_VIOLATION', message: 'Referência inválida (registro relacionado não existe).' };
  }
  if (err.code === 'P2014') {
    return { status: 400, code: 'RELATION_VIOLATION', message: 'Operação viola relação obrigatória entre registros.' };
  }
  if (err.code === 'P2023') {
    return { status: 400, code: 'INVALID_ID', message: 'Identificador inválido.' };
  }

  // Multer
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return { status: 413, code: 'FILE_TOO_LARGE', message: 'Arquivo grande demais.' };
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return { status: 400, code: 'UNEXPECTED_UPLOAD', message: 'Campo de upload inesperado.' };
    }
    return { status: 400, code: 'UPLOAD_ERROR', message: `Erro no upload: ${err.field || err.code}.` };
  }

  // JWT
  if (err.name === 'JsonWebTokenError') {
    return { status: 401, code: 'INVALID_TOKEN', message: 'Token inválido.' };
  }
  if (err.name === 'TokenExpiredError') {
    return { status: 401, code: 'TOKEN_EXPIRED', message: 'Token expirado.' };
  }

  // body-parser JSON quebrado
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400 && 'body' in err)) {
    return { status: 400, code: 'BAD_JSON', message: 'JSON inválido no corpo da requisição.' };
  }

  return { status: 500, code: 'INTERNAL', message: 'Erro interno do servidor.' };
}

function errorHandler(err, req, res, _next) {
  const { status, code, message } = classify(err);

  const logPayload = {
    requestId: req.id || null,
    method: req.method,
    path: req.originalUrl,
    status,
    code: code || err.code || null,
    userId: req.user?.id || null,
    empresaId: req.user?.empresa_id || null,
    msg: err.message,
  };

  if (status >= 500) {
    console.error('[ERROR]', JSON.stringify(logPayload));
    if (err.stack) console.error(err.stack);
  } else {
    console.warn('[WARN]', JSON.stringify(logPayload));
  }

  const body = { error: message, requestId: req.id || null };
  if (code) body.code = code;

  // Em dev: devolve detalhes do erro original pra acelerar diagnóstico.
  // Em prod: nunca expor stack/internals.
  if (config.nodeEnv !== 'production') {
    body.debug = { message: err.message, code: err.code, name: err.name };
  }

  res.status(status).json(body);
}

module.exports = errorHandler;
