-- Migration 013: Categories Schema Synchronization
ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS emoji_icon VARCHAR(20);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon_emoji VARCHAR(20);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_image_url TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;

-- Backfill display_name from name so existing categories aren't left blank
UPDATE categories SET display_name = name WHERE display_name IS NULL;
UPDATE categories SET emoji_icon = icon_emoji WHERE emoji_icon IS NULL AND icon_emoji IS NOT NULL;
UPDATE categories SET icon_emoji = emoji_icon WHERE icon_emoji IS NULL AND emoji_icon IS NOT NULL;
