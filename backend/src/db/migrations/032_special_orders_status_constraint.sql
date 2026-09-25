-- Migration 032: Special Orders schema sync and orders_status_check constraint update
-- Description: Adds is_special, shop_id, special_instructions, customization_details, order_number, admin_notes
--              columns to orders table, creates shops view, and updates orders_status_check constraint.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_special BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shop_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS special_instructions TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customization_details JSONB DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_notes TEXT;

CREATE OR REPLACE VIEW shops AS 
SELECT id, user_id, COALESCE(store_name, 'Special Store') AS shop_name, is_admin_managed AS is_special 
FROM seller_profiles;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (LOWER(status) IN ('pending', 'confirmed', 'processing', 'in_production', 'packed', 'shipped', 'dispatched', 'delivered', 'cancelled', 'cancel_requested', 'awaiting_payment'));
