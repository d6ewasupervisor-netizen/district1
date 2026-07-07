ALTER TABLE link_requests
  ADD COLUMN IF NOT EXISTS sign_in_code TEXT;

CREATE INDEX IF NOT EXISTS idx_link_requests_email_code
  ON link_requests (email, sign_in_code)
  WHERE used_at IS NULL;
