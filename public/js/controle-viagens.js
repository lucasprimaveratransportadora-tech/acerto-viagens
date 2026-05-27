// controle-viagens.js — Painel Kanban operacional.
//
// Cada caminhão da frota é um card. Movimentar entre colunas atualiza
// o status no backend. Polling a cada 20s; pausado quando aba fora de
// foco. Identidade visual idêntica ao restante do sistema (vide
// public/css/controle-viagens.css).

import { api } from './api.js';
import { esc } from './utils.js';
import * as modal from './controle-viagens.modal.js';

const COLUMNS = [
  { key: 'VAZIO_AGUARDANDO_CARGA',   label: 'Vazio aguardando carga',  color: 'var(--cv-col-vazio)' },
  { key: 'INDO_CARREGAR',            label: 'Indo carregar',           color: 'var(--cv-col-indo)' },
  { key: 'NA_FABRICA',               label: 'Na fábrica',              color: 'var(--cv-col-fabrica)' },
  { key: 'CARREGADO_EM_VIAGEM',      label: 'Carregado em viagem',     color: 'var(--cv-col-carregado)' },
  { key: 'EM_DESCARGA_NO_CLIENTE',   label: 'Em descarga no cliente',  color: 'var(--cv-col-descarga)' },
  { key: 'EM_MANUTENCAO',            label: 'Em manutenção',           color: 'var(--cv-col-manutencao)' },
];

const STATUS_LABEL = Object.fromEntries(COLUMNS.map(c => [c.key, c.label]));

const POLL_INTERVAL_MS = 20_000;

const state = {
  rows: [],           // [{ truck, state, comments_count, last_comment_at }]
  fingerprint: null,
  query: '',
  pollTimer: null,
  detailTruckId: null,
  lastSeen: loadLastSeen(),
  initialized: false,
  visibilityHandler: null,
};

/* ============================================================
   LOCALSTORAGE — última visita por caminhão (badge "novo")
   ============================================================ */
function loadLastSeen() {
  try {
    const raw = localStorage.getItem('cv_last_seen');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveLastSeen() {
  try { localStorage.setItem('cv_last_seen', JSON.stringify(state.lastSeen)); } catch { /* */ }
}
function markSeen(truckId) {
  state.lastSeen[truckId] = new Date().toISOString();
  saveLastSeen();
}

/* ============================================================
   FORMATAÇÃO
   ============================================================ */
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}
function fmtTime(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}

/* ============================================================
   FETCH + POLLING
   ============================================================ */
async function fetchBoard() {
  try {
    const resp = await api.get('/api/controle-viagens/board');
    if (state.fingerprint === resp.fingerprint) {
      updateRefreshInfo(); // só atualiza horário
      return;
    }
    state.rows = resp.board;
    state.fingerprint = resp.fingerprint;
    renderBoard();
    updateRefreshInfo();
  } catch (e) {
    console.error('[cv] falha ao carregar board:', e);
    document.getElementById('cvBoard').innerHTML =
      `<div class="cv-loading" style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
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

/* ============================================================
   RENDER
   ============================================================ */
function filteredRows() {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.rows;
  return state.rows.filter(r => {
    const t = r.truck;
    const s = r.state || {};
    return (t.placa || '').toLowerCase().includes(q)
        || (t.motorista || '').toLowerCase().includes(q)
        || (t.modelo || '').toLowerCase().includes(q)
        || (s.carga_descricao || '').toLowerCase().includes(q)
        || (s.contexto_atual || '').toLowerCase().includes(q);
  });
}

function renderBoard() {
  const board = document.getElementById('cvBoard');
  const rows = filteredRows();

  document.getElementById('cvTotal').textContent =
    `${rows.length} de ${state.rows.length} caminhões`;

  board.innerHTML = COLUMNS.map(col => {
    const cards = rows.filter(r => (r.state?.status || 'VAZIO_AGUARDANDO_CARGA') === col.key);
    return `
      <div class="cv-col" data-col-status="${col.key}" style="--col-color:${col.color}">
        <div class="cv-col-hdr">
          <span class="cv-col-title">${esc(col.label)}</span>
          <span class="cv-col-count">${cards.length}</span>
        </div>
        <div class="cv-col-body" data-col-body="${col.key}">
          ${cards.map(renderCard).join('') || '<div class="cv-muted" style="text-align:center;padding:.5rem">—</div>'}
        </div>
      </div>`;
  }).join('');

  wireDragAndDrop();
}

function renderCard(row) {
  const t = row.truck;
  const s = row.state || {};
  const status = s.status || 'VAZIO_AGUARDANDO_CARGA';
  const col = COLUMNS.find(c => c.key === status);
  const fields = miniFields(status, s);
  const unread = isUnread(row);
  const updated = s.updated_at ? fmtTime(s.updated_at) : '';
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
        <span class="cv-comment-pill ${unread ? 'unread' : ''}">💬 ${row.comments_count || 0}</span>
        <span>${updated ? '⏱ ' + updated : ''}</span>
      </div>
    </div>`;
}

function miniFields(status, s) {
  const parts = [];
  if (status === 'INDO_CARREGAR') {
    if (s.data_coleta)              parts.push(`🚚 <b>${fmtDate(s.data_coleta)}</b>`);
    if (s.data_agendamento_entrega) parts.push(`📅 <b>${fmtDate(s.data_agendamento_entrega)}</b>`);
    if (s.carga_descricao)          parts.push(esc(s.carga_descricao));
  } else if (status === 'CARREGADO_EM_VIAGEM') {
    if (s.data_agendamento_entrega) parts.push(`📅 <b>${fmtDate(s.data_agendamento_entrega)}</b>`);
    if (s.carga_descricao)          parts.push(esc(s.carga_descricao));
  } else if (s.contexto_atual) {
    parts.push(`📍 ${esc(s.contexto_atual)}`);
  }
  return parts.join(' · ');
}

function isUnread(row) {
  if (!row.last_comment_at || (row.comments_count || 0) === 0) return false;
  const seen = state.lastSeen[row.truck.id];
  if (!seen) return true;
  return new Date(row.last_comment_at) > new Date(seen);
}

/* ============================================================
   SEARCH
   ============================================================ */
function applySearch() {
  state.query = document.getElementById('cvSearch').value;
  renderBoard();
}

/* ============================================================
   DRAG AND DROP
   ============================================================ */
function wireDragAndDrop() {
  const cards = document.querySelectorAll('.cv-card');
  const cols  = document.querySelectorAll('.cv-col');

  cards.forEach(card => {
    // Desktop: HTML5 native DnD
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend',   onDragEnd);

    // Mobile: long-press (350ms) arma um arrasto manual com touchmove tracking.
    let lpTimer = null;
    let touchDrag = null; // { truckId, ghost, currentCol }
    card.addEventListener('touchstart', (e) => {
      lpTimer = setTimeout(() => {
        touchDrag = beginTouchDrag(card, e.touches[0]);
      }, 350);
    }, { passive: true });
    card.addEventListener('touchmove', (e) => {
      if (touchDrag) {
        e.preventDefault();
        moveTouchDrag(touchDrag, e.touches[0]);
      } else {
        clearTimeout(lpTimer);
      }
    }, { passive: false });
    card.addEventListener('touchend', () => {
      clearTimeout(lpTimer);
      if (touchDrag) {
        endTouchDrag(touchDrag);
        touchDrag = null;
      }
    });
    card.addEventListener('touchcancel', () => {
      clearTimeout(lpTimer);
      if (touchDrag) {
        cancelTouchDrag(touchDrag);
        touchDrag = null;
      }
    });
  });

  cols.forEach(col => {
    col.addEventListener('dragover',  onDragOver);
    col.addEventListener('dragleave', onDragLeave);
    col.addEventListener('drop',      onDrop);
  });
}

/* ===== Desktop handlers ===== */
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
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}
function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}
async function onDrop(e) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.remove('drag-over');
  const newStatus = col.dataset.colStatus;
  const truckId   = e.dataTransfer.getData('text/plain');
  await commitMove(truckId, newStatus);
}

