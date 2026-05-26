// api.js — Fetch wrapper that handles JWT tokens

// localStorage (e não sessionStorage) porque iOS PWA standalone apaga o
// sessionStorage entre relaunches do app — sem isso o usuário precisa
// logar de novo toda vez que volta pro app pela home screen.
let accessToken = localStorage.getItem('accessToken');

export function setToken(token) {
  accessToken = token;
  if (token) localStorage.setItem('accessToken', token);
  else localStorage.removeItem('accessToken');
}

export function getToken() { return accessToken; }

async function request(method, url, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const opts = { method, headers, credentials: 'include' };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  let res = await fetch(url, opts);

  // Tenta refresh em qualquer 401 (não só TOKEN_EXPIRED). Cobre o caso
  // do PWA no iOS: quando o app volta da home screen o accessToken pode
  // ter sumido do storage, então a request sai sem header e o backend
  // devolve "Token não fornecido" — mas o cookie httpOnly de refresh
  // ainda está válido. Guard contra loop: não refresha o próprio refresh.
  if (res.status === 401 && !url.includes('/api/auth/refresh')) {
    // Consome o body pra liberar a conexão antes do refresh.
    await res.json().catch(() => ({}));
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      opts.headers = headers;
      res = await fetch(url, opts);
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro na requisição.' }));
    let msg = err.error || `HTTP ${res.status}`;
    // Express-validator: anexa o nome do campo + msg pra dar contexto ao usuário
    if (Array.isArray(err.details) && err.details.length) {
      const detailMsgs = err.details
        .map(d => d.field ? `${d.field}: ${d.message}` : d.message)
        .filter(Boolean);
      if (detailMsgs.length) msg += '\n• ' + detailMsgs.join('\n• ');
    }
    // Endpoint pra debug rápido ("qual rota falhou?")
    msg += `\n(${method} ${url})`;
    const e = new Error(msg);
    e.status = res.status;
    e.details = err.details || null;
    e.endpoint = `${method} ${url}`;
    throw e;
  }

  return res.json();
}

async function tryRefresh() {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setToken(data.accessToken);
      return true;
    }
  } catch { /* ignore */ }
  setToken(null);
  return false;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body),
  put: (url, body) => request('PUT', url, body),
  delete: (url) => request('DELETE', url),
};
