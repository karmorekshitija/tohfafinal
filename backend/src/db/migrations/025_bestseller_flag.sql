-- Migration 025: Bestseller Flag
-- Ensures real is_bestseller boolean column and partial index on active best sellers.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_bestseller'
  ) THEN
    ALTER TABLE products ADD COLUMN is_bestseller BOOLEAN DEFAULT FALSE;
  ELSE
    -- If it was previously an integer, cleanly cast to boolean
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'is_bestseller' AND data_type = 'integer'
    ) THEN
      ALTER TABLE products ALTER COLUMN is_bestseller DROP DEFAULT;
      ALTER TABLE products ALTER COLUMN is_bestseller TYPE BOOLEAN USING (CASE WHEN is_bestseller = 1 THEN TRUE ELSE FALSE END);
      ALTER TABLE products ALTER COLUMN is_bestseller SET DEFAULT FALSE;
    END IF;
  END IF;
END $$;

UPDATE products SET is_bestseller = FALSE WHERE is_bestseller IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_bestseller ON products(seller_id) WHERE is_bestseller = TRUE;
