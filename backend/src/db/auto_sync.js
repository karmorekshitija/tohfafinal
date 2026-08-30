/**
 * Tohfa v2 — Automated Database Schema Sync on Server Startup
 * File: backend/src/db/auto_sync.js
 * Role: Ensures all required columns, tables, and curated catalog data exist
 *       so that all endpoints (/api/categories, /api/products, /api/products/:id)
 *       work reliably with zero 500 errors.
 */
'use strict';

const { query } = require('../config/db');

async function autoSyncDatabase() {
  try {
    console.log('🔄 Checking database schema synchronization...');

    // 1. Categories columns
    await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);`);
    await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS emoji_icon VARCHAR(20);`);
    await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon_emoji VARCHAR(20);`);
    await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_image_url TEXT;`);
    await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;`);
    await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;`);
    await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;`);
    await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;`);
    await query(`UPDATE categories SET display_name = name WHERE display_name IS NULL;`);

    // 2. Products columns
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS special_packaging_available BOOLEAN DEFAULT TRUE;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS preparation_days INT DEFAULT 2;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_grams INT DEFAULT 500;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_sponsored BOOLEAN DEFAULT FALSE;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_best_seller INT DEFAULT 0;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_bestseller BOOLEAN DEFAULT FALSE;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) DEFAULT 5.0;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count INT DEFAULT 0;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS open_customization_config JSONB DEFAULT '{}';`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS customization_schema JSONB DEFAULT '{}';`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS customization_mode TEXT DEFAULT 'none';`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_customizable BOOLEAN DEFAULT FALSE;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS slug VARCHAR(255);`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_tohfa_original BOOLEAN DEFAULT FALSE;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS tohfa_special_badge VARCHAR(100) DEFAULT NULL;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS priority_rank INT DEFAULT 0;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INT DEFAULT 3;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2) DEFAULT NULL;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_active BOOLEAN DEFAULT FALSE;`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percentage INT DEFAULT NULL;`);

    // 3. User & Seller profile photo columns
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);
    await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS photo_url TEXT;`);
    await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;`);

    // 4. Fixed Customization Options Table
    await query(`
      CREATE TABLE IF NOT EXISTS fixed_customization_options (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        option_type TEXT,
        title TEXT,
        choices JSONB DEFAULT '[]',
        is_required BOOLEAN DEFAULT FALSE,
        price_delta NUMERIC(10,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 5. Product Occasion Tags Table
    await query(`
      CREATE TABLE IF NOT EXISTS product_occasion_tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        occasion_slug VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 6. Product Images Table
    await query(`
      CREATE TABLE IF NOT EXISTS product_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 7. Product Variants Table
    await query(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        variant_name TEXT,
        color_name TEXT,
        color_hex CHAR(7),
        size TEXT,
        additional_price NUMERIC(10,2) NOT NULL DEFAULT 0,
        stock_qty INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        images TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 8. Reports Table
    await query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        reporter_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'other',
        target_id TEXT,
        reason TEXT NOT NULL DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        admin_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 9. UI Settings Table
    await query(`
      CREATE TABLE IF NOT EXISTS ui_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 10. Curate Categories Data (Clean display names, unique icons, and specific artisan images)
    const categoryCurations = [
      { id: 66, name: 'Candles & Aromatherapy', slug: 'candles-aromatherapy', emoji: '🕯️', img: '/img/categories/candles.jpg', order: 1 },
      { id: 67, name: 'Floral & Bouquets', slug: 'floral-bouquets', emoji: '💐', img: '/img/categories/dried_florals.jpg', order: 2 },
      { id: 8,  name: 'Home Decor & Living', slug: 'home-decor', emoji: '🏡', img: '/img/categories/ceramics.jpg', order: 3 },
      { id: 69, name: 'Nails & Beauty', slug: 'nails-beauty', emoji: '💅', img: '/img/categories/custom_portraits.jpg', order: 4 },
      { id: 62, name: 'Hair Accessories', slug: 'hair-accessories', emoji: '🎀', img: '/img/categories/journals.jpg', order: 5 },
      { id: 71, name: 'Handcrafted Figurines & Art', slug: 'handcrafted-figurines', emoji: '🎨', img: '/img/categories/art_prints.jpg', order: 6 },
      { id: 72, name: 'Gifts & Keepsakes', slug: 'gifts-keepsakes', emoji: '🎁', img: '/img/categories/skincare.jpg', order: 7 },
      { id: 73, name: 'Jewellery & Wearables', slug: 'jewellery-wearables', emoji: '💍', img: '/img/categories/jewellery.jpg', order: 8 },
    ];

    for (const cat of categoryCurations) {
      await query(`
        UPDATE categories 
        SET display_name = $1, emoji_icon = $2, icon_emoji = $2, image_url = $3, sort_order = $4, is_active = TRUE
        WHERE id = $5 OR slug = $6
      `, [cat.name, cat.emoji, cat.img, cat.order, cat.id, cat.slug]);
    }

    // Hide untagged duplicate categories (like generic "Handcrafted", "Candles", "Nails" with no images)
    await query(`
      UPDATE categories 
      SET is_active = FALSE 
      WHERE id IN (60, 61, 63, 64, 65) OR (parent_id IS NULL AND id NOT IN (66, 67, 8, 69, 62, 71, 72, 73, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15));
    `);

    // 11. Ensure Sponsored Products exist (Mark top 6 products as is_sponsored if none are flagged)
    const { rows: sponsoredCount } = await query(`SELECT COUNT(*) AS count FROM products WHERE is_sponsored = TRUE AND status = 'active'`);
    if (parseInt(sponsoredCount[0]?.count || 0, 10) === 0) {
      await query(`
        UPDATE products 
        SET is_sponsored = TRUE 
        WHERE id IN (
          SELECT id FROM products WHERE status = 'active' ORDER BY id ASC LIMIT 6
        )
      `);
      console.log('⭐ Flagged initial 6 products as sponsored for featured showcase');
    }

    console.log('✅ Database schema and catalog auto-sync complete!');
  } catch (err) {
    console.warn('⚠️ [Database Auto-Sync Warning]:', err.message);
  }
}

module.exports = { autoSyncDatabase };
