// trips.modal.js — Trip form with tabs (Geral, CTEs, Abastecimentos, Despesas)

import { api } from './api.js';
import { state, setSelectedTruck, DESP } from './state.js';
import { fmt, esc } from './utils.js';
import { renderSidebar } from './sidebar.js';
import { renderMain } from './dashboard.js';

const ALL_TABS = ['geral', 'ctes', 'abast', 'desp'];

// ==================== TAB SWITCHING ====================

window.switchTab = function (name, el) {
  ALL_TABS.forEach(t => {
    document.getElementById('tab-' + t).style.display = t === name ? '' : 'none';
    document.getElementById('tab-btn-' + t).classList.remove('active');
  });
  if (el) el.classList.add('active');
  else document.getElementById('tab-btn-' + name)?.classList.add('active');
};

// ==================== OPEN TRIP MODAL ====================

window.openTripModal = function (pre) {
  const sel = document.getElementById('trpTruck');
  sel.innerHTML = state.trucks.map(t =>
    `<option value="${esc(t.id)}">${esc(t.placa)}${t.modelo ? ' \u2014 ' + esc(t.modelo) : ''}</option>`
  ).join('');

  if (pre) sel.value = pre;
  else if (state.selectedTruckId) sel.value = state.selectedTruckId;

  document.getElementById('trpDate').value = new Date().toISOString().split('T')[0];
  ['trpDateEnd', 'trpOrigin', 'trpDest', 'trpCargo', 'trpObs'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('trpKm').value = '';
  document.getElementById('trpAdto').value = '';
  document.getElementById('trpStatus').value = 'ok';
  document.getElementById('tripEditId').dataset.id = '';
  document.getElementById('cteTbody').innerHTML = '';
  document.getElementById('fuelTbody').innerHTML = '';
  document.getElementById('fuelKmInicial').value = '';
  document.getElementById('fuelKmFinal').value = '';
  document.getElementById('fuelKmPercLbl').textContent = '\u2014';
  document.getElementById('cteTotalLbl').textContent = 'R$ 0,00';
  document.getElementById('fuelTotalLbl').textContent = 'R$ 0,00';
  document.getElementById('fuelLitrosLbl').textContent = '0 L';
  document.getElementById('fuelMediaLbl').textContent = '\u2014';
  window.buildDespFields({});
  document.getElementById('despTotalLbl').textContent = 'R$ 0,00';
  window.switchTab('geral', document.getElementById('tab-btn-geral'));
  document.getElementById('tripModal').classList.add('open');
};

window.closeTripModal = function () {
  document.getElementById('tripModal').classList.remove('open');
};

// ==================== EDIT TRIP (load into modal) ====================

window.editTrip = async function (id) {
  try {
    const tr = await api.get('/api/trips/' + id);
    window.openTripModal(tr.truckId);

    document.getElementById('trpTruck').value = tr.truckId;
    document.getElementById('trpDate').value = tr.dataInicio || tr.date || '';
    document.getElementById('trpDateEnd').value = tr.dataFim || tr.dateEnd || '';
    document.getElementById('trpOrigin').value = tr.origem || tr.origin || '';
    document.getElementById('trpDest').value = tr.destino || tr.dest || '';
    document.getElementById('trpCargo').value = tr.carga || tr.cargo || '';
    document.getElementById('trpKm').value = tr.km || '';
    document.getElementById('trpStatus').value = tr.status || 'ok';
    document.getElementById('trpAdto').value = tr.adiantamento || tr.adto || '';
    document.getElementById('trpObs').value = tr.observacoes || tr.obs || '';
    document.getElementById('tripEditId').dataset.id = id;

    // Load CTEs
    (tr.ctes || []).forEach(c => window.addCteRow({
      data: c.data || '',
      num: c.numero || c.num || '',
      origin: c.origem || c.origin || '',
      dest: c.destino || c.dest || '',
      valor: c.valor || ''
    }));
    window.updateCteTotals();

    // Load Fuels
    (tr.fuels || []).forEach(f => window.addFuelRow({
      data: f.data || '',
      litros: f.litros || '',
      precoLitro: f.precoLitro || '',
      posto: f.posto || '',
      nf: f.notaFiscal || f.nf || '',
      km: f.km || '',
      valor: f.valor || ''
    }));
    document.getElementById('fuelKmInicial').value = tr.fuelKmInicial || tr.kmInicial || '';
    document.getElementById('fuelKmFinal').value = tr.fuelKmFinal || tr.kmFinal || '';
    window.updateFuelTotals();

    // Load Despesas from expenses array
    const despVals = {};
    (tr.expenses || []).forEach(e => { despVals[e.categoria] = e.valor; });
    window.buildDespFields(despVals);
    window.updateDespTotal();
  } catch (e) {
    alert('Erro ao carregar viagem: ' + e.message);
  }
};

// ==================== CTE ROWS ====================

window.addCteRow = function (d) {
  const tbody = document.getElementById('cteTbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="date" value="${d?.data || ''}" style="width:120px"></td>
    <td><input type="text" placeholder="N\u00BA CTE" value="${esc(d?.num || '')}" style="width:100px"></td>
    <td><input type="text" placeholder="Origem" value="${esc(d?.origin || '')}"></td>
    <td><input type="text" placeholder="Destino" value="${esc(d?.dest || '')}"></td>
    <td><input type="number" placeholder="0,00" step="0.01" value="${d?.valor || ''}" oninput="updateCteTotals()" style="width:110px"></td>
    <td><button class="action-btn del" onclick="this.closest('tr').remove();updateCteTotals()" style="font-size:.85rem">\u2715</button></td>`;
  tbody.appendChild(tr);
};

window.updateCteTotals = function () {
  let t = 0;
  document.querySelectorAll('#cteTbody tr').forEach(r => {
    const ins = r.querySelectorAll('input');
    t += parseFloat(ins[4].value || 0);
  });
  document.getElementById('cteTotalLbl').textContent = 'R$ ' + fmt(t);
};

function getCteRows() {
  return Array.from(document.querySelectorAll('#cteTbody tr')).map(r => {
    const ins = r.querySelectorAll('input');
    return {
      data: ins[0].value,
      numero: ins[1].value,
      origem: ins[2].value,
      destino: ins[3].value,
      valor: parseFloat(ins[4].value) || 0
    };
  }).filter(c => c.numero || c.valor);
}

// ==================== FUEL ROWS ====================

window.addFuelRow = function (d) {
  const tbody = document.getElementById('fuelTbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="date" value="${d?.data || ''}"></td>
    <td><input type="number" placeholder="0,00" step="0.01" value="${d?.litros || ''}" oninput="autoCalcFuelRow(this,'litros')" style="width:75px"></td>
    <td><input type="number" placeholder="0,00" step="0.01" value="${d?.precoLitro || ''}" oninput="autoCalcFuelRow(this,'preco')" style="width:75px"></td>
    <td><input type="text" placeholder="Nome do posto / CNPJ" value="${esc(d?.posto || '')}"></td>
    <td><input type="text" placeholder="Nota fiscal" value="${esc(d?.nf || '')}" style="width:95px"></td>
    <td><input type="number" placeholder="KM" value="${d?.km || ''}" style="width:80px"></td>
    <td><input type="number" placeholder="R$ 0,00" step="0.01" value="${d?.valor || ''}" oninput="autoCalcFuelRow(this,'valor')" style="width:95px"></td>
    <td><button class="action-btn del" onclick="this.closest('tr').remove();updateFuelTotals()" style="font-size:.85rem">\u2715</button></td>`;
  tbody.appendChild(tr);
};

window.autoCalcFuelRow = function (input, field) {
  const row = input.closest('tr');
  const ins = row.querySelectorAll('input');
  const litros = parseFloat(ins[1].value) || 0;
  const preco = parseFloat(ins[2].value) || 0;
  const valor = parseFloat(ins[6].value) || 0;
  if (field === 'litros') {
    if (preco > 0) ins[6].value = (litros * preco).toFixed(2);
    else if (valor > 0 && litros > 0) ins[2].value = (valor / litros).toFixed(2);
  } else if (field === 'preco') {
    if (litros > 0) ins[6].value = (litros * preco).toFixed(2);
    else if (valor > 0 && preco > 0) ins[1].value = (valor / preco).toFixed(2);
  } else if (field === 'valor') {
    if (litros > 0) ins[2].value = (valor / litros).toFixed(2);
    else if (preco > 0 && valor > 0) ins[1].value = (valor / preco).toFixed(2);
  }
  window.updateFuelTotals();
};

window.updateFuelTotals = function () {
  const rows = document.querySelectorAll('#fuelTbody tr');
  let tv = 0, tl = 0;
  rows.forEach(r => {
    const ins = r.querySelectorAll('input');
    tl += parseFloat(ins[1].value || 0);
    tv += parseFloat(ins[6].value || 0);
  });
  document.getElementById('fuelTotalLbl').textContent = 'R$ ' + fmt(tv);
  document.getElementById('fuelLitrosLbl').textContent = tl.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' L';

  const kmIni = parseFloat(document.getElementById('fuelKmInicial').value || 0);
  const kmFin = parseFloat(document.getElementById('fuelKmFinal').value || 0);
  const kmPerc = kmFin > kmIni ? kmFin - kmIni : 0;
  document.getElementById('fuelKmPercLbl').textContent = kmPerc > 0 ? kmPerc.toLocaleString('pt-BR') + ' km' : '\u2014';
  document.getElementById('fuelMediaLbl').textContent = (tl > 0 && kmPerc > 0) ? (kmPerc / tl).toFixed(2) + ' km/L' : '\u2014';
};

function getFuelRows() {
  return Array.from(document.querySelectorAll('#fuelTbody tr')).map(r => {
    const ins = r.querySelectorAll('input');
    return {
      data: ins[0].value,
      litros: parseFloat(ins[1].value) || 0,
      precoLitro: parseFloat(ins[2].value) || 0,
      posto: ins[3].value,
      notaFiscal: ins[4].value,
      km: parseFloat(ins[5].value) || 0,
      valor: parseFloat(ins[6].value) || 0
    };
  }).filter(f => f.litros || f.valor || f.posto);
}

// ==================== DESPESAS ====================

window.buildDespFields = function (vals) {
  const grid = document.getElementById('despGrid');
  grid.innerHTML = DESP.map(dk => `
    <div class="form-group" style="margin-bottom:.45rem">
      <label>${esc(dk.l)}</label>
      <input type="number" id="desp_${dk.k}" placeholder="0,00" step="0.01" value="${vals && vals[dk.k] ? vals[dk.k] : ''}" oninput="updateDespTotal()">
    </div>`).join('');
};

window.updateDespTotal = function () {
  let t = 0;
  DESP.forEach(dk => {
    t += parseFloat(document.getElementById('desp_' + dk.k)?.value || 0);
  });
  document.getElementById('despTotalLbl').textContent = 'R$ ' + fmt(t);
};

function getDespValues() {
  const arr = [];
  DESP.forEach(dk => {
    const v = parseFloat(document.getElementById('desp_' + dk.k)?.value || 0) || 0;
    if (v > 0) {
      arr.push({ categoria: dk.k, valor: v });
    }
  });
  return arr;
}

// ==================== SAVE TRIP ====================

window.saveTrip = async function () {
  const truckId = document.getElementById('trpTruck').value;
  const date = document.getElementById('trpDate').value;
  if (!truckId || !date) { alert('Informe o caminh\u00E3o e a data!'); return; }

  const tripData = {
    truckId,
    dataInicio: date,
    dataFim: document.getElementById('trpDateEnd').value || null,
    origem: document.getElementById('trpOrigin').value.trim(),
    destino: document.getElementById('trpDest').value.trim(),
    carga: document.getElementById('trpCargo').value.trim(),
    km: parseInt(document.getElementById('trpKm').value) || 0,
    status: document.getElementById('trpStatus').value,
    adiantamento: parseFloat(document.getElementById('trpAdto').value) || 0,
    observacoes: document.getElementById('trpObs').value.trim(),
    fuelKmInicial: parseFloat(document.getElementById('fuelKmInicial').value) || 0,
    fuelKmFinal: parseFloat(document.getElementById('fuelKmFinal').value) || 0,
  };

  const ctes = getCteRows();
  const fuels = getFuelRows();
  const expenses = getDespValues();

  const eid = document.getElementById('tripEditId').dataset.id;

  try {
    let savedTrip;

    if (eid) {
      // ---- UPDATE existing trip ----
      savedTrip = await api.patch('/api/trips/' + eid, tripData);
      const tripId = eid;

      // Delete existing CTEs and re-create (simpler than diffing)
      // The backend should handle this, but we send them individually
      if (savedTrip.ctes) {
        for (const c of savedTrip.ctes) {
          await api.delete('/api/ctes/' + c.id);
        }
      }
      for (const c of ctes) {
        await api.post('/api/ctes/trip/' + tripId, c);
      }

      // Delete existing fuels and re-create
      if (savedTrip.fuels) {
        for (const f of savedTrip.fuels) {
          await api.delete('/api/fuels/' + f.id);
        }
      }
      for (const f of fuels) {
        await api.post('/api/fuels/trip/' + tripId, f);
      }

      // Upsert expenses
      await api.put('/api/expenses/trip/' + tripId, expenses);

    } else {
      // ---- CREATE new trip ----
      savedTrip = await api.post('/api/trips/truck/' + truckId, tripData);
      const tripId = savedTrip.id;

      // Create CTEs
      for (const c of ctes) {
        await api.post('/api/ctes/trip/' + tripId, c);
      }

      // Create fuels
      for (const f of fuels) {
        await api.post('/api/fuels/trip/' + tripId, f);
      }

      // Create expenses
      if (expenses.length) {
        await api.put('/api/expenses/trip/' + tripId, expenses);
      }
    }

    setSelectedTruck(truckId);
    window.closeTripModal();
    renderSidebar();
    await renderMain();
  } catch (e) {
    alert('Erro ao salvar viagem: ' + e.message);
  }
};
