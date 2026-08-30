-- =============================================================================
-- Tohfa v2 — Migration 014: Our Story Features Table
-- File: backend/src/db/migrations/014_our_story_features.sql
-- Role: Curation table for artisan spotlights featured on the Our Story page
-- =============================================================================

CREATE TABLE IF NOT EXISTS our_story_features (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blurb        TEXT DEFAULT '',
  image_url    TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  featured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seller_id)
);

ALTER TABLE our_story_features ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_our_story_features_seller_id ON our_story_features(seller_id);
CREATE INDEX IF NOT EXISTS idx_our_story_features_is_active ON our_story_features(is_active);

