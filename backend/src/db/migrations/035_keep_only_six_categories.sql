-- Migration 035: Keep only 6 canonical categories and clean up extra categories
BEGIN;

-- 1. Reassign figurine candles to Candles & Aromatherapy
UPDATE products SET category_id = 66 WHERE category_id = 71;

-- 2. Update category 8 to Frames
UPDATE categories 
SET name = 'Frames', 
    display_name = 'Frames', 
    slug = 'frames', 
    sort_order = 1, 
    is_active = TRUE, 
    emoji_icon = '🏺', 
    icon_emoji = '🏺', 
    image_url = '/img/categories/frames.jpg', 
    cover_image = '/img/categories/frames.jpg', 
    banner_image_url = '/img/categories/frames.jpg',
    description = 'Handcrafted bespoke photo frames and wall art.',
    parent_id = NULL
WHERE id = 8;

-- 3. Update the other 5 categories
UPDATE categories 
SET image_url = '/img/categories/candles_aromatherapy.jpg', 
    cover_image = '/img/categories/candles_aromatherapy.jpg', 
    banner_image_url = '/img/categories/candles_aromatherapy.jpg',
    sort_order = 1,
    is_active = TRUE,
    parent_id = NULL
WHERE id = 66;

UPDATE categories 
SET image_url = '/img/categories/floral_bouquets.jpg', 
    cover_image = '/img/categories/floral_bouquets.jpg', 
    banner_image_url = '/img/categories/floral_bouquets.jpg',
    sort_order = 2,
    is_active = TRUE,
    parent_id = NULL
WHERE id = 67;

UPDATE categories 
SET image_url = '/img/categories/nails_beauty.jpg', 
    cover_image = '/img/categories/nails_beauty.jpg', 
    banner_image_url = '/img/categories/nails_beauty.jpg',
    sort_order = 4,
    is_active = TRUE,
    parent_id = NULL
WHERE id = 69;

UPDATE categories 
SET image_url = '/img/categories/hair_accessories.jpg', 
    cover_image = '/img/categories/hair_accessories.jpg', 
    banner_image_url = '/img/categories/hair_accessories.jpg',
    sort_order = 5,
    is_active = TRUE,
    parent_id = NULL
WHERE id = 62;

UPDATE categories 
SET image_url = '/img/categories/gifts_keepsakes.jpg', 
    cover_image = '/img/categories/gifts_keepsakes.jpg', 
    banner_image_url = '/img/categories/gifts_keepsakes.jpg',
    sort_order = 7,
    is_active = TRUE,
    parent_id = NULL
WHERE id = 72;

-- 4. Detach parent_id on all categories to allow deletion
UPDATE categories SET parent_id = NULL;

-- 5. Delete all subcategories
DELETE FROM subcategories;

-- 6. Delete all extra categories
DELETE FROM categories WHERE id NOT IN (66, 8, 67, 69, 62, 72);

COMMIT;
