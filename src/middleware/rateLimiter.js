const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 2000/15min (~133 req/min). 200 era apertado demais pra uso real:
  // preencher viagens/CTEs/abastecimentos manualmente queima 50+ requests
  // numa sessão e usuários atrás do mesmo NAT corporativo dividem a cota.
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});

module.exports = { globalLimiter, authLimiter };
