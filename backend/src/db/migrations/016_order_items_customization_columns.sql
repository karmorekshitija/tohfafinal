-- Migration 016: Ensure order_items customization and pricing columns exist
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS proof_image_url TEXT,
ADD COLUMN IF NOT EXISTS customization_status TEXT,
ADD COLUMN IF NOT EXISTS customization_data JSONB,
ADD COLUMN IF NOT EXISTS unit_price NUMERIC;
