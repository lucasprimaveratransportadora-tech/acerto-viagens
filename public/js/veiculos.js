// veiculos.js — Módulo "Veículos" (fichário de caminhões)
//
// Cada caminhão tem: placa, modelo, motorista, carreta (placa + modelo)
// e uma pasta de anexos (GR aprovado, CRLV, CNH, contrato, etc).

import { api } from './api.js';
import { esc } from './utils.js';

const state = {
  trucks: [],
  query: '',
  loaded: false,
  detailsId: null,
  detailsItem: null,
  editingId: null,
  // upload state (reaproveita padrão do frete-terceiro)
  anexoMode: 'file',
  anexoFile: null,
  previewUrl: null,
};

function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s); if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR');
}

const TIPO_LABEL = {
  GR_APROVADO:    'Gerenciamento de Risco',
  CRLV_VEICULO:   'CRLV do veículo',
  CRLV_CARRETA:   'CRLV da carreta',
  CNH_MOTORISTA:  'CNH do motorista',
  CONTRATO:       'Contrato',
  ANTT:           'ANTT / RNTRC',
  OUTRO:          'Outro documento',
};
const TIPO_ICON = {
  GR_APROVADO: '🛡️', CRLV_VEICULO: '📑', CRLV_CARRETA: '📑',
  CNH_MOTORISTA: '🪪', CONTRATO: '📝', ANTT: '🏛️', OUTRO: '📎',
};

/* ============================================================
   API helpers + render
   ============================================================ */
async function loadAll() {
  try {
    const trucks = await api.get('/api/trucks');
    state.trucks = trucks;
    renderGrid();
  } catch (e) {
    document.getElementById('vcGrid').innerHTML =
      `<div class="vc-empty" style="color:var(--danger)">Erro ao carregar caminhões: ${esc(e.message)}</div>`;
  }
}

function renderGrid() {
  const grid = document.getElementById('vcGrid');
  if (!grid) return;
  const q = state.query.trim().toLowerCase();
  const items = q
    ? state.trucks.filter(t =>
        (t.placa || '').toLowerCase().includes(q)
        || (t.modelo || '').toLowerCase().includes(q)
        || (t.motorista || '').toLowerCase().includes(q)
        || (t.carreta_placa || '').toLowerCase().includes(q))
    : state.trucks;

  if (!items.length) {
    grid.innerHTML = `<div class="vc-empty">${q ? 'Nenhum caminhão encontrado para "' + esc(q) + '".' : 'Nenhum caminhão cadastrado. Clique em <b>+ Novo Caminhão</b>.'}</div>`;
    return;
  }

  grid.innerHTML = items.map(t => {
    const docs = t._count?.truck_anexos || 0;
    const viagens = t._count?.trips || 0;
    return `
      <div class="vc-card" onclick="vc.openDetails('${esc(t.id)}')">
        <span class="vc-plate">${esc(t.placa)}</span>
        <div class="model">${esc(t.modelo || '—')}</div>
        <div class="row"><span class="lbl">Motorista</span>
          <span class="val ${t.motorista ? '' : 'muted'}">${esc(t.motorista || 'não definido')}</span>
        </div>
        <div class="row"><span class="lbl">Carreta</span>
          <span class="val ${t.carreta_placa ? '' : 'muted'}">${esc(t.carreta_placa || 'sem carreta')}${t.carreta_modelo ? ' · ' + esc(t.carreta_modelo) : ''}</span>
        </div>
        <div class="vc-card-foot">
          <span class="vc-badge ${docs > 0 ? 'docs' : 'no-docs'}">📎 ${docs} doc${docs === 1 ? '' : 's'}</span>
          <span class="vc-badge">${viagens} viagen${viagens === 1 ? '' : 's'}</span>
        </div>
      </div>`;
  }).join('');
}

function applyFilter() {
  state.query = document.getElementById('vcSearch').value;
  renderGrid();
}

/* ============================================================
   Novo / Editar caminhão
   ============================================================ */
