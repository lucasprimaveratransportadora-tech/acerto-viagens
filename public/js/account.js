import { api } from './api.js';
import { getCurrentUser } from './auth.js';

function byId(id) {
  return document.getElementById(id);
}

function closeMenu() {
  const menu = byId('currentUserMenu');
  if (menu) menu.style.display = 'none';
}

function validateNewPassword(value) {
  return typeof value === 'string' && value.length >= 8 && /[a-zA-Z]/.test(value) && /\d/.test(value);
}

window.toggleCurrentUserMenu = function toggleCurrentUserMenu(event) {
  event?.stopPropagation?.();
  const menu = byId('currentUserMenu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' || !menu.style.display ? 'block' : 'none';
};

window.openAccountModal = function openAccountModal() {
  closeMenu();
  const user = getCurrentUser();
  const summary = byId('accountUserSummary');
  if (summary) {
    summary.textContent = user ? `${user.nome} · ${user.email}` : '';
  }
  byId('accountCurrentPassword').value = '';
  byId('accountNewPassword').value = '';
  byId('accountConfirmPassword').value = '';
  byId('accountError').textContent = '';
  byId('accountModal').style.display = 'flex';
  byId('accountCurrentPassword').focus();
};

window.closeAccountModal = function closeAccountModal() {
  byId('accountModal').style.display = 'none';
};

window.submitAccountPasswordChange = async function submitAccountPasswordChange() {
  const currentPassword = byId('accountCurrentPassword').value;
  const newPassword = byId('accountNewPassword').value;
  const confirmPassword = byId('accountConfirmPassword').value;
  const errorEl = byId('accountError');
  const button = byId('accountSaveBtn');

  errorEl.textContent = '';

  if (!currentPassword) {
    errorEl.textContent = 'Informe sua senha atual.';
    return;
  }
  if (!validateNewPassword(newPassword)) {
    errorEl.textContent = 'A nova senha precisa ter 8+ caracteres, letra e número.';
    return;
  }
  if (newPassword !== confirmPassword) {
    errorEl.textContent = 'A confirmação da nova senha não confere.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Salvando...';
  try {
    const result = await api.post('/api/auth/change-password', {
      senha_atual: currentPassword,
      nova_senha: newPassword,
    });
    window.closeAccountModal();
    alert(`${result.message}\n${result.sessions_revoked} sessão(ões) encerrada(s).`);
  } catch (error) {
    errorEl.textContent = error.message || 'Não foi possível alterar a senha.';
  } finally {
    button.disabled = false;
    button.textContent = 'Alterar senha';
  }
};

document.addEventListener('click', (event) => {
  const menu = byId('currentUserMenu');
  if (!menu || menu.style.display !== 'block') return;
  if (!menu.contains(event.target)) {
    closeMenu();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeMenu();
    if (byId('accountModal')?.style.display === 'flex') {
      window.closeAccountModal();
    }
  }
});
