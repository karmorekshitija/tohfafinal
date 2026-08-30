-- =============================================================================
-- Migration: 011_cleanup_tohfa_specials_legacy_schema.sql
-- Description: Unifies Tohfa Special to seller-level is_admin_managed concept.
--              Drops deprecated product-level columns and redundant seller flags.
-- =============================================================================

-- 1. Ensure is_admin_managed exists on sellers and seller_profiles
ALTER TABLE sellers 
ADD COLUMN IF NOT EXISTS is_admin_managed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE seller_profiles 
ADD COLUMN IF NOT EXISTS is_admin_managed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sellers_is_admin_managed ON sellers(is_admin_managed);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_is_admin_managed ON seller_profiles(is_admin_managed);

-- 2. Backfill is_admin_managed = TRUE for any existing Special seller accounts
-- Specifically user_id = 94 (Tohfa Official Store) and any accounts with legacy special flags/emails
DO $$
BEGIN
  -- Check and backfill from seller_profiles.is_tohfa_original if column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'seller_profiles' AND column_name = 'is_tohfa_original'
  ) THEN
    UPDATE seller_profiles SET is_admin_managed = TRUE WHERE is_tohfa_original::text IN ('true', '1', 't');
  END IF;

  -- Check and backfill from seller_profiles.is_special_managed if column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'seller_profiles' AND column_name = 'is_special_managed'
  ) THEN
    UPDATE seller_profiles SET is_admin_managed = TRUE WHERE is_special_managed::text IN ('true', '1', 't');
  END IF;

  -- Backfill from email pattern or known official store user_id
  UPDATE seller_profiles SET is_admin_managed = TRUE 
  WHERE user_id = 94 
     OR user_id IN (SELECT id FROM users WHERE email LIKE '%.special@%' OR email LIKE '%official%@thetohfa.in');

  -- Synchronize sellers table mirror
  UPDATE sellers s
  SET is_admin_managed = TRUE
  FROM seller_profiles sp
  WHERE (s.user_id = sp.user_id OR s.id = sp.user_id) AND sp.is_admin_managed = TRUE;
END $$;

-- 3. Reset any seller_profiles.seller_type = 'special' to 'Artisan'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'seller_profiles' AND column_name = 'seller_type'
  ) THEN
    UPDATE seller_profiles SET seller_type = 'Artisan' WHERE seller_type = 'special';
  END IF;
END $$;

-- 4. Drop deprecated product-level columns and indexes
DROP INDEX IF EXISTS idx_products_tohfa_original;
DROP INDEX IF EXISTS idx_products_priority_rank;

ALTER TABLE products 
DROP COLUMN IF EXISTS is_tohfa_original,
DROP COLUMN IF EXISTS tohfa_special_badge,
DROP COLUMN IF EXISTS priority_rank;

-- 5. Drop deprecated seller-level redundant columns
ALTER TABLE seller_profiles 
DROP COLUMN IF EXISTS is_tohfa_original,
DROP COLUMN IF EXISTS is_special_managed;
