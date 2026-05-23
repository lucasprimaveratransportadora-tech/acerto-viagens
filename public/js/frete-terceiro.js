// frete-terceiro.js — Módulo Controle de Frete Terceiro
//
// Visão pública: window.ft.* expõe ações chamadas pelos onclick do HTML.

import { api } from './api.js';
import { esc } from './utils.js';

const state = {
  items: [],
  trucks: [],
  filters: { status: '', truck_id: '', q: '', from: '', to: '' },
  editingId: null,
  baixaTargetId: null,
  loaded: false,
};

function fmtBRL(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR');
}
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

/* ---------- API helpers ---------- */
async function loadAll() {
  const qs = new URLSearchParams(Object.entries(state.filters).filter(([_, v]) => v !== '' && v != null));
  const [items, sum, trucks] = await Promise.all([
    api.get(`/api/fretes-terceiros?${qs.toString()}`),
    api.get('/api/fretes-terceiros/summary'),
    api.get('/api/trucks').catch(() => []),
  ]);
  state.items = items;
  state.trucks = trucks;
  renderKpis(sum);
  renderTable();
  renderTruckSelects();
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
    return `<tr class="${f.trip_id ? 'linked' : ''}">
      <td class="mono">${fmtDate(f.data)}</td>
      <td><div>${esc(f.empresa_pagadora)}</div>${rota}</td>
      <td>${esc(f.motorista)}</td>
      <td class="mono">${esc(f.veiculo)} ${linked}</td>
      <td class="mono">${pagamentoLabel(f.forma_pagamento)}</td>
      <td class="right mono">${fmtBRL(total)}</td>
      <td class="right mono" style="color:${saldo > 0 ? '#f59e0b' : 'var(--success)'}">${fmtBRL(saldo)}</td>
      <td>${statusPill(f.status)}</td>
      <td>
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
  const optsFrete = `<option value="">— Selecione o caminhão —</option>` +
    state.trucks.map(t => `<option value="${esc(t.id)}" data-placa="${esc(t.placa)}" data-motorista="${esc(t.motorista || '')}">${esc(t.placa)}${t.modelo ? ' · '+esc(t.modelo) : ''}${t.motorista ? ' · '+esc(t.motorista) : ''}</option>`).join('');
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
  const f = state.items.find(x => x.id === id) || await api.get(`/api/fretes-terceiros/${id}`);
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
  }
}

/* ---------- MODAL BAIXA ---------- */
function openBaixa(id) {
  const f = state.items.find(x => x.id === id);
  if (!f) return;
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
      proximaParcela = adi - pago;
      parcelaLabel = '1ª parcela — Adiantamento';
    } else {
      proximaParcela = saldoTotal;
      parcelaLabel = '2ª parcela — Saldo final';
    }
  }

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
  try {
    await api.post(`/api/fretes-terceiros/${id}/baixar`, body);
    document.getElementById('ftBaixaModal').classList.remove('open');
    await loadAll();
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
  await loadAll();
}

/* ---------- EXPORT ---------- */
window.ft = {
  openNew, openEdit, openBaixa, save, confirmBaixa, confirmRemove,
  applyFilters, clearFilters, setPagamento,
};
