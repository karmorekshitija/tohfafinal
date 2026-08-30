-- =============================================================================
-- Tohfa v2 — Migration 015: Reports Table Schema Synchronization
-- File: backend/src/db/migrations/015_reports_schema_sync.sql
-- Role: Ensures reports table schema supports centralized reporting with type and reason
-- =============================================================================

CREATE TABLE IF NOT EXISTS reports (
  id           SERIAL PRIMARY KEY,
  reporter_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL DEFAULT 'other',
  target_id    TEXT,
  reason       TEXT NOT NULL DEFAULT '',
  status       VARCHAR(20) NOT NULL DEFAULT 'open',
  admin_note   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

-- Ensure all necessary columns exist if table was previously created with older columns
ALTER TABLE reports ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_id TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Relax legacy NOT NULL constraints on old column names
DO $$
BEGIN
  ALTER TABLE reports ALTER COLUMN subject DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE reports ALTER COLUMN description DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Drop any restrictive legacy check constraints
DO $$
BEGIN
  ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check;
  ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_reporter_type_check;
  ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_related_to_type_check;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Backfill type and reason from legacy columns if empty
UPDATE reports 
SET type = COALESCE(NULLIF(type, ''), related_to_type, 'other'),
    reason = COALESCE(NULLIF(reason, ''), description, subject, 'No details provided')
WHERE type IS NULL OR reason IS NULL OR type = '' OR reason = '';

-- Add indexes for fast lookup by reporter and status
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
