// auth.js — Login/logout UI and token management

import { api, setToken } from './api.js';
import { applyBranding } from './branding.js';

let currentUser = null;

export function getCurrentUser() { return currentUser; }

export async function login(email, senha) {
  const data = await api.post('/api/auth/login', { email, senha });
  setToken(data.accessToken);
  currentUser = data.user;
  applyBranding(currentUser.empresa);
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
    applyBranding(currentUser.empresa);
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
  const banner = document.getElementById('impersonationBanner');
  if (banner && currentUser?.realUser) {
    banner.style.display = '';
    document.getElementById('impersonationEmpresa').textContent = currentUser.empresa?.nome || 'outra empresa';
  }
}

window.sairImpersonacao = async function () {
  const data = await api.post('/api/auth/sair-impersonacao', {});
  setToken(data.accessToken);
  location.reload();
};

// doLogin and doLogout are registered in app.js to avoid circular issues
