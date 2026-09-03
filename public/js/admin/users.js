import { api } from '../api.js';
import { state } from '../state.js';
import { esc } from '../utils.js';
import { getCurrentUser } from '../auth.js';

export async function renderUsers(container) {
  try {
    state.adminUsers = await api.get('/api/users');
  } catch (e) {
    container.innerHTML = `<div style="color:var(--danger);padding:1rem">Erro: ${esc(e.message)}</div>`;
    return;
  }
  draw(container, '');
}

function draw(container, search) {
  const actor = getCurrentUser();
  const canAssignAdmin = actor?.role === 'SUPER_ADMIN' || actor?.realUser?.role === 'SUPER_ADMIN';
  const filtered = state.adminUsers.filter(u =>
    !search ||
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
      <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
        <button class="btn btn-accent btn-sm" onclick="adminUserNew()">+ Novo Usuário</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="openAccountModal(event)">Minha conta / Alterar senha</button>
      </div>
      <input class="inline-input" placeholder="Buscar nome/email..." style="width:250px" oninput="adminUserFilter(this.value)" value="${esc(search)}">
    </div>
    <div style="font-size:.75rem;color:var(--muted);margin-bottom:.75rem">
      Novos usuários entram na empresa da sua sessão. Perfis operacionais devem ser criados como GESTOR com módulos explícitos.${canAssignAdmin ? ' Você também pode promover acesso ADMIN quando necessário.' : ' A criação de outro ADMIN fica reservada ao superadmin da plataforma.'}
    </div>
    <table class="admin-table">
      <thead>
        <tr><th>Nome</th><th>Email</th><th>Role</th><th>Acessos</th><th>Status</th><th style="text-align:right">Ações</th></tr>
      </thead>
      <tbody>
        ${filtered.map(u => {
          const perms = u.role === 'ADMIN'
            ? '<span style="color:var(--success);font-family:\'IBM Plex Mono\',monospace;font-size:.65rem">TODOS</span>'
            : (Array.isArray(u.permissoes) && u.permissoes.length
                ? u.permissoes.map(p => {
                    const icons = { 'frota':'🚚', 'frete-terceiro':'🔁', 'veiculos':'🛡️', 'rentabilidade':'💰', 'controle-viagens':'📋' };
                    return `<span title="${esc(p)}" style="margin-right:4px">${icons[p] || '·'}</span>`;
                  }).join('')
                : '<span style="color:var(--muted);font-size:.7rem">— nenhum —</span>');
          return `
          <tr>
            <td>${esc(u.nome)}</td>
            <td><code style="font-size:.7rem;color:var(--muted)">${esc(u.email)}</code></td>
            <td><span class="action-badge ${u.role === 'ADMIN' ? 'action-DELETE' : 'action-UPDATE'}">${u.role}</span></td>
            <td style="font-size:1rem">${perms}</td>
            <td>${u.ativo ? '<span style="color:var(--success)">Ativo</span>' : '<span style="color:var(--muted)">Inativo</span>'}</td>
            <td style="text-align:right;white-space:nowrap">
              <button class="btn btn-ghost btn-sm" onclick="adminUserEdit('${esc(u.id)}')">Editar</button>
              <button class="btn btn-ghost btn-sm" onclick="adminUserResetPwd('${esc(u.id)}')" title="Resetar senha">↻ Senha</button>
              <button class="btn btn-ghost btn-sm" onclick="adminUserRevoke('${esc(u.id)}')" title="Encerrar sessões">Sair</button>
              <button class="btn btn-ghost btn-sm" onclick="adminUserToggle('${esc(u.id)}', ${!u.ativo})">${u.ativo ? 'Desativar' : 'Ativar'}</button>
            </td>
          </tr>
        `;
        }).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem">Nenhum usuário</td></tr>`}
      </tbody>
    </table>
  `;
}

window.adminUserFilter = function (val) {
  draw(document.getElementById('adminContent'), val);
};

const ALL_MODULES = [
  { key: 'frota',            label: '🚚 Acerto de Viagem' },
  { key: 'frete-terceiro',   label: '🔁 Frete Terceiro' },
  { key: 'veiculos',         label: '🛡️ Veículos' },
  { key: 'rentabilidade',    label: '💰 Rentabilidade' },
  { key: 'controle-viagens', label: '📋 Controle de Viagens' },
];

window.adminUserNew = function () {
  showUserModal({ id: '', nome: '', email: '', role: 'GESTOR', ativo: true, permissoes: ALL_MODULES.map(m => m.key) });
};

window.adminUserEdit = function (id) {
  const u = state.adminUsers.find(x => x.id === id);
  if (u) showUserModal(u);
};

window.adminUserToggle = async function (id, ativo) {
  if (!confirm(ativo ? 'Reativar este usuário?' : 'Desativar este usuário? Ele perde acesso imediatamente.')) return;
  try {
    await api.patch('/api/users/' + id, { ativo });
    await renderUsers(document.getElementById('adminContent'));
  } catch (e) { alert('Erro: ' + e.message); }
};

function showUserModal(u) {
  const isNew = !u.id;
  const actor = getCurrentUser();
  const canAssignAdmin = actor?.role === 'SUPER_ADMIN' || actor?.realUser?.role === 'SUPER_ADMIN';
  const isLockedAdmin = !isNew && u.role === 'ADMIN' && !canAssignAdmin;
  const userPerms = Array.isArray(u.permissoes) ? u.permissoes : ALL_MODULES.map(m => m.key);
  const permsCheckboxes = ALL_MODULES.map(m => `
    <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:5px;background:var(--surface2);cursor:pointer">
      <input type="checkbox" name="uPerm" value="${esc(m.key)}" ${userPerms.includes(m.key) ? 'checked' : ''}>
      <span style="font-size:.85rem">${m.label}</span>
    </label>
  `).join('');

  const html = `
    <div class="modal-overlay" id="userModal" style="display:flex">
      <div class="modal" style="width:520px;max-width:96vw;max-height:92vh;overflow-y:auto">
        <div class="modal-title">${isNew ? '+ Novo Usuário' : 'Editar Usuário'}</div>
        <div class="form-row"><div class="form-group">
          <label>Nome *</label><input id="uNome" value="${esc(u.nome)}">
        </div></div>
        <div class="form-row"><div class="form-group">
          <label>Email *</label><input id="uEmail" type="email" value="${esc(u.email)}" ${isNew ? '' : 'disabled'}>
        </div></div>
        ${isNew ? `<div class="form-row"><div class="form-group">
          <label>Senha *</label><input id="uSenha" type="password" placeholder="Min 6 chars">
        </div></div>` : ''}
        <div class="form-row"><div class="form-group">
          <label>Tipo de acesso</label>
          <select id="uRole" onchange="adminTogglePermsBlock()" ${isLockedAdmin ? 'disabled' : ''}>
            <option value="GESTOR" ${(u.role === 'GESTOR' || (isNew && !canAssignAdmin)) ? 'selected' : ''}>GESTOR (módulos selecionados)</option>
            <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''} ${(canAssignAdmin || isLockedAdmin) ? '' : 'disabled'}>ADMIN (acesso total)</option>
          </select>
          <p style="font-size:.7rem;color:var(--muted);margin-top:6px">
            ${canAssignAdmin
              ? 'GESTOR acessa somente os módulos marcados. ADMIN herda acesso total da empresa.'
              : (isLockedAdmin
                  ? 'Este usuário já é ADMIN da empresa. O papel fica visível, mas bloqueado neste ambiente.'
                  : 'Neste ambiente você pode criar e editar gestores. Promoção para ADMIN exige superadmin.')}
          </p>
        </div></div>

        <div id="uPermsBlock" class="form-row" style="display:${u.role === 'ADMIN' ? 'none' : ''};flex-direction:column">
          <div class="form-group" style="width:100%">
            <label>Módulos liberados</label>
            <p style="font-size:.7rem;color:var(--muted);margin-bottom:8px">
              Marque quais áreas este usuário pode acessar. ADMIN tem acesso a tudo automaticamente.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              ${permsCheckboxes}
            </div>
          </div>
        </div>

        ${isNew ? '' : `<div class="form-row"><div class="form-group">
          <label><input id="uAtivo" type="checkbox" ${u.ativo ? 'checked' : ''}> Ativo</label>
        </div></div>`}
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="document.getElementById('userModal').remove()">Cancelar</button>
          <button class="btn btn-accent" onclick="adminUserSave('${esc(u.id)}', ${isNew})">Salvar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

window.adminTogglePermsBlock = function () {
  const actor = getCurrentUser();
  const canAssignAdmin = actor?.role === 'SUPER_ADMIN' || actor?.realUser?.role === 'SUPER_ADMIN';
  const roleSelect = document.getElementById('uRole');
  const role = roleSelect ? roleSelect.value : 'GESTOR';
  const block = document.getElementById('uPermsBlock');
  if (block) block.style.display = role === 'ADMIN' && canAssignAdmin ? 'none' : '';
};

window.adminUserSave = async function (id, isNew) {
  const nome = document.getElementById('uNome').value.trim();
  const email = isNew ? document.getElementById('uEmail').value.trim() : null;
  const senha = isNew ? document.getElementById('uSenha').value : null;
  const roleSelect = document.getElementById('uRole');
  const requestedRole = roleSelect ? roleSelect.value : 'GESTOR';
  const role = roleSelect?.disabled && !isNew ? null : requestedRole;
  const ativo = isNew ? true : document.getElementById('uAtivo').checked;
  const permissoes = Array.from(document.querySelectorAll('input[name="uPerm"]:checked')).map(el => el.value);
  if (!nome) return alert('Nome obrigatório.');
  if (isNew && (!email || !senha)) return alert('Email e senha obrigatórios.');
  if ((role || requestedRole) === 'GESTOR' && permissoes.length === 0) {
    if (!confirm('Este usuário GESTOR não terá acesso a nenhum módulo. Continuar mesmo assim?')) return;
  }
  try {
    const body = { nome, permissoes };
    if (role) body.role = role;
    if (isNew) { body.email = email; body.senha = senha; }
    else { body.ativo = ativo; }
    if (isNew) await api.post('/api/users', body);
    else await api.patch('/api/users/' + id, body);
    document.getElementById('userModal').remove();
    await renderUsers(document.getElementById('adminContent'));
    // Se o usuário admin atual editou as próprias permissões, atualizar tabs
    if (window.refreshPermissions) window.refreshPermissions();
  } catch (e) { alert('Erro: ' + e.message); }
};

window.adminUserResetPwd = function (id) {
  const u = state.adminUsers.find(x => x.id === id);
  if (!u) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="resetPwdModal" style="display:flex">
      <div class="modal" style="width:420px">
        <div class="modal-title">↻ Resetar senha de ${esc(u.nome)}</div>
        <div style="background:rgba(234,179,8,.08);border:1px solid rgba(234,179,8,.3);padding:.6rem;border-radius:5px;font-size:.75rem;color:#eab308;margin-bottom:.7rem">
          ⚠️ Isso vai encerrar TODAS as sessões deste usuário e exigir novo login.
        </div>
        <div class="form-row"><div class="form-group">
          <label>Nova senha *</label>
          <input id="rpNova" type="password" placeholder="Min 8 chars, 1 letra + 1 dígito">
        </div></div>
        <div class="form-row"><div class="form-group">
          <label>Confirmar senha *</label>
          <input id="rpConf" type="password">
        </div></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="document.getElementById('resetPwdModal').remove()">Cancelar</button>
          <button class="btn btn-danger" onclick="adminUserResetPwdSubmit('${esc(id)}')">Resetar</button>
        </div>
      </div>
    </div>`);
};

window.adminUserResetPwdSubmit = async function (id) {
  const nova = document.getElementById('rpNova').value;
  const conf = document.getElementById('rpConf').value;
  if (nova.length < 8) return alert('Senha deve ter no mínimo 8 caracteres.');
  if (!/[a-zA-Z]/.test(nova) || !/\d/.test(nova)) return alert('Senha deve conter letras e números.');
  if (nova !== conf) return alert('Senhas não coincidem.');
  try {
    const r = await api.post('/api/users/' + id + '/reset-password', { senha: nova });
    document.getElementById('resetPwdModal').remove();
    alert(`Senha redefinida. ${r.sessions_revoked} sessão(ões) encerrada(s).`);
  } catch (e) { alert('Erro: ' + e.message); }
};

window.adminUserRevoke = async function (id) {
  const u = state.adminUsers.find(x => x.id === id);
  if (!u) return;
  if (!confirm(`Encerrar todas as sessões ativas de ${u.nome}? Ele cai do sistema imediatamente.`)) return;
  try {
    const r = await api.delete('/api/users/' + id + '/sessions');
    alert(`${r.revoked} sessão(ões) encerrada(s).`);
  } catch (e) { alert('Erro: ' + e.message); }
};
