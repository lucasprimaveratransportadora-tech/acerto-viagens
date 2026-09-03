const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProductionPatch } = require('../scripts/production-patch');

test('define a troca do e-mail antigo e a capa da RPM sem alterar a senha', () => {
  const patch = buildProductionPatch();
  assert.equal(patch.oldEmail, 'ney@vidallogistica.com.br');
  assert.deepEqual(patch.oldEmails, ['ney@vidallogistica.com.br', 'ney@vidallogistica.com']);
  assert.equal(patch.newEmail, 'aneilhomar@icloud.com');
  assert.equal(patch.rpmName, 'RPM');
  assert.match(patch.capaPath, /public[\\/]assets[\\/]images[\\/]rpm-capa\.png$/);
});
