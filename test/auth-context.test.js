const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveEffectiveUser } = require('../src/services/auth-context');

const base = { id: 'u1', empresa_id: 'e1', role: 'ADMIN', email: 'a@x.com' };

test('usuario comum permanece na propria empresa mesmo com claim forjado', () => {
  const r = resolveEffectiveUser(base, { su_empresa: 'e2' });
  assert.equal(r.user.empresa_id, 'e1');
  assert.equal(r.impersonating, false);
});

test('superadmin sem impersonacao permanece global', () => {
  const su = { ...base, role: 'SUPER_ADMIN', empresa_id: 'e1' };
  const r = resolveEffectiveUser(su, {});
  assert.equal(r.user.role, 'SUPER_ADMIN');
  assert.equal(r.user.empresa_id, 'e1');
  assert.equal(r.impersonating, false);
});

test('superadmin impersonado opera como ADMIN na empresa escolhida', () => {
  const su = { ...base, role: 'SUPER_ADMIN', empresa_id: 'e1' };
  const r = resolveEffectiveUser(su, { su_empresa: 'e2' });
  assert.equal(r.user.role, 'ADMIN');
  assert.equal(r.user.empresa_id, 'e2');
  assert.equal(r.impersonating, true);
  assert.equal(r.realUser.role, 'SUPER_ADMIN');
  assert.equal(r.realUser.empresa_id, 'e1');
});

test('claim vazio nao ativa impersonacao', () => {
  const su = { ...base, role: 'SUPER_ADMIN' };
  assert.equal(resolveEffectiveUser(su, { su_empresa: '' }).impersonating, false);
});
