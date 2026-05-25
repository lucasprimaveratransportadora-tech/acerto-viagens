// rentabilidade.js — Módulo "Rentabilidade do Caminhão"
//
// Livro-caixa por caminhão (espelho da planilha do pai do usuário).
// Fluxo: grid de cards → click abre detalhes (KPIs + gráfico + timeline) →
// botão de + Lançar entrada / + Importar Planilha.

import { api } from './api.js';
import { esc } from './utils.js';

const state = {
  overview: [],
  query: '',
  statusFilter: '',
  loaded: false,
  // detalhes
  detailsTruck: null,        // truck do overview
  detailsSummary: null,
  detailsEntries: [],
  timelineFilter: { tipo: '', categoria: '', from: '', to: '', q: '' },
  // edição entry
  editingEntryId: null,
  // upload
  anexoMode: 'file',
  anexoFile: null,
  uploadEntryId: null,
  // import
  importFile: null,
  importBatchId: null,
  previewUrl: null,
};

function fmtBRL(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtBRLShort(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v < 0 ? '−' : '') + 'R$ ' + (abs / 1_000_000).toFixed(2) + 'mi';
  if (abs >= 1_000)     return (v < 0 ? '−' : '') + 'R$ ' + (abs / 1_000).toFixed(0) + 'k';
  return fmtBRL(v);
}
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR');
}
function fmtMonth(s) {
  if (!s) return '';
  // s = "2024-03"
  const [y, m] = s.split('-');
  return `${m}/${y.slice(2)}`;
}
function dateISO(d = new Date()) {
  return new Date(d).toISOString().slice(0, 10);
}

const CATEGORIA_LABEL = {
  AQUISICAO:           'Aquisição',
  IPVA:                'IPVA',
  SEGURO:              'Seguro',
  MANUTENCAO:          'Manutenção',
  PNEU:                'Pneu',
  RASTREADOR:          'Rastreador',
  DESPACHANTE_TAXAS:   'Despachante / Taxas',
  PEDAGIO_AVULSO:      'Pedágio avulso',
  ABASTECIMENTO_AVULSO:'Abastecimento avulso',
  ACERTO_CTE:          'Acerto CT-e',
  OUTRO_CUSTO:         'Outro custo',
  OUTRA_RECEITA:       'Outra receita',
};

/* ============================================================
   OVERVIEW (grid principal)
   ============================================================ */

async function loadOverview() {
  try {
    const data = await api.get('/api/truck-ledger/overview');
    state.overview = data;
    renderGrid();
  } catch (e) {
    document.getElementById('rtGrid').innerHTML =
      `<div class="rt-empty" style="color:var(--danger)">Erro ao carregar rentabilidade: ${esc(e.message)}</div>`;
  }
}

