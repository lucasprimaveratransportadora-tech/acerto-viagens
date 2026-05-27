// controle-viagens.modal.js — Modal de detalhe do caminhão (v2):
// status dropdown + campos da coluna + descrição persistente.
// O painel de viagens fica em controle-viagens.viagens.js
// O activity log fica em controle-viagens.activity.js

import { api } from './api.js';
import { esc } from './utils.js';
import * as viagensPane from './controle-viagens.viagens.js';
import * as activityPane from './controle-viagens.activity.js';

const COLUMNS_INFO = {
  VAZIO_AGUARDANDO_CARGA: { label: 'Vazio aguardando carga', color: 'var(--cv-col-vazio)',     fields: [] },
  INDO_CARREGAR:          { label: 'Indo carregar',          color: 'var(--cv-col-indo)',      fields: ['fabrica','data_coleta','data_agendamento_entrega','carga_descricao','valor_frete'] },
  NA_FABRICA:             { label: 'Na fábrica',             color: 'var(--cv-col-fabrica)',   fields: ['fabrica','data_coleta','data_agendamento_entrega','carga_descricao','valor_frete'] },
  CARREGADO_EM_VIAGEM:    { label: 'Carregado em viagem',    color: 'var(--cv-col-carregado)', fields: ['carga_descricao','data_carregamento','data_agendamento_entrega','valor_frete'] },
  EM_DESCARGA_NO_CLIENTE: { label: 'Em descarga no cliente', color: 'var(--cv-col-descarga)',  fields: ['cliente_descarga','data_agendamento_entrega','carga_descricao'] },
  EM_MANUTENCAO:          { label: 'Em manutenção',          color: 'var(--cv-col-manutencao)',fields: ['manutencao_descricao'] },
};

const state = {
  truckId: null,
  data: null,
  modalTab: 'detail',
};

