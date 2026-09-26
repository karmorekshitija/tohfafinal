-- Migration 036: Add UNIQUE INDEX on product_images(product_id, url)
-- The uploadImages() function in product.controller.js uses:
--   ON CONFLICT (product_id, url) DO UPDATE SET sort_order = EXCLUDED.sort_order
-- This requires a UNIQUE constraint (or UNIQUE index) on the exact column pair
-- (product_id, url). Migration 024 added a normalized expression index (on the
-- URL stem), which does NOT satisfy ON CONFLICT (product_id, url).
-- This migration adds the missing simple UNIQUE index so that upsert works.

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_product_url
    ON product_images(product_id, url);
