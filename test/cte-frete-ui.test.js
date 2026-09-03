const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createDocument(elements = {}) {
  return {
    getElementById(id) {
      return elements[id] || null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    createElement() {
      return {
        _value: '',
        _text: '',
        set textContent(value) {
          this._text = value;
          this._value = String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
        },
        get innerHTML() {
          return this._value;
        },
      };
    },
    body: {
      setAttribute() {},
      removeAttribute() {},
      insertBefore() {},
      firstChild: null,
    },
  };
}

function loadTripsModule({ api, state, document, window, alert = () => {}, setTimeout = (fn) => fn() }) {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/trips.js'), 'utf8');
  const transformed = source
    .replace("import { api } from './api.js';", 'const { api } = globalThis.__TEST_STUBS;')
    .replace("import { state, DESP } from './state.js';", 'const { state, DESP } = globalThis.__TEST_STUBS;')
    .replace("import { fmt, fmtD, esc, calcFrete, calcDesp } from './utils.js';", 'const { fmt, fmtD, esc, calcFrete, calcDesp } = globalThis.__TEST_STUBS;')
    .replace('export function buildDetail', 'function buildDetail');

  const context = vm.createContext({
    console,
    document,
    window,
    alert,
    setTimeout,
    clearTimeout() {},
    globalThis: {
      __TEST_STUBS: {
        api,
        state,
        DESP: [],
        fmt: (value) => Number(value || 0).toFixed(2).replace('.', ','),
        fmtD: (value) => value ? '02/09/2026' : '—',
        esc: (value) => String(value ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;'),
        calcFrete: (trip) => (trip.ctes || []).reduce((sum, cte) => sum + Number(cte.valor || 0), 0),
        calcDesp: () => 0,
      },
    },
    URLSearchParams,
  });

  vm.runInContext(transformed, context, { filename: 'public/js/trips.js' });
  return { buildDetail: context.buildDetail, window };
}

test('formulario de Criar CT-e exibe busca de frete, card selecionado e vinculo na linha do CTe', () => {
  const document = createDocument();
  const window = {};
  const trip = {
    id: 'trip-1',
    numero: 12,
    data_inicio: '2026-09-02',
    truck: { motorista: 'Ronaldo' },
    ctes: [{
      id: 'cte-1',
      numero: '12345',
      valor: 1800,
      frete_terceiro: {
        id: 'frete-1',
        numero: 'FT-77',
        empresa_pagadora: 'Transdelta',
        motorista: 'João',
        veiculo: 'ABC-1234',
        valor_total: 1800,
      },
    }],
    expenses: [],
    fuels: [],
    trip_anexos: [],
  };
  const localState = { trips: [trip] };
  const { buildDetail } = loadTripsModule({ api: {}, state: localState, document, window });

  buildDetail(trip);
  window.toggleInlineCteCreator('trip-1');
  const html = buildDetail(trip);

  assert.match(html, /Criar CT-e/i);
  assert.match(html, /Buscar frete/i);
  assert.match(html, /aria-live="polite"/i);
  assert.match(html, /Transdelta/);
  assert.match(html, /FT-77/);
});

test('botão do CT-e deixa explícito que pode puxar um frete terceiro', () => {
  const document = createDocument();
  const window = {};
  const trip = { id: 'trip-2', ctes: [], expenses: [], fuels: [] };
  const { buildDetail } = loadTripsModule({ api: {}, state: { trips: [trip] }, document, window });

  const html = buildDetail(trip);
  assert.match(html, /Puxar frete terceiro/i);
});

test('detalhe da viagem não exibe um bloco separado de frete terceiro', () => {
  const document = createDocument();
  const window = {};
  const trip = { id: 'trip-3', ctes: [], expenses: [], fuels: [] };
  const { buildDetail } = loadTripsModule({ api: {}, state: { trips: [trip] }, document, window });

  assert.doesNotMatch(buildDetail(trip), /Frete Retorno \(Terceiro\)|Puxar Frete Retorno/i);
});

test('inlineSaveCte envia frete_terceiro_id selecionado para a API existente', async () => {
  const calls = [];
  const elements = {
    inCteDate_trip1: { value: '2026-09-02' },
    inCteNum_trip1: { value: '12345' },
    inCteOri_trip1: { value: 'Campinas' },
    inCteDst_trip1: { value: 'Recife' },
    inCteVal_trip1: { value: '1800' },
    inCteFreteId_trip1: { value: 'frete-123' },
  };
  const document = createDocument(elements);
  const window = {};
  const api = {
    post: async (url, body) => {
      calls.push({ url, body });
      return {};
    },
    get: async () => ({ id: 'trip1', ctes: [], expenses: [], fuels: [] }),
  };
  loadTripsModule({ api, state: { trips: [{ id: 'trip1', ctes: [], expenses: [], fuels: [] }] }, document, window });

  await window.inlineSaveCte('trip1');

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    url: '/api/ctes/trip/trip1',
    body: {
      data: '2026-09-02',
      numero: '12345',
      origem: 'Campinas',
      destino: 'Recife',
      valor: 1800,
      frete_terceiro_id: 'frete-123',
    },
  }]);
});

