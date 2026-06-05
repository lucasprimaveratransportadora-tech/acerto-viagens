// veiculos.js — Módulo "Veículos" (fichário de caminhões)
//
// Cada caminhão tem: placa, modelo, motorista, carreta (placa + modelo)
// e uma pasta de anexos (GR aprovado, CRLV, CNH, contrato, etc).

import { api, getToken, setToken } from './api.js';
import { esc, fmtD } from './utils.js';

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
// Antes fazia new Date(ISO) — em UTC-3 perdia 1 dia pra datas armazenadas
// como midnight UTC. Delega pro fmtD do utils.js (slice + T12:00:00).
const fmtDate = fmtD;

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

  // Trava o botão durante o save — evita double-submit duplicar caminhão.
  const saveBtn = document.querySelector('button[onclick*="vc.save"]');
  const originalLabel = saveBtn?.textContent;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando...'; }

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
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalLabel; }
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
  // Mostra/esconde botões de bulk no header
  const dlBtn = document.getElementById('vcDownloadAllBtn');
  const cpBtn = document.getElementById('vcCopyAllBtn');
  const hasAnexos = anexos.length > 0;
  if (dlBtn) dlBtn.style.display = hasAnexos ? '' : 'none';
  // Copy só é viável pra uploads (a gente busca os bytes via API)
  const hasUploads = anexos.some(a => !!(a.mime_type || a.tamanho) || (!a.url && !!a.id));
  if (cpBtn) cpBtn.style.display = hasUploads ? '' : 'none';

  if (!hasAnexos) {
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
    const copyBtn = isUpload ? `<button onclick="vc.copyAnexo('${esc(a.id)}')" title="Copiar para área de transferência">📋 Copiar</button>` : '';
    return `
    <div class="ft-anexo-item">
      <span class="ico">${TIPO_ICON[a.tipo] || '📎'}</span>
      <div class="info">
        <div class="nome">${esc(a.nome)} <span style="font-size:.65rem;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-left:4px">${esc(TIPO_LABEL[a.tipo] || a.tipo)}</span></div>
        <div class="desc">${esc(a.descricao || '')}${sizeLbl}${a.created_by ? ((a.descricao || sizeLbl) ? ' · ' : '') + 'por ' + esc(a.created_by.nome) : ''}</div>
      </div>
      <a href="${esc(href)}" target="_blank" rel="noopener" ${onclick}>${openLabel}</a>
      <div class="actions">${copyBtn}<button onclick="vc.removeAnexo('${esc(a.id)}')">Excluir</button></div>
    </div>`;
  }).join('') + '</div>';
}

/* ============================================================
   Bulk download + Copy to clipboard
   ============================================================ */

