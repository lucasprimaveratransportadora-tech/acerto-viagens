import { state } from '../state.js';
import { getCurrentUser } from '../auth.js';
import { renderUsers } from './users.js';
import { renderAudit } from './audit.js';
import { renderLogins } from './logins.js';

export function initAdmin() {
  const user = getCurrentUser();
  const btn = document.getElementById('adminBtn');
  if (!btn) return;
  btn.style.display = user?.role === 'ADMIN' ? '' : 'none';
}

window.toggleAdmin = function () {
  state.adminView = !state.adminView;
  const frota = document.getElementById('frotaContainer');
  const admin = document.getElementById('adminView');
  const truckBtn = document.getElementById('hdrTruckBtn');
  const tripBtn = document.getElementById('hdrTripBtn');
  if (state.adminView) {
    frota.style.display = 'none';
    admin.style.display = 'block';
    if (truckBtn) truckBtn.style.display = 'none';
    if (tripBtn) tripBtn.style.display = 'none';
    renderCurrentTab();
  } else {
    frota.style.display = '';
    admin.style.display = 'none';
    if (truckBtn) truckBtn.style.display = '';
    if (tripBtn) tripBtn.style.display = '';
  }
};

window.switchAdminTab = function (tab) {
  state.adminTab = tab;
  document.querySelectorAll('.admin-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  renderCurrentTab();
};

function renderCurrentTab() {
  const container = document.getElementById('adminContent');
  if (!container) return;
  container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando...</div>';
  if (state.adminTab === 'users') renderUsers(container);
  else if (state.adminTab === 'audit') renderAudit(container);
  else if (state.adminTab === 'logins') renderLogins(container);
}
