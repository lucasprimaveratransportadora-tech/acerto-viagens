// requirePermission — gate para módulos liberados via User.permissoes.
// ADMIN passa sempre. Para GESTOR, exige a string na lista.
// Frontend já oculta UI, mas backend também precisa proteger pra
// evitar bypass por curl/Postman.

function requirePermission(moduleName) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    if (req.user.role === 'ADMIN') return next();
    const perms = Array.isArray(req.user.permissoes) ? req.user.permissoes : [];
    if (!perms.includes(moduleName)) {
      return res.status(403).json({ error: `Acesso negado ao módulo '${moduleName}'.` });
    }
    next();
  };
}

module.exports = requirePermission;
