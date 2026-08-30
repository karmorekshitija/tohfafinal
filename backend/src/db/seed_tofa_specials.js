/**
 * Tohfa v2 — TOFA Special Master Seeder (3 Admin-Managed Shops)
 * File: backend/src/db/seed_tofa_specials.js
 * 
 * Rebuilds the curated TOFA Special catalog exclusively into exactly THREE shops:
 * 1. Crochet Lady (slug: crochet-lady)
 * 2. The Candle Story (slug: the-candle-story)
 * 3. Nails Diva (slug: nails-diva)
 * 
 * Purges the legacy "Tohfa Official Store" and "Tohfa Official Curated" single-seller models,
 * distributes all 40 meesho_tohfa image folders (152 photos) into complete product galleries,
 * splits mixed folders, and populates product_variants with multi-image arrays and color swatches.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { query } = require('../config/db');

const MEESHO_DIR = path.resolve(__dirname, '../../../frontend/public/img/products/meesho_tohfa');
const URL_PREFIX = '/img/products/meesho_tohfa';

const MEESHO_NEW_DIR = path.resolve(__dirname, '../../../frontend/public/img/products/meesho_tohfa_new');
const NEW_URL_PREFIX = '/img/products/meesho_tohfa_new';

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

const SPECIAL_SHOPS = [
  {
    store_name: 'Crochet Lady',
    slug: 'crochet-lady',
    email: 'crochetlady@thetohfa.in',
    phone: '9876500001',
    bio: 'Bespoke hand-crocheted everlasting flowers, botanical bouquets, and artisanal yarn keepsakes handcrafted with love.',
    pickup_address: {
      address_line1: 'Studio 101, Artisan Textile Hub',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302001',
      country: 'India'
    }
  },
  {
    store_name: 'The Candle Story',
    slug: 'the-candle-story',
    email: 'thecandlestory@thetohfa.in',
    phone: '9876500002',
    bio: 'Hand-poured 100% natural soy wax aromatherapy candles, botanical fragrance pillars, and calming ambient lights.',
    pickup_address: {
      address_line1: 'Workshop 4B, Aroma Craft Estate',
      city: 'Udaipur',
      state: 'Rajasthan',
      pincode: '313001',
      country: 'India'
    }
  },
  {
    store_name: 'Nails Diva',
    slug: 'nails-diva',
    email: 'nailsdiva@thetohfa.in',
    phone: '9876500003',
    bio: 'Salon-quality handcrafted press-on nails, luxury reusable gel art finishes, and bespoke manicure creations.',
    pickup_address: {
      address_line1: 'Suite 204, Creative Beauty Labs',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      country: 'India'
    }
  }
];

const CATEGORY_DEFINITIONS = {
  'nails': { name: 'Nails & Beauty', slug: 'nails-beauty', emoji: '💅' },
  'candles': { name: 'Candles & Aromatherapy', slug: 'candles-aromatherapy', emoji: '🕯️' },
  'floral': { name: 'Floral & Bouquets', slug: 'floral-bouquets', emoji: '🌸' },
  'hair': { name: 'Hair Accessories', slug: 'hair-accessories', emoji: '🎀' },
  'keepsakes': { name: 'Gifts & Keepsakes', slug: 'gifts-keepsakes', emoji: '🎁' }
};

const categoryIdCache = {};
async function getCategoryId(catKey) {
  if (categoryIdCache[catKey]) return categoryIdCache[catKey];
  const def = CATEGORY_DEFINITIONS[catKey] || CATEGORY_DEFINITIONS['keepsakes'];

  let { rows } = await query(
    'SELECT id FROM categories WHERE slug = $1 OR name = $2 OR slug ILIKE $3 LIMIT 1',
    [def.slug, def.name, `%${catKey}%`]
  );

  if (rows.length > 0) {
    categoryIdCache[catKey] = rows[0].id;
    return rows[0].id;
  }

  const insertRes = await query(
    'INSERT INTO categories (name, slug, is_active) VALUES ($1, $2, TRUE) RETURNING id',
    [def.name, def.slug]
  );
  categoryIdCache[catKey] = insertRes.rows[0].id;
  return insertRes.rows[0].id;
}

function getFolderImages(folderName) {
  const folderPath = path.join(MEESHO_DIR, folderName);
  if (!fs.existsSync(folderPath)) {
    console.warn(`⚠️ Warning: Folder ${folderName} not found in ${MEESHO_DIR}`);
    return [];
  }
  const files = fs.readdirSync(folderPath)
    .filter(f => !f.startsWith('.') && f.match(/\.(jpe?g|png|webp)$/i))
    .sort((a, b) => {
      const numA = parseInt(a, 10) || 0;
      const numB = parseInt(b, 10) || 0;
      return numA - numB || a.localeCompare(b);
    });
  return files.map(f => `${URL_PREFIX}/${folderName}/${f}`);
}

function getNewFolderImages(folderName) {
  const folderPath = path.join(MEESHO_NEW_DIR, folderName);
  if (!fs.existsSync(folderPath)) {
    console.warn(`⚠️ Warning: Folder "${folderName}" not found in ${MEESHO_NEW_DIR}`);
    return [];
  }
  const files = fs.readdirSync(folderPath)
    .filter(f => !f.startsWith('.') && !f.startsWith('._') && f.match(/\.(jpe?g|png|webp)$/i))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  if (files.length === 0) {
    console.warn(`⚠️  [SKIPPED] Folder "${folderName}" has NO images inside (skipped or empty).`);
    return [];
  }
  return files.map(f => `${NEW_URL_PREFIX}/${folderName}/${f}`);
}

// Master Products Definition (Exact 40 folders mapped to 38 products across 3 shops)
const PRODUCTS_CATALOG = [
  // ==========================================
  // NAILS DIVA (4 Products)
  // ==========================================
  {
    shop: 'Nails Diva',
    name: 'Wine Cherry Blossom Press-On Nails',
    catKey: 'nails',
    price: 389,
    preparationDays: 1,
    weightGrams: 80,
    folders: ['wine-nails'],
    description: 'Sophisticated deep burgundy and cherry blossom press-on nails with reinforced salon tips. Hand-crafted with ultra-gloss gel finish for a luxurious, high-fashion evening look. Includes full application kit.'
  },
  {
    shop: 'Nails Diva',
    name: 'Purple Press-On Nails',
    catKey: 'nails',
    price: 379,
    preparationDays: 1,
    weightGrams: 80,
    folders: ['purple-nails'],
    description: 'Royal amethyst and royal lilac press-on nails featuring subtle holographic sheen and salon-grade gel topcoat for long-lasting, chip-resistant elegance.'
  },
  {
    shop: 'Nails Diva',
    name: 'Transparent Nude Press-On Nails',
    catKey: 'nails',
    price: 329,
    preparationDays: 1,
    weightGrams: 80,
    folders: ['transparent-nails'],
    description: 'Crystal clear glass-gloss press-on nails with soft French ombre gradients and natural nude undertones. Effortlessly chic and reusable.'
  },
  {
    shop: 'Nails Diva',
    name: 'Pink Bow Press-On Nails',
    catKey: 'nails',
    price: 349,
    preparationDays: 1,
    weightGrams: 80,
    folders: ['pink-mix-nails'],
    description: 'Romantic blush pink press-on nails embellished with delicate 3D bow accents and rose quartz marbling. Reusable and gentle on natural nails.'
  },
  {
    shop: 'Nails Diva',
    name: 'Polka Dot & Floral Press-On Nails',
    catKey: 'nails',
    price: 349,
    preparationDays: 1,
    weightGrams: 80,
    directImages: getNewFolderImages('aesthetic beach nails'),
    description: 'A press-on nail set mixing nude, red French tips, polka dots, and a hand-painted floral accent nail.'
  },
  {
    shop: 'Nails Diva',
    name: 'Black & Gold 3D Charm Nails',
    catKey: 'nails',
    price: 449,
    preparationDays: 1,
    weightGrams: 80,
    directImages: getNewFolderImages('aesthetic black nails'),
    description: 'Almond-shaped press-ons in smoky black and nude tones with gold foil detailing and 3D charm accents.'
  },
  {
    shop: 'Nails Diva',
    name: 'Cheetah Print Floral 3D Nails',
    catKey: 'nails',
    price: 399,
    preparationDays: 1,
    weightGrams: 80,
    directImages: getNewFolderImages('brown aesthetic nails'),
    description: 'Press-on nails in warm brown tones with cheetah print and 3D floral accents, comes in a reusable case.'
  },
  {
    shop: 'Nails Diva',
    name: 'White Swirl French Tip Nails',
    catKey: 'nails',
    price: 329,
    preparationDays: 1,
    weightGrams: 80,
    directImages: getNewFolderImages('nails white strips'),
    description: 'Almond press-on nails with a modern white swirl take on the classic French tip.'
  },
  {
    shop: 'Nails Diva',
    name: 'Pink 3D Floral Press-On Nails',
    catKey: 'nails',
    price: 379,
    preparationDays: 1,
    weightGrams: 80,
    directImages: getNewFolderImages('pink nails'),
    description: 'Soft pink press-ons with silver ring accents and delicate 3D flower details, comes in a travel case.'
  },
  {
    shop: 'Nails Diva',
    name: 'Red & Gold Festive 3D Nails',
    catKey: 'nails',
    price: 429,
    preparationDays: 1,
    weightGrams: 80,
    directImages: getNewFolderImages('red and white nails'),
    description: 'A festive press-on set mixing red, nude, and gold-rimmed nails with 3D floral and star details.'
  },

  // ==========================================
  // THE CANDLE STORY (17 Products)
  // ==========================================
  {
    shop: 'The Candle Story',
    name: 'Stacked Puppies Candle',
    catKey: 'candles',
    price: 499,
    preparationDays: 2,
    weightGrams: 400,
    folders: ['dog'],
    description: 'Artisanal hand-poured soy wax sculptural candle featuring charming stacked puppy companions. Infused with gentle natural vanilla and sweet almond oils.'
  },
  {
    shop: 'The Candle Story',
    name: 'Golden Retriever Round Candle',
    catKey: 'candles',
    price: 449,
    preparationDays: 2,
    weightGrams: 350,
    folders: ['dog-round'],
    description: 'Delightful rounded sphere candle with finely molded Golden Retriever relief artwork. Poured from 100% organic soy wax with a clean cotton wick.'
  },
  {
    shop: 'The Candle Story',
    name: 'Chess Knight Horse Candle',
    catKey: 'candles',
    price: 549,
    preparationDays: 2,
    weightGrams: 450,
    folders: ['horse'],
    description: 'Stately chess knight equine bust candle crafted with majestic architectural details. Scented with warm cedarwood and amber resin.'
  },
  {
    shop: 'The Candle Story',
    name: 'Stacked Owls Candle',
    catKey: 'candles',
    price: 479,
    preparationDays: 2,
    weightGrams: 380,
    folders: ['owl'],
    description: 'Intricately textured sculptural pillar candle depicting wise owls perched in harmony. Clean burning with cozy sandalwood essential oils.'
  },
  {
    shop: 'The Candle Story',
    name: 'Swan Relief Pillar Candle',
    catKey: 'candles',
    price: 649,
    preparationDays: 2,
    weightGrams: 500,
    folders: ['swan'],
    description: 'Majestic ceramic-style pillar candle featuring elegant swan bas-relief sculpting. Scented with soothing white jasmine and water lily.'
  },
  {
    shop: 'The Candle Story',
    name: 'Botanical Wooden Jar Candle',
    catKey: 'candles',
    price: 599,
    preparationDays: 2,
    weightGrams: 450,
    folders: ['wooden'],
    description: 'Hand-turned natural teakwood grain jar candle filled with pure botanical soy wax infused with walnut blossom and cedar.'
  },
  {
    shop: 'The Candle Story',
    name: 'Wheat & Lavender Relief Candle',
    catKey: 'candles',
    price: 499,
    preparationDays: 2,
    weightGrams: 420,
    folders: ['wheat'],
    description: 'Warm rustic pillar candle embossed with botanical golden wheat stalks and French lavender sprigs. Calming aroma with slow, even burn.'
  },
  {
    shop: 'The Candle Story',
    name: 'Flower-Top Jar Candle',
    catKey: 'candles',
    price: 449,
    preparationDays: 2,
    weightGrams: 380,
    folders: ['orange'],
    description: 'Vibrant decorative jar candle topped with hand-sculpted floral wax petals. Infused with refreshing blood orange and bergamot.'
  },
  {
    shop: 'The Candle Story',
    name: 'Chrysanthemum Flower Candle',
    catKey: 'candles',
    price: 499,
    preparationDays: 2,
    weightGrams: 400,
    folders: ['two-flo'],
    description: 'Exquisite chrysanthemum blossom bloom candle hand-poured with intricate multi-layered petal detailing on a natural wooden coaster base.',
    variants: [
      {
        variant_name: 'Sky Blue',
        color_name: 'Blue',
        color_hex: '#5B92E5',
        images: getFolderImages('two-flo'),
        additional_price: 0,
        stock_qty: 30
      },
      {
        variant_name: 'Ivory Cream',
        color_name: 'Cream',
        color_hex: '#FFFDD0',
        images: getFolderImages('two-flo'),
        additional_price: 0,
        stock_qty: 30
      }
    ]
  },
  {
    shop: 'The Candle Story',
    name: 'Bubble Cube Candle',
    catKey: 'candles',
    price: 399,
    preparationDays: 2,
    weightGrams: 300,
    folders: ['two-grid'],
    description: 'Trendy modernist geometric bubble cube candle crafted from organic soy wax. A minimalist aesthetic accent for modern desks and bedside nooks.',
    variants: [
      {
        variant_name: 'Pastel Pink',
        color_name: 'Pink',
        color_hex: '#FFB6C1',
        images: getFolderImages('two-grid'),
        additional_price: 0,
        stock_qty: 25
      },
      {
        variant_name: 'Warm Cream',
        color_name: 'Cream',
        color_hex: '#FFFDD0',
        images: getFolderImages('two-grid'),
        additional_price: 0,
        stock_qty: 25
      }
    ]
  },
  {
    shop: 'The Candle Story',
    name: 'Heart Trio Candle Gift Box',
    catKey: 'candles',
    price: 549,
    preparationDays: 2,
    weightGrams: 400,
    folders: ['three-heart'],
    description: 'Artisanal gift box set of three sweet heart-shaped soy candles. Scented with wild rosewater and Madagascar vanilla.'
  },
  {
    shop: 'The Candle Story',
    name: 'Ribbed Pillar Candle',
    catKey: 'candles',
    price: 499,
    preparationDays: 2,
    weightGrams: 450,
    folders: ['night-candle-two'],
    description: 'Set of two cylindrical ribbed pillar candles in deep indigo and midnight navy. Creates dramatic ambient shadows when lit.'
  },
  {
    shop: 'The Candle Story',
    name: 'Ribbed Bobbin Candle',
    catKey: 'candles',
    price: 399,
    preparationDays: 2,
    weightGrams: 320,
    folders: ['single-straight'],
    description: 'Scandinavian-style fluted straight candle with linear ribbed silhouette. Sleek, smokeless, and poured from premium plant waxes.'
  },
  {
    shop: 'The Candle Story',
    name: 'Rose Pillar Candle Trio',
    catKey: 'candles',
    price: 649,
    preparationDays: 2,
    weightGrams: 600,
    folders: ['three-pink-candle'],
    description: 'Trio of gradated rose-pink textured pillar candles infused with organic Bulgarian rose petal extracts and gentle white musk.'
  },
  {
    shop: 'The Candle Story',
    name: 'Mother & Child Relief Candle',
    catKey: 'candles',
    price: 799,
    preparationDays: 3,
    weightGrams: 550,
    folders: ['mother'],
    description: 'Heartwarming sculptural candle celebrating motherhood and maternal grace. Meticulously cast in non-toxic natural wax.'
  },
  {
    shop: 'The Candle Story',
    name: 'Madonna Bust Candle',
    catKey: 'candles',
    price: 799,
    preparationDays: 3,
    weightGrams: 550,
    folders: ['women'],
    description: 'Classical Greco-Roman inspired bust sculpture candle celebrating feminine serenity and inner strength. A striking centerpiece.'
  },
  {
    shop: 'The Candle Story',
    name: 'Enchanted Cottage Candle',
    catKey: 'candles',
    price: 699,
    preparationDays: 2,
    weightGrams: 450,
    folders: ['home'],
    description: 'Whimsical fairytale cottage candle complete with thatched roof textures and chimney detail. Scented with warm cinnamon bark and baked apple.'
  },
  {
    shop: 'The Candle Story',
    name: 'Embracing Couple Candle',
    catKey: 'candles',
    price: 699,
    preparationDays: 2,
    weightGrams: 500,
    folders: ['pink-couple', 'purple-couple'],
    description: 'Romantic poetic sculpture candle depicting two souls in gentle companionable embrace wrapped in floral robes.',
    variants: [
      {
        variant_name: 'Blush Pink',
        color_name: 'Blush Pink',
        color_hex: '#FFB6C1',
        images: getFolderImages('pink-couple'),
        additional_price: 0,
        stock_qty: 30
      },
      {
        variant_name: 'Twilight Purple',
        color_name: 'Twilight Purple',
        color_hex: '#9370DB',
        images: getFolderImages('purple-couple'),
        additional_price: 0,
        stock_qty: 30
      }
    ]
  },
  {
    shop: 'The Candle Story',
    name: 'Ocean Shells Gel Candle',
    catKey: 'candles',
    price: 399,
    preparationDays: 2,
    weightGrams: 400,
    directImages: getNewFolderImages('blue ocean candle'),
    description: 'A clear gel candle layered with sand and real seashells, capturing a mini ocean scene in a glass tumbler.'
  },
  {
    shop: 'The Candle Story',
    name: 'Coastal Shell Jar Candle',
    catKey: 'candles',
    price: 349,
    preparationDays: 2,
    weightGrams: 380,
    directImages: getNewFolderImages('shell candle'),
    description: 'A soy candle poured into a handcrafted ceramic seashell-shaped jar, perfect for a coastal-themed corner.'
  },
  {
    shop: 'The Candle Story',
    name: 'Pumpkin Ceramic Jar Candle',
    catKey: 'candles',
    price: 449,
    preparationDays: 2,
    weightGrams: 450,
    directImages: getNewFolderImages('capsicum candle'),
    description: 'A ribbed ceramic pumpkin jar with a fitted lid, doubling as a candle holder and a decorative trinket box after the candle is done.'
  },
  {
    shop: 'The Candle Story',
    name: 'Rose Candle Gift Box (Set of 4)',
    catKey: 'candles',
    price: 599,
    preparationDays: 2,
    weightGrams: 500,
    directImages: getNewFolderImages('four lotus candle'),
    description: 'A gift box of 4 rose-shaped pillar candles, two red and two white, individually wrapped inside.'
  },
  {
    shop: 'The Candle Story',
    name: 'Rose Textured Pillar Candle',
    catKey: 'candles',
    price: 329,
    preparationDays: 2,
    weightGrams: 350,
    directImages: getNewFolderImages('red rose candle'),
    description: 'A tall red pillar candle carved all over with a rose-petal relief pattern. Sold individually; product photo shows two for scale.'
  },
  {
    shop: 'The Candle Story',
    name: 'Heart Rose Candle',
    catKey: 'candles',
    price: 249,
    preparationDays: 2,
    weightGrams: 300,
    directImages: getNewFolderImages('pin white love candle'),
    description: 'A heart-shaped rose candle with a small gold bead center, available in soft pink or ivory white.',
    variants: [
      {
        variant_name: 'Soft Pink',
        color_name: 'Pink',
        color_hex: '#FFB6C1',
        images: getNewFolderImages('pin white love candle'),
        additional_price: 0,
        stock_qty: 30
      },
      {
        variant_name: 'Ivory White',
        color_name: 'White',
        color_hex: '#FFFDD0',
        images: getNewFolderImages('pin white love candle'),
        additional_price: 0,
        stock_qty: 30
      }
    ]
  },
  {
    shop: 'The Candle Story',
    name: 'Classic Pillar Candle Trio (Red)',
    catKey: 'candles',
    price: 379,
    preparationDays: 2,
    weightGrams: 450,
    directImages: getNewFolderImages('red three canldes plain'),
    description: 'A set of 3 plain red pillar candles in graduated heights, unscented, ideal for festive table styling.'
  },
  {
    shop: 'The Candle Story',
    name: 'Blue Daisy Scented Jar Candle',
    catKey: 'candles',
    price: 299,
    preparationDays: 2,
    weightGrams: 350,
    directImages: getNewFolderImages('scented blue white candle'),
    description: 'A handmade soy wax jar candle topped with 3 blue daisy wax embeds, lightly scented.'
  },
  {
    shop: 'The Candle Story',
    name: 'Rose Favor Candles on Stick (Set of 6)',
    catKey: 'candles',
    price: 499,
    preparationDays: 2,
    weightGrams: 300,
    directImages: getNewFolderImages('white stick candle'),
    description: '6 mini ivory rose candles on wooden sticks, each tied with a mint organza bow — great as party favors or cake toppers.'
  },
  {
    shop: 'The Candle Story',
    name: 'Pink Daisy Stick Candle',
    catKey: 'candles',
    price: 129,
    preparationDays: 1,
    weightGrams: 100,
    directImages: getNewFolderImages('pink single flower'),
    description: 'A single pink daisy-shaped candle on a wooden stick with a satin bow, sold individually.'
  },

  // ==========================================
  // CROCHET LADY (18 Products)
  // ==========================================
  {
    shop: 'Crochet Lady',
    name: 'Evil Eye Crochet Flower Pot',
    catKey: 'floral',
    price: 599,
    preparationDays: 2,
    weightGrams: 300,
    folders: ['evileye-pot'],
    description: 'Protective Nazar Evil Eye motif handcrafted in everlasting cotton yarn flower pot. An auspicious and vibrant decorative desk bloom.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Potted Rose',
    catKey: 'floral',
    price: 499,
    preparationDays: 2,
    weightGrams: 280,
    folders: ['pink-rose'],
    description: 'Delicate hand-crocheted blush pink rose in a mini textured yarn planter pot. Soft, everlasting, and wired for custom stem styling.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Potted Tulip (Red)',
    catKey: 'floral',
    price: 529,
    preparationDays: 2,
    weightGrams: 290,
    folders: ['red-rose'], // Folder name red-rose contains red tulip
    description: 'Vibrant crimson Dutch tulip hand-crocheted with rich petal folds in an earthen-toned knitted pot. A timeless everlasting floral keepsake.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Two-Tone Tulip Pot',
    catKey: 'floral',
    price: 499,
    preparationDays: 2,
    weightGrams: 300,
    folders: ['tulip'],
    description: 'Charming pastel dual-tulip arrangement featuring baby blue and blossom pink crocheted flowers together in one pot.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Wildflower Bouquet',
    catKey: 'floral',
    price: 799,
    preparationDays: 3,
    weightGrams: 450,
    folders: ['bouquet'],
    description: 'Bountiful hand-crocheted meadow bouquet combining lilies, sunflowers, wheat stalks, and daisies wrapped in delicate kraft tissue.'
  },
  {
    shop: 'Crochet Lady',
    name: 'You Are My Sunshine Crochet Bouquet',
    catKey: 'floral',
    price: 749,
    preparationDays: 3,
    weightGrams: 420,
    folders: ['yellow-bouquet'],
    description: 'Radiant all-yellow crocheted bouquet radiating warmth and optimism. Includes sunflowers, daisies, and matching yellow wrapping.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Three-Daisy Pot (White Ceramic)',
    catKey: 'floral',
    price: 599,
    preparationDays: 2,
    weightGrams: 350,
    folders: ['three-flo'],
    description: 'Trio of sunny smiling daisies handcrafted in premium milk cotton yarn, seated in a white textured pot.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Rainbow Daisy Bouquet (Pink Box)',
    catKey: 'floral',
    price: 699,
    preparationDays: 2,
    weightGrams: 400,
    folders: ['mix-flower-pot'],
    description: 'Joyful assortment of colorful crocheted mini daisies presented in a delicate pink keepsake gift box with decorative bow.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Potted Sunflower',
    catKey: 'floral',
    price: 549,
    preparationDays: 2,
    weightGrams: 320,
    folders: ['sunf-pot-cir', 'sunf-pot-square'],
    description: 'Cheerful hand-crocheted blooming sunflower with detailed center disk and lush leaves in an artisanal knitted planter.',
    variants: [
      {
        variant_name: 'Mini Scalloped Pot (Cream)',
        color_name: 'Cream',
        color_hex: '#FFFDD0',
        images: getFolderImages('sunf-pot-cir'),
        additional_price: 0,
        stock_qty: 25
      },
      {
        variant_name: 'Artisan Textured Pot (Tan)',
        color_name: 'Tan',
        color_hex: '#D2B48C',
        images: getFolderImages('sunf-pot-square'),
        additional_price: 50,
        stock_qty: 20
      }
    ]
  },
  {
    shop: 'Crochet Lady',
    name: 'Rainbow Smiley Sunflower Pot',
    catKey: 'floral',
    price: 499,
    preparationDays: 2,
    weightGrams: 300,
    folders: ['sunflower-colourful'],
    description: 'Novelty sunshine crochet sunflower featuring a cheerful smiling face center and vibrant multi-color petal accents.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Double Sunflower Pot',
    catKey: 'floral',
    price: 549,
    preparationDays: 2,
    weightGrams: 340,
    folders: ['two-sunf'],
    description: 'Twin blooming sunflowers sharing a single knitted desktop pot with deep chocolate centers and lush foliage.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Single Sunflower Bouquet',
    catKey: 'floral',
    price: 399,
    preparationDays: 1,
    weightGrams: 220,
    folders: ['sunf-paper-beidge', 'sunf-paper-black'],
    description: 'Individual statement crocheted sunflower stem wrapped in artisanal paper wrap and tied with natural jute twine.',
    variants: [
      {
        variant_name: 'Kraft Beige Wrap',
        color_name: 'Kraft Beige',
        color_hex: '#D2B48C',
        images: getFolderImages('sunf-paper-beidge'),
        additional_price: 0,
        stock_qty: 35
      },
      {
        variant_name: 'Navy Black Wrap',
        color_name: 'Navy Black',
        color_hex: '#1A1A24',
        images: getFolderImages('sunf-paper-black'),
        additional_price: 0,
        stock_qty: 35
      }
    ]
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Flower Hair Clip Set',
    catKey: 'hair',
    price: 299,
    preparationDays: 1,
    weightGrams: 60,
    folders: ['mix-clips'],
    description: 'Delightful set of handmade yarn flower and leaf hair clips on sturdy alligator bases. Perfect for casual wear and gifting.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Bow Hair Clip (Maroon)',
    catKey: 'hair',
    price: 249,
    preparationDays: 1,
    weightGrams: 50,
    folders: ['red-clip'],
    description: 'Elegant crimson maroon crocheted bow hair accessory with vintage textured weave. Secure hold on all hair types.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Cherry Keychain',
    catKey: 'keepsakes',
    price: 199,
    preparationDays: 1,
    weightGrams: 40,
    directImages: [`${URL_PREFIX}/no-catalog/1.jpeg`],
    description: 'Adorably plump twin red cherries crocheted with green leaves on a sturdy stainless steel keychain ring.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Bunny Keychain',
    catKey: 'keepsakes',
    price: 249,
    preparationDays: 1,
    weightGrams: 50,
    directImages: [`${URL_PREFIX}/no-catalog/2.jpeg`, `${URL_PREFIX}/no-catalog/4.jpeg`],
    description: 'Soft cream amigurumi bunny head keychain with pink blushed cheeks and optional floral charm attachment.',
    variants: [
      {
        variant_name: 'Classic Bunny',
        color_name: 'Cream',
        color_hex: '#FFFDD0',
        images: [`${URL_PREFIX}/no-catalog/2.jpeg`],
        additional_price: 0,
        stock_qty: 25
      },
      {
        variant_name: 'Bunny with Floral Charm',
        color_name: 'Cream & Blue',
        color_hex: '#5B92E5',
        images: [`${URL_PREFIX}/no-catalog/4.jpeg`],
        additional_price: 50,
        stock_qty: 25
      }
    ]
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Flower Bag Charm',
    catKey: 'keepsakes',
    price: 249,
    preparationDays: 1,
    weightGrams: 50,
    directImages: [`${URL_PREFIX}/no-catalog/3.jpeg`, `${URL_PREFIX}/no-catalog/5.jpeg`],
    description: 'Charming multi-petal crocheted flower bag charm with green leaf accent and key ring clasp. Adds instant artisanal personality to any tote or backpack.',
    variants: [
      {
        variant_name: 'Blush Pink',
        color_name: 'Blush Pink',
        color_hex: '#FFB6C1',
        images: [`${URL_PREFIX}/no-catalog/3.jpeg`],
        additional_price: 0,
        stock_qty: 30
      },
      {
        variant_name: 'White & Tangerine',
        color_name: 'White & Tangerine',
        color_hex: '#FFA500',
        images: [`${URL_PREFIX}/no-catalog/5.jpeg`],
        additional_price: 0,
        stock_qty: 30
      }
    ]
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Cat Keychain',
    catKey: 'keepsakes',
    price: 249,
    preparationDays: 1,
    weightGrams: 50,
    directImages: [
      `${URL_PREFIX}/no-catalog/6.jpeg`,
      `${URL_PREFIX}/no-catalog/8.jpeg`,
      `${URL_PREFIX}/no-catalog/9.jpeg`
    ],
    description: 'Sitting white amigurumi kitten keychain with pink nose, beaded eyes, and curled tail. Hand-stitched with love.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Heart Keychain',
    catKey: 'keepsakes',
    price: 199,
    preparationDays: 1,
    weightGrams: 40,
    directImages: [
      `${URL_PREFIX}/no-catalog/7.jpeg`,
      `${URL_PREFIX}/no-catalog/10.jpeg`
    ],
    description: 'Puffy blush pink crocheted heart plush keychain. A tender everyday reminder and thoughtful small gift.'
  },
  {
    shop: 'Crochet Lady',
    name: 'Crochet Evil Eye Keychain',
    catKey: 'keepsakes',
    price: 149,
    preparationDays: 1,
    weightGrams: 40,
    directImages: getNewFolderImages('evil eye keychain'),
    description: 'A round crochet keychain in classic evil-eye blue, white, and black colorway.'
  }
];

async function purgeLegacyFakeSellers() {
  console.log('🧹 [Step 1] Purging legacy single-store fake sellers & stale catalogs...');

  // Identify users to purge: Tohfa Official Store (user 94 or tohfa_official@tohfa.com), Tohfa Official Curated, etc.
  const { rows: legacyUsers } = await query(`
    SELECT id, email, name FROM users 
    WHERE email ILIKE 'tohfa_official@%' 
       OR email ILIKE 'special_shop_%' 
       OR id IN (94, 129)
  `);

  for (const u of legacyUsers) {
    console.log(`   Removing legacy fake seller user ID: ${u.id} ("${u.name}" <${u.email}>)...`);

    // Clean products and dependencies
    const { rows: prods } = await query('SELECT id FROM products WHERE seller_id = $1', [u.id]);
    const prodIds = prods.map(p => p.id);

    if (prodIds.length > 0) {
      await query('DELETE FROM cart_items WHERE product_id = ANY($1)', [prodIds]).catch(() => {});
      await query('DELETE FROM wishlists WHERE product_id = ANY($1)', [prodIds]).catch(() => {});
      await query('DELETE FROM product_variants WHERE product_id = ANY($1)', [prodIds]).catch(() => {});
      await query('DELETE FROM product_images WHERE product_id = ANY($1)', [prodIds]).catch(() => {});
      await query('DELETE FROM reviews WHERE product_id = ANY($1)', [prodIds]).catch(() => {});
      await query('DELETE FROM reels WHERE product_id = ANY($1)', [prodIds]).catch(() => {});
      await query('DELETE FROM sponsored_products WHERE product_id = ANY($1)', [prodIds]).catch(() => {});
      await query('DELETE FROM product_bans WHERE product_id = ANY($1)', [prodIds]).catch(() => {});
      await query('DELETE FROM product_events WHERE product_id = ANY($1)', [prodIds]).catch(() => {});
      await query('DELETE FROM product_views WHERE product_id = ANY($1)', [prodIds]).catch(() => {});
      await query('DELETE FROM products WHERE id = ANY($1)', [prodIds]).catch(() => {});
    }

    // Safely uncouple orders before deleting seller profiles
    await query('UPDATE orders SET seller_id = NULL WHERE seller_id = $1', [u.id]).catch(() => {});
    await query('DELETE FROM seller_profiles WHERE user_id = $1', [u.id]).catch(() => {});
    await query('DELETE FROM sellers WHERE user_id = $1 OR id = $1', [u.id]).catch(() => {});
    await query('DELETE FROM users WHERE id = $1', [u.id]).catch(() => {});
  }

  // Also clean any leftover profiles with store_name = 'Tohfa Official Store'
  await query("DELETE FROM seller_profiles WHERE store_name = 'Tohfa Official Store' OR store_name = 'Tohfa Official Curated'").catch(() => {});
  await query("DELETE FROM sellers WHERE store_name = 'Tohfa Official Store' OR store_name = 'Tohfa Official Curated'").catch(() => {});

  console.log('   ✅ Legacy fake sellers purged completely.');
}

async function ensureThreeSpecialShops() {
  console.log('\n🏬 [Step 2] Ensuring exactly THREE TOFA Special shops in DB...');
  const dummyPasswordHash = await bcrypt.hash('TofaSpecialAdmin@2026!', 10);
  const shopUserMap = {};

  for (const shop of SPECIAL_SHOPS) {
    // Check by email or previous alias (e.g. crochetart -> crochetlady)
    let emailLookup = [shop.email.toLowerCase()];
    if (shop.slug === 'crochet-lady') {
      emailLookup.push('crochet.art@thetohfa.in', 'crochetart@thetohfa.in');
    }

    let userId;
    const { rows: existing } = await query(
      'SELECT id FROM users WHERE LOWER(TRIM(email)) = ANY($1)',
      [emailLookup]
    );

    if (existing.length > 0) {
      userId = existing[0].id;
      await query(
        "UPDATE users SET name = $1, email = $2, phone = $3, role = 'seller', cover_photo_url = COALESCE(cover_photo_url, '/img/default-seller-banner.png'), is_active = TRUE, updated_at = NOW() WHERE id = $4",
        [shop.store_name, shop.email.toLowerCase(), shop.phone, userId]
      );
      console.log(`   Updated user ID ${userId} -> "${shop.store_name}" (${shop.email})`);
    } else {
      const { rows: newUser } = await query(
        "INSERT INTO users (name, email, phone, password_hash, role, cover_photo_url, is_active) VALUES ($1, $2, $3, $4, 'seller', '/img/default-seller-banner.png', TRUE) RETURNING id",
        [shop.store_name, shop.email.toLowerCase(), shop.phone, dummyPasswordHash]
      );
      userId = newUser[0].id;
      console.log(`   Created new user ID ${userId} -> "${shop.store_name}" (${shop.email})`);
    }

    shopUserMap[shop.store_name] = userId;

    // Sync sellers table
    await query(
      `INSERT INTO sellers (user_id, store_name, slug, bio, pickup_address, banner_url, is_admin_managed, is_approved, verification_status, is_active)
       VALUES ($1, $2, $3, $4, $5, '/img/default-seller-banner.png', TRUE, TRUE, 'verified', TRUE)
       ON CONFLICT (user_id) DO UPDATE SET
         store_name = EXCLUDED.store_name,
         slug = EXCLUDED.slug,
         bio = EXCLUDED.bio,
         pickup_address = EXCLUDED.pickup_address,
         banner_url = COALESCE(sellers.banner_url, EXCLUDED.banner_url),
         is_admin_managed = TRUE,
         is_approved = TRUE,
         verification_status = 'verified',
         is_active = TRUE`,
      [userId, shop.store_name, shop.slug, shop.bio, JSON.stringify(shop.pickup_address)]
    ).catch(err => console.warn('   sellers update notice:', err.message));

    // Sync seller_profiles table
    await query(
      `INSERT INTO seller_profiles (user_id, store_name, slug, bio, pickup_address, banner_url, is_admin_managed, is_approved, verification_status, is_active, seller_type)
       VALUES ($1, $2, $3, $4, $5, '/img/default-seller-banner.png', TRUE, TRUE, 'verified', TRUE, 'Artisan')
       ON CONFLICT (user_id) DO UPDATE SET
         store_name = EXCLUDED.store_name,
         slug = EXCLUDED.slug,
         bio = EXCLUDED.bio,
         pickup_address = EXCLUDED.pickup_address,
         banner_url = COALESCE(seller_profiles.banner_url, EXCLUDED.banner_url),
         is_admin_managed = TRUE,
         is_approved = TRUE,
         verification_status = 'verified',
         is_active = TRUE,
         seller_type = 'Artisan',
         updated_at = NOW()`,
      [userId, shop.store_name, shop.slug, shop.bio, JSON.stringify(shop.pickup_address)]
    );

    console.log(`   ✅ Seller profile confirmed for "${shop.store_name}" (@${shop.slug}) [is_admin_managed = true]`);
  }

  return shopUserMap;
}

async function rebuildSpecialProducts(shopUserMap) {
  console.log('\n📦 [Step 3] Rebuilding product catalog with multi-image galleries and variants...');

  const specialUserIds = Object.values(shopUserMap);

  // Clear existing products for the 3 special shops to avoid duplicate stacking
  console.log('   Clearing previous products for the 3 special shops...');
  const { rows: oldProds } = await query('SELECT id FROM products WHERE seller_id = ANY($1)', [specialUserIds]);
  const oldProdIds = oldProds.map(p => p.id);

  if (oldProdIds.length > 0) {
    await query('DELETE FROM order_items WHERE product_id = ANY($1)', [oldProdIds]).catch(() => {});
    await query('DELETE FROM cart_items WHERE product_id = ANY($1)', [oldProdIds]).catch(() => {});
    await query('DELETE FROM wishlists WHERE product_id = ANY($1)', [oldProdIds]).catch(() => {});
    await query('DELETE FROM product_variants WHERE product_id = ANY($1)', [oldProdIds]).catch(() => {});
    await query('DELETE FROM product_images WHERE product_id = ANY($1)', [oldProdIds]).catch(() => {});
    await query('DELETE FROM reviews WHERE product_id = ANY($1)', [oldProdIds]).catch(() => {});
    await query('DELETE FROM reels WHERE product_id = ANY($1)', [oldProdIds]).catch(() => {});
    await query('DELETE FROM sponsored_products WHERE product_id = ANY($1)', [oldProdIds]).catch(() => {});
    await query('DELETE FROM product_bans WHERE product_id = ANY($1)', [oldProdIds]).catch(() => {});
    await query('DELETE FROM product_events WHERE product_id = ANY($1)', [oldProdIds]).catch(() => {});
    await query('DELETE FROM product_views WHERE product_id = ANY($1)', [oldProdIds]).catch(() => {});
    await query('DELETE FROM products WHERE id = ANY($1)', [oldProdIds]);
    console.log(`   Cleaned ${oldProdIds.length} previous special product rows.`);
  }

  let seededCount = 0;

  console.warn('⚠️  [SKIPPED FOLDER NOTICE] "chai candle" folder was uploaded with no images inside. It has been excluded from seeding. Please re-upload photos before adding it as a product.\n');

  for (const item of PRODUCTS_CATALOG) {
    const sellerId = shopUserMap[item.shop];
    if (!sellerId) {
      console.error(`❌ Seller not found for shop: ${item.shop}`);
      continue;
    }

    const categoryId = await getCategoryId(item.catKey);
    const slug = slugify(item.name) + '-' + crypto.randomBytes(3).toString('hex');

    // Collect all gallery image URLs
    let galleryImages = [];
    if (Array.isArray(item.directImages) && item.directImages.length > 0) {
      galleryImages = item.directImages;
    } else if (Array.isArray(item.folders)) {
      for (const folder of item.folders) {
        galleryImages.push(...getFolderImages(folder));
      }
    }

    if (galleryImages.length === 0) {
      galleryImages = ['/img/placeholder-product.svg'];
    }

    // Insert Product
    const pricePaise = Math.round(item.price * 100);
    const totalStock = item.variants ? item.variants.reduce((sum, v) => sum + (v.stock_qty || 25), 0) : 50;
    const prepDays = item.preparationDays || 2;
    const weightGrams = item.weightGrams || 400;

    const { rows: prodRows } = await query(
      `INSERT INTO products (
        seller_id, category_id, name, slug, description, base_price, price_paise,
        stock_quantity, stock_qty, images, tags, status, is_active, preparation_days,
        ships_in_days, weight_grams, customization_mode, is_customizable, avg_rating,
        review_count, special_packaging_available
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, 'active', TRUE, $12,
        $13, $14, 'none', FALSE, 5.0,
        12, TRUE
      ) RETURNING id`,
      [
        sellerId,
        categoryId,
        item.name,
        slug,
        item.description,
        item.price,
        pricePaise,
        totalStock,
        totalStock,
        galleryImages,
        [], // tags
        prepDays,
        prepDays,
        weightGrams
      ]
    );

    const productId = prodRows[0].id;

    // Insert gallery product_images
    for (let i = 0; i < galleryImages.length; i++) {
      await query(
        'INSERT INTO product_images (product_id, url, is_primary, sort_order) VALUES ($1, $2, $3, $4)',
        [productId, galleryImages[i], i === 0 ? 1 : 0, i]
      );
    }

    // Insert product_variants if applicable
    if (Array.isArray(item.variants) && item.variants.length > 0) {
      for (const v of item.variants) {
        const variantImages = Array.isArray(v.images) && v.images.length > 0
          ? v.images
          : (v.image_url ? [v.image_url] : galleryImages.slice(0, 1));
        const additionalPrice = Number(v.additional_price || 0);
        const variantPricePaise = Math.round((item.price + additionalPrice) * 100);

        await query(
          `INSERT INTO product_variants (
            product_id, variant_name, color_name, color_hex, additional_price,
            price_paise, stock_qty, image_url, images
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            productId,
            v.variant_name || v.color_name || 'Standard',
            v.color_name || null,
            v.color_hex || null,
            additionalPrice,
            variantPricePaise,
            v.stock_qty || 25,
            variantImages[0] || null,
            variantImages
          ]
        );
      }
    }

    seededCount++;
    console.log(`  [${seededCount}/${PRODUCTS_CATALOG.length}] Seeded "${item.name}" -> ${item.shop} [₹${item.price}, ${galleryImages.length} imgs, ${item.variants ? item.variants.length : 0} vars]`);
  }

  console.log(`\n🎉 Successfully seeded ${seededCount} TOFA Special products across the 3 shops!`);
}

async function seedTofaSpecials() {
  console.log('======================================================================');
  console.log('🚀 Starting TOFA Special 3-Shop Catalog Rebuild & Seeding Pipeline');
  console.log('======================================================================\n');

  try {
    await purgeLegacyFakeSellers();
    const shopUserMap = await ensureThreeSpecialShops();
    await rebuildSpecialProducts(shopUserMap);

    console.log('\n======================================================================');
    console.log('✅ TOFA SPECIAL 3-SHOP REBUILD COMPLETE');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('❌ Seeding pipeline encountered an error:', err);
    throw err;
  }
}

// Allow direct CLI execution or export for modular invocation
if (require.main === module) {
  seedTofaSpecials()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seedTofaSpecials, SPECIAL_SHOPS, PRODUCTS_CATALOG };

