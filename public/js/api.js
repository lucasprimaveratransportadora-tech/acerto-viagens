// api.js — Fetch wrapper that handles JWT tokens

let accessToken = sessionStorage.getItem('accessToken');

export function setToken(token) {
  accessToken = token;
  if (token) sessionStorage.setItem('accessToken', token);
  else sessionStorage.removeItem('accessToken');
}

export function getToken() { return accessToken; }

async function request(method, url, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const opts = { method, headers, credentials: 'include' };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  let res = await fetch(url, opts);

  // If 401 TOKEN_EXPIRED, try refresh
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    if (data.code === 'TOKEN_EXPIRED') {
      const refreshed = await tryRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        opts.headers = headers;
        res = await fetch(url, opts);
      }
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
    const e = new Error(msg);
    e.status = res.status;
    e.details = err.details || null;
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
