// dashboard.js — Main dashboard rendering

import { api } from './api.js';
import { state, setTrips, getSelectedTruck } from './state.js';
import { fmt, fmtD, esc, calcFrete, calcDesp } from './utils.js';
import { buildDetail } from './trips.js';

export async function renderMain() {
  const main = document.getElementById('mainContent');
  if (!state.selectedTruckId) return;

  const truck = getSelectedTruck();
  if (!truck) return;

  // Fetch trips from API
  try {
    const trips = await api.get('/api/trucks/' + truck.id + '/trips');
    setTrips(trips);
  } catch (e) {
    main.innerHTML = `<div class="empty-state"><div class="empty-icon">&#x26A0;&#xFE0F;</div><h3>Erro</h3><p>${esc(e.message)}</p></div>`;
    return;
  }

  const trips = state.trips;

  let totF = 0, totD = 0, totKm = 0, totL = 0;
  trips.forEach(tr => {
    totF += calcFrete(tr);
    totD += calcDesp(tr);
    totKm += parseInt(tr.km || 0);
    (tr.fuels || []).forEach(f => totL += parseFloat(f.litros || 0));
  });

  // Group by month
  const byM = {};
  trips.forEach(tr => {
    const d = new Date((tr.dataInicio || tr.date || '2000-01-01') + 'T12:00:00');
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byM[k]) byM[k] = [];
    byM[k].push(tr);
  });
  const months = Object.keys(byM).sort().reverse();

  let html = `
  <div class="page-header">
    <div>
      <div class="page-title">${esc(truck.placa)}</div>
      <div class="page-subtitle">${truck.modelo ? esc(truck.modelo) + ' \u00B7 ' : ''}${truck.motorista ? 'Motorista: ' + esc(truck.motorista) : ''}</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-ghost btn-sm" onclick="openTruckModal('${esc(truck.id)}')">&#x270F;&#xFE0F; Editar</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="confirmDeleteTruck('${esc(truck.id)}')">&#x1F5D1;&#xFE0F;</button>
      <button class="btn btn-accent" onclick="openTripModal('${esc(truck.id)}')">+ Nova Viagem</button>
    </div>
  </div>
  <div class="kpi-row">
    <div class="kpi-card"><div class="kpi-label">Viagens</div><div class="kpi-value">${trips.length}</div></div>
    <div class="kpi-card"><div class="kpi-label">Frete Total</div><div class="kpi-value" style="color:var(--success)">R$${fmt(totF)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Despesas</div><div class="kpi-value" style="color:var(--danger)">R$${fmt(totD)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Resultado</div><div class="kpi-value" style="color:${totF - totD >= 0 ? 'var(--success)' : 'var(--danger)'}">R$${fmt(totF - totD)}</div></div>
    <div class="kpi-card"><div class="kpi-label">KM</div><div class="kpi-value">${totKm.toLocaleString('pt-BR')}</div></div>
    <div class="kpi-card"><div class="kpi-label">Combust\u00EDvel</div><div class="kpi-value" style="font-size:1.3rem">${totL.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}L</div></div>
  </div>`;

  if (!months.length) {
    html += `<div class="empty-state"><div class="empty-icon">&#x1F4CB;</div><h3>Sem Viagens</h3><p>Nenhuma viagem registrada.</p></div>`;
  } else {
    months.forEach(mk => {
      const mTrips = byM[mk].sort((a, b) => (b.dataInicio || b.date || '').localeCompare(a.dataInicio || a.date || ''));
      const [yr, mo] = mk.split('-');
      const mName = new Date(+yr, +mo - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const mF = mTrips.reduce((s, t) => s + calcFrete(t), 0);
      const mD = mTrips.reduce((s, t) => s + calcDesp(t), 0);
      const mL = mF - mD;

      html += `<div class="month-block" id="mb_${mk}">
        <div class="month-hdr" onclick="toggleMonth('${mk}')">
          <div class="month-label"><span class="collapse-icon">&#x25BC;</span> ${esc(mName.toUpperCase())}</div>
          <div class="month-stats">
            <div>${mTrips.length} viagem(ns)</div>
            <div>Frete:<span> R$${fmt(mF)}</span></div>
            <div>Desp:<span style="color:var(--danger)"> R$${fmt(mD)}</span></div>
            <div>Liq:<span style="color:${mL >= 0 ? 'var(--success)' : 'var(--danger)'}"> R$${fmt(mL)}</span></div>
          </div>
        </div>
        <div id="mtable_${mk}">`;

      mTrips.forEach(tr => {
        const f = calcFrete(tr), d = calcDesp(tr), l = f - d;
        const dateField = tr.dataInicio || tr.date || '';
        const sm = {
          ok: ['status-ok', '&#x2705; Conclu\u00EDda'],
          pend: ['status-pend', '&#x23F3; Pendente'],
          canc: ['status-canc', '&#x274C; Cancelada'],
        };
        const [sc, sl] = sm[tr.status] || sm.ok;

        html += `<div class="trip-card">
          <div class="trip-header" onclick="toggleTrip('${esc(tr.id)}')">
            <span class="trip-date">${fmtD(dateField)}</span>
            <span class="trip-route">${esc(tr.origem || tr.origin || '\u2014')} <span class="route-arrow">\u2192</span> ${esc(tr.destino || tr.dest || '\u2014')}${tr.carga || tr.cargo ? `<span class="cargo-tag">${esc(tr.carga || tr.cargo)}</span>` : ''}</span>
            <div class="trip-nums">
              <span class="val pos">R$ ${fmt(f)}</span>
              <span class="val neg">- R$ ${fmt(d)}</span>
              <span class="val ${l >= 0 ? 'pos' : 'neg'}">${l >= 0 ? '=' : ''} R$ ${fmt(l)}</span>
              ${tr.km ? `<span style="color:var(--muted);font-size:.7rem">${parseInt(tr.km).toLocaleString('pt-BR')}km</span>` : ''}
            </div>
            <span class="status-badge ${sc}">${sl}</span>
            <div class="trip-actions">
              <button class="action-btn" onclick="event.stopPropagation();editTrip('${esc(tr.id)}')" title="Editar">&#x270F;&#xFE0F;</button>
              <button class="action-btn del" onclick="event.stopPropagation();confirmDeleteTrip('${esc(tr.id)}')" title="Excluir">&#x1F5D1;&#xFE0F;</button>
            </div>
          </div>
          <div class="trip-detail" id="detail_${esc(tr.id)}">${buildDetail(tr)}</div>
        </div>`;
      });

      html += `</div></div>`;
    });
  }

  main.innerHTML = html;
}

// Toggle helpers
window.toggleTrip = function (id) {
  document.getElementById('detail_' + id).classList.toggle('open');
};

window.toggleMonth = function (key) {
  const el = document.getElementById('mtable_' + key);
  const block = document.getElementById('mb_' + key);
  const hidden = el.style.display === 'none';
  el.style.display = hidden ? '' : 'none';
  block.querySelector('.month-hdr').classList.toggle('collapsed', !hidden);
};

// Confirm delete trip
window.confirmDeleteTrip = function (id) {
  const overlay = document.getElementById('confirmOverlay');
  document.getElementById('confirmMsg').textContent = 'Excluir esta viagem?';
  document.getElementById('confirmBtn').onclick = async () => {
    try {
      await api.delete('/api/trips/' + id);
      overlay.classList.remove('open');
      await renderMain();
    } catch (e) {
      alert('Erro ao excluir viagem: ' + e.message);
    }
  };
  overlay.classList.add('open');
};

window.closeConfirm = function () {
  document.getElementById('confirmOverlay').classList.remove('open');
};
