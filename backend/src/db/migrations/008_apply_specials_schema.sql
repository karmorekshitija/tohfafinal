-- Migration 008: Schema sync for Tohfa Specials and product fields

-- 1. Ensure columns exist on products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS preparation_days INT DEFAULT 2;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_grams INT DEFAULT 500;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_customizable BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS customization_schema JSONB DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tohfa_special_badge VARCHAR(100) DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS priority_rank INT DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS special_packaging_available BOOLEAN DEFAULT TRUE;

-- Convert is_tohfa_original to BOOLEAN if it is integer
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'is_tohfa_original' AND data_type = 'integer'
  ) THEN
    ALTER TABLE products ALTER COLUMN is_tohfa_original DROP DEFAULT;
    ALTER TABLE products ALTER COLUMN is_tohfa_original TYPE BOOLEAN USING (is_tohfa_original = 1);
    ALTER TABLE products ALTER COLUMN is_tohfa_original SET DEFAULT FALSE;
  ELSE
    ALTER TABLE products ADD COLUMN IF NOT EXISTS is_tohfa_original BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 2. Ensure seller_profiles has is_tohfa_original as BOOLEAN
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'seller_profiles' AND column_name = 'is_tohfa_original' AND data_type = 'integer'
  ) THEN
    ALTER TABLE seller_profiles ALTER COLUMN is_tohfa_original DROP DEFAULT;
    ALTER TABLE seller_profiles ALTER COLUMN is_tohfa_original TYPE BOOLEAN USING (is_tohfa_original = 1);
    ALTER TABLE seller_profiles ALTER COLUMN is_tohfa_original SET DEFAULT FALSE;
  ELSE
    ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS is_tohfa_original BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 3. Ensure product_views table exists for recommendation feeds
CREATE TABLE IF NOT EXISTS product_views (
  id SERIAL PRIMARY KEY,
  product_id INT,
  user_id INT,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_is_tohfa_original ON products(is_tohfa_original);
CREATE INDEX IF NOT EXISTS idx_products_priority_rank ON products(priority_rank DESC);
