/**
 * Tohfa v2 — Master Fix Migration: Categories, Variants, Tags, Seller KYC
 * File: backend/src/db/migrate_master_fix.js
 */
'use strict';

const { query, pool } = require('../config/db');

const MAJOR_CATEGORIES = [
  { name: 'Candles & Aromatherapy', slug: 'candles-aromatherapy', emoji: '🕯️', sort_order: 1, image_url: '/img/categories/candles.jpg', description: 'Hand-poured soy wax, sculpted candles, aroma pillars, and fragrant home essentials.' },
  { name: 'Floral & Bouquets', slug: 'floral-bouquets', emoji: '💐', sort_order: 2, image_url: '/img/categories/dried_florals.jpg', description: 'Handcrafted crocheted bouquets, everlasting potted botanicals, and floral stems.' },
  { name: 'Home Decor & Living', slug: 'home-decor', emoji: '🏡', sort_order: 3, image_url: '/img/categories/ceramics.jpg', description: 'Studio pottery, ceramic vessels, planters, wall art, and ambient accents.' },
  { name: 'Nails & Beauty', slug: 'nails-beauty', emoji: '💅', sort_order: 4, image_url: '/img/categories/custom_portraits.jpg', description: 'Artisan hand-painted luxury press-on nail sets and manicure kits.' },
  { name: 'Hair Accessories', slug: 'hair-accessories', emoji: '🎀', sort_order: 5, image_url: '/img/categories/journals.jpg', description: 'Handcrafted bows, crocheted clips, floral hairpins, and hair adornments.' },
  { name: 'Handcrafted Figurines & Art', slug: 'handcrafted-figurines', emoji: '🎨', sort_order: 6, image_url: '/img/categories/art_prints.jpg', description: 'Sculpted figurines, terracotta art pieces, woodcraft keepsakes, and portraits.' },
  { name: 'Gifts & Keepsakes', slug: 'gifts-keepsakes', emoji: '🎁', sort_order: 7, image_url: '/img/categories/skincare.jpg', description: 'Curated gift boxes, festive hampers, couple keepsakes, and personalized gift wraps.' },
  { name: 'Jewellery & Wearables', slug: 'jewellery-wearables', emoji: '💍', sort_order: 8, image_url: '/img/categories/jewellery.jpg', description: 'Handmade earrings, rings, necklaces, macrame accessories, and fabric crafts.' }
];

