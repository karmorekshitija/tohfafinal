-- =============================================================================
-- Tohfa v2 — Migration 006: Master Audit Schema Synchronization
-- File: backend/src/db/migrations/006_master_audit_schema_sync.sql
-- Description: Synchronizes all 15 master tables, columns, constraints, and indices
--              according to Section 7 of TOHFA_COMBINED_CODEBASE_AND_AUTH_AUDIT_MASTER.md.
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. USERS & AUTH
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   VARCHAR(150) NOT NULL,
  email                  VARCHAR(255) UNIQUE NOT NULL,
  phone                  VARCHAR(20) UNIQUE,
  password_hash          VARCHAR(255) NOT NULL,
  role                   VARCHAR(20) DEFAULT 'buyer',
  is_active              BOOLEAN DEFAULT TRUE,
  reset_password_token   VARCHAR(255),
  reset_password_expires TIMESTAMP WITH TIME ZONE,
  profile_photo_url      TEXT,
  cover_photo_url        TEXT,
  full_name              TEXT,
  display_name           TEXT,
  created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure columns exist if table already created
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'buyer';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Backfill name from full_name or display_name if null
UPDATE users SET name = COALESCE(full_name, display_name, split_part(email, '@', 1)) WHERE name IS NULL;

-- Update role constraint if needed to include master_admin
DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('buyer', 'seller', 'admin', 'master_admin'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- =============================================================================
-- 2. BUYER SAVED ADDRESSES (user_addresses & addresses compatibility)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_addresses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  recipient_name VARCHAR(150) NOT NULL,
  phone          VARCHAR(20) NOT NULL,
  address_line1  TEXT NOT NULL,
  address_line2  TEXT,
  landmark       VARCHAR(150),
  city           VARCHAR(100) NOT NULL,
  state          VARCHAR(100) NOT NULL,
  pincode        VARCHAR(10) NOT NULL,
  address_type   VARCHAR(20) DEFAULT 'home',
  is_default     BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(150);
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS landmark VARCHAR(150);
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS pincode VARCHAR(10);
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS address_type VARCHAR(20) DEFAULT 'home';
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);

-- Also ensure addresses table has all compatible columns
CREATE TABLE IF NOT EXISTS addresses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label          TEXT DEFAULT 'Home',
  name           TEXT NOT NULL,
  recipient_name TEXT,
  phone          TEXT NOT NULL,
  line1          TEXT NOT NULL,
  address_line1  TEXT,
  line2          TEXT,
  address_line2  TEXT,
  landmark       TEXT,
  city           TEXT NOT NULL,
  state          TEXT NOT NULL,
  pincode        TEXT NOT NULL,
  address_type   TEXT DEFAULT 'Home',
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE addresses ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS landmark TEXT;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS address_type TEXT DEFAULT 'Home';

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

-- =============================================================================
-- 3. SELLERS & ARTISAN PROFILES (sellers & seller_profiles)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sellers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  store_name          VARCHAR(200) NOT NULL,
  slug                VARCHAR(200) UNIQUE NOT NULL,
  bio                 TEXT,
  logo_url            TEXT,
  banner_url          TEXT,
  pickup_address      JSONB NOT NULL DEFAULT '{}',
  bank_details        JSONB DEFAULT '{}',
  commission_rate     NUMERIC(5,2) DEFAULT 10.00,
  verification_status VARCHAR(50) DEFAULT 'pending_verification',
  is_active           BOOLEAN DEFAULT TRUE,
  is_approved         BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS store_name VARCHAR(200);
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS slug VARCHAR(200);
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS pickup_address JSONB DEFAULT '{}';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT '{}';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 10.00;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'pending_verification';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sellers_user_id ON sellers(user_id);
CREATE INDEX IF NOT EXISTS idx_sellers_slug ON sellers(slug);
CREATE INDEX IF NOT EXISTS idx_sellers_verification_status ON sellers(verification_status);

-- Also synchronize seller_profiles table
CREATE TABLE IF NOT EXISTS seller_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  store_name          TEXT NOT NULL,
  slug                TEXT,
  bio                 TEXT,
  logo_url            TEXT,
  banner_url          TEXT,
  whatsapp_number     TEXT,
  seller_type         TEXT DEFAULT 'regular',
  capacity_limit      INTEGER DEFAULT 50,
  vacation_mode       BOOLEAN NOT NULL DEFAULT FALSE,
  shipping_presets    JSONB DEFAULT '[]',
  pickup_address      JSONB DEFAULT '{}',
  bank_details        JSONB DEFAULT '{}',
  store_visibility    BOOLEAN NOT NULL DEFAULT TRUE,
  is_approved         BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status TEXT DEFAULT 'pending_verification',
  commission_rate     NUMERIC(5,2) DEFAULT 10.00,
  is_active           BOOLEAN DEFAULT TRUE,
  is_tohfa_original   BOOLEAN NOT NULL DEFAULT FALSE,
  rejection_reason    TEXT,
  applied_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT '{}';
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 10.00;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending_verification';

CREATE INDEX IF NOT EXISTS idx_seller_profiles_user_id ON seller_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_verification_status ON seller_profiles(verification_status);

