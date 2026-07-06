import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const SECRET = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
  return process.env.JWT_SECRET;
};

const LINK_TTL_DAYS = () => Number(process.env.LINK_TTL_DAYS || 7);
const SESSION_TTL_DAYS = () => Number(process.env.SESSION_TTL_DAYS || 7);

export function issueLinkToken(email) {
  const jti = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign({ email, type: 'link' }, SECRET(), {
    expiresIn: `${LINK_TTL_DAYS()}d`,
    jwtid: jti,
  });
  return { token, jti };
}

export function verifyLinkToken(token) {
  const payload = jwt.verify(token, SECRET());
  if (payload.type !== 'link') throw new Error('Invalid token type');
  return payload;
}

export function issueSessionToken(user) {
  return jwt.sign(
    {
      type: 'session',
      email: user.email,
      display_name: user.display_name,
      role: user.role,
    },
    SECRET(),
    { expiresIn: `${SESSION_TTL_DAYS()}d` },
  );
}

export function verifySessionToken(token) {
  const payload = jwt.verify(token, SECRET());
  if (payload.type !== 'session') throw new Error('Invalid token type');
  return payload;
}
