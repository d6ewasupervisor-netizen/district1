import express from 'express';
import { query } from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/auth-middleware.js';
import { logActivity } from '../lib/activity.js';
import { notifyTeam, buildCalendarUrl } from '../lib/email.js';

const router = express.Router();

router.use(requireAuth);

router.get('/activity', requireRole('admin'), async (_req, res) => {
  const { rows } = await query(
    `SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 200`,
  );
  res.json({ ok: true, activity: rows });
});

router.get('/:noteId/comments', async (req, res) => {
  const noteId = Number(req.params.noteId);
  const { rows } = await query(
    `SELECT * FROM note_comments WHERE note_id = $1 ORDER BY created_at ASC`,
    [noteId],
  );
  res.json({ ok: true, comments: rows });
});

router.post('/', requireRole('modifier'), async (req, res) => {
  try {
    const { body, notify_mode, scope_type, scope_date, scope_visit_id, scope_store_number } =
      req.body || {};
    const text = String(body || '').trim();
    if (!text) return res.status(400).json({ ok: false, error: 'Note body required.' });
    if (!['day', 'week', 'visit', 'store'].includes(scope_type)) {
      return res.status(400).json({ ok: false, error: 'Invalid scope.' });
    }

    const mode = notify_mode === 'quiet' ? 'quiet' : 'broadcast';

    const { rows } = await query(
      `INSERT INTO calendar_notes (
         author_email, author_name, body, notify_mode, scope_type,
         scope_date, scope_visit_id, scope_store_number
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        req.user.email,
        req.user.display_name,
        text,
        mode,
        scope_type,
        scope_date || null,
        scope_visit_id || null,
        scope_store_number || null,
      ],
    );

    const note = rows[0];
    await logActivity(req.user.email, req.user.display_name, 'note_create', {
      id: note.id,
      scope_type,
      notify_mode: mode,
    });

    if (mode === 'broadcast') {
      const hash = scope_date ? `day/${scope_date}` : '';
      await notifyTeam({
        authorEmail: req.user.email,
        authorName: req.user.display_name,
        subject: `[District 1] New calendar note`,
        summary: text.slice(0, 500),
        detailUrl: buildCalendarUrl(hash),
      });
    }

    res.json({ ok: true, note });
  } catch (err) {
    console.error('[notes/create]', err);
    res.status(500).json({ ok: false, error: 'Could not save note.' });
  }
});

router.post('/:noteId/comments', requireRole('modifier'), async (req, res) => {
  try {
    const noteId = Number(req.params.noteId);
    const text = String(req.body?.body || '').trim();
    const mode = req.body?.notify_mode === 'quiet' ? 'quiet' : 'broadcast';
    if (!text) return res.status(400).json({ ok: false, error: 'Comment required.' });

    const { rows } = await query(
      `INSERT INTO note_comments (note_id, author_email, author_name, body, notify_mode)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [noteId, req.user.email, req.user.display_name, text, mode],
    );

    await logActivity(req.user.email, req.user.display_name, 'comment_create', {
      note_id: noteId,
      notify_mode: mode,
    });

    if (mode === 'broadcast') {
      await notifyTeam({
        authorEmail: req.user.email,
        authorName: req.user.display_name,
        subject: `[District 1] New comment on a note`,
        summary: text.slice(0, 500),
        detailUrl: buildCalendarUrl(),
      });
    }

    res.json({ ok: true, comment: rows[0] });
  } catch (err) {
    console.error('[notes/comment]', err);
    res.status(500).json({ ok: false, error: 'Could not save comment.' });
  }
});

export default router;
