const test = require('node:test');
const assert = require('node:assert/strict');
const { darkenHex, normalizeBrandColor, resolveBrandCover, resolveBrandIcon, resolveBrandLogo, shortBrandName } = require('../src/utils/branding');

test('normaliza somente cor hexadecimal segura', () => {
  assert.equal(normalizeBrandColor('#12abEF'), '#12ABEF');
  assert.equal(normalizeBrandColor('red'), '#E30613');
  assert.equal(normalizeBrandColor('url(javascript:x)'), '#E30613');
});

test('escurece a cor primaria para o accent2', () => {
  assert.equal(darkenHex('#E30613', 0.7), '#9F040D');
});

test('resolve capa somente com metadados publicos e posicao permitida', () => {
  assert.deepEqual(resolveBrandCover({ id: 'empresa-1', capa_mime: 'image/jpeg', capa_posicao: 'top' }), {
    url: '/api/empresas/empresa-1/capa', position: 'top', fallback: false,
  });
  assert.deepEqual(resolveBrandCover({ id: 'empresa-1', nome: 'RPM Logística', logo_mime: 'image/png' }), {
    url: null, position: 'center', fallback: true,
  });
  assert.deepEqual(resolveBrandCover({ id: 'empresa-1', nome: 'Prima Transportadora', logo_mime: 'image/png' }), {
    url: null, position: 'center', fallback: false,
  });
});

test('resolve icone da aba pela logo da empresa ativa', () => {
  assert.equal(resolveBrandIcon({ id: 'empresa-1', logo_mime: 'image/png', logo_tamanho: 44 }), '/api/empresas/empresa-1/logo?v=44');
  assert.equal(resolveBrandIcon({ logo_url: 'https://marca.test/logo.png' }), 'https://marca.test/logo.png');
  assert.equal(resolveBrandIcon({}), '/assets/images/logo-icon.png');
});

test('restaura a logo padrao quando a empresa nao possui logo propria', () => {
  assert.equal(resolveBrandLogo({ id: 'empresa-1', logo_mime: 'image/png', logo_tamanho: 44 }), '/api/empresas/empresa-1/logo?v=44');
  assert.equal(resolveBrandLogo({}), '/assets/images/logo-full.png');
});

test('reduz sufixos institucionais somente no titulo hero da marca', () => {
  assert.equal(shortBrandName('Prima Transportadora'), 'Prima');
  assert.equal(shortBrandName('RPM Logística'), 'RPM');
  assert.equal(shortBrandName('Transporte Horizonte'), 'Transporte Horizonte');
});