async function fetchAnexoBlob(anexoId) {
  const url = `/api/trucks/${state.detailsId}/anexos/${anexoId}/download`;
  const doFetch = () => {
    const tok = getToken();
    return fetch(url, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      credentials: 'include',
    });
  };
  let res = await doFetch();
  if (res.status === 401) {
    // Tenta refresh (mesma estratégia do wrapper api.js)
    try {
      const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (r.ok) {
        const data = await r.json();
        setToken(data.accessToken);
        res = await doFetch();
      }
    } catch { /* ignore */ }
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar anexo`);
  return res.blob();
}

function sanitizeFilename(name) {
  return (name || 'arquivo').replace(/[\\/:*?"<>|]/g, '_').trim() || 'arquivo';
}

function extFromMime(mime) {
  if (!mime) return '';
  if (mime.includes('pdf'))  return '.pdf';
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('jpg'))  return '.jpg';
  if (mime.includes('png'))  return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif'))  return '.gif';
  return '';
}

async function downloadAllAnexos() {
  const anexos = (state.detailsItem?.truck_anexos || []).filter(a => !!(a.mime_type || a.tamanho) || (!a.url && !!a.id));
  if (!anexos.length) { alert('Não há documentos enviados pra baixar.'); return; }

  const btn = document.getElementById('vcDownloadAllBtn');
  const original = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = `⬇ Compactando 0/${anexos.length}...`; }

  try {
    // JSZip — carrega sob demanda do CDN
    if (!window.JSZip) {
      await loadScript('/assets/vendor/jszip.min.js');
    }
    const zip = new window.JSZip();
    const usedNames = new Set();
    for (let i = 0; i < anexos.length; i++) {
      const a = anexos[i];
      if (btn) btn.textContent = `⬇ Compactando ${i+1}/${anexos.length}...`;
      const blob = await fetchAnexoBlob(a.id);
      let base = sanitizeFilename(a.nome);
      // garante extensão
      if (!/\.[a-z0-9]{2,5}$/i.test(base)) base += extFromMime(a.mime_type);
      // dedupe se houver nomes iguais
      let fname = base; let n = 1;
      while (usedNames.has(fname)) {
        const dot = base.lastIndexOf('.');
        fname = dot > 0 ? `${base.slice(0,dot)} (${++n})${base.slice(dot)}` : `${base} (${++n})`;
      }
      usedNames.add(fname);
      zip.file(fname, blob);
    }
    const placa = state.detailsItem?.placa || 'veiculo';
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `documentos_${sanitizeFilename(placa)}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    alert('Erro ao gerar ZIP: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function copyAnexo(anexoId) {
  try {
    const blob = await fetchAnexoBlob(anexoId);
    if (!navigator.clipboard || !window.ClipboardItem) {
      throw new Error('Navegador não suporta clipboard API. Use Chrome/Edge atualizado.');
    }
    // Browsers só aceitam alguns mimes no clipboard (basicamente image/png).
    // Pra PDFs e outros, convertemos pra dataURL e copiamos como texto/link.
    if (blob.type.startsWith('image/png')) {
      await navigator.clipboard.write([ new ClipboardItem({ [blob.type]: blob }) ]);
      toast('Imagem copiada pra área de transferência');
      return;
    }
    if (blob.type.startsWith('image/')) {
      // Converte pra PNG (única imagem que clipboard aceita em todos browsers)
      const pngBlob = await convertImageToPng(blob);
      await navigator.clipboard.write([ new ClipboardItem({ 'image/png': pngBlob }) ]);
      toast('Imagem copiada (convertida pra PNG)');
      return;
    }
    // PDF/outro: cria um link temporário download + copia URL pra clipboard
    const url = URL.createObjectURL(blob);
    await navigator.clipboard.writeText(url);
    toast('Link blob copiado (válido nesta aba)');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    alert('Erro ao copiar: ' + e.message);
  }
}

function convertImageToPng(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Falha ao converter')), 'image/png');
    };
    img.onerror = () => reject(new Error('Imagem inválida'));
    img.src = URL.createObjectURL(blob);
  });
}

async function copyAllAnexos() {
  const anexos = (state.detailsItem?.truck_anexos || []).filter(a => !!(a.mime_type || a.tamanho) || (!a.url && !!a.id));
  if (!anexos.length) { alert('Não há documentos enviados pra copiar.'); return; }
  // Clipboard só aceita 1 item por vez na maioria dos browsers.
  // Solução: copia uma LISTA de nomes com botão "Copiar próximo" não é prático.
  // Em vez disso, oferecemos baixar o ZIP — copy bulk é restringido.
  if (anexos.length === 1) return copyAnexo(anexos[0].id);
  if (confirm(`Navegadores só aceitam 1 arquivo no clipboard por vez.\n\nBaixar todos como ZIP em vez disso?`)) {
    return downloadAllAnexos();
  }
}

function toast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:.6rem 1rem;border-radius:8px;z-index:9999;font-size:.85rem;box-shadow:0 8px 18px rgba(0,0,0,.3)';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
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
    const token = localStorage.getItem('accessToken');
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
    const token = localStorage.getItem('accessToken');
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
    e.preventDefault();
    e.stopPropagation();
    reset();
    if (!state.detailsId) return;

    // CAPTURA SÍNCRONA — após o handler retornar, dataTransfer pode ser
    // limpo. Tenta primeiro .files, depois .items como fallback.
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
        const inp = document.getElementById('vcAnexoFile');
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
    // Múltiplos: dispara batch async sem await (handler precisa retornar rápido)
    batchUploadAnexos(files, 'OUTRO').catch(err => console.error('batch error', err));
  });
}

/* Toast pequeno fixo no canto inferior — feedback de batch */
function makeToast(text) {
  const id = 'vcToast_' + Date.now();
  const el = document.createElement('div');
  el.id = id;
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
      await uploadXHR(`/api/trucks/${state.detailsId}/anexos/upload`, fd, () => {});
      ok++;
    } catch { fail++; }
    toast.update(`📤 ${ok + fail}/${valid.length} enviados…`);
  }));
  const parts = [`✅ ${ok} salvos`];
  if (fail)   parts.push(`❌ ${fail} falharam`);
  if (tooBig) parts.push(`⚠️ ${tooBig} maiores que 10 MB`);
  toast.close(parts.join(' · '));
  try {
    const t = await api.get(`/api/trucks/${state.detailsId}?anexos=1`);
    state.detailsItem = t;
    renderAnexos(t);
    loadAll();
  } catch { /* */ }
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
  downloadAllAnexos, copyAnexo, copyAllAnexos,
};
