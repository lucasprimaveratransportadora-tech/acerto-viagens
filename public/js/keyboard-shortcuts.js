// keyboard-shortcuts.js — Atalhos globais sensíveis ao contexto.
//
// Regras gerais:
//   * Não dispara dentro de <input>, <textarea>, <select> ou contentEditable.
//     Exceção: Esc sempre funciona (pra fechar modal mesmo com input focado).
//   * O contexto vem de document.body.dataset.view ('hub' | 'frota' | 'frete-terceiro').
//   * Modais abertos têm prioridade: Esc fecha primeiro o modal.

function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function getOpenModal() {
  const open = document.querySelector('.modal-overlay.open, .confirm-overlay.open');
  return open || null;
}

function closeOpenModals() {
  document.querySelectorAll('.modal-overlay.open, .confirm-overlay.open').forEach(m => m.classList.remove('open'));
}

function currentView() {
  return document.body.dataset.view || 'hub';
}

function focusFirstSearch() {
  const view = currentView();
  let id = null;
  if (view === 'frete-terceiro') id = 'ftFilterQ';
  // (acerto de frota: poderia ter uma busca futura)
  if (id) {
    const el = document.getElementById(id);
    if (el) { el.focus(); el.select?.(); return true; }
  }
  return false;
}

function dispatchNew() {
  const view = currentView();
  if (view === 'frete-terceiro' && window.ft?.openNew) { window.ft.openNew(); return true; }
  if (view === 'frota' && window.openTripModal)        { window.openTripModal();   return true; }
  return false;
}

function showHelp()   { const m = document.getElementById('kbHelpModal');   if (m) m.classList.add('open'); }
function goHub()      { if (window.goToHub)            window.goToHub();            }
function goFrota()    { if (window.goToFrota)          window.goToFrota();          }
function goFretes()   { if (window.goToFreteTerceiro)  window.goToFreteTerceiro();  }

function handler(ev) {
  const key = ev.key;

  // Esc sempre funciona, mesmo digitando
  if (key === 'Escape') {
    const m = getOpenModal();
    if (m) {
      ev.preventDefault();
      closeOpenModals();
    }
    return;
  }

  // Demais atalhos: pula se estiver digitando ou se há modal aberto (exceto ajuda)
  if (isTyping(ev.target)) return;
  const openM = getOpenModal();
  if (openM && openM.id !== 'kbHelpModal') return;

  // Ignora modificadores (Ctrl/Alt/Meta) — atalhos são teclas simples
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

  switch (key) {
    case 'n': case 'N':
      if (dispatchNew()) ev.preventDefault();
      break;
    case '/':
      if (focusFirstSearch()) ev.preventDefault();
      break;
    case 'h': case 'H':
      goHub();
      ev.preventDefault();
      break;
    case '1':
      goFrota();
      ev.preventDefault();
      break;
    case '2':
      goFretes();
      ev.preventDefault();
      break;
    case '?':
      showHelp();
      ev.preventDefault();
      break;
  }
}

document.addEventListener('keydown', handler);

// Exposição pro botão do header (se quisermos depois)
window.showKeyboardHelp = showHelp;
