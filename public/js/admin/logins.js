import { api } from '../api.js';
import { state } from '../state.js';
import { esc } from '../utils.js';

const ACTIONS = ['', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'REFRESH_FAILED'];
const ACTION_ICONS = {
  LOGIN_SUCCESS: '✅',
  LOGIN_FAILED: '❌',
  LOGOUT: '🚪',
  REFRESH_FAILED: '⚠️',
};

export async function renderLogins(container) {
  await load(container);
}

async function load(container) {
  const f = state.adminFilters.logins;
  const qs = new URLSearchParams();
  qs.set('page', f.page);
  qs.set('limit', f.limit);
  if (f.user_id) qs.set('user_id', f.user_id);
  if (f.action)  qs.set('action', f.action);
  try {
    state.adminLoginsPage = await api.get('/api/login-events?' + qs.toString());
  } catch (e) {
    container.innerHTML = `<div style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
    return;
  }
  draw(container);
}

function draw(container) {
  const { items, total, page, totalPages } = state.adminLoginsPage;
  const f = state.adminFilters.logins;
  container.innerHTML = `
    <div style="background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.2);padding:.5rem .75rem;border-radius:5px;font-size:.75rem;color:var(--info);margin-bottom:.6rem">
      Mostrando eventos das últimas 48 horas. Eventos mais antigos são removidos automaticamente.
    </div>
    <div class="admin-filters">
      <div class="form-group" style="width:180px">
        <label>Ação</label>
        <select onchange="loginsFilterChange('action', this.value)">
          ${ACTIONS.map(a => `<option value="${a}" ${f.action === a ? 'selected' : ''}>${a || '(todas)'}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="width:220px">
        <label>Usuário (id)</label><input value="${esc(f.user_id)}" placeholder="UUID" onchange="loginsFilterChange('user_id', this.value)">
      </div>
      <button class="btn btn-ghost btn-sm" onclick="loginsClear()">Limpar</button>
    </div>
    <table class="admin-table">
      <thead><tr><th>Data</th><th>Email</th><th>Ação</th><th>IP</th><th>Navegador</th></tr></thead>
      <tbody>
        ${items.map(it => `
          <tr>
            <td style="font-family:'IBM Plex Mono',monospace;font-size:.7rem">${new Date(it.created_at).toLocaleString('pt-BR')}</td>
            <td>${esc(it.email_attempt)}</td>
            <td>${ACTION_ICONS[it.action] || ''} <span class="action-badge action-${it.action}">${it.action}</span></td>
            <td style="font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--muted)">${esc(it.ip || '—')}</td>
            <td style="font-size:.7rem;color:var(--muted)">${esc((it.user_agent || '').slice(0, 60))}</td>
          </tr>
        `).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem">Nenhum evento</td></tr>`}
      </tbody>
    </table>
    <div class="pagination">
      <button onclick="loginsGoToPage(1)" ${page === 1 ? 'disabled' : ''}>«</button>
      <button onclick="loginsGoToPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>‹</button>
      <span>Pág ${page} de ${totalPages} · ${total} reg</span>
      <button onclick="loginsGoToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>›</button>
      <button onclick="loginsGoToPage(${totalPages})" ${page >= totalPages ? 'disabled' : ''}>»</button>
    </div>
  `;
}

window.loginsFilterChange = function (key, val) {
  state.adminFilters.logins[key] = val;
  state.adminFilters.logins.page = 1;
  load(document.getElementById('adminContent'));
};

window.loginsClear = function () {
  state.adminFilters.logins = { user_id: '', action: '', page: 1, limit: 50 };
  load(document.getElementById('adminContent'));
};

window.loginsGoToPage = function (p) {
  state.adminFilters.logins.page = p;
  load(document.getElementById('adminContent'));
};
