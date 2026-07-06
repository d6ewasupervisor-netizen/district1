import { verifySessionToken } from './tokens.js';
import { query } from './db.js';

const ROLE_RANK = { viewer: 1, modifier: 2, admin: 3 };

export async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }
  try {
    const payload = verifySessionToken(token);
    const { rows } = await query(
      `SELECT email, display_name, role, status FROM users WHERE email = $1 LIMIT 1`,
      [payload.email],
    );
    if (!rows.length || rows[0].status !== 'active') {
      return res.status(401).json({ ok: false, error: 'Account inactive or not found' });
    }
    req.user = {
      email: rows[0].email,
      display_name: rows[0].display_name,
      role: rows[0].role,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
  }
}

export function requireRole(minRole) {
  return (req, res, next) => {
    const have = ROLE_RANK[req.user?.role] || 0;
    const need = ROLE_RANK[minRole] || 0;
    if (have < need) {
      return res.status(403).json({ ok: false, error: 'Insufficient permissions' });
    }
    return next();
  };
}

export function canWriteNotes(user) {
  return ROLE_RANK[user?.role] >= ROLE_RANK.modifier;
}

export function canAdmin(user) {
  return user?.role === 'admin';
}
