// trips.modal.js — mini-modal para CRIAR viagem (caminhão + data inicial).
// A edição é toda inline no card via buildDetail() em trips.js — sem modal.

import { api } from './api.js';
import { state, setSelectedTruck } from './state.js';
import { esc } from './utils.js';
import { renderSidebar } from './sidebar.js';
import { renderMain } from './dashboard.js';

window.openTripModal = function (preTruckId) {
  const sel = document.getElementById('newTripTruck');
  sel.innerHTML = state.trucks.map(t =>
    `<option value="${esc(t.id)}">${esc(t.placa)}${t.modelo ? ' — ' + esc(t.modelo) : ''}</option>`
  ).join('');

  if (preTruckId) sel.value = preTruckId;
  else if (state.selectedTruckId) sel.value = state.selectedTruckId;

  document.getElementById('newTripDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('newTripModal').classList.add('open');
};

window.closeNewTripModal = function () {
  document.getElementById('newTripModal').classList.remove('open');
};

window.saveNewTrip = async function () {
  const truckId = document.getElementById('newTripTruck').value;
  const date = document.getElementById('newTripDate').value;
  if (!truckId || !date) { alert('Informe o caminhão e a data!'); return; }

  const btn = document.querySelector('#newTripModal .btn-accent');
  const original = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }

  try {
    const created = await api.post('/api/trips/truck/' + truckId, {
      data_inicio: date,
    });
    setSelectedTruck(truckId);
    window.closeNewTripModal();
    renderSidebar();
    await renderMain();

    // Auto-expande o card recém-criado pro usuário editar inline
    setTimeout(() => {
      const det = document.getElementById('detail_' + created.id);
      if (det) det.classList.add('open');
    }, 50);
  } catch (e) {
    alert('Erro ao criar viagem: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
};