function renderGrid() {
  const grid = document.getElementById('rtGrid');
  if (!grid) return;
  const q = state.query.trim().toLowerCase();
  const sf = state.statusFilter;

  let items = state.overview;
  if (q) {
    items = items.filter(t =>
      (t.placa || '').toLowerCase().includes(q) ||
      (t.modelo || '').toLowerCase().includes(q) ||
      (t.motorista || '').toLowerCase().includes(q));
  }
  if (sf) items = items.filter(t => t.status === sf);

  if (!items.length) {
    grid.innerHTML = `<div class="rt-empty">${q || sf ? 'Nenhum caminhão para os filtros aplicados.' : 'Nenhum caminhão cadastrado.'} ${state.overview.length === 0 ? 'Cadastre caminhões na aba Veículos primeiro.' : ''}</div>`;
    return;
  }

  grid.innerHTML = items.map(t => {
    const statusCls = ({ PAGO: 'pago', EM_PAYBACK: 'payback', SEM_DADOS: 'sem-dados' })[t.status] || 'sem-dados';
    const statusLbl = ({ PAGO: 'Pago', EM_PAYBACK: 'Em payback', SEM_DADOS: 'Sem dados' })[t.status] || t.status;
    const saldoCls = t.saldo >= 0 ? 'ok' : 'warn';
    const pct = Math.round(t.pctPago || 0);
    const noData = t.status === 'SEM_DADOS';
    const saldoIni = Number(t.saldoInicial || 0);
    const saldoIniBadge = saldoIni !== 0
      ? `<span class="rt-badge-inicial" title="Saldo histórico anterior ao livro">${saldoIni > 0 ? '+' : ''}${fmtBRLShort(saldoIni)} inicial</span>`
      : '';
    return `
      <div class="rt-card ${noData ? 'no-data' : ''}" onclick="rtb.openDetails('${esc(t.truck_id)}')">
        <div class="rt-card-head">
          <span class="rt-plate">${esc(t.placa)}</span>
          <span class="rt-status ${statusCls}">${statusLbl}${t.status === 'EM_PAYBACK' ? ' · ' + pct + '%' : ''}</span>
        </div>
        <div class="rt-modelo" title="${esc(t.modelo || '')}">${esc(t.modelo || '—')}</div>
        <div class="rt-motorista" title="${esc(t.motorista || 'sem motorista')}">
          ${t.motorista ? esc(t.motorista) : '<span class="muted">sem motorista</span>'}
        </div>
        ${(t.carreta_placa || saldoIniBadge) ? `<div class="rt-meta-row">
          ${t.carreta_placa ? `<span class="rt-carreta">Carreta ${esc(t.carreta_placa)}</span>` : ''}
          ${saldoIniBadge}
        </div>` : ''}
        <div class="rt-num-row">
          <div><div class="lbl">Investido</div><div class="val deb">${fmtBRLShort(t.totalDebito)}</div></div>
          <div><div class="lbl">Recebido</div><div class="val cred">${fmtBRLShort(t.totalCredito)}</div></div>
          <div><div class="lbl">Saldo</div><div class="val ${saldoCls}">${fmtBRLShort(t.saldo)}</div></div>
          <div><div class="lbl">% Pago</div><div class="val">${noData ? '—' : pct + '%'}</div></div>
        </div>
        ${!noData && t.status !== 'PAGO' ? `<div class="rt-progress"><div class="fill" style="width:${pct}%"></div></div>` : ''}
      </div>`;
  }).join('');
}

function applyFilter() {
  state.query        = document.getElementById('rtSearch').value;
  state.statusFilter = document.getElementById('rtStatusFilter').value;
  renderGrid();
}

/* ============================================================
   DETALHES (KPIs + gráfico + timeline)
   ============================================================ */

