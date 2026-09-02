const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../src/config');

test('sessao persistente dura 30 dias e renova o cookie junto', () => {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  assert.equal(config.jwt.refreshExpiresIn, '30d');
  assert.equal(config.jwt.refreshExpiresMs, thirtyDaysMs);
});
