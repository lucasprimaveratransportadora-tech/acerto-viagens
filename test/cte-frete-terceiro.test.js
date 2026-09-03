const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { validationResult } = require('express-validator');
const { createCte } = require('../src/validators/cte.validator');

// Integration tests only use an explicitly selected, disposable local database.
// Run after migrate deploy with TEST_CTE_DATABASE_URL pointing to task3_cte_test_final.
const databaseUrl = process.env.TEST_CTE_DATABASE_URL;
const integration = { skip: databaseUrl ? false : 'Set TEST_CTE_DATABASE_URL to a migrated local task3_cte_test_final database.' };
let db;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.ok(['/task3_cte_test', '/task3_cte_test_final'].includes(url.pathname));
  process.env.DATABASE_URL = databaseUrl;
  db = require('../src/config/database');
  test.after(() => db.$disconnect());
}
const ctes = require('../src/services/ctes.service');
const fretes = require('../src/services/fretesTerceiros.service');

async function fixture(t) {
  const empresas = [];
  t.after(async () => {
    const scope = { in: empresas };
    // Delete only this test's generated tenants, never truncate shared data.
    await db.auditLog.deleteMany({ where: { empresa_id: scope } });
    await db.cte.deleteMany({ where: { trip: { empresa_id: scope } } });
    await db.freteTerceiro.deleteMany({ where: { empresa_id: scope } });
    await db.trip.deleteMany({ where: { empresa_id: scope } });
    await db.truck.deleteMany({ where: { empresa_id: scope } });
    await db.user.deleteMany({ where: { empresa_id: scope } });
    await db.empresa.deleteMany({ where: { id: scope } });
  });
  const tenants = [];
  for (let i = 0; i < 2; i++) {
    const empresa = await db.empresa.create({ data: { nome: `Task 3 ${randomUUID()}` } });
    empresas.push(empresa.id);
    const truck = await db.truck.create({ data: { empresa_id: empresa.id, placa: `TEST00${i}` } });
    const trip = await db.trip.create({ data: {
      empresa_id: empresa.id, truck_id: truck.id, numero: 1, data_inicio: new Date('2026-09-02'),
    } });
    tenants.push({ empresa, truck, trip });
  }
  const [a, b] = tenants;
  const req = { user: { email: 'task3@example.test', empresa_id: a.empresa.id }, headers: {} };
  const makeFrete = (data = {}) => db.freteTerceiro.create({ data: {
    empresa_id: a.empresa.id, empresa_pagadora: 'Pagadora Alfa', motorista: 'Motorista Teste',
    veiculo: 'ABC1D23', origem: 'Campinas', destino: 'Recife',
    data: new Date('2026-09-02'), valor_total: 1500, ...data,
  } });
  const create = (freteId, tripId = a.trip.id, extra = {}) => ctes.create(tripId, a.empresa.id, req, {
    numero: 'CT-123', valor: 1500, frete_terceiro_id: freteId, ...extra,
  });
  return { a, b, req, makeFrete, create };
}

test('validator rejeita frete_terceiro_id que nao seja UUID', async () => {
  const req = { body: { valor: 10, frete_terceiro_id: 'outro-frete' } };
  for (const rule of createCte) await rule.run(req);
  assert.ok(validationResult(req).array().some(error => error.path === 'frete_terceiro_id'));
});

test('validator aceita criacao manual, null ou UUID valido', async () => {
  for (const freteId of [undefined, null, randomUUID()]) {
    const req = { body: { valor: 10, frete_terceiro_id: freteId } };
    for (const rule of createCte) await rule.run(req);
    assert.equal(validationResult(req).isEmpty(), true);
  }
});

test('lista apenas fretes livres ativos da empresa, sem vinculo legado ou CTe', integration, async t => {
  const f = await fixture(t);
  const livre = await f.makeFrete();
  await f.makeFrete({ empresa_id: f.b.empresa.id });
  await f.makeFrete({ trip_id: f.a.trip.id });
  await f.makeFrete({ deleted_at: new Date() });
  await f.makeFrete({ status: 'CANCELADO' });
  const vinculado = await f.makeFrete();
  await f.create(vinculado.id);
  assert.equal(typeof ctes.listFretesDisponiveis, 'function', 'endpoint/service de fretes disponiveis ausente');
  const result = await ctes.listFretesDisponiveis(f.a.empresa.id);
  assert.deepEqual(result.map(row => row.id), [livre.id]);
});

test('busca identificadores e numero registrado no anexo CTE sem incluir anexos excluidos', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  await db.freteTerceiroAnexo.create({ data: { frete_id: frete.id, tipo: 'CTE', nome: 'CT-e 987654.pdf' } });
  await db.freteTerceiroAnexo.create({ data: {
    frete_id: frete.id, tipo: 'CTE', nome: 'CT-e 112233.pdf', deleted_at: new Date(),
  } });
  assert.equal(typeof ctes.listFretesDisponiveis, 'function');
  for (const q of ['alfa', 'motorista', 'abc1d23', 'campinas', 'recife', '987654']) {
    const result = await ctes.listFretesDisponiveis(f.a.empresa.id, q);
    assert.deepEqual(result.map(row => row.id), [frete.id], q);
  }
  assert.deepEqual(await ctes.listFretesDisponiveis(f.a.empresa.id, '112233'), []);
});

