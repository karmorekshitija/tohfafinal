-- =============================================================================
-- Migration: 004_buyer_platform_fixes.sql
-- Description: Buyer platform and schema audit fixes
-- 1. Create coupons table
-- 2. Create bulk_inquiries table
-- 3. Create seller_followers table
-- 4. Extend products table with preparation_days and weight_grams
-- 5. Extend orders table with coupon_id, discount_amount, cancellation_reason
-- 6. Extend addresses table with landmark and address_type
-- =============================================================================

-- 1. Create coupons table
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  min_order_amount NUMERIC(10,2) DEFAULT 0.00,
  max_discount_amount NUMERIC(10,2),
  usage_limit_per_user INT DEFAULT 1,
  times_used INT DEFAULT 0,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON coupons(is_active);

-- 2. Create bulk_inquiries table
CREATE TABLE IF NOT EXISTS bulk_inquiries (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  budget_per_gift NUMERIC(10,2),
  quantity INT NOT NULL,
  occasion_type VARCHAR(100),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'fulfilled', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_inquiries_status ON bulk_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_bulk_inquiries_email  ON bulk_inquiries(email);

-- 3. Create seller_followers table
CREATE TABLE IF NOT EXISTS seller_followers (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, seller_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_followers_user_id   ON seller_followers(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_followers_seller_id ON seller_followers(seller_id);

-- 4. Products table extensions
ALTER TABLE products
ADD COLUMN IF NOT EXISTS preparation_days INT DEFAULT 2 CHECK (preparation_days >= 0),
ADD COLUMN IF NOT EXISTS weight_grams INT DEFAULT 500 CHECK (weight_grams > 0);

-- 5. Orders table extensions
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS coupon_id INT REFERENCES coupons(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- 6. Addresses table extensions
ALTER TABLE addresses
ADD COLUMN IF NOT EXISTS landmark TEXT,
ADD COLUMN IF NOT EXISTS address_type TEXT DEFAULT 'Home';