const PRODUCT_MIGRATIONS = {
  127: { cat: 'floral-bouquets', tags: ['crochet', 'bouquet', 'sunflower', 'lily', 'everlasting-flowers'] },
  128: { cat: 'candles-aromatherapy', tags: ['candle', 'sculpted-candle', 'dog', 'puppy', 'hand-poured'] },
  129: { cat: 'candles-aromatherapy', tags: ['candle', 'sculpted-candle', 'dog', 'retriever', 'soy-wax'] },
  130: { cat: 'floral-bouquets', tags: ['crochet', 'evil-eye', 'potted-plant', 'desk-decor'] },
  131: { cat: 'candles-aromatherapy', tags: ['candle', 'cottagecore', 'sculpted-candle', 'home-fragrance'] },
  132: { cat: 'candles-aromatherapy', tags: ['candle', 'sculpture', 'horse', 'equestrian', 'heritage'] },
  133: { cat: 'hair-accessories', tags: ['hair-clip', 'crochet', 'daisy', 'sunflower', 'pastel'] },
  134: { cat: 'floral-bouquets', tags: ['crochet', 'potted-flowers', 'bouquet', 'pastel'] },
  135: { cat: 'candles-aromatherapy', tags: ['candle', 'pillar-candle', 'mother-child', 'angel', 'keepsake'] },
  136: { cat: 'candles-aromatherapy', tags: ['candle', 'pillar-candle', 'fluted-candle', 'soy-wax', 'lavender'] },
  137: { cat: 'gifts-keepsakes', tags: ['keychain', 'crochet', 'cherry', 'gift-item'] },
  138: { cat: 'candles-aromatherapy', tags: ['candle', 'fluted-candle', 'floral-top', 'citrus', 'soy-wax'] },
  139: { cat: 'candles-aromatherapy', tags: ['candle', 'owl', 'sculpted-candle', 'terracotta-style'] },
  140: { cat: 'candles-aromatherapy', name: 'Romantic Embracing Couple Sculpted Candle', tags: ['candle', 'couple-candle', 'romance', 'anniversary'] },
  141: { cat: 'nails-beauty', name: 'Artisan Luxury Press-On Nail Set', tags: ['press-on-nails', 'nail-art', 'cherry-bow', 'reusable'] },
  142: { cat: 'floral-bouquets', tags: ['crochet', 'potted-rose', 'pink-rose', 'everlasting'] },
  143: { cat: 'candles-aromatherapy', tags: ['candle', 'couple-candle', 'romance', 'anniversary'] },
  144: { cat: 'nails-beauty', tags: ['press-on-nails', 'nail-art', 'amethyst', 'lavender-wave'] },
  145: { cat: 'hair-accessories', tags: ['hair-clip', 'crochet-bow', 'crimson', 'alligator-clip'] },
  146: { cat: 'floral-bouquets', tags: ['crochet', 'potted-flower', 'red-tulip', 'tabletop'] },
  147: { cat: 'candles-aromatherapy', tags: ['candle', 'column-candle', 'ribbed', 'minimalist'] },
  148: { cat: 'floral-bouquets', name: 'Handmade Crocheted Single Sunflower Gift Wrap', tags: ['crochet', 'sunflower', 'gift-wrap', 'everlasting-flower'] },
  149: { cat: 'floral-bouquets', tags: ['crochet', 'sunflower', 'black-wrap', 'gift-flower'] },
  150: { cat: 'floral-bouquets', tags: ['crochet', 'sunflower', 'potted-plant', 'table-decor'] },
  151: { cat: 'floral-bouquets', tags: ['crochet', 'sunflower', 'layered-sunflower', 'planter'] },
  152: { cat: 'floral-bouquets', name: 'Artisan Crocheted Potted Sunflower', tags: ['crochet', 'sunflower', 'potted-plant', 'desk-decor'] },
  153: { cat: 'candles-aromatherapy', tags: ['candle', 'swan', 'pillar-candle', 'heirloom'] },
  154: { cat: 'floral-bouquets', tags: ['crochet', 'floral-stem', 'ceramic-vase', 'miniature'] },
  155: { cat: 'candles-aromatherapy', tags: ['candle', 'heart-candle', 'gift-set', 'pastel-hearts'] },
  156: { cat: 'candles-aromatherapy', tags: ['candle', 'pillar-candle', 'textured', 'rose-scented', 'set-of-3'] },
  157: { cat: 'nails-beauty', tags: ['press-on-nails', 'french-ombre', 'pearl-shimmer', 'glass-finish'] },
  158: { cat: 'floral-bouquets', name: 'Artisan Crocheted Potted Spring Blooms', tags: ['crochet', 'tulip', 'pastel-tulips', 'potted-plant'] },
  159: { cat: 'candles-aromatherapy', tags: ['candle', 'dahlia-candle', 'wooden-base', 'floral-candle'] },
  160: { cat: 'candles-aromatherapy', tags: ['candle', 'bubble-candle', 'cube-candle', 'pastel-pair'] },
  161: { cat: 'floral-bouquets', tags: ['crochet', 'twin-sunflowers', 'potted-plant'] },
  162: { cat: 'candles-aromatherapy', tags: ['candle', 'wheat-relief', 'botanical-candle', 'cozy-decor'] },
  163: { cat: 'nails-beauty', tags: ['press-on-nails', 'wine-gloss', 'maroon', 'salon-tip'] },
  164: { cat: 'candles-aromatherapy', tags: ['candle', 'madonna', 'veiled-bust', 'sculpted-candle'] },
  165: { cat: 'candles-aromatherapy', tags: ['candle', 'teak-bowl', 'botanical-candle', 'woodcraft'] },
  166: { cat: 'floral-bouquets', tags: ['crochet', 'yellow-bouquet', 'sunflower-bouquet', 'gift-wrap'] }
};

