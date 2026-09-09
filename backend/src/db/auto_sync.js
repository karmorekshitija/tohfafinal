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
    try {
      await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
      await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);`);
      await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS emoji_icon VARCHAR(20);`);
      await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon_emoji VARCHAR(20);`);
      await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_image_url TEXT;`);
      await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;`);
      await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;`);
      await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;`);
      await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;`);
      await query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'categories' AND column_name = 'is_active' AND data_type != 'boolean'
          ) THEN
            ALTER TABLE categories ALTER COLUMN is_active DROP DEFAULT;
            ALTER TABLE categories ALTER COLUMN is_active TYPE BOOLEAN USING (CASE WHEN is_active IS NULL THEN TRUE WHEN is_active::text = '0' THEN FALSE ELSE TRUE END);
            ALTER TABLE categories ALTER COLUMN is_active SET DEFAULT TRUE;
          END IF;
        END $$;
      `);
      await query(`UPDATE categories SET display_name = name WHERE display_name IS NULL;`);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 1 - Categories Notice]:', err.message);
    }

    // 2. Products columns
    try {
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
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 2 - Products Notice]:', err.message);
    }

    // 3. User & Seller profile photo columns
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;`);
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);
      await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS photo_url TEXT;`);
      await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;`);
      await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;`);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 3 - Profiles Notice]:', err.message);
    }

    // 3b. Admin-managed seller flag (migration 009 — idempotent guard)
    try {
      await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS is_admin_managed BOOLEAN NOT NULL DEFAULT FALSE;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS is_admin_managed BOOLEAN NOT NULL DEFAULT FALSE;`);
      await query(`CREATE INDEX IF NOT EXISTS idx_sellers_is_admin_managed ON sellers(is_admin_managed);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_seller_profiles_is_admin_managed ON seller_profiles(is_admin_managed);`);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 3b - Admin-Managed Flag Notice]:', err.message);
    }

    // 3c. Heal any seller_type = 'Artisan' rows written by the old seed/migration 011.
    //     The CHECK constraint only allows 'regular' or 'special'; 'Artisan' violates it.
    try {
      await query(`UPDATE seller_profiles SET seller_type = 'special' WHERE seller_type = 'Artisan';`);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 3c - Seller Type Heal Notice]:', err.message);
    }

    // 3d. Refresh Tokens Table (auth — created here because schema.sql is never run on Render;
    //     every login/register calls issueTokenPair() which INSERTs into this table.
    //     Without it, auth crashes with "relation refresh_tokens does not exist".)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
          revoked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id   ON refresh_tokens(user_id);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);`);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 3d - Refresh Tokens Notice]:', err.message);
    }

    // 3e. Wallets Table & Foreign Key constraint (Bug Audit Phase 1)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS wallets (
          id SERIAL PRIMARY KEY,
          seller_id UUID NOT NULL UNIQUE,
          user_id UUID,
          balance NUMERIC(12,2) DEFAULT 0.00,
          holding_balance NUMERIC(12,2) DEFAULT 0.00,
          currency VARCHAR(10) DEFAULT 'INR',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_wallets_seller_id ON wallets(seller_id);`);

      // Check actual column types of sellers.id and wallets.seller_id
      const { rows: sellerIdCol } = await query(`
        SELECT data_type, udt_name 
        FROM information_schema.columns 
        WHERE table_name = 'sellers' AND column_name = 'id';
      `);
      const { rows: walletSellerIdCol } = await query(`
        SELECT data_type, udt_name 
        FROM information_schema.columns 
        WHERE table_name = 'wallets' AND column_name = 'seller_id';
      `);

      // Only ALTER if sellers.id is UUID and wallets.seller_id is not UUID (data-safe cast)
      if (
        sellerIdCol.length > 0 &&
        sellerIdCol[0].udt_name === 'uuid' &&
        walletSellerIdCol.length > 0 &&
        walletSellerIdCol[0].udt_name !== 'uuid'
      ) {
        await query(`ALTER TABLE sellers DROP CONSTRAINT IF EXISTS fk_seller_wallet;`);
        await query(`
          ALTER TABLE wallets 
          ALTER COLUMN seller_id TYPE UUID USING (
            CASE 
              WHEN seller_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
              THEN seller_id::text::uuid 
              ELSE gen_random_uuid() 
            END
          );
        `);

        const { rows: walletUserIdCol } = await query(`
          SELECT data_type, udt_name 
          FROM information_schema.columns 
          WHERE table_name = 'wallets' AND column_name = 'user_id';
        `);
        if (walletUserIdCol.length > 0 && walletUserIdCol[0].udt_name !== 'uuid') {
          await query(`
            ALTER TABLE wallets 
            ALTER COLUMN user_id TYPE UUID USING (
              CASE 
                WHEN user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                THEN user_id::text::uuid 
                ELSE NULL 
              END
            );
          `);
        }
      }

      // Backfill wallets for existing sellers
      await query(`
        INSERT INTO wallets (seller_id, user_id)
        SELECT id, user_id FROM sellers
        ON CONFLICT (seller_id) DO NOTHING;
      `);

      // Enforce fk_seller_wallet constraint
      const { rows: existingWalletFk } = await query(`
        SELECT conname FROM pg_constraint WHERE conname = 'fk_seller_wallet';
      `);
      if (existingWalletFk.length === 0) {
        try {
          await query(`
            ALTER TABLE sellers 
            ADD CONSTRAINT fk_seller_wallet 
            FOREIGN KEY (id) REFERENCES wallets(seller_id) 
            ON DELETE CASCADE 
            DEFERRABLE INITIALLY DEFERRED;
          `);
        } catch (fkErr) {
          console.warn('⚠️ [Wallet Constraint Notice]:', fkErr.message);
        }
      }
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 3e - Wallets Notice]:', err.message);
    }

    // 4. Fixed Customization Options Table
    try {
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
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 4 - Fixed Customization Options Notice]:', err.message);
    }

    // 5. Product Occasion Tags Table
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS product_occasion_tags (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          product_id UUID REFERENCES products(id) ON DELETE CASCADE,
          occasion_slug VARCHAR(100) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 5 - Product Occasion Tags Notice]:', err.message);
    }

    // 6. Product Images Table
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS product_images (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          product_id UUID REFERENCES products(id) ON DELETE CASCADE,
          url TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 6 - Product Images Notice]:', err.message);
    }

    // 7. Product Variants Table
    try {
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
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 7 - Product Variants Notice]:', err.message);
    }

    // Payments dual gateway support
    await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_account VARCHAR(20) DEFAULT 'primary';`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payments_gateway_account ON payments(gateway_account);`);

    // 8. Reports Table
    try {
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
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 8 - Reports Notice]:', err.message);
    }

    // 9. UI Settings Table
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS ui_settings (
          key VARCHAR(100) PRIMARY KEY,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 9 - UI Settings Notice]:', err.message);
    }

    // 9b. Refund Requests Table
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS refund_requests (
          id SERIAL PRIMARY KEY,
          order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
          buyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          seller_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
          reason TEXT,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          admin_notes TEXT,
          razorpay_refund_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolved_at TIMESTAMPTZ
        );
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_refund_requests_order_id ON refund_requests(order_id);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);`);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 9b - Refund Requests Notice]:', err.message);
    }

    // 9c. Payments Table (Razorpay customer transactions)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
          razorpay_order_id TEXT,
          razorpay_payment_id TEXT,
          razorpay_signature TEXT,
          amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
          status TEXT NOT NULL DEFAULT 'paid',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);`);

      // Backfill payments from existing paid orders if empty
      const { rows: pCount } = await query(`SELECT COUNT(*) AS count FROM payments`);
      if (parseInt(pCount[0]?.count || 0, 10) === 0) {
        await query(`
          INSERT INTO payments (order_id, razorpay_order_id, razorpay_payment_id, amount, status, created_at, updated_at)
          SELECT 
            id,
            COALESCE(razorpay_order_id, 'order_' || COALESCE(order_ref, id::text)),
            COALESCE(razorpay_payment_id, 'pay_' || lower(replace(COALESCE(order_ref, id::text), '-', ''))),
            COALESCE(NULLIF(total_paise, 0) / 100.0, total_amount, 0),
            COALESCE(payment_status, 'paid'),
            created_at,
            updated_at
          FROM orders
          WHERE LOWER(COALESCE(payment_status, '')) = 'paid'
        `);
      }
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 9c - Payments Notice]:', err.message);
    }

    // 9d. Orders Notes & Studio Notes Columns + Address columns (Sync so seller endpoints never fail)
    try {
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS studio_notes TEXT;`);
      await query(`UPDATE orders SET notes = studio_notes WHERE notes IS NULL AND studio_notes IS NOT NULL;`);
      await query(`UPDATE orders SET studio_notes = notes WHERE studio_notes IS NULL AND notes IS NOT NULL;`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS name TEXT;`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS recipient_name TEXT;`);
      await query(`UPDATE addresses SET name = full_name WHERE name IS NULL AND full_name IS NOT NULL;`);
      await query(`UPDATE addresses SET recipient_name = full_name WHERE recipient_name IS NULL AND full_name IS NOT NULL;`);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 9d - Orders Notes Notice]:', err.message);
    }

    // 10. Curate Categories Data (Clean display names, unique icons, and specific artisan images)
    try {
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
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 10 - Curate Categories Notice]:', err.message);
    }

    // 11. Ensure Sponsored Products exist (Mark top 6 products as is_sponsored if none are flagged)
    try {
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
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 11 - Sponsored Products Notice]:', err.message);
    }

    // 12. Ensure Handcrafted Figurines & Art products are properly categorized
    try {
      await query(`
        UPDATE products 
        SET category_id = (SELECT id FROM categories WHERE slug = 'handcrafted-figurines' LIMIT 1)
        WHERE name IN (
          'Stacked Puppies Candle',
          'Golden Retriever Round Candle',
          'Chess Knight Horse Candle',
          'Stacked Owls Candle',
          'Swan Relief Pillar Candle',
          'Mother & Child Relief Candle',
          'Madonna Bust Candle',
          'Enchanted Cottage Candle',
          'Embracing Couple Candle'
        )
      `);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 12 - Product Categorization Notice]:', err.message);
    }

    // 13. Ensure Initial Admin Exists
    try {
      const { rows: adminRows } = await query(
        "SELECT id FROM users WHERE role IN ('admin', 'master_admin') LIMIT 1"
      );
      if (adminRows.length === 0) {
        const bcrypt = require('bcrypt');
        const adminEmail = (process.env.ADMIN_EMAIL || 'admin@thetohfa.in').toLowerCase().trim();
        const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
        const hash = await bcrypt.hash(adminPassword, 10);
        await query(
          `INSERT INTO users (name, full_name, display_name, email, password_hash, role, is_active)
           VALUES ('Tohfa Admin', 'Tohfa Admin', 'Tohfa Admin', $1, $2, 'admin', TRUE)
           ON CONFLICT (email) DO UPDATE SET role = 'admin', is_active = TRUE, password_hash = $2`,
          [adminEmail, hash]
        );
        console.log(`🛡️ Default Admin user ensured: ${adminEmail}`);
      }
    } catch (adminErr) {
      console.warn('⚠️ [Admin Ensure Notice]:', adminErr.message);
    }

    console.log('✅ Database schema and catalog auto-sync complete!');
  } catch (err) {
    console.warn('⚠️ [Database Auto-Sync Warning]:', err.message);
  }
}

module.exports = { autoSyncDatabase };
