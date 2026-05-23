// hub.js — Navegação do HUB Acompanhamento Frota
//
// Controla as 3 views pós-login:
//   #hubView            — landing page (default após login)
//   #moduleContainer    — Acerto de Frota + Admin (estrutura legada)
//   #freteTerceiroView  — Controle de Frete Terceiro (placeholder)

import { getCurrentUser } from './auth.js';

let frotaModulesLoaded = false;

/* ---------- VIEWS ---------- */

function hideAll() {
  const hub = document.getElementById('hubView');
  const mod = document.getElementById('moduleContainer');
  const ft  = document.getElementById('freteTerceiroView');
  if (hub) hub.style.display = 'none';
  if (mod) mod.style.display = 'none';
  if (ft)  ft.style.display  = 'none';
}

export function showHub() {
  hideAll();
  const hub = document.getElementById('hubView');
  if (hub) hub.style.display = '';
  document.body.dataset.view = 'hub';
  renderHubUser();
  startHubClock();
}

export async function goToFrota() {
  hideAll();
  const mod = document.getElementById('moduleContainer');
  if (mod) mod.style.display = '';
  document.body.dataset.view = 'frota';

  if (!frotaModulesLoaded) {
    try {
      const [sidebarMod, dashMod, stateMod, adminMod] = await Promise.all([
        import('./sidebar.js'),
        import('./dashboard.js'),
        import('./state.js'),
        import('./admin/index.js'),
      ]);
      await Promise.all([
        import('./modals.js'),
        import('./trucks.modal.js'),
        import('./trips.modal.js'),
        import('./trips.js'),
      ]);
      adminMod.initAdmin();
      await sidebarMod.loadTrucks();
      if (stateMod.state.trucks.length) {
        stateMod.setSelectedTruck(stateMod.state.trucks[0].id);
        sidebarMod.renderSidebar();
        await dashMod.renderMain();
      }
      frotaModulesLoaded = true;
    } catch (e) {
      console.error('Erro ao carregar módulos de frota:', e);
    }
  }
}

export function goToFreteTerceiro() {
  hideAll();
  const ft = document.getElementById('freteTerceiroView');
  if (ft) ft.style.display = '';
  document.body.dataset.view = 'frete-terceiro';
}

/* ---------- HEADER UI ---------- */

function renderHubUser() {
  const u = getCurrentUser();
  const el = document.getElementById('hubUserInfo');
  if (el && u) el.textContent = `${u.nome} · ${u.role}`;
}

/* ---------- LIVE CLOCK ---------- */

let clockTimer = null;
function startHubClock() {
  const tick = () => {
    const el = document.getElementById('hubTime');
    const dateEl = document.getElementById('hubDateLabel');
    if (!el && !dateEl) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    if (el) el.textContent = `${hh}:${mm}:${ss}`;
    if (dateEl) {
      const dd = String(now.getDate()).padStart(2, '0');
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const yy = now.getFullYear();
      dateEl.textContent = `${dd}.${mo}.${yy}`;
    }
  };
  tick();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(tick, 1000);
}

/* ---------- WIRE GLOBAL ---------- */

window.goToFrota = goToFrota;
window.goToFreteTerceiro = goToFreteTerceiro;
window.goToHub = showHub;
