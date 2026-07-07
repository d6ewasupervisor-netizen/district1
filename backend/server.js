import express from 'express';
import cors from 'cors';
import { runMigrations } from './lib/db.js';
import { startSyncWorker, bootstrapSyncIfEmpty } from './lib/sas-sync.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import calendarRouter from './routes/calendar.js';
import notesRouter from './routes/notes.js';
import syncRouter from './routes/sync.js';
import internalRouter from './routes/internal.js';

const app = express();
app.set('trust proxy', 1);

const extraAllowed = (process.env.EXTRA_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Browser Origin is scheme+host only — GitHub Pages project sites omit the repo path. */
function originsFromBaseUrl(url) {
  if (!url) return [];
  const out = new Set();
  const trimmed = String(url).trim().replace(/\/+$/, '');
  out.add(trimmed);
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    out.add(`${parsed.protocol}//${parsed.host}`);
  } catch {
    /* ignore malformed */
  }
  return [...out];
}

const allowedOrigins = [
  ...originsFromBaseUrl(process.env.FRONTEND_BASE_URL),
  ...originsFromBaseUrl(process.env.BACKEND_BASE_URL),
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null,
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  ...extraAllowed,
].filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
  }),
);

app.use(express.json({ limit: '2mb' }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'district1-calendar', ts: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/notes', notesRouter);
app.use('/api/sync', syncRouter);
app.use('/internal', internalRouter);

app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

const PORT = Number(process.env.PORT || 3000);

(async () => {
  try {
    await runMigrations();
  } catch (err) {
    console.error('[boot] migration failed', err);
    process.exit(1);
  }

  startSyncWorker();
  bootstrapSyncIfEmpty().catch((err) => console.error('[boot] bootstrap sync', err.message));

  app.listen(PORT, () => {
    console.log(`[boot] District 1 Calendar API on :${PORT}`);
  });
})();
