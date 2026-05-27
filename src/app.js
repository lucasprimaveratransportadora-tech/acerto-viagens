const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./config');
const { globalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const requestId = require('./middleware/requestId');
const routes = require('./routes');

const app = express();

// Trust Railway/Proxy headers (X-Forwarded-For) for rate-limit and secure cookies
app.set('trust proxy', 1);

// Request correlation ID — precisa vir antes de tudo pra estar disponível
// nos logs do errorHandler e nas respostas (header X-Request-Id).
app.use(requestId);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      // Permite preview inline de PDFs e outros anexos via blob URLs
      // (iframe e <object>/<embed>). Sem isso o browser bloqueia o
      // iframe do modal de preview ("Este conteúdo está bloqueado").
      frameSrc: ["'self'", "blob:"],
      objectSrc: ["'self'", "blob:"],
      mediaSrc:  ["'self'", "blob:"],
    },
  },
}));

// CORS
app.use(cors({
  origin: config.allowedOrigins,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
app.use('/api/', globalLimiter);

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/src', express.static(path.join(__dirname, '..', 'src', 'public-assets'), { dotfiles: 'deny' }));

// API routes
app.use('/api', routes);

// 404 explícito pra /api/* — antes, /api/rota-inexistente caía no
// SPA fallback abaixo e retornava index.html com status 200, fazendo
// clientes JSON receberem HTML pra endpoint que não existe.
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada.',
    code: 'API_NOT_FOUND',
    path: req.originalUrl,
    requestId: req.id || null,
  });
});

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
