-- =============================================================================
-- Tohfa v2 — PostgreSQL Master Database Schema
-- File: backend/src/db/schema.sql
-- DB:   Neon PostgreSQL / PostgreSQL 14+
-- Conforms to Section 7 of TOHFA_COMBINED_CODEBASE_AND_AUTH_AUDIT_MASTER.md
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. USERS & AUTH
-- Buyers, Sellers, Admins, and Master Admins all share this table.
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   VARCHAR(150) NOT NULL,
  email                  VARCHAR(255) UNIQUE NOT NULL,
  phone                  VARCHAR(20) UNIQUE,
  password_hash          VARCHAR(255) NOT NULL,
  role                   VARCHAR(20) DEFAULT 'buyer' CHECK (role IN ('buyer', 'seller', 'admin', 'master_admin')),
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

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- =============================================================================
-- REFRESH TOKENS (Session security)
-- =============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- =============================================================================
-- 2. BUYER SAVED ADDRESSES
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
  address_type   VARCHAR(20) DEFAULT 'home' CHECK (address_type IN ('home', 'office', 'other', 'Home', 'Office', 'Other')),
  is_default     BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);

-- Backward-compatible addresses table
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

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

-- =============================================================================
-- 3. SELLERS & ARTISAN PROFILES
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
  verification_status VARCHAR(50) DEFAULT 'pending_verification' CHECK (verification_status IN ('pending_verification', 'verified', 'rejected', 'suspended')),
  is_active           BOOLEAN DEFAULT TRUE,
  is_approved         BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sellers_user_id ON sellers(user_id);
CREATE INDEX IF NOT EXISTS idx_sellers_slug ON sellers(slug);
CREATE INDEX IF NOT EXISTS idx_sellers_verification_status ON sellers(verification_status);

-- Backward-compatible seller_profiles table
CREATE TABLE IF NOT EXISTS seller_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  store_name          TEXT NOT NULL,
  slug                TEXT,
  bio                 TEXT,
  logo_url            TEXT,
  banner_url          TEXT,
  whatsapp_number     TEXT,
  seller_type         TEXT NOT NULL CHECK (seller_type IN ('regular', 'special')) DEFAULT 'regular',
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

CREATE INDEX IF NOT EXISTS idx_seller_profiles_user_id             ON seller_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_is_approved         ON seller_profiles(is_approved);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_verification_status ON seller_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_seller_type         ON seller_profiles(seller_type);

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

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
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
  base_price                  NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
  stock_quantity              INT DEFAULT 0 CHECK (stock_quantity >= 0),
  preparation_days            INT DEFAULT 2 CHECK (preparation_days >= 0),
  weight_grams                INT DEFAULT 500 CHECK (weight_grams > 0),
  is_customizable             BOOLEAN DEFAULT FALSE,
  customization_schema        JSONB DEFAULT '{}',
  customization_mode          TEXT NOT NULL CHECK (customization_mode IN ('none', 'fixed', 'open')) DEFAULT 'none',
  images                      TEXT[] NOT NULL DEFAULT '{}',
  is_active                   BOOLEAN DEFAULT TRUE,
  status                      TEXT NOT NULL CHECK (status IN ('active', 'paused', 'deleted')) DEFAULT 'active',
  is_tohfa_original           BOOLEAN DEFAULT FALSE,
  tohfa_special_badge         VARCHAR(100) DEFAULT NULL,
  priority_rank               INT DEFAULT 0,
  special_packaging_available BOOLEAN DEFAULT TRUE,
  low_stock_threshold         INT DEFAULT 3 CHECK (low_stock_threshold >= 0),
  view_count                  INT DEFAULT 0,
  is_sponsored                BOOLEAN DEFAULT FALSE,
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_seller_id        ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id     ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status           ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_is_sponsored     ON products(is_sponsored);
CREATE INDEX IF NOT EXISTS idx_products_tohfa_original   ON products(is_tohfa_original) WHERE is_tohfa_original = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_priority_rank    ON products(priority_rank DESC);

