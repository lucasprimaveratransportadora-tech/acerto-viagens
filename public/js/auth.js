// auth.js — Login/logout UI and token management

import { api, setToken } from './api.js';

let currentUser = null;

export function getCurrentUser() { return currentUser; }

export async function login(email, senha) {
  const data = await api.post('/api/auth/login', { email, senha });
  setToken(data.accessToken);
  currentUser = data.user;
  return data.user;
}

export async function logout() {
  try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
  setToken(null);
  currentUser = null;
  showLoginScreen();
}

export async function checkAuth() {
  try {
    const data = await api.get('/api/auth/me');
    currentUser = data.user;
    return true;
  } catch {
    setToken(null);
    currentUser = null;
    return false;
  }
}

export function showLoginScreen() {
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
}

export function showApp() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('appContainer').style.display = '';
  const userInfo = document.getElementById('userInfo');
  if (userInfo && currentUser) {
    userInfo.textContent = `${currentUser.nome} (${currentUser.role})`;
  }
}

// Expose to window for onclick
window.doLogin = async function () {
  const email = document.getElementById('loginEmail').value;
  const senha = document.getElementById('loginSenha').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    await login(email, senha);
    showApp();
    // Trigger app init
    window.dispatchEvent(new Event('authenticated'));
  } catch (e) {
    errEl.textContent = e.message;
  }
};

window.doLogout = function () { logout(); };
