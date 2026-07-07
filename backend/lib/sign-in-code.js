import crypto from 'node:crypto';

export function generateSignInCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function buildSignInPageUrl() {
  const base = (process.env.FRONTEND_BASE_URL || '').replace(/\/+$/, '');
  return `${base}/sign-in.html`;
}
