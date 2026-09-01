const test = require('node:test');
const assert = require('node:assert/strict');
const { validarEdicao, podeEditar } = require('../src/utils/frete-inline');
const aberto = { status:'ABERTO', forma_pagamento:'ADIANTAMENTO_SALDO', valor_total:9500, valor_pago:3300, valor_adiantamento:3000, motorista:'João' };

test('cancelado bloqueia qualquer edição', () => assert.equal(podeEditar({...aberto,status:'CANCELADO'},'motorista'), false));
test('pago bloqueia valor mas permite motorista', () => {
  assert.equal(podeEditar({...aberto,status:'PAGO'},'valor_total'), false);
  assert.equal(podeEditar({...aberto,status:'PAGO'},'motorista'), true);
});
test('valor não pode ficar abaixo do que já foi pago', () => {
  const r=validarEdicao(aberto,'valor_total','3.000,00'); assert.equal(r.ok,false); assert.match(r.erro,/3\.300,00/);
});
test('valor brasileiro vira patch numérico', () => assert.deepEqual(validarEdicao(aberto,'valor_total','9.800,00'),{ok:true,patch:{valor_total:9800}}));
test('adiantamento não pode superar total', () => assert.equal(validarEdicao(aberto,'valor_adiantamento','10.000,00').ok,false));
test('texto vazio é recusado', () => assert.equal(validarEdicao(aberto,'motorista',' ').ok,false));
