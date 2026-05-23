// trip-frete-link.js — Integração FreteTerceiro <-> Viagem no modal de Acerto
//
// Expostas em window:
//   openPullFreteModal()    — abre modal listando fretes em aberto
//   linkFreteToTrip(freteId)
//   unlinkFreteFromTrip(freteId)
//   refreshTripFreteLinked() — re-renderiza badge dentro do modal de viagem

import { api } from './api.js';
import { esc } from './utils.js';

function fmtBRL(n) { return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fmtDate(s) { return s ? new Date(s).toLocaleDateString('pt-BR') : '—'; }

function getEditingTripId() {
  return document.getElementById('tripEditId')?.dataset.id || '';
}
function getCurrentTruckId() {
  return document.getElementById('trpTruck')?.value || '';
}

async function refreshTripFreteLinked() {
  const wrap = document.getElementById('tripFreteLinked');
  if (!wrap) return;
  const tripId = getEditingTripId();
  if (!tripId) {
    wrap.innerHTML = `<div style="color:var(--muted);font-size:.78rem">
      Salve a viagem primeiro e depois puxe o frete retorno, ou vincule pelo
      módulo <a href="#" onclick="event.preventDefault();goToFreteTerceiro()" style="color:var(--accent)">Controle Frete Terceiro</a>.
    </div>`;
    return;
  }
  try {
    const items = await api.get(`/api/fretes-terceiros?trip_id=${encodeURIComponent(tripId)}`);
    if (!items.length) {
      wrap.innerHTML = `<div style="color:var(--muted);font-size:.78rem">Nenhum frete terceiro vinculado ainda.</div>`;
      return;
    }
    wrap.innerHTML = items.map(f => `
      <div class="trip-frete-linked">
        <div style="flex:1;min-width:0">
          <div><b>${esc(f.empresa_pagadora)}</b></div>
          <div class="meta">${fmtDate(f.data)} · ${esc(f.motorista)} · ${esc(f.veiculo)} · ${esc(f.status)}</div>
        </div>
        <div class="valor">${fmtBRL(f.valor_total)}</div>
        <button class="btn btn-ghost btn-sm" onclick="unlinkFreteFromTrip('${esc(f.id)}')">Desvincular</button>
      </div>
    `).join('');
  } catch (e) {
    wrap.innerHTML = `<div style="color:var(--danger);font-size:.78rem">Erro: ${esc(e.message)}</div>`;
  }
}

window.openPullFreteModal = async function () {
  const tripId = getEditingTripId();
  if (!tripId) {
    alert('Salve a viagem primeiro (qualquer campo já vale) para poder vincular o frete retorno.');
    return;
  }
  document.getElementById('tripPullFreteModal').classList.add('open');
  const list = document.getElementById('tripPullFreteList');
  list.innerHTML = `<div class="ft-loading">Carregando fretes disponíveis…</div>`;
  try {
    const truckId = getCurrentTruckId();
    // Busca todos os abertos sem vínculo (trip_id=null) — depois reordena pelo caminhão
    const params = new URLSearchParams({ status: 'ABERTO', trip_id: 'null', limit: '200' });
    const all = await api.get(`/api/fretes-terceiros?${params.toString()}`);
    const parcial = await api.get(`/api/fretes-terceiros?status=PAGO_PARCIAL&trip_id=null&limit=200`);
    const items = [...all, ...parcial];

    if (!items.length) {
      list.innerHTML = `<div class="ft-empty">Nenhum frete em aberto sem viagem vinculada.</div>`;
      return;
    }

    items.sort((a, b) => {
      const aMatch = a.truck_id === truckId ? -1 : 0;
      const bMatch = b.truck_id === truckId ? -1 : 0;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return new Date(b.data) - new Date(a.data);
    });

    list.innerHTML = items.map(f => {
      const match = f.truck_id === truckId;
      return `<div class="ft-pull-item" onclick="linkFreteToTrip('${esc(f.id)}')">
        <div class="info">
          <div class="title">${esc(f.empresa_pagadora)} ${match ? '<span class="ft-trip-badge">MESMO CAMINHÃO</span>' : ''}</div>
          <div class="meta">${fmtDate(f.data)} · ${esc(f.motorista)} · ${esc(f.veiculo)} · ${esc(f.status)}</div>
        </div>
        <div class="valor">${fmtBRL(f.valor_total)}</div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div class="ft-empty" style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
  }
};

window.linkFreteToTrip = async function (freteId) {
  const tripId = getEditingTripId();
  if (!tripId) { alert('Salve a viagem primeiro.'); return; }
  try {
    await api.post(`/api/fretes-terceiros/${freteId}/link-trip`, { trip_id: tripId });
    document.getElementById('tripPullFreteModal').classList.remove('open');
    await refreshTripFreteLinked();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
};

window.unlinkFreteFromTrip = async function (freteId) {
  if (!confirm('Desvincular este frete terceiro da viagem? O frete continua existindo no Controle Frete Terceiro.')) return;
  try {
    await api.post(`/api/fretes-terceiros/${freteId}/unlink-trip`, {});
    await refreshTripFreteLinked();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
};

window.refreshTripFreteLinked = refreshTripFreteLinked;

// Auto-refresh quando o modal de viagem abre (observa class 'open' no tripModal)
const tripModal = document.getElementById('tripModal');
if (tripModal) {
  const obs = new MutationObserver(() => {
    if (tripModal.classList.contains('open')) refreshTripFreteLinked();
  });
  obs.observe(tripModal, { attributes: true, attributeFilter: ['class'] });
}