async function openDetails(truckId) {
  const truck = state.overview.find(t => t.truck_id === truckId);
  state.detailsTruck = truck;
  state.editingEntryId = null;
  document.getElementById('rtDetTitle').textContent = truck ? truck.placa : 'Detalhes';
  document.getElementById('rtKpiGrid').innerHTML = '<div class="rt-loading">Carregando…</div>';
  document.getElementById('rtChart').innerHTML = '';
  document.getElementById('rtTimelineBody').innerHTML = '<tr><td colspan="7" class="rt-loading">Carregando…</td></tr>';
  document.getElementById('rtDetModal').classList.add('open');

  try {
    const [sum, entries] = await Promise.all([
      api.get(`/api/truck-ledger/${truckId}/entries/summary`),
      api.get(`/api/truck-ledger/${truckId}/entries?limit=5000`),
    ]);
    state.detailsSummary = sum;
    state.detailsEntries = entries;
    renderKpis(sum, truck);
    renderChart(sum.byMonth || []);
    renderTimeline();
  } catch (e) {
    document.getElementById('rtKpiGrid').innerHTML = `<div class="rt-loading" style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
  }
}

function renderKpis(sum, truck) {
  const grid = document.getElementById('rtKpiGrid');
  const saldoCls = sum.saldo >= 0 ? 'saldo-pos' : 'saldo-neg';
  const saldoIni = Number(sum.saldoInicial || 0);
  const statusHtml = sum.paid_at
    ? `<div class="rt-kpi-value">PAGO</div><div class="rt-kpi-hint">Desde ${fmtDate(sum.paid_at)}</div>`
    : sum.payback_estimado
    ? `<div class="rt-kpi-value">${Math.round(sum.pctPago)}%</div><div class="rt-kpi-hint">Previsão ${fmtDate(sum.payback_estimado)}</div>`
    : `<div class="rt-kpi-value">${Math.round(sum.pctPago)}%</div><div class="rt-kpi-hint">Sem previsão</div>`;
  const saldoHintExtra = saldoIni !== 0
    ? `<div class="rt-kpi-hint" style="color:var(--info)">Inclui saldo inicial ${fmtBRL(saldoIni)}</div>`
    : '';

  grid.innerHTML = `
    <div class="rt-kpi deb">
      <div class="rt-kpi-label">Investido (Débito)</div>
      <div class="rt-kpi-value">${fmtBRL(sum.totalDebito)}</div>
      <div class="rt-kpi-hint">${truck?.modelo || ''}</div>
    </div>
    <div class="rt-kpi cred">
      <div class="rt-kpi-label">Recebido (Crédito)</div>
      <div class="rt-kpi-value">${fmtBRL(sum.totalCredito)}</div>
      <div class="rt-kpi-hint">Acerto CTEs + outras receitas</div>
    </div>
    <div class="rt-kpi ${saldoCls}">
      <div class="rt-kpi-label">Saldo acumulado</div>
      <div class="rt-kpi-value">${fmtBRL(sum.saldo)}</div>
      <div class="rt-kpi-hint">${sum.saldo >= 0 ? 'Caminhão se pagou' : 'Falta cobrir'}</div>
      ${saldoHintExtra}
    </div>
    <div class="rt-kpi ${sum.paid_at ? 'saldo-pos' : 'deb'}">
      <div class="rt-kpi-label">Status</div>
      ${statusHtml}
    </div>`;
}

function renderChart(byMonth) {
  const wrap = document.getElementById('rtChart');
  if (!byMonth.length) {
    wrap.innerHTML = '<div class="rt-empty-mini">Sem dados para o gráfico.</div>';
    return;
  }
  // SVG inline — linha de saldo_acumulado por mês
  const W = 900, H = 200, padL = 50, padR = 20, padT = 12, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xs = byMonth.map((m, i) => padL + (i / Math.max(byMonth.length - 1, 1)) * innerW);
  const vals = byMonth.map(m => Number(m.saldo_acumulado));
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const range = Math.max(max - min, 1);
  const yOf = v => padT + innerH - ((v - min) / range) * innerH;
  const zeroY = yOf(0);

  // path linha
  const linePts = byMonth.map((m, i) => `${xs[i]},${yOf(vals[i])}`).join(' ');
  // path área (do primeiro ponto até último, baseline = zero)
  const areaD = `M ${xs[0]},${zeroY} L ${byMonth.map((m, i) => `${xs[i]},${yOf(vals[i])}`).join(' L ')} L ${xs[xs.length - 1]},${zeroY} Z`;

  // labels eixo X (a cada N pontos pra não poluir)
  const step = Math.max(1, Math.ceil(byMonth.length / 8));
  const xLabels = byMonth.map((m, i) =>
    i % step === 0 || i === byMonth.length - 1
      ? `<text class="lbl-x" x="${xs[i]}" y="${H - 8}" text-anchor="middle">${fmtMonth(m.mes)}</text>`
      : ''
  ).join('');

  // labels Y (min, 0, max)
  const yLabels = [min, 0, max]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map(v => `<text class="lbl-y" x="${padL - 6}" y="${yOf(v) + 3}" text-anchor="end">${fmtBRLShort(v)}</text>`)
    .join('');

  wrap.innerHTML = `
    <div class="rt-chart-title">Saldo acumulado por mês</div>
    <div class="rt-chart">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <line class="axis" x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}"/>
        <line class="axis" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}"/>
        ${min < 0 && max > 0 ? `<line class="zero" x1="${padL}" y1="${zeroY}" x2="${W - padR}" y2="${zeroY}"/>` : ''}
        <path class="area ${max > 0 && Math.abs(max) > Math.abs(min) ? 'positive' : ''}" d="${areaD}"/>
        <polyline class="line" points="${linePts}"/>
        ${byMonth.map((m, i) => `<circle class="point" cx="${xs[i]}" cy="${yOf(vals[i])}" r="2.5"><title>${fmtMonth(m.mes)}: ${fmtBRL(vals[i])}</title></circle>`).join('')}
        ${xLabels}
        ${yLabels}
      </svg>
    </div>`;
}

function renderTimeline() {
  const tbody = document.getElementById('rtTimelineBody');
  const f = state.timelineFilter;
  let rows = state.detailsEntries;
  if (f.tipo)       rows = rows.filter(e => e.tipo === f.tipo);
  if (f.categoria)  rows = rows.filter(e => e.categoria === f.categoria);
  if (f.from)       rows = rows.filter(e => e.data >= f.from);
  if (f.to)         rows = rows.filter(e => e.data <= f.to);
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter(e => (e.historico || '').toLowerCase().includes(q));
  }

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="rt-empty-mini">Nenhum lançamento. Clique em <b>+ Lançar entrada</b> ou importe a planilha.</div></td></tr>';
    return;
  }

  // Saldo acumulado: parte do saldo inicial (caminhões antigos podem ter
  // valor pré-existente) e percorre os lançamentos em ordem cronológica.
  let acc = Number(state.detailsSummary?.saldoInicial || 0);
  const trId = state.detailsTruck?.truck_id;
  tbody.innerHTML = rows.map(e => {
    const valor = Number(e.valor);
    acc += e.tipo === 'CREDITO' ? valor : -valor;
    const hasAnexo = e.anexo_nome || e.anexo_url;
    const isUpload = !!(e.anexo_mime || e.anexo_tamanho);
    const anexoCell = !hasAnexo ? '<span style="color:var(--muted);font-size:.7rem">—</span>'
      : isUpload
        ? `<a onclick="rtb.openAnexoFile(event,'${esc(e.id)}')" href="/api/truck-ledger/${esc(trId)}/entries/${esc(e.id)}/anexo/download" target="_blank">📎 ${esc(e.anexo_nome || 'arquivo')}</a>`
        : `<a href="${esc(e.anexo_url)}" target="_blank">🔗 ${esc(e.anexo_nome || 'link')}</a>`;
    return `<tr>
      <td class="mono" data-label="Data">${fmtDate(e.data)}</td>
      <td data-label="Categoria"><span class="pill ${esc(e.categoria)}">${esc(CATEGORIA_LABEL[e.categoria] || e.categoria)}</span></td>
      <td data-label="Histórico">${esc(e.historico)}${e.observacoes ? ` <small style="color:var(--muted)">· ${esc(e.observacoes)}</small>` : ''}</td>
      <td class="right mono deb" data-label="Débito">${e.tipo === 'DEBITO' ? fmtBRL(valor) : ''}</td>
      <td class="right mono cred" data-label="Crédito">${e.tipo === 'CREDITO' ? fmtBRL(valor) : ''}</td>
      <td class="right mono" data-label="Saldo" style="color:${acc >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmtBRL(acc)}</td>
      <td data-label="Anexo">${anexoCell}</td>
      <td data-label="Ações"><div class="actions">
        <button onclick="rtb.openEditEntry('${esc(e.id)}')">Editar</button>
        <button onclick="rtb.openAnexo('${esc(e.id)}')" title="Anexar arquivo">📎</button>
        <button class="danger" onclick="rtb.removeEntry('${esc(e.id)}')">×</button>
      </div></td>
    </tr>`;
  }).join('');
}

function applyTimelineFilter() {
  state.timelineFilter = {
    tipo:      document.getElementById('rtFilterTipo').value,
    categoria: document.getElementById('rtFilterCategoria').value,
    from:      document.getElementById('rtFilterFrom').value,
    to:        document.getElementById('rtFilterTo').value,
    q:         document.getElementById('rtFilterQ').value,
  };
  renderTimeline();
}

/* ============================================================
   Lançar / Editar entry
   ============================================================ */

function openNewEntry() {
  if (!state.detailsTruck) { alert('Abra o detalhe de um caminhão primeiro.'); return; }
  state.editingEntryId = null;
  document.getElementById('rtEntryTitle').textContent = '+ Lançar entrada';
  document.getElementById('rtEntData').value      = dateISO();
  document.getElementById('rtEntHistorico').value = '';
  document.getElementById('rtEntCategoria').value = 'OUTRO_CUSTO';
  document.getElementById('rtEntValor').value     = '';
  document.getElementById('rtEntObs').value       = '';
  setTipo('DEBITO');
  document.getElementById('rtEntryModal').classList.add('open');
}

async function openEditEntry(id) {
  const e = state.detailsEntries.find(x => x.id === id);
  if (!e) return;
  state.editingEntryId = id;
  document.getElementById('rtEntryTitle').textContent = 'Editar lançamento';
  document.getElementById('rtEntData').value      = (e.data || '').slice(0, 10);
  document.getElementById('rtEntHistorico').value = e.historico || '';
  document.getElementById('rtEntCategoria').value = e.categoria || 'OUTRO_CUSTO';
  document.getElementById('rtEntValor').value     = Number(e.valor) || '';
  document.getElementById('rtEntObs').value       = e.observacoes || '';
  setTipo(e.tipo || 'DEBITO');
  document.getElementById('rtEntryModal').classList.add('open');
}

function setTipo(t) {
  document.querySelectorAll('[data-rt-tipo]').forEach(el => {
    el.classList.toggle('active', el.dataset.rtTipo === t);
    const inp = el.querySelector('input[type=radio]');
    if (inp) inp.checked = (el.dataset.rtTipo === t);
  });
}

async function saveEntry() {
  if (!state.detailsTruck) return;
  const tipo = document.querySelector('[data-rt-tipo].active')?.dataset.rtTipo || 'DEBITO';
  const body = {
    data:        document.getElementById('rtEntData').value,
    historico:   document.getElementById('rtEntHistorico').value.trim(),
    categoria:   document.getElementById('rtEntCategoria').value,
    tipo,
    valor:       Number(document.getElementById('rtEntValor').value || 0),
    observacoes: document.getElementById('rtEntObs').value.trim() || null,
  };
  if (!body.data || !body.historico || !body.valor) { alert('Preencha data, histórico e valor.'); return; }
  const btn = document.querySelector('#rtEntryModal .modal-actions .btn-accent');
  if (btn) btn.disabled = true;
  try {
    const truckId = state.detailsTruck.truck_id;
    if (state.editingEntryId) {
      await api.patch(`/api/truck-ledger/${truckId}/entries/${state.editingEntryId}`, body);
    } else {
      await api.post(`/api/truck-ledger/${truckId}/entries`, body);
    }
    document.getElementById('rtEntryModal').classList.remove('open');
    // Recarrega detalhes + overview (KPIs do grid)
    await Promise.all([openDetails(truckId), loadOverview()]);
  } catch (e) {
    alert('Erro: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function removeEntry(id) {
  if (!confirm('Remover este lançamento?')) return;
  try {
    const truckId = state.detailsTruck.truck_id;
    await api.delete(`/api/truck-ledger/${truckId}/entries/${id}`);
    await Promise.all([openDetails(truckId), loadOverview()]);
  } catch (e) { alert('Erro: ' + e.message); }
}

/* ============================================================
   Anexo do entry
   ============================================================ */

function openAnexo(entryId) {
  state.uploadEntryId = entryId;
  document.getElementById('rtAnexoNome').value = '';
  document.getElementById('rtAnexoUrl').value  = '';
  document.getElementById('rtAnexoFile').value = '';
  setSelectedAnexoFile(null);
  switchAnexoMode('file');
  document.getElementById('rtAnexoProgress').style.display = 'none';
  document.getElementById('rtAnexoProgressFill').style.width = '0%';
  document.getElementById('rtAnexoModal').classList.add('open');
}

function switchAnexoMode(mode) {
  state.anexoMode = mode;
  document.querySelectorAll('[data-rt-anexo-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.rtAnexoMode === mode);
  });
  document.getElementById('rtAnexoFileSection').style.display = mode === 'file' ? '' : 'none';
  document.getElementById('rtAnexoUrlSection').style.display  = mode === 'url'  ? '' : 'none';
}

function setSelectedAnexoFile(file) {
  state.anexoFile = file || null;
  const dz = document.getElementById('rtAnexoDropzone');
  const content = document.getElementById('rtAnexoDropzoneContent');
  if (!dz || !content) return;
  if (file) {
    dz.classList.add('has-file');
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    content.innerHTML = `
      <div style="font-size:2rem;line-height:1">✅</div>
      <div><b>${esc(file.name)}</b></div>
      <div style="font-size:.7rem;color:var(--muted);margin-top:4px">${sizeMB} MB · ${esc(file.type || 'arquivo')}</div>
      <div style="font-size:.66rem;color:var(--muted);margin-top:4px">Clique pra trocar</div>`;
    const nomeEl = document.getElementById('rtAnexoNome');
    if (nomeEl && !nomeEl.value.trim()) nomeEl.value = file.name.replace(/\.[^.]+$/, '');
  } else {
    dz.classList.remove('has-file');
    content.innerHTML = `
      <div style="font-size:2rem;line-height:1">📂</div>
      <div><b>Clique para selecionar</b> ou arraste aqui</div>
      <div style="font-size:.7rem;color:var(--muted);margin-top:4px">PDF, JPG, PNG ou WEBP até 10 MB</div>`;
  }
}

function wireAnexoModal() {
  const dz  = document.getElementById('rtAnexoDropzone');
  const inp = document.getElementById('rtAnexoFile');
  if (!dz || !inp) return;
  dz.addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0];
    if (f) setSelectedAnexoFile(f);
  });
  ['dragenter','dragover'].forEach(evt => dz.addEventListener(evt, e => {
    e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover');
  }));
  ['dragleave','drop'].forEach(evt => dz.addEventListener(evt, e => {
    e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragover');
  }));
  dz.addEventListener('drop', e => {
    const f = e.dataTransfer?.files?.[0];
    if (f) {
      const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files;
      setSelectedAnexoFile(f);
    }
  });
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
    xhr.onerror = () => reject(new Error('Falha de rede.'));
    xhr.send(formData);
  });
}

async function saveAnexo() {
  if (!state.uploadEntryId || !state.detailsTruck) return;
  const truckId = state.detailsTruck.truck_id;
  const entryId = state.uploadEntryId;
  const nome = document.getElementById('rtAnexoNome').value.trim();
  const btn  = document.querySelector('#rtAnexoModal .modal-actions .btn-accent');
  if (btn) btn.disabled = true;
  try {
    if (state.anexoMode === 'file') {
      const file = state.anexoFile;
      if (!file) { alert('Selecione um arquivo.'); return; }
      if (file.size > 10 * 1024 * 1024) { alert('Arquivo maior que 10 MB.'); return; }
      const fd = new FormData();
      fd.append('arquivo', file);
      if (nome) fd.append('nome', nome);
      const prog = document.getElementById('rtAnexoProgress');
      const fill = document.getElementById('rtAnexoProgressFill');
      const lbl  = document.getElementById('rtAnexoProgressLbl');
      prog.style.display = '';
      fill.style.width = '0%';
      lbl.textContent = 'Enviando 0%';
      await uploadXHR(`/api/truck-ledger/${truckId}/entries/${entryId}/anexo/upload`, fd, p => {
        fill.style.width = p + '%';
        lbl.textContent = p < 100 ? `Enviando ${p}%` : 'Processando…';
      });
    } else {
      const url = document.getElementById('rtAnexoUrl').value.trim();
      if (!nome || !url) { alert('Preencha nome e URL.'); return; }
      await api.post(`/api/truck-ledger/${truckId}/entries/${entryId}/anexo/url`, { nome, url });
    }
    document.getElementById('rtAnexoModal').classList.remove('open');
    await openDetails(truckId);
  } catch (e) {
    alert('Erro: ' + e.message);
  } finally {
    document.getElementById('rtAnexoProgress').style.display = 'none';
    if (btn) btn.disabled = false;
  }
}

/* Preview de anexo (reusa modal global) */
async function openAnexoFile(ev, entryId) {
  ev.preventDefault();
  ev.stopPropagation();
  const truckId = state.detailsTruck?.truck_id;
  if (!truckId) return;
  const entry = state.detailsEntries.find(e => e.id === entryId);
  const nome = entry?.anexo_nome || 'Anexo';
  const mime = entry?.anexo_mime || '';
  const body = document.getElementById('ftPrevBody');
  document.getElementById('ftPrevTitle').textContent = nome;
  body.innerHTML = '<div class="ft-prev-loading">Carregando…</div>';
  document.getElementById('ftAnexoPreviewModal').classList.add('open');
  try {
    const token = sessionStorage.getItem('accessToken');
    const res = await fetch(`/api/truck-ledger/${truckId}/entries/${entryId}/anexo/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) {
      body.innerHTML = `<div class="ft-prev-fallback">Erro ${res.status} ao baixar.</div>`;
      return;
    }
    const blob = await res.blob();
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(blob);
    const dl = document.getElementById('ftPrevDownload');
    if (dl) { dl.href = state.previewUrl; dl.setAttribute('download', nome); }
    const mt = mime || blob.type || '';
    if (mt.startsWith('image/')) {
      body.innerHTML = `<img alt="${esc(nome)}" src="${state.previewUrl}">`;
    } else if (mt === 'application/pdf') {
      body.innerHTML = `<iframe src="${state.previewUrl}#toolbar=1&navpanes=0" title="${esc(nome)}"></iframe>`;
    } else {
      body.innerHTML = `<div class="ft-prev-fallback">Tipo (${esc(mt || 'desconhecido')}) não pode ser visualizado direto.<br>Use <b>Baixar</b>.</div>`;
    }
  } catch (e) {
    body.innerHTML = `<div class="ft-prev-fallback">Erro: ${esc(e.message)}</div>`;
  }
}