test('mobile e html reservam estrutura acessivel para o seletor de frete do CTe', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const tripsCss = fs.readFileSync(path.join(__dirname, '../public/css/trips.css'), 'utf8');
  const mobileCss = fs.readFileSync(path.join(__dirname, '../public/css/mobile.css'), 'utf8');

  assert.match(html, /id="tripPullFreteModal"/);
  assert.match(tripsCss, /\.cte-frete-selector/);
  assert.match(tripsCss, /:focus-visible/);
  assert.match(mobileCss, /\.cte-creator-fields/);
});

function composerFixture() {
  const trip = { id: 'trip1', ctes: [], expenses: [], fuels: [] };
  const window = {};
  const document = createDocument();
  const loaded = loadTripsModule({ api: {}, state: { trips: [trip] }, document, window, setTimeout: () => 1 });
  const source = fs.readFileSync(path.join(__dirname, '../public/js/trip-frete-link.js'), 'utf8')
    .replace("import { api } from './api.js';", 'const api = globalThis.api;')
    .replace("import { esc } from './utils.js';", 'const esc = String;');
  const requests = [];
  vm.runInNewContext(source, { window, document, URLSearchParams, api: {
    get: async url => {
      requests.push(url);
      return [
        { id: 'f1', numero: 'FT-001', origem: 'Campinas', destino: 'Recife', valor_total: '1800' },
        { id: 'f2', numero: 'FT-002', origem: 'Santos', destino: null, valor_total: '2500' },
      ];
    },
  } });
  window.toggleInlineCteCreator(trip.id);
  return { window, trip, requests, html: () => loaded.buildDetail(trip) };
}

function fieldValue(html, prefix) {
  return html.match(new RegExp(`id="${prefix}_trip1"[^>]*value="([^"]*)"`))?.[1];
}

test('Trocar frete limpa origem destino valor autofill e permite selecionar dados do proximo', async () => {
  const f = composerFixture();
  f.window.queueCteFreteSearch('trip1', ' FT-00 ');
  await f.window.runCteFreteSearch('trip1');
  assert.deepEqual(f.requests, ['/api/ctes/fretes-disponiveis?q=FT-00']);
  f.window.selectCteFrete('trip1', 'f1');
  assert.equal(fieldValue(f.html(), 'inCteOri'), 'Campinas');
  f.window.clearCteFreteSelection('trip1');
  for (const field of ['inCteOri', 'inCteDst', 'inCteVal', 'inCteFreteId']) {
    assert.equal(fieldValue(f.html(), field), '', field);
  }
  f.window.selectCteFrete('trip1', 'f2');
  assert.equal(fieldValue(f.html(), 'inCteOri'), 'Santos');
  assert.equal(fieldValue(f.html(), 'inCteDst'), '');
  assert.equal(fieldValue(f.html(), 'inCteVal'), '2500');
  assert.equal(fieldValue(f.html(), 'inCteFreteId'), 'f2');
});

