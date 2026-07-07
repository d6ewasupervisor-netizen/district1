import { applySession, isSessionAlive } from './sas-session.js';
import { bootstrapSyncIfEmpty, runProdSync } from './sas-sync.js';

const EOD_API = () => (process.env.EOD_API_URL || 'https://eod-api.the-dump-bin.com').replace(/\/+$/, '');

function pullSecret() {
  return process.env.EOD_API_INTERNAL_SECRET || process.env.SAS_SESSION_PUSH_SECRET || '';
}

export async function pullSessionFromEodApi() {
  const secret = pullSecret();
  if (!secret) return { skipped: true, reason: 'no secret' };

  try {
    const resp = await fetch(`${EOD_API()}/internal/sas-session/export`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!resp.ok) {
      return { ok: false, status: resp.status };
    }
    const data = await resp.json();
    if (!data.ok || !data.cookieHeader || !data.csrfToken) {
      return { ok: false, reason: 'empty session' };
    }
    applySession({
      cookieHeader: data.cookieHeader,
      csrfToken: data.csrfToken,
      authToken: data.authToken || null,
      source: 'eod-api pull',
    });
    return { ok: true };
  } catch (err) {
    console.error('[eod-sas-pull]', err.message);
    return { ok: false, error: err.message };
  }
}

let pullTimer = null;

export function startEodSessionPullWorker() {
  const minutes = Number(process.env.EOD_SESSION_PULL_MINUTES || 5);
  const tick = async () => {
    if (isSessionAlive()) return;
    const result = await pullSessionFromEodApi();
    if (result.ok) {
      console.log('[eod-sas-pull] session restored from eod-api');
      bootstrapSyncIfEmpty().catch(() => {});
      runProdSync().catch((err) => console.error('[sync] after pull', err.message));
    }
  };
  tick();
  pullTimer = setInterval(tick, minutes * 60 * 1000);
  console.log(`[eod-sas-pull] every ${minutes} min when local session dead`);
}
