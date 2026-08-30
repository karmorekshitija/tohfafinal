-- =============================================================================
-- Tohfa v2 — Migration 017: Seller Onboarding Split (KYC vs Post-Approval Studio Setup)
-- File: backend/src/db/migrations/017_seller_onboarding_split.sql
-- =============================================================================

-- 1. Add onboarding_completed column to seller_profiles and sellers
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- 2. Ensure pickup_address and bank_details columns have safe defaults
ALTER TABLE seller_profiles ALTER COLUMN pickup_address SET DEFAULT '{}'::jsonb;
ALTER TABLE seller_profiles ALTER COLUMN bank_details SET DEFAULT '{}'::jsonb;
ALTER TABLE sellers ALTER COLUMN pickup_address SET DEFAULT '{}'::jsonb;
ALTER TABLE sellers ALTER COLUMN bank_details SET DEFAULT '{}'::jsonb;

-- 3. Data Migration for existing sellers:
-- A. Tohfa Special stores (is_admin_managed = TRUE) are curated by admin and already onboarded
UPDATE seller_profiles SET onboarding_completed = TRUE WHERE is_admin_managed = TRUE;
UPDATE sellers SET onboarding_completed = TRUE WHERE is_admin_managed = TRUE;

-- B. Existing approved regular sellers who already have non-empty bank_details AND pickup_address
UPDATE seller_profiles
SET onboarding_completed = TRUE
WHERE (is_admin_managed IS FALSE OR is_admin_managed IS NULL)
  AND is_approved = TRUE
  AND pickup_address IS NOT NULL
  AND pickup_address::text != '{}'
  AND pickup_address::text != 'null'
  AND (pickup_address->>'city' IS NOT NULL OR pickup_address->>'address_line1' IS NOT NULL)
  AND bank_details IS NOT NULL
  AND bank_details::text != '{}'
  AND bank_details::text != 'null'
  AND (bank_details->>'account_number' IS NOT NULL OR bank_details->'bank'->>'account_number' IS NOT NULL);

UPDATE sellers
SET onboarding_completed = TRUE
WHERE (is_admin_managed IS FALSE OR is_admin_managed IS NULL)
  AND is_approved = TRUE
  AND pickup_address IS NOT NULL
  AND pickup_address::text != '{}'
  AND pickup_address::text != 'null'
  AND (pickup_address->>'city' IS NOT NULL OR pickup_address->>'address_line1' IS NOT NULL)
  AND bank_details IS NOT NULL
  AND bank_details::text != '{}'
  AND bank_details::text != 'null'
  AND (bank_details->>'account_number' IS NOT NULL OR bank_details->'bank'->>'account_number' IS NOT NULL);
