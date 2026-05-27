// controle-viagens.js — Painel Kanban operacional v2.
// Board: cards arrastáveis, sort por coluna, busca global, polling 20s.
// Modal + viagens + activity ficam em arquivos próprios.

import { api } from './api.js';
import { esc } from './utils.js';
import * as modal from './controle-viagens.modal.js';
import * as viagensPane from './controle-viagens.viagens.js';
import * as activityPane from './controle-viagens.activity.js';

const COLUMNS = [
  { key: 'VAZIO_AGUARDANDO_CARGA',   label: 'Vazio aguardando carga',  color: 'var(--cv-col-vazio)' },
  { key: 'INDO_CARREGAR',            label: 'Indo carregar',           color: 'var(--cv-col-indo)' },
  { key: 'NA_FABRICA',               label: 'Na fábrica',              color: 'var(--cv-col-fabrica)' },
  { key: 'CARREGADO_EM_VIAGEM',      label: 'Carregado em viagem',     color: 'var(--cv-col-carregado)' },
  { key: 'EM_DESCARGA_NO_CLIENTE',   label: 'Em descarga no cliente',  color: 'var(--cv-col-descarga)' },
  { key: 'EM_MANUTENCAO',            label: 'Em manutenção',           color: 'var(--cv-col-manutencao)' },
];

const SORT_OPTIONS = [
  { key: 'default',          label: 'Padrão (placa)' },
  { key: 'coleta_asc',       label: 'Coleta ↑' },
  { key: 'coleta_desc',      label: 'Coleta ↓' },
  { key: 'agend_asc',        label: 'Agendamento ↑' },
  { key: 'agend_desc',       label: 'Agendamento ↓' },
];

const POLL_INTERVAL_MS = 20_000;

const state = {
  rows: [],
  fingerprint: null,
  query: '',
  sorts: loadSorts(),
  pollTimer: null,
  initialized: false,
  visibilityHandler: null,
  lastSeen: loadLastSeen(),
};

