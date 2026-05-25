/*
 * Prima Acerto — Instalação PWA + registro do Service Worker
 *
 * Responsabilidades:
 *  - Registrar /service-worker.js
 *  - Capturar o evento beforeinstallprompt (Android/Chrome/Edge) e exibir
 *    um botão flutuante "Instalar app"
 *  - Em iOS Safari, mostrar uma dica visual única (não há prompt programático)
 *  - Quando uma nova versão do SW estiver pronta, recarregar a página
 *
 * Carregado via <script defer> no index.html — roda fora do módulo principal
 * para não bloquear a inicialização do app.
 */
(function () {
  'use strict';

  // ============== Registro do Service Worker ==============
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js')
        .then(function (reg) {
          // Detecta nova versão e ativa imediatamente após o usuário recarregar
          reg.addEventListener('updatefound', function () {
            var nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', function () {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                // Nova versão disponível — pede para o SW ativar
                nw.postMessage('SKIP_WAITING');
              }
            });
          });
        })
        .catch(function (err) {
          console.warn('[PWA] Falha ao registrar service worker:', err);
        });

      // Quando um novo SW assume o controle, recarrega 1x para pegar o shell novo
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    });
  }

  // ============== Botão "Instalar app" (Android/Chrome) ==============
  var deferredPrompt = null;

  function createInstallBtn() {
    if (document.getElementById('pwaInstallBtn')) return;
    var btn = document.createElement('button');
    btn.id = 'pwaInstallBtn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Instalar Prima Acerto como aplicativo');
    btn.innerHTML = '<span style="font-size:1.1em">📱</span><span>Instalar app</span>';
    btn.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'right:16px',
      'z-index:9998',
      'display:flex',
      'gap:8px',
      'align-items:center',
      'padding:10px 14px',
      'border:none',
      'border-radius:24px',
      'background:#E30613',
      'color:#fff',
      'font:600 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'cursor:pointer',
      'box-shadow:0 4px 14px rgba(0,0,0,.35)',
      'transition:transform .15s ease'
    ].join(';');
    btn.onmouseover = function () { btn.style.transform = 'translateY(-2px)'; };
    btn.onmouseout  = function () { btn.style.transform = 'translateY(0)'; };
    btn.onclick = function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        btn.remove();
      });
    };
    document.body.appendChild(btn);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    // Só mostra após o login (appContainer fica display:none antes)
    waitForApp(createInstallBtn);
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    var b = document.getElementById('pwaInstallBtn');
    if (b) b.remove();
  });

  // ============== Dica de instalação no iOS Safari ==============
  // iOS não dispara beforeinstallprompt. Mostramos uma faixa discreta uma única vez.
  function showIosHint() {
    if (localStorage.getItem('pwaIosHintDismissed') === '1') return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone === true) return;

    var hint = document.createElement('div');
    hint.id = 'pwaIosHint';
    hint.style.cssText = [
      'position:fixed',
      'left:8px',
      'right:8px',
      'bottom:8px',
      'z-index:9998',
      'padding:12px 14px',
      'border-radius:10px',
      'background:#1a1c1f',
      'color:#fff',
      'border:1px solid #2a2d31',
      'box-shadow:0 6px 20px rgba(0,0,0,.45)',
      'font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'display:flex',
      'gap:10px',
      'align-items:center'
    ].join(';');
    hint.innerHTML = '<div style="flex:1">Instale como app: toque em <strong>Compartilhar</strong> e depois em <strong>"Adicionar à Tela de Início"</strong>.</div>' +
      '<button type="button" id="pwaIosHintClose" style="background:transparent;border:1px solid #444;color:#fff;border-radius:6px;padding:4px 10px;cursor:pointer">OK</button>';
    document.body.appendChild(hint);
    document.getElementById('pwaIosHintClose').onclick = function () {
      localStorage.setItem('pwaIosHintDismissed', '1');
      hint.remove();
    };
  }

  function isIosSafari() {
    var ua = navigator.userAgent;
    var iOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    var webkit = /AppleWebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return iOS && webkit;
  }

  // Aguarda o app container ficar visível (pós-login) antes de mostrar UI de instalação
  function waitForApp(cb) {
    var tries = 0;
    var max = 60; // 30s
    var t = setInterval(function () {
      tries++;
      var c = document.getElementById('appContainer');
      if (c && c.style.display !== 'none') {
        clearInterval(t);
        cb();
      } else if (tries >= max) {
        clearInterval(t);
      }
    }, 500);
  }

  if (isIosSafari()) {
    waitForApp(showIosHint);
  }
})();
