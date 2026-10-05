-- =============================================================================
-- Migration 042: Sync Customization Pipeline Schema and Types
-- Standardizes products customization columns and fixed_customization_options
-- =============================================================================

-- 1. Standardize products customization columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_customizable BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS customization_schema JSONB DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS customization_mode TEXT DEFAULT 'none';

UPDATE products SET is_customizable = FALSE WHERE is_customizable IS NULL;
UPDATE products SET customization_schema = '{}'::jsonb WHERE customization_schema IS NULL OR customization_schema::text = '';
UPDATE products SET customization_mode = 'none' WHERE customization_mode IS NULL OR customization_mode = '';

-- Ensure defaults
ALTER TABLE products ALTER COLUMN is_customizable SET DEFAULT FALSE;
ALTER TABLE products ALTER COLUMN customization_schema SET DEFAULT '{}'::jsonb;
ALTER TABLE products ALTER COLUMN customization_mode SET DEFAULT 'none';

-- 2. Standardize fixed_customization_options Table
CREATE TABLE IF NOT EXISTS fixed_customization_options (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  option_type TEXT NOT NULL DEFAULT 'text',
  label VARCHAR(255) NOT NULL DEFAULT '',
  choices JSONB DEFAULT '[]'::jsonb,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  max_length INTEGER DEFAULT NULL,
  price_modifier NUMERIC(10,2) DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all expected columns exist on fixed_customization_options
ALTER TABLE fixed_customization_options ADD COLUMN IF NOT EXISTS option_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE fixed_customization_options ADD COLUMN IF NOT EXISTS label VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE fixed_customization_options ADD COLUMN IF NOT EXISTS choices JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fixed_customization_options ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fixed_customization_options ADD COLUMN IF NOT EXISTS max_length INTEGER DEFAULT NULL;
ALTER TABLE fixed_customization_options ADD COLUMN IF NOT EXISTS price_modifier NUMERIC(10,2) DEFAULT 0;
ALTER TABLE fixed_customization_options ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fixed_customization_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add foreign key constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fixed_customization_options_product_id_fkey'
  ) THEN
    ALTER TABLE fixed_customization_options
    ADD CONSTRAINT fixed_customization_options_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fixed_customization_product_id ON fixed_customization_options(product_id);

-- 3. Helpful indexing for customized products querying
CREATE INDEX IF NOT EXISTS idx_products_is_customizable ON products(is_customizable) WHERE is_customizable = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_customization_mode ON products(customization_mode) WHERE customization_mode != 'none';
