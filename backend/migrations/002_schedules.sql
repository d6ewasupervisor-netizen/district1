CREATE TABLE IF NOT EXISTS prod_visits (
  id                SERIAL PRIMARY KEY,
  visit_id          INTEGER NOT NULL,
  visit_id_full     TEXT,
  cycle_id          INTEGER,
  store_number      INTEGER NOT NULL,
  store_name        TEXT,
  team_name         TEXT,
  project_id        INTEGER,
  project_name      TEXT,
  scheduled_date    DATE NOT NULL,
  shift_start_time  TEXT,
  shift_end_time    TEXT,
  total_hours       TEXT,
  current_status    TEXT NOT NULL DEFAULT 'active',
  visit_lead        TEXT,
  supervisor        TEXT,
  emp_count         INTEGER DEFAULT 0,
  no_show_count     INTEGER DEFAULT 0,
  due_by            DATE,
  roster_json       JSONB,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (visit_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_prod_visits_date ON prod_visits (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_prod_visits_store ON prod_visits (store_number);
CREATE INDEX IF NOT EXISTS idx_prod_visits_status ON prod_visits (current_status);
CREATE INDEX IF NOT EXISTS idx_prod_visits_lead ON prod_visits (visit_lead);

CREATE TABLE IF NOT EXISTS sync_runs (
  id           SERIAL PRIMARY KEY,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  from_date    DATE,
  to_date      DATE,
  visits_upserted INTEGER DEFAULT 0,
  error        TEXT
);