-- Full-text search index on product name + description
CREATE INDEX IF NOT EXISTS idx_products_fts ON products
  USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- =============================================================================
-- PRODUCT IMAGES & VARIANTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);

CREATE TABLE IF NOT EXISTS product_variants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_name       TEXT,
  color_hex        CHAR(7),
  size             TEXT,
  additional_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock_qty        INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);

-- =============================================================================
-- CUSTOMIZATION CONFIGURATIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS fixed_customization_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_type TEXT NOT NULL,
  label       TEXT NOT NULL,
  choices     JSONB DEFAULT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  max_length  INTEGER,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fixed_customization_product_id ON fixed_customization_options(product_id);

CREATE TABLE IF NOT EXISTS open_customization_configs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  allowed_types       JSONB NOT NULL DEFAULT '[]',
  instructions        TEXT,
  ref_image_mode      TEXT NOT NULL CHECK (ref_image_mode IN ('required','optional','na')) DEFAULT 'optional',
  budget_min          NUMERIC(10,2),
  budget_max          NUMERIC(10,2),
  turnaround_days     TEXT,
  quote_window_hours  INTEGER NOT NULL DEFAULT 48,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  variant_id            UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity              INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  customization_payload JSONB DEFAULT '{}',
  customization_data    JSONB DEFAULT NULL,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
  address_id          UUID REFERENCES addresses(id) ON DELETE SET NULL,
  total_amount        NUMERIC(10,2) NOT NULL,
  discount_amount     NUMERIC(10,2) DEFAULT 0.00,
  shipping_amount     NUMERIC(10,2) DEFAULT 0.00,
  coupon_id           INT REFERENCES coupons(id) ON DELETE SET NULL,
  payment_method      VARCHAR(50) DEFAULT 'razorpay',
  payment_status      VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'unpaid')),
  payment_id          VARCHAR(100),
  razorpay_order_id   VARCHAR(100),
  shipping_address    JSONB NOT NULL DEFAULT '{}',
  cancellation_reason TEXT,
  status              TEXT NOT NULL CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled','cancel_requested','processing','packed')) DEFAULT 'pending',
  payout_status       TEXT NOT NULL CHECK (payout_status IN ('pending','holding','eligible','completed','unsettled','paid')) DEFAULT 'pending',
  delivered_at        TIMESTAMPTZ,
  tracking_id         TEXT,
  tracking_url        TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id   ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id  ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(status);
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
  status               VARCHAR(50) DEFAULT 'order_placed' CHECK (status IN ('order_placed', 'crafting', 'packed', 'shipped', 'delivered', 'cancelled', 'returned', 'pending', 'confirmed', 'processing')),
  awb_number           VARCHAR(100),
  courier_name         VARCHAR(100),
  tracking_url         TEXT,
  payout_status        VARCHAR(50) DEFAULT 'unsettled' CHECK (payout_status IN ('unsettled', 'holding', 'eligible', 'paid', 'completed', 'pending')),
  delivered_at         TIMESTAMP WITH TIME ZONE,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_orders_order_id  ON seller_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_seller_orders_seller_id ON seller_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_orders_status    ON seller_orders(status);

