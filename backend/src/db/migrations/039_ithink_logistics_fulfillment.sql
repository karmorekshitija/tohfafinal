-- Migration: 039_ithink_logistics_fulfillment.sql
-- Description: Additive columns for iThink Logistics fulfillment and manual tracking safety
-- Hard rule: Additive & idempotent only. Never drop or modify existing columns.

-- 1. Ensure tracking, courier and fulfillment status columns exist on orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_status VARCHAR(50) DEFAULT 'unbooked';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_error TEXT;

-- 2. Ensure seller_orders tracking and audit columns exist
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS courier_name VARCHAR(100);
ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Idempotent indexes for tracking lookups
CREATE INDEX IF NOT EXISTS idx_orders_tracking_id ON orders(tracking_id);
CREATE INDEX IF NOT EXISTS idx_orders_shipment_status ON orders(shipment_status);
CREATE INDEX IF NOT EXISTS idx_seller_orders_awb_number ON seller_orders(awb_number);
