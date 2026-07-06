import { Resend } from 'resend';

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required');
  }
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = () => process.env.EMAIL_FROM || 'District 1 <info@retail-odyssey.com>';

function frontendBase() {
  return (process.env.FRONTEND_BASE_URL || '').replace(/\/+$/, '');
}

function stampReplyTo(payload, authorEmail) {
  if (authorEmail) payload.reply_to = authorEmail;
  else if (process.env.RESEND_REPLY_TO) payload.reply_to = process.env.RESEND_REPLY_TO;
}

export async function sendLoginLinkEmail({ to, link }) {
  const subject = 'Your District 1 Calendar sign-in link';
  const text = [
    'Hello,',
    '',
    'Use the link below to sign in to the District 1 shared calendar.',
    'This link expires in 7 days and can only be used once.',
    '',
    link,
    '',
    '— District 1 Calendar',
  ].join('\n');
  const html = `
    <p>Hello,</p>
    <p>Use the link below to sign in to the <strong>District 1 shared calendar</strong>.
       This link expires in 7 days and can only be used once.</p>
    <p><a href="${link}">${link}</a></p>
    <p>— District 1 Calendar</p>
  `;
  const payload = { from: FROM(), to, subject, text, html };
  stampReplyTo(payload, null);
  return getResend().emails.send(payload);
}

export async function sendInviteEmail({ to, displayName, role, link }) {
  const subject = `You've been invited to District 1 Calendar (${role})`;
  const text = [
    `Hello ${displayName || ''},`.trim(),
    '',
    `You've been invited to the District 1 shared calendar as a **${role}**.`,
    'Click the link below to sign in:',
    '',
    link,
    '',
    '— District 1 Calendar',
  ].join('\n');
  const html = `
    <p>Hello ${displayName || ''},</p>
    <p>You've been invited to the District 1 shared calendar as a <strong>${role}</strong>.</p>
    <p><a href="${link}">Sign in to District 1 Calendar</a></p>
    <p>— District 1 Calendar</p>
  `;
  const payload = { from: FROM(), to, subject, text, html };
  stampReplyTo(payload, null);
  return getResend().emails.send(payload);
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
  return getResend().emails.send(payload);
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
    <p><strong>${authorName}</strong> (${authorEmail}) posted an update:</p>
    <p>${summary.replace(/\n/g, '<br>')}</p>
    ${detailUrl ? `<p><a href="${detailUrl}">Open in calendar</a></p>` : ''}
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
  const base = frontendBase();
  return hash ? `${base}/#${hash.replace(/^#/, '')}` : base;
}
