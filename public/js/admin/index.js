import { state } from '../state.js';
import { getCurrentUser } from '../auth.js';
import { renderUsers } from './users.js';
import { renderAudit } from './audit.js';
import { renderLogins } from './logins.js';
import { renderEmpresas } from './empresas.js';

// Mostra/oculta os botões "Admin" presentes em todos os headers
// (class="admin-trigger") baseado na role do usuário.
export function initAdmin() {
  const user = getCurrentUser();
  const show = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  document.querySelectorAll('.admin-trigger').forEach(b => {
    b.style.display = show ? '' : 'none';
  });
  const empresasTab = document.getElementById('adminEmpresasTab');
  if (empresasTab) empresasTab.style.display = user?.role === 'SUPER_ADMIN' ? '' : 'none';
  if (user?.role === 'SUPER_ADMIN' && state.adminTab === 'users') state.adminTab = 'empresas';
}

// Alias legado: toggleAdmin agora navega via goToAdmin/goToHub.
window.toggleAdmin = function () {
  if (document.body.dataset.view === 'admin') {
    if (window.goToHub) window.goToHub();
  } else {
    if (window.goToAdmin) window.goToAdmin();
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
  if (state.adminTab === 'users')       renderUsers(container);
  else if (state.adminTab === 'empresas') renderEmpresas(container);
  else if (state.adminTab === 'audit')  renderAudit(container);
  else if (state.adminTab === 'logins') renderLogins(container);
}
