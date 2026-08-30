/**
 * Tohfa v2 — Migration & Seed: Populate multi-image arrays for variants
 * File: backend/src/db/migrate_variant_images.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { query } = require('../config/db');

async function run() {
  console.log('🚀 Running Multi-Image Variant Migration...');

  // 1. Ensure table columns exist
  await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}'`);
  await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS variant_name TEXT`);
  await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_name TEXT`);
  await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_hex CHAR(7)`);
  await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS size TEXT`);
  await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS additional_price NUMERIC(10,2) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_url TEXT`);
  console.log('✅ Schema verified: product_variants.images column exists.');

  // 2. Map existing product variants to their multi-image folders
  // Group 1: Couple Candle (Product 140)
  // Rose Blush Pink: /img/products/meesho_tohfa/pink-couple/1.jpeg..4.jpeg
  // Twilight Lavender: /img/products/meesho_tohfa/purple-couple/1.jpeg..4.jpeg
  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/pink-couple/1.jpeg',
      '/img/products/meesho_tohfa/pink-couple/2.jpeg',
      '/img/products/meesho_tohfa/pink-couple/3.jpeg',
      '/img/products/meesho_tohfa/pink-couple/4.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/pink-couple/1.jpeg'
    WHERE product_id = 140 AND (variant_name ILIKE '%Rose%' OR color_name ILIKE '%Pink%')
  `);

  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/purple-couple/1.jpeg',
      '/img/products/meesho_tohfa/purple-couple/2.jpeg',
      '/img/products/meesho_tohfa/purple-couple/3.jpeg',
      '/img/products/meesho_tohfa/purple-couple/4.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/purple-couple/1.jpeg'
    WHERE product_id = 140 AND (variant_name ILIKE '%Lavender%' OR color_name ILIKE '%Lavender%' OR color_name ILIKE '%Purple%')
  `);

  // Group 2: Press-On Nails (Product 141)
  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/pink-mix-nails/1.jpeg',
      '/img/products/meesho_tohfa/wine-nails/1.jpeg',
      '/img/products/meesho_tohfa/wine-nails/2.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/pink-mix-nails/1.jpeg'
    WHERE product_id = 141 AND (variant_name ILIKE '%Cherry%' OR color_name ILIKE '%Maroon%')
  `);

  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/purple-nails/1.jpeg',
      '/img/products/meesho_tohfa/purple-nails/2.jpeg',
      '/img/products/meesho_tohfa/purple-nails/3.jpeg',
      '/img/products/meesho_tohfa/purple-nails/4.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/purple-nails/1.jpeg'
    WHERE product_id = 141 AND (variant_name ILIKE '%Lavender%' OR color_name ILIKE '%Lavender%')
  `);

  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/transparent-nails/1.jpeg',
      '/img/products/meesho_tohfa/transparent-nails/2.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/transparent-nails/1.jpeg'
    WHERE product_id = 141 AND (variant_name ILIKE '%Pearl%' OR color_name ILIKE '%Pearl%')
  `);

  // Group 3: Crocheted Sunflower Gift Wrap (Product 148)
  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/sunf-paper-beidge/1.jpeg',
      '/img/products/meesho_tohfa/sunf-paper-beidge/2.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/sunf-paper-beidge/1.jpeg'
    WHERE product_id = 148 AND (variant_name ILIKE '%Kraft%' OR variant_name ILIKE '%Beige%')
  `);

  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/sunf-paper-black/1.jpeg',
      '/img/products/meesho_tohfa/sunf-paper-black/2.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/sunf-paper-black/1.jpeg'
    WHERE product_id = 148 AND (variant_name ILIKE '%Midnight%' OR variant_name ILIKE '%Black%')
  `);

  // Group 4: Potted Sunflowers (Product 152)
  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/sunflower-colourful/1.jpeg',
      '/img/products/meesho_tohfa/sunflower-colourful/2.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/sunflower-colourful/1.jpeg'
    WHERE product_id = 152 AND variant_name ILIKE '%Rainbow%'
  `);

  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/sunf-pot-cir/1.jpeg',
      '/img/products/meesho_tohfa/sunf-pot-cir/2.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/sunf-pot-cir/1.jpeg'
    WHERE product_id = 152 AND variant_name ILIKE '%Single%'
  `);

  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/two-sunf/1.jpeg',
      '/img/products/meesho_tohfa/two-sunf/2.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/two-sunf/1.jpeg'
    WHERE product_id = 152 AND variant_name ILIKE '%Twin%'
  `);

  // Group 5: Potted Spring Blooms (Product 158)
  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/tulip/1.jpeg',
      '/img/products/meesho_tohfa/tulip/2.jpeg',
      '/img/products/meesho_tohfa/tulip/3.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/tulip/1.jpeg'
    WHERE product_id = 158 AND variant_name ILIKE '%Tulip%' AND variant_name ILIKE '%Pastel%'
  `);

  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/pink-rose/1.jpeg',
      '/img/products/meesho_tohfa/pink-rose/2.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/pink-rose/1.jpeg'
    WHERE product_id = 158 AND variant_name ILIKE '%Pink Rose%'
  `);

  await query(`
    UPDATE product_variants
    SET images = ARRAY[
      '/img/products/meesho_tohfa/red-rose/1.jpeg',
      '/img/products/meesho_tohfa/red-rose/2.jpeg'
    ],
    image_url = '/img/products/meesho_tohfa/red-rose/1.jpeg'
    WHERE product_id = 158 AND variant_name ILIKE '%Crimson%'
  `);

  // Fallback: for any variant with image_url and empty images array, populate images with [image_url]
  await query(`
    UPDATE product_variants
    SET images = ARRAY[image_url]
    WHERE (images IS NULL OR array_length(images, 1) = 0 OR images = '{}') AND image_url IS NOT NULL
  `);

  console.log('🎉 Successfully migrated multi-image arrays for all product variants!');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
