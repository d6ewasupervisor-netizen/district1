export function apiBase() {
  return (window.D1_CONFIG?.API_BASE || '').replace(/\/+$/, '');
}

export function getSessionToken() {
  return window.dumpBinAuth?.getSession?.() || '';
}

export async function fetchUser() {
  const token = getSessionToken();
  if (!token) return null;
  const resp = await fetch(`${apiBase()}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Not authorized for District 1');
  return data.user;
}

export async function apiFetch(path, options = {}) {
  const token = getSessionToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const resp = await fetch(`${apiBase()}${path}`, { ...options, headers });
  const data = await resp.json().catch(() => ({}));
  if (resp.status === 401) {
    window.dumpBinAuth?.signOut?.();
    throw new Error('Session expired');
  }
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}

export function signOut() {
  window.dumpBinAuth?.signOut?.();
}

export function canWrite(role) {
  return role === 'modifier' || role === 'admin';
}

export function isAdmin(role) {
  return role === 'admin';
}

export function formatTs(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function statusClass(status) {
  const s = String(status || 'active');
  if (s === 'in-progress') return 'status-progress';
  if (s === 'completed') return 'status-done';
  if (s === 'deleted') return 'status-deleted';
  return 'status-active';
}

export function statusLabel(status) {
  const map = {
    active: 'Not started',
    'in-progress': 'In progress',
    completed: 'Completed',
    deleted: 'Deleted',
  };
  return map[status] || status;
}

export function parseHash() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  return { parts: raw.split('/').filter(Boolean) };
}

export function setHash(parts) {
  window.location.hash = parts.filter(Boolean).join('/');
}

export function basePath() {
  return window.dumpBinAuth?.BASE_PATH || '';
}
