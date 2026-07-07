import jwt from 'jsonwebtoken';

const SESSION_TYP = 'session';

function secret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required (must match eod-api)');
  }
  return process.env.JWT_SECRET;
}

/** Verify session JWT issued by eod-api /api/verify-token (Dump Bin auth). */
export function verifyEodSessionToken(token) {
  const payload = jwt.verify(token, secret());
  if (payload.typ !== SESSION_TYP) {
    const err = new Error('Invalid session token type');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  if (!payload.email) {
    throw new Error('Session token missing email');
  }
  return payload;
}
