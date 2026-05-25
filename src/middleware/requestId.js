const crypto = require('crypto');

// ID curto por request — propagado em logs e respostas pra correlacionar
// um erro do usuário com a linha exata do log do Railway.
function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 64
    ? incoming
    : crypto.randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = requestId;
