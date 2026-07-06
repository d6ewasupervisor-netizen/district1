import express from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../lib/db.js';
import { issueLinkToken, verifyLinkToken, issueSessionToken } from '../lib/tokens.js';
import { sendLoginLinkEmail, buildCalendarUrl } from '../lib/email.js';
import { requireAuth } from '../lib/auth-middleware.js';
import { logActivity } from '../lib/activity.js';

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Try again later.' },
});

router.post('/request-link', limiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Enter a valid email address.' });
    }

    const { rows } = await query(
      `SELECT email, display_name, role, status FROM users WHERE email = $1`,
      [email],
    );
    if (!rows.length || rows[0].status !== 'active') {
      return res.status(400).json({
        ok: false,
        error: 'This email is not authorized. Contact a District 1 admin.',
      });
    }

    const { token, jti } = issueLinkToken(email);
    await query(
      `INSERT INTO link_requests (email, jti, ip, user_agent) VALUES ($1, $2, $3, $4)`,
      [email, jti, req.ip, req.get('user-agent') || null],
    );

    const link = `${buildCalendarUrl()}?token=${encodeURIComponent(token)}`;
    await sendLoginLinkEmail({ to: email, link });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth/request-link]', err);
    return res.status(500).json({ ok: false, error: 'Could not send sign-in link.' });
  }
});

router.get('/verify-token', async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) return res.status(400).json({ ok: false, error: 'Missing token.' });

  try {
    const payload = verifyLinkToken(token);
    const { rows: lr } = await query(
      `SELECT used_at FROM link_requests WHERE jti = $1 LIMIT 1`,
      [payload.jti],
    );
    if (!lr.length) {
      return res.status(400).json({ ok: false, error: 'Link not recognized.' });
    }
    if (lr[0].used_at) {
      return res.status(400).json({ ok: false, error: 'This link was already used.' });
    }

    const { rows } = await query(
      `SELECT email, display_name, role, status FROM users WHERE email = $1`,
      [payload.email],
    );
    if (!rows.length || rows[0].status !== 'active') {
      return res.status(400).json({ ok: false, error: 'Account inactive.' });
    }

    await query(`UPDATE link_requests SET used_at = NOW() WHERE jti = $1`, [payload.jti]);
    await query(`UPDATE users SET last_login_at = NOW() WHERE email = $1`, [payload.email]);
    await query(
      `UPDATE user_invitations SET accepted_at = NOW()
       WHERE email = $1 AND accepted_at IS NULL`,
      [payload.email],
    );

    const sessionToken = issueSessionToken(rows[0]);
    await logActivity(payload.email, rows[0].display_name, 'login', {});

    return res.json({
      ok: true,
      sessionToken,
      user: {
        email: rows[0].email,
        display_name: rows[0].display_name,
        role: rows[0].role,
      },
    });
  } catch (err) {
    if (err?.name === 'TokenExpiredError' || err?.name === 'JsonWebTokenError') {
      return res.status(400).json({ ok: false, error: 'Link invalid or expired.' });
    }
    console.error('[auth/verify-token]', err);
    return res.status(500).json({ ok: false, error: 'Could not verify link.' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

export default router;
