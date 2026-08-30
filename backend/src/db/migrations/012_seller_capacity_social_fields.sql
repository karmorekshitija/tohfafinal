-- =============================================================================
-- Tohfa v2 — Migration 012: Seller Capacity & Social Fields + Schema Fixes
-- File: backend/src/db/migrations/012_seller_capacity_social_fields.sql
-- Run this against your Neon PostgreSQL database.
-- =============================================================================

-- 1. Add daily production capacity and Instagram fields to seller_profiles
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS daily_capacity_min   INT DEFAULT NULL;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS daily_capacity_max   INT DEFAULT NULL;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS instagram_handle     TEXT DEFAULT NULL;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS instagram_followers  TEXT DEFAULT NULL;

-- 2. Add the same fields to sellers (master table)
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS daily_capacity_min   INT DEFAULT NULL;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS daily_capacity_max   INT DEFAULT NULL;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS instagram_handle     TEXT DEFAULT NULL;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS instagram_followers  TEXT DEFAULT NULL;

-- 3. Ensure carts table exists (fixes "relation carts does not exist" error)
CREATE TABLE IF NOT EXISTS carts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON carts(user_id);

-- 4. Ensure cart_items table exists
CREATE TABLE IF NOT EXISTS cart_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id               UUID REFERENCES carts(id) ON DELETE CASCADE,
  buyer_id              UUID REFERENCES users(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id            UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity              INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  customization_payload JSONB DEFAULT '{}',
  customization_data    JSONB DEFAULT NULL,
  added_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id    ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_buyer_id   ON cart_items(buyer_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items(product_id);

-- Add conflict target for addToCart upsert (buyer_id + product_id + variant_id)
-- (only if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cart_items_buyer_id_product_id_variant_id_key'
  ) THEN
    ALTER TABLE cart_items ADD CONSTRAINT cart_items_buyer_id_product_id_variant_id_key
      UNIQUE (buyer_id, product_id, variant_id);
  END IF;
END $$;

-- 5. Ensure shop_name and store_slug exist in sellers (added by migrate_master_fix, may be missing)
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS shop_name   TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS store_slug  TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS pan_number  TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS gst_number  TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS portfolio_images TEXT[] DEFAULT '{}';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS applied_at  TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 10.00;

-- 6. Ensure shop_name and store_slug exist in seller_profiles too
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS shop_name   TEXT;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS store_slug  TEXT;

-- 7. Fix categories is_active data type consistency
-- (The migrate_master_fix.js uses is_active = 1 / is_active = 0 on a BOOLEAN column,
--  which in some Postgres setups fails. This cast ensures consistency.)
UPDATE categories SET is_active = TRUE  WHERE is_active::text = '1';
UPDATE categories SET is_active = FALSE WHERE is_active::text = '0';

-- 8. Add seller_type to sellers if it doesn't exist (currently only in seller_profiles)
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS seller_type TEXT DEFAULT 'regular'
  CHECK (seller_type IN ('regular', 'special'));

-- Done
