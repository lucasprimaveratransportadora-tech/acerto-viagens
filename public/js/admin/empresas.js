import { api, getToken, setToken } from '../api.js';
import { esc } from '../utils.js';
const attr = v => String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export async function renderEmpresas(container) {
  try {
    const rows = await api.get('/api/empresas');
    container.innerHTML = `
      <div class="admin-toolbar"><h2>Transportadoras</h2><button class="primary" id="novaEmpresaBtn">+ Nova empresa</button></div>
      <div id="empresaForm"></div>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Empresa</th><th>Marca</th><th>Usuários</th><th>Caminhões</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(e => `<tr><td><b>${esc(e.nome)}</b><br><small>${esc(e.cnpj || '')}</small></td><td><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${esc(e.cor_primaria)}"></span> ${esc(e.cor_primaria)}<br><small>${e.logo_mime || e.logo_url ? 'Logo cadastrada' : 'Logo padrão'} · ${e.capa_mime ? 'Capa cadastrada' : 'Capa industrial automática'}</small></td><td>${e._count.users}</td><td>${e._count.trucks}</td><td>${e.ativo ? 'Ativa' : 'Bloqueada'}</td><td>${e.ativo ? `<button data-enter="${e.id}">Entrar como</button>` : ''} <button data-edit="${e.id}">Editar</button> <button data-status="${e.id}" data-active="${e.ativo}">${e.ativo ? 'Bloquear' : 'Liberar'}</button></td></tr>`).join('')}
      </tbody></table></div>`;
    container.querySelector('#novaEmpresaBtn').onclick = () => showForm(container.querySelector('#empresaForm'));
    container.querySelectorAll('[data-enter]').forEach(b => b.onclick = () => enterAs(b.dataset.enter));
    container.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => showForm(container.querySelector('#empresaForm'), rows.find(e => e.id === b.dataset.edit)));
    container.querySelectorAll('[data-status]').forEach(b => b.onclick = async () => { await api.patch(`/api/empresas/${b.dataset.status}/status`, { ativo: b.dataset.active !== 'true' }); renderEmpresas(container); });
  } catch (e) { container.innerHTML = `<div class="ft-error-banner">${esc(e.message)}</div>`; }
}

function showForm(host, empresa = null) {
  host.innerHTML = `<form class="admin-filters" id="empresaEditor">
    <input name="nome" placeholder="Nome da transportadora" value="${attr(empresa?.nome || '')}" required maxlength="200">
    <input name="cnpj" placeholder="CNPJ" value="${attr(empresa?.cnpj || '')}" maxlength="20">
    <input name="cor_primaria" type="color" value="${attr(empresa?.cor_primaria || '#E30613')}">
    ${empresa ? '' : '<input name="admin_nome" placeholder="Nome do primeiro administrador" required><input name="admin_email" type="email" placeholder="Email do administrador" required><input name="admin_senha" type="password" placeholder="Senha (8+, letra e número)" required>'}
    <label>Logo <input name="logo" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <label>Capa do sistema (JPEG ou WebP, até 5 MB) <input name="capa" type="file" accept="image/jpeg,image/webp"></label>
    <button class="primary" type="submit">Salvar</button><button type="button" id="cancelEmpresa">Cancelar</button>
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
