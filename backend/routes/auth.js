import express from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../lib/db.js';
import { issueLinkToken, verifyLinkToken, issueSessionToken } from '../lib/tokens.js';
import { sendLoginCodeEmail } from '../lib/email.js';
import { generateSignInCode } from '../lib/sign-in-code.js';
import { requireAuth } from '../lib/auth-middleware.js';
import { logActivity } from '../lib/activity.js';

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Try again later.' },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts. Wait a few minutes and try again.' },
});

async function completeSignIn(email, jti) {
  const { rows } = await query(
    `SELECT email, display_name, role, status FROM users WHERE email = $1`,
    [email],
  );
  if (!rows.length || rows[0].status !== 'active') {
    throw Object.assign(new Error('Account inactive.'), { status: 400 });
  }

  await query(`UPDATE link_requests SET used_at = NOW() WHERE jti = $1 AND used_at IS NULL`, [jti]);
  await query(`UPDATE users SET last_login_at = NOW() WHERE email = $1`, [email]);
  await query(
    `UPDATE user_invitations SET accepted_at = NOW()
     WHERE email = $1 AND accepted_at IS NULL`,
    [email],
  );

  const sessionToken = issueSessionToken(rows[0]);
  await logActivity(email, rows[0].display_name, 'login', { method: 'sign_in_code' });

  return {
    sessionToken,
    user: {
      email: rows[0].email,
      display_name: rows[0].display_name,
      role: rows[0].role,
    },
  };
}

router.post('/request-link', requestLimiter, async (req, res) => {
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

    const { jti } = issueLinkToken(email);
    const signInCode = generateSignInCode();
    await query(
      `INSERT INTO link_requests (email, jti, sign_in_code, ip, user_agent) VALUES ($1, $2, $3, $4, $5)`,
      [email, jti, signInCode, req.ip, req.get('user-agent') || null],
    );

    await sendLoginCodeEmail({ to: email, code: signInCode });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth/request-link]', err);
    return res.status(500).json({ ok: false, error: 'Could not send sign-in code.' });
  }
});

/** Primary sign-in: email + 6-digit code (safe from link scanners). */
router.post('/verify-code', verifyLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Enter a valid email address.' });
    }
    if (!CODE_RE.test(code)) {
      return res.status(400).json({ ok: false, error: 'Enter the 6-digit code from your email.' });
    }

    const ttlDays = Number(process.env.LINK_TTL_DAYS || 7);
    const { rows: lr } = await query(
      `SELECT jti, used_at FROM link_requests
       WHERE email = $1 AND sign_in_code = $2
         AND created_at > NOW() - ($3::text || ' days')::interval
       ORDER BY created_at DESC LIMIT 1`,
      [email, code, String(ttlDays)],
    );
    if (!lr.length) {
      return res.status(400).json({ ok: false, error: 'Invalid email or code.' });
    }
    if (lr[0].used_at) {
      return res.status(400).json({ ok: false, error: 'This code was already used. Request a new one.' });
    }

    const result = await completeSignIn(email, lr[0].jti);
    return res.json({ ok: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[auth/verify-code]', err);
    return res.status(status).json({ ok: false, error: err.message || 'Could not sign in.' });
  }
});

/** Legacy token links — require POST so scanners cannot consume via GET. */
router.post('/verify-token', verifyLimiter, async (req, res) => {
  const token = String(req.body?.token || '');
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

    const result = await completeSignIn(payload.email, payload.jti);
    return res.json({ ok: true, ...result });
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
