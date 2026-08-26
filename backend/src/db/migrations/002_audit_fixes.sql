-- =============================================================================
-- Migration: 002_audit_fixes.sql
-- Description: Audit fixes for database schema
-- 1. Add reset password token & expiration to users table
-- 2. Update reviews constraint to UNIQUE(buyer_id, product_id, order_id)
-- 3. Create refund_requests table
-- =============================================================================

-- 1. Users table updates
ALTER TABLE users
ADD COLUMN IF NOT EXISTS reset_password_token TEXT,
ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMPTZ;

-- 2. Reviews table constraint updates
DO $$
BEGIN
  -- Drop existing unique constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'reviews'::regclass AND contype = 'u' 
    AND conname = 'reviews_buyer_id_order_id_key'
  ) THEN
    ALTER TABLE reviews DROP CONSTRAINT reviews_buyer_id_order_id_key;
  END IF;
END $$;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_buyer_id_order_id_key;
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_buyer_id_product_id_order_id_key;
ALTER TABLE reviews ADD CONSTRAINT reviews_buyer_id_product_id_order_id_key UNIQUE (buyer_id, product_id, order_id);

-- 3. Create refund_requests table
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id),
  seller_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(10,2) NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  admin_notes TEXT,
  razorpay_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_order_id  ON refund_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_buyer_id  ON refund_requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_seller_id ON refund_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status    ON refund_requests(status);