-- =============================================================================
-- 10. ORDER ITEMS & CUSTOMIZATION SNAPSHOT
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID REFERENCES orders(id) ON DELETE CASCADE,
  seller_order_id       UUID REFERENCES seller_orders(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id            UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity              INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price            NUMERIC(10,2) NOT NULL,
  customization_details JSONB DEFAULT '{}',
  customization_data    JSONB DEFAULT NULL,
  customization_status  VARCHAR(50) DEFAULT 'none' CHECK (customization_status IN ('none', 'pending', 'pending_proof', 'proof_uploaded', 'buyer_approved', 'in_crafting')),
  proof_image_url       TEXT,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id        ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller_order_id ON order_items(seller_order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id      ON order_items(product_id);

-- =============================================================================
-- 11. OCCASIONS & REMINDERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS occasions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                VARCHAR(150),
  label                TEXT,
  recipient_name       VARCHAR(150),
  person_name          TEXT,
  occasion_date        DATE NOT NULL,
  reminder_days_before INT DEFAULT 7,
  reminder_sent_1m     BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_sent_2w     BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_sent_1w     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_occasions_user_id       ON occasions(user_id);
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

CREATE TABLE IF NOT EXISTS wishlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user_id   ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product_id ON wishlists(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_buyer_id    ON wishlist(buyer_id);

-- =============================================================================
-- 13. REVIEWS & RATINGS (Verified Purchases)
-- =============================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES users(id) ON DELETE CASCADE,
  buyer_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  seller_id          UUID REFERENCES users(id),
  order_id           UUID REFERENCES orders(id),
  rating             SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment            TEXT,
  images             TEXT[] DEFAULT '{}',
  seller_reply       TEXT,
  seller_replied_at  TIMESTAMP WITH TIME ZONE,
  replied_at         TIMESTAMP WITH TIME ZONE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id    ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_seller_id  ON reviews(seller_id);

-- =============================================================================
-- 14. SELLER PAYOUTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS seller_payouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount       NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  status       VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'scheduled', 'completed')),
  utr_number   VARCHAR(100),
  reference    TEXT,
  disbursed_at TIMESTAMP WITH TIME ZONE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_payouts_seller_id ON seller_payouts(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_payouts_status    ON seller_payouts(status);

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

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id    ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id    ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs(created_at DESC);

-- =============================================================================
-- SUPPORT TABLES: Payments, Customization Requests, Notifications, etc.
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  razorpay_order_id    TEXT UNIQUE,
  razorpay_payment_id  TEXT UNIQUE,
  razorpay_signature   TEXT,
  amount               NUMERIC(10,2) NOT NULL,
  status               TEXT NOT NULL CHECK (status IN ('created','paid','failed','refunded')) DEFAULT 'created',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

CREATE TABLE IF NOT EXISTS refund_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id           UUID NOT NULL REFERENCES users(id),
  seller_id          UUID NOT NULL REFERENCES users(id),
  amount             NUMERIC(10,2) NOT NULL,
  reason             TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  admin_notes        TEXT,
  razorpay_refund_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_order_id  ON refund_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_buyer_id  ON refund_requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_seller_id ON refund_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status    ON refund_requests(status);

CREATE TABLE IF NOT EXISTS customization_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id          UUID NOT NULL REFERENCES users(id),
  seller_id         UUID NOT NULL REFERENCES users(id),
  product_id        UUID NOT NULL REFERENCES products(id),
  requirements      JSONB NOT NULL DEFAULT '{}',
  ref_images        JSONB DEFAULT '[]',
  budget            NUMERIC(10,2),
  deadline          DATE,
  status            TEXT NOT NULL CHECK (status IN ('requested','quoted','paid','in_progress','shipped','delivered','expired')) DEFAULT 'requested',
  quote_amount      NUMERIC(10,2),
  quote_turnaround  TEXT,
  quote_expires_at  TIMESTAMPTZ,
  order_id          UUID REFERENCES orders(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customization_requests_buyer_id  ON customization_requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_customization_requests_seller_id ON customization_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_customization_requests_status    ON customization_requests(status);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  meta       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read    ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

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

CREATE TABLE IF NOT EXISTS seller_followers (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, seller_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_followers_user_id   ON seller_followers(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_followers_seller_id ON seller_followers(seller_id);

CREATE TABLE IF NOT EXISTS banners (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url  TEXT NOT NULL,
  link_url   TEXT,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  alt_text   TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'seller_profiles', 'products',
    'open_customization_configs', 'orders', 'customization_requests', 'payments', 'seller_payouts'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      t, t, t, t
    );
  END LOOP;
END;
$$;
