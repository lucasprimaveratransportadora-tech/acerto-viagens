function tenant(req, res, next) {
  if (!req.user || !req.user.empresa_id) {
    return res.status(401).json({ error: 'Empresa não identificada.' });
  }
  req.empresaId = req.user.empresa_id;
  next();
}

module.exports = tenant;
