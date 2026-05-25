/*
 * Prima Acerto de Viagens — Service Worker
 *
 * Estratégia:
 *  - Pré-cache do "shell" mínimo na instalação (index.html + manifest)
 *  - Runtime: stale-while-revalidate para assets estáticos do mesmo domínio
 *    (HTML, CSS, JS, imagens, ícones) → app abre instantâneo e atualiza em background
 *  - Network-only para qualquer rota /api/* → dados sempre frescos do servidor
 *  - Network-only para uploads, downloads e métodos não-GET → nunca intercepta
 *
 * Para invalidar todo o cache após mudanças incompatíveis: bumpe CACHE_VERSION.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `prima-acerto-${CACHE_VERSION}`;

// Mínimo necessário para o app abrir offline (shell em si)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/images/logo-full.png',
  '/assets/images/logo-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith('prima-acerto-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Só intercepta GETs do mesmo domínio
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: sempre rede, nunca cache
  if (url.pathname.startsWith('/api/')) return;

  // Service worker em si: nunca cachear
  if (url.pathname === '/service-worker.js') return;

  // Navegação (HTML): network-first com fallback para o shell em cache
  // (garante que após deploy o usuário pega a versão nova quando online,
  //  e ainda assim consegue abrir o app offline)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets estáticos: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            // Só cacheia respostas válidas (200, opacas não)
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => cached); // offline: devolve o cache se houver
        return cached || networkFetch;
      })
    )
  );
});

// Permite que a página force atualização imediata após deploy
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
