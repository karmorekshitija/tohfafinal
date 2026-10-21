-- =============================================================================
-- Migration 028: Add Locality Column to Addresses Table
-- File: backend/src/db/migrations/028_add_address_locality.sql
-- Role: Adds optional locality/area field to addresses table and updates
--       user_addresses view.
-- =============================================================================

ALTER TABLE addresses ADD COLUMN IF NOT EXISTS locality TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'user_addresses' AND table_type = 'BASE TABLE'
  ) THEN
    EXECUTE 'CREATE OR REPLACE VIEW user_addresses AS SELECT * FROM addresses';
  END IF;
END $$;