test('selecionar outro resultado diretamente substitui o autofill anterior', async () => {
  const f = composerFixture();
  f.window.queueCteFreteSearch('trip1', 'FT-00');
  await f.window.runCteFreteSearch('trip1');
  f.window.selectCteFrete('trip1', 'f1');
  f.window.selectCteFrete('trip1', 'f2');
  assert.equal(fieldValue(f.html(), 'inCteOri'), 'Santos');
  assert.equal(fieldValue(f.html(), 'inCteDst'), '');
  assert.equal(fieldValue(f.html(), 'inCteVal'), '2500');
});

test('troca preserva campos manuais e data numero do CTe', async () => {
  const f = composerFixture();
  f.window.syncCteComposerField('trip1', 'origem', 'Manual');
  f.window.syncCteComposerField('trip1', 'numero', 'CT-88');
  f.window.syncCteComposerField('trip1', 'data', '2026-09-02');
  f.window.queueCteFreteSearch('trip1', 'FT-00');
  await f.window.runCteFreteSearch('trip1');
  f.window.selectCteFrete('trip1', 'f1');
  f.window.syncCteComposerField('trip1', 'valor', '1999');
  f.window.clearCteFreteSelection('trip1');
  f.window.selectCteFrete('trip1', 'f2');
  assert.equal(fieldValue(f.html(), 'inCteOri'), 'Manual');
  assert.equal(fieldValue(f.html(), 'inCteVal'), '1999');
  assert.equal(fieldValue(f.html(), 'inCteNum'), 'CT-88');
  assert.equal(fieldValue(f.html(), 'inCteDate'), '2026-09-02');
});

test('UI do frete permite cadastrar editar limpar e exibir numero estruturado', async () => {
  const elements = {};
  for (const id of ['ftNumero', 'ftEmpresa', 'ftData', 'ftMotorista', 'ftTruck', 'ftOrigem',
    'ftDestino', 'ftValor', 'ftAdi', 'ftObs', 'ftModalTitle', 'ftAdiRow', 'ftFreteModal', 'ftTbody']) {
    elements[id] = { value: '', innerHTML: '', style: {}, classList: { add() {}, remove() {} } };
  }
  elements.ftTruck.options = [];
  elements.ftTruck.selectedIndex = -1;
  const calls = [];
  const stored = { id: 'f1', numero: 'FT-0012', empresa_pagadora: 'Pagadora', motorista: 'Motorista',
    truck_id: 't1', data: '2026-09-02', valor_total: 1500, valor_pago: 0 };
  const api = {
    get: async url => url.startsWith('/api/fretes-terceiros?') ? [stored]
      : url === '/api/trucks' ? [] : url.endsWith('/summary') ? {} : stored,
    post: async (url, body) => { calls.push({ url, body }); },
    patch: async (url, body) => { calls.push({ url, body }); },
  };
  const document = createDocument(elements);
  const window = {};
  const source = fs.readFileSync(path.join(__dirname, '../public/js/frete-terceiro.js'), 'utf8')
    .replace("import { api } from './api.js';", 'const api = globalThis.api;')
    .replace("import { esc, fmtD } from './utils.js';", 'const esc = String; const fmtD = String;')
    .replace("import { wireInlineFrete } from './frete-terceiro.inline.js';", '')
    .replace('export async function initFreteTerceiro', 'async function initFreteTerceiro');
  vm.runInNewContext(source, { window, document, api, URLSearchParams, console,
    alert: message => assert.fail(message) });
  elements.ftNumero.value = 'anterior';
  window.ft.openNew();
  assert.equal(elements.ftNumero.value, '');
  Object.assign(elements.ftEmpresa, { value: 'Pagadora' });
  elements.ftNumero.value = '  FT-0012  ';
  elements.ftMotorista.value = 'Motorista';
  elements.ftTruck.value = 't1';
  elements.ftValor.value = '1500';
  await window.ft.save();
  assert.equal(calls[0].body.numero, 'FT-0012');
  assert.match(elements.ftTbody.innerHTML, /FT-0012/);
  await window.ft.openEdit('f1');
  assert.equal(elements.ftNumero.value, 'FT-0012');
  elements.ftNumero.value = '';
  await window.ft.save();
  assert.equal(calls[1].url, '/api/fretes-terceiros/f1');
  assert.equal(calls[1].body.numero, null);
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /<label for="ftNumero">/);
  assert.match(html, /id="ftNumero"[^>]*maxlength="50"/);
});
