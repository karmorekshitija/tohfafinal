-- =============================================================================
-- Migration: 005_tohfa_specials.sql
-- Description: Tohfa Specials / Originals product curation fields
-- 1. Extend products table with is_tohfa_original, tohfa_special_badge, priority_rank, special_packaging_available
-- =============================================================================

ALTER TABLE products
ADD COLUMN IF NOT EXISTS is_tohfa_original BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tohfa_special_badge VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS priority_rank INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS special_packaging_available BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_products_tohfa_original ON products(is_tohfa_original) WHERE is_tohfa_original = TRUE;
