/**
 * Tohfa v2 — Product Controller
 * File: src/controllers/product.controller.js
 * Role: HTTP handlers for product CRUD, images, variants, customization options,
 *       view recording, FTS search, and personalized feed.
 *       is_tohfa_original is NEVER returned to buyers/public.
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const { query, getClient } = require('../config/db');

// Strip internal-only fields from product rows
function sanitizeProduct(p) {
  const { is_tohfa_original, ...rest } = p;
  return rest;
}

// ---------------------------------------------------------------------------
// GET /api/products/categories & /api/categories  (PUBLIC — used by buyer home/search/categories)
// ---------------------------------------------------------------------------
const CATEGORY_CATALOG = [
  {
    id: "cat-art-portraits",
    name: "Art & Portraits",
    display_name: "Art & Portraits",
    slug: "art-portraits",
    product_count: 0,
    image_url: "/img/categories/art_prints.jpg",
    subcategories: [
      { id: "sub-caricatures", name: "Caricatures" },
      { id: "sub-couple-portraits", name: "Couple Portraits" },
      { id: "sub-digital-portraits", name: "Digital Portraits" },
      { id: "sub-family-portraits", name: "Family Portraits" },
      { id: "sub-paintings", name: "Paintings" },
      { id: "sub-pet-portraits", name: "Pet Portraits" },
      { id: "sub-sketches", name: "Sketches" }
    ]
  },
  {
    id: "cat-candles-fragrance",
    name: "Candles & Fragrance",
    display_name: "Candles & Fragrance",
    slug: "candles-fragrance",
    product_count: 5,
    image_url: "/img/categories/candles.jpg",
    subcategories: [
      { id: "sub-botanical-candles", name: "Botanical Candles" },
      { id: "sub-soy-wax", name: "Soy Wax" },
      { id: "sub-incense", name: "Incense" },
      { id: "sub-wax-melts", name: "Wax Melts" }
    ]
  },
  {
    id: "cat-ceramics-pottery",
    name: "Ceramics & Pottery",
    display_name: "Ceramics & Pottery",
    slug: "ceramics-pottery",
    product_count: 15,
    image_url: "/img/categories/ceramics.jpg",
    subcategories: [
      { id: "sub-bowls-serveware", name: "Bowls & Serveware" },
      { id: "sub-cups-mugs", name: "Cups & Mugs" },
      { id: "sub-studio-pottery", name: "Studio Pottery Decor" },
      { id: "sub-vases-planters", name: "Vases & Planters" }
    ]
  },
  {
    id: "cat-couples",
    name: "Couples",
    display_name: "Couples",
    slug: "couples",
    product_count: 9,
    image_url: "/img/categories/custom_portraits.jpg",
    subcategories: [
      { id: "sub-anniversary-gifts", name: "Anniversary Gifts" },
      { id: "sub-candles-couples", name: "Candles" },
      { id: "sub-customized-gifts-couples", name: "Customized Gifts" },
      { id: "sub-flowers-couples", name: "Flowers" },
      { id: "sub-hampers-couples", name: "Hampers" },
      { id: "sub-home-decor-couples", name: "Home Decor" },
      { id: "sub-jewellery-couples", name: "Jewellery" },
      { id: "sub-keychains-couples", name: "Keychains" },
      { id: "sub-lamps-couples", name: "Lamps" },
      { id: "sub-letters-cards-couples", name: "Letters & Cards" },
      { id: "sub-matching-accessories", name: "Matching Accessories" },
      { id: "sub-portraits-couples", name: "Portraits" },
      { id: "sub-proposal-gifts", name: "Proposal Gifts" },
      { id: "sub-scrapbooks-memory-books", name: "Scrapbooks & Memory Books" }
    ]
  },
  {
    id: "cat-crochet",
    name: "Crochet",
    display_name: "Crochet",
    slug: "crochet",
    product_count: 0,
    image_url: "/img/categories/dried_florals.jpg",
    subcategories: [
      { id: "sub-bags-crochet", name: "Bags" },
      { id: "sub-flower-bouquets", name: "Flower Bouquets" },
      { id: "sub-keychains-crochet", name: "Keychains" },
      { id: "sub-other-flowers", name: "Other Flowers" },
      { id: "sub-phone-cases", name: "Phone Cases" },
      { id: "sub-plushies", name: "Plushies" },
      { id: "sub-roses", name: "Roses" },
      { id: "sub-sunflowers", name: "Sunflowers" }
    ]
  },
  {
    id: "cat-customized-gifts",
    name: "Customized Gifts",
    display_name: "Customized Gifts",
    slug: "customized-gifts",
    product_count: 29,
    image_url: "/img/categories/art_prints.jpg",
    subcategories: [
      { id: "sub-coasters", name: "Coasters" },
      { id: "sub-frames", name: "Frames" },
      { id: "sub-keychains-cust", name: "Keychains" },
      { id: "sub-letters", name: "Letters" },
      { id: "sub-memory-books", name: "Memory Books" },
      { id: "sub-name-lamps", name: "Name Lamps" },
      { id: "sub-name-plates", name: "Name Plates" },
      { id: "sub-personalized-bottles", name: "Personalized Bottles" },
      { id: "sub-phone-covers", name: "Phone Covers" },
      { id: "sub-polaroid-sets", name: "Polaroid Sets" },
      { id: "sub-qr-code-gifts", name: "QR Code Gifts" },
      { id: "sub-scrapbooks", name: "Scrapbooks" },
      { id: "sub-spotify-plaques", name: "Spotify Plaques" }
    ]
  },
  {
    id: "cat-fabric-crafts",
    name: "Fabric Crafts",
    display_name: "Fabric Crafts",
    slug: "fabric-crafts",
    product_count: 0,
    image_url: "/img/categories/skincare.jpg",
    subcategories: [
      { id: "sub-embroidery", name: "Embroidery" },
      { id: "sub-knitted-items", name: "Knitted Items" },
      { id: "sub-tote-bags", name: "Tote Bags" }
    ]
  },
  {
    id: "cat-festivals",
    name: "Festivals",
    display_name: "Festivals",
    slug: "festivals",
    product_count: 0,
    image_url: "/img/categories/candles.jpg",
    subcategories: [
      { id: "sub-christmas", name: "Christmas" },
      { id: "sub-diwali", name: "Diwali" },
      { id: "sub-eid", name: "Eid" },
      { id: "sub-holi", name: "Holi" },
      { id: "sub-karwa-chauth", name: "Karwa Chauth" },
      { id: "sub-navratri", name: "Navratri" },
      { id: "sub-rakhi", name: "Rakhi" }
    ]
  },
  {
    id: "cat-hampers",
    name: "Hampers",
    display_name: "Hampers",
    slug: "hampers",
    product_count: 0,
    image_url: "/img/categories/woodcraft.jpg",
    subcategories: [
      { id: "sub-anime-hampers", name: "Anime Hampers" },
      { id: "sub-anniversary-hampers", name: "Anniversary Hampers" },
      { id: "sub-baby-shower-hampers", name: "Baby Shower Hampers" },
      { id: "sub-birthday-hampers", name: "Birthday Hampers" },
      { id: "sub-bridesmaid-hampers", name: "Bridesmaid Hampers" },
      { id: "sub-chocolate-hampers", name: "Chocolate Hampers" },
      { id: "sub-corporate-hampers", name: "Corporate Hampers" },
      { id: "sub-couple-hampers", name: "Couple Hampers" },
      { id: "sub-diwali-hampers", name: "Diwali Hampers" },
      { id: "sub-farewell-hampers", name: "Farewell Hampers" },
      { id: "sub-friendship-hampers", name: "Friendship Hampers" },
      { id: "sub-groom-gang-hampers", name: "Groom Gang Hampers" },
      { id: "sub-holi-hampers", name: "Holi Hampers" },
      { id: "sub-period-comfort-hampers", name: "Period Comfort Hampers" },
      { id: "sub-rakhi-hampers", name: "Rakhi Hampers" },
      { id: "sub-skincare-hampers", name: "Skincare Hampers" },
      { id: "sub-sweet-hampers", name: "Sweet Hampers" },
      { id: "sub-valentine-hampers", name: "Valentine Hampers" },
      { id: "sub-wedding-hampers", name: "Wedding Hampers" }
    ]
  },
  {
    id: "cat-home-decor",
    name: "Home Decor",
    display_name: "Home Decor",
    slug: "home-decor",
    product_count: 12,
    image_url: "/img/categories/ceramics.jpg",
    subcategories: [
      { id: "sub-candles-decor", name: "Candles" },
      { id: "sub-clay-articles", name: "Clay Articles" },
      { id: "sub-decorative-frames", name: "Decorative Frames" },
      { id: "sub-name-boards", name: "Name Boards" },
      { id: "sub-planters", name: "Planters" },
      { id: "sub-resin-decor", name: "Resin Decor" },
      { id: "sub-wall-art", name: "Wall Art" }
    ]
  },
  {
    id: "cat-jewellery",
    name: "Jewellery",
    display_name: "Jewellery",
    slug: "jewellery",
    product_count: 22,
    image_url: "/img/categories/jewellery.jpg",
    subcategories: [
      { id: "sub-anklets", name: "Anklets" },
      { id: "sub-beaded-jewellery", name: "Beaded Jewellery" },
      { id: "sub-clay-jewellery", name: "Clay Jewellery" },
      { id: "sub-couple-jewellery", name: "Couple Jewellery" },
      { id: "sub-crochet-jewellery", name: "Crochet Jewellery" },
      { id: "sub-earrings", name: "Earrings" },
      { id: "sub-hair-accessories", name: "Hair Accessories" },
      { id: "sub-necklaces", name: "Necklaces" },
      { id: "sub-pendants", name: "Pendants" },
      { id: "sub-personalized-jewellery", name: "Personalized Jewellery" },
      { id: "sub-resin-jewellery", name: "Resin Jewellery" },
      { id: "sub-rings", name: "Rings" }
    ]
  },
  {
    id: "cat-journals-stationery",
    name: "Journals & Stationery",
    display_name: "Journals & Stationery",
    slug: "journals-stationery",
    product_count: 10,
    image_url: "/img/categories/journals.jpg",
    subcategories: [
      { id: "sub-handmade-paper", name: "Handmade Paper" },
      { id: "sub-linen-journals", name: "Linen Journals" },
      { id: "sub-planners", name: "Planners" },
      { id: "sub-wax-seal-kits", name: "Wax Seal Kits" }
    ]
  },
  {
    id: "cat-paintings",
    name: "Paintings",
    display_name: "Paintings",
    slug: "paintings",
    product_count: 4,
    image_url: "/img/categories/art_prints.jpg",
    subcategories: [
      { id: "sub-acrylic", name: "Acrylic" },
      { id: "sub-canvas-art", name: "Canvas Art" },
      { id: "sub-mini-canvas", name: "Mini Canvas" },
      { id: "sub-watercolour", name: "Watercolour" }
    ]
  },
  {
    id: "cat-textile-arts",
    name: "Textile Arts",
    display_name: "Textile Arts",
    slug: "textile-arts",
    product_count: 14,
    image_url: "/img/categories/ceramics.jpg",
    subcategories: [
      { id: "sub-handwoven-rugs", name: "Handwoven Rugs" },
      { id: "sub-macrame", name: "Macrame" },
      { id: "sub-tapestries", name: "Tapestries" }
    ]
  },
  {
    id: "cat-wedding-rituals",
    name: "Wedding & Rituals",
    display_name: "Wedding & Rituals",
    slug: "wedding-rituals",
    product_count: 0,
    image_url: "/img/categories/candles.jpg",
    subcategories: [
      { id: "sub-haldi-essentials", name: "Haldi Essentials" },
      { id: "sub-mehendi-essentials", name: "Mehendi Essentials" },
      { id: "sub-return-gifts", name: "Return Gifts" },
      { id: "sub-shagun-envelopes", name: "Shagun Envelopes" },
      { id: "sub-wedding-decor", name: "Wedding Decor" },
      { id: "sub-wedding-hampers", name: "Wedding Hampers" },
      { id: "sub-wedding-nameplates", name: "Wedding Nameplates" }
    ]
  }
];

async function listCategories(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, name, slug, parent_id, sort_order
       FROM categories
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, name ASC`
    ).catch(() => ({ rows: [] }));

    if (rows && rows.length > 0) {
      // Merge with catalog
      return res.json({ success: true, data: { categories: CATEGORY_CATALOG, raw: rows } });
    }

    return res.json({ success: true, data: { categories: CATEGORY_CATALOG } });
  } catch (err) {
    return res.json({ success: true, data: { categories: CATEGORY_CATALOG } });
  }
}



async function listProducts(req, res, next) {
  try {
    const {
      page = '1',
      limit = '20',
      category_id,
      min_price,
      max_price,
      search,
      occasion,
      seller_id,
      featured,
      is_featured,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    const conditions = ["p.status = 'active' AND (p.is_active IS NULL OR p.is_active = TRUE)"];
    const params = [];

    if (category_id) {
      params.push(category_id);
      conditions.push(`(p.category_id::text = $${params.length} OR p.category_id::text IN (SELECT id::text FROM categories WHERE slug = $${params.length}))`);
    }
    if (min_price !== undefined) {
      params.push(parseFloat(min_price));
      conditions.push(`p.base_price >= $${params.length}`);
    }
    if (max_price !== undefined) {
      params.push(parseFloat(max_price));
      conditions.push(`p.base_price <= $${params.length}`);
    }

    const searchTerm = (search || req.query.q || req.query.query || '').trim();
    if (searchTerm) {
      params.push(`%${searchTerm}%`);
      conditions.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
    }
    if (occasion) {
      const occ = String(occasion).replace(/-/g, ' ');
      params.push(`%${occ}%`);
      conditions.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
    }
    if (seller_id) {
      params.push(seller_id);
      conditions.push(`(p.seller_id::text = $${params.length})`);
    }

    const checkFeatured = featured === 'true' || is_featured === 'true';
    if (checkFeatured) {
      conditions.push(`(p.is_sponsored = TRUE OR p.view_count > 5 OR p.is_tohfa_original = TRUE)`);
    }

    // Filter active products and verified sellers (CHK-05)
    conditions.push(`(
      (sp.verification_status = 'verified' AND (sp.is_active IS NULL OR sp.is_active = TRUE))
      OR (s.verification_status = 'verified' AND (s.is_active IS NULL OR s.is_active = TRUE))
      OR sp.is_approved = TRUE
      OR s.is_approved = TRUE
      OR (sp.user_id IS NULL AND s.user_id IS NULL)
    )`);

    const where = conditions.join(' AND ');

    params.push(limitNum);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows: products } = await query(
      `SELECT p.id, p.name, p.description, p.base_price, p.stock_quantity, p.low_stock_threshold, p.category_id,
              p.customization_mode, p.is_customizable, p.customization_schema, p.status, p.view_count, p.seller_id,
              p.is_sponsored, p.is_tohfa_original, p.slug,
              COALESCE(p.preparation_days, 2) AS preparation_days,
              COALESCE(p.weight_grams, 500) AS weight_grams,
              p.created_at,
              COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
              COALESCE(
                json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
                '[]'
              ) AS images
       FROM products p
       LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
       LEFT JOIN sellers s ON s.user_id = p.seller_id
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
       WHERE ${where}
       GROUP BY p.id, sp.store_name, s.store_name
       ORDER BY ${checkFeatured ? 'p.is_sponsored DESC, p.view_count DESC, ' : ''}p.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM products p 
       LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
       LEFT JOIN sellers s ON s.user_id = p.seller_id
       WHERE ${where}`,
      params.slice(0, params.length - 2)
    );

    return res.json({
      success: true,
      data: {
        products: products.map(sanitizeProduct),
        total: parseInt(countRows[0].total, 10),
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/products/featured
 */
