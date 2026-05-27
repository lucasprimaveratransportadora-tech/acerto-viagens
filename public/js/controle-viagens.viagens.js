// controle-viagens.viagens.js — Painel direito do modal: lista, criar,
// editar e gerenciar transições de status das viagens do caminhão.

import { api } from './api.js';
import { esc } from './utils.js';
import * as modal from './controle-viagens.modal.js';

const state = {
  formMode: null, // 'create' ou 'edit'
  editingViagemId: null,
  collapsed: new Set(),  // ids de viagens colapsadas manualmente
};

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s); if (isNaN(d)) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function fmtMoney(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shouldCollapse(viagem) {
  if (state.collapsed.has(viagem.id)) return true;
  // Default: finalizada/cancelada colapsa; em curso/planejada expande
  if (state.collapsed.has(`!${viagem.id}`)) return false;
  return (viagem.status_viagem === 'FINALIZADA' || viagem.status_viagem === 'CANCELADA');
}

export function renderForTruck(data) {
  const list = document.getElementById('cvViagensList');
  const viagens = (data.viagens || []);
  if (!viagens.length) {
    list.innerHTML = '<div class="cv-muted" style="text-align:center;padding:1rem">Nenhuma viagem ainda. Clique "+ Nova carga".</div>';
    return;
  }
  // Ordena: EM_CURSO primeiro, depois PLANEJADA, depois FINALIZADA/CANCELADA mais recentes
  const order = { EM_CURSO: 0, PLANEJADA: 1, FINALIZADA: 2, CANCELADA: 3 };
  const sorted = [...viagens].sort((a, b) => {
    const o = (order[a.status_viagem] ?? 99) - (order[b.status_viagem] ?? 99);
    if (o !== 0) return o;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  list.innerHTML = sorted.map(renderViagemItem).join('');
}

function renderViagemItem(v) {
  const collapsed = shouldCollapse(v);
  const status = v.status_viagem.toLowerCase();
  const title  = v.origem || v.destino
    ? `${esc(v.origem || '?')} → ${esc(v.destino || '?')}`
    : esc(v.carga_descricao || 'Nova carga');
  const lines = [];
  if (v.fabrica)                  lines.push(`<b>Fábrica:</b> ${esc(v.fabrica)}`);
  if (v.cliente_descarga)         lines.push(`<b>Cliente:</b> ${esc(v.cliente_descarga)}`);
  if (v.carga_descricao)          lines.push(`<b>Carga:</b> ${esc(v.carga_descricao)}`);
  if (v.valor_frete != null)      lines.push(`<b>Valor:</b> ${esc(fmtMoney(v.valor_frete))}`);
  if (v.data_coleta)              lines.push(`<b>Coleta:</b> ${fmtDate(v.data_coleta)}`);
  if (v.data_carregamento)        lines.push(`<b>Carregamento:</b> ${fmtDate(v.data_carregamento)}`);
  if (v.data_agendamento_entrega) lines.push(`<b>Agend. entrega:</b> ${fmtDate(v.data_agendamento_entrega)}`);
  if (v.data_entrega_realizada)   lines.push(`<b>Entregue em:</b> ${fmtDate(v.data_entrega_realizada)}`);
  if (v.cancel_motivo)            lines.push(`<b>Motivo:</b> ${esc(v.cancel_motivo)}`);

  const actions = [];
  if (v.status_viagem === 'PLANEJADA') {
    actions.push(`<button class="btn btn-accent btn-sm" onclick="cv.startViagem('${esc(v.id)}')">Iniciar</button>`);
    actions.push(`<button class="btn btn-ghost btn-sm"  onclick="cv.editViagem('${esc(v.id)}')">Editar</button>`);
    actions.push(`<button class="btn btn-ghost btn-sm"  onclick="cv.cancelViagem('${esc(v.id)}')">Cancelar</button>`);
    actions.push(`<button class="btn btn-ghost btn-sm"  onclick="cv.deleteViagem('${esc(v.id)}')" style="color:var(--danger)">Apagar</button>`);
  } else if (v.status_viagem === 'EM_CURSO') {
    actions.push(`<button class="btn btn-accent btn-sm" onclick="cv.finalizeViagem('${esc(v.id)}')">Finalizar</button>`);
    actions.push(`<button class="btn btn-ghost btn-sm"  onclick="cv.editViagem('${esc(v.id)}')">Editar</button>`);
    actions.push(`<button class="btn btn-ghost btn-sm"  onclick="cv.cancelViagem('${esc(v.id)}')">Cancelar</button>`);
  } else if (v.status_viagem === 'FINALIZADA') {
    actions.push(`<button class="btn btn-ghost btn-sm" onclick="cv.editViagem('${esc(v.id)}')">Ver / Editar obs</button>`);
  }

  return `
    <div class="cv-viagem ${collapsed ? 'collapsed' : ''}" data-viagem-id="${esc(v.id)}">
      <div class="cv-viagem-hdr" onclick="cv.toggleViagem('${esc(v.id)}')">
        <div>
          <span class="cv-viagem-caret">${collapsed ? '▶' : '▼'}</span>
          <span class="cv-viagem-title">${title}</span>
        </div>
        <span class="cv-viagem-badge ${status}">${esc(v.status_viagem)}</span>
      </div>
      <div class="cv-viagem-body">${lines.join('<br>')}</div>
      <div class="cv-viagem-actions">${actions.join('')}</div>
    </div>`;
}

export function toggleCollapse(viagemId) {
  // Se já está manualmente colapsado, expande. Se já está expandido manualmente, recolhe.
  // Senão inverte o default.
  if (state.collapsed.has(viagemId)) {
    state.collapsed.delete(viagemId);
    state.collapsed.add(`!${viagemId}`);
  } else if (state.collapsed.has(`!${viagemId}`)) {
    state.collapsed.delete(`!${viagemId}`);
  } else {
    state.collapsed.add(viagemId);
  }
  const data = modal.getCurrentData?.();
  if (data) renderForTruck(data);
}

/* ============================================================
   FORM (nova carga / editar)
   ============================================================ */
function openFormModal() {
  const dlg = document.getElementById('cvViagemFormModal');
  dlg.classList.add('open');
  dlg.onclick = (e) => { if (e.target === dlg) closeViagemForm(); };
}

export function openNewViagem() {
  state.formMode = 'create';
  state.editingViagemId = null;
  document.getElementById('cvVgTitle').textContent = 'Nova carga';
  ['cvVgOrigem','cvVgDestino','cvVgCarga','cvVgFabrica','cvVgCliente','cvVgValor','cvVgColeta','cvVgAgend']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  openFormModal();
}

export function editViagem(viagemId) {
  const data = modal.getCurrentData?.();
  if (!data) return;
  const v = data.viagens.find(x => x.id === viagemId);
  if (!v) return;
  state.formMode = 'edit';
  state.editingViagemId = viagemId;
  document.getElementById('cvVgTitle').textContent = `Editar viagem`;
  document.getElementById('cvVgOrigem').value   = v.origem || '';
  document.getElementById('cvVgDestino').value  = v.destino || '';
  document.getElementById('cvVgCarga').value    = v.carga_descricao || '';
  document.getElementById('cvVgFabrica').value  = v.fabrica || '';
  document.getElementById('cvVgCliente').value  = v.cliente_descarga || '';
  document.getElementById('cvVgValor').value    = v.valor_frete ?? '';
  document.getElementById('cvVgColeta').value   = v.data_coleta ? new Date(v.data_coleta).toISOString().slice(0,10) : '';
  document.getElementById('cvVgAgend').value    = v.data_agendamento_entrega ? new Date(v.data_agendamento_entrega).toISOString().slice(0,10) : '';
  openFormModal();
}

export function closeViagemForm() {
  const dlg = document.getElementById('cvViagemFormModal');
  dlg.classList.remove('open');
  dlg.onclick = null;
  state.formMode = null;
  state.editingViagemId = null;
}

export async function saveViagemForm() {
  const truckId = modal.getCurrentTruckId?.();
  if (!truckId) return;
  const payload = {
    origem:                   document.getElementById('cvVgOrigem').value.trim()   || null,
    destino:                  document.getElementById('cvVgDestino').value.trim()  || null,
    carga_descricao:          document.getElementById('cvVgCarga').value.trim()    || null,
    fabrica:                  document.getElementById('cvVgFabrica').value.trim()  || null,
    cliente_descarga:         document.getElementById('cvVgCliente').value.trim()  || null,
    valor_frete:              document.getElementById('cvVgValor').value ? Number(document.getElementById('cvVgValor').value) : null,
    data_coleta:              document.getElementById('cvVgColeta').value || null,
    data_agendamento_entrega: document.getElementById('cvVgAgend').value  || null,
  };
  const btn = document.getElementById('cvVgSaveBtn');
  btn.disabled = true;
  try {
    if (state.formMode === 'create') {
      await api.post(`/api/controle-viagens/truck/${truckId}/viagens`, payload);
    } else {
      await api.patch(`/api/controle-viagens/viagens/${state.editingViagemId}`, payload);
    }
    closeViagemForm();
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

/* ============================================================
   TRANSIÇÕES DE STATUS
   ============================================================ */
export async function startViagem(viagemId) {
  try {
    await api.post(`/api/controle-viagens/viagens/${viagemId}/start`);
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro ao iniciar: ' + e.message);
  }
}

export async function finalizeViagem(viagemId) {
  const today = new Date().toISOString().slice(0,10);
  const dataEntrega = prompt('Data de entrega realizada? (YYYY-MM-DD)', today);
  if (dataEntrega === null) return;
  try {
    await api.post(`/api/controle-viagens/viagens/${viagemId}/finalize`, { data_entrega_realizada: dataEntrega || today });
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro ao finalizar: ' + e.message);
  }
}

export async function cancelViagem(viagemId) {
  const motivo = prompt('Motivo do cancelamento (opcional)');
  if (motivo === null) return;
  try {
    await api.post(`/api/controle-viagens/viagens/${viagemId}/cancel`, { motivo: motivo || null });
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro ao cancelar: ' + e.message);
  }
}

export async function deleteViagem(viagemId) {
  if (!confirm('Apagar essa viagem PLANEJADA? Esta ação não pode ser desfeita.')) return;
  try {
    await api.delete(`/api/controle-viagens/viagens/${viagemId}`);
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro ao apagar: ' + e.message);
  }
}
