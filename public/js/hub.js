// hub.js — Navegação entre Hub / Acerto de Viagem / Frete Terceiro / Admin.
//
// Persistência: a última aba escolhida fica em localStorage('lastTab') e a
// app abre direto nela após o login (skip hub se já houver preferência).

import { getCurrentUser } from './auth.js';

let frotaModulesLoaded = false;
let freteTerceiroLoaded = false;
let veiculosLoaded = false;
let rentabilidadeLoaded = false;
let adminLoaded = false;

/* ---------- VIEWS ---------- */

function hideAll() {
  ['hubView','moduleContainer','freteTerceiroView','veiculosView','rentabilidadeView','adminView'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function setActiveTab(name) {
  document.querySelectorAll('[data-mod-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.modTab === name);
  });
}

function saveLastTab(name) {
  try { localStorage.setItem('lastTab', name); } catch { /* */ }
}

export function showHub() {
  hideAll();
  const hub = document.getElementById('hubView');
  if (hub) hub.style.display = '';
  document.body.dataset.view = 'hub';
  renderHubUser();
  refreshAdminVisibility();
  startHubClock();
  // Não salva como "lastTab" — hub é landing, não aba
}

export async function goToFrota() {
  if (!hasModuleAccess('frota')) {
    alert('Você não tem permissão para acessar Acerto de Viagem.');
    return showHub();
  }
  hideAll();
  const mod = document.getElementById('moduleContainer');
  if (mod) mod.style.display = '';
  document.body.dataset.view = 'frota';
  setActiveTab('frota');
  saveLastTab('frota');
  refreshAdminVisibility();

  if (!frotaModulesLoaded) {
    try {
      const [sidebarMod, dashMod, stateMod] = await Promise.all([
        import('./sidebar.js'),
        import('./dashboard.js'),
        import('./state.js'),
      ]);
      await Promise.all([
        import('./modals.js'),
        import('./trucks.modal.js'),
        import('./trips.modal.js'),
        import('./trips.js'),
        import('./trip-frete-link.js'),
        import('./trip-anexos.js'),
      ]);
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

export async function goToFreteTerceiro() {
  if (!hasModuleAccess('frete-terceiro')) {
    alert('Você não tem permissão para acessar Frete Terceiro.');
    return showHub();
  }
  hideAll();
  const ft = document.getElementById('freteTerceiroView');
  if (ft) ft.style.display = '';
  document.body.dataset.view = 'frete-terceiro';
  setActiveTab('frete-terceiro');
  saveLastTab('frete-terceiro');
  refreshAdminVisibility();
  try {
    const mod = await import('./frete-terceiro.js');
    await mod.initFreteTerceiro();
    freteTerceiroLoaded = true;
  } catch (e) {
    console.error('Erro ao carregar módulo Frete Terceiro:', e);
  }
}

export async function goToVeiculos() {
  if (!hasModuleAccess('veiculos')) {
    alert('Você não tem permissão para acessar Veículos.');
    return showHub();
  }
  hideAll();
  const v = document.getElementById('veiculosView');
  if (v) v.style.display = '';
  document.body.dataset.view = 'veiculos';
  setActiveTab('veiculos');
  saveLastTab('veiculos');
  refreshAdminVisibility();
  try {
    const mod = await import('./veiculos.js');
    await mod.initVeiculos();
    veiculosLoaded = true;
  } catch (e) {
    console.error('Erro ao carregar módulo Veículos:', e);
  }
}

export async function goToRentabilidade() {
  if (!hasModuleAccess('rentabilidade')) {
    alert('Você não tem permissão para acessar Rentabilidade.');
    return showHub();
  }
  hideAll();
  const v = document.getElementById('rentabilidadeView');
  if (v) v.style.display = '';
  document.body.dataset.view = 'rentabilidade';
  setActiveTab('rentabilidade');
  saveLastTab('rentabilidade');
  refreshAdminVisibility();
  try {
    const mod = await import('./rentabilidade.js');
    await mod.initRentabilidade();
    rentabilidadeLoaded = true;
  } catch (e) {
    console.error('Erro ao carregar módulo Rentabilidade:', e);
  }
}

export async function goToAdmin() {
  // Lazy-carrega o módulo admin se for a primeira vez
  if (!adminLoaded) {
    try {
      const mod = await import('./admin/index.js');
      mod.initAdmin();
      adminLoaded = true;
    } catch (e) {
      console.error('Erro ao carregar módulo Admin:', e);
      return;
    }
  }
  hideAll();
  const adm = document.getElementById('adminView');
  if (adm) adm.style.display = '';
  document.body.dataset.view = 'admin';
  setActiveTab(''); // nenhuma tab de módulo fica ativa
  refreshAdminVisibility();
  // Renderiza a aba corrente do admin
  if (window.switchAdminTab) {
    const state = await import('./state.js');
    window.switchAdminTab(state.state.adminTab || 'users');
  }
}

/* ---------- ADMIN BUTTON + PERMISSÕES POR MÓDULO ---------- */

const ALL_MODULES = ['frota', 'frete-terceiro', 'veiculos', 'rentabilidade'];

export function hasModuleAccess(moduleName) {
  const u = getCurrentUser();
  if (!u) return false;
  if (u.role === 'ADMIN') return true;
  // Fallback: se permissoes não veio no payload (ex.: cache antigo, deploy
  // em transição), assume acesso total. Só restringe se for um array
  // explicitamente populado.
  if (!Array.isArray(u.permissoes)) return true;
  return u.permissoes.includes(moduleName);
}

function applyPermissions() {
  for (const mod of ALL_MODULES) {
    const allowed = hasModuleAccess(mod);
    // Tabs nos headers
    document.querySelectorAll(`[data-mod-tab="${mod}"]`).forEach(el => {
      el.style.display = allowed ? '' : 'none';
    });
    // Cards do hub
    document.querySelectorAll(`[data-module="${mod}"]`).forEach(el => {
      el.style.display = allowed ? '' : 'none';
    });
  }
}

function refreshAdminVisibility() {
  const u = getCurrentUser();
  const show = u && u.role === 'ADMIN';
  document.querySelectorAll('.admin-trigger').forEach(b => {
    b.style.display = show ? '' : 'none';
  });
  applyPermissions();
}

// Exposto pro admin (após salvar permissões, atualizar tabs visíveis)
window.refreshPermissions = refreshAdminVisibility;

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

/* ---------- INITIAL ROUTE ---------- */

export async function routeAfterLogin() {
  let last = null;
  try { last = localStorage.getItem('lastTab'); } catch { /* */ }
  refreshAdminVisibility();
  // Só restaura a aba se o usuário ainda tem permissão pra ela
  try {
    if (last === 'frota'          && hasModuleAccess('frota'))          return await goToFrota();
    if (last === 'frete-terceiro' && hasModuleAccess('frete-terceiro')) return await goToFreteTerceiro();
    if (last === 'veiculos'       && hasModuleAccess('veiculos'))       return await goToVeiculos();
    if (last === 'rentabilidade'  && hasModuleAccess('rentabilidade'))  return await goToRentabilidade();
  } catch (e) {
    console.error('Falha ao restaurar última aba; voltando ao hub:', e);
    try { localStorage.removeItem('lastTab'); } catch { /* */ }
  }
  return showHub();
}

/* ---------- WIRE GLOBAL ---------- */

window.goToFrota          = goToFrota;
window.goToFreteTerceiro  = goToFreteTerceiro;
window.goToVeiculos       = goToVeiculos;
window.goToRentabilidade  = goToRentabilidade;
window.goToHub            = showHub;
window.goToAdmin          = goToAdmin;
