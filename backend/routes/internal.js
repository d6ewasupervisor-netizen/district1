import express from 'express';
import { applySession, sessionStatus } from '../lib/sas-session.js';
import { bootstrapSyncIfEmpty } from '../lib/sas-sync.js';

const router = express.Router();

router.post('/sas-session', async (req, res) => {
  const secret = process.env.SAS_SESSION_PUSH_SECRET;
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || auth !== secret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const { cookieHeader, csrfToken, authToken } = req.body || {};
  if (!cookieHeader || !csrfToken) {
    return res.status(400).json({ ok: false, error: 'Missing cookieHeader or csrfToken' });
  }

  try {
    applySession({ cookieHeader, csrfToken, authToken, source: 'POST /internal/sas-session' });
    bootstrapSyncIfEmpty().catch((err) => console.error('[sync] bootstrap after session', err));
    return res.json({ ok: true, ...sessionStatus() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/sas-session/status', (_req, res) => {
  res.json({ ok: true, ...sessionStatus() });
});

export default router;
