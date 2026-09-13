-- Migration 022: repair nullable cart uniqueness and protect product image URLs.
-- Existing duplicate rows must be reconciled before these indexes can be created.

ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_buyer_id_product_id_variant_id_key;

-- Merge duplicate cart rows deterministically before enforcing uniqueness.
WITH ranked AS (
  SELECT id,
         FIRST_VALUE(id) OVER (
           PARTITION BY buyer_id, product_id, variant_id
           ORDER BY created_at NULLS LAST, id
         ) AS keeper_id,
         ROW_NUMBER() OVER (
           PARTITION BY buyer_id, product_id, variant_id
           ORDER BY created_at NULLS LAST, id
         ) AS row_number
  FROM cart_items
),
totals AS (
  SELECT keeper_id, SUM(ci.quantity) AS extra_quantity
  FROM ranked r
  JOIN cart_items ci ON ci.id = r.id
  WHERE r.row_number > 1
  GROUP BY keeper_id
)
UPDATE cart_items keeper
SET quantity = keeper.quantity + totals.extra_quantity
FROM totals
WHERE keeper.id = totals.keeper_id;

DELETE FROM cart_items duplicate
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY buyer_id, product_id, variant_id
           ORDER BY created_at NULLS LAST, id
         ) AS row_number
  FROM cart_items
) ranked
WHERE duplicate.id = ranked.id
  AND ranked.row_number > 1;

-- Keep the earliest product image row for each exact product/URL pair.
DELETE FROM product_images duplicate
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY product_id, url
           ORDER BY sort_order, created_at, id
         ) AS row_number
  FROM product_images
) ranked
WHERE duplicate.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items_buyer_product_no_variant
  ON cart_items (buyer_id, product_id)
  WHERE variant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items_buyer_product_variant
  ON cart_items (buyer_id, product_id, variant_id)
  WHERE variant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_product_url
  ON product_images (product_id, url);
