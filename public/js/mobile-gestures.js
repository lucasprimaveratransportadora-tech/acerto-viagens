/*
 * Prima Acerto — Gestos de celular
 *
 *  1. Swipe-back: arrastar da borda esquerda pra direita
 *     - se tem modal aberto → fecha o modal
 *     - se está numa aba (frota/fretes/etc.) → volta pro hub
 *     - se já está no hub → ignora
 *
 *  2. Pull-to-refresh: puxar pra baixo no topo da página → recarrega
 *     - inibe se tem modal aberto, se está no meio do scroll, ou se
 *       o toque iniciou num input/textarea
 *     - indicador visual aparece no topo enquanto puxa
 *
 *  3. Web Share: botão flutuante que abre a folha nativa de compartilhar
 *     do iOS/Android (envia link do app pra WhatsApp/email/etc.)
 *
 * Carregado via <script defer>. Não usa imports — independente do
 * módulo principal pra funcionar mesmo se algo do app falhar.
 */
(function () {
  'use strict';

  // ============== Helpers compartilhados ==============
  function getOpenModal() {
    return document.querySelector('.modal-overlay.open');
  }
  function vibrate(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* */ } }
  }
  function isTextTarget(el) {
    if (!el) return false;
    return !!el.closest('input, textarea, select, [contenteditable="true"]');
  }

  // ============== 1. SWIPE BACK ==============
  const EDGE_PX = 28;          // só dispara se começou nos 28px da borda esquerda
  const SB_THRESHOLD = 80;     // distância horizontal mínima
  const SB_MAX_TIME = 700;     // tempo máximo do gesto (rápido)
  const SB_TILT = 0.6;         // dy/dx — se for mais vertical que isso, ignora

  let sbStart = null;

  function goBack() {
    const modal = getOpenModal();
    if (modal) {
      modal.classList.remove('open');
      vibrate(10);
      return true;
    }
    const view = document.body.dataset.view;
    if (view && view !== 'hub' && typeof window.goToHub === 'function') {
      window.goToHub();
      vibrate(10);
      return true;
    }
    return false;
  }

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { sbStart = null; return; }
    const t = e.touches[0];
    if (t.clientX > EDGE_PX) { sbStart = null; return; }
    if (isTextTarget(e.target)) { sbStart = null; return; }
    sbStart = { x: t.clientX, y: t.clientY, time: Date.now() };
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!sbStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sbStart.x;
    const dy = Math.abs(t.clientY - sbStart.y);
    const dt = Date.now() - sbStart.time;
    sbStart = null;
    if (dt > SB_MAX_TIME) return;
    if (dx < SB_THRESHOLD) return;
    if (dy > dx * SB_TILT) return;
    goBack();
  }, { passive: true });

  // ============== 2. PULL TO REFRESH ==============
  const PTR_THRESHOLD = 80;
  let ptr = null;
  let ptrIndicator = null;

  function canStartPull(target) {
    if (getOpenModal()) return false;
    if (isTextTarget(target)) return false;
    if (window.scrollY > 0) return false;
    const se = document.scrollingElement || document.documentElement;
    if (se.scrollTop > 0) return false;
    return true;
  }

  function ensurePtrIndicator() {
    if (ptrIndicator) return ptrIndicator;
    ptrIndicator = document.createElement('div');
    ptrIndicator.id = 'ptrIndicator';
    ptrIndicator.style.cssText = [
      'position:fixed', 'top:0', 'left:50%',
      'transform:translate(-50%,-100%)',
      'z-index:9997',
      'background:#E30613', 'color:#fff',
      'border-radius:0 0 22px 22px',
      'padding:8px 18px',
      'font:600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'box-shadow:0 4px 14px rgba(0,0,0,.35)',
      'transition:transform .15s ease',
      'pointer-events:none',
      'white-space:nowrap'
    ].join(';');
    document.body.appendChild(ptrIndicator);
    return ptrIndicator;
  }

  function showPtr(progress) {
    const el = ensurePtrIndicator();
    const pct = Math.min(progress, 1.2);
    const trans = Math.min(pct, 1) * 100 - 100; // -100% → 0%
    el.style.transform = 'translate(-50%, ' + trans + '%)';
    el.textContent = pct >= 1 ? '↑ Solte para atualizar' : '↓ Puxe para atualizar';
  }

  function hidePtr(immediate) {
    if (!ptrIndicator) return;
    const el = ptrIndicator;
    el.style.transform = 'translate(-50%, -100%)';
    if (immediate) { el.remove(); ptrIndicator = null; return; }
    setTimeout(function () {
      if (ptrIndicator === el) { el.remove(); ptrIndicator = null; }
    }, 250);
  }

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { ptr = null; return; }
    if (!canStartPull(e.target)) { ptr = null; return; }
    ptr = { y0: e.touches[0].clientY, armed: false };
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!ptr) return;
    if (!canStartPull(e.target)) { ptr = null; hidePtr(false); return; }
    const dy = e.touches[0].clientY - ptr.y0;
    if (dy <= 0) { ptr = null; hidePtr(false); return; }
    if (dy > 8 || ptr.armed) {
      ptr.armed = true;
      showPtr(dy / PTR_THRESHOLD);
    }
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!ptr) return;
    const dy = e.changedTouches[0].clientY - ptr.y0;
    const trigger = ptr.armed && dy >= PTR_THRESHOLD;
    ptr = null;
    if (!trigger) { hidePtr(false); return; }
    if (ptrIndicator) ptrIndicator.textContent = '🔄 Atualizando…';
    vibrate(15);
    setTimeout(function () { location.reload(); }, 200);
  }, { passive: true });

  // Cancela se touch for interrompido (ligação, notificação, etc.)
  document.addEventListener('touchcancel', function () {
    sbStart = null;
    ptr = null;
    hidePtr(true);
  }, { passive: true });

  // ============== 3. WEB SHARE ==============
  window.shareApp = async function () {
    const url = window.location.origin || 'https://web-production-8408e.up.railway.app';
    const data = {
      title: 'Prima Acerto de Viagens',
      text: 'Sistema de fechamento de viagens — Prima Transportadora',
      url: url
    };
    if (navigator.share) {
      try { await navigator.share(data); vibrate(10); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(url); alert('Link copiado:\n' + url); return; }
      catch { /* fallthrough */ }
    }
    prompt('Copie o link do app:', url);
  };

  function addShareButton() {
    if (document.getElementById('pwaShareBtn')) return;
    // Só mostra em mobile (onde compartilhar faz mais sentido)
    if (!('ontouchstart' in window)) return;
    const btn = document.createElement('button');
    btn.id = 'pwaShareBtn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Compartilhar link do app');
    btn.title = 'Compartilhar link do app';
    btn.textContent = '🔗';
    btn.style.cssText = [
      'position:fixed', 'bottom:16px', 'left:16px',
      'z-index:9997',
      'width:44px', 'height:44px',
      'border:none', 'border-radius:50%',
      'background:#1a1c1f', 'color:#fff',
      'font-size:20px',
      'cursor:pointer',
      'box-shadow:0 4px 14px rgba(0,0,0,.35)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'transition:transform .15s ease'
    ].join(';');
    btn.addEventListener('touchstart', function () { btn.style.transform = 'scale(.92)'; }, { passive: true });
    btn.addEventListener('touchend',   function () { btn.style.transform = ''; }, { passive: true });
    btn.onclick = window.shareApp;
    document.body.appendChild(btn);
  }

  function waitForApp(cb) {
    let tries = 0;
    const t = setInterval(function () {
      tries++;
      const c = document.getElementById('appContainer');
      if (c && c.style.display !== 'none') {
        clearInterval(t);
        cb();
      } else if (tries >= 60) {
        clearInterval(t);
      }
    }, 500);
  }

  waitForApp(addShareButton);
})();
