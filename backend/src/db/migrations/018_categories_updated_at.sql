-- Migration 018: Add updated_at column to categories table if not exists
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
