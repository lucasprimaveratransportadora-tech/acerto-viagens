// app.js — Entry point
// Login is loaded first and independently so it always works
// Other modules load after successful authentication

import { checkAuth, showLoginScreen, showApp, login } from './auth.js';

// Theme toggle (light/dark) — pre-applied inline in <head> to avoid FOUC
function updateThemeIcon() {
  const t = document.documentElement.getAttribute('data-theme') || 'dark';
  const icon = t === 'dark' ? '🌙' : '☀️';
  const btn = document.getElementById('themeBtn');
  const btnLogin = document.getElementById('themeBtnLogin');
  if (btn) btn.textContent = icon;
  if (btnLogin) btnLogin.textContent = icon;
}

window.toggleTheme = function () {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon();
};

updateThemeIcon();

// Expose login immediately (before other modules load)
window.doLogin = async function () {
  const email = document.getElementById('loginEmail').value;
  const senha = document.getElementById('loginSenha').value;
  const errEl = document.getElementById('loginError');
  const btn = document.querySelector('#loginOverlay .btn-accent');
  errEl.textContent = '';

  if (!email || !senha) {
    errEl.textContent = 'Preencha email e senha.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Entrando...';

  try {
    await login(email, senha);
    showApp();
    await loadAppModules();
  } catch (e) {
    errEl.textContent = e.message || 'Erro ao fazer login.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
};

window.doLogout = async function () {
  const { logout } = await import('./auth.js');
  logout();
};

async function loadAppModules() {
  try {
    const [sidebarMod, dashMod, stateMod, adminMod] = await Promise.all([
      import('./sidebar.js'),
      import('./dashboard.js'),
      import('./state.js'),
      import('./admin/index.js'),
    ]);
    // Load UI modules (they register window functions)
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
  } catch (e) {
    console.error('Erro ao carregar módulos:', e);
  }
}

// On page load: check if already authenticated
async function init() {
  try {
    const isAuth = await checkAuth();
    if (!isAuth) {
      showLoginScreen();
      return;
    }
    showApp();
    await loadAppModules();
  } catch (e) {
    console.error('Init error:', e);
    showLoginScreen();
  }
}

init();
