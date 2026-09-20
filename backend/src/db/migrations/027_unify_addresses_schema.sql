-- =============================================================================
-- Migration 027: Unify Addresses Table Schema & Aliases
-- File: backend/src/db/migrations/027_unify_addresses_schema.sql
-- Role: Ensures both legacy and modern address columns (tag, label, full_name,
--       name, recipient_name, line1, address_line1, etc.) exist, is_default is
--       standardized to BOOLEAN, and aliases are synchronized.
-- =============================================================================

-- 1. Ensure all alias columns exist on addresses table
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS tag TEXT DEFAULT 'Home';
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS label TEXT DEFAULT 'Home';
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS address_type TEXT DEFAULT 'Home';
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS line1 TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS line2 TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS landmark TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

-- 2. Normalize is_default column type to BOOLEAN if it was created as INTEGER
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'addresses' AND column_name = 'is_default' AND data_type != 'boolean'
  ) THEN
    DROP VIEW IF EXISTS user_addresses;
    ALTER TABLE addresses ALTER COLUMN is_default DROP DEFAULT;
    ALTER TABLE addresses ALTER COLUMN is_default TYPE BOOLEAN USING (CASE WHEN is_default IS NULL THEN FALSE WHEN is_default::text = '0' THEN FALSE ELSE TRUE END);
    ALTER TABLE addresses ALTER COLUMN is_default SET DEFAULT FALSE;
  END IF;
END $$;

-- 3. Synchronize column values across aliases for existing rows
UPDATE addresses SET tag = COALESCE(tag, label, address_type, 'Home') WHERE tag IS NULL;
UPDATE addresses SET label = COALESCE(label, tag, address_type, 'Home') WHERE label IS NULL;
UPDATE addresses SET address_type = COALESCE(address_type, label, tag, 'Home') WHERE address_type IS NULL;

UPDATE addresses SET name = COALESCE(name, full_name, recipient_name) WHERE name IS NULL;
UPDATE addresses SET full_name = COALESCE(full_name, name, recipient_name) WHERE full_name IS NULL;
UPDATE addresses SET recipient_name = COALESCE(recipient_name, full_name, name) WHERE recipient_name IS NULL;

UPDATE addresses SET line1 = COALESCE(line1, address_line1) WHERE line1 IS NULL;
UPDATE addresses SET address_line1 = COALESCE(address_line1, line1) WHERE address_line1 IS NULL;

UPDATE addresses SET line2 = COALESCE(line2, address_line2) WHERE line2 IS NULL AND address_line2 IS NOT NULL;
UPDATE addresses SET address_line2 = COALESCE(address_line2, line2) WHERE address_line2 IS NULL AND line2 IS NOT NULL;

-- 4. Refresh user_addresses view
CREATE OR REPLACE VIEW user_addresses AS SELECT * FROM addresses;
