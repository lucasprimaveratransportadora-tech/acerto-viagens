import { api } from '../api.js';
import { state } from '../state.js';
import { esc } from '../utils.js';
import { summarize, renderDiff } from './diff-renderer.js';

const ENTITIES = ['', 'TRIP', 'CTE', 'FUEL', 'EXPENSE', 'USER', 'TRUCK'];
const ACTIONS = ['', 'CREATE', 'UPDATE', 'DELETE'];

export async function renderAudit(container) {
  await load(container);
}

async function load(container) {
  const f = state.adminFilters.audit;
  const qs = new URLSearchParams();
  qs.set('page', f.page);
  qs.set('limit', f.limit);
  if (f.entity)    qs.set('entity', f.entity);
  if (f.entity_id) qs.set('entity_id', f.entity_id);
  if (f.actor_id)  qs.set('actor_id', f.actor_id);
  if (f.action)    qs.set('action', f.action);
  if (f.from)      qs.set('from', f.from);
  if (f.to)        qs.set('to', f.to);
  try {
    state.adminAuditPage = await api.get('/api/audit?' + qs.toString());
  } catch (e) {
    container.innerHTML = `<div style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
    return;
  }
  draw(container);
}

function draw(container) {
  const { items, total, page, totalPages } = state.adminAuditPage;
  const f = state.adminFilters.audit;
  container.innerHTML = `
    <div class="admin-filters">
      <div class="form-group" style="width:140px">
        <label>Entidade</label>
        <select onchange="auditFilterChange('entity', this.value)">
          ${ENTITIES.map(e => `<option value="${e}" ${f.entity === e ? 'selected' : ''}>${e || '(todas)'}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="width:140px">
        <label>Ação</label>
        <select onchange="auditFilterChange('action', this.value)">
          ${ACTIONS.map(a => `<option value="${a}" ${f.action === a ? 'selected' : ''}>${a || '(todas)'}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="width:150px">
        <label>De</label><input type="date" value="${esc(f.from)}" onchange="auditFilterChange('from', this.value)">
      </div>
      <div class="form-group" style="width:150px">
        <label>Até</label><input type="date" value="${esc(f.to)}" onchange="auditFilterChange('to', this.value)">
      </div>
      <div class="form-group" style="width:220px">
        <label>Usuário (id)</label><input value="${esc(f.actor_id)}" placeholder="UUID" onchange="auditFilterChange('actor_id', this.value)">
      </div>
      <button class="btn btn-ghost btn-sm" onclick="auditClearFilters()">Limpar</button>
    </div>
    <table class="admin-table">
      <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Resumo</th><th></th></tr></thead>
      <tbody>
        ${items.map((it, idx) => `
          <tr>
            <td style="font-family:'IBM Plex Mono',monospace;font-size:.7rem">${new Date(it.created_at).toLocaleString('pt-BR')}</td>
            <td>${esc(it.actor?.nome || it.actor_email || '—')}</td>
            <td><span class="action-badge action-${it.action}">${it.action}</span></td>
            <td><code style="font-size:.7rem">${it.entity_type}</code></td>
            <td style="font-size:.75rem;color:var(--muted)">${esc(summarize(it))}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="auditShowDetail(${idx})">Ver</button></td>
          </tr>
        `).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem">Nenhum evento</td></tr>`}
      </tbody>
    </table>
    <div class="pagination">
      <button onclick="auditGoToPage(1)" ${page === 1 ? 'disabled' : ''}>«</button>
      <button onclick="auditGoToPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>‹</button>
      <span>Pág ${page} de ${totalPages} · ${total} reg</span>
      <button onclick="auditGoToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>›</button>
      <button onclick="auditGoToPage(${totalPages})" ${page >= totalPages ? 'disabled' : ''}>»</button>
    </div>
  `;
}

window.auditFilterChange = function (key, val) {
  state.adminFilters.audit[key] = val;
  state.adminFilters.audit.page = 1;
  load(document.getElementById('adminContent'));
};

window.auditClearFilters = function () {
  state.adminFilters.audit = { entity: '', entity_id: '', actor_id: '', action: '', from: '', to: '', page: 1, limit: 50 };
  load(document.getElementById('adminContent'));
};

window.auditGoToPage = function (p) {
  state.adminFilters.audit.page = p;
  load(document.getElementById('adminContent'));
};

window.auditShowDetail = function (idx) {
  const it = state.adminAuditPage.items[idx];
  if (!it) return;
  const html = `
    <div class="modal-overlay" id="auditDetailModal" style="display:flex">
      <div class="modal" style="width:780px;max-width:95vw">
        <div class="modal-title">${it.entity_type} ${it.action} · ${new Date(it.created_at).toLocaleString('pt-BR')}</div>
        <div style="font-size:.75rem;color:var(--muted);margin-bottom:.6rem">
          Por <strong>${esc(it.actor?.nome || it.actor_email)}</strong>
          ${it.ip ? ` · IP ${esc(it.ip)}` : ''}
          ${it.user_agent ? ` · ${esc((it.user_agent || '').slice(0,80))}` : ''}
        </div>
        ${renderDiff(it)}
        <div class="modal-actions">
          <button class="btn btn-accent" onclick="document.getElementById('auditDetailModal').remove()">Fechar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};