/* ===== Touch handlers (mobile manual drag) ===== */
function beginTouchDrag(card, touch) {
  card.classList.add('dragging');
  card.setAttribute('data-lp', '1');
  if (navigator.vibrate) try { navigator.vibrate(20); } catch { /* */ }

  // Ghost: clone visual que segue o dedo
  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.style.position = 'fixed';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  ghost.style.width = rect.width + 'px';
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '1000';
  ghost.style.opacity = '0.85';
  ghost.classList.add('cv-touch-ghost');
  document.body.appendChild(ghost);

  return {
    truckId: card.dataset.truckId,
    ghost,
    offsetX: touch.clientX - rect.left,
    offsetY: touch.clientY - rect.top,
    currentCol: null,
  };
}

function moveTouchDrag(drag, touch) {
  drag.ghost.style.left = (touch.clientX - drag.offsetX) + 'px';
  drag.ghost.style.top  = (touch.clientY - drag.offsetY) + 'px';

  // Detecta coluna sob o dedo (esconde temporariamente o ghost pra não atrapalhar elementFromPoint)
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
    c.classList.remove('dragging');
    c.removeAttribute('data-lp');
  });
  if (drag.currentCol) {
    const newStatus = drag.currentCol.dataset.colStatus;
    await commitMove(drag.truckId, newStatus);
  }
}

function cancelTouchDrag(drag) {
  drag.ghost.remove();
  if (drag.currentCol) drag.currentCol.classList.remove('drag-over');
  document.querySelectorAll(`.cv-card[data-truck-id="${drag.truckId}"]`).forEach(c => {
    c.classList.remove('dragging');
    c.removeAttribute('data-lp');
  });
}

/* ===== Shared commit logic (desktop drop + touch end) ===== */
async function commitMove(truckId, newStatus) {
  if (!newStatus || !truckId) return;
  const row = state.rows.find(r => r.truck.id === truckId);
  if (!row) return;
  const oldStatus = row.state?.status || 'VAZIO_AGUARDANDO_CARGA';
  if (oldStatus === newStatus) return;

  // Otimista: move localmente
  row.state = { ...(row.state || {}), status: newStatus };
  renderBoard();

  try {
    await api.patch(`/api/controle-viagens/${truckId}/state`, { status: newStatus });
    await fetchBoard();
  } catch (err) {
    alert('Erro ao mover: ' + err.message);
    row.state.status = oldStatus;
    renderBoard();
  }
}

/* ============================================================
   INIT
   ============================================================ */
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
  state.initialized = false; // permite re-init quando voltar
}

/* Exposto pro HTML inline (onclick) */
const cv = {
  manualRefresh,
  applySearch,
  openDetail: modal.openDetail,
  closeDetail: modal.closeDetail,
  saveDetailFields: modal.saveDetailFields,
  switchModalTab: modal.switchModalTab,
  submitComment: modal.submitComment,
  deleteComment: modal.deleteComment,
  markSeen,
};
window.cv = cv;
export { cv };