function openNew() {
  state.editingId = null;
  document.getElementById('vcModalTitle').textContent = '+ Novo Caminhão';
  ['vcPlaca','vcModelo','vcMotorista','vcCarPlaca','vcCarModelo','vcSaldoInicial','vcObs'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('vcCaminhaoModal').classList.add('open');
}

async function openEdit(id) {
  state.editingId = id;
  let t = state.trucks.find(x => x.id === id);
  if (!t) {
    try { t = await api.get(`/api/trucks/${id}`); }
    catch (e) { alert('Falha ao carregar caminhão: ' + e.message); return; }
  }
  document.getElementById('vcModalTitle').textContent = 'Editar Caminhão';
  document.getElementById('vcPlaca').value         = t.placa || '';
  document.getElementById('vcModelo').value        = t.modelo || '';
  document.getElementById('vcMotorista').value     = t.motorista || '';
  document.getElementById('vcCarPlaca').value      = t.carreta_placa || '';
  document.getElementById('vcCarModelo').value     = t.carreta_modelo || '';
  document.getElementById('vcSaldoInicial').value  = (t.saldo_inicial != null && Number(t.saldo_inicial) !== 0) ? Number(t.saldo_inicial) : '';
  document.getElementById('vcObs').value           = t.observacoes || '';
  document.getElementById('vcCaminhaoModal').classList.add('open');
}

async function save() {
  const saldoRaw = document.getElementById('vcSaldoInicial').value.trim();
  const body = {
    placa:          document.getElementById('vcPlaca').value.trim(),
    modelo:         document.getElementById('vcModelo').value.trim() || null,
    motorista:      document.getElementById('vcMotorista').value.trim() || null,
    carreta_placa:  document.getElementById('vcCarPlaca').value.trim() || null,
    carreta_modelo: document.getElementById('vcCarModelo').value.trim() || null,
    saldo_inicial:  saldoRaw === '' ? 0 : Number(saldoRaw),
    observacoes:    document.getElementById('vcObs').value.trim() || null,
  };
  if (!body.placa) { alert('Informe a placa do caminhão.'); return; }
  try {
    if (state.editingId) {
      await api.patch(`/api/trucks/${state.editingId}`, body);
    } else {
      await api.post('/api/trucks', body);
    }
    document.getElementById('vcCaminhaoModal').classList.remove('open');
    await loadAll();
    if (state.detailsId) {
      // se estava editando pelo modal de detalhes, atualiza
      await openDetails(state.detailsId);
    }
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function confirmRemove(id) {
  const t = state.trucks.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`Remover caminhão ${t.placa}? Anexos e vínculos serão arquivados também.`)) return;
  try {
    await api.delete(`/api/trucks/${id}`);
    document.getElementById('vcDetalhesModal').classList.remove('open');
    state.detailsId = null;
    await loadAll();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

/* ============================================================
   Detalhes do caminhão (com anexos)
   ============================================================ */
async function openDetails(id) {
  state.detailsId = id;
  document.getElementById('vcDetHeader').innerHTML = '<div class="ft-loading">Carregando…</div>';
  document.getElementById('vcDetAnexos').innerHTML = '';
  document.getElementById('vcDetalhesModal').classList.add('open');
  try {
    const t = await api.get(`/api/trucks/${id}?anexos=1`);
    state.detailsItem = t;
    renderDetails(t);
  } catch (e) {
    document.getElementById('vcDetHeader').innerHTML = `<div style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
  }
}

function renderDetails(t) {
  document.getElementById('vcDetTitle').textContent = t.placa;
  document.getElementById('vcDetHeader').innerHTML = `
    <div><div class="lbl">Placa</div><div class="val plate">${esc(t.placa)}</div></div>
    <div><div class="lbl">Modelo</div><div class="val">${esc(t.modelo || '—')}</div></div>
    <div><div class="lbl">Motorista vinculado</div><div class="val">${esc(t.motorista || '— não definido —')}</div></div>
    <div><div class="lbl">Carreta</div><div class="val">${esc(t.carreta_placa || '— sem carreta —')}${t.carreta_modelo ? ' · ' + esc(t.carreta_modelo) : ''}</div></div>
    ${t.observacoes ? `<div class="full"><div class="lbl">Observações</div><div class="val">${esc(t.observacoes)}</div></div>` : ''}
  `;
  renderAnexos(t);
}

function renderAnexos(t) {
  const wrap = document.getElementById('vcDetAnexos');
  const anexos = t.truck_anexos || [];
  if (!anexos.length) {
    wrap.innerHTML = '<div class="ft-empty-mini">Nenhum documento. Envie o GR aprovado, CRLV, CNH ou contrato.</div>';
    return;
  }
  wrap.innerHTML = '<div class="ft-anexo-list">' + anexos.map(a => {
    const isUpload = !!(a.mime_type || a.tamanho) || (!a.url && !!a.id);
    const href = isUpload
      ? `/api/trucks/${state.detailsId}/anexos/${a.id}/download`
      : (a.url || '#');
    const sizeLbl = a.tamanho ? ` · ${fmtSize(a.tamanho)}` : '';
    const openLabel = isUpload ? 'Visualizar' : 'Abrir';
    const onclick = isUpload ? `onclick="vc.openAnexoFile(event, '${esc(a.id)}')"` : '';
    return `
    <div class="ft-anexo-item">
      <span class="ico">${TIPO_ICON[a.tipo] || '📎'}</span>
      <div class="info">
        <div class="nome">${esc(a.nome)} <span style="font-size:.65rem;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-left:4px">${esc(TIPO_LABEL[a.tipo] || a.tipo)}</span></div>
        <div class="desc">${esc(a.descricao || '')}${sizeLbl}${a.created_by ? ((a.descricao || sizeLbl) ? ' · ' : '') + 'por ' + esc(a.created_by.nome) : ''}</div>
      </div>
      <a href="${esc(href)}" target="_blank" rel="noopener" ${onclick}>${openLabel}</a>
      <div class="actions"><button onclick="vc.removeAnexo('${esc(a.id)}')">Excluir</button></div>
    </div>`;
  }).join('') + '</div>';
}

function openEditFromDetails() {
  if (!state.detailsId) return;
  document.getElementById('vcDetalhesModal').classList.remove('open');
  openEdit(state.detailsId);
}

function confirmRemoveFromDetails() {
  if (!state.detailsId) return;
  confirmRemove(state.detailsId);
}

/* ============================================================
   Anexos: upload (FormData) ou URL externa
   ============================================================ */
function switchAnexoMode(mode) {
  state.anexoMode = mode;
  document.querySelectorAll('[data-vc-anexo-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.vcAnexoMode === mode);
  });
  document.getElementById('vcAnexoFileSection').style.display = mode === 'file' ? '' : 'none';
  document.getElementById('vcAnexoUrlSection').style.display  = mode === 'url'  ? '' : 'none';
}

function setSelectedFile(file) {
  state.anexoFile = file || null;
  const dz = document.getElementById('vcAnexoDropzone');
  const content = document.getElementById('vcAnexoDropzoneContent');
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
    const nomeEl = document.getElementById('vcAnexoNome');
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
  const dz  = document.getElementById('vcAnexoDropzone');
  const inp = document.getElementById('vcAnexoFile');
  if (!dz || !inp) return;
  dz.addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0];
    if (f) setSelectedFile(f);
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
      setSelectedFile(f);
    }
  });
}

function openAddAnexo() {
  if (!state.detailsId) return;
  document.getElementById('vcAnexoTipo').value = 'GR_APROVADO';
  document.getElementById('vcAnexoNome').value = '';
  document.getElementById('vcAnexoUrl').value  = '';
  document.getElementById('vcAnexoDesc').value = '';
  document.getElementById('vcAnexoFile').value = '';
  setSelectedFile(null);
  switchAnexoMode('file');
  document.getElementById('vcAnexoProgress').style.display = 'none';
  document.getElementById('vcAnexoProgressFill').style.width = '0%';
  document.getElementById('vcAnexoModal').classList.add('open');
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
  const tipo = document.getElementById('vcAnexoTipo').value;
  const nome = document.getElementById('vcAnexoNome').value.trim();
  const desc = document.getElementById('vcAnexoDesc').value.trim();
  const mode = state.anexoMode || 'file';
  const btn  = document.querySelector('#vcAnexoModal .modal-actions .btn-accent');
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
      const prog = document.getElementById('vcAnexoProgress');
      const fill = document.getElementById('vcAnexoProgressFill');
      const lbl  = document.getElementById('vcAnexoProgressLbl');
      prog.style.display = '';
      fill.style.width = '0%';
      lbl.textContent = 'Enviando 0%';
      await uploadXHR(`/api/trucks/${state.detailsId}/anexos/upload`, fd, p => {
        fill.style.width = p + '%';
        lbl.textContent = p < 100 ? `Enviando ${p}%` : 'Processando…';
      });
    } else {
      const url = document.getElementById('vcAnexoUrl').value.trim();
      if (!nome || !url) { alert('Preencha nome e URL.'); return; }
      await api.post(`/api/trucks/${state.detailsId}/anexos`, { tipo, nome, url, descricao: desc || null });
    }
    document.getElementById('vcAnexoModal').classList.remove('open');
    const t = await api.get(`/api/trucks/${state.detailsId}?anexos=1`);
    state.detailsItem = t;
    renderAnexos(t);
    loadAll();
  } catch (e) {
    alert('Erro: ' + e.message);
  } finally {
    document.getElementById('vcAnexoProgress').style.display = 'none';
    if (btn) btn.disabled = false;
  }
}

async function removeAnexo(anexoId) {
  if (!confirm('Excluir este anexo?')) return;
  try {
    await api.delete(`/api/trucks/${state.detailsId}/anexos/${anexoId}`);
    const t = await api.get(`/api/trucks/${state.detailsId}?anexos=1`);
    state.detailsItem = t;
    renderAnexos(t);
    loadAll();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

/* Preview de anexo (reusa o modal global ftAnexoPreviewModal) */
async function openAnexoFile(ev, anexoId) {
  ev.preventDefault();
  const anexo = (state.detailsItem?.truck_anexos || []).find(a => a.id === anexoId);
  const nome = anexo?.nome || 'Anexo';
  const mime = anexo?.mime_type || '';
  const body = document.getElementById('ftPrevBody');
  document.getElementById('ftPrevTitle').textContent = nome;
  body.innerHTML = '<div class="ft-prev-loading">Carregando…</div>';
  document.getElementById('ftAnexoPreviewModal').classList.add('open');
  try {
    const token = sessionStorage.getItem('accessToken');
    const res = await fetch(`/api/trucks/${state.detailsId}/anexos/${anexoId}/download`, {
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
    const dl = document.getElementById('ftPrevDownload');
    if (dl) { dl.href = state.previewUrl; dl.setAttribute('download', nome); }
    const effectiveMime = mime || blob.type || '';
    if (effectiveMime.startsWith('image/')) {
      body.innerHTML = `<img alt="${esc(nome)}" src="${state.previewUrl}">`;
    } else if (effectiveMime === 'application/pdf') {
      body.innerHTML = `<iframe src="${state.previewUrl}#toolbar=1&navpanes=0" title="${esc(nome)}"></iframe>`;
    } else {
      body.innerHTML = `<div class="ft-prev-fallback">Tipo (${esc(effectiveMime || 'desconhecido')}) não pode ser visualizado direto.<br>Use o botão <b>Baixar</b> acima.</div>`;
    }
  } catch (e) {
    body.innerHTML = `<div class="ft-prev-fallback">Erro: ${esc(e.message)}</div>`;
  }
}

/* ============================================================
   INIT
   ============================================================ */
function wireDetailsDropzone() {
  const modal = document.getElementById('vcDetalhesModal');
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
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    reset();
    if (!state.detailsId) return;
    // Abre modal de anexo já com o arquivo selecionado
    openAddAnexo();
    setTimeout(() => {
      setSelectedFile(file);
      const inp = document.getElementById('vcAnexoFile');
      if (inp) {
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          inp.files = dt.files;
        } catch { /* alguns browsers não permitem */ }
      }
    }, 60);
  });
}

export async function initVeiculos() {
  if (state.loaded) { await loadAll(); return; }
  state.loaded = true;
  const search = document.getElementById('vcSearch');
  if (search) search.addEventListener('input', applyFilter);
  wireAnexoModal();
  wireDetailsDropzone();
  // Registra cleanup global para revogar blob URL deste módulo
  // quando o modal de preview compartilhado for fechado.
  window.__previewCleanupHooks = window.__previewCleanupHooks || [];
  window.__previewCleanupHooks.push(() => {
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = null;
    }
  });
  await loadAll();
}

window.vc = {
  openNew, openEdit, save, confirmRemove,
  openDetails, openEditFromDetails, confirmRemoveFromDetails,
  openAddAnexo, saveAnexo, removeAnexo, openAnexoFile,
  switchAnexoMode,
};
