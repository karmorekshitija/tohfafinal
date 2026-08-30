-- =============================================================================
-- Migration: 009_tofa_special_admin_owned_shops.sql
-- Description: Adds is_admin_managed column to sellers and seller_profiles tables
--              for TOFA Special admin-owned and operated shops.
-- =============================================================================

-- 1. Add is_admin_managed to sellers table
ALTER TABLE sellers
ADD COLUMN IF NOT EXISTS is_admin_managed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sellers_is_admin_managed 
ON sellers(is_admin_managed);

-- 2. Add is_admin_managed to seller_profiles table (backward-compatible view/table)
ALTER TABLE seller_profiles
ADD COLUMN IF NOT EXISTS is_admin_managed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_seller_profiles_is_admin_managed 
ON seller_profiles(is_admin_managed);
