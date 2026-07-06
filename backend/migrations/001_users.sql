CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('viewer', 'modifier', 'admin')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  notify_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  invited_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_invitations (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('viewer', 'modifier', 'admin')),
  invited_by    TEXT NOT NULL,
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS link_requests (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  jti         TEXT NOT NULL UNIQUE,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at     TIMESTAMPTZ
);

INSERT INTO users (email, display_name, role, status, notify_enabled)
VALUES
  ('seth.newman@retailodyssey.com', 'Seth Newman', 'admin', 'active', TRUE),
  ('tyson.gauthier@retailodyssey.com', 'Tyson Gauthier', 'admin', 'active', TRUE),
  ('amanda.mathews@retailodyssey.com', 'Amanda Mathews', 'admin', 'active', TRUE),
  ('april.gauthier@retailodyssey.com', 'April Gauthier', 'admin', 'active', TRUE)
ON CONFLICT (email) DO NOTHING;
