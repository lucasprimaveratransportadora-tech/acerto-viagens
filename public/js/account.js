import { api } from './api.js';
import { getCurrentUser } from './auth.js';

let previouslyFocusedElement = null;

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

function getFocusableElements() {
  const modal = byId('accountModal');
  if (!modal) return [];
  return Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((element) => !element.disabled && element.tabIndex !== -1 && element.offsetParent !== null);
}

function focusInitialField() {
  byId('accountCurrentPassword')?.focus();
}

window.openAccountModal = function openAccountModal(event) {
  previouslyFocusedElement = event?.currentTarget || document.activeElement;
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
  byId('accountModal').setAttribute('aria-hidden', 'false');
  focusInitialField();
};

window.closeAccountModal = function closeAccountModal() {
  byId('accountModal').style.display = 'none';
  byId('accountModal').setAttribute('aria-hidden', 'true');
  const elementToRestore = previouslyFocusedElement;
  previouslyFocusedElement = null;
  elementToRestore?.focus?.();
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
    focusInitialField();
    return;
  }
  if (!validateNewPassword(newPassword)) {
    errorEl.textContent = 'A nova senha precisa ter 8+ caracteres, letra e número.';
    byId('accountNewPassword')?.focus();
    return;
  }
  if (newPassword !== confirmPassword) {
    errorEl.textContent = 'A confirmação da nova senha não confere.';
    byId('accountConfirmPassword')?.focus();
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

byId('accountModal')?.addEventListener('mousedown', (event) => {
  if (event.target === event.currentTarget) {
    window.closeAccountModal();
  }
});

document.addEventListener('click', (event) => {
  const menu = byId('currentUserMenu');
  if (!menu || menu.style.display !== 'block') return;
  if (!menu.contains(event.target)) {
    closeMenu();
  }
});

document.addEventListener('keydown', (event) => {
  const modal = byId('accountModal');
  const modalOpen = modal?.style.display === 'flex';

  if (event.key === 'Escape') {
    closeMenu();
    if (modalOpen) {
      event.preventDefault();
      window.closeAccountModal();
    }
  }

  if (!modalOpen || event.key !== 'Tab') return;

  const focusableElements = getFocusableElements();
  if (!focusableElements.length) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
    return;
  }

  if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
});
