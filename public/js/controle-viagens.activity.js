// controle-viagens.activity.js — Renderiza a timeline unificada do truck:
// COLUMN_MOVED, VIAGEM_*, COMMENT e COLUMN_FIELD_EDITED, em ordem.

import { api } from './api.js';
import { esc } from './utils.js';
import * as modal from './controle-viagens.modal.js';

const COLUMN_LABELS = {
  VAZIO_AGUARDANDO_CARGA: 'VAZIO',
  INDO_CARREGAR:          'INDO CARREGAR',
  NA_FABRICA:             'NA FÁBRICA',
  CARREGADO_EM_VIAGEM:    'CARREGADO',
  EM_DESCARGA_NO_CLIENTE: 'EM DESCARGA',
  EM_MANUTENCAO:          'MANUTENÇÃO',
};

const FIELD_LABELS = {
  origem: 'origem', destino: 'destino', carga_descricao: 'carga', fabrica: 'fábrica',
  cliente_descarga: 'cliente', valor_frete: 'valor frete',
  data_coleta: 'data coleta', data_carregamento: 'data carregamento',
  data_agendamento_entrega: 'data agendamento', observacoes: 'observações',
  manutencao_descricao: 'descrição manutenção', descricao_geral: 'descrição geral',
};

function fmtRel(s) {
  if (!s) return '';
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)    return 'agora';
  if (m < 60)   return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `há ${d}d`;
  return new Date(s).toLocaleDateString('pt-BR');
}

function fmtValue(v) {
  if (v == null) return '—';
  if (typeof v === 'number') return String(v);
  if (v instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d)) return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  return String(v);
}

function describe(event) {
  const author = `<b>${esc(event.author_nome || 'sistema')}</b>`;
  switch (event.tipo) {
    case 'COMMENT':
      return { iconClass: 'comment', icon: '●', text: esc(event.payload?.texto || '') };

    case 'COLUMN_MOVED': {
      const from = COLUMN_LABELS[event.payload?.from] || event.payload?.from || '?';
      const to   = COLUMN_LABELS[event.payload?.to]   || event.payload?.to   || '?';
      return { iconClass: 'column', icon: '↻', text: `${author} moveu de <b>${esc(from)}</b> → <b>${esc(to)}</b>` };
    }
    case 'COLUMN_FIELD_EDITED': {
      const f = FIELD_LABELS[event.payload?.field] || event.payload?.field || '?';
      return { iconClass: 'viagem-edit', icon: '✎',
               text: `${author} alterou <b>${esc(f)}</b>: ${esc(fmtValue(event.payload?.before))} → ${esc(fmtValue(event.payload?.after))}` };
    }
    case 'VIAGEM_CREATED':
      return { iconClass: 'viagem-add', icon: '✚', text: `${author} criou nova viagem` };
    case 'VIAGEM_STARTED':
      return { iconClass: 'viagem-add', icon: '▶', text: `${author} iniciou a viagem` };
    case 'VIAGEM_FIELD_EDITED': {
      const f = FIELD_LABELS[event.payload?.field] || event.payload?.field || '?';
      return { iconClass: 'viagem-edit', icon: '✎',
               text: `${author} alterou <b>${esc(f)}</b>: ${esc(fmtValue(event.payload?.before))} → ${esc(fmtValue(event.payload?.after))}` };
    }
    case 'VIAGEM_FINALIZED':
      return { iconClass: 'viagem-end', icon: '🏁', text: `${author} finalizou a viagem` };
    case 'VIAGEM_CANCELLED':
      return { iconClass: 'viagem-x', icon: '✕', text: `${author} cancelou a viagem` + (event.payload?.motivo ? ` — ${esc(event.payload.motivo)}` : '') };
    case 'VIAGEM_DELETED':
      return { iconClass: 'viagem-x', icon: '🗑', text: `${author} apagou viagem planejada` };
    default:
      return { iconClass: 'column', icon: '?', text: `${author} ${esc(event.tipo)}` };
  }
}

const VISIBLE_LIMIT = 5;
let expanded = false;

export function renderFor(data) {
  const list = document.getElementById('cvActivityList');
  const events = data.activity || [];
  if (!events.length) {
    list.innerHTML = '<div class="cv-muted" style="text-align:center;padding:1rem">Sem atividade ainda. Faça uma movimentação ou comentário.</div>';
    return;
  }
  const me = window.__currentUser || null;
  const meId = me?.id || null;
  const isAdmin = me?.role === 'ADMIN';

  // Recolhido: SÓ comentários humanos. Expandido: tudo (incluindo movimentações).
  const visibleEvents = expanded ? events : events.filter(e => e.tipo === 'COMMENT');
  const hidden = events.length - visibleEvents.length;

  const eventsHtml = visibleEvents.map(ev => {
    const d = describe(ev);
    const canDelete = ev.tipo === 'COMMENT' && (isAdmin || (ev.author_id && ev.author_id === meId));
    return `
      <div class="cv-event" data-event-id="${esc(ev.id)}">
        <div class="cv-event-icon ${d.iconClass}">${d.icon}</div>
        <div class="cv-event-body">
          <div class="cv-event-head">
            ${d.text}
            <span> · ${fmtRel(ev.created_at)}</span>
            ${canDelete ? `<button class="cv-event-delete" onclick="cv.deleteComment('${esc(ev.id)}')" title="Apagar">apagar</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  const emptyHint = !expanded && visibleEvents.length === 0
    ? '<div class="cv-muted" style="padding:.5rem 0;font-size:.78rem">Nenhum comentário ainda. Mostre todo o histórico em "Ver mais".</div>'
    : '';

  const more = (hidden > 0 || expanded)
    ? `<div style="margin-bottom:.5rem"><button class="btn btn-ghost btn-sm" onclick="cv.toggleActivityExpand()">${
        expanded ? '▲ Mostrar só comentários' : `▼ Ver tudo (${hidden} movimentações)`
      }</button></div>`
    : '';

  list.innerHTML = more + emptyHint + eventsHtml;
}

export function toggleExpand() {
  expanded = !expanded;
  const data = modal.getCurrentData?.();
  if (data) renderFor(data);
}

export async function submitComment() {
  const truckId = modal.getCurrentTruckId?.();
  if (!truckId) return;
  const input = document.getElementById('cvCommentInput');
  const texto = (input.value || '').trim();
  if (!texto) return;
  try {
    await api.post(`/api/controle-viagens/truck/${truckId}/comments`, { texto });
    input.value = '';
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro ao enviar comentário: ' + e.message);
  }
}

export async function deleteComment(eventId) {
  if (!confirm('Apagar este comentário?')) return;
  try {
    await api.delete(`/api/controle-viagens/activity/${eventId}`);
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro ao apagar: ' + e.message);
  }
}
