// app.js — Entry point
// Login is loaded first and independently so it always works
// Other modules load after successful authentication

import { checkAuth, showLoginScreen, showApp, login } from './auth.js';

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
    const [sidebarMod, dashMod, stateMod] = await Promise.all([
      import('./sidebar.js'),
      import('./dashboard.js'),
      import('./state.js'),
    ]);
    // Load UI modules (they register window functions)
    await Promise.all([
      import('./modals.js'),
      import('./trucks.modal.js'),
      import('./trips.modal.js'),
      import('./trips.js'),
    ]);

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
