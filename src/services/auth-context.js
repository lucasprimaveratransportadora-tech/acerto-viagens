function resolveEffectiveUser(databaseUser, claims = {}) {
  const realUser = { ...databaseUser };
  const canImpersonate = databaseUser?.role === 'SUPER_ADMIN';
  const targetEmpresaId = typeof claims.su_empresa === 'string'
    ? claims.su_empresa.trim()
    : '';

  if (!canImpersonate || !targetEmpresaId) {
    return { user: realUser, realUser, impersonating: false };
  }

  return {
    user: { ...realUser, empresa_id: targetEmpresaId, role: 'ADMIN' },
    realUser,
    impersonating: true,
  };
}

module.exports = { resolveEffectiveUser };
