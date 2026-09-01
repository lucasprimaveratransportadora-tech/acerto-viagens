const test = require('node:test');
const assert = require('node:assert/strict');
const { darkenHex, normalizeBrandColor } = require('../src/utils/branding');

test('normaliza somente cor hexadecimal segura', () => {
  assert.equal(normalizeBrandColor('#12abEF'), '#12ABEF');
  assert.equal(normalizeBrandColor('red'), '#E30613');
  assert.equal(normalizeBrandColor('url(javascript:x)'), '#E30613');
});

test('escurece a cor primaria para o accent2', () => {
  assert.equal(darkenHex('#E30613', 0.7), '#9F040D');
});
