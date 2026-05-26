// trip-anexos.js — Anexos da viagem (folha de acerto digitalizada + comprovantes)
// Mesma UX dos anexos de Veículos/Frete Terceiro, mas escopado à viagem corrente.

import { api } from './api.js';
import { esc } from './utils.js';

const localState = {
  mode: 'file',          // 'file' ou 'url'
  file: null,            // arquivo selecionado p/ upload
  anexos: [],            // anexos já carregados da viagem corrente
  dropzoneWired: false,  // dropzone do modal de adicionar
  tabDropWired: false,   // drop dentro da aba do tripModal
};

function currentTripId() {
  return document.getElementById('tripEditId')?.dataset?.id || '';
}

function fmtSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/* ============================================================
   Rendering da lista de anexos na aba do tripModal
   ============================================================ */
function renderList() {
  const list = document.getElementById('trpAnexoList');
  const empty = document.getElementById('trpAnexoEmpty');
  const toolbar = document.getElementById('trpAnexoToolbar');
  const drop = document.getElementById('trpAnexoDropZone');
  if (!list) return;

  const tripId = currentTripId();
  if (!tripId) {
    if (empty) empty.style.display = '';
    if (toolbar) toolbar.style.display = 'none';
    if (drop) drop.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  if (empty) empty.style.display = 'none';
  if (toolbar) toolbar.style.display = '';
  if (drop) drop.style.display = '';

  if (!localState.anexos.length) {
    list.innerHTML = `
      <div class="ft-anexos-empty">
        Nenhuma folha anexada ainda. Clique em <b>📎 Adicionar folha</b> ou arraste o PDF/imagem aqui.
      </div>`;
    return;
  }

  list.innerHTML = localState.anexos.map(a => {
    const isUrl = !!a.url;
    const tipoLbl = ({
      FOLHA_ACERTO: 'Folha de acerto',
      COMPROVANTE:  'Comprovante',
      NOTA_FISCAL:  'Nota fiscal',
      OUTRO:        'Outro',
    })[a.tipo] || 'Anexo';
    const sizeLbl = fmtSize(a.tamanho);
    const dataLbl = a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR') : '';
    const linkHandler = isUrl
      ? `target="_blank" rel="noopener" href="${esc(a.url)}"`
      : `href="#" onclick="trpAnx.openPane(event, '${a.id}')"`;
    const sideBtn = isUrl ? '' : `
      <button class="trp-anexo-side-btn" onclick="trpAnx.openPane(event, '${a.id}')" title="Ver lado a lado enquanto edita">
        👁 Lado a lado
      </button>`;
    return `
      <div class="ft-anexo-item">
        <div class="ft-anexo-info">
          <a class="ft-anexo-link" ${linkHandler}>
            <span class="ft-anexo-icon">${isUrl ? '🔗' : '📄'}</span>
            <span class="ft-anexo-nome">${esc(a.nome || 'Anexo')}</span>
          </a>
          <div class="ft-anexo-meta">
            <span class="ft-anexo-tag">${esc(tipoLbl)}</span>
            ${sizeLbl ? `<span>${sizeLbl}</span>` : ''}
            ${dataLbl ? `<span>${dataLbl}</span>` : ''}
            ${a.descricao ? `<span>${esc(a.descricao)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center">
          ${sideBtn}
          <button class="action-btn del" onclick="trpAnx.remove('${a.id}')" title="Excluir">✕</button>
        </div>
      </div>`;
  }).join('');
}

/* ============================================================
   Public: refresh — carrega anexos da Trip corrente
   ============================================================ */
async function refresh() {
  const tripId = currentTripId();
  if (!tripId) {
    localState.anexos = [];
    renderList();
    return;
  }
  try {
    const trip = await api.get('/api/trips/' + tripId);
    localState.anexos = trip.trip_anexos || [];
  } catch {
    localState.anexos = [];
  }
  renderList();
  wireTabDrop();
}

/* ============================================================
   Modal "Adicionar Folha"
   ============================================================ */
function switchMode(mode) {
  localState.mode = mode;
  document.querySelectorAll('[data-trp-anexo-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.trpAnexoMode === mode);
  });
  document.getElementById('trpAnexoFileSection').style.display = mode === 'file' ? '' : 'none';
  document.getElementById('trpAnexoUrlSection').style.display  = mode === 'url'  ? '' : 'none';
}

function setSelectedFile(file) {
  localState.file = file || null;
  const dz = document.getElementById('trpAnexoDropzone');
  if (!dz) return;
  const content = dz.querySelector('.ft-anexo-dropzone-content');
  if (!content) return;
  if (file) {
    dz.classList.add('has-file');
    content.innerHTML = `
      <div style="font-size:2rem;line-height:1">✅</div>
      <div><b>${esc(file.name)}</b></div>
      <div style="font-size:.7rem;color:var(--muted);margin-top:4px">${fmtSize(file.size)} · ${esc(file.type || 'arquivo')}</div>
      <div style="font-size:.66rem;color:var(--muted);margin-top:4px">Clique pra trocar</div>`;
    const nomeEl = document.getElementById('trpAnexoNome');
    if (nomeEl && !nomeEl.value.trim()) nomeEl.value = file.name.replace(/\.[^.]+$/, '');
  } else {
    dz.classList.remove('has-file');
    content.innerHTML = `
      <div style="font-size:2rem;line-height:1">📂</div>
      <div><b>Clique para selecionar</b> ou arraste o arquivo aqui</div>
      <div style="font-size:.7rem;color:var(--muted);margin-top:4px">PDF, JPG, PNG ou WEBP até 20 MB</div>`;
  }
}

function wireModalDropzone() {
  if (localState.dropzoneWired) return;
  const dz = document.getElementById('trpAnexoDropzone');
  const inp = document.getElementById('trpAnexoFile');
  if (!dz || !inp) return;
  localState.dropzoneWired = true;
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

function openModal() {
  if (!currentTripId()) { alert('Salve a viagem antes de anexar a folha.'); return; }
  document.getElementById('trpAnexoTipo').value = 'FOLHA_ACERTO';
  document.getElementById('trpAnexoNome').value = '';
  document.getElementById('trpAnexoUrl').value  = '';
  document.getElementById('trpAnexoDesc').value = '';
  document.getElementById('trpAnexoFile').value = '';
  setSelectedFile(null);
  switchMode('file');
  document.getElementById('trpAnexoProgress').style.display = 'none';
  document.getElementById('trpAnexoProgressFill').style.width = '0%';
  document.getElementById('trpAnexoModal').classList.add('open');
  wireModalDropzone();
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

async function save() {
  const tripId = currentTripId();
  if (!tripId) { alert('Salve a viagem antes.'); return; }
  const tipo = document.getElementById('trpAnexoTipo').value;
  const nome = document.getElementById('trpAnexoNome').value.trim();
  const desc = document.getElementById('trpAnexoDesc').value.trim();
  const btn = document.querySelector('#trpAnexoModal .modal-actions .btn-accent');
  if (btn) btn.disabled = true;
  try {
    if (localState.mode === 'file') {
      const file = localState.file;
      if (!file) { alert('Selecione um arquivo.'); return; }
      if (file.size > 20 * 1024 * 1024) { alert('Arquivo maior que 20 MB.'); return; }
      const fd = new FormData();
      fd.append('arquivo', file);
      fd.append('tipo', tipo);
      if (nome) fd.append('nome', nome);
      if (desc) fd.append('descricao', desc);
      const prog = document.getElementById('trpAnexoProgress');
      const fill = document.getElementById('trpAnexoProgressFill');
      const lbl  = document.getElementById('trpAnexoProgressLbl');
      prog.style.display = '';
      fill.style.width = '0%';
      lbl.textContent = 'Enviando 0%';
      await uploadXHR(`/api/trips/${tripId}/anexos/upload`, fd, p => {
        fill.style.width = p + '%';
        lbl.textContent = p < 100 ? `Enviando ${p}%` : 'Processando…';
      });
    } else {
      const url = document.getElementById('trpAnexoUrl').value.trim();
      if (!nome || !url) { alert('Preencha nome e URL.'); return; }
      await api.post(`/api/trips/${tripId}/anexos`, { tipo, nome, url, descricao: desc || null });
    }
    document.getElementById('trpAnexoModal').classList.remove('open');
    await refresh();
  } catch (e) {
    alert('Erro: ' + e.message);
  } finally {
    document.getElementById('trpAnexoProgress').style.display = 'none';
    if (btn) btn.disabled = false;
  }
}

async function remove(anexoId) {
  const tripId = currentTripId();
  if (!tripId) return;
  if (!confirm('Excluir este anexo?')) return;
  try {
    await api.delete(`/api/trips/${tripId}/anexos/${anexoId}`);
    await refresh();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

/* ============================================================
   Painel lateral persistente — PDF/imagem fica fixo à direita
   do tripModal enquanto o usuário troca de aba e edita campos.
   ============================================================ */
async function openPane(ev, anexoId) {
  if (ev?.preventDefault) ev.preventDefault();
  const tripId = currentTripId();
  if (!tripId) return;
  const anexo = localState.anexos.find(a => a.id === anexoId);
  const nome = anexo?.nome || 'Folha';
  const mime = anexo?.mime_type || '';

  const overlay = document.getElementById('tripModal');
  const pane    = document.getElementById('trpPdfPane');
  const body    = document.getElementById('trpPdfPaneBody');
  const title   = document.getElementById('trpPdfPaneTitle');
  const dl      = document.getElementById('trpPdfPaneDownload');
  if (!overlay || !pane || !body) return;

  overlay.classList.add('has-pdf-pane');
  pane.setAttribute('aria-hidden', 'false');
  if (title) title.textContent = '📄 ' + nome;
  body.innerHTML = '<div class="trip-pdf-pane-loading">Carregando…</div>';

  try {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/trips/${tripId}/anexos/${anexoId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) {
      body.innerHTML = `<div class="trip-pdf-pane-placeholder">Erro ${res.status} ao carregar anexo.</div>`;
      return;
    }
    const blob = await res.blob();
    if (localState.paneUrl) URL.revokeObjectURL(localState.paneUrl);
    localState.paneUrl = URL.createObjectURL(blob);
    localState.paneAnexoId = anexoId;
    if (dl) { dl.href = localState.paneUrl; dl.setAttribute('download', nome); }
    const effective = mime || blob.type || '';
    if (effective.startsWith('image/')) {
      body.innerHTML = `<img alt="${esc(nome)}" src="${localState.paneUrl}">`;
    } else if (effective === 'application/pdf') {
      body.innerHTML = `<iframe src="${localState.paneUrl}#toolbar=1&navpanes=0&view=FitH" title="${esc(nome)}"></iframe>`;
    } else {
      body.innerHTML = `<div class="trip-pdf-pane-placeholder">Tipo (${esc(effective || 'desconhecido')}) não pode ser exibido aqui.<br>Use o botão <b>⬇</b> pra baixar.</div>`;
    }
  } catch (e) {
    body.innerHTML = `<div class="trip-pdf-pane-placeholder">Erro: ${esc(e.message)}</div>`;
  }
}

function closePane() {
  const overlay = document.getElementById('tripModal');
  const pane    = document.getElementById('trpPdfPane');
  const body    = document.getElementById('trpPdfPaneBody');
  if (overlay) overlay.classList.remove('has-pdf-pane');
  if (pane) pane.setAttribute('aria-hidden', 'true');
  if (body) body.innerHTML = `<div class="trip-pdf-pane-placeholder">Clique em uma folha na aba <b>📎 Folha de Acerto</b> pra ela aparecer aqui ao lado.</div>`;
  if (localState.paneUrl) {
    URL.revokeObjectURL(localState.paneUrl);
    localState.paneUrl = null;
    localState.paneAnexoId = null;
  }
}

/* ============================================================
   Drop direto na aba do tripModal (faz upload em batch)
   ============================================================ */
async function batchUpload(files) {
  const tripId = currentTripId();
  if (!tripId) { alert('Salve a viagem antes de anexar.'); return; }
  if (!files || !files.length) return;
  let ok = 0, fail = 0;
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) { fail++; continue; }
    try {
      const fd = new FormData();
      fd.append('arquivo', file);
      fd.append('tipo', 'FOLHA_ACERTO');
      await uploadXHR(`/api/trips/${tripId}/anexos/upload`, fd);
      ok++;
    } catch {
      fail++;
    }
  }
  await refresh();
  if (fail > 0) alert(`${ok} enviado(s), ${fail} com erro.`);
}

function wireTabDrop() {
  const tab = document.getElementById('tab-anexo');
  if (!tab || localState.tabDropWired) return;
  localState.tabDropWired = true;

  let dragCount = 0;
  const reset = () => { dragCount = 0; tab.classList.remove('drop-active'); };
  tab.addEventListener('dragenter', e => {
    if (!e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return;
    e.preventDefault();
    dragCount++;
    tab.classList.add('drop-active');
  });
  tab.addEventListener('dragover', e => { e.preventDefault(); });
  tab.addEventListener('dragleave', () => { dragCount--; if (dragCount <= 0) reset(); });
  tab.addEventListener('drop', e => {
    e.preventDefault();
    reset();
    const files = [];
    if (e.dataTransfer.items) {
      for (const it of e.dataTransfer.items) {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
    }
    if (!files.length && e.dataTransfer.files) {
      for (const f of e.dataTransfer.files) files.push(f);
    }
    if (files.length) batchUpload(files);
  });
}

/* ============================================================
   Exposição global
   ============================================================ */
/* ============================================================
   Painel GLOBAL — abre na view de resumo (fora do modal),
   pra ver a folha enquanto edita os campos inline.
   ============================================================ */
const globalPaneState = { tripId: null, anexos: [], currentAnexoId: null, paneUrl: null };

async function openGlobalPane(tripId, anexoIdOpt) {
  if (!tripId) return;
  let anexos = [];
  try {
    const trip = await api.get('/api/trips/' + tripId);
    anexos = trip.trip_anexos || [];
  } catch {
    anexos = [];
  }
  if (!anexos.length) {
    alert('Esta viagem ainda não tem folha anexada. Abra a viagem (✏️) e anexe a folha primeiro.');
    return;
  }
  globalPaneState.tripId = tripId;
  globalPaneState.anexos = anexos;
  // Marca o botão da viagem como ativo
  document.querySelectorAll('.trip-folha-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tripId === tripId);
  });
  document.body.classList.add('has-global-pdf-pane');
  document.getElementById('globalPdfPane').setAttribute('aria-hidden', 'false');
  // Popula dropdown se há mais de um anexo
  const sel = document.getElementById('globalPdfPaneSelect');
  if (sel) {
    sel.innerHTML = anexos.map(a => `<option value="${esc(a.id)}">${esc(a.nome || 'Folha')}</option>`).join('');
    sel.style.display = anexos.length > 1 ? '' : 'none';
  }
  const target = anexoIdOpt || anexos[0].id;
  if (sel) sel.value = target;
  await loadGlobalPdf(target);
}

async function loadGlobalPdf(anexoId) {
  const tripId = globalPaneState.tripId;
  if (!tripId || !anexoId) return;
  const anexo = globalPaneState.anexos.find(a => a.id === anexoId) || globalPaneState.anexos[0];
  globalPaneState.currentAnexoId = anexoId;
  const nome = anexo?.nome || 'Folha';
  const mime = anexo?.mime_type || '';
  const body  = document.getElementById('globalPdfPaneBody');
  const title = document.getElementById('globalPdfPaneTitle');
  const dl    = document.getElementById('globalPdfPaneDownload');
  if (title) title.textContent = '📄 ' + nome;
  if (body)  body.innerHTML = '<div class="global-pdf-pane-loading">Carregando…</div>';
  try {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/trips/${tripId}/anexos/${anexoId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) {
      if (body) body.innerHTML = `<div class="global-pdf-pane-placeholder">Erro ${res.status} ao carregar anexo.</div>`;
      return;
    }
    const blob = await res.blob();
    if (globalPaneState.paneUrl) URL.revokeObjectURL(globalPaneState.paneUrl);
    globalPaneState.paneUrl = URL.createObjectURL(blob);
    if (dl) { dl.href = globalPaneState.paneUrl; dl.setAttribute('download', nome); }
    const effective = mime || blob.type || '';
    if (effective.startsWith('image/')) {
      body.innerHTML = `<img alt="${esc(nome)}" src="${globalPaneState.paneUrl}">`;
    } else if (effective === 'application/pdf') {
      body.innerHTML = `<iframe src="${globalPaneState.paneUrl}#toolbar=1&navpanes=0&view=FitH" title="${esc(nome)}"></iframe>`;
    } else {
      body.innerHTML = `<div class="global-pdf-pane-placeholder">Tipo (${esc(effective || 'desconhecido')}) não pode ser exibido aqui.<br>Use o botão <b>⬇</b> pra baixar.</div>`;
    }
  } catch (e) {
    if (body) body.innerHTML = `<div class="global-pdf-pane-placeholder">Erro: ${esc(e.message)}</div>`;
  }
}

function switchGlobalPdf(anexoId) {
  loadGlobalPdf(anexoId);
}

function closeGlobalPane() {
  document.body.classList.remove('has-global-pdf-pane');
  document.getElementById('globalPdfPane')?.setAttribute('aria-hidden', 'true');
  document.querySelectorAll('.trip-folha-btn').forEach(b => b.classList.remove('active'));
  if (globalPaneState.paneUrl) {
    URL.revokeObjectURL(globalPaneState.paneUrl);
    globalPaneState.paneUrl = null;
  }
  globalPaneState.tripId = null;
  globalPaneState.currentAnexoId = null;
  const body = document.getElementById('globalPdfPaneBody');
  if (body) body.innerHTML = `<div class="global-pdf-pane-placeholder">Clique em <b>📎 Folha</b> em qualquer viagem pra ver aqui ao lado.</div>`;
}

window.trpAnx = {
  openModal,
  switchMode,
  save,
  remove,
  openPane,
  closePane,
  refresh,
  // Painel global persistente da view de resumo:
  openGlobalPane,
  switchGlobalPdf,
  closeGlobalPane,
};

export { refresh, renderList };
