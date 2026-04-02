// trucks.modal.js — Truck form logic

import { api } from './api.js';
import { state, setSelectedTruck } from './state.js';
import { loadTrucks, renderSidebar } from './sidebar.js';
import { renderMain } from './dashboard.js';

let truckEditId = null;

window.openTruckModal = function (editId) {
  document.getElementById('tPlate').value = '';
  document.getElementById('tModel').value = '';
  document.getElementById('tDriver').value = '';
  document.getElementById('platePreview').style.display = 'none';
  truckEditId = editId || null;

  if (editId) {
    const t = state.trucks.find(x => x.id === editId);
    if (t) {
      document.getElementById('tPlate').value = t.placa || '';
      document.getElementById('tModel').value = t.modelo || '';
      document.getElementById('tDriver').value = t.motorista || '';
      updatePlatePreview();
    }
  }
  document.getElementById('truckModal').classList.add('open');
};

window.closeTruckModal = function () {
  document.getElementById('truckModal').classList.remove('open');
};

window.updatePlatePreview = function () {
  const v = document.getElementById('tPlate').value.toUpperCase();
  const p = document.getElementById('platePreview');
  if (v) {
    p.textContent = v;
    p.style.display = 'inline-block';
  } else {
    p.style.display = 'none';
  }
};

window.saveTruck = async function () {
  const placa = document.getElementById('tPlate').value.toUpperCase().trim();
  if (!placa) { alert('Informe a placa!'); return; }
  const modelo = document.getElementById('tModel').value.trim();
  const motorista = document.getElementById('tDriver').value.trim();
  const data = { placa, modelo, motorista };

  try {
    if (truckEditId) {
      await api.patch('/api/trucks/' + truckEditId, data);
    } else {
      await api.post('/api/trucks', data);
    }
    window.closeTruckModal();
    await loadTrucks();
    if (state.selectedTruckId) await renderMain();
  } catch (e) {
    alert('Erro ao salvar caminh\u00E3o: ' + e.message);
  }
};

window.confirmDeleteTruck = function (id) {
  const t = state.trucks.find(x => x.id === id);
  const overlay = document.getElementById('confirmOverlay');
  document.getElementById('confirmMsg').textContent = `Excluir caminh\u00E3o ${t ? t.placa : ''} e todas as suas viagens?`;
  document.getElementById('confirmBtn').onclick = async () => {
    try {
      await api.delete('/api/trucks/' + id);
      overlay.classList.remove('open');
      if (state.selectedTruckId === id) {
        setSelectedTruck(null);
      }
      await loadTrucks();
      // Select first truck if available
      if (state.trucks.length && !state.selectedTruckId) {
        setSelectedTruck(state.trucks[0].id);
        renderSidebar();
      }
      await renderMain();
    } catch (e) {
      alert('Erro ao excluir caminh\u00E3o: ' + e.message);
    }
  };
  overlay.classList.add('open');
};
