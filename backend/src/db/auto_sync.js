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

    // 3b. Admin-managed seller flag (migration 009 — idempotent guard)
    await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS is_admin_managed BOOLEAN NOT NULL DEFAULT FALSE;`);
    await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS is_admin_managed BOOLEAN NOT NULL DEFAULT FALSE;`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sellers_is_admin_managed ON sellers(is_admin_managed);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_seller_profiles_is_admin_managed ON seller_profiles(is_admin_managed);`);

    // 3c. Heal any seller_type = 'Artisan' rows written by the old seed/migration 011.
    //     The CHECK constraint only allows 'regular' or 'special'; 'Artisan' violates it.
    await query(`UPDATE seller_profiles SET seller_type = 'special' WHERE seller_type = 'Artisan';`);

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
    // CREATE TABLE IF NOT EXISTS is a no-op when the table already exists.
    // These ALTERs ensure columns added by migrations 006/010 are present on
    // any Render DB that was bootstrapped before those migrations were written.
    await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS variant_name TEXT;`);
    await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_name TEXT;`);
    await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_hex CHAR(7);`);
    await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS size TEXT;`);
    await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS additional_price NUMERIC(10,2) NOT NULL DEFAULT 0;`);
    await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_url TEXT;`);
    await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';`);
    await query(`CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);`);

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
      { name: 'Candles & Aromatherapy', slug: 'candles-aromatherapy', emoji: '🕯️', img: '/img/categories/candles.jpg', order: 1 },
      { name: 'Floral & Bouquets', slug: 'floral-bouquets', emoji: '💐', img: '/img/categories/dried_florals.jpg', order: 2 },
      { name: 'Home Decor & Living', slug: 'home-decor', emoji: '🏡', img: '/img/categories/ceramics.jpg', order: 3 },
      { name: 'Nails & Beauty', slug: 'nails-beauty', emoji: '💅', img: '/img/categories/custom_portraits.jpg', order: 4 },
      { name: 'Hair Accessories', slug: 'hair-accessories', emoji: '🎀', img: '/img/categories/journals.jpg', order: 5 },
      { name: 'Handcrafted Figurines & Art', slug: 'handcrafted-figurines', emoji: '🎨', img: '/img/categories/art_prints.jpg', order: 6 },
      { name: 'Gifts & Keepsakes', slug: 'gifts-keepsakes', emoji: '🎁', img: '/img/categories/skincare.jpg', order: 7 },
      { name: 'Jewellery & Wearables', slug: 'jewellery-wearables', emoji: '💍', img: '/img/categories/jewellery.jpg', order: 8 },
    ];

    for (const cat of categoryCurations) {
      await query(`
        UPDATE categories 
        SET display_name = $1, emoji_icon = $2, icon_emoji = $2, image_url = $3, sort_order = $4, is_active = TRUE
        WHERE slug = $5
      `, [cat.name, cat.emoji, cat.img, cat.order, cat.slug]);
    }

    // 11. Ensure Sponsored Products exist (Mark top 6 products as is_sponsored if none are flagged)
    const { rows: sponsoredCount } = await query(`SELECT COUNT(*) AS count FROM products WHERE is_sponsored = TRUE AND status = 'active'`);
    if (parseInt(sponsoredCount[0]?.count || 0, 10) === 0) {
      await query(`
        UPDATE products 
        SET is_sponsored = TRUE 
        WHERE id IN (
          SELECT id FROM products WHERE status = 'active' ORDER BY created_at DESC LIMIT 6
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
