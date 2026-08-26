-- =============================================================================
-- Migration: 005_tohfa_specials_and_admin_authority.sql
-- Description: Tohfa Specials Product Curation & Admin Governance Schema
-- =============================================================================

-- 1. Extend products table with Tohfa Specials curation fields
ALTER TABLE products
ADD COLUMN IF NOT EXISTS is_tohfa_original BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tohfa_special_badge VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS priority_rank INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS special_packaging_available BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_products_tohfa_original ON products(is_tohfa_original) WHERE is_tohfa_original = TRUE;

-- 2. Extend seller_profiles with commission_rate and verification_status
ALTER TABLE seller_profiles
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 10.00,
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'pending_verification';

-- Update verification_status based on existing is_approved if needed
UPDATE seller_profiles
SET verification_status = CASE 
  WHEN is_approved = TRUE THEN 'verified'
  WHEN rejection_reason IS NOT NULL THEN 'rejected'
  ELSE 'pending_verification'
END
WHERE verification_status IS NULL OR verification_status = 'pending_verification';

-- 3. Ensure audit_logs table has unified column support
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT,
  action TEXT,
  target_entity TEXT,
  target_type TEXT,
  target_id UUID,
  details JSONB DEFAULT '{}',
  meta JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure existing audit_logs columns if already created
DO $$
BEGIN
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action_type TEXT;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action TEXT;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_entity TEXT;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_type TEXT;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address INET;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- 4. Ensure seller_payouts table exists with required fields
CREATE TABLE IF NOT EXISTS seller_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending',
  utr_number TEXT,
  reference TEXT,
  disbursed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE seller_payouts ADD COLUMN IF NOT EXISTS utr_number TEXT;
  ALTER TABLE seller_payouts ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ;
  ALTER TABLE seller_payouts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_seller_payouts_status ON seller_payouts(status);
CREATE INDEX IF NOT EXISTS idx_seller_payouts_seller_id ON seller_payouts(seller_id);
