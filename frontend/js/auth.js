const SESSION_KEY = 'd1_session';

export function apiBase() {
  return (window.D1_CONFIG?.API_BASE || '').replace(/\/+$/, '');
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function apiFetch(path, options = {}) {
  const session = getSession();
  const headers = { ...(options.headers || {}) };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const resp = await fetch(`${apiBase()}${path}`, { ...options, headers });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
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
    year: 'numeric',
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
  const parts = raw.split('/').filter(Boolean);
  return { parts };
}

export function setHash(parts) {
  window.location.hash = parts.filter(Boolean).join('/');
}
