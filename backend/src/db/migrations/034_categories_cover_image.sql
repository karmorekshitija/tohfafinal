-- Migration 034: Add cover_image column to categories table
-- The application code (admin.controller.js, product.controller.js) references
-- categories.cover_image in both SELECT and UPDATE statements, but the column was
-- never added to the schema. This caused a PostgreSQL error on every category
-- image update, and NULL image_url on every buyer-facing category list fetch.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS cover_image TEXT;

-- Backfill from image_url so all existing categories have a consistent value
UPDATE categories SET cover_image = image_url WHERE cover_image IS NULL AND image_url IS NOT NULL;