test('cria CTe e vincula frete a viagem, retornando relacao e auditoria sem PII do frete', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  const result = await f.create(frete.id);
  assert.equal(result.frete_terceiro_id, frete.id);
  assert.equal(result.frete_terceiro.id, frete.id);
  assert.equal(result.frete_terceiro.trip_id, f.a.trip.id);
  const stored = await db.freteTerceiro.findUnique({ where: { id: frete.id } });
  assert.equal(stored.trip_id, f.a.trip.id);
  const logs = await db.auditLog.findMany({ where: { empresa_id: f.a.empresa.id } });
  const link = logs.find(log => log.entity_type === 'FRETE_TERCEIRO');
  assert.equal(link.before.trip_id, null);
  assert.equal(link.after.trip_id, f.a.trip.id);
  assert.equal(JSON.stringify(logs).includes('Motorista Teste'), false);
});

test('rejeita segundo vinculo com 409 sem criar outro CTe', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  await f.create(frete.id);
  await assert.rejects(() => f.create(frete.id), { statusCode: 409 });
  assert.equal(await db.cte.count({ where: { trip_id: f.a.trip.id } }), 1);
});

test('rejeita frete cross-tenant e viagem cross-tenant sem gravar', integration, async t => {
  const f = await fixture(t);
  const foreign = await f.makeFrete({ empresa_id: f.b.empresa.id });
  const local = await f.makeFrete();
  await assert.rejects(() => f.create(foreign.id), { statusCode: 404 });
  await assert.rejects(() => f.create(local.id, f.b.trip.id), { statusCode: 404 });
  assert.equal(await db.cte.count({ where: { trip_id: { in: [f.a.trip.id, f.b.trip.id] } } }), 0);
});

test('rejeita frete excluido, cancelado, inexistente ou com vinculo legado', integration, async t => {
  const f = await fixture(t);
  const deleted = await f.makeFrete({ deleted_at: new Date() });
  const cancelled = await f.makeFrete({ status: 'CANCELADO' });
  const legacy = await f.makeFrete({ trip_id: f.a.trip.id });
  for (const id of [deleted.id, randomUUID()]) await assert.rejects(() => f.create(id), { statusCode: 404 });
  for (const id of [cancelled.id, legacy.id]) await assert.rejects(() => f.create(id), { statusCode: 409 });
});

test('criacao manual continua permitindo varios CTes sem frete e ignora ids de autoridade no body', integration, async t => {
  const f = await fixture(t);
  const first = await f.create(undefined, f.a.trip.id, { trip_id: f.b.trip.id, empresa_id: f.b.empresa.id });
  const second = await f.create(null);
  assert.equal(first.trip_id, f.a.trip.id);
  assert.equal(first.frete_terceiro_id, null);
  assert.equal(second.frete_terceiro_id, null);
});

test('concorrencia real: exatamente um CTe vence e os demais recebem conflito', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => f.create(frete.id)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  for (const result of results.filter(r => r.status === 'rejected')) assert.equal(result.reason.statusCode, 409);
  assert.equal(await db.cte.count({ where: { trip_id: f.a.trip.id } }), 1);
});

test('falha ao criar CTe desfaz a reserva do frete na mesma transacao', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  await assert.rejects(() => f.create(frete.id, f.a.trip.id, { valor: 'invalido' }));
  assert.equal((await db.freteTerceiro.findUnique({ where: { id: frete.id } })).trip_id, null);
  assert.equal(await db.cte.count({ where: { trip_id: f.a.trip.id } }), 0);
});

test('indice unico impede segundo CTe mesmo fora do service', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  await f.create(frete.id);
  await assert.rejects(() => db.cte.create({ data: { trip_id: f.a.trip.id, frete_terceiro_id: frete.id } }), { code: 'P2002' });
});

test('editar CTe preserva vinculo e inclui frete; leitura de frete inclui CTe', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  const created = await f.create(frete.id);
  const result = await ctes.update(created.id, f.a.empresa.id, f.req, {
    numero: 'CT-456', trip_id: f.b.trip.id, frete_terceiro_id: null,
  });
  assert.equal(result.trip_id, f.a.trip.id);
  assert.equal(result.frete_terceiro.id, frete.id);
  assert.equal((await fretes.getById(frete.id, f.a.empresa.id)).cte.id, created.id);
  assert.equal((await fretes.list(f.a.empresa.id))[0].cte.id, created.id);
});

test('leitura de CTes por viagem inclui frete e exige ownership', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  const created = await f.create(frete.id);
  assert.equal(typeof ctes.listByTrip, 'function');
  const rows = await ctes.listByTrip(f.a.trip.id, f.a.empresa.id);
  assert.equal(rows[0].id, created.id);
  assert.equal(rows[0].frete_terceiro.id, frete.id);
  await assert.rejects(() => ctes.listByTrip(f.a.trip.id, f.b.empresa.id), { statusCode: 404 });
});

