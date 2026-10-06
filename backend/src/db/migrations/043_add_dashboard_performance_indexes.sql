-- Migration 043: Add missing indexes for seller dashboard and analytics performance
-- Covers WHERE and JOIN clauses on orders, seller_orders, and products

-- 1. Index orders(created_at DESC) for date-range filtered queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- 2. Index orders(seller_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_orders_seller_created_at ON orders(seller_id, created_at DESC);

-- 3. Index seller_orders(status) and seller_orders(created_at DESC)
CREATE INDEX IF NOT EXISTS idx_seller_orders_status ON seller_orders(status);
CREATE INDEX IF NOT EXISTS idx_seller_orders_created_at ON seller_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seller_orders_seller_created_at ON seller_orders(seller_id, created_at DESC);

-- 4. Index products(seller_id, status) and products(status)
CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