/* ============================================================
   IMPORT XLSX
   ============================================================ */

function openImport() {
  state.importFile = null;
  state.importBatchId = null;
  document.getElementById('rtImportFile').value = '';
  document.getElementById('rtImportFileLabel').textContent = 'Nenhum arquivo selecionado';
  document.getElementById('rtImportResults').innerHTML = '';
  document.getElementById('rtImportRunBtn').disabled = true;
  document.getElementById('rtImportUndoBtn').style.display = 'none';
  document.getElementById('rtImportModal').classList.add('open');
}

function onImportFileChange() {
  const inp = document.getElementById('rtImportFile');
  const f = inp.files && inp.files[0];
  state.importFile = f || null;
  document.getElementById('rtImportFileLabel').textContent = f ? `${f.name} · ${(f.size / 1024 / 1024).toFixed(2)} MB` : 'Nenhum arquivo selecionado';
  document.getElementById('rtImportRunBtn').disabled = !f;
}

async function runImport() {
  if (!state.importFile) return;
  const btn = document.getElementById('rtImportRunBtn');
  btn.disabled = true;
  document.getElementById('rtImportResults').innerHTML = '<div class="rt-loading">Importando — isso pode demorar uns segundos…</div>';
  try {
    const fd = new FormData();
    fd.append('arquivo', state.importFile);
    const data = await uploadXHR('/api/truck-ledger/import', fd, () => {});
    state.importBatchId = data.batch_id;
    renderImportResults(data);
    document.getElementById('rtImportUndoBtn').style.display = '';
    await loadOverview();
  } catch (e) {
    document.getElementById('rtImportResults').innerHTML = `<div class="rt-loading" style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
  }
}

function renderImportResults(data) {
  const wrap = document.getElementById('rtImportResults');
  const total = `<div style="margin-bottom:.7rem;font-family:'IBM Plex Mono',monospace;font-size:.78rem"><b style="color:var(--success)">${data.total_criados}</b> criados · <b style="color:var(--muted)">${data.total_ignorados}</b> ignorados (duplicados)</div>`;
  const rows = (data.results || []).map(r => {
    const isSkipped = !r.criados && r.status;
    const saldoIni = r.saldo_inicial_detectado;
    const saldoIniLbl = (saldoIni != null && saldoIni !== 0)
      ? `<span style="color:var(--info);font-family:'IBM Plex Mono',monospace;font-size:.65rem" title="Saldo inicial detectado e gravado">📌 ${fmtBRLShort(saldoIni)}</span>`
      : '';
    return `
      <div class="rt-import-row ${isSkipped ? 'skipped' : ''}">
        <span class="placa">${esc(r.placa || r.sheet)}</span>
        <span style="flex:1;color:var(--muted);font-size:.72rem">${esc(r.status || '')}</span>
        ${saldoIniLbl}
        <span class="count">+${r.criados || 0}</span>
        <span class="ign">·${r.ignorados || 0}</span>
      </div>`;
  }).join('');
  wrap.innerHTML = total + `<div class="rt-import-results">${rows}</div>`;
}

async function undoImport() {
  if (!state.importBatchId) return;
  if (!confirm('Desfazer essa importação? Todos os lançamentos do lote serão removidos.')) return;
  try {
    const r = await api.delete(`/api/truck-ledger/import/${state.importBatchId}`);
    document.getElementById('rtImportResults').innerHTML = `<div class="rt-loading" style="color:var(--success)">${r.removidos} lançamentos removidos.</div>`;
    document.getElementById('rtImportUndoBtn').style.display = 'none';
    state.importBatchId = null;
    await loadOverview();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

/* ============================================================
   INIT
   ============================================================ */
export async function initRentabilidade() {
  if (state.loaded) { await loadOverview(); return; }
  state.loaded = true;
  // listeners
  const s = document.getElementById('rtSearch');
  if (s) s.addEventListener('input', applyFilter);
  const sf = document.getElementById('rtStatusFilter');
  if (sf) sf.addEventListener('change', applyFilter);
  document.querySelectorAll('[data-rt-tipo]').forEach(el => {
    el.addEventListener('click', () => setTipo(el.dataset.rtTipo));
  });
  document.querySelectorAll('[data-rt-anexo-mode]').forEach(el => {
    el.addEventListener('click', () => switchAnexoMode(el.dataset.rtAnexoMode));
  });
  ['rtFilterTipo','rtFilterCategoria','rtFilterFrom','rtFilterTo','rtFilterQ'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', applyTimelineFilter);
    if (el && el.tagName === 'INPUT') el.addEventListener('input', applyTimelineFilter);
  });
  const impInp = document.getElementById('rtImportFile');
  if (impInp) impInp.addEventListener('change', onImportFileChange);
  wireAnexoModal();

  // Hook pra revogar blob URL ao fechar modal de preview global
  window.__previewCleanupHooks = window.__previewCleanupHooks || [];
  window.__previewCleanupHooks.push(() => {
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = null;
    }
  });

  await loadOverview();
}

window.rtb = {
  openDetails,
  openNewEntry, openEditEntry, saveEntry, removeEntry,
  openAnexo, saveAnexo, openAnexoFile, switchAnexoMode,
  openImport, runImport, undoImport,
  applyTimelineFilter,
};