async function run() {
  console.log('🚀 Starting Master Fix Database Migration...');

  // 1. Schema Alterations
  console.log('1️⃣ Applying Schema Alterations...');
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'`);
  await query(`CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN(tags)`);
  await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_name TEXT`);
  await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_hex CHAR(7)`);
  await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS size TEXT`);
  await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS additional_price NUMERIC(10,2) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_url TEXT`);
  
  await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS pickup_address JSONB NOT NULL DEFAULT '{}'`);
  await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT '{}'`);
  await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS pan_number TEXT`);
  await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS gst_number TEXT`);
  await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS portfolio_images TEXT[] DEFAULT '{}'`);
  await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT NOW()`);
  await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await query(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 10.00`);

  await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS pickup_address JSONB DEFAULT '{}'`);
  await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT '{}'`);
  await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS pan_number TEXT`);
  await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS gst_number TEXT`);
  await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS portfolio_images TEXT[] DEFAULT '{}'`);
  await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT NOW()`);
  await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await query(`ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 10.00`);
  console.log('   ✅ Schema altered successfully.');

  // 2. Consolidate 8 Major Categories
  console.log('2️⃣ Setting up 8 Major Categories...');
  await query(`UPDATE categories SET is_active = FALSE, sort_order = 999`);

  const categoryMap = {}; // slug -> id
  for (const cat of MAJOR_CATEGORIES) {
    const { rows } = await query(
      `INSERT INTO categories (name, display_name, slug, emoji_icon, icon_emoji, sort_order, image_url, banner_image_url, description, is_active, parent_id)
       VALUES ($1, $1, $2, $3, $3, $4, $5, $5, $6, TRUE, NULL)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         display_name = EXCLUDED.display_name,
         emoji_icon = EXCLUDED.emoji_icon,
         icon_emoji = EXCLUDED.icon_emoji,
         sort_order = EXCLUDED.sort_order,
         image_url = EXCLUDED.image_url,
         banner_image_url = EXCLUDED.banner_image_url,
         description = EXCLUDED.description,
         is_active = TRUE,
         parent_id = NULL
       RETURNING id, slug`,
      [cat.name, cat.slug, cat.emoji, cat.sort_order, cat.image_url, cat.description]
    );
    categoryMap[cat.slug] = rows[0].id;
    console.log(`   📁 Major Category: ${cat.name} (id: ${rows[0].id})`);
  }

  // 3. Migrate Products to New Category IDs and Tags
  console.log('3️⃣ Updating Product Categories & Tags...');
  for (const [prodIdStr, data] of Object.entries(PRODUCT_MIGRATIONS)) {
    const prodId = parseInt(prodIdStr, 10);
    const catId = categoryMap[data.cat];
    if (catId) {
      if (data.name) {
        await query(
          `UPDATE products SET category_id = $1, tags = $2::text[], name = $3, updated_at = NOW() WHERE id = $4`,
          [catId, data.tags, data.name, prodId]
        );
      } else {
        await query(
          `UPDATE products SET category_id = $1, tags = $2::text[], updated_at = NOW() WHERE id = $3`,
          [catId, data.tags, prodId]
        );
      }
    }
  }
  console.log('   ✅ All 40 products mapped to new categories and tags.');

  // 4. Merge Duplicate Products into Variants
  console.log('4️⃣ Merging Duplicate Products into Variants...');

  // Group 1: Press-On Nails (Parent: 141)
  const nailParentId = 141;
  await query(`DELETE FROM product_variants WHERE product_id = $1`, [nailParentId]);
  await query(
    `INSERT INTO product_variants (product_id, variant_name, color_name, color_hex, additional_price, stock_qty, image_url)
     VALUES 
       ($1, 'Cherry Bow & Velvet Wine', 'Maroon & Pink Bow', '#581825', 0, 50, '/img/products/meesho_tohfa/pink-mix-nails/1.jpeg'),
       ($1, 'Twilight Lavender Swirl', 'Twilight Lavender', '#9B6FA8', 30, 50, '/img/products/meesho_tohfa/purple-nails/1.jpeg'),
       ($1, 'Pearl French Ombre', 'Glass Pearl Ombre', '#F5EFEB', -20, 50, '/img/products/meesho_tohfa/transparent-nails/1.jpeg')`,
    [nailParentId]
  );
  await query(
    `UPDATE products SET images = ARRAY[
      '/img/products/meesho_tohfa/pink-mix-nails/1.jpeg',
      '/img/products/meesho_tohfa/wine-nails/1.jpeg',
      '/img/products/meesho_tohfa/purple-nails/1.jpeg',
      '/img/products/meesho_tohfa/transparent-nails/1.jpeg'
    ] WHERE id = $1`,
    [nailParentId]
  );
  await query(`UPDATE products SET status = 'deleted', is_active = FALSE WHERE id IN (144, 157, 163)`);
  console.log('   💅 Nails variant merged into Parent ID 141 (deleted 144, 157, 163).');

  // Group 2: Couple Candle (Parent: 140)
  const coupleParentId = 140;
  await query(`DELETE FROM product_variants WHERE product_id = $1`, [coupleParentId]);
  await query(
    `INSERT INTO product_variants (product_id, variant_name, color_name, color_hex, additional_price, stock_qty, image_url)
     VALUES 
       ($1, 'Rose Blush Pink', 'Rose Blush Pink', '#F4A7B9', 0, 50, '/img/products/meesho_tohfa/pink-couple/1.jpeg'),
       ($1, 'Twilight Lavender', 'Twilight Lavender', '#9B6FA8', 0, 50, '/img/products/meesho_tohfa/purple-couple/1.jpeg')`,
    [coupleParentId]
  );
  await query(
    `UPDATE products SET images = ARRAY[
      '/img/products/meesho_tohfa/pink-couple/1.jpeg',
      '/img/products/meesho_tohfa/purple-couple/1.jpeg',
      '/img/products/meesho_tohfa/pink-couple/2.jpeg',
      '/img/products/meesho_tohfa/purple-couple/2.jpeg'
    ] WHERE id = $1`,
    [coupleParentId]
  );
  await query(`UPDATE products SET status = 'deleted', is_active = FALSE WHERE id = 143`);
  console.log('   🕯️ Couple candle merged into Parent ID 140 (deleted 143).');

  // Group 3: Crocheted Sunflower Gift Wrap (Parent: 148)
  const wrapParentId = 148;
  await query(`DELETE FROM product_variants WHERE product_id = $1`, [wrapParentId]);
  await query(
    `INSERT INTO product_variants (product_id, variant_name, color_name, color_hex, additional_price, stock_qty, image_url)
     VALUES 
       ($1, 'Rustic Kraft Beige Wrap', 'Beige Kraft Paper', '#D2B48C', 0, 50, '/img/products/meesho_tohfa/sunf-paper-beidge/1.jpeg'),
       ($1, 'Midnight Elegance Wrap', 'Midnight Black Paper', '#2B2B2B', 0, 50, '/img/products/meesho_tohfa/sunf-paper-black/1.jpeg')`,
    [wrapParentId]
  );
  await query(
    `UPDATE products SET images = ARRAY[
      '/img/products/meesho_tohfa/sunf-paper-beidge/1.jpeg',
      '/img/products/meesho_tohfa/sunf-paper-black/1.jpeg',
      '/img/products/meesho_tohfa/sunf-paper-beidge/2.jpeg',
      '/img/products/meesho_tohfa/sunf-paper-black/2.jpeg'
    ] WHERE id = $1`,
    [wrapParentId]
  );
  await query(`UPDATE products SET status = 'deleted', is_active = FALSE WHERE id = 149`);
  console.log('   🎁 Sunflower Gift Wrap merged into Parent ID 148 (deleted 149).');

  // Group 4: Potted Sunflowers (Parent: 152)
  const sunfParentId = 152;
  await query(`DELETE FROM product_variants WHERE product_id = $1`, [sunfParentId]);
  await query(
    `INSERT INTO product_variants (product_id, variant_name, color_name, color_hex, additional_price, stock_qty, image_url)
     VALUES 
       ($1, 'Rainbow Smiley Bloom', 'Rainbow Smiley Sunflower', '#E74C3C', 0, 50, '/img/products/meesho_tohfa/sunflower-colourful/1.jpeg'),
       ($1, 'Single Golden Bloom', 'Single Golden Sunflower', '#F5B041', 130, 50, '/img/products/meesho_tohfa/sunf-pot-cir/1.jpeg'),
       ($1, 'Twin Sunflower Duo', 'Twin Sunflowers', '#F39C12', 70, 50, '/img/products/meesho_tohfa/two-sunf/1.jpeg')`,
    [sunfParentId]
  );
  await query(
    `UPDATE products SET images = ARRAY[
      '/img/products/meesho_tohfa/sunflower-colourful/1.jpeg',
      '/img/products/meesho_tohfa/sunf-pot-cir/1.jpeg',
      '/img/products/meesho_tohfa/two-sunf/1.jpeg',
      '/img/products/meesho_tohfa/sunflower-colourful/2.jpeg'
    ] WHERE id = $1`,
    [sunfParentId]
  );
  await query(`UPDATE products SET status = 'deleted', is_active = FALSE WHERE id IN (150, 161)`);
  console.log('   🌻 Potted Sunflowers merged into Parent ID 152 (deleted 150, 161).');

  // Group 5: Potted Spring Blooms (Parent: 158)
  const springParentId = 158;
  await query(`DELETE FROM product_variants WHERE product_id = $1`, [springParentId]);
  await query(
    `INSERT INTO product_variants (product_id, variant_name, color_name, color_hex, additional_price, stock_qty, image_url)
     VALUES 
       ($1, 'Pastel Duo Tulips (Blue & Pink)', 'Duo Tulips', '#85C1E9', 0, 50, '/img/products/meesho_tohfa/tulip/1.jpeg'),
       ($1, 'Eternal Velvet Pink Rose', 'Pink Rose Bloom', '#F1948A', 30, 50, '/img/products/meesho_tohfa/pink-rose/1.jpeg'),
       ($1, 'Classic Crimson Red Tulip', 'Crimson Red Tulip', '#C0392B', 60, 50, '/img/products/meesho_tohfa/red-rose/1.jpeg')`,
    [springParentId]
  );
  await query(
    `UPDATE products SET images = ARRAY[
      '/img/products/meesho_tohfa/tulip/1.jpeg',
      '/img/products/meesho_tohfa/pink-rose/1.jpeg',
      '/img/products/meesho_tohfa/red-rose/1.jpeg',
      '/img/products/meesho_tohfa/tulip/2.jpeg'
    ] WHERE id = $1`,
    [springParentId]
  );
  await query(`UPDATE products SET status = 'deleted', is_active = FALSE WHERE id IN (142, 146)`);
  console.log('   🌷 Potted Spring Blooms merged into Parent ID 158 (deleted 142, 146).');

  console.log('\n🎉 Master Fix Database Migration successfully completed!');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
