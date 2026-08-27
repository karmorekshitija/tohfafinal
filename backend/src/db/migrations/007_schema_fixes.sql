-- Migration: 007_schema_fixes.sql
-- Description: Add missing is_banned column to users and create product_views table

BEGIN;

-- 1. Add is_banned to users if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;

-- 2. Create product_views table for analytics
CREATE TABLE IF NOT EXISTS product_views (
    id SERIAL PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Fix wishlist added_at to use created_at standard
-- Wishlist controller uses added_at, but schema created created_at. 
-- We will rename it in the table or just rely on controller fixes. 
-- For safety, let's rename created_at to added_at in wishlist to match standard query if needed, 
-- but actually it's safer to just fix the controller.

COMMIT;
