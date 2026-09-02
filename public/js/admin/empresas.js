import { api, getToken, setToken } from '../api.js';
import { esc } from '../utils.js';
const attr = v => String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export async function renderEmpresas(container) {
  try {
    const rows = await api.get('/api/empresas');
    container.innerHTML = `
      <section class="empresas-shell">
        <div class="empresas-hero">
          <div><span class="admin-kicker">Gestão da plataforma</span><h2>Transportadoras</h2><p>Marcas, acessos e operação de cada empresa em um único lugar.</p></div>
          <button class="btn btn-accent empresas-new" id="novaEmpresaBtn">+ Nova transportadora</button>
        </div>
        <div id="empresaForm"></div>
        <div class="empresa-grid">
          ${rows.map(e => empresaCard(e)).join('')}
        </div>
      </section>`;
    container.querySelector('#novaEmpresaBtn').onclick = () => showForm(container.querySelector('#empresaForm'));
    container.querySelectorAll('[data-enter]').forEach(b => b.onclick = () => enterAs(b.dataset.enter));
    container.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => showForm(container.querySelector('#empresaForm'), rows.find(e => e.id === b.dataset.edit)));
    container.querySelectorAll('[data-status]').forEach(b => b.onclick = async () => { await api.patch(`/api/empresas/${b.dataset.status}/status`, { ativo: b.dataset.active !== 'true' }); renderEmpresas(container); });
  } catch (e) { container.innerHTML = `<div class="ft-error-banner">${esc(e.message)}</div>`; }
}

function showForm(host, empresa = null) {
  host.innerHTML = `<form class="empresa-editor" id="empresaEditor">
    <div class="empresa-editor-head"><div><span class="admin-kicker">${empresa ? 'Editar cadastro' : 'Nova operação'}</span><h3>${empresa ? 'Dados da transportadora' : 'Criar transportadora'}</h3></div><button type="button" class="btn btn-ghost btn-sm" id="cancelEmpresa">Fechar</button></div>
    <div class="empresa-editor-grid">
      <label>Nome da transportadora<input name="nome" placeholder="Ex.: RPM Logística" value="${attr(empresa?.nome || '')}" required maxlength="200"></label>
      <label>CNPJ <span>opcional</span><input name="cnpj" placeholder="00.000.000/0000-00" value="${attr(empresa?.cnpj || '')}" maxlength="20"></label>
      <label>Cor da marca<input name="cor_primaria" type="color" value="${attr(empresa?.cor_primaria || '#E30613')}"></label>
      <label>Logo <span>PNG, JPG ou WebP</span><input name="logo" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <label class="empresa-upload">Capa do sistema <span>JPEG/WebP, até 5 MB</span><input name="capa" type="file" accept="image/jpeg,image/webp"></label>
      ${empresa ? '' : '<label>Nome do proprietário<input name="admin_nome" placeholder="Nome completo" required></label><label>E-mail do proprietário<input name="admin_email" type="email" placeholder="email@empresa.com" required></label><label>Senha inicial<input name="admin_senha" type="password" placeholder="8+ caracteres, letra e número" required></label>'}
    </div>
    <div class="empresa-editor-actions"><button class="btn btn-accent" type="submit">${empresa ? 'Salvar alterações' : 'Criar transportadora'}</button></div>
  </form>`;
  host.querySelector('#cancelEmpresa').onclick = () => { host.innerHTML = ''; };
  host.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const body = Object.fromEntries([...fd.entries()].filter(([k]) => !['logo', 'capa'].includes(k)));
    const saved = empresa ? await api.patch(`/api/empresas/${empresa.id}`, body) : await api.post('/api/empresas', body);
    const logo = fd.get('logo');
    if (logo?.size) {
      await uploadAsset(saved.id, 'logo', logo, 'Empresa salva, mas o upload da logo falhou.');
    }
    const capa = fd.get('capa');
    if (capa?.size) await uploadAsset(saved.id, 'capa', capa, 'Empresa salva, mas o upload da capa falhou.');
    renderEmpresas(document.getElementById('adminContent'));
  };
}

function empresaCard(empresa) {
  const logo = empresa.logo_mime ? `/api/empresas/${empresa.id}/logo?v=${empresa.logo_tamanho || 0}` : empresa.logo_url;
  const status = empresa.ativo ? 'Ativa' : 'Bloqueada';
  return `<article class="empresa-card" style="--empresa-cor:${attr(empresa.cor_primaria || '#E30613')}">
    <div class="empresa-card-top">
      <div class="empresa-mark">${logo ? `<img src="${attr(logo)}" alt="${attr(empresa.nome)}">` : `<span>${esc(empresa.nome.slice(0, 2).toUpperCase())}</span>`}</div>
      <span class="empresa-status ${empresa.ativo ? 'is-active' : 'is-blocked'}">${status}</span>
    </div>
    <h3>${esc(empresa.nome)}</h3>
    <p class="empresa-cnpj">${esc(empresa.cnpj || 'CNPJ não informado')}</p>
    <div class="empresa-metrics"><span><b>${empresa._count.users}</b> usuário${empresa._count.users === 1 ? '' : 's'}</span><span><b>${empresa._count.trucks}</b> caminhão${empresa._count.trucks === 1 ? '' : 'ões'}</span></div>
    <div class="empresa-brand-meta"><i></i><span>${esc(empresa.cor_primaria || '#E30613').toUpperCase()}</span><em>${empresa.capa_mime ? 'Capa própria' : 'Capa dinâmica'}</em></div>
    <div class="empresa-card-actions">${empresa.ativo ? `<button class="btn btn-ghost btn-sm" data-enter="${empresa.id}">Acessar empresa</button>` : ''}<button class="btn btn-ghost btn-sm" data-edit="${empresa.id}">Editar</button><button class="btn btn-ghost btn-sm empresa-status-btn" data-status="${empresa.id}" data-active="${empresa.ativo}">${empresa.ativo ? 'Bloquear' : 'Liberar'}</button></div>
  </article>`;
}

async function uploadAsset(empresaId, field, file, errorMessage) {
  const up = new FormData();
  up.append(field, file);
  const res = await fetch(`/api/empresas/${empresaId}/${field}`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: up, credentials: 'include' });
  if (!res.ok) throw new Error(errorMessage);
}

async function enterAs(empresa_id) {
  const r = await api.post('/api/auth/impersonar', { empresa_id });
  setToken(r.accessToken);
  location.reload();
}
