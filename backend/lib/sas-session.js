let sasSession = {
  cookieHeader: null,
  csrfToken: null,
  authToken: null,
  receivedAt: null,
  alive: false,
};

// SAS's Cloudflare refuses Railway. With SAS_GATEWAY_URL + SAS_GATEWAY_KEY
// set, every SAS call goes through the gateway on Tyson's office PC, which
// holds the shared session. No SAS credentials live here in that mode.
const gatewayUrl = () => String(process.env.SAS_GATEWAY_URL || '').trim().replace(/\/+$/, '');
const gatewayKey = () => String(process.env.SAS_GATEWAY_KEY || '').trim();

export function isGatewayMode() {
  return !!(gatewayUrl() && gatewayKey());
}

let gatewayState = { alive: false, checkedAt: null, error: null, receivedAt: null };

export async function refreshGatewayStatus() {
  try {
    const resp = await fetch(`${gatewayUrl()}/status`, {
      headers: { 'X-Gateway-Key': gatewayKey() },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`gateway /status HTTP ${resp.status}`);
    const body = await resp.json();
    gatewayState = {
      alive: !!body.session?.alive && !body.blocked?.active,
      checkedAt: new Date().toISOString(),
      error: body.blocked?.active ? 'SAS is blocking the gateway' : null,
      receivedAt: body.session?.receivedAt || null,
    };
  } catch (err) {
    gatewayState = { ...gatewayState, alive: false, checkedAt: new Date().toISOString(), error: err.message };
  }
  return gatewayState;
}

export function applySession({ cookieHeader, csrfToken, authToken, source = 'unknown' }) {
  if (isGatewayMode()) {
    throw new Error('The shared SAS session lives on the office gateway');
  }
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
  if (isGatewayMode()) return gatewayState.alive;
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
    'X-Requested-With': 'XMLHttpRequest',
    Referer: 'https://prod.sasretail.com/en/sasretail/dashboard/',
  };
  if (isGatewayMode()) {
    h['X-Gateway-Key'] = gatewayKey();
    return h;
  }
  h.Cookie = sasSession.cookieHeader;
  h['X-CSRFToken'] = sasSession.csrfToken;
  if (sasSession.authToken) {
    h.Authorization = `Token ${sasSession.authToken}`;
  }
  return h;
}

export function sasUrl(path, qs = '') {
  const base = isGatewayMode() ? `${gatewayUrl()}/sas` : 'https://prod.sasretail.com';
  return `${base}${path}${qs ? `?${qs}` : ''}`;
}

export async function sasGet(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, String(v));
  }
  const resp = await fetch(sasUrl(path, qs.toString()), { headers: getSasHeaders() });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`SAS GET ${path} failed ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

export function sessionStatus() {
  if (isGatewayMode()) {
    return {
      alive: gatewayState.alive,
      receivedAt: gatewayState.receivedAt,
      gateway: { checkedAt: gatewayState.checkedAt, error: gatewayState.error },
    };
  }
  return {
    alive: isSessionAlive(),
    receivedAt: sasSession.receivedAt,
  };
}