function loadSorts() {
  try { return JSON.parse(localStorage.getItem('cv_sorts') || '{}'); } catch { return {}; }
}
function saveSorts() {
  try { localStorage.setItem('cv_sorts', JSON.stringify(state.sorts)); } catch {}
}
function loadLastSeen() {
  try { return JSON.parse(localStorage.getItem('cv_last_seen') || '{}'); } catch { return {}; }
}
function saveLastSeen() {
  try { localStorage.setItem('cv_last_seen', JSON.stringify(state.lastSeen)); } catch {}
}
function markSeen(truckId) {
  state.lastSeen[truckId] = new Date().toISOString();
  saveLastSeen();
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s); if (isNaN(d)) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}
function fmtTime(s) {
  if (!s) return '';
  const d = new Date(s); if (isNaN(d)) return '';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function fetchBoard() {
  try {
    const resp = await api.get('/api/controle-viagens/board');
    if (state.fingerprint === resp.fingerprint) {
      updateRefreshInfo();
      return;
    }
    state.rows = resp.board;
    state.fingerprint = resp.fingerprint;
    renderBoard();
    updateRefreshInfo();
  } catch (e) {
    console.error('[cv] fetchBoard:', e);
    const el = document.getElementById('cvBoard');
    if (el) el.innerHTML = `<div class="cv-loading" style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
  }
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    if (!document.hidden) fetchBoard();
  }, POLL_INTERVAL_MS);
}
function stopPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
}
function updateRefreshInfo() {
  const el = document.getElementById('cvRefreshInfo');
  if (!el) return;
  const now = new Date();
  el.textContent = `última ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  el.classList.toggle('paused', document.hidden);
}

function matchesQuery(row, q) {
  const t = row.truck;
  const v = row.viagem_em_curso || {};
  const c = row.column || {};
  return (
    (t.placa || '').toLowerCase().includes(q) ||
    (t.motorista || '').toLowerCase().includes(q) ||
    (t.modelo || '').toLowerCase().includes(q) ||
    (v.origem || '').toLowerCase().includes(q) ||
    (v.destino || '').toLowerCase().includes(q) ||
    (v.carga_descricao || '').toLowerCase().includes(q) ||
    (v.fabrica || '').toLowerCase().includes(q) ||
    (v.cliente_descarga || '').toLowerCase().includes(q) ||
    (c.descricao_geral || '').toLowerCase().includes(q) ||
    (c.manutencao_descricao || '').toLowerCase().includes(q)
  );
}

function filteredRows() {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.rows;
  return state.rows.filter(r => matchesQuery(r, q));
}

function sortRows(rows, sortKey) {
  if (!sortKey || sortKey === 'default') {
    return [...rows].sort((a, b) => (a.truck.placa || '').localeCompare(b.truck.placa || ''));
  }
  const dir = sortKey.endsWith('_asc') ? 1 : -1;
  const field = sortKey.startsWith('coleta') ? 'data_coleta' : 'data_agendamento_entrega';
  return [...rows].sort((a, b) => {
    const av = a.viagem_em_curso?.[field];
    const bv = b.viagem_em_curso?.[field];
    if (!av && !bv) return 0;
    if (!av) return 1;  // sem data fica no fim
    if (!bv) return -1;
    return (new Date(av) - new Date(bv)) * dir;
  });
}

function renderBoard() {
  const board = document.getElementById('cvBoard');
  const rows = filteredRows();
  document.getElementById('cvTotal').textContent =
    `${rows.length} de ${state.rows.length} caminhões`;

  board.innerHTML = COLUMNS.map(col => {
    const cards = rows.filter(r => (r.column?.coluna || 'VAZIO_AGUARDANDO_CARGA') === col.key);
    const sortKey = state.sorts[col.key] || 'default';
    const sorted = sortRows(cards, sortKey);
    return `
      <div class="cv-col" data-col-status="${col.key}" style="--col-color:${col.color}">
        <div class="cv-col-hdr">
          <span class="cv-col-title">${esc(col.label)}</span>
          <span class="cv-col-count">${cards.length}</span>
          <select class="cv-col-sort" onchange="cv.setSort('${col.key}', this.value)" title="Ordenar coluna">
            ${SORT_OPTIONS.map(o => `<option value="${o.key}" ${o.key === sortKey ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select>
        </div>
        <div class="cv-col-body" data-col-body="${col.key}">
          ${sorted.map(renderCard).join('') || '<div class="cv-muted" style="text-align:center;padding:.5rem">—</div>'}
        </div>
      </div>`;
  }).join('');

  wireDragAndDrop();
}

function renderCard(row) {
  const t = row.truck;
  const c = row.column || {};
  const v = row.viagem_em_curso;
  const col = COLUMNS.find(x => x.key === (c.coluna || 'VAZIO_AGUARDANDO_CARGA'));
  const fields = miniFields(c.coluna, v, c);
  const planejadas = row.viagens_planejadas_count || 0;
  const unread = isUnread(row);
  const updated = c.updated_at ? fmtTime(c.updated_at) : '';

  return `
    <div class="cv-card" draggable="true"
         data-truck-id="${esc(t.id)}"
         style="--card-color:${col?.color || 'var(--muted)'}"
         onclick="cv.openDetail('${esc(t.id)}')">
      <div class="cv-plate">${esc(t.placa)}</div>
      <div class="cv-driver">${esc(t.motorista || '—')}</div>
      <div class="cv-model">${esc(t.modelo || '')}</div>
      ${fields ? `<div class="cv-divider"></div><div class="cv-fields-mini">${fields}</div>` : ''}
      <div class="cv-foot">
        <span>
          <span class="cv-pill ${unread ? 'unread' : ''}">💬 ${row.activity_count || 0}</span>
          ${planejadas > 0 ? `<span class="cv-pill" style="margin-left:.3rem">📋 ${planejadas}</span>` : ''}
        </span>
        <span>${updated ? '⏱ ' + updated : ''}</span>
      </div>
    </div>`;
}

function miniFields(coluna, viagem, column) {
  const parts = [];
  const v = viagem || {};
  if (coluna === 'INDO_CARREGAR' || coluna === 'NA_FABRICA') {
    if (v.fabrica)                  parts.push(`🏭 ${esc(v.fabrica)}`);
    if (v.data_coleta)              parts.push(`🚚 <b>${fmtDate(v.data_coleta)}</b>`);
    if (v.data_agendamento_entrega) parts.push(`📅 <b>${fmtDate(v.data_agendamento_entrega)}</b>`);
  } else if (coluna === 'CARREGADO_EM_VIAGEM') {
    if (v.data_agendamento_entrega) parts.push(`📅 <b>${fmtDate(v.data_agendamento_entrega)}</b>`);
    if (v.carga_descricao)          parts.push(esc(v.carga_descricao));
  } else if (coluna === 'EM_DESCARGA_NO_CLIENTE') {
    if (v.cliente_descarga) parts.push(`🏢 ${esc(v.cliente_descarga)}`);
  } else if (coluna === 'EM_MANUTENCAO') {
    if (column.manutencao_descricao) parts.push(`🔧 ${esc(column.manutencao_descricao)}`);
  }
  return parts.join(' · ');
}

function isUnread(row) {
  if (!row.last_activity_at || (row.activity_count || 0) === 0) return false;
  const seen = state.lastSeen[row.truck.id];
  if (!seen) return true;
  return new Date(row.last_activity_at) > new Date(seen);
}

function applySearch() {
  state.query = document.getElementById('cvSearch').value;
  renderBoard();
}

function setSort(colKey, sortKey) {
  state.sorts[colKey] = sortKey;
  saveSorts();
  renderBoard();
}

/* ============================================================
   DRAG-AND-DROP — desktop + mobile (touch)
   ============================================================ */
function wireDragAndDrop() {
  const cards = document.querySelectorAll('.cv-card');
  const cols  = document.querySelectorAll('.cv-col');

  cards.forEach(card => {
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend',   onDragEnd);

    let lpTimer = null;
    let touchDrag = null;
    card.addEventListener('touchstart', (e) => {
      lpTimer = setTimeout(() => { touchDrag = beginTouchDrag(card, e.touches[0]); }, 350);
    }, { passive: true });
    card.addEventListener('touchmove', (e) => {
      if (touchDrag) { e.preventDefault(); moveTouchDrag(touchDrag, e.touches[0]); }
      else clearTimeout(lpTimer);
    }, { passive: false });
    card.addEventListener('touchend', () => {
      clearTimeout(lpTimer);
      if (touchDrag) { endTouchDrag(touchDrag); touchDrag = null; }
    });
    card.addEventListener('touchcancel', () => {
      clearTimeout(lpTimer);
      if (touchDrag) { cancelTouchDrag(touchDrag); touchDrag = null; }
    });
  });

  cols.forEach(col => {
    col.addEventListener('dragover',  onDragOver);
    col.addEventListener('dragleave', onDragLeave);
    col.addEventListener('drop',      onDrop);
  });
}
function onDragStart(e) {
  const card = e.currentTarget;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', card.dataset.truckId);
}
function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.cv-col.drag-over').forEach(c => c.classList.remove('drag-over'));
}
function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drag-over');
}
async function onDrop(e) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.remove('drag-over');
  const newColuna = col.dataset.colStatus;
  const truckId   = e.dataTransfer.getData('text/plain');
  await commitMove(truckId, newColuna);
}

function beginTouchDrag(card, touch) {
  card.classList.add('dragging');
  card.setAttribute('data-lp', '1');
  if (navigator.vibrate) try { navigator.vibrate(20); } catch {}
  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.style.position = 'fixed';
  ghost.style.left = rect.left + 'px';
  ghost.style.top  = rect.top  + 'px';
  ghost.style.width = rect.width + 'px';
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '1000';
  ghost.style.opacity = '0.85';
  ghost.classList.add('cv-touch-ghost');
  document.body.appendChild(ghost);
  return { truckId: card.dataset.truckId, ghost, offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top, currentCol: null };
}
function moveTouchDrag(drag, touch) {
  drag.ghost.style.left = (touch.clientX - drag.offsetX) + 'px';
  drag.ghost.style.top  = (touch.clientY - drag.offsetY) + 'px';
  drag.ghost.style.display = 'none';
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  drag.ghost.style.display = '';
  const col = el?.closest?.('.cv-col');
  if (col !== drag.currentCol) {
    if (drag.currentCol) drag.currentCol.classList.remove('drag-over');
    if (col) col.classList.add('drag-over');
    drag.currentCol = col;
  }
}
async function endTouchDrag(drag) {
  drag.ghost.remove();
  if (drag.currentCol) drag.currentCol.classList.remove('drag-over');
  document.querySelectorAll(`.cv-card[data-truck-id="${drag.truckId}"]`).forEach(c => {
    c.classList.remove('dragging'); c.removeAttribute('data-lp');
  });
  if (drag.currentCol) await commitMove(drag.truckId, drag.currentCol.dataset.colStatus);
}
function cancelTouchDrag(drag) {
  drag.ghost.remove();
  if (drag.currentCol) drag.currentCol.classList.remove('drag-over');
  document.querySelectorAll(`.cv-card[data-truck-id="${drag.truckId}"]`).forEach(c => {
    c.classList.remove('dragging'); c.removeAttribute('data-lp');
  });
}

async function commitMove(truckId, newColuna) {
  if (!newColuna || !truckId) return;
  const row = state.rows.find(r => r.truck.id === truckId);
  if (!row) return;
  const oldColuna = row.column?.coluna || 'VAZIO_AGUARDANDO_CARGA';
  if (oldColuna === newColuna) return;

  row.column = { ...(row.column || {}), coluna: newColuna };
  renderBoard();

  try {
    await api.patch(`/api/controle-viagens/truck/${truckId}/column`, { coluna: newColuna });
    await fetchBoard();
  } catch (err) {
    alert('Erro ao mover: ' + err.message);
    row.column.coluna = oldColuna;
    renderBoard();
  }
}

async function manualRefresh() {
  state.fingerprint = null;
  await fetchBoard();
}

export async function initControleViagens() {
  if (state.initialized) {
    if (!state.pollTimer) startPolling();
    return;
  }
  state.initialized = true;

  document.getElementById('cvSearch').addEventListener('input', applySearch);

  state.visibilityHandler = () => {
    if (document.body.dataset.view !== 'controle-viagens') return;
    if (!document.hidden) fetchBoard();
    updateRefreshInfo();
  };
  document.addEventListener('visibilitychange', state.visibilityHandler);

  await fetchBoard();
  startPolling();
}

export function stopControleViagens() {
  stopPolling();
  if (state.visibilityHandler) {
    document.removeEventListener('visibilitychange', state.visibilityHandler);
    state.visibilityHandler = null;
  }
  state.initialized = false;
}

/* Objeto exposto pro HTML inline */
const cv = {
  manualRefresh,
  applySearch,
  setSort,
  markSeen,
  openDetail: modal.openDetail,
  closeDetail: modal.closeDetail,
  saveDetailFields: modal.saveDetailFields,
  saveDescricao: modal.saveDescricao,
  switchModalTab: modal.switchModalTab,
  toggleDetails: modal.toggleDetails,
  submitComment: activityPane.submitComment,
  deleteComment: activityPane.deleteComment,
  toggleActivityExpand: activityPane.toggleExpand,
  openNewViagem: viagensPane.openNewViagem,
  closeViagemForm: viagensPane.closeViagemForm,
  saveViagemForm: viagensPane.saveViagemForm,
  editViagem: viagensPane.editViagem,
  startViagem: viagensPane.startViagem,
  finalizeViagem: viagensPane.finalizeViagem,
  cancelViagem: viagensPane.cancelViagem,
  deleteViagem: viagensPane.deleteViagem,
  toggleViagem: viagensPane.toggleCollapse,
  // Helpers compartilhados expostos pra outros módulos
  refreshAfterChange: async () => { state.fingerprint = null; await fetchBoard(); },
};
window.cv = cv;
export { cv };
