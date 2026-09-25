-- Migration: 030_seller_subscription_plans.sql
-- Description: Adds subscription tiers (Basic, Pro, Max) and audit payments table for Tohfa Sellers

-- 1. Add subscription columns to sellers table
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(20) DEFAULT 'basic';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_price_paid NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_renews_at TIMESTAMPTZ;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_discount_used BOOLEAN DEFAULT FALSE;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_updated_by VARCHAR(50) DEFAULT 'system';

-- 2. Add matching subscription columns to seller_profiles table
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(20) DEFAULT 'basic';
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active';
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_price_paid NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_renews_at TIMESTAMPTZ;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_discount_used BOOLEAN DEFAULT FALSE;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_updated_by VARCHAR(50) DEFAULT 'system';

-- 3. Create subscription_payments audit log table
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(20) NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) DEFAULT 'INR',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'created',
  discount_applied BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  renews_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_subscription_payments_user_id ON subscription_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_order_id ON subscription_payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_plan ON subscription_payments(plan);
CREATE INDEX IF NOT EXISTS idx_sellers_subscription_plan ON sellers(subscription_plan);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_subscription_plan ON seller_profiles(subscription_plan);
