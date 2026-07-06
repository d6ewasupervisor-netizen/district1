let sasSession = {
  cookieHeader: null,
  csrfToken: null,
  authToken: null,
  receivedAt: null,
  alive: false,
};

export function applySession({ cookieHeader, csrfToken, authToken, source = 'unknown' }) {
  if (!cookieHeader || !csrfToken) {
    throw new Error('cookieHeader and csrfToken are required');
  }
  sasSession = {
    cookieHeader,
    csrfToken,
    authToken: authToken || null,
    receivedAt: new Date().toISOString(),
    alive: true,
  };
  console.log(`[sas-session] applied from ${source} at ${sasSession.receivedAt}`);
}

export function getSession() {
  return sasSession;
}

export function isSessionAlive() {
  if (!sasSession.alive || !sasSession.cookieHeader) return false;
  const maxAgeMs = Number(process.env.SAS_SESSION_MAX_AGE_HOURS || 23) * 60 * 60 * 1000;
  const age = Date.now() - new Date(sasSession.receivedAt).getTime();
  return age < maxAgeMs;
}

export function getSasHeaders() {
  if (!isSessionAlive()) {
    throw new Error('SAS session not available — push session via morning-auth.js');
  }
  const h = {
    Accept: 'application/json',
    Cookie: sasSession.cookieHeader,
    'X-CSRFToken': sasSession.csrfToken,
    'X-Requested-With': 'XMLHttpRequest',
    Referer: 'https://prod.sasretail.com/en/sasretail/dashboard/',
  };
  if (sasSession.authToken) {
    h.Authorization = `Token ${sasSession.authToken}`;
  }
  return h;
}

export async function sasGet(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, String(v));
  }
  const url = `https://prod.sasretail.com${path}${qs.toString() ? `?${qs}` : ''}`;
  const resp = await fetch(url, { headers: getSasHeaders() });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`SAS GET ${path} failed ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

export function sessionStatus() {
  return {
    alive: isSessionAlive(),
    receivedAt: sasSession.receivedAt,
  };
}
