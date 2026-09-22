-- =============================================================================
-- Migration 028: Add Locality Column to Addresses Table
-- File: backend/src/db/migrations/028_add_address_locality.sql
-- Role: Adds optional locality/area field to addresses table and updates
--       user_addresses view.
-- =============================================================================

ALTER TABLE addresses ADD COLUMN IF NOT EXISTS locality TEXT;

CREATE OR REPLACE VIEW user_addresses AS SELECT * FROM addresses;