async function getFeaturedProducts(req, res, next) {
  req.query.featured = 'true';
  return listProducts(req, res, next);
}

// ---------------------------------------------------------------------------
// GET /api/products/for-you
// ---------------------------------------------------------------------------
async function forYouFeed(req, res, next) {
  try {
    const userId = req.user?.id || null;
    const limit = 20;

    let rows;
    if (userId) {
      // Weighted: viewed categories + purchase history
      const { rows: fetched } = await query(
        `SELECT DISTINCT p.id, p.name, p.description, p.base_price, p.category_id,
                p.customization_mode, p.status, p.view_count, p.seller_id, p.created_at,
                p.is_tohfa_original, p.slug,
                COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
                COALESCE(
                  json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
                  '[]'
                ) AS images
         FROM products p
         LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
         LEFT JOIN sellers s ON s.user_id = p.seller_id
         LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
         WHERE (p.status = 'active' OR p.is_active = TRUE)
           AND (
             sp.verification_status = 'verified'
             OR s.verification_status = 'verified'
             OR sp.is_approved = TRUE
             OR s.is_approved = TRUE
             OR (sp.user_id IS NULL AND s.user_id IS NULL)
           )
           AND p.category_id IN (
             SELECT DISTINCT p2.category_id FROM product_views pv
             JOIN products p2 ON p2.id = pv.product_id
             WHERE pv.user_id = $1
             LIMIT 5
           )
         GROUP BY p.id, sp.store_name, s.store_name
         ORDER BY RANDOM()
         LIMIT $2`,
        [userId, limit]
      );
      rows = fetched;
    } else {
      // Anonymous: random active products
      const { rows: fetched } = await query(
        `SELECT p.id, p.name, p.description, p.base_price, p.category_id,
                p.customization_mode, p.status, p.view_count, p.seller_id, p.created_at,
                p.is_tohfa_original, p.slug,
                COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
                COALESCE(
                  json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
                  '[]'
                ) AS images
         FROM products p
         LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
         LEFT JOIN sellers s ON s.user_id = p.seller_id
         LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
         WHERE (p.status = 'active' OR p.is_active = TRUE)
           AND (
             sp.verification_status = 'verified'
             OR s.verification_status = 'verified'
             OR sp.is_approved = TRUE
             OR s.is_approved = TRUE
             OR (sp.user_id IS NULL AND s.user_id IS NULL)
           )
         GROUP BY p.id, sp.store_name, s.store_name
         ORDER BY p.created_at DESC
         LIMIT $1`,
        [limit]
      );
      rows = fetched;
    }

    return res.json({ success: true, data: { products: rows.map(sanitizeProduct) } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/products/search  — FTS & Fuzzy Search
// ---------------------------------------------------------------------------
async function searchProducts(req, res, next) {
  try {
    const { q, occasion, search, page = '1', limit = '20', sort = 'newest' } = req.query;
    const searchTerm = (q || occasion || search || req.query.query || '').trim().replace(/-/g, ' ');

    if (!searchTerm) {
      return res.status(400).json({ success: false, message: 'Search query (q or occasion) is required.' });
    }

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    const likePattern = `%${searchTerm}%`;

    const { rows } = await query(
      `SELECT p.id, p.name, p.description, p.base_price, p.category_id,
              p.customization_mode, p.is_customizable, p.customization_schema, p.status, p.view_count, p.seller_id, p.created_at,
              p.is_tohfa_original, p.slug,
              COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
              COALESCE(
                json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
                '[]'
              ) AS images
       FROM products p
       LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
       LEFT JOIN sellers s ON s.user_id = p.seller_id
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
       WHERE (p.status = 'active' OR p.is_active = TRUE)
         AND (
           sp.verification_status = 'verified'
           OR s.verification_status = 'verified'
           OR sp.is_approved = TRUE
           OR s.is_approved = TRUE
           OR (sp.user_id IS NULL AND s.user_id IS NULL)
         )
         AND (
           to_tsvector('english', p.name || ' ' || COALESCE(p.description,'')) @@ plainto_tsquery('english', $1)
           OR p.name ILIKE $2
           OR p.description ILIKE $2
         )
       GROUP BY p.id, sp.store_name, s.store_name
       ORDER BY 
         CASE WHEN $3 = 'price_low' THEN p.base_price END ASC,
         CASE WHEN $3 = 'price_high' THEN p.base_price END DESC,
         p.created_at DESC
       LIMIT $4 OFFSET $5`,
      [searchTerm, likePattern, sort, limitNum, offset]
    );

    return res.json({
      success: true,
      data: {
        products: rows.map(sanitizeProduct),
        query: searchTerm,
        has_more: rows.length === limitNum,
        next_offset: offset + rows.length
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/products/:id
// ---------------------------------------------------------------------------
async function getProduct(req, res, next) {
  try {
    const { id } = req.params;

    const { rows } = await query(
      `SELECT p.id, p.name, p.slug, p.description, p.base_price, p.stock_quantity, p.low_stock_threshold, p.category_id,
              p.customization_mode, p.is_customizable, p.customization_schema, p.open_customization_config,
              p.status, p.view_count, p.seller_id, p.is_sponsored,
              COALESCE(p.preparation_days, 2) AS preparation_days,
              COALESCE(p.weight_grams, 500) AS weight_grams,
              p.created_at, p.updated_at,
              sp.store_name, COALESCE(sp.profile_photo, u.profile_photo_url) AS profile_photo,
              COALESCE(
                (SELECT json_agg(pi ORDER BY pi.sort_order)
                 FROM product_images pi WHERE pi.product_id = p.id),
                '[]'
              ) AS images,
              COALESCE(
                (SELECT json_agg(pv ORDER BY pv.created_at) FROM product_variants pv WHERE pv.product_id = p.id),
                '[]'
              ) AS variants,
              COALESCE(
                (SELECT json_agg(fo) FROM fixed_customization_options fo WHERE fo.product_id = p.id),
                '[]'
              ) AS fixed_customization_options
       FROM products p
       LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
       LEFT JOIN users u ON u.id = p.seller_id
       WHERE (p.id::text = $1 OR p.slug = $1) AND p.status IN ('active','paused')`,
      [String(id)]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    return res.json({ success: true, data: { product: sanitizeProduct(rows[0]) } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/products/seller/:sellerId
// ---------------------------------------------------------------------------
async function getSellerProducts(req, res, next) {
  try {
    const { sellerId } = req.params;
    const { page = '1', limit = '20' } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    const { rows } = await query(
      `SELECT p.id, p.name, p.description, p.base_price, p.stock_quantity, p.low_stock_threshold, p.category_id,
              p.customization_mode, p.is_customizable, p.customization_schema, p.status, p.view_count, p.seller_id, p.created_at,
              COALESCE(p.preparation_days, 2) AS preparation_days,
              COALESCE(p.weight_grams, 500) AS weight_grams,
              COALESCE(
                json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
                '[]'
              ) AS images
       FROM products p
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
       WHERE p.seller_id = $1 AND p.status = 'active'
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [sellerId, limitNum, offset]
    );

    return res.json({ success: true, data: { products: rows.map(sanitizeProduct) } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/products  (seller only)
// ---------------------------------------------------------------------------
async function createProduct(req, res, next) {
  try {
    const sellerId = req.seller?.id || req.user.id;
    const {
      name,
      category_id,
      description,
      base_price,
      stock_quantity = 10,
      low_stock_threshold = 3,
      preparation_days = 2,
      weight_grams = 500,
      is_customizable,
      customization_mode,
      customization_schema,
      images,
    } = req.body;

    if (!name || base_price === undefined || base_price === null) {
      return res.status(400).json({ success: false, message: 'Product name and base price are required.' });
    }

    let finalMode = customization_mode;
    if (!finalMode) {
      finalMode = (is_customizable === true || is_customizable === 'true' || is_customizable === 1) ? 'fixed' : 'none';
    }
    const finalIsCustomizable = Boolean(
      is_customizable === true || is_customizable === 'true' || is_customizable === 1 || (finalMode && finalMode !== 'none')
    );

    const schemaJson = typeof customization_schema === 'object' && customization_schema !== null
      ? JSON.stringify(customization_schema)
      : (customization_schema || '{}');

    const { rows } = await query(
      `INSERT INTO products
         (seller_id, name, description, category_id, base_price, stock_quantity, low_stock_threshold,
          preparation_days, weight_grams, customization_mode, is_customizable, customization_schema, is_tohfa_original, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, 'active')
       RETURNING id, name, description, category_id, base_price, stock_quantity, low_stock_threshold,
                 preparation_days, weight_grams, customization_mode, is_customizable, customization_schema, status, created_at`,
      [
        sellerId,
        name,
        description || null,
        category_id || null,
        Number(base_price),
        Number(stock_quantity ?? 10),
        Number(low_stock_threshold ?? 3),
        Math.max(0, parseInt(preparation_days, 10) || 2),
        Math.max(1, parseInt(weight_grams, 10) || 500),
        finalMode,
        finalIsCustomizable,
        schemaJson,
      ]
    );

    const product = rows[0];

    // Handle images if provided in body
    if (Array.isArray(images) && images.length > 0) {
      let sortOrder = 0;
      for (const img of images) {
        const url = typeof img === 'string' ? img : (img?.url || '');
        if (url) {
          await query(
            `INSERT INTO product_images (product_id, url, sort_order)
             VALUES ($1, $2, $3)`,
            [product.id, url, sortOrder++]
          );
        }
      }
    }

    return res.status(201).json({ success: true, data: { product: sanitizeProduct(product) } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/products/:id  (seller only, own products)
// ---------------------------------------------------------------------------
async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.seller?.id || req.user.id;
    const {
      name,
      description,
      category_id,
      base_price,
      stock_quantity,
      low_stock_threshold,
      preparation_days,
      weight_grams,
      is_customizable,
      customization_mode,
      customization_schema,
      images,
    } = req.body;

    const { rows: existing } = await query(
      'SELECT id FROM products WHERE id = $1 AND seller_id = $2',
      [id, sellerId]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    let finalMode = customization_mode;
    if (finalMode === undefined && is_customizable !== undefined) {
      finalMode = (is_customizable === true || is_customizable === 'true' || is_customizable === 1) ? 'fixed' : 'none';
    }
    const finalIsCustomizable = is_customizable !== undefined
      ? Boolean(is_customizable === true || is_customizable === 'true' || is_customizable === 1 || (finalMode && finalMode !== 'none'))
      : (finalMode ? finalMode !== 'none' : null);

    const schemaJson = customization_schema !== undefined
      ? (typeof customization_schema === 'object' && customization_schema !== null ? JSON.stringify(customization_schema) : customization_schema)
      : null;

    const { rows } = await query(
      `UPDATE products
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           category_id = COALESCE($3, category_id),
           base_price = COALESCE($4, base_price),
           stock_quantity = COALESCE($5, stock_quantity),
           low_stock_threshold = COALESCE($6, low_stock_threshold),
           preparation_days = COALESCE($7, preparation_days),
           weight_grams = COALESCE($8, weight_grams),
           customization_mode = COALESCE($9, customization_mode),
           is_customizable = COALESCE($10, is_customizable),
           customization_schema = COALESCE($11, customization_schema),
           updated_at = NOW()
       WHERE id = $12 AND seller_id = $13
       RETURNING id, name, description, category_id, base_price, stock_quantity, low_stock_threshold,
                 preparation_days, weight_grams, customization_mode, is_customizable, customization_schema, status, updated_at`,
      [
        name || null,
        description || null,
        category_id || null,
        base_price !== undefined ? Number(base_price) : null,
        stock_quantity !== undefined ? Number(stock_quantity) : null,
        low_stock_threshold !== undefined ? Number(low_stock_threshold) : null,
        preparation_days !== undefined ? Math.max(0, parseInt(preparation_days, 10)) : null,
        weight_grams !== undefined ? Math.max(1, parseInt(weight_grams, 10)) : null,
        finalMode || null,
        finalIsCustomizable,
        schemaJson,
        id,
        sellerId,
      ]
    );

    // If images array is provided, replace images
    if (Array.isArray(images)) {
      await query('DELETE FROM product_images WHERE product_id = $1', [id]);
      let sortOrder = 0;
      for (const img of images) {
        const url = typeof img === 'string' ? img : (img?.url || '');
        if (url) {
          await query(
            `INSERT INTO product_images (product_id, url, sort_order)
             VALUES ($1, $2, $3)`,
            [id, url, sortOrder++]
          );
        }
      }
    }

    return res.json({ success: true, data: { product: sanitizeProduct(rows[0]) } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/products/:id/status  (seller only, own products)
// ---------------------------------------------------------------------------
async function updateProductStatus(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const { status } = req.body;

    const allowed = ['active', 'paused', 'deleted'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}.` });
    }

    const { rows } = await query(
      `UPDATE products SET status = $1, updated_at = NOW()
       WHERE id = $2 AND seller_id = $3
       RETURNING id, status, updated_at`,
      [status, id, sellerId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    return res.json({ success: true, data: { product: rows[0] } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/products/:id/images  (seller only)
// ---------------------------------------------------------------------------
async function uploadImages(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;

    const { rows: existing } = await query(
      'SELECT id FROM products WHERE id = $1 AND seller_id = $2',
      [id, sellerId]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    if (!req.files || !req.files.length) {
      return res.status(400).json({ success: false, message: 'No images uploaded.' });
    }

    // Get current max sort_order
    const { rows: maxRows } = await query(
      'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM product_images WHERE product_id = $1',
      [id]
    );
    let sortOrder = parseInt(maxRows[0].max_order, 10) + 1;

    const inserted = [];
    for (const file of req.files) {
      const { rows } = await query(
        `INSERT INTO product_images (product_id, url, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id, url, sort_order`,
        [id, file.path, sortOrder++]
      );
      inserted.push(rows[0]);
    }

    return res.status(201).json({ success: true, data: { images: inserted } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/products/:id/variants  (seller only)
// ---------------------------------------------------------------------------
async function upsertVariants(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const { variants } = req.body; // array of { color, size, sku, stock, price_modifier }

    const { rows: existing } = await query(
      'SELECT id FROM products WHERE id = $1 AND seller_id = $2',
      [id, sellerId]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    if (!Array.isArray(variants) || !variants.length) {
      return res.status(400).json({ success: false, message: 'variants must be a non-empty array.' });
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      // Remove existing variants for this product
      await client.query(
        'DELETE FROM product_variants WHERE product_id = $1',
        [id]
      );
      const inserted = [];
      for (const v of variants) {
        const { rows } = await client.query(
          `INSERT INTO product_variants
             (product_id, color_name, color_hex, size, stock_qty, additional_price)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, color_name, color_hex, size, stock_qty, additional_price`,
          [id, v.color_name || v.color || null, v.color_hex || null, v.size || null, v.stock_qty ?? v.stock ?? 0, v.additional_price ?? v.price_modifier ?? 0]
        );
        inserted.push(rows[0]);
      }
      await client.query('COMMIT');
      return res.status(201).json({ success: true, data: { variants: inserted } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/products/:id/fixed-options  (seller only)
// ---------------------------------------------------------------------------
async function saveFixedOptions(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const { options } = req.body; // array of { label, choices: string[] }

    const { rows: existing } = await query(
      'SELECT id FROM products WHERE id = $1 AND seller_id = $2',
      [id, sellerId]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    if (!Array.isArray(options) || !options.length) {
      return res.status(400).json({ success: false, message: 'options must be a non-empty array.' });
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM fixed_customization_options WHERE product_id = $1', [id]);
      const inserted = [];
      for (const opt of options) {
        const { rows } = await client.query(
          `INSERT INTO fixed_customization_options (product_id, option_type, label, choices, is_required, max_length, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, option_type, label, choices, is_required, max_length`,
          [id, opt.option_type || 'text', opt.label, JSON.stringify(opt.choices || []), opt.is_required ?? false, opt.max_length || null, opt.sort_order || 0]
        );
        inserted.push(rows[0]);
      }
      await client.query('COMMIT');
      return res.status(201).json({ success: true, data: { fixed_customization_options: inserted } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/products/:id/view  (auth optional)
// ---------------------------------------------------------------------------
async function recordView(req, res, next) {
  try {
    const { id } = req.params;
    const cleanId = String(id || '').trim();
    const userId = req.user?.id || null;

    if (!cleanId || cleanId === 'null' || cleanId === 'undefined') {
      return res.json({ success: true, data: { message: 'View ignored.' } });
    }

    // Increment view count safely
    await query(
      `UPDATE products SET view_count = view_count + 1 
       WHERE (id::text = $1 OR slug = $1) AND (status = 'active' OR is_active = TRUE)`,
      [cleanId]
    );

    // Save to product_views for personalization
    if (userId) {
      await query(
        `INSERT INTO product_views (product_id, user_id, viewed_at)
         SELECT id, $2, NOW() FROM products WHERE (id::text = $1 OR slug = $1)
         ON CONFLICT DO NOTHING`,
        [cleanId, userId]
      ).catch(() => {});
    }

    return res.json({ success: true, data: { message: 'View recorded.' } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/products/seller/alerts/low-stock  (seller only)
// ---------------------------------------------------------------------------
async function getLowStockProducts(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { rows } = await query(
      `SELECT p.id, p.name, p.base_price, p.stock_quantity, p.low_stock_threshold, p.status,
              COALESCE(
                json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
                '[]'
              ) AS images
       FROM products p
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
       WHERE p.seller_id = $1 
         AND p.status != 'deleted'
         AND p.stock_quantity <= p.low_stock_threshold
       GROUP BY p.id
       ORDER BY p.stock_quantity ASC`,
      [sellerId]
    );

    return res.json({ success: true, data: { low_stock_products: rows.map(sanitizeProduct) } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCategories,
  listProducts,
  getFeaturedProducts,
  forYouFeed,
  searchProducts,
  getProduct,
  getProductDetail: getProduct,
  getSellerProducts,
  getLowStockProducts,
  createProduct,
  updateProduct,
  updateProductStatus,
  uploadImages,
  upsertVariants,
  saveFixedOptions,
  recordView,
};

