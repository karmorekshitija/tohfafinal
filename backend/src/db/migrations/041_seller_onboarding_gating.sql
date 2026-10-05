-- Migration 041: Seller Studio Onboarding Tour & Billing/Banking Prerequisites
-- Ensures onboarding_tour_dismissed flag and billing_address columns exist on both sellers and seller_profiles.

DO $$
BEGIN
  -- sellers.onboarding_tour_dismissed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sellers' AND column_name = 'onboarding_tour_dismissed'
  ) THEN
    ALTER TABLE sellers ADD COLUMN onboarding_tour_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- seller_profiles.onboarding_tour_dismissed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'seller_profiles' AND column_name = 'onboarding_tour_dismissed'
  ) THEN
    ALTER TABLE seller_profiles ADD COLUMN onboarding_tour_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- sellers.billing_address
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sellers' AND column_name = 'billing_address'
  ) THEN
    ALTER TABLE sellers ADD COLUMN billing_address JSONB DEFAULT '{}';
  END IF;

  -- seller_profiles.billing_address
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'seller_profiles' AND column_name = 'billing_address'
  ) THEN
    ALTER TABLE seller_profiles ADD COLUMN billing_address JSONB DEFAULT '{}';
  END IF;
END $$;
