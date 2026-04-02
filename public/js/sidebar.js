// sidebar.js — Sidebar truck list

import { api } from './api.js';
import { state, setTrucks, setSelectedTruck } from './state.js';
import { renderMain } from './dashboard.js';
import { esc } from './utils.js';

export async function loadTrucks() {
  const trucks = await api.get('/api/trucks');
  setTrucks(trucks);
  renderSidebar();
}

export function renderSidebar() {
  const el = document.getElementById('truckList');
  if (!state.trucks.length) {
    el.innerHTML = '<div style="padding:.9rem;text-align:center;color:var(--muted);font-size:.74rem">Nenhum caminhão.</div>';
    return;
  }
  el.innerHTML = state.trucks.map(t => {
    const n = t._count?.trips || 0;
    return `<div class="truck-item ${state.selectedTruckId === t.id ? 'active' : ''}" onclick="selectTruck('${esc(t.id)}')">
      <div><div class="truck-plate">${esc(t.placa)}</div><div class="truck-name">${esc(t.modelo || t.motorista || '\u2014')}</div></div>
      ${n ? `<span class="truck-badge">${n}</span>` : ''}
    </div>`;
  }).join('');
}

window.selectTruck = async function (id) {
  setSelectedTruck(id);
  renderSidebar();
  await renderMain();
};
