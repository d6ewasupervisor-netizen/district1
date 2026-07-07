import express from 'express';
import { query } from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth-middleware.js';
import { ROLES, emailDomainAllowed } from '../lib/d1-config.js';
import { logActivity } from '../lib/activity.js';

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EOD_API = () => (process.env.EOD_API_URL || 'https://eod-api.the-dump-bin.com').replace(/\/+$/, '');

function frontendReturnTo() {
  const base = (process.env.FRONTEND_BASE_URL || 'https://d6ewasupervisor-netizen.github.io/district1').replace(/\/+$/, '');
  return `${base}/index.html`;
}

async function sendDumpBinSignInLink(email) {
  const resp = await fetch(`${EOD_API()}/api/request-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, returnTo: frontendReturnTo() }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Could not send Dump Bin sign-in link.');
  }
}

router.use(requireAuth);
router.use(requireRole('admin'));

router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, email, display_name, role, status, notify_enabled, invited_by, created_at, last_login_at
     FROM users ORDER BY display_name`,
  );
  res.json({ ok: true, users: rows });
});

router.post('/invite', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const displayName = String(req.body?.display_name || '').trim();
    const role = String(req.body?.role || 'viewer').toLowerCase();

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Valid email required.' });
    }
    if (!displayName) {
      return res.status(400).json({ ok: false, error: 'Display name required.' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ ok: false, error: 'Role must be viewer, modifier, or admin.' });
    }
    if (!emailDomainAllowed(email)) {
      return res.status(400).json({ ok: false, error: 'Email domain not allowed for invites.' });
    }

    const existing = await query(`SELECT id, status FROM users WHERE email = $1`, [email]);
    if (existing.rows.length) {
      return res.status(400).json({ ok: false, error: 'User already exists.' });
    }

    await query(
      `INSERT INTO users (email, display_name, role, status, invited_by)
       VALUES ($1, $2, $3, 'active', $4)`,
      [email, displayName, role, req.user.email],
    );
    await query(
      `INSERT INTO user_invitations (email, display_name, role, invited_by)
       VALUES ($1, $2, $3, $4)`,
      [email, displayName, role, req.user.email],
    );

    await sendDumpBinSignInLink(email);

    await logActivity(req.user.email, req.user.display_name, 'user_invite', { email, role });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[users/invite]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Could not invite user.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { role, status, notify_enabled, display_name } = req.body || {};

    const { rows } = await query(`SELECT * FROM users WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'User not found.' });
    const target = rows[0];

    if (status === 'deactivated' && target.email === req.user.email) {
      const { rows: admins } = await query(
        `SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND status = 'active'`,
      );
      if (admins[0].n <= 1 && target.role === 'admin') {
        return res.status(400).json({ ok: false, error: 'Cannot deactivate the last admin.' });
      }
    }

    if (role != null && !ROLES.includes(role)) {
      return res.status(400).json({ ok: false, error: 'Invalid role.' });
    }

    await query(
      `UPDATE users SET
         role = COALESCE($2, role),
         status = COALESCE($3, status),
         notify_enabled = COALESCE($4, notify_enabled),
         display_name = COALESCE($5, display_name)
       WHERE id = $1`,
      [id, role ?? null, status ?? null, notify_enabled ?? null, display_name ?? null],
    );

    await logActivity(req.user.email, req.user.display_name, 'user_update', {
      target: target.email,
      role,
      status,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[users/patch]', err);
    return res.status(500).json({ ok: false, error: 'Could not update user.' });
  }
});

export default router;
