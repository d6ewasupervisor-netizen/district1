import { query } from './db.js';

export async function logActivity(actorEmail, actorName, action, payload) {
  await query(
    `INSERT INTO activity_log (actor_email, actor_name, action, payload) VALUES ($1, $2, $3, $4)`,
    [actorEmail, actorName || null, action, payload ? JSON.stringify(payload) : null],
  );
}

export async function getActiveNotifyEmails(excludeEmail = null) {
  const { rows } = await query(
    `SELECT email FROM users
     WHERE status = 'active' AND notify_enabled = TRUE
       AND ($1::text IS NULL OR email <> $1)`,
    [excludeEmail],
  );
  return rows.map((r) => r.email);
}
