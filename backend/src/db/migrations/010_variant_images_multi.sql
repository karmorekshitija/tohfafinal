-- =============================================================================
-- Tohfa v2 — Migration 010: Multi-Image Support for Product Variants
-- File: backend/src/db/migrations/010_variant_images_multi.sql
-- =============================================================================

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS variant_name TEXT;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_name TEXT;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_hex CHAR(7);
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS additional_price NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
