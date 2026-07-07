import { Resend } from 'resend';
import { buildSignInPageUrl } from './sign-in-code.js';
import { reportResendPayload } from './email-outbox-ingest.js';

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required');
  }
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = () => process.env.EMAIL_FROM || 'District 1 <info@retail-odyssey.com>';
const TTL_DAYS = () => Number(process.env.LINK_TTL_DAYS || 7);

function stampReplyTo(payload, authorEmail) {
  if (authorEmail) payload.reply_to = authorEmail;
  else if (process.env.RESEND_REPLY_TO) payload.reply_to = process.env.RESEND_REPLY_TO;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendTracked(sourceType, payload, extra = {}) {
  const result = await getResend().emails.send(payload);
  reportResendPayload(sourceType, payload, result, {
    resendAllowed: !String(sourceType).includes('auth') && !String(sourceType).includes('login') && !String(sourceType).includes('invite'),
    ...extra,
  }).catch(() => {});
  return result;
}

/** Scanner-safe: code in body, generic sign-in page URL only (no one-time token in links). */
function signInCodeEmailContent({ code, heading, intro }) {
  const signInUrl = buildSignInPageUrl();
  const safeCode = escapeHtml(code);
  const safeUrl = escapeHtml(signInUrl);
  const ttl = TTL_DAYS();

  const text = [
    heading,
    '',
    intro,
    '',
    `Sign-in code: ${code}`,
    '',
    'Open the District 1 sign-in page (copy into your browser if needed):',
    signInUrl,
    '',
    'Enter your work email and the code above. Do not share this code.',
    `The code expires in ${ttl} days and works once.`,
    '',
    '— District 1 Calendar',
  ].join('\n');

  const html = `
    <p>${escapeHtml(intro)}</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:24px 0;">${safeCode}</p>
    <p>Open the sign-in page, enter your <strong>work email</strong> and this code:</p>
    <p style="word-break:break-all;color:#334155;">${safeUrl}</p>
    <p style="font-size:13px;color:#64748b;">Copy the address into your browser if your mail client blocks links.
       Email security scanners cannot use this code — only you can complete sign-in on the page.</p>
    <p style="font-size:13px;color:#64748b;">Expires in ${ttl} days · single use · do not forward</p>
    <p>— District 1 Calendar</p>
  `;

  return { text, html, signInUrl };
}

export async function sendLoginCodeEmail({ to, code }) {
  const { text, html } = signInCodeEmailContent({
    code,
    heading: 'District 1 Calendar sign-in',
    intro: 'Use this code to sign in to the District 1 shared calendar.',
  });
  const payload = {
    from: FROM(),
    to,
    subject: `District 1 Calendar sign-in code: ${code}`,
    text,
    html,
  };
  stampReplyTo(payload, null);
  return sendTracked('login-code', payload, { resendAllowed: false });
}

export async function sendInviteEmail({ to, displayName, role, code }) {
  const { text, html } = signInCodeEmailContent({
    code,
    heading: `Welcome to District 1 Calendar (${role})`,
    intro: `Hello ${displayName || ''}, you've been invited as a ${role}.`,
  });
  const payload = {
    from: FROM(),
    to,
    subject: `District 1 Calendar invite — your sign-in code: ${code}`,
    text,
    html,
  };
  stampReplyTo(payload, null);
  return sendTracked('calendar-invite', payload, { resendAllowed: false, metadata: { role } });
}

export async function sendActivityEmail({ to, cc, authorEmail, authorName, subject, bodyHtml, bodyText }) {
  const payload = {
    from: FROM(),
    to: Array.isArray(to) ? to : [to],
    subject,
    html: bodyHtml,
    text: bodyText,
  };
  if (cc) payload.cc = cc;
  stampReplyTo(payload, authorEmail);
  return sendTracked('calendar-activity', payload, { sentByEmail: authorEmail, sourceRef: subject });
}

export async function notifyTeam({ authorEmail, authorName, subject, summary, detailUrl }) {
  const { getActiveNotifyEmails } = await import('./activity.js');
  const recipients = await getActiveNotifyEmails(authorEmail);
  if (!recipients.length) return { skipped: true, reason: 'no recipients' };

  const text = [
    `${authorName} (${authorEmail}) posted an update:`,
    '',
    summary,
    detailUrl ? `\nView: ${detailUrl}` : '',
    '',
    '— District 1 Calendar',
  ].join('\n');

  const html = `
    <p><strong>${escapeHtml(authorName)}</strong> (${escapeHtml(authorEmail)}) posted an update:</p>
    <p>${escapeHtml(summary).replace(/\n/g, '<br>')}</p>
    ${detailUrl ? `<p><a href="${escapeHtml(detailUrl)}">Open in calendar</a></p>` : ''}
    <p>— District 1 Calendar</p>
  `;

  return sendActivityEmail({
    to: recipients,
    cc: authorEmail,
    authorEmail,
    authorName,
    subject,
    bodyHtml: html,
    bodyText: text,
  });
}

export function buildCalendarUrl(hash = '') {
  const base = (process.env.FRONTEND_BASE_URL || '').replace(/\/+$/, '');
  return hash ? `${base}/#${hash.replace(/^#/, '')}` : base;
}