test('servicos de vinculo negam consultas sem empresa', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  assert.equal(typeof ctes.listFretesDisponiveis, 'function');
  await assert.rejects(() => ctes.listFretesDisponiveis(undefined), { statusCode: 401 });
  await assert.rejects(() => ctes.create(f.a.trip.id, undefined, f.req, { valor: 10, frete_terceiro_id: frete.id }), { statusCode: 401 });
});

test('remover CTe libera o frete para nova selecao', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  const created = await f.create(frete.id);
  await ctes.remove(created.id, f.a.empresa.id, f.req);
  assert.equal((await db.freteTerceiro.findUnique({ where: { id: frete.id } })).trip_id, null);
  assert.equal(typeof ctes.listFretesDisponiveis, 'function');
  assert.equal((await ctes.listFretesDisponiveis(f.a.empresa.id))[0].id, frete.id);
});

test('exclusao em lote de CTes libera somente fretes ligados a esses CTes', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  await f.create(frete.id);
  const legacy = await f.makeFrete({ trip_id: f.a.trip.id });
  // trips.update usa deleteMany para substituir os CTes da viagem.
  await db.cte.deleteMany({ where: { trip_id: f.a.trip.id } });
  assert.equal((await db.freteTerceiro.findUnique({ where: { id: frete.id } })).trip_id, null);
  assert.equal((await db.freteTerceiro.findUnique({ where: { id: legacy.id } })).trip_id, f.a.trip.id);
});

test('desvincular frete preserva o CTe manual e limpa ambos os lados', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  const created = await f.create(frete.id);
  await fretes.unlinkTrip(frete.id, f.a.empresa.id, f.req);
  assert.equal((await db.freteTerceiro.findUnique({ where: { id: frete.id } })).trip_id, null);
  assert.equal((await db.cte.findUnique({ where: { id: created.id } })).frete_terceiro_id, null);
  await f.create(frete.id);
});

test('remover frete limpa o vinculo mas preserva dados do CTe', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  const created = await f.create(frete.id);
  await fretes.remove(frete.id, f.a.empresa.id, f.req);
  const stored = await db.freteTerceiro.findUnique({ where: { id: frete.id } });
  assert.ok(stored.deleted_at);
  assert.equal(stored.trip_id, null);
  const cte = await db.cte.findUnique({ where: { id: created.id } });
  assert.equal(cte.frete_terceiro_id, null);
  assert.equal(cte.numero, 'CT-123');
});

test('vinculo legado nao pode mover frete que ja tenha CTe ou viagem', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  await f.create(frete.id);
  const another = await db.trip.create({ data: {
    empresa_id: f.a.empresa.id, truck_id: f.a.truck.id, numero: 2, data_inicio: new Date(),
  } });
  await assert.rejects(() => fretes.linkTrip(frete.id, another.id, f.a.empresa.id, f.req), { statusCode: 409 });
});

test('concorrencia com vinculo legado nao deixa CTe e frete em viagens diferentes', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  const another = await db.trip.create({ data: {
    empresa_id: f.a.empresa.id, truck_id: f.a.truck.id, numero: 2, data_inicio: new Date(),
  } });
  const results = await Promise.allSettled([
    f.create(frete.id), fretes.linkTrip(frete.id, another.id, f.a.empresa.id, f.req),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.statusCode, 409);
});

test('rotas de CTe nao permitem ler ou desvincular recursos de outra empresa', integration, async t => {
  const f = await fixture(t);
  const frete = await f.makeFrete();
  const cte = await f.create(frete.id);
  await assert.rejects(() => ctes.update(cte.id, f.b.empresa.id, f.req, { numero: 'forjado' }), { statusCode: 404 });
  await assert.rejects(() => ctes.remove(cte.id, f.b.empresa.id, f.req), { statusCode: 404 });
  await assert.rejects(() => fretes.unlinkTrip(frete.id, f.b.empresa.id, f.req), { statusCode: 404 });
  await assert.rejects(() => fretes.remove(frete.id, f.b.empresa.id, f.req), { statusCode: 404 });
});

test('GET fretes-disponiveis exige sessao e ignora empresa_id da query', integration, async t => {
  const f = await fixture(t);
  const livre = await f.makeFrete();
  await f.makeFrete({ empresa_id: f.b.empresa.id });
  const user = await db.user.create({ data: {
    empresa_id: f.a.empresa.id, nome: 'Teste', email: `${randomUUID()}@example.test`, senha_hash: 'unused',
  } });
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/ctes', require('../src/routes/ctes.routes'));
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/ctes/fretes-disponiveis`;
  assert.equal((await fetch(url)).status, 401);
  const jwt = require('jsonwebtoken');
  const config = require('../src/config');
  const token = jwt.sign({ id: user.id }, config.jwt.secret);
  const headers = { Authorization: `Bearer ${token}` };
  const response = await fetch(`${url}?empresa_id=${f.b.empresa.id}&q=alfa`, { headers });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).map(row => row.id), [livre.id]);
  assert.equal((await fetch(`${url}?q[x]=bad`, { headers })).status, 400);
});
