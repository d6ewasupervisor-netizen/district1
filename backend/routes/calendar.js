import express from 'express';
import { query } from '../lib/db.js';
import { requireAuth } from '../lib/auth-middleware.js';
import { D1_STORES, STATUS_LABELS } from '../lib/d1-config.js';
import { getCurrentPeriodWeek, getInitialSyncWindow } from '../lib/fiscal-calendar.js';
import { normalizeStoreNumber } from '../lib/sas-store-match.js';

const router = express.Router();
router.use(requireAuth);

function buildVisitFilters(queryParams) {
  const clauses = ['scheduled_date >= $1::date', 'scheduled_date <= $2::date'];
  const params = [queryParams.from, queryParams.to];
  let idx = 3;

  if (queryParams.stores?.length) {
    const nums = queryParams.stores.map(Number).filter((n) => D1_STORES.has(n));
    if (nums.length) {
      clauses.push(`store_number = ANY($${idx}::int[])`);
      params.push(nums);
      idx += 1;
    }
  }

  if (queryParams.status?.length) {
    clauses.push(`current_status = ANY($${idx}::text[])`);
    params.push(queryParams.status);
    idx += 1;
  }

  if (queryParams.lead) {
    clauses.push(`visit_lead ILIKE $${idx}`);
    params.push(`%${queryParams.lead}%`);
    idx += 1;
  }

  if (queryParams.q) {
    clauses.push(`(
      store_number::text ILIKE $${idx}
      OR store_name ILIKE $${idx}
      OR visit_lead ILIKE $${idx}
      OR project_name ILIKE $${idx}
      OR visit_id::text ILIKE $${idx}
    )`);
    params.push(`%${queryParams.q}%`);
    idx += 1;
  }

  return { where: clauses.join(' AND '), params };
}

router.get('/meta', (_req, res) => {
  res.json({
    ok: true,
    stores: [...D1_STORES].sort((a, b) => a - b),
    statuses: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
    currentWeek: getCurrentPeriodWeek(),
    initialWindow: getInitialSyncWindow(),
  });
});

router.get('/visits', async (req, res) => {
  try {
    const from = req.query.from || getInitialSyncWindow().from;
    const to = req.query.to || getInitialSyncWindow().to;
    const stores = req.query.stores ? String(req.query.stores).split(',') : [];
    const status = req.query.status ? String(req.query.status).split(',') : [];
    const lead = req.query.lead || null;
    const q = req.query.q || null;

    const { where, params } = buildVisitFilters({ from, to, stores, status, lead, q });
    const { rows } = await query(
      `SELECT * FROM prod_visits WHERE ${where} ORDER BY scheduled_date, store_number, project_name`,
      params,
    );

    const notes = await query(
      `SELECT id, author_name, body, notify_mode, scope_type, scope_date, scope_visit_id,
              scope_store_number, created_at
       FROM calendar_notes
       WHERE (scope_date >= $1::date AND scope_date <= $2::date)
          OR scope_type = 'week'
       ORDER BY created_at DESC`,
      [from, to],
    );

    res.json({ ok: true, from, to, visits: rows, notes: notes.rows });
  } catch (err) {
    console.error('[calendar/visits]', err);
    res.status(500).json({ ok: false, error: 'Could not load calendar data.' });
  }
});

router.get('/visits/:visitId/:date', async (req, res) => {
  try {
    const visitId = Number(req.params.visitId);
    const date = req.params.date;
    const { rows } = await query(
      `SELECT * FROM prod_visits WHERE visit_id = $1 AND scheduled_date = $2::date LIMIT 1`,
      [visitId, date],
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Visit not found.' });

    const notes = await query(
      `SELECT * FROM calendar_notes
       WHERE scope_visit_id = $1 OR (scope_type = 'day' AND scope_date = $2::date)
       ORDER BY created_at DESC`,
      [visitId, date],
    );

    res.json({ ok: true, visit: rows[0], notes: notes.rows });
  } catch (err) {
    console.error('[calendar/visit-detail]', err);
    res.status(500).json({ ok: false, error: 'Could not load visit.' });
  }
});

router.get('/leads', async (req, res) => {
  const from = req.query.from || getInitialSyncWindow().from;
  const to = req.query.to || getInitialSyncWindow().to;
  const { rows } = await query(
    `SELECT DISTINCT visit_lead FROM prod_visits
     WHERE scheduled_date >= $1::date AND scheduled_date <= $2::date
       AND visit_lead IS NOT NULL AND visit_lead <> ''
     ORDER BY visit_lead`,
    [from, to],
  );
  res.json({ ok: true, leads: rows.map((r) => r.visit_lead) });
});

router.get('/day/:date', async (req, res) => {
  const date = req.params.date;
  const storeFilter = req.query.store ? normalizeStoreNumber(req.query.store) : null;

  let sql = `SELECT * FROM prod_visits WHERE scheduled_date = $1::date`;
  const params = [date];
  if (storeFilter) {
    sql += ` AND store_number = $2`;
    params.push(Number(storeFilter));
  }
  sql += ` ORDER BY store_number, shift_start_time`;

  const { rows: visits } = await query(sql, params);
  const { rows: notes } = await query(
    `SELECT * FROM calendar_notes WHERE scope_date = $1::date OR scope_type = 'day'
     ORDER BY created_at DESC`,
    [date],
  );

  res.json({ ok: true, date, visits, notes });
});

export default router;
