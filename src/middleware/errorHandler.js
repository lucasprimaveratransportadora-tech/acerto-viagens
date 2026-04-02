function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${err.message}`, err.stack);

  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] || 'campo';
    return res.status(409).json({ error: `Já existe um registro com este ${field}.` });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Registro não encontrado.' });
  }

  res.status(500).json({ error: 'Erro interno do servidor.' });
}

module.exports = errorHandler;
