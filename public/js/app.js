// app.js — Entry point
// Login is loaded first and independently so it always works
// Other modules load after successful authentication

import { checkAuth, showLoginScreen, showApp, login } from './auth.js';

// Theme toggle (light/dark) — pre-applied inline in <head> to avoid FOUC
function updateThemeIcon() {
  const t = document.documentElement.getAttribute('data-theme') || 'dark';
  const icon = t === 'dark' ? '🌙' : '☀️';
  document.querySelectorAll('[data-theme-toggle]').forEach(b => b.textContent = icon);
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
  let hubMod = null;
  try {
    // Carrega navegação, atalhos, modais e o controle de visibilidade do
    // botão Admin (presente em todos os headers).
    const [h, adminMod] = await Promise.all([
      import('./hub.js'),
      import('./admin/index.js'),
      import('./keyboard-shortcuts.js'),
      import('./modals.js'),
    ]);
    hubMod = h;
    try { adminMod.initAdmin(); } catch (e) { console.error('initAdmin error:', e); }
    try { await hubMod.routeAfterLogin(); }
    catch (e) {
      console.error('routeAfterLogin error:', e);
      // Fallback explícito: mostra o hub se a rota falhar
      try { hubMod.showHub(); } catch { /* */ }
    }
  } catch (e) {
    console.error('Erro ao carregar app:', e);
    // Último recurso: tenta mostrar o hub ainda que o resto falhe
    if (hubMod && hubMod.showHub) {
      try { hubMod.showHub(); } catch { /* */ }
    } else {
      const hub = document.getElementById('hubView');
      if (hub) hub.style.display = '';
    }
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
