-- Migration 040: Synchronize all boolean-like columns across tables to PostgreSQL native BOOLEAN
-- Eliminates mismatch between schema.sql (which declares BOOLEAN) and historical migrations (which created integer)
-- Fixes runtime errors: 'column "is_active" is of type boolean but expression is of type integer'
-- and 'column "is_customizable" is of type integer but expression is of type boolean'.

DO $$
BEGIN
  -- users.is_active
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_active' AND data_type != 'boolean') THEN
    ALTER TABLE users ALTER COLUMN is_active DROP DEFAULT;
    ALTER TABLE users ALTER COLUMN is_active TYPE BOOLEAN USING (CASE WHEN is_active::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE users ALTER COLUMN is_active SET DEFAULT TRUE;
  END IF;

  -- users.is_banned
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_banned' AND data_type != 'boolean') THEN
    ALTER TABLE users ALTER COLUMN is_banned DROP DEFAULT;
    ALTER TABLE users ALTER COLUMN is_banned TYPE BOOLEAN USING (CASE WHEN is_banned::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE users ALTER COLUMN is_banned SET DEFAULT FALSE;
  END IF;

  -- sellers.is_active
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sellers' AND column_name = 'is_active' AND data_type != 'boolean') THEN
    ALTER TABLE sellers ALTER COLUMN is_active DROP DEFAULT;
    ALTER TABLE sellers ALTER COLUMN is_active TYPE BOOLEAN USING (CASE WHEN is_active::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE sellers ALTER COLUMN is_active SET DEFAULT TRUE;
  END IF;

  -- sellers.is_approved
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sellers' AND column_name = 'is_approved' AND data_type != 'boolean') THEN
    ALTER TABLE sellers ALTER COLUMN is_approved DROP DEFAULT;
    ALTER TABLE sellers ALTER COLUMN is_approved TYPE BOOLEAN USING (CASE WHEN is_approved::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE sellers ALTER COLUMN is_approved SET DEFAULT FALSE;
  END IF;

  -- sellers.is_admin_managed
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sellers' AND column_name = 'is_admin_managed' AND data_type != 'boolean') THEN
    ALTER TABLE sellers ALTER COLUMN is_admin_managed DROP DEFAULT;
    ALTER TABLE sellers ALTER COLUMN is_admin_managed TYPE BOOLEAN USING (CASE WHEN is_admin_managed::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE sellers ALTER COLUMN is_admin_managed SET DEFAULT FALSE;
  END IF;

  -- sellers.is_tohfa_original
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sellers' AND column_name = 'is_tohfa_original' AND data_type != 'boolean') THEN
    ALTER TABLE sellers ALTER COLUMN is_tohfa_original DROP DEFAULT;
    ALTER TABLE sellers ALTER COLUMN is_tohfa_original TYPE BOOLEAN USING (CASE WHEN is_tohfa_original::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE sellers ALTER COLUMN is_tohfa_original SET DEFAULT FALSE;
  END IF;

  -- seller_profiles.is_active
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'seller_profiles' AND column_name = 'is_active' AND data_type != 'boolean') THEN
    ALTER TABLE seller_profiles ALTER COLUMN is_active DROP DEFAULT;
    ALTER TABLE seller_profiles ALTER COLUMN is_active TYPE BOOLEAN USING (CASE WHEN is_active::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE seller_profiles ALTER COLUMN is_active SET DEFAULT TRUE;
  END IF;

  -- seller_profiles.is_approved
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'seller_profiles' AND column_name = 'is_approved' AND data_type != 'boolean') THEN
    ALTER TABLE seller_profiles ALTER COLUMN is_approved DROP DEFAULT;
    ALTER TABLE seller_profiles ALTER COLUMN is_approved TYPE BOOLEAN USING (CASE WHEN is_approved::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE seller_profiles ALTER COLUMN is_approved SET DEFAULT FALSE;
  END IF;

  -- seller_profiles.is_admin_managed
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'seller_profiles' AND column_name = 'is_admin_managed' AND data_type != 'boolean') THEN
    ALTER TABLE seller_profiles ALTER COLUMN is_admin_managed DROP DEFAULT;
    ALTER TABLE seller_profiles ALTER COLUMN is_admin_managed TYPE BOOLEAN USING (CASE WHEN is_admin_managed::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE seller_profiles ALTER COLUMN is_admin_managed SET DEFAULT FALSE;
  END IF;

  -- seller_profiles.is_tohfa_original
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'seller_profiles' AND column_name = 'is_tohfa_original' AND data_type != 'boolean') THEN
    ALTER TABLE seller_profiles ALTER COLUMN is_tohfa_original DROP DEFAULT;
    ALTER TABLE seller_profiles ALTER COLUMN is_tohfa_original TYPE BOOLEAN USING (CASE WHEN is_tohfa_original::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE seller_profiles ALTER COLUMN is_tohfa_original SET DEFAULT FALSE;
  END IF;

  -- seller_profiles.is_accepting_orders
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'seller_profiles' AND column_name = 'is_accepting_orders' AND data_type != 'boolean') THEN
    ALTER TABLE seller_profiles ALTER COLUMN is_accepting_orders DROP DEFAULT;
    ALTER TABLE seller_profiles ALTER COLUMN is_accepting_orders TYPE BOOLEAN USING (CASE WHEN is_accepting_orders::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE seller_profiles ALTER COLUMN is_accepting_orders SET DEFAULT TRUE;
  END IF;

  -- products.is_active
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_active' AND data_type != 'boolean') THEN
    ALTER TABLE products ALTER COLUMN is_active DROP DEFAULT;
    ALTER TABLE products ALTER COLUMN is_active TYPE BOOLEAN USING (CASE WHEN is_active::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE products ALTER COLUMN is_active SET DEFAULT TRUE;
  END IF;

  -- products.is_customizable
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_customizable' AND data_type != 'boolean') THEN
    ALTER TABLE products ALTER COLUMN is_customizable DROP DEFAULT;
    ALTER TABLE products ALTER COLUMN is_customizable TYPE BOOLEAN USING (CASE WHEN is_customizable::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE products ALTER COLUMN is_customizable SET DEFAULT FALSE;
  END IF;

  -- products.is_sponsored
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_sponsored' AND data_type != 'boolean') THEN
    ALTER TABLE products ALTER COLUMN is_sponsored DROP DEFAULT;
    ALTER TABLE products ALTER COLUMN is_sponsored TYPE BOOLEAN USING (CASE WHEN is_sponsored::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE products ALTER COLUMN is_sponsored SET DEFAULT FALSE;
  END IF;

  -- products.is_tohfa_original
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_tohfa_original' AND data_type != 'boolean') THEN
    ALTER TABLE products ALTER COLUMN is_tohfa_original DROP DEFAULT;
    ALTER TABLE products ALTER COLUMN is_tohfa_original TYPE BOOLEAN USING (CASE WHEN is_tohfa_original::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE products ALTER COLUMN is_tohfa_original SET DEFAULT FALSE;
  END IF;

  -- products.discount_active
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'discount_active' AND data_type != 'boolean') THEN
    ALTER TABLE products ALTER COLUMN discount_active DROP DEFAULT;
    ALTER TABLE products ALTER COLUMN discount_active TYPE BOOLEAN USING (CASE WHEN discount_active::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
    ALTER TABLE products ALTER COLUMN discount_active SET DEFAULT FALSE;
  END IF;
END $$;

-- Ensure missing unique indexes exist
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_product_url ON product_images (product_id, url);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_occasion_tags_product_occ ON product_occasion_tags (product_id, occasion_slug);
