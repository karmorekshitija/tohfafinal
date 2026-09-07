-- Migration 019: add updated_at to sellers table
-- Safe: uses ADD COLUMN IF NOT EXISTS, no data loss possible

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Also ensure categories.updated_at exists on production (migration 018 may not have run)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
