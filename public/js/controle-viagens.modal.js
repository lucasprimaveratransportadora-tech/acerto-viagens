// controle-viagens.modal.js — Modal de detalhe do caminhão:
// status (dropdown), campos contextuais e bloco de descrição.
// A timeline de comentários é tratada no mesmo modal mas em outro
// arquivo (próxima task).

import { api } from './api.js';
import { esc } from './utils.js';

const COLUMNS_INFO = {
  VAZIO_AGUARDANDO_CARGA: { label: 'Vazio aguardando carga', color: 'var(--cv-col-vazio)',     fields: ['contexto_atual'], contextoLabel: 'Local atual' },
  INDO_CARREGAR:          { label: 'Indo carregar',          color: 'var(--cv-col-indo)',      fields: ['data_coleta','data_agendamento_entrega','carga_descricao'] },
  NA_FABRICA:             { label: 'Na fábrica',             color: 'var(--cv-col-fabrica)',   fields: ['contexto_atual'], contextoLabel: 'Fábrica' },
  CARREGADO_EM_VIAGEM:    { label: 'Carregado em viagem',    color: 'var(--cv-col-carregado)', fields: ['data_agendamento_entrega','carga_descricao'] },
  EM_DESCARGA_NO_CLIENTE: { label: 'Em descarga no cliente', color: 'var(--cv-col-descarga)',  fields: ['contexto_atual'], contextoLabel: 'Cliente' },
  EM_MANUTENCAO:          { label: 'Em manutenção',          color: 'var(--cv-col-manutencao)',fields: ['contexto_atual'], contextoLabel: 'Descrição da manutenção' },
};

const state = {
  truckId: null,
  data: null,
  modalTab: 'detail',
};

