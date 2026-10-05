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
      await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS cover_image TEXT;`);
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
      await query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'products' AND column_name = 'is_bestseller'
          ) THEN
            ALTER TABLE products ADD COLUMN is_bestseller BOOLEAN DEFAULT FALSE;
          ELSE
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'products' AND column_name = 'is_bestseller' AND data_type = 'integer'
            ) THEN
              ALTER TABLE products ALTER COLUMN is_bestseller DROP DEFAULT;
              ALTER TABLE products ALTER COLUMN is_bestseller TYPE BOOLEAN USING (CASE WHEN is_bestseller = 1 THEN TRUE ELSE FALSE END);
              ALTER TABLE products ALTER COLUMN is_bestseller SET DEFAULT FALSE;
            END IF;
          END IF;
        END $$;
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_products_bestseller ON products(seller_id) WHERE is_bestseller = TRUE;`);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 2 - Products Notice]:', err.message);
    }

    // 2b. Product pricing columns
    try {
      await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_paise BIGINT;`);
      await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2) DEFAULT NULL;`);
      await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_active BOOLEAN DEFAULT FALSE;`);
      await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percentage INT DEFAULT NULL;`);
      await query(`UPDATE products SET price_paise = ROUND(base_price * 100)::BIGINT WHERE price_paise IS NULL AND base_price IS NOT NULL;`);
      console.log('✅ [Auto-Sync Step 2b] Product pricing columns ensured');
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 2b - Product Pricing Notice]:', err.message);
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

    // 3f. Standardize all boolean columns (users, sellers, seller_profiles, products) to PostgreSQL BOOLEAN
    try {
      await query(`
        DO $$
        BEGIN
          -- users.is_active
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_active' AND data_type != 'boolean') THEN
            ALTER TABLE users ALTER COLUMN is_active DROP DEFAULT;
            ALTER TABLE users ALTER COLUMN is_active TYPE BOOLEAN USING (CASE WHEN is_active::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE users ALTER COLUMN is_active SET DEFAULT TRUE;
          END IF;
          -- users.is_banned
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_banned' AND data_type != 'boolean') THEN
            ALTER TABLE users ALTER COLUMN is_banned DROP DEFAULT;
            ALTER TABLE users ALTER COLUMN is_banned TYPE BOOLEAN USING (CASE WHEN is_banned::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE users ALTER COLUMN is_banned SET DEFAULT FALSE;
          END IF;
          -- sellers.is_active
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sellers' AND column_name = 'is_active' AND data_type != 'boolean') THEN
            ALTER TABLE sellers ALTER COLUMN is_active DROP DEFAULT;
            ALTER TABLE sellers ALTER COLUMN is_active TYPE BOOLEAN USING (CASE WHEN is_active::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE sellers ALTER COLUMN is_active SET DEFAULT TRUE;
          END IF;
          -- sellers.is_approved
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sellers' AND column_name = 'is_approved' AND data_type != 'boolean') THEN
            ALTER TABLE sellers ALTER COLUMN is_approved DROP DEFAULT;
            ALTER TABLE sellers ALTER COLUMN is_approved TYPE BOOLEAN USING (CASE WHEN is_approved::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE sellers ALTER COLUMN is_approved SET DEFAULT FALSE;
          END IF;
          -- sellers.is_admin_managed
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sellers' AND column_name = 'is_admin_managed' AND data_type != 'boolean') THEN
            ALTER TABLE sellers ALTER COLUMN is_admin_managed DROP DEFAULT;
            ALTER TABLE sellers ALTER COLUMN is_admin_managed TYPE BOOLEAN USING (CASE WHEN is_admin_managed::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE sellers ALTER COLUMN is_admin_managed SET DEFAULT FALSE;
          END IF;
          -- sellers.is_tohfa_original
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sellers' AND column_name = 'is_tohfa_original' AND data_type != 'boolean') THEN
            ALTER TABLE sellers ALTER COLUMN is_tohfa_original DROP DEFAULT;
            ALTER TABLE sellers ALTER COLUMN is_tohfa_original TYPE BOOLEAN USING (CASE WHEN is_tohfa_original::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE sellers ALTER COLUMN is_tohfa_original SET DEFAULT FALSE;
          END IF;
          -- seller_profiles.is_active
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'seller_profiles' AND column_name = 'is_active' AND data_type != 'boolean') THEN
            ALTER TABLE seller_profiles ALTER COLUMN is_active DROP DEFAULT;
            ALTER TABLE seller_profiles ALTER COLUMN is_active TYPE BOOLEAN USING (CASE WHEN is_active::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE seller_profiles ALTER COLUMN is_active SET DEFAULT TRUE;
          END IF;
          -- seller_profiles.is_approved
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'seller_profiles' AND column_name = 'is_approved' AND data_type != 'boolean') THEN
            ALTER TABLE seller_profiles ALTER COLUMN is_approved DROP DEFAULT;
            ALTER TABLE seller_profiles ALTER COLUMN is_approved TYPE BOOLEAN USING (CASE WHEN is_approved::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE seller_profiles ALTER COLUMN is_approved SET DEFAULT FALSE;
          END IF;
          -- seller_profiles.is_admin_managed
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'seller_profiles' AND column_name = 'is_admin_managed' AND data_type != 'boolean') THEN
            ALTER TABLE seller_profiles ALTER COLUMN is_admin_managed DROP DEFAULT;
            ALTER TABLE seller_profiles ALTER COLUMN is_admin_managed TYPE BOOLEAN USING (CASE WHEN is_admin_managed::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE seller_profiles ALTER COLUMN is_admin_managed SET DEFAULT FALSE;
          END IF;
          -- seller_profiles.is_tohfa_original
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'seller_profiles' AND column_name = 'is_tohfa_original' AND data_type != 'boolean') THEN
            ALTER TABLE seller_profiles ALTER COLUMN is_tohfa_original DROP DEFAULT;
            ALTER TABLE seller_profiles ALTER COLUMN is_tohfa_original TYPE BOOLEAN USING (CASE WHEN is_tohfa_original::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE seller_profiles ALTER COLUMN is_tohfa_original SET DEFAULT FALSE;
          END IF;
          -- seller_profiles.is_accepting_orders
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'seller_profiles' AND column_name = 'is_accepting_orders' AND data_type != 'boolean') THEN
            ALTER TABLE seller_profiles ALTER COLUMN is_accepting_orders DROP DEFAULT;
            ALTER TABLE seller_profiles ALTER COLUMN is_accepting_orders TYPE BOOLEAN USING (CASE WHEN is_accepting_orders::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE seller_profiles ALTER COLUMN is_accepting_orders SET DEFAULT TRUE;
          END IF;
          -- products.is_active
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_active' AND data_type != 'boolean') THEN
            ALTER TABLE products ALTER COLUMN is_active DROP DEFAULT;
            ALTER TABLE products ALTER COLUMN is_active TYPE BOOLEAN USING (CASE WHEN is_active::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE products ALTER COLUMN is_active SET DEFAULT TRUE;
          END IF;
          -- products.is_customizable
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_customizable' AND data_type != 'boolean') THEN
            ALTER TABLE products ALTER COLUMN is_customizable DROP DEFAULT;
            ALTER TABLE products ALTER COLUMN is_customizable TYPE BOOLEAN USING (CASE WHEN is_customizable::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE products ALTER COLUMN is_customizable SET DEFAULT FALSE;
          END IF;
          -- products.is_sponsored
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_sponsored' AND data_type != 'boolean') THEN
            ALTER TABLE products ALTER COLUMN is_sponsored DROP DEFAULT;
            ALTER TABLE products ALTER COLUMN is_sponsored TYPE BOOLEAN USING (CASE WHEN is_sponsored::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE products ALTER COLUMN is_sponsored SET DEFAULT FALSE;
          END IF;
          -- products.is_tohfa_original
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_tohfa_original' AND data_type != 'boolean') THEN
            ALTER TABLE products ALTER COLUMN is_tohfa_original DROP DEFAULT;
            ALTER TABLE products ALTER COLUMN is_tohfa_original TYPE BOOLEAN USING (CASE WHEN is_tohfa_original::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE products ALTER COLUMN is_tohfa_original SET DEFAULT FALSE;
          END IF;
          -- products.discount_active
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'discount_active' AND data_type != 'boolean') THEN
            ALTER TABLE products ALTER COLUMN discount_active DROP DEFAULT;
            ALTER TABLE products ALTER COLUMN discount_active TYPE BOOLEAN USING (CASE WHEN discount_active::text IN ('1', 'true', 't') THEN TRUE ELSE FALSE END);
            ALTER TABLE products ALTER COLUMN discount_active SET DEFAULT FALSE;
          END IF;
        END $$;
      `);
      console.log('✅ [Auto-Sync Step 3f] Boolean column types standardized across all tables');
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 3f - Boolean Types Sync Notice]:', err.message);
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
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_product_occasion_tags_product_occ ON product_occasion_tags (product_id, occasion_slug);`);
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
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_product_url ON product_images (product_id, url);`);
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

    // 9b-2. Ensure Orders total_paise & order_ref exist before payments backfill (Step 9c)
    try {
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_paise BIGINT;`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_ref TEXT;`);
      await query(`UPDATE orders SET total_paise = ROUND(total_amount * 100) WHERE total_paise IS NULL AND total_amount IS NOT NULL;`);
      await query(`UPDATE orders SET order_ref = 'TOHFA-' || UPPER(SUBSTRING(id::text, 1, 8)) WHERE order_ref IS NULL;`);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Orders total_paise/order_ref Notice]:', err.message);
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
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_razorpay_order_id ON payments(razorpay_order_id);`);

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

    // 9d. Orders Notes, Total Paise, Order Ref & Studio Notes + Order Items & Address columns
    try {
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS studio_notes TEXT;`);
      await query(`UPDATE orders SET notes = studio_notes WHERE notes IS NULL AND studio_notes IS NOT NULL;`);
      await query(`UPDATE orders SET studio_notes = notes WHERE studio_notes IS NULL AND notes IS NOT NULL;`);
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price_paise BIGINT;`);
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name TEXT;`);
      await query(`UPDATE order_items SET unit_price_paise = ROUND(unit_price * 100) WHERE unit_price_paise IS NULL AND unit_price IS NOT NULL;`);

      // Seller profiles social/capacity/KYC fields
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS pan_number TEXT;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS gst_number TEXT;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS portfolio_images TEXT[] DEFAULT '{}';`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS daily_capacity_min INT DEFAULT NULL;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS daily_capacity_max INT DEFAULT NULL;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS instagram_handle TEXT DEFAULT NULL;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS instagram_followers TEXT DEFAULT NULL;`);

      // Addresses alias columns synchronization (tag, label, address_type, full_name, name, line1, etc.)
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS tag TEXT DEFAULT 'Home';`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS label TEXT DEFAULT 'Home';`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS address_type TEXT DEFAULT 'Home';`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS name TEXT;`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS full_name TEXT;`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS recipient_name TEXT;`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS line1 TEXT;`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS address_line1 TEXT;`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS line2 TEXT;`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS address_line2 TEXT;`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS landmark TEXT;`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS locality TEXT;`);
      await query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;`);

      await query(`UPDATE addresses SET tag = COALESCE(tag, label, address_type, 'Home') WHERE tag IS NULL;`);
      await query(`UPDATE addresses SET label = COALESCE(label, tag, address_type, 'Home') WHERE label IS NULL;`);
      await query(`UPDATE addresses SET address_type = COALESCE(address_type, label, tag, 'Home') WHERE address_type IS NULL;`);
      await query(`UPDATE addresses SET name = COALESCE(name, full_name, recipient_name) WHERE name IS NULL;`);
      await query(`UPDATE addresses SET full_name = COALESCE(full_name, name, recipient_name) WHERE full_name IS NULL;`);
      await query(`UPDATE addresses SET recipient_name = COALESCE(recipient_name, full_name, name) WHERE recipient_name IS NULL;`);
      await query(`UPDATE addresses SET line1 = COALESCE(line1, address_line1) WHERE line1 IS NULL;`);
      await query(`UPDATE addresses SET address_line1 = COALESCE(address_line1, line1) WHERE address_line1 IS NULL;`);
      // Normalize is_default column type to BOOLEAN if it was created as INTEGER
      await query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'addresses' AND column_name = 'is_default' AND data_type != 'boolean'
          ) THEN
            DROP VIEW IF EXISTS user_addresses;
            ALTER TABLE addresses ALTER COLUMN is_default DROP DEFAULT;
            ALTER TABLE addresses ALTER COLUMN is_default TYPE BOOLEAN USING (CASE WHEN is_default IS NULL THEN FALSE WHEN is_default::text = '0' THEN FALSE ELSE TRUE END);
            ALTER TABLE addresses ALTER COLUMN is_default SET DEFAULT FALSE;
          END IF;
        END $$;
      `);

      await query(`CREATE OR REPLACE VIEW user_addresses AS SELECT * FROM addresses;`);

      // Orders missing columns (Bug 2 & Bug 3)
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_id VARCHAR(100);`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER;`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0.00;`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(10,2) DEFAULT 0.00;`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id INTEGER;`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'razorpay';`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address JSONB DEFAULT '{}';`);
      await query(`UPDATE orders SET user_id = buyer_id WHERE user_id IS NULL AND buyer_id IS NOT NULL;`);
      await query(`UPDATE orders SET buyer_id = user_id WHERE buyer_id IS NULL AND user_id IS NOT NULL;`);

      // Seller profiles compatibility fields (Bug 3)
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS capacity_limit INT DEFAULT 50;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS vacation_mode BOOLEAN DEFAULT FALSE;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS vacation_mode_active INT DEFAULT 0;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS vacation_message TEXT DEFAULT '';`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS store_visibility BOOLEAN DEFAULT TRUE;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS review_settings JSONB DEFAULT '{"enabled": true, "delay_days_after_del": 3}';`);
      await query(`UPDATE seller_profiles SET capacity_limit = COALESCE(daily_order_limit, daily_capacity_max, 50) WHERE capacity_limit IS NULL;`);
      await query(`
        UPDATE seller_profiles
        SET capacity_limit = 1000
        WHERE (seller_type = 'special' OR is_admin_managed = TRUE OR is_tohfa_original = TRUE OR store_name IN ('The Candle Story', 'Nails Diva', 'Crochet Lady'))
          AND (capacity_limit IS NULL OR capacity_limit < 1000);
      `);
      await query(`UPDATE seller_profiles SET vacation_mode = (vacation_mode_active = 1) WHERE vacation_mode IS NULL AND vacation_mode_active IS NOT NULL;`);
      await query(`UPDATE seller_profiles SET store_visibility = (is_accepting_orders = 1) WHERE store_visibility IS NULL AND is_accepting_orders IS NOT NULL;`);

      // Order items compatibility fields (Bug 3)
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS seller_order_id INTEGER;`);
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customization_details TEXT;`);

      // Create seller_orders table (Bug 3)
      await query(`
        CREATE TABLE IF NOT EXISTS seller_orders (
          id SERIAL PRIMARY KEY,
          order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
          seller_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
          subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
          shipping_fee NUMERIC(10,2) DEFAULT 0.00,
          platform_commission NUMERIC(10,2) DEFAULT 0.00,
          seller_payout_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
          status VARCHAR(50) DEFAULT 'order_placed',
          awb_number VARCHAR(100),
          courier_name VARCHAR(100),
          tracking_url TEXT,
          payout_status VARCHAR(50) DEFAULT 'unsettled',
          delivered_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_seller_orders_order_id ON seller_orders(order_id);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_seller_orders_seller_id ON seller_orders(seller_id);`);

      // Notifications compatibility columns
      await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title TEXT;`);
      await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body TEXT;`);
      await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';`);
      await query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'notifications' AND column_name = 'is_read' AND data_type != 'boolean'
          ) THEN
            ALTER TABLE notifications ALTER COLUMN is_read DROP DEFAULT;
            ALTER TABLE notifications ALTER COLUMN is_read TYPE BOOLEAN USING (CASE WHEN is_read IS NULL THEN FALSE WHEN is_read::text = '1' THEN TRUE ELSE FALSE END);
            ALTER TABLE notifications ALTER COLUMN is_read SET DEFAULT FALSE;
          END IF;
        END $$;
      `);
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 9d - Orders Notes Notice]:', err.message);
    }

    // 9e. Checkout columns
    try {
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_paise BIGINT;`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_paise BIGINT;`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;`);
      await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sub_order_id UUID;`);
      console.log('✅ [Auto-Sync Step 9e] Checkout columns ensured');
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 9e - Checkout Columns Notice]:', err.message);
    }

    // 9f. Cart items table schema sync & unique constraints
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS cart_items (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          buyer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          product_id UUID REFERENCES products(id) ON DELETE CASCADE,
          variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
          quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
          customization_data JSONB DEFAULT NULL,
          customization_payload JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS buyer_id INTEGER;`);
      await query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS user_id INTEGER;`);
      await query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS customization_data JSONB;`);
      await query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS customization_payload JSONB DEFAULT '{}';`);
      await query(`ALTER TABLE cart_items ALTER COLUMN user_id DROP NOT NULL;`);
      await query(`UPDATE cart_items SET buyer_id = user_id WHERE buyer_id IS NULL AND user_id IS NOT NULL;`);
      await query(`UPDATE cart_items SET user_id = buyer_id WHERE user_id IS NULL AND buyer_id IS NOT NULL;`);

      // Deduplicate any existing cart_items before creating partial unique indexes
      await query(`
        DELETE FROM cart_items duplicate
        USING (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY COALESCE(buyer_id, user_id), product_id, variant_id
                   ORDER BY created_at NULLS LAST, id
                 ) AS row_number
          FROM cart_items
        ) ranked
        WHERE duplicate.id = ranked.id
          AND ranked.row_number > 1;
      `);

      // Ensure partial unique indexes for ON CONFLICT matching
      await query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items_buyer_product_no_variant
          ON cart_items (buyer_id, product_id)
          WHERE variant_id IS NULL;
      `);
      await query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items_buyer_product_variant
          ON cart_items (buyer_id, product_id, variant_id)
          WHERE variant_id IS NOT NULL;
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_cart_items_buyer_id ON cart_items(buyer_id);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);`);
      console.log('✅ [Auto-Sync Step 9f] cart_items schema and constraints ensured');
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 9f - Cart Items Notice]:', err.message);
    }

    // 10. Curate Categories Data (Default fallback only, never overwrite admin custom images)
    try {
      const categoryCurations = [
        { name: 'Candles & Aromatherapy', slug: 'candles-aromatherapy', emoji: '🕯️', img: '/img/categories/candles_aromatherapy.jpg', order: 1 },
        { name: 'Frames', slug: 'frames', emoji: '🏺', img: '/img/categories/frames.jpg', order: 1 },
        { name: 'Floral & Bouquets', slug: 'floral-bouquets', emoji: '💐', img: '/img/categories/floral_bouquets.jpg', order: 2 },
        { name: 'Nails & Beauty', slug: 'nails-beauty', emoji: '💅', img: '/img/categories/nails_beauty.jpg', order: 4 },
        { name: 'Hair Accessories', slug: 'hair-accessories', emoji: '🎀', img: '/img/categories/hair_accessories.jpg', order: 5 },
        { name: 'Gifts & Keepsakes', slug: 'gifts-keepsakes', emoji: '🎁', img: '/img/categories/gifts_keepsakes.jpg', order: 7 },
      ];

      for (const cat of categoryCurations) {
        await query(`
          UPDATE categories 
          SET display_name = COALESCE(display_name, $1),
              emoji_icon = COALESCE(emoji_icon, $2),
              icon_emoji = COALESCE(icon_emoji, $2),
              image_url = CASE 
                WHEN image_url IS NULL OR image_url = '' OR image_url IN ('/img/categories/candles.jpg', '/img/categories/dried_florals.jpg', '/img/categories/custom_portraits.jpg', '/img/categories/journals.jpg', '/img/categories/skincare.jpg') 
                THEN $3 
                ELSE image_url 
              END,
              cover_image = CASE 
                WHEN cover_image IS NULL OR cover_image = '' OR cover_image IN ('/img/categories/candles.jpg', '/img/categories/dried_florals.jpg', '/img/categories/custom_portraits.jpg', '/img/categories/journals.jpg', '/img/categories/skincare.jpg') 
                THEN $3 
                ELSE cover_image 
              END,
              sort_order = COALESCE(sort_order, $4)
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

    // 12. Seller Subscription Plans Schema & Ledger Table
    try {
      await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(20) DEFAULT 'basic';`);
      await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active';`);
      await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_price_paid NUMERIC(10,2) DEFAULT 0.00;`);
      await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;`);
      await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_renews_at TIMESTAMPTZ;`);
      await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_discount_used BOOLEAN DEFAULT FALSE;`);
      await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS subscription_updated_by VARCHAR(50) DEFAULT 'system';`);

      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(20) DEFAULT 'basic';`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active';`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_price_paid NUMERIC(10,2) DEFAULT 0.00;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_renews_at TIMESTAMPTZ;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_discount_used BOOLEAN DEFAULT FALSE;`);
      await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS subscription_updated_by VARCHAR(50) DEFAULT 'system';`);

      await query(`
        CREATE TABLE IF NOT EXISTS subscription_payments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          seller_id UUID,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          plan VARCHAR(20) NOT NULL,
          amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
          currency VARCHAR(10) DEFAULT 'INR',
          razorpay_order_id TEXT,
          razorpay_payment_id TEXT,
          razorpay_signature TEXT,
          status VARCHAR(50) NOT NULL DEFAULT 'created',
          discount_applied BOOLEAN DEFAULT FALSE,
          started_at TIMESTAMPTZ,
          renews_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_subscription_payments_user_id ON subscription_payments(user_id);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_subscription_payments_order_id ON subscription_payments(razorpay_order_id);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_subscription_payments_plan ON subscription_payments(plan);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_sellers_subscription_plan ON sellers(subscription_plan);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_seller_profiles_subscription_plan ON seller_profiles(subscription_plan);`);
      console.log('✅ [Auto-Sync Step 12] Seller subscription columns & payments table ensured');
    } catch (err) {
      console.warn('⚠️ [Auto-Sync Step 12 - Subscriptions Notice]:', err.message);
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

    // 14. Ensure WhatsApp Outbox & Opt-Outs Tables
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS whatsapp_outbox (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          kind TEXT NOT NULL CHECK (kind IN ('seller_new_order', 'buyer_quote', 'buyer_proof', 'occasion_reminder', 'autoreply')),
          idempotency_key TEXT NOT NULL,
          recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          intended_to TEXT,
          sent_to TEXT,
          template_name TEXT,
          variables JSONB,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'suppressed', 'invalid_number', 'opted_out', 'no_consent')),
          attempts INT NOT NULL DEFAULT 0,
          next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
          provider_message_id TEXT,
          error_code TEXT,
          error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          sent_at TIMESTAMPTZ,
          delivered_at TIMESTAMPTZ
        );
      `);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_outbox_idempotency_key ON whatsapp_outbox(idempotency_key);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_status_next_attempt ON whatsapp_outbox(status, next_attempt_at);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_provider_message_id ON whatsapp_outbox(provider_message_id);`);

      await query(`
        CREATE TABLE IF NOT EXISTS whatsapp_opt_outs (
          phone10 TEXT PRIMARY KEY,
          opted_out_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE;`);
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_marketing_opt_in_at TIMESTAMPTZ;`);

      // Manual-mode tracking columns
      await query(`ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS owner_email_status TEXT DEFAULT 'pending';`);
      await query(`ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS owner_email_attempts INT NOT NULL DEFAULT 0;`);
      await query(`ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS owner_emailed_at TIMESTAMPTZ;`);
      await query(`ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;`);
      await query(`ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS manual_done_at TIMESTAMPTZ;`);
      await query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_status_created ON whatsapp_outbox(status, created_at);`);
      await query(`ALTER TABLE whatsapp_outbox DROP CONSTRAINT IF EXISTS whatsapp_outbox_status_check;`);
      await query(`
        ALTER TABLE whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_status_check
          CHECK (status IN (
            'pending','sending','sent','delivered','read','failed',
            'suppressed','manual_pending','manual_done',
            'invalid_number','opted_out','no_consent'
          ));
      `);

      console.log('✅ [Auto-Sync Step 14] WhatsApp outbox & marketing opt-in schema ensured');
    } catch (waErr) {
      console.warn('⚠️ [Auto-Sync Step 14 - WhatsApp Notice]:', waErr.message);
    }

    // 15. Logistics fulfillment columns (iThink / manual dispatch safety)
    try {
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier VARCHAR(100);`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_status VARCHAR(50) DEFAULT 'unbooked';`);
      await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_error TEXT;`);

      await query(`ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS courier_name VARCHAR(100);`);
      await query(`ALTER TABLE seller_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);

      await query(`CREATE INDEX IF NOT EXISTS idx_orders_tracking_id ON orders(tracking_id);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_orders_shipment_status ON orders(shipment_status);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_seller_orders_awb_number ON seller_orders(awb_number);`);

      console.log('✅ [Auto-Sync Step 15] Logistics fulfillment columns ensured');
    } catch (logisticsErr) {
      console.warn('⚠️ [Auto-Sync Step 15 - Logistics Notice]:', logisticsErr.message);
    }

    console.log('✅ Database schema and catalog auto-sync complete!');
  } catch (err) {
    console.warn('⚠️ [Database Auto-Sync Warning]:', err.message);
  }
}

module.exports = { autoSyncDatabase };
