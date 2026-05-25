/*
 * Prima Acerto de Viagens — Service Worker (v2: defensivo)
 *
 * Estratégia:
 *  - Pré-cache do shell mínimo na instalação
 *  - Navegação (mode === 'navigate'): stale-while-revalidate com timeout de 6s
 *    → entrega o /index.html do cache instantâneamente, atualiza em background
 *    → na 1ª visita (sem cache), faz fetch com timeout — se Railway demorar,
 *      devolve resposta amigável em vez de travar o navegador (problema do Safari)
 *  - Assets estáticos: stale-while-revalidate (cache primeiro, atualiza em bg)
 *  - /api/*, /service-worker.js, /unregister-sw.html: NUNCA intercepta (network direto)
 *  - Nunca devolve undefined em respondWith (Safari quebra; Chrome ignora)
 *
 * Para invalidar todo o cache após mudanças incompatíveis: bumpe CACHE_VERSION.
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `prima-acerto-${CACHE_VERSION}`;
const NAV_TIMEOUT_MS = 6000;

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
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
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

// Helper: fetch com timeout — evita SW travado em rede lenta
function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Resposta de fallback final — nunca devolve undefined (Safari quebra)
function offlineResponse(isNavigation) {
  if (isNavigation) {
    return new Response(
      '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Sem conexão</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0e0f11;color:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem;text-align:center}div{max-width:380px}h1{color:#E30613;margin:0 0 .5rem;font-size:1.2rem}p{margin:.4rem 0;font-size:.9rem;color:#aaa}button{margin-top:1rem;background:#E30613;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:.9rem;cursor:pointer}</style></head><body><div><h1>Sem conexão</h1><p>Não foi possível conectar ao servidor agora.</p><p>Verifique sua internet e tente de novo.</p><button onclick="location.reload()">Tentar novamente</button></div></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
  return new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

async function staleWhileRevalidate(req, cacheKey, isNavigation) {
  const cache = await caches.open(CACHE_NAME);
  const key = cacheKey || req;
  const cached = await cache.match(key);

  const networkPromise = fetchWithTimeout(req, NAV_TIMEOUT_MS)
    .then((res) => {
      // Só cacheia respostas válidas e do mesmo domínio (type basic)
      if (res && res.status === 200 && res.type === 'basic') {
        cache.put(key, res.clone()).catch(() => undefined);
      }
      return res;
    })
    .catch(() => null);

  // Tem cache → devolve instantâneo, atualização rola em background
  if (cached) return cached;

  // Sem cache → precisa esperar rede (com timeout)
  const fresh = await networkPromise;
  return fresh || offlineResponse(isNavigation);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Só intercepta GETs do mesmo domínio
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  // API, próprio SW e página de unregister: nunca cachear nem interceptar
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/service-worker.js') return;
  if (url.pathname === '/unregister-sw.html') return;

  // Navegação (documento HTML): SWR contra /index.html
  if (req.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(req, '/index.html', true));
    return;
  }

  // Assets: SWR contra o próprio req
  event.respondWith(staleWhileRevalidate(req, null, false));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