function toDateInput(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function fmtPtBR(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

function populateStatusSelect() {
  const sel = document.getElementById('cvDetStatus');
  sel.innerHTML = Object.entries(COLUMNS_INFO)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  sel.onchange = renderFields;
  // Recolora a borda do select conforme status atual
  sel.addEventListener('change', () => {
    const info = COLUMNS_INFO[sel.value];
    sel.style.borderColor = info?.color || 'var(--border)';
  });
}

function renderFields() {
  const sel = document.getElementById('cvDetStatus');
  const status = sel.value;
  const info = COLUMNS_INFO[status];
  const s = state.data?.state || {};

  const fieldsEl = document.getElementById('cvDetFields');
  const partsHtml = [];

  for (const f of info.fields) {
    if (f === 'contexto_atual') {
      partsHtml.push(`
        <div class="form-group">
          <label>${esc(info.contextoLabel || 'Local')}</label>
          <input type="text" id="cvDetCtx" value="${esc(s.contexto_atual || '')}" maxlength="500">
        </div>`);
    } else if (f === 'data_coleta') {
      partsHtml.push(`
        <div class="form-group">
          <label>Data da coleta</label>
          <input type="date" id="cvDetColeta" value="${toDateInput(s.data_coleta)}">
        </div>`);
    } else if (f === 'data_agendamento_entrega') {
      partsHtml.push(`
        <div class="form-group">
          <label>Agendamento da entrega</label>
          <input type="date" id="cvDetAgend" value="${toDateInput(s.data_agendamento_entrega)}">
        </div>`);
    } else if (f === 'carga_descricao') {
      partsHtml.push(`
        <div class="form-group">
          <label>Carga</label>
          <input type="text" id="cvDetCarga" value="${esc(s.carga_descricao || '')}" maxlength="500" placeholder="ex.: Soja - Faz. Boa Vista">
        </div>`);
    }
  }
  fieldsEl.innerHTML = partsHtml.join('');

  // Borda colorida do status
  sel.style.borderColor = info?.color || 'var(--border)';
}

function readFieldsPayload() {
  const status = document.getElementById('cvDetStatus').value;
  const payload = { status, descricao: document.getElementById('cvDetDescricao').value || null };
  const info = COLUMNS_INFO[status];
  if (info.fields.includes('contexto_atual')) {
    payload.contexto_atual = (document.getElementById('cvDetCtx')?.value || '').trim() || null;
  } else {
    payload.contexto_atual = null;
  }
  if (info.fields.includes('data_coleta')) {
    payload.data_coleta = document.getElementById('cvDetColeta')?.value || null;
  }
  if (info.fields.includes('data_agendamento_entrega')) {
    payload.data_agendamento_entrega = document.getElementById('cvDetAgend')?.value || null;
  }
  if (info.fields.includes('carga_descricao')) {
    payload.carga_descricao = (document.getElementById('cvDetCarga')?.value || '').trim() || null;
  }
  return payload;
}

export async function openDetail(truckId) {
  state.truckId = truckId;
  state.modalTab = 'detail';

  // Carrega dados
  try {
    state.data = await api.get(`/api/controle-viagens/${truckId}`);
  } catch (e) {
    alert('Erro ao carregar caminhão: ' + e.message);
    return;
  }

  // Header
  const t = state.data.truck;
  const s = state.data.state || {};
  document.getElementById('cvDetTitle').textContent = `${t.placa} — ${t.motorista || 'sem motorista'}`;
  document.getElementById('cvDetSubtitle').textContent =
    [t.modelo, t.carreta_placa ? `+ ${t.carreta_placa}${t.carreta_modelo ? ' (' + t.carreta_modelo + ')' : ''}` : '']
      .filter(Boolean).join(' ');

  populateStatusSelect();
  document.getElementById('cvDetStatus').value = s.status || 'VAZIO_AGUARDANDO_CARGA';
  document.getElementById('cvDetDescricao').value = s.descricao || '';
  renderFields();

  document.getElementById('cvDetUpdated').textContent =
    s.updated_by ? `Última: ${s.updated_by.nome} · ${fmtPtBR(s.updated_at)}` : '';

  document.getElementById('cvDetailModal').classList.add('open');
  switchModalTab('detail');

  // Hook pra módulo de comentários (Task 13) carregar a lista
  if (window.cvComments?.loadFor) await window.cvComments.loadFor(truckId);
}

export function closeDetail() {
  document.getElementById('cvDetailModal').classList.remove('open');
  // Marca como visto ANTES de limpar o id (badge "novo" some no próximo refresh)
  if (window.cv?.markSeen && state.truckId) window.cv.markSeen(state.truckId);
  state.truckId = null;
  state.data = null;
}

export async function saveDetailFields() {
  const btn = document.getElementById('cvDetSaveBtn');
  const originalLabel = btn.textContent;
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    const payload = readFieldsPayload();
    await api.patch(`/api/controle-viagens/${state.truckId}/state`, payload);
    // Recarrega o board (pega novo fingerprint + status visível)
    if (window.cv?.manualRefresh) await window.cv.manualRefresh();
    closeDetail();
  } catch (e) {
    alert('Erro ao salvar: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = originalLabel;
  }
}

export function switchModalTab(tab) {
  state.modalTab = tab;
  document.querySelectorAll('#cvModalTabs .cv-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.cvTab === tab);
  });
  document.getElementById('cvDetailPane').classList.toggle('active', tab === 'detail');
  document.getElementById('cvCommentsPane').classList.toggle('active', tab === 'comments');
}

/* ============================================================
   COMMENTS
   ============================================================ */
const commentsState = { truckId: null, items: [] };

async function loadComments(truckId) {
  commentsState.truckId = truckId;
  try {
    commentsState.items = await api.get(`/api/controle-viagens/${truckId}/comments?limit=200`);
  } catch (e) {
    commentsState.items = [];
    console.error('[cv comments] load failed:', e);
  }
  renderComments();
}

function initial(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

function fmtPtBRFull(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

function renderComments() {
  const list = document.getElementById('cvCommentsList');
  if (!commentsState.items.length) {
    list.innerHTML = '<div class="cv-muted" style="text-align:center;padding:1rem">Nenhum comentário ainda. Seja o primeiro 💬</div>';
    return;
  }
  const me = window.__currentUser || null;
  const meId = me?.id || null;
  const isAdmin = me?.role === 'ADMIN';

  list.innerHTML = commentsState.items.map(c => {
    const canDelete = isAdmin || (c.author_id && c.author_id === meId);
    return `
      <div class="cv-comment" data-comment-id="${esc(c.id)}">
        <div class="cv-comment-avatar">${esc(initial(c.author_nome))}</div>
        <div class="cv-comment-body">
          <div class="cv-comment-head">
            <b>${esc(c.author_nome)}</b> · ${fmtPtBRFull(c.created_at)}
            ${canDelete ? `<button class="cv-comment-delete" onclick="cv.deleteComment('${esc(c.id)}')" title="Apagar">apagar</button>` : ''}
          </div>
          <div class="cv-comment-text">${esc(c.texto)}</div>
        </div>
      </div>`;
  }).join('');
}

export async function submitComment() {
  if (!commentsState.truckId) return;
  const input = document.getElementById('cvCommentInput');
  const texto = (input.value || '').trim();
  if (!texto) return;
  try {
    const c = await api.post(`/api/controle-viagens/${commentsState.truckId}/comments`, { texto });
    commentsState.items = [c, ...commentsState.items];
    input.value = '';
    renderComments();
    // Atualiza board pra incrementar contador 💬 + last_comment_at
    if (window.cv?.manualRefresh) await window.cv.manualRefresh();
  } catch (e) {
    alert('Erro ao enviar comentário: ' + e.message);
  }
}

export async function deleteComment(id) {
  if (!commentsState.truckId) return;
  if (!confirm('Apagar este comentário?')) return;
  try {
    await api.delete(`/api/controle-viagens/${commentsState.truckId}/comments/${id}`);
    commentsState.items = commentsState.items.filter(c => c.id !== id);
    renderComments();
    if (window.cv?.manualRefresh) await window.cv.manualRefresh();
  } catch (e) {
    alert('Erro ao apagar: ' + e.message);
  }
}

// Wire pro openDetail chamar quando abrir o modal
window.cvComments = { loadFor: loadComments };
