import { query } from './db.js';
import { sasGet, isSessionAlive } from './sas-session.js';
import { getVisitStoreNumber, visitIsD1Store } from './sas-store-match.js';
import { D1_STORES, D1_PROJECTS } from './d1-config.js';
import { getInitialSyncWindow } from './fiscal-calendar.js';

function normalizeList(body) {
  if (Array.isArray(body)) return body;
  if (body?.results) return body.results;
  return [];
}

function storeNum(visit) {
  const sn = getVisitStoreNumber(visit);
  return sn != null ? Number(sn) : null;
}

function visitProjectId(visit) {
  const raw = visit?.store?.project?.id ?? visit?.project?.id ?? visit?.project_id;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function pickCycles(cycles, from, to) {
  const fromMs = new Date(`${from}T00:00:00`).getTime();
  const toMs = new Date(`${to}T23:59:59`).getTime();
  return cycles.filter((c) => {
    const start = new Date(`${c.start_date}T00:00:00`).getTime();
    const end = new Date(`${c.end_date}T23:59:59`).getTime();
    return start <= toMs && end >= fromMs;
  });
}

async function fetchCycles(projectId) {
  const data = await sasGet('/api/v1/projects/project-cycles/', {
    current_status: 'active',
    page: '1',
    page_size: '100',
    project: String(projectId),
    sort: 'start_date',
  });
  return normalizeList(data);
}

async function fetchVisitsForCycle(cycleId) {
  const all = [];
  let page = 1;
  while (page <= 20) {
    const data = await sasGet('/api/v1/team-scheduling/visits/', {
      cycle: String(cycleId),
      page: String(page),
      page_size: '500',
    });
    const rows = normalizeList(data);
    all.push(...rows);
    if (rows.length < 500) break;
    page += 1;
  }
  return all;
}

async function fetchFieldData(projectId, from, to) {
  const byVisitId = new Map();
  let page = 1;
  while (page <= 30) {
    const data = await sasGet('/api/v1/operations/field-data/', {
      customer_id: '2',
      program_id: '1',
      project_id: String(projectId),
      scheduled_dt_from: from,
      scheduled_dt_to: to,
      page: String(page),
      page_size: '500',
    });
    const rows = normalizeList(data);
    for (const row of rows) {
      if (row.id != null) {
        byVisitId.set(Number(row.id), row);
      }
    }
    if (rows.length < 500) break;
    page += 1;
  }
  return byVisitId;
}

async function fetchRoster(visitId) {
  try {
    const data = await sasGet('/api/v1/team-scheduling/shifts/', {
      visit: String(visitId),
      page_size: '50',
    });
    const rows = normalizeList(data).filter((s) => s.current_status !== 'deleted');
    return rows.map((s) => ({
      employee: s.employee?.person_name || s.employee_name || null,
      is_lead: s.is_lead === true || s.is_lead === 'true',
      shift_start: s.shift_start_time,
      shift_end: s.shift_end_time,
      status: s.current_status,
    }));
  } catch {
    return [];
  }
}

async function upsertVisit(visit, cycleId, projectMeta, fieldRow, roster) {
  const sn = storeNum(visit);
  if (sn == null || !D1_STORES.has(sn)) return false;

  const leadName =
    visit.visit_lead?.person_name || visit.visit_lead_name || fieldRow?.visit_lead || null;
  const teamName = visit.team?.name || null;

  await query(
    `INSERT INTO prod_visits (
       visit_id, visit_id_full, cycle_id, store_number, store_name, team_name,
       project_id, project_name, scheduled_date, shift_start_time, shift_end_time,
       total_hours, current_status, visit_lead, supervisor, emp_count, no_show_count,
       due_by, roster_json, synced_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW()
     )
     ON CONFLICT (visit_id, scheduled_date) DO UPDATE SET
       visit_id_full = EXCLUDED.visit_id_full,
       cycle_id = EXCLUDED.cycle_id,
       store_number = EXCLUDED.store_number,
       store_name = EXCLUDED.store_name,
       team_name = EXCLUDED.team_name,
       project_id = EXCLUDED.project_id,
       project_name = EXCLUDED.project_name,
       shift_start_time = EXCLUDED.shift_start_time,
       shift_end_time = EXCLUDED.shift_end_time,
       total_hours = EXCLUDED.total_hours,
       current_status = EXCLUDED.current_status,
       visit_lead = EXCLUDED.visit_lead,
       supervisor = EXCLUDED.supervisor,
       emp_count = EXCLUDED.emp_count,
       no_show_count = EXCLUDED.no_show_count,
       due_by = EXCLUDED.due_by,
       roster_json = EXCLUDED.roster_json,
       synced_at = NOW()`,
    [
      Number(visit.id),
      visit.visit_id || String(visit.id),
      cycleId,
      sn,
      visit.store?.store?.name || `FM ${sn}`,
      teamName,
      projectMeta.id,
      projectMeta.name,
      visit.scheduled_date,
      visit.shift_start_time || null,
      visit.shift_end_time || null,
      visit.total_hours != null ? String(visit.total_hours) : null,
      visit.current_status || 'active',
      leadName,
      fieldRow?.supervisor || null,
      fieldRow?.emp_count ?? 0,
      fieldRow?.no_show_count ?? 0,
      visit.due_by || null,
      JSON.stringify(roster),
    ],
  );
  return true;
}

export async function runProdSync(fromDate, toDate) {
  if (!isSessionAlive()) {
    throw new Error('SAS session not alive — push session first');
  }

  const from = fromDate || getInitialSyncWindow().from;
  const to = toDate || getInitialSyncWindow().to;

  const { rows: runRows } = await query(
    `INSERT INTO sync_runs (from_date, to_date) VALUES ($1::date, $2::date) RETURNING id`,
    [from, to],
  );
  const runId = runRows[0].id;
  let upserted = 0;

  try {
    for (const project of D1_PROJECTS) {
      const cycles = await fetchCycles(project.id);
      const matched = pickCycles(cycles, from, to);
      if (!matched.length) continue;

      const fieldData = await fetchFieldData(project.id, from, to);

      for (const cycle of matched) {
        const visits = await fetchVisitsForCycle(cycle.id);
        for (const v of visits) {
          if (!visitIsD1Store(v, D1_STORES)) continue;
          const d = String(v.scheduled_date || '');
          if (d < from || d > to) continue;
          const pid = visitProjectId(v);
          if (pid != null && pid !== project.id) continue;

          const fieldRow = fieldData.get(Number(v.id));
          const roster = await fetchRoster(v.id);
          const ok = await upsertVisit(v, cycle.id, project, fieldRow, roster);
          if (ok) upserted += 1;
        }
      }
    }

    await query(
      `UPDATE sync_runs SET finished_at = NOW(), visits_upserted = $2 WHERE id = $1`,
      [runId, upserted],
    );
    console.log(`[sync] complete ${from}..${to} — ${upserted} visits upserted`);
    return { from, to, upserted };
  } catch (err) {
    await query(
      `UPDATE sync_runs SET finished_at = NOW(), error = $2 WHERE id = $1`,
      [runId, String(err.message || err)],
    );
    throw err;
  }
}

let syncTimer = null;

export function startSyncWorker() {
  const minutes = Number(process.env.SYNC_INTERVAL_MINUTES || 15);
  const tick = async () => {
    if (!isSessionAlive()) {
      console.log('[sync] skipped — no SAS session');
      return;
    }
    try {
      await runProdSync();
    } catch (err) {
      console.error('[sync] worker error', err.message);
    }
  };

  syncTimer = setInterval(tick, minutes * 60 * 1000);
  console.log(`[sync] worker every ${minutes} min`);
}

export async function bootstrapSyncIfEmpty() {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM prod_visits');
  if (rows[0].n > 0) return;
  if (!isSessionAlive()) {
    console.log('[sync] bootstrap skipped — no SAS session yet');
    return;
  }
  const w = getInitialSyncWindow();
  console.log(`[sync] bootstrap ${w.label}`);
  await runProdSync(w.from, w.to);
}
