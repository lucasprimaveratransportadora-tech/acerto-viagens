// modals.js — Generic modal management

export function openModal(id) {
  document.getElementById(id).classList.add('open');
}

export function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Close on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('open')) {
    e.target.classList.remove('open');
  }
});

window.closeModal = closeModal;

/* Observer global do modal de preview de anexo:
   sempre que o modal #ftAnexoPreviewModal fecha (Esc, click no overlay,
   botão Fechar, closeModal por qualquer caminho), dispara o cleanup
   global de blob URLs registrados em window.__previewCleanupHooks.
   Isso evita que o cleanup só funcione quando o módulo Frete Terceiro
   tiver sido inicializado — agora vale pra Veículos, Rentabilidade,
   ou qualquer outro consumidor do preview. */
function setupPreviewObserver() {
  const modal = document.getElementById('ftAnexoPreviewModal');
  if (!modal || modal.__previewObs) return;
  let wasOpen = modal.classList.contains('open');
  const obs = new MutationObserver(() => {
    const isOpen = modal.classList.contains('open');
    if (wasOpen && !isOpen) {
      // Revoga blob URLs registrados pelos módulos
      if (Array.isArray(window.__previewCleanupHooks)) {
        for (const fn of window.__previewCleanupHooks) {
          try { fn(); } catch { /* */ }
        }
      }
      // Limpa o body do preview
      const body = document.getElementById('ftPrevBody');
      if (body) body.innerHTML = '';
    }
    wasOpen = isOpen;
  });
  obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
  modal.__previewObs = obs;
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPreviewObserver);
} else {
  setupPreviewObserver();
}