-- =============================================================================
-- 4. CATEGORIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  image_url   TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  parent_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);

-- =============================================================================
-- 5. PRODUCTS & PERSONALIZATION RULES
-- =============================================================================
CREATE TABLE IF NOT EXISTS products (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id                 UUID REFERENCES categories(id) ON DELETE RESTRICT,
  name                        VARCHAR(255) NOT NULL,
  slug                        VARCHAR(255) UNIQUE,
  description                 TEXT,
  base_price                  NUMERIC(10,2) NOT NULL,
  stock_quantity              INT DEFAULT 0,
  preparation_days            INT DEFAULT 2 CHECK (preparation_days >= 0),
  weight_grams                INT DEFAULT 500 CHECK (weight_grams > 0),
  is_customizable             BOOLEAN DEFAULT FALSE,
  customization_schema        JSONB DEFAULT '{}',
  customization_mode          TEXT DEFAULT 'none',
  images                      TEXT[] NOT NULL DEFAULT '{}',
  is_active                   BOOLEAN DEFAULT TRUE,
  status                      TEXT DEFAULT 'active',
  is_tohfa_original           BOOLEAN DEFAULT FALSE,
  tohfa_special_badge         VARCHAR(100) DEFAULT NULL,
  priority_rank               INT DEFAULT 0,
  special_packaging_available BOOLEAN DEFAULT TRUE,
  low_stock_threshold         INT DEFAULT 3,
  view_count                  INT DEFAULT 0,
  is_sponsored                BOOLEAN DEFAULT FALSE,
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS preparation_days INT DEFAULT 2;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_grams INT DEFAULT 500;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_customizable BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS customization_schema JSONB DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_tohfa_original BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tohfa_special_badge VARCHAR(100) DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS priority_rank INT DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS special_packaging_available BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_tohfa_original ON products(is_tohfa_original) WHERE is_tohfa_original = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_priority_rank ON products(priority_rank DESC);

-- Ensure product_variants columns exist
CREATE TABLE IF NOT EXISTS product_variants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_name     TEXT,
  color_name       TEXT,
  color_hex        CHAR(7),
  size             TEXT,
  additional_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock_qty        INTEGER NOT NULL DEFAULT 0,
  image_url        TEXT,
  images           TEXT[] DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS variant_name TEXT;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);

-- =============================================================================
-- 6. PERSISTENT SHOPPING CARTS & CART ITEMS
-- =============================================================================
CREATE TABLE IF NOT EXISTS carts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carts_user_id ON carts(user_id);

