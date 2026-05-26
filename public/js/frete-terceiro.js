// frete-terceiro.js — Módulo Controle de Frete Terceiro
//
// Visão pública: window.ft.* expõe ações chamadas pelos onclick do HTML.

import { api } from './api.js';
import { esc, fmtD } from './utils.js';

const state = {
  items: [],
  trucks: [],
  filters: { status: '', truck_id: '', q: '', from: '', to: '' },
  editingId: null,
  baixaTargetId: null,
  detailsId: null,         // frete aberto no modal de detalhes
  detailsItem: null,       // dados completos com baixas/anexos
  loaded: false,
};

function fmtBRL(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
// fmtDate antes fazia new Date(ISO) direto — em UTC-3 (Brasil), uma
// data armazenada como 2025-09-19T00:00:00.000Z exibia 18/09/2025
// (offset de 1 dia atrás). Agora delega pro fmtD do utils.js que faz
// slice(0,10) + T12:00:00 pra preservar o dia exato.
const fmtDate = fmtD;
function dateISO(d = new Date()) { return new Date(d).toISOString().slice(0, 10); }
function statusPill(s) {
  const map = {
    ABERTO:       ['aberto', 'Aberto'],
    PAGO_PARCIAL: ['parcial', 'Parcial'],
    PAGO:         ['pago',   'Pago'],
    CANCELADO:    ['cancelado', 'Cancelado'],
  };
  const [cls, lbl] = map[s] || ['aberto', s];
  return `<span class="ft-pill ${cls}">${lbl}</span>`;
}
function pagamentoLabel(p) { return p === 'ADIANTAMENTO_SALDO' ? 'Adi+Saldo' : 'Integral'; }

function showErrorBanner(msg) {
  const inner = document.querySelector('#freteTerceiroView .ft-inner');
  if (!inner) return;
  let bnr = document.getElementById('ftErrorBanner');
  if (!bnr) {
    bnr = document.createElement('div');
    bnr.id = 'ftErrorBanner';
    bnr.className = 'ft-error-banner';
    inner.insertBefore(bnr, inner.firstChild);
  }
  bnr.textContent = msg;
}
function clearErrorBanner() {
  const bnr = document.getElementById('ftErrorBanner');
  if (bnr) bnr.remove();
}

/* ---------- API helpers ---------- */
async function loadAll() {
  const qs = new URLSearchParams(Object.entries(state.filters).filter(([_, v]) => v !== '' && v != null));
  try {
    const [items, sum, trucks] = await Promise.all([
      api.get(`/api/fretes-terceiros?${qs.toString()}`),
      api.get('/api/fretes-terceiros/summary'),
      api.get('/api/trucks').catch(() => []),
    ]);
    state.items = items;
    state.trucks = trucks;
    clearErrorBanner();
    renderKpis(sum);
    renderTable();
    renderTruckSelects();
  } catch (e) {
    showErrorBanner('Erro ao carregar fretes: ' + (e.message || 'falha desconhecida') + '. Recarregue a página ou volte ao hub.');
    renderKpis({ aberto: 0, adiantado: 0, pagoMes: 0, qtdMes: 0 });
    state.items = [];
    renderTable();
  }
}

/* ---------- KPIs ---------- */
function renderKpis(sum) {
  const map = {
    kpiAberto:     fmtBRL(sum.aberto),
    kpiAdiantado:  fmtBRL(sum.adiantado),
    kpiPagoMes:    fmtBRL(sum.pagoMes),
    kpiQtdMes:     String(sum.qtdMes),
  };
  for (const [id, v] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }
}

/* ---------- TABLE ---------- */
function renderTable() {
  const tbody = document.getElementById('ftTbody');
  if (!tbody) return;
  if (!state.items.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="ft-empty">Nenhum frete lançado ainda. Clique em <b>+ Novo Frete</b> para começar.</td></tr>';
    return;
  }
  tbody.innerHTML = state.items.map(f => {
    const total = Number(f.valor_total);
    const pago  = Number(f.valor_pago);
    const saldo = total - pago;
    const linked = f.trip_id ? `<span class="ft-trip-badge">VIAGEM</span>` : '';
    const canBaixar = f.status === 'ABERTO' || f.status === 'PAGO_PARCIAL';
    const rota = (f.origem || f.destino) ? `<div class="ft-row-meta">${esc(f.origem || '—')} → ${esc(f.destino || '—')}</div>` : '';
    return `<tr class="clickable ${f.trip_id ? 'linked' : ''}" onclick="ft.openDetails('${esc(f.id)}')">
      <td class="mono" data-label="Data">${fmtDate(f.data)}</td>
      <td data-label="Empresa"><div>${esc(f.empresa_pagadora)}</div>${rota}</td>
      <td data-label="Motorista">${esc(f.motorista)}</td>
      <td class="mono" data-label="Veículo">${esc(f.veiculo)} ${linked}</td>
      <td class="mono" data-label="Pagto">${pagamentoLabel(f.forma_pagamento)}</td>
      <td class="right mono" data-label="Valor">${fmtBRL(total)}</td>
      <td class="right mono" data-label="Saldo" style="color:${saldo > 0 ? '#f59e0b' : 'var(--success)'}">${fmtBRL(saldo)}</td>
      <td data-label="Status">${statusPill(f.status)}</td>
      <td data-label="Ações" onclick="event.stopPropagation()">
        <div class="actions">
          ${canBaixar ? `<button class="green" onclick="ft.openBaixa('${esc(f.id)}')" title="Dar baixa de pagamento">✓ Baixar</button>` : ''}
          <button onclick="ft.openEdit('${esc(f.id)}')" title="Editar">Editar</button>
          <button class="danger" onclick="ft.confirmRemove('${esc(f.id)}')" title="Remover">×</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderTruckSelects() {
  // Opção mostra só PLACA · MODELO (motorista vai pra input separado via onTruckChange)
  const optsFrete = `<option value="">— Selecione o caminhão —</option>` +
    state.trucks.map(t => `<option value="${esc(t.id)}" data-placa="${esc(t.placa)}" data-motorista="${esc(t.motorista || '')}">${esc(t.placa)}${t.modelo ? ' · '+esc(t.modelo) : ''}</option>`).join('');
  ['ftTruck','ftFilterTruck'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    if (id === 'ftFilterTruck') {
      el.innerHTML = `<option value="">Todos caminhões</option>` + state.trucks.map(t => `<option value="${esc(t.id)}">${esc(t.placa)}</option>`).join('');
    } else {
      el.innerHTML = optsFrete;
    }
    el.value = cur;
  });
}

function onTruckChange() {
  const sel = document.getElementById('ftTruck');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return;
  const motoristaSugerido = opt.getAttribute('data-motorista') || '';
  const inp = document.getElementById('ftMotorista');
  if (inp && !inp.value.trim() && motoristaSugerido) inp.value = motoristaSugerido;
}

/* ---------- FILTERS ---------- */
function applyFilters() {
  state.filters.status   = document.getElementById('ftFilterStatus').value;
  state.filters.truck_id = document.getElementById('ftFilterTruck').value;
  state.filters.q        = document.getElementById('ftFilterQ').value.trim();
  state.filters.from     = document.getElementById('ftFilterFrom').value;
  state.filters.to       = document.getElementById('ftFilterTo').value;
  loadAll().catch(err => alert('Erro: ' + err.message));
}
function clearFilters() {
  ['ftFilterStatus','ftFilterTruck','ftFilterQ','ftFilterFrom','ftFilterTo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  state.filters = { status: '', truck_id: '', q: '', from: '', to: '' };
  loadAll().catch(err => alert('Erro: ' + err.message));
}

/* ---------- MODAL FRETE (novo/editar) ---------- */
function openNew() {
  state.editingId = null;
  document.getElementById('ftModalTitle').textContent = '+ Novo Frete Terceiro';
  document.getElementById('ftEmpresa').value   = '';
  document.getElementById('ftData').value      = dateISO();
  document.getElementById('ftMotorista').value = '';
  document.getElementById('ftTruck').value     = '';
  document.getElementById('ftOrigem').value    = '';
  document.getElementById('ftDestino').value   = '';
  document.getElementById('ftValor').value     = '';
  document.getElementById('ftAdi').value       = '';
  document.getElementById('ftObs').value       = '';
  setPagamento('INTEGRAL');
  updateSaldoPreview();
  document.getElementById('ftFreteModal').classList.add('open');
}
async function openEdit(id) {
  state.editingId = id;
  let f = state.items.find(x => x.id === id);
  if (!f) {
    try { f = await api.get(`/api/fretes-terceiros/${id}`); }
    catch (e) { alert('Falha ao carregar frete: ' + e.message); return; }
  }
  document.getElementById('ftModalTitle').textContent = 'Editar Frete Terceiro';
  document.getElementById('ftEmpresa').value   = f.empresa_pagadora || '';
  document.getElementById('ftData').value      = dateISO(f.data);
  document.getElementById('ftMotorista').value = f.motorista || '';
  document.getElementById('ftTruck').value     = f.truck_id || '';
  document.getElementById('ftOrigem').value    = f.origem  || '';
  document.getElementById('ftDestino').value   = f.destino || '';
  document.getElementById('ftValor').value     = Number(f.valor_total) || '';
  document.getElementById('ftAdi').value       = Number(f.valor_adiantamento) || '';
  document.getElementById('ftObs').value       = f.observacoes || '';
  setPagamento(f.forma_pagamento || 'INTEGRAL');
  updateSaldoPreview();
  document.getElementById('ftFreteModal').classList.add('open');
}

function setPagamento(p) {
  document.querySelectorAll('[data-ft-pag]').forEach(el => {
    el.classList.toggle('active', el.dataset.ftPag === p);
    const inp = el.querySelector('input[type=radio]');
    if (inp) inp.checked = (el.dataset.ftPag === p);
  });
  document.getElementById('ftAdiRow').style.display = p === 'ADIANTAMENTO_SALDO' ? '' : 'none';
  if (p === 'INTEGRAL') document.getElementById('ftAdi').value = '';
  updateSaldoPreview();
}

function updateSaldoPreview() {
  const total = Number(document.getElementById('ftValor').value || 0);
  const adi   = Number(document.getElementById('ftAdi').value || 0);
  const forma = document.querySelector('[data-ft-pag].active')?.dataset.ftPag || 'INTEGRAL';
  const saldo = total - adi;
  const el = document.getElementById('ftSaldoPreview');
  if (!el) return;
  if (forma === 'ADIANTAMENTO_SALDO' && adi > 0) {
    el.innerHTML = `
      <span class="lbl">Total</span><span class="val">${fmtBRL(total)}</span>
      <span class="lbl">1ª parcela (adiantamento)</span><span class="val warn">${fmtBRL(adi)}</span>
      <span class="lbl">2ª parcela (saldo)</span><span class="val ok">${fmtBRL(saldo)}</span>
    `;
  } else {
    el.innerHTML = `
      <span class="lbl">Total a receber</span><span class="val ok">${fmtBRL(total)}</span>
    `;
  }
}

async function save() {
  const forma = document.querySelector('[data-ft-pag].active')?.dataset.ftPag || 'INTEGRAL';
  const truckId = document.getElementById('ftTruck').value || null;
  const body = {
    empresa_pagadora: document.getElementById('ftEmpresa').value.trim(),
    data:             document.getElementById('ftData').value,
    motorista:        document.getElementById('ftMotorista').value.trim(),
    truck_id:         truckId,
    origem:           document.getElementById('ftOrigem').value.trim()  || null,
    destino:          document.getElementById('ftDestino').value.trim() || null,
    valor_total:      Number(document.getElementById('ftValor').value || 0),
    valor_adiantamento: forma === 'ADIANTAMENTO_SALDO' ? Number(document.getElementById('ftAdi').value || 0) : 0,
    forma_pagamento:  forma,
    observacoes:      document.getElementById('ftObs').value || null,
  };
  if (!body.empresa_pagadora || !body.motorista || !body.truck_id || !body.valor_total) {
    alert('Preencha empresa, caminhão, motorista e valor.');
    return;
  }

  // Trava o botão durante o save — evita double-submit duplicar frete.
  const saveBtn = document.querySelector('button[onclick*="ft.save"]');
  const originalLabel = saveBtn?.textContent;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando...'; }

  try {
    if (state.editingId) {
      await api.patch(`/api/fretes-terceiros/${state.editingId}`, body);
    } else {
      await api.post('/api/fretes-terceiros', body);
    }
    document.getElementById('ftFreteModal').classList.remove('open');
    await loadAll();
  } catch (e) {
    alert('Erro ao salvar: ' + e.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalLabel; }
  }
}

/* ---------- MODAL BAIXA ---------- */
async function openBaixa(id) {
  let f = state.items.find(x => x.id === id);
  if (!f) {
    try { f = await api.get(`/api/fretes-terceiros/${id}`); }
    catch (e) { alert('Frete não encontrado: ' + e.message); return; }
  }
  state.baixaTargetId = id;
  const total = Number(f.valor_total);
  const adi   = Number(f.valor_adiantamento);
  const pago  = Number(f.valor_pago);
  const saldoTotal = total - pago;

  // Para fretes Adiantamento+Saldo:
  //   - 1ª parcela esperada = adiantamento (se ainda não recebido)
  //   - 2ª parcela esperada = total - adiantamento (saldo) ou o que faltar
  let proximaParcela = saldoTotal;
  let parcelaLabel = 'Saldo a receber';
  if (f.forma_pagamento === 'ADIANTAMENTO_SALDO') {
    if (pago < adi - 0.001) {
      // Não pode sugerir mais do que ainda falta no total
      proximaParcela = Math.min(adi - pago, saldoTotal);
      parcelaLabel = '1ª parcela — Adiantamento';
    } else {
      proximaParcela = saldoTotal;
      parcelaLabel = '2ª parcela — Saldo final';
    }
  }
  if (proximaParcela < 0) proximaParcela = saldoTotal;

  const breakdown = f.forma_pagamento === 'ADIANTAMENTO_SALDO'
    ? `
      <span class="lbl">1ª parcela (adiantamento)</span><span class="val">${fmtBRL(adi)}</span>
      <span class="lbl">2ª parcela (saldo)</span><span class="val">${fmtBRL(total - adi)}</span>`
    : `
      <span class="lbl">Pagamento</span><span class="val">Integral</span>`;

  document.getElementById('ftBaixaInfo').innerHTML = `
    <div class="ft-saldo-bar">
      <span class="lbl">Empresa</span><span class="val">${esc(f.empresa_pagadora)}</span>
      <span class="lbl">Total</span><span class="val">${fmtBRL(total)}</span>
      ${breakdown}
      <span class="lbl">Já recebido</span><span class="val ok">${fmtBRL(pago)}</span>
      <span class="lbl">Saldo em aberto</span><span class="val warn">${fmtBRL(saldoTotal)}</span>
    </div>
    <div style="margin-top:.7rem;padding:.55rem .8rem;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.25);border-radius:5px;font-size:.78rem">
      <b>Próxima parcela:</b> <span style="font-family:'IBM Plex Mono',monospace;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-size:.7rem">${parcelaLabel}</span>
      <span style="float:right;font-family:'Bebas Neue',sans-serif;font-size:1.2rem;color:#f59e0b;letter-spacing:1px">${fmtBRL(proximaParcela)}</span>
    </div>`;
  document.getElementById('ftBaixaValor').value = proximaParcela.toFixed(2);
  document.getElementById('ftBaixaData').value  = dateISO();
  document.getElementById('ftBaixaObs').value   = '';
  document.getElementById('ftBaixaModal').classList.add('open');
}

async function confirmBaixa() {
  const id = state.baixaTargetId;
  if (!id) return;
  const body = {
    valor: Number(document.getElementById('ftBaixaValor').value || 0),
    data_pagamento: document.getElementById('ftBaixaData').value,
    observacoes: document.getElementById('ftBaixaObs').value || null,
  };
  if (!body.valor || body.valor <= 0) { alert('Valor inválido.'); return; }
  const btn = document.querySelector('#ftBaixaModal .modal-actions .btn-accent');
  if (btn) btn.disabled = true;
  try {
    await api.post(`/api/fretes-terceiros/${id}/baixar`, body);
    document.getElementById('ftBaixaModal').classList.remove('open');
    await loadAll();
    // Se o modal de detalhes está aberto pra este frete, atualiza
    if (state.detailsId === id) {
      try {
        const f = await api.get(`/api/fretes-terceiros/${id}?details=1`);
        state.detailsItem = f;
        renderDetalhes(f);
      } catch { /* ignore */ }
    }
  } catch (e) {
    alert('Erro: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ============================================================
   DETALHES — cabeçalho + pagamentos + anexos
   ============================================================ */
async function openDetails(id) {
  state.detailsId = id;
  document.getElementById('ftDetTitle').textContent = 'Detalhes do Frete';
  document.getElementById('ftDetHeader').innerHTML = '<div class="ft-loading">Carregando…</div>';
  document.getElementById('ftDetBaixas').innerHTML = '';
  document.getElementById('ftDetAnexos').innerHTML = '';
  document.getElementById('ftDetalhesModal').classList.add('open');
  try {
    const f = await api.get(`/api/fretes-terceiros/${id}?details=1`);
    state.detailsItem = f;
    renderDetalhes(f);
  } catch (e) {
    document.getElementById('ftDetHeader').innerHTML = `<div style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
  }
}

function parcelaPill(p) {
  const map = { ADIANTAMENTO: ['adi','Adiantamento'], SALDO: ['sal','Saldo final'], INTEGRAL: ['','Integral'], AVULSO: ['','Avulso'] };
  const [cls, lbl] = map[p] || ['', p || '—'];
  return `<span class="parc ${cls}">${lbl}</span>`;
}

function anexoIcon(tipo) {
  return ({
    COMPROVANTE_PAGAMENTO: '💵',
    CTE: '📄',
    RECIBO: '🧾',
    OUTRO: '📎',
  })[tipo] || '📎';
}

function anexoTipoLabel(tipo) {
  return ({
    COMPROVANTE_PAGAMENTO: 'Comprovante',
    CTE: 'CT-e',
    RECIBO: 'Recibo',
    OUTRO: 'Anexo',
  })[tipo] || tipo;
}

function renderDetalhes(f) {
  const total = Number(f.valor_total);
  const adi   = Number(f.valor_adiantamento);
  const pago  = Number(f.valor_pago);
  const saldo = total - pago;
  const breakdown = f.forma_pagamento === 'ADIANTAMENTO_SALDO'
    ? `<div><div class="lbl">1ª parcela (adiantamento)</div><div class="val">${fmtBRL(adi)}</div></div>
       <div><div class="lbl">2ª parcela (saldo)</div><div class="val">${fmtBRL(total - adi)}</div></div>`
    : `<div><div class="lbl">Pagamento</div><div class="val">Integral</div></div>
       <div></div>`;
  const rota = (f.origem || f.destino)
    ? `<div class="full"><div class="lbl">Rota</div><div class="val">${esc(f.origem || '—')} → ${esc(f.destino || '—')}</div></div>`
    : '';
  const viagem = f.trip
    ? `<div class="full"><div class="lbl">Viagem vinculada</div><div class="val">${fmtDate(f.trip.data_inicio)} · ${esc(f.trip.origem || '—')} → ${esc(f.trip.destino || '—')}</div></div>`
    : '';

  document.getElementById('ftDetHeader').innerHTML = `
    <div><div class="lbl">Empresa pagadora</div><div class="val">${esc(f.empresa_pagadora)}</div></div>
    <div><div class="lbl">Data do frete</div><div class="val">${fmtDate(f.data)}</div></div>
    <div><div class="lbl">Motorista</div><div class="val">${esc(f.motorista)}</div></div>
    <div><div class="lbl">Veículo / Placa</div><div class="val">${esc(f.veiculo)}</div></div>
    ${rota}
    <div><div class="lbl">Valor total</div><div class="val big">${fmtBRL(total)}</div></div>
    <div><div class="lbl">Status / Saldo</div><div class="val big ${saldo > 0 ? 'warn' : 'ok'}">${fmtBRL(saldo)} <span style="font-size:.7rem;letter-spacing:2px;margin-left:6px">${statusPill(f.status)}</span></div></div>
    ${breakdown}
    ${viagem}
  `;

  // Toggle "Adicionar Baixa" se já está PAGO/CANCELADO
  const canBaixar = f.status === 'ABERTO' || f.status === 'PAGO_PARCIAL';
  const baixarBtn = document.getElementById('ftDetBaixarBtn');
  if (baixarBtn) baixarBtn.style.display = canBaixar ? '' : 'none';

  renderBaixas(f);
  renderAnexos(f);
}

function renderBaixas(f) {
  const wrap = document.getElementById('ftDetBaixas');
  if (!f.baixas || !f.baixas.length) {
    wrap.innerHTML = '<div class="ft-empty-mini">Nenhuma baixa registrada. Clique em <b>+ Adicionar Baixa</b> quando o pagamento chegar.</div>';
    return;
  }
  wrap.innerHTML = '<div class="ft-baixa-list">' + f.baixas.map(b => `
    <div class="ft-baixa-item">
      ${parcelaPill(b.parcela)}
      <span class="data">${fmtDate(b.data_pagamento)}</span>
      <span class="valor">${fmtBRL(b.valor)}</span>
      <span class="meta">${b.baixou_por ? 'por ' + esc(b.baixou_por.nome) : ''}${b.observacoes ? ' · ' + esc(b.observacoes) : ''}</span>
      <div class="actions"><button onclick="ft.removeBaixa('${esc(b.id)}')">Estornar</button></div>
    </div>
  `).join('') + '</div>';
}

function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function renderAnexos(f) {
  const wrap = document.getElementById('ftDetAnexos');
  if (!f.anexos || !f.anexos.length) {
    wrap.innerHTML = '<div class="ft-empty-mini">Nenhum anexo. Envie o comprovante de pagamento, CT-e ou recibo.</div>';
    return;
  }
  wrap.innerHTML = '<div class="ft-anexo-list">' + f.anexos.map(a => {
    // Se foi upload (tem mime_type/tamanho), aponta pro endpoint de download.
    // Senão, é URL externa.
    const isUpload = !!(a.mime_type || a.tamanho) || (!a.url && !!a.id);
    const href = isUpload
      ? `/api/fretes-terceiros/${state.detailsId}/anexos/${a.id}/download`
      : (a.url || '#');
    const sizeLbl = a.tamanho ? ` · ${fmtSize(a.tamanho)}` : '';
    const openLabel = isUpload ? 'Visualizar' : 'Abrir';
    const dlAttr = isUpload ? `onclick="ft.openAnexoFile(event, '${esc(a.id)}')"` : '';
    return `
    <div class="ft-anexo-item">
      <span class="ico">${anexoIcon(a.tipo)}</span>
      <div class="info">
        <div class="nome">${esc(a.nome)} <span style="font-size:.65rem;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-left:4px">${anexoTipoLabel(a.tipo)}</span></div>
        <div class="desc">${esc(a.descricao || '')}${sizeLbl}${a.created_by ? ((a.descricao || sizeLbl) ? ' · ' : '') + 'por ' + esc(a.created_by.nome) : ''}</div>
      </div>
      <a href="${esc(href)}" target="_blank" rel="noopener" ${dlAttr}>${openLabel}</a>
      <div class="actions"><button onclick="ft.removeAnexo('${esc(a.id)}')">Excluir</button></div>
    </div>`;
  }).join('') + '</div>';
}

// Estado do preview atual (pra revogar blob URL ao fechar)
state.previewUrl = null;

function cleanupPreview() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }
  // Outros módulos podem ter publicado uma blob URL no mesmo modal
  // (ex.: veiculos.js). Revoga via hook global.
  if (window.__previewCleanupHooks) {
    for (const fn of window.__previewCleanupHooks) {
      try { fn(); } catch { /* */ }
    }
  }
  const body = document.getElementById('ftPrevBody');
  if (body) body.innerHTML = '';
}

