const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CAPA_MAX_BYTES,
  empresaBrandSelect,
  validateCoverFile,
} = require('../src/services/empresa-brand');

test('aceita capa JPEG ou WebP de ate 5 MB', () => {
  assert.deepEqual(validateCoverFile({ mimetype: 'image/jpeg', size: 1, buffer: Buffer.from('a') }), { ok: true });
  assert.deepEqual(validateCoverFile({ mimetype: 'image/webp', size: CAPA_MAX_BYTES, buffer: Buffer.alloc(1) }), { ok: true });
});

test('rejeita capa ausente, formato nao permitido, vazia ou grande demais', () => {
  assert.equal(validateCoverFile().ok, false);
  assert.equal(validateCoverFile({ mimetype: 'image/png', size: 10, buffer: Buffer.alloc(10) }).ok, false);
  assert.equal(validateCoverFile({ mimetype: 'image/jpeg', size: 0, buffer: Buffer.alloc(0) }).ok, false);
  assert.equal(validateCoverFile({ mimetype: 'image/jpeg', size: CAPA_MAX_BYTES + 1, buffer: Buffer.alloc(1) }).ok, false);
});

test('selecao publica da marca nunca inclui bytes de logo ou capa', () => {
  const select = empresaBrandSelect();
  assert.equal(select.logo_dados, undefined);
  assert.equal(select.capa_dados, undefined);
  assert.equal(select.capa_mime, true);
  assert.equal(select.capa_tamanho, true);
  assert.equal(select.capa_posicao, true);
});
