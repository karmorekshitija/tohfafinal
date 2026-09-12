-- Migration 022: Fix missing orders/order_items columns
-- Description: Add columns that application code already references but were never
--              created in the database schema. All statements are idempotent
--              (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).

-- ── orders table ────────────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_ref TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS studio_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_paise BIGINT;

-- ── order_items table ────────────────────────────────────────────────────────
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price_paise BIGINT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name TEXT;

-- ── Unique index on orders.order_ref (partial, so existing NULLs don't conflict)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_ref
    ON orders(order_ref)
    WHERE order_ref IS NOT NULL;

-- ── Backfill existing rows ───────────────────────────────────────────────────
-- Generate a human-readable reference for every order that doesn't have one yet.
UPDATE orders
   SET order_ref = 'TOHFA-' || UPPER(SUBSTRING(id::text, 1, 8))
 WHERE order_ref IS NULL;

-- Convert total_amount (stored in rupees) to paise for orders that need it.
UPDATE orders
   SET total_paise = ROUND(total_amount * 100)
 WHERE total_paise IS NULL;

-- Convert unit_price (rupees) to paise for order_items that have a unit_price.
UPDATE order_items
   SET unit_price_paise = ROUND(unit_price * 100)
 WHERE unit_price_paise IS NULL
   AND unit_price IS NOT NULL;

-- studio_notes and order_items.variant_name are left NULL intentionally;
-- the application already uses COALESCE(..., '') wherever it reads them.
