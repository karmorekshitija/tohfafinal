-- Migration 022: Cart uniqueness fix and image integrity

-- 1. Deduplicate product images based on URL
DELETE FROM product_images
WHERE id IN (
  SELECT id
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY product_id, url ORDER BY created_at DESC) as rn
    FROM product_images
  ) t
  WHERE t.rn > 1
);

-- Ensure a unique index on product_images
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_unique_url ON product_images (product_id, url);

-- 2. Cart items UNIQUE constraint handling
DELETE FROM cart_items
WHERE id IN (
  SELECT id
  FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY buyer_id, cart_id, product_id, COALESCE(variant_id, -1)
      ORDER BY updated_at DESC
    ) as rn
    FROM cart_items
  ) t
  WHERE t.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_buyer_prod_var
  ON cart_items (buyer_id, product_id, variant_id)
  WHERE buyer_id IS NOT NULL AND variant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_buyer_prod_null_var
  ON cart_items (buyer_id, product_id)
  WHERE buyer_id IS NOT NULL AND variant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_prod_var
  ON cart_items (cart_id, product_id, variant_id)
  WHERE cart_id IS NOT NULL AND variant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_prod_null_var
  ON cart_items (cart_id, product_id)
  WHERE cart_id IS NOT NULL AND variant_id IS NULL;
