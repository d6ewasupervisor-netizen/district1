import express from 'express';
import { requireAuth, requireRole } from '../lib/auth-middleware.js';
import { runProdSync, bootstrapSyncIfEmpty } from '../lib/sas-sync.js';
import { sessionStatus } from '../lib/sas-session.js';
import { getInitialSyncWindow } from '../lib/fiscal-calendar.js';

const router = express.Router();

router.get('/status', requireAuth, (_req, res) => {
  res.json({
    ok: true,
    sas: sessionStatus(),
    window: getInitialSyncWindow(),
  });
});

router.post('/run', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const from = req.body?.from || getInitialSyncWindow().from;
    const to = req.body?.to || getInitialSyncWindow().to;
    const result = await runProdSync(from, to);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[sync/run]', err);
    res.status(500).json({ ok: false, error: err.message || 'Sync failed.' });
  }
});

router.post('/bootstrap', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    await bootstrapSyncIfEmpty();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
