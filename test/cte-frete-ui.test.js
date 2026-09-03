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