function toDateInput(s) {
  if (!s) return '';
  const d = new Date(s); if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtPtBR(s) {
  if (!s) return '';
  const d = new Date(s); if (isNaN(d)) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function populateStatusSelect() {
  const sel = document.getElementById('cvDetStatus');
  sel.innerHTML = Object.entries(COLUMNS_INFO)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  sel.onchange = async () => {
    renderFields();
    sel.style.borderColor = COLUMNS_INFO[sel.value]?.color || 'var(--border)';
    // Auto-save da troca de coluna (mesmo comportamento do drag-and-drop):
    // muda no servidor instantaneamente e refresca o board, sem precisar clicar Salvar.
    // O botão Salvar continua valendo pros campos da viagem (carga/datas/valor).
    if (!state.truckId) return;
    const newColuna = sel.value;
    if (state.data?.column?.coluna === newColuna) return; // já estava nessa coluna
    sel.disabled = true;
    try {
      await api.patch(`/api/controle-viagens/truck/${state.truckId}/column`, { coluna: newColuna });
      if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
      await reload();
    } catch (e) {
      alert('Erro ao mover: ' + e.message);
    } finally {
      sel.disabled = false;
    }
  };
}

function getViagemEmCurso() {
  return state.data?.viagens?.find(v => v.status_viagem === 'EM_CURSO') || null;
}

function renderFields() {
  const sel = document.getElementById('cvDetStatus');
  const coluna = sel.value;
  const info = COLUMNS_INFO[coluna];
  const c = state.data?.column || {};
  const v = getViagemEmCurso() || {};
  const fieldsEl = document.getElementById('cvDetFields');
  const parts = [];

  for (const f of info.fields) {
    if (f === 'manutencao_descricao') {
      parts.push(`
        <div class="form-group">
          <label>Descrição da manutenção</label>
          <input type="text" id="cvDetManut" value="${esc(c.manutencao_descricao || '')}" maxlength="500">
        </div>`);
    } else if (f === 'fabrica') {
      parts.push(`
        <div class="form-group">
          <label>Fábrica</label>
          <input type="text" id="cvDetFabrica" value="${esc(v.fabrica || '')}" maxlength="200" placeholder="ex.: Cargill Goiania">
        </div>`);
    } else if (f === 'cliente_descarga') {
      parts.push(`
        <div class="form-group">
          <label>Cliente</label>
          <input type="text" id="cvDetCliente" value="${esc(v.cliente_descarga || '')}" maxlength="200">
        </div>`);
    } else if (f === 'data_coleta') {
      parts.push(`
        <div class="form-group">
          <label>Data coleta</label>
          <input type="date" id="cvDetColeta" value="${toDateInput(v.data_coleta)}">
        </div>`);
    } else if (f === 'data_carregamento') {
      const val = toDateInput(v.data_carregamento) || toDateInput(v.data_coleta);
      parts.push(`
        <div class="form-group">
          <label>Data carregamento</label>
          <input type="date" id="cvDetCarreg" value="${val}">
        </div>`);
    } else if (f === 'data_agendamento_entrega') {
      parts.push(`
        <div class="form-group">
          <label>Agendamento entrega</label>
          <input type="date" id="cvDetAgend" value="${toDateInput(v.data_agendamento_entrega)}">
        </div>`);
    } else if (f === 'carga_descricao') {
      parts.push(`
        <div class="form-group">
          <label>Carga</label>
          <input type="text" id="cvDetCarga" value="${esc(v.carga_descricao || '')}" maxlength="500">
        </div>`);
    } else if (f === 'valor_frete') {
      parts.push(`
        <div class="form-group">
          <label>Valor frete (R$)</label>
          <input type="number" step="0.01" min="0" id="cvDetValor" value="${v.valor_frete ?? ''}">
        </div>`);
    }
  }
  if (parts.length === 0) {
    parts.push('<div class="cv-muted">Nenhum campo nesta coluna. Crie uma viagem pra preencher dados de carga.</div>');
  }
  fieldsEl.innerHTML = parts.join('');
  sel.style.borderColor = info?.color || 'var(--border)';
}

function readColumnPayload() {
  const coluna = document.getElementById('cvDetStatus').value;
  const payload = { coluna };
  if (COLUMNS_INFO[coluna].fields.includes('manutencao_descricao')) {
    payload.manutencao_descricao = (document.getElementById('cvDetManut')?.value || '').trim() || null;
  }
  return payload;
}

function readViagemPayload() {
  const coluna = document.getElementById('cvDetStatus').value;
  const fields = COLUMNS_INFO[coluna].fields;
  const payload = {};
  if (fields.includes('fabrica'))                  payload.fabrica = (document.getElementById('cvDetFabrica')?.value || '').trim() || null;
  if (fields.includes('cliente_descarga'))         payload.cliente_descarga = (document.getElementById('cvDetCliente')?.value || '').trim() || null;
  if (fields.includes('data_coleta'))              payload.data_coleta = document.getElementById('cvDetColeta')?.value || null;
  if (fields.includes('data_carregamento'))        payload.data_carregamento = document.getElementById('cvDetCarreg')?.value || null;
  if (fields.includes('data_agendamento_entrega')) payload.data_agendamento_entrega = document.getElementById('cvDetAgend')?.value || null;
  if (fields.includes('carga_descricao'))          payload.carga_descricao = (document.getElementById('cvDetCarga')?.value || '').trim() || null;
  if (fields.includes('valor_frete')) {
    const raw = document.getElementById('cvDetValor')?.value;
    payload.valor_frete = (raw === '' || raw == null) ? null : Number(raw);
  }
  return payload;
}

export async function openDetail(truckId) {
  state.truckId = truckId;
  state.modalTab = 'detail';

  try {
    state.data = await api.get(`/api/controle-viagens/truck/${truckId}`);
  } catch (e) {
    alert('Erro ao carregar caminhão: ' + e.message);
    return;
  }

  const t = state.data.truck;
  const c = state.data.column || {};
  document.getElementById('cvDetTitle').textContent = `${t.placa} — ${t.motorista || 'sem motorista'}`;
  document.getElementById('cvDetSubtitle').textContent =
    [t.modelo, t.carreta_placa ? `+ ${t.carreta_placa}${t.carreta_modelo ? ' (' + t.carreta_modelo + ')' : ''}` : '']
      .filter(Boolean).join(' ');

  populateStatusSelect();
  document.getElementById('cvDetStatus').value = c.coluna || 'VAZIO_AGUARDANDO_CARGA';
  document.getElementById('cvDetDescricao').value = c.descricao_geral || '';
  renderFields();

  document.getElementById('cvDetUpdated').textContent =
    c.updated_by ? `Última: ${c.updated_by.nome} · ${fmtPtBR(c.updated_at)}` : '';

  // Render viagens + activity (delegados)
  viagensPane.renderForTruck(state.data);
  activityPane.renderFor(state.data);

  document.getElementById('cvDetailModal').classList.add('open');
  switchModalTab('detail');
}

export function closeDetail() {
  document.getElementById('cvDetailModal').classList.remove('open');
  if (window.cv?.markSeen && state.truckId) window.cv.markSeen(state.truckId);
  state.truckId = null;
  state.data = null;
}

export async function saveDetailFields() {
  const btn = document.getElementById('cvDetSaveBtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    const coluna = document.getElementById('cvDetStatus').value;
    const colPayload = readColumnPayload();
    await api.patch(`/api/controle-viagens/truck/${state.truckId}/column`, colPayload);

    // Se há viagem em curso E a coluna usa campos de viagem, atualiza viagem também
    const viagem = getViagemEmCurso();
    if (viagem && COLUMNS_INFO[coluna].fields.some(f => f !== 'manutencao_descricao' && f !== 'descricao_geral')) {
      const vPayload = readViagemPayload();
      if (Object.keys(vPayload).length > 0) {
        await api.patch(`/api/controle-viagens/viagens/${viagem.id}`, vPayload);
      }
    }
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
    await reload();
  } catch (e) {
    alert('Erro ao salvar: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}

export async function saveDescricao() {
  const desc = document.getElementById('cvDetDescricao').value;
  try {
    await api.patch(`/api/controle-viagens/truck/${state.truckId}/column`, { descricao_geral: desc });
    await reload();
  } catch (e) {
    alert('Erro ao salvar descrição: ' + e.message);
  }
}

export function switchModalTab(tab) {
  state.modalTab = tab;
  document.querySelectorAll('#cvModalTabs .cv-tab').forEach(b => b.classList.toggle('active', b.dataset.cvTab === tab));
  const left = document.querySelector('.cv-left-pane');
  const right = document.querySelector('.cv-viagens-pane');
  if (left)  { left.classList.toggle('active', tab !== 'viagens');
               left.classList.toggle('tab-detail',   tab === 'detail');
               left.classList.toggle('tab-activity', tab === 'activity'); }
  if (right) right.classList.toggle('active', tab === 'viagens');
}

export function toggleDetails() {
  const content = document.querySelector('#cvDetailModal .cv-modal-content');
  const btn = document.getElementById('cvToggleDetails');
  const showing = content.classList.toggle('cv-show-details');
  btn.textContent = showing ? 'Ocultar detalhes' : 'Mostrar detalhes';
}

export async function reload() {
  if (!state.truckId) return;
  try {
    state.data = await api.get(`/api/controle-viagens/truck/${state.truckId}`);
    // Sincroniza dropdown, fields e descrição com o estado do servidor
    const c = state.data.column || {};
    const sel = document.getElementById('cvDetStatus');
    if (sel) {
      sel.value = c.coluna || 'VAZIO_AGUARDANDO_CARGA';
      sel.style.borderColor = COLUMNS_INFO[sel.value]?.color || 'var(--border)';
    }
    const desc = document.getElementById('cvDetDescricao');
    if (desc) desc.value = c.descricao_geral || '';
    renderFields();
    const upd = document.getElementById('cvDetUpdated');
    if (upd) upd.textContent = c.updated_by ? `Última: ${c.updated_by.nome} · ${fmtPtBR(c.updated_at)}` : '';
    viagensPane.renderForTruck(state.data);
    activityPane.renderFor(state.data);
  } catch (e) {
    console.error('[cv modal reload]', e);
  }
}

export function getCurrentTruckId() { return state.truckId; }
export function getCurrentData() { return state.data; }