function closeAnexoPreview() {
  document.getElementById('ftAnexoPreviewModal').classList.remove('open');
  cleanupPreview();
}

// Observa o modal de preview pra revogar a blob URL quando fechar por
// qualquer caminho (Esc, click no overlay, ou closeModal global)
function wirePreviewCleanup() {
  const modal = document.getElementById('ftAnexoPreviewModal');
  if (!modal || modal.__cleanupWired) return;
  modal.__cleanupWired = true;
  let wasOpen = modal.classList.contains('open');
  const obs = new MutationObserver(() => {
    const isOpen = modal.classList.contains('open');
    if (wasOpen && !isOpen) cleanupPreview();
    wasOpen = isOpen;
  });
  obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

async function openAnexoFile(ev, anexoId) {
  ev.preventDefault();
  const anexo = (state.detailsItem?.anexos || []).find(a => a.id === anexoId);
  const nome = anexo?.nome || 'Anexo';
  const mime = anexo?.mime_type || '';
  const body = document.getElementById('ftPrevBody');
  document.getElementById('ftPrevTitle').textContent = nome;
  body.innerHTML = '<div class="ft-prev-loading">Carregando…</div>';
  document.getElementById('ftAnexoPreviewModal').classList.add('open');

  try {
    const token = sessionStorage.getItem('accessToken');
    const res = await fetch(`/api/fretes-terceiros/${state.detailsId}/anexos/${anexoId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) {
      body.innerHTML = `<div class="ft-prev-fallback">Erro ${res.status} ao baixar anexo.</div>`;
      return;
    }
    const blob = await res.blob();
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(blob);

    // Link de download alternativo
    const dl = document.getElementById('ftPrevDownload');
    if (dl) {
      dl.href = state.previewUrl;
      dl.setAttribute('download', nome);
    }

    const effectiveMime = mime || blob.type || '';
    if (effectiveMime.startsWith('image/')) {
      body.innerHTML = `<img alt="${esc(nome)}" src="${state.previewUrl}">`;
    } else if (effectiveMime === 'application/pdf') {
      body.innerHTML = `<iframe src="${state.previewUrl}#toolbar=1&navpanes=0" title="${esc(nome)}"></iframe>`;
    } else {
      body.innerHTML = `
        <div class="ft-prev-fallback">
          Tipo de arquivo (${esc(effectiveMime || 'desconhecido')}) não pode ser visualizado direto.<br>
          Use o botão <b>Baixar</b> acima.
        </div>`;
    }
  } catch (e) {
    body.innerHTML = `<div class="ft-prev-fallback">Erro: ${esc(e.message)}</div>`;
  }
}

function openBaixaFromDetails() {
  if (!state.detailsId) return;
  // Fecha temporariamente o details para mostrar o modal de baixa por cima
  openBaixa(state.detailsId);
}

function openEditFromDetails() {
  if (!state.detailsId) return;
  document.getElementById('ftDetalhesModal').classList.remove('open');
  openEdit(state.detailsId);
}

function switchAnexoMode(mode) {
  state.anexoMode = mode;
  document.querySelectorAll('[data-anexo-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.anexoMode === mode);
  });
  document.getElementById('ftAnexoFileSection').style.display = mode === 'file' ? '' : 'none';
  document.getElementById('ftAnexoUrlSection').style.display  = mode === 'url'  ? '' : 'none';
}

function setSelectedFile(file) {
  state.anexoFile = file || null;
  const dz = document.getElementById('ftAnexoDropzone');
  const content = document.getElementById('ftAnexoDropzoneContent');
  if (!dz || !content) return;
  if (file) {
    dz.classList.add('has-file');
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    content.innerHTML = `
      <div style="font-size:2rem;line-height:1">✅</div>
      <div><b>${esc(file.name)}</b></div>
      <div style="font-size:.7rem;color:var(--muted);margin-top:4px">${sizeMB} MB · ${esc(file.type || 'arquivo')}</div>
      <div style="font-size:.66rem;color:var(--muted);margin-top:4px">Clique pra trocar</div>
    `;
    // Sugere nome do arquivo se o campo nome estiver vazio
    const nomeEl = document.getElementById('ftAnexoNome');
    if (nomeEl && !nomeEl.value.trim()) nomeEl.value = file.name.replace(/\.[^.]+$/, '');
  } else {
    dz.classList.remove('has-file');
    content.innerHTML = `
      <div style="font-size:2rem;line-height:1">📂</div>
      <div><b>Clique para selecionar</b> ou arraste o arquivo aqui</div>
      <div style="font-size:.7rem;color:var(--muted);margin-top:4px">PDF, JPG, PNG ou WEBP até 10 MB</div>
    `;
  }
}

function wireAnexoModal() {
  const dz   = document.getElementById('ftAnexoDropzone');
  const inp  = document.getElementById('ftAnexoFile');
  if (!dz || !inp) return;
  dz.addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0];
    if (f) setSelectedFile(f);
  });
  ['dragenter','dragover'].forEach(evt => dz.addEventListener(evt, e => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.add('dragover');
  }));
  ['dragleave','drop'].forEach(evt => dz.addEventListener(evt, e => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.remove('dragover');
  }));
  dz.addEventListener('drop', e => {
    const f = e.dataTransfer?.files?.[0];
    if (f) {
      // sincroniza no input pra ser consistente
      const dt = new DataTransfer();
      dt.items.add(f);
      inp.files = dt.files;
      setSelectedFile(f);
    }
  });
}

function openAddAnexo() {
  if (!state.detailsId) { alert('Abra o frete pelo detalhe primeiro.'); return; }
  document.getElementById('ftAnexoTipo').value = 'COMPROVANTE_PAGAMENTO';
  document.getElementById('ftAnexoNome').value = '';
  document.getElementById('ftAnexoUrl').value  = '';
  document.getElementById('ftAnexoDesc').value = '';
  const inp = document.getElementById('ftAnexoFile');
  if (inp) inp.value = '';
  setSelectedFile(null);
  switchAnexoMode('file');
  document.getElementById('ftAnexoProgress').style.display = 'none';
  document.getElementById('ftAnexoProgressFill').style.width = '0%';
  document.getElementById('ftAnexoModal').classList.add('open');
}

function uploadXHR(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    const token = sessionStorage.getItem('accessToken');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) onProgress(Math.round(ev.loaded / ev.total * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { resolve(xhr.responseText); }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try { const j = JSON.parse(xhr.responseText); msg = j.error || msg; } catch { /* */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Falha de rede no upload.'));
    xhr.send(formData);
  });
}

async function saveAnexo() {
  if (!state.detailsId) return;
  const tipo = document.getElementById('ftAnexoTipo').value;
  const nome = document.getElementById('ftAnexoNome').value.trim();
  const desc = document.getElementById('ftAnexoDesc').value.trim();
  const mode = state.anexoMode || 'file';
  const btn  = document.querySelector('#ftAnexoModal .modal-actions .btn-accent');
  if (btn) btn.disabled = true;

  try {
    if (mode === 'file') {
      const file = state.anexoFile;
      if (!file) { alert('Selecione um arquivo.'); return; }
      if (file.size > 10 * 1024 * 1024) { alert('Arquivo maior que 10 MB.'); return; }
      const fd = new FormData();
      fd.append('arquivo', file);
      fd.append('tipo', tipo);
      if (nome) fd.append('nome', nome);
      if (desc) fd.append('descricao', desc);

      const prog = document.getElementById('ftAnexoProgress');
      const fill = document.getElementById('ftAnexoProgressFill');
      const lbl  = document.getElementById('ftAnexoProgressLbl');
      prog.style.display = '';
      fill.style.width = '0%';
      lbl.textContent = 'Enviando 0%';

      await uploadXHR(`/api/fretes-terceiros/${state.detailsId}/anexos/upload`, fd, p => {
        fill.style.width = p + '%';
        lbl.textContent = p < 100 ? `Enviando ${p}%` : 'Processando…';
      });
    } else {
      const url = document.getElementById('ftAnexoUrl').value.trim();
      if (!nome || !url) { alert('Preencha nome e URL.'); return; }
      await api.post(`/api/fretes-terceiros/${state.detailsId}/anexos`, {
        tipo, nome, url, descricao: desc || null,
      });
    }

    document.getElementById('ftAnexoModal').classList.remove('open');
    const f = await api.get(`/api/fretes-terceiros/${state.detailsId}?details=1`);
    state.detailsItem = f;
    renderAnexos(f);
  } catch (e) {
    alert('Erro: ' + e.message);
  } finally {
    document.getElementById('ftAnexoProgress').style.display = 'none';
    if (btn) btn.disabled = false;
  }
}

async function removeAnexo(anexoId) {
  if (!confirm('Excluir este anexo?')) return;
  try {
    await api.delete(`/api/fretes-terceiros/${state.detailsId}/anexos/${anexoId}`);
    const f = await api.get(`/api/fretes-terceiros/${state.detailsId}?details=1`);
    state.detailsItem = f;
    renderAnexos(f);
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function removeBaixa(baixaId) {
  if (!confirm('Estornar esta baixa? O valor será removido do total já recebido.')) return;
  try {
    await api.delete(`/api/fretes-terceiros/${state.detailsId}/baixas/${baixaId}`);
    const f = await api.get(`/api/fretes-terceiros/${state.detailsId}?details=1`);
    state.detailsItem = f;
    renderDetalhes(f);
    // Atualiza lista de fora também
    loadAll();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

/* ---------- REMOVE ---------- */
function confirmRemove(id) {
  const f = state.items.find(x => x.id === id);
  if (!f) return;
  if (!confirm(`Remover frete de ${f.empresa_pagadora} (${fmtBRL(f.valor_total)})? Esta ação não pode ser desfeita.`)) return;
  api.delete(`/api/fretes-terceiros/${id}`).then(loadAll).catch(e => alert('Erro: ' + e.message));
}

/* ---------- INIT ---------- */
export async function initFreteTerceiro() {
  if (state.loaded) { await loadAll(); return; }
  state.loaded = true;
  // Wire input listeners
  ['ftValor','ftAdi'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateSaldoPreview);
  });
  document.querySelectorAll('[data-ft-pag]').forEach(el => {
    el.addEventListener('click', () => setPagamento(el.dataset.ftPag));
  });
  const truckSel = document.getElementById('ftTruck');
  if (truckSel) truckSel.addEventListener('change', onTruckChange);
  wireAnexoModal();
  wirePreviewCleanup();
  wireDetailsDropzone();
  await loadAll();
}

function wireDetailsDropzone() {
  const modal = document.getElementById('ftDetalhesModal');
  if (!modal || modal.__dropWired) return;
  modal.__dropWired = true;
  let dragCount = 0;
  const reset = () => { dragCount = 0; modal.classList.remove('drop-active'); };
  modal.addEventListener('dragenter', e => {
    if (!modal.classList.contains('open')) return;
    if (!e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return;
    e.preventDefault();
    dragCount++;
    modal.classList.add('drop-active');
  });
  modal.addEventListener('dragover', e => {
    if (!modal.classList.contains('open')) return;
    if (!e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  modal.addEventListener('dragleave', () => {
    dragCount--;
    if (dragCount <= 0) reset();
  });
  modal.addEventListener('drop', e => {
    if (!modal.classList.contains('open')) return;
    e.preventDefault();
    e.stopPropagation();
    reset();
    if (!state.detailsId) return;
    // Captura síncrona dos arquivos (fallback p/ items API)
    let files = [];
    if (e.dataTransfer) {
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        files = Array.from(e.dataTransfer.files);
      } else if (e.dataTransfer.items && e.dataTransfer.items.length) {
        files = Array.from(e.dataTransfer.items)
          .filter(it => it.kind === 'file')
          .map(it => it.getAsFile())
          .filter(Boolean);
      }
    }
    if (!files.length) return;

    if (files.length === 1) {
      openAddAnexo();
      setTimeout(() => {
        setSelectedFile(files[0]);
        const inp = document.getElementById('ftAnexoFile');
        if (inp) {
          try {
            const dt = new DataTransfer();
            dt.items.add(files[0]);
            inp.files = dt.files;
          } catch { /* */ }
        }
      }, 60);
      return;
    }
    batchUploadAnexos(files, 'COMPROVANTE_PAGAMENTO').catch(err => console.error('batch error', err));
  });
}

/* Toast pequeno fixo — feedback de batch */
function makeToast(text) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent);padding:12px 16px;border-radius:6px;font-family:\'IBM Plex Mono\',monospace;font-size:.78rem;color:var(--text);box-shadow:0 6px 20px rgba(0,0,0,.4);min-width:200px;max-width:340px';
  el.textContent = text;
  document.body.appendChild(el);
  return {
    update(t) { el.textContent = t; },
    close(t, ms = 3500) {
      if (t) el.textContent = t;
      setTimeout(() => el.remove(), ms);
    },
  };
}

async function batchUploadAnexos(files, tipoDefault) {
  if (!state.detailsId) return;
  const valid = files.filter(f => f.size <= 10 * 1024 * 1024);
  const tooBig = files.length - valid.length;
  const toast = makeToast(`📤 Enviando ${valid.length} arquivo(s)…`);
  let ok = 0, fail = 0;
  await Promise.all(valid.map(async (f) => {
    const fd = new FormData();
    fd.append('arquivo', f);
    fd.append('tipo', tipoDefault);
    fd.append('nome', f.name.replace(/\.[^.]+$/, ''));
    try {
      await uploadXHR(`/api/fretes-terceiros/${state.detailsId}/anexos/upload`, fd, () => {});
      ok++;
    } catch { fail++; }
    toast.update(`📤 ${ok + fail}/${valid.length} enviados…`);
  }));
  const parts = [`✅ ${ok} salvos`];
  if (fail)   parts.push(`❌ ${fail} falharam`);
  if (tooBig) parts.push(`⚠️ ${tooBig} maiores que 10 MB`);
  toast.close(parts.join(' · '));
  try {
    const f = await api.get(`/api/fretes-terceiros/${state.detailsId}?details=1`);
    state.detailsItem = f;
    renderAnexos(f);
  } catch { /* */ }
}

/* ---------- EXPORT ---------- */
window.ft = {
  openNew, openEdit, openBaixa, save, confirmBaixa, confirmRemove,
  applyFilters, clearFilters, setPagamento,
  openDetails, openBaixaFromDetails, openEditFromDetails,
  openAddAnexo, saveAnexo, removeAnexo, removeBaixa,
  switchAnexoMode, openAnexoFile, closeAnexoPreview,
};
