CREATE TABLE IF NOT EXISTS calendar_notes (
  id                  SERIAL PRIMARY KEY,
  author_email        TEXT NOT NULL,
  author_name         TEXT NOT NULL,
  body                TEXT NOT NULL,
  notify_mode         TEXT NOT NULL DEFAULT 'broadcast' CHECK (notify_mode IN ('broadcast', 'quiet')),
  scope_type          TEXT NOT NULL CHECK (scope_type IN ('day', 'week', 'visit', 'store')),
  scope_date          DATE,
  scope_visit_id      INTEGER,
  scope_store_number  INTEGER,
  template_key        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_calendar_notes_scope_date ON calendar_notes (scope_date);
CREATE INDEX IF NOT EXISTS idx_calendar_notes_visit ON calendar_notes (scope_visit_id);

CREATE TABLE IF NOT EXISTS note_comments (
  id            SERIAL PRIMARY KEY,
  note_id       INTEGER NOT NULL REFERENCES calendar_notes(id) ON DELETE CASCADE,
  author_email  TEXT NOT NULL,
  author_name   TEXT NOT NULL,
  body          TEXT NOT NULL,
  notify_mode   TEXT NOT NULL DEFAULT 'broadcast' CHECK (notify_mode IN ('broadcast', 'quiet')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id          SERIAL PRIMARY KEY,
  actor_email TEXT NOT NULL,
  actor_name  TEXT,
  action      TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log (created_at DESC);
