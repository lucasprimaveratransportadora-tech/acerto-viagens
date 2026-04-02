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
    throw new Error(err.error || `HTTP ${res.status}`);
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
