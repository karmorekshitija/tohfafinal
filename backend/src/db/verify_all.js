'use strict';

require('dotenv').config();
const { query } = require('../config/db');

async function verifyAll() {
  console.log('===============================================================');
  console.log('🔍 VERIFYING MEESHO_TOHFA_NEW PRODUCT BATCH & 3 SPECIAL SHOPS');
  console.log('===============================================================\n');

  const EXPECTED_NEW_PRODUCTS = [
    // --- CANDLE STORY (9 products) ---
    {
      name: 'Ocean Shells Gel Candle',
      shop: 'The Candle Story',
      price: 399,
      categorySlug: 'candles-aromatherapy',
      expectedImages: 4,
      descSnippet: 'A clear gel candle layered with sand and real seashells'
    },
    {
      name: 'Coastal Shell Jar Candle',
      shop: 'The Candle Story',
      price: 349,
      categorySlug: 'candles-aromatherapy',
      expectedImages: 2,
      descSnippet: 'A soy candle poured into a handcrafted ceramic seashell-shaped jar'
    },
    {
      name: 'Pumpkin Ceramic Jar Candle',
      shop: 'The Candle Story',
      price: 449,
      categorySlug: 'candles-aromatherapy',
      expectedImages: 3,
      descSnippet: 'A ribbed ceramic pumpkin jar with a fitted lid'
    },
    {
      name: 'Rose Candle Gift Box (Set of 4)',
      shop: 'The Candle Story',
      price: 599,
      categorySlug: 'candles-aromatherapy',
      expectedImages: 3,
      descSnippet: 'A gift box of 4 rose-shaped pillar candles'
    },
    {
      name: 'Rose Textured Pillar Candle',
      shop: 'The Candle Story',
      price: 329,
      categorySlug: 'candles-aromatherapy',
      expectedImages: 3,
      descSnippet: 'A tall red pillar candle carved all over with a rose-petal relief'
    },
    {
      name: 'Heart Rose Candle',
      shop: 'The Candle Story',
      price: 249,
      categorySlug: 'candles-aromatherapy',
      expectedImages: 3,
      expectedVariants: 2,
      descSnippet: 'A heart-shaped rose candle with a small gold bead center'
    },
    {
      name: 'Classic Pillar Candle Trio (Red)',
      shop: 'The Candle Story',
      price: 379,
      categorySlug: 'candles-aromatherapy',
      expectedImages: 4,
      descSnippet: 'A set of 3 plain red pillar candles in graduated heights'
    },
    {
      name: 'Blue Daisy Scented Jar Candle',
      shop: 'The Candle Story',
      price: 299,
      categorySlug: 'candles-aromatherapy',
      expectedImages: 3,
      descSnippet: 'A handmade soy wax jar candle topped with 3 blue daisy wax embeds'
    },
    {
      name: 'Rose Favor Candles on Stick (Set of 6)',
      shop: 'The Candle Story',
      price: 499,
      categorySlug: 'candles-aromatherapy',
      expectedImages: 3,
      descSnippet: '6 mini ivory rose candles on wooden sticks'
    },
    {
      name: 'Pink Daisy Stick Candle',
      shop: 'The Candle Story',
      price: 129,
      categorySlug: 'candles-aromatherapy',
      expectedImages: 3,
      descSnippet: 'A single pink daisy-shaped candle on a wooden stick'
    },

    // --- NAILS DIVA (6 products) ---
    {
      name: 'Polka Dot & Floral Press-On Nails',
      shop: 'Nails Diva',
      price: 349,
      categorySlug: 'nails-beauty',
      expectedImages: 4,
      descSnippet: 'A press-on nail set mixing nude, red French tips, polka dots'
    },
    {
      name: 'Black & Gold 3D Charm Nails',
      shop: 'Nails Diva',
      price: 449,
      categorySlug: 'nails-beauty',
      expectedImages: 4,
      descSnippet: 'Almond-shaped press-ons in smoky black and nude tones'
    },
    {
      name: 'Cheetah Print Floral 3D Nails',
      shop: 'Nails Diva',
      price: 399,
      categorySlug: 'nails-beauty',
      expectedImages: 3,
      descSnippet: 'Press-on nails in warm brown tones with cheetah print'
    },
    {
      name: 'White Swirl French Tip Nails',
      shop: 'Nails Diva',
      price: 329,
      categorySlug: 'nails-beauty',
      expectedImages: 3,
      descSnippet: 'Almond press-on nails with a modern white swirl'
    },
    {
      name: 'Pink 3D Floral Press-On Nails',
      shop: 'Nails Diva',
      price: 379,
      categorySlug: 'nails-beauty',
      expectedImages: 4,
      descSnippet: 'Soft pink press-ons with silver ring accents'
    },
    {
      name: 'Red & Gold Festive 3D Nails',
      shop: 'Nails Diva',
      price: 429,
      categorySlug: 'nails-beauty',
      expectedImages: 2,
      descSnippet: 'A festive press-on set mixing red, nude, and gold-rimmed nails'
    },

    // --- CROCHET LADY (1 product) ---
    {
      name: 'Crochet Evil Eye Keychain',
      shop: 'Crochet Lady',
      price: 149,
      categorySlug: 'gifts-keepsakes',
      expectedImages: 4,
      descSnippet: 'A round crochet keychain in classic evil-eye blue'
    }
  ];

  let passCount = 0;

  for (const item of EXPECTED_NEW_PRODUCTS) {
    const { rows } = await query(`
      SELECT p.id, p.name, p.base_price, p.description, p.category_id,
             u.name AS shop_name, c.slug AS cat_slug,
             (SELECT json_agg(pi.url ORDER BY pi.sort_order) FROM product_images pi WHERE pi.product_id = p.id) AS images,
             (SELECT json_agg(json_build_object(
                'variant_name', pv.variant_name,
                'color_name', pv.color_name,
                'color_hex', pv.color_hex,
                'images', pv.images
              )) FROM product_variants pv WHERE pv.product_id = p.id) AS variants
      FROM products p
      JOIN users u ON u.id = p.seller_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.name = $1
    `, [item.name]);

    if (rows.length === 0) {
      throw new Error(`❌ Missing product: "${item.name}" not found in DB!`);
    }

    const p = rows[0];

    // Verify shop
    if (p.shop_name !== item.shop) {
      throw new Error(`❌ Shop mismatch for "${item.name}": expected "${item.shop}", got "${p.shop_name}"`);
    }

    // Verify price
    if (Number(p.base_price) !== item.price) {
      throw new Error(`❌ Price mismatch for "${item.name}": expected ₹${item.price}, got ₹${p.base_price}`);
    }

    // Verify description
    if (!p.description || !p.description.includes(item.descSnippet)) {
      throw new Error(`❌ Description mismatch for "${item.name}": "${p.description}" does not include "${item.descSnippet}"`);
    }

    // Verify gallery images
    const imgList = p.images || [];
    if (imgList.length !== item.expectedImages) {
      throw new Error(`❌ Gallery images count mismatch for "${item.name}": expected ${item.expectedImages}, got ${imgList.length}`);
    }

    // Verify Heart Rose Candle variants
    if (item.expectedVariants) {
      const vars = p.variants || [];
      if (vars.length !== item.expectedVariants) {
        throw new Error(`❌ Variants mismatch for "${item.name}": expected ${item.expectedVariants}, got ${vars.length}`);
      }
      const varNames = vars.map(v => v.color_name || v.variant_name);
      if (!varNames.includes('Pink') || !varNames.includes('White')) {
        throw new Error(`❌ Variants missing Pink or White: ${JSON.stringify(vars)}`);
      }
      console.log(`   🎨 Variants for "${item.name}":`, vars.map(v => `${v.variant_name} (${v.color_hex}) [${v.images?.length || 0} imgs]`).join(', '));
    }

    console.log(`✅ [PASS] "${p.name}" -> ${p.shop_name} | ₹${p.base_price} | ${imgList.length} gallery images | Cat: ${p.cat_slug}`);
    passCount++;
  }

  // Verify that "chai candle" was NOT seeded
  const { rows: chaiRows } = await query("SELECT id, name FROM products WHERE name ILIKE '%chai candle%' OR name ILIKE '%chai%candle%'");
  if (chaiRows.length > 0) {
    throw new Error('❌ "chai candle" was found in database, but was supposed to be skipped!');
  }
  console.log('✅ [PASS] "chai candle" correctly skipped and absent from DB.\n');

  // Verify Shop Totals
  const { rows: shopTotals } = await query(`
    SELECT u.name AS shop_name, sp.slug, COUNT(p.id) AS product_count
    FROM users u
    LEFT JOIN seller_profiles sp ON sp.user_id = u.id
    LEFT JOIN products p ON p.seller_id = u.id
    WHERE u.id IN (121, 122, 123)
    GROUP BY u.name, sp.slug
    ORDER BY u.name
  `);

  console.log('=== SPECIAL SHOPS PRODUCT COUNTS ===');
  console.table(shopTotals);

  console.log('\n===============================================================');
  console.log(`🎉 ALL ${passCount} NEW PRODUCTS VERIFIED WITH 100% INTEGRITY!`);
  console.log('===============================================================\n');
}

if (require.main === module) {
  verifyAll()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Verification Error:', err.message);
      process.exit(1);
    });
}

module.exports = { verifyAll };
