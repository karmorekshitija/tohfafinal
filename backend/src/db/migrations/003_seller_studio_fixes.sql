-- =============================================================================
-- Migration: 003_seller_studio_fixes.sql
-- Description: Seller Studio database fixes and extensions
-- 1. Add customization_schema to products table
-- 2. Add proof_image_url and customization_status to order_items table
-- 3. Add seller_reply and replied_at to reviews table
-- 4. Create seller_payouts table
-- =============================================================================

-- 1. Products table extensions
ALTER TABLE products
ADD COLUMN IF NOT EXISTS customization_schema JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_customizable BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_tohfa_original BOOLEAN DEFAULT FALSE;

-- 2. Order items table extensions (Customization proof-of-work)
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS proof_image_url TEXT,
ADD COLUMN IF NOT EXISTS customization_status TEXT DEFAULT 'pending';

-- 3. Reviews table extensions (Artisan reply to review)
ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS seller_reply TEXT,
ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

-- 4. Ensure seller_payouts table exists
CREATE TABLE IF NOT EXISTS seller_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  utr_number TEXT,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_payouts_seller_id ON seller_payouts(seller_id);