CREATE TABLE IF NOT EXISTS cart_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id               UUID REFERENCES carts(id) ON DELETE CASCADE,
  buyer_id              UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id            UUID,
  quantity              INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  customization_payload JSONB DEFAULT '{}',
  customization_data    JSONB DEFAULT NULL,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS cart_id UUID REFERENCES carts(id) ON DELETE CASCADE;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS customization_payload JSONB DEFAULT '{}';
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS customization_data JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_buyer_id ON cart_items(buyer_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items(product_id);

-- =============================================================================
-- 7. COUPONS & PROMOTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS coupons (
  id                   SERIAL PRIMARY KEY,
  code                 VARCHAR(50) UNIQUE NOT NULL,
  discount_type        VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  discount_value       NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  min_order_amount     NUMERIC(10,2) DEFAULT 0.00,
  max_discount_amount  NUMERIC(10,2),
  usage_limit_per_user INT DEFAULT 1,
  times_used           INT DEFAULT 0,
  starts_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at           TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active            BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON coupons(is_active);

-- =============================================================================
-- 8. PARENT ORDERS (Payment & Invoice Level)
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE RESTRICT,
  buyer_id            UUID REFERENCES users(id) ON DELETE RESTRICT,
  seller_id           UUID REFERENCES users(id),
  total_amount        NUMERIC(10,2) NOT NULL,
  discount_amount     NUMERIC(10,2) DEFAULT 0.00,
  shipping_amount     NUMERIC(10,2) DEFAULT 0.00,
  coupon_id           INT REFERENCES coupons(id) ON DELETE SET NULL,
  payment_method      VARCHAR(50) DEFAULT 'razorpay',
  payment_status      VARCHAR(50) DEFAULT 'pending',
  payment_id          VARCHAR(100),
  razorpay_order_id   VARCHAR(100),
  shipping_address    JSONB DEFAULT '{}',
  cancellation_reason TEXT,
  status              VARCHAR(50) DEFAULT 'pending',
  payout_status       VARCHAR(50) DEFAULT 'pending',
  delivered_at        TIMESTAMP WITH TIME ZONE,
  tracking_id         TEXT,
  tracking_url        TEXT,
  notes               TEXT,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id INT REFERENCES coupons(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'razorpay';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_id VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address JSONB DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- =============================================================================
-- 9. SELLER SUB-ORDERS (Multi-Vendor Fulfillment Level)
-- =============================================================================
CREATE TABLE IF NOT EXISTS seller_orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID REFERENCES orders(id) ON DELETE CASCADE,
  seller_id            UUID REFERENCES users(id) ON DELETE RESTRICT,
  subtotal             NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  shipping_fee         NUMERIC(10,2) DEFAULT 0.00,
  platform_commission  NUMERIC(10,2) DEFAULT 0.00,
  seller_payout_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status               VARCHAR(50) DEFAULT 'order_placed',
  awb_number           VARCHAR(100),
  courier_name         VARCHAR(100),
  tracking_url         TEXT,
  payout_status        VARCHAR(50) DEFAULT 'unsettled',
  delivered_at         TIMESTAMP WITH TIME ZONE,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS platform_commission NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS seller_payout_amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'order_placed';
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS awb_number VARCHAR(100);
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS courier_name VARCHAR(100);
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS payout_status VARCHAR(50) DEFAULT 'unsettled';
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_seller_orders_order_id ON seller_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_seller_orders_seller_id ON seller_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_orders_status ON seller_orders(status);

-- =============================================================================
-- 10. ORDER ITEMS & CUSTOMIZATION SNAPSHOT
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID REFERENCES orders(id) ON DELETE CASCADE,
  seller_order_id       UUID REFERENCES seller_orders(id) ON DELETE CASCADE,
  product_id            UUID REFERENCES products(id) ON DELETE RESTRICT,
  variant_id            UUID,
  quantity              INT NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(10,2) NOT NULL,
  customization_details JSONB DEFAULT '{}',
  customization_data    JSONB DEFAULT NULL,
  customization_status  VARCHAR(50) DEFAULT 'none',
  proof_image_url       TEXT,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS seller_order_id UUID REFERENCES seller_orders(id) ON DELETE CASCADE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customization_details JSONB DEFAULT '{}';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customization_data JSONB DEFAULT NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customization_status VARCHAR(50) DEFAULT 'none';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS proof_image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller_order_id ON order_items(seller_order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- =============================================================================
-- 11. OCCASIONS & REMINDERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS occasions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES users(id) ON DELETE CASCADE,
  title                VARCHAR(150),
  label                TEXT,
  recipient_name       VARCHAR(150),
  person_name          TEXT,
  occasion_date        DATE NOT NULL,
  reminder_days_before INT DEFAULT 7,
  reminder_sent_1m     BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_sent_2w     BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_sent_1w     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE occasions ADD COLUMN IF NOT EXISTS title VARCHAR(150);
ALTER TABLE occasions ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(150);
ALTER TABLE occasions ADD COLUMN IF NOT EXISTS reminder_days_before INT DEFAULT 7;
ALTER TABLE occasions ADD COLUMN IF NOT EXISTS reminder_sent_1m BOOLEAN DEFAULT FALSE;
ALTER TABLE occasions ADD COLUMN IF NOT EXISTS reminder_sent_2w BOOLEAN DEFAULT FALSE;
ALTER TABLE occasions ADD COLUMN IF NOT EXISTS reminder_sent_1w BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_occasions_user_id ON occasions(user_id);
CREATE INDEX IF NOT EXISTS idx_occasions_occasion_date ON occasions(occasion_date);

-- =============================================================================
-- 12. WISHLISTS & WISHLIST
-- =============================================================================
CREATE TABLE IF NOT EXISTS wishlists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  buyer_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE wishlists ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE wishlists ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS wishlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE wishlist ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE wishlist ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product_id ON wishlists(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_buyer_id ON wishlist(buyer_id);

-- =============================================================================
-- 13. REVIEWS & RATINGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES users(id) ON DELETE CASCADE,
  buyer_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  seller_id          UUID REFERENCES users(id),
  order_id           UUID REFERENCES orders(id),
  rating             INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment            TEXT,
  images             TEXT[] DEFAULT '{}',
  seller_reply       TEXT,
  seller_replied_at  TIMESTAMP WITH TIME ZONE,
  replied_at         TIMESTAMP WITH TIME ZONE,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS seller_reply TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS seller_replied_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_seller_id ON reviews(seller_id);

-- =============================================================================
-- 14. SELLER PAYOUTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS seller_payouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount       NUMERIC(10,2) NOT NULL,
  status       VARCHAR(50) DEFAULT 'pending',
  utr_number   VARCHAR(100),
  reference    TEXT,
  disbursed_at TIMESTAMP WITH TIME ZONE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE seller_payouts ADD COLUMN IF NOT EXISTS utr_number VARCHAR(100);
ALTER TABLE seller_payouts ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE seller_payouts ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE seller_payouts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_seller_payouts_seller_id ON seller_payouts(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_payouts_status ON seller_payouts(status);

-- =============================================================================
-- 15. IMMUTABLE AUDIT LOGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type   VARCHAR(100),
  action        VARCHAR(100),
  target_entity VARCHAR(100),
  target_type   VARCHAR(100),
  target_id     VARCHAR(100),
  details       JSONB DEFAULT '{}',
  meta          JSONB DEFAULT '{}',
  ip_address    VARCHAR(50),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action_type VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_entity VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_type VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_id VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- =============================================================================
-- 16. SELLER FOLLOWERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS seller_followers (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, seller_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_followers_user_id   ON seller_followers(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_followers_seller_id ON seller_followers(seller_id);

