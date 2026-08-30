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

// Normalize fields for all frontend views
function sanitizeProduct(p) {
  if (!p) return null;
  const price = parseFloat(p.base_price || p.price || 0);
  const pricePaise = Math.round(price * 100);

  let images = [];
  if (Array.isArray(p.product_images) && p.product_images.length > 0) {
    images = p.product_images.map(img => (typeof img === 'string' ? { url: img } : { url: img.url || img.image_url || img }));
  } else if (Array.isArray(p.direct_images) && p.direct_images.length > 0) {
    images = p.direct_images.map(img => (typeof img === 'string' ? { url: img } : { url: img.url || img.image_url || img }));
  } else if (Array.isArray(p.images) && p.images.length > 0) {
    images = p.images.map(img => (typeof img === 'string' ? { url: img } : { url: img.url || img.image_url || img }));
  } else if (p.image_url || p.primary_image) {
    images = [{ url: p.image_url || p.primary_image }];
  }

  const primaryImg = (images.length > 0 && images[0].url)
    ? images[0].url
    : (p.image_url || p.primary_image || null);

  const sellerName = p.store_name || p.seller_name || 'Artisan Studio';
  const sellerAvatar = p.profile_photo || p.avatar_url || '/img/default-avatar.png';

  const rawVariants = Array.isArray(p.variants) ? p.variants : [];
  const variants = rawVariants.map(v => {
    let vImgs = [];
    if (Array.isArray(v.images) && v.images.length > 0) {
      vImgs = v.images.map(img => (typeof img === 'string' ? img : (img.url || img.image_url || img))).filter(Boolean);
    } else if (v.image_url) {
      vImgs = [v.image_url];
    }
    return {
      ...v,
      image_url: vImgs[0] || v.image_url || null,
      images: vImgs,
      additional_price: parseFloat(v.additional_price || 0),
      stock_qty: parseInt(v.stock_qty ?? v.stock ?? 0, 10)
    };
  });

  return {
    ...p,
    title: p.name || p.title,
    tags: Array.isArray(p.tags) ? p.tags : [],
    variants,
    images,
    special_packaging_available: p.special_packaging_available !== false,
    price,
    price_paise: pricePaise,
    stock_quantity: p.stock_quantity ?? p.stock_qty ?? 50,
    stock_count: p.stock_quantity ?? p.stock_qty ?? 50,
    stock_qty: p.stock_quantity ?? p.stock_qty ?? 50,
    stock: p.stock_quantity ?? p.stock_qty ?? 50,
    discount_active: Boolean(p.discount_active),
    discount_percentage: p.discount_percentage ? parseInt(p.discount_percentage, 10) : null,
    discounted_price: p.sale_price ? parseFloat(p.sale_price) : (p.discount_active && p.discount_percentage ? Math.round(price * (1 - p.discount_percentage / 100) * 100) / 100 : null),
    sale_price: p.sale_price ? parseFloat(p.sale_price) : null,
    image_url: primaryImg,
    primary_image: primaryImg,
    cover_photo_url: primaryImg,
    seller_name: sellerName,
    store_name: sellerName,
    seller: {
      id: p.seller_id,
      seller_name: sellerName,
      store_name: sellerName,
      avatar_url: sellerAvatar
    },
    occasions: Array.isArray(p.occasions) ? p.occasions : [],
    parent_category_id: p.parent_category_id || null,
    category: p.category_name ? {
      id: p.category_id,
      name: p.category_name,
      slug: p.category_slug || '',
      parent_id: p.parent_category_id || null
    } : (p.category || null),
    listing_type: (p.customization_mode === 'fixed' || p.customization_mode === 'open') ? 'custom' : 'standard',
    is_customized: p.customization_mode === 'fixed' || p.customization_mode === 'open' || Boolean(p.is_customizable),
    avg_rating: parseFloat(p.avg_rating || 5.0),
    review_count: parseInt(p.review_count || 0, 10),
    type: p.is_sponsored ? 'sponsored' : 'organic'
  };
}

// ---------------------------------------------------------------------------
// GET /api/products/categories & /api/categories  (PUBLIC — used by buyer home/search/categories)
// ---------------------------------------------------------------------------
async function listCategories(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT c.id, c.name, COALESCE(c.display_name, c.name) AS display_name,
              c.slug, c.emoji_icon, c.icon_emoji, c.image_url, c.banner_image_url,
              c.description, c.parent_id, c.sort_order,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
       FROM categories c
       WHERE c.is_active = TRUE
       ORDER BY c.sort_order ASC, c.id ASC`
    );

    if (rows && rows.length > 0) {
      const rootCategories = [];
      const categoriesMap = {};

      rows.forEach(row => {
        if (!row.parent_id) {
          categoriesMap[row.id] = {
            id: row.id,
            name: row.name,
            display_name: row.display_name || row.name,
            slug: row.slug,
            emoji_icon: row.emoji_icon || row.icon_emoji || '🎁',
            icon_emoji: row.icon_emoji || row.emoji_icon || '🎁',
            description: row.description || '',
            product_count: parseInt(row.product_count || 0, 10),
            image_url: row.image_url || `/img/categories/${row.slug}.jpg`,
            banner_image_url: row.banner_image_url || row.image_url || `/img/categories/${row.slug}.jpg`,
            subcategories: []
          };
          rootCategories.push(categoriesMap[row.id]);
        }
      });

      rows.forEach(row => {
        if (row.parent_id && categoriesMap[row.parent_id]) {
          categoriesMap[row.parent_id].subcategories.push({
            id: row.id,
            name: row.name,
            slug: row.slug,
            product_count: parseInt(row.product_count || 0, 10)
          });
        }
      });

      return res.json({ success: true, data: { categories: rootCategories, raw: rows } });
    }

    return res.json({ success: true, data: { categories: [] } });
  } catch (err) {
    next(err);
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
      conditions.push(`(
        p.category_id::text = $${params.length} 
        OR p.category_id::text IN (SELECT id::text FROM categories WHERE slug = $${params.length})
        OR p.category_id IN (
          SELECT id FROM categories 
          WHERE parent_id::text = $${params.length} 
             OR parent_id IN (SELECT id FROM categories WHERE slug = $${params.length})
        )
      )`);
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
      const occRaw = String(occasion).trim().toLowerCase();
      const occSlug = occRaw.replace(/\s+/g, '-');
      const occWords = occRaw.replace(/-/g, ' ');
      params.push(occSlug);
      const slugIdx = params.length;
      params.push(`%${occWords}%`);
      const wordIdx = params.length;
      conditions.push(`(
        p.id IN (SELECT product_id FROM product_occasion_tags WHERE occasion_slug = $${slugIdx} OR occasion_slug = $${wordIdx})
        OR p.name ILIKE $${wordIdx} 
        OR p.description ILIKE $${wordIdx}
      )`);
    }
    if (seller_id) {
      params.push(seller_id);
      conditions.push(`(p.seller_id::text = $${params.length})`);
    }

    const checkFeatured = featured === 'true' || is_featured === 'true';
    if (checkFeatured) {
      conditions.push(`(p.is_sponsored = TRUE OR p.view_count > 5)`);
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
              p.tags, p.images AS direct_images,
              p.customization_mode, p.is_customizable, p.customization_schema, p.status, p.view_count, p.seller_id,
              p.is_sponsored, p.special_packaging_available, p.slug,
              COALESCE(p.preparation_days, 2) AS preparation_days,
              COALESCE(p.weight_grams, 500) AS weight_grams,
              p.created_at,
              c.name AS category_name, c.slug AS category_slug,
              (SELECT parent_id FROM categories WHERE id = p.category_id) AS parent_category_id,
              COALESCE(
                (SELECT array_agg(pot.occasion_slug) FROM product_occasion_tags pot WHERE pot.product_id = p.id),
                '{}'::text[]
              ) AS occasions,
              COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
              COALESCE(
                json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
                '[]'
              ) AS product_images
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
       LEFT JOIN sellers s ON s.user_id = p.seller_id
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
       WHERE ${where}
       GROUP BY p.id, sp.store_name, s.store_name, p.special_packaging_available, c.name, c.slug
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
        `SELECT DISTINCT p.id, p.name, p.description, p.base_price, p.category_id, p.tags,
                p.customization_mode, p.is_customizable, p.is_best_seller AS is_bestseller, p.is_sponsored,
                p.avg_rating, p.review_count, p.status, p.view_count, p.seller_id, p.created_at,
                p.special_packaging_available, p.slug,
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
             NOT EXISTS (SELECT 1 FROM product_views WHERE user_id = $1)
             OR p.category_id IN (
               SELECT DISTINCT p2.category_id FROM product_views pv
               JOIN products p2 ON p2.id = pv.product_id
               WHERE pv.user_id = $1
               LIMIT 5
             )
           )
         GROUP BY p.id, sp.store_name, s.store_name, p.special_packaging_available
         ORDER BY p.created_at DESC
         LIMIT $2`,
        [userId, limit]
      );
      rows = fetched;
    } else {
      // Anonymous: random active products
      const { rows: fetched } = await query(
        `SELECT p.id, p.name, p.description, p.base_price, p.category_id, p.tags,
                p.customization_mode, p.is_customizable, p.is_best_seller AS is_bestseller, p.is_sponsored,
                p.avg_rating, p.review_count, p.status, p.view_count, p.seller_id, p.created_at,
                p.special_packaging_available, p.slug,
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
         GROUP BY p.id, sp.store_name, s.store_name, p.special_packaging_available
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
// GET /api/products/sponsored
// ---------------------------------------------------------------------------
async function getSponsoredProducts(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || 8, 10), 1), 50);

    // 1. First fetch products explicitly flagged as sponsored
    const { rows: sponsoredRows } = await query(
      `SELECT p.id, p.name, p.description, p.base_price, p.category_id, p.tags,
              p.customization_mode, p.is_customizable, p.is_best_seller AS is_bestseller,
              TRUE AS is_sponsored,
              p.avg_rating, p.review_count, p.status, p.view_count, p.seller_id, p.created_at,
              p.special_packaging_available, p.slug,
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
         AND p.is_sponsored = TRUE
         AND (
           sp.verification_status = 'verified'
           OR s.verification_status = 'verified'
           OR sp.is_approved = TRUE
           OR s.is_approved = TRUE
           OR (sp.user_id IS NULL AND s.user_id IS NULL)
         )
       GROUP BY p.id, sp.store_name, s.store_name, p.special_packaging_available
       ORDER BY p.priority_rank DESC, p.created_at DESC
       LIMIT $1`,
      [limit]
    );

    let finalRows = sponsoredRows;

    // 2. Fallback if fewer than limit (e.g. fresh marketplace launch): supplement with top creations
    if (finalRows.length < limit) {
      const needed = limit - finalRows.length;
      const existingIds = finalRows.map(r => r.id);
      
      const { rows: fallbackRows } = await query(
        `SELECT p.id, p.name, p.description, p.base_price, p.category_id, p.tags,
                p.customization_mode, p.is_customizable, p.is_best_seller AS is_bestseller,
                TRUE AS is_sponsored,
                p.avg_rating, p.review_count, p.status, p.view_count, p.seller_id, p.created_at,
                p.special_packaging_available, p.slug,
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
           AND p.id != ALL($1::int[])
           AND (
             sp.verification_status = 'verified'
             OR s.verification_status = 'verified'
             OR sp.is_approved = TRUE
             OR s.is_approved = TRUE
             OR (sp.user_id IS NULL AND s.user_id IS NULL)
           )
         GROUP BY p.id, sp.store_name, s.store_name, p.special_packaging_available
         ORDER BY p.priority_rank DESC, (CASE WHEN COALESCE(p.is_best_seller, 0) > 0 THEN 1 ELSE 0 END) DESC, p.avg_rating DESC, p.created_at DESC
         LIMIT $2`,
        [existingIds.length ? existingIds : [-1], needed]
      );

      finalRows = finalRows.concat(fallbackRows);
    }

    return res.json({ success: true, data: { products: finalRows.map(sanitizeProduct) } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/products/trending
// ---------------------------------------------------------------------------
async function getTrendingProducts(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || 8, 10), 1), 50);

    const { rows } = await query(
      `SELECT p.id, p.name, p.description, p.base_price, p.category_id, p.tags,
              p.customization_mode, p.is_customizable, p.is_best_seller AS is_bestseller, p.is_sponsored,
              p.avg_rating, p.review_count, p.status, p.view_count, p.seller_id, p.created_at,
              p.special_packaging_available, p.slug,
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
       GROUP BY p.id, sp.store_name, s.store_name, p.special_packaging_available
       ORDER BY (COALESCE(p.view_count, 0) * 2 + COALESCE(p.review_count, 0) * 5 + (CASE WHEN COALESCE(p.is_best_seller, 0) > 0 THEN 20 ELSE 0 END)) DESC,
                p.avg_rating DESC,
                p.created_at DESC
       LIMIT $1`,
      [limit]
    );

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
    const rawTerm = (q || occasion || search || req.query.query || '').trim().replace(/-/g, ' ');

    if (!rawTerm) {
      return res.status(400).json({ success: false, message: 'Search query (q or occasion) is required.' });
    }

    // Occasion synonym expansion — maps common occasion/gift terms to additional search keywords
    const OCCASION_SYNONYMS = {
      'birthday': ['gift', 'celebration', 'candle', 'jewellery', 'nails', 'floral', 'cake', 'personalized'],
      'wedding': ['bridal', 'couple', 'gift', 'candle', 'floral', 'hamper', 'ritual'],
      'anniversary': ['couple', 'romantic', 'candle', 'floral', 'gift', 'keepsake', 'personalized'],
      'housewarming': ['home decor', 'candle', 'plant', 'vase', 'ceramic', 'sculpture', 'basket'],
      'baby shower': ['baby', 'gift', 'handcrafted', 'soft', 'toy', 'keepsake'],
      'diwali': ['diya', 'candle', 'gift', 'festive', 'hamper', 'home decor'],
      'christmas': ['gift', 'candle', 'ornament', 'hamper', 'wreath', 'festive'],
      'mother': ['floral', 'jewellery', 'candle', 'gift', 'keepsake', 'handmade'],
      'father': ['personalized', 'keepsake', 'handcrafted', 'gift'],
      'graduation': ['gift', 'keepsake', 'personalized', 'celebration'],
      'valentine': ['romantic', 'candle', 'floral', 'couple', 'gift', 'jewellery'],
      'raksha bandhan': ['gift', 'hamper', 'handcrafted', 'festive'],
      'gift': ['hamper', 'keepsake', 'personalized', 'handcrafted'],
    };

    const lowerTerm = rawTerm.toLowerCase();
    const extraTerms = [];
    for (const [key, synonyms] of Object.entries(OCCASION_SYNONYMS)) {
      if (lowerTerm.includes(key)) {
        extraTerms.push(...synonyms);
      }
    }

    // Build list of all terms to search (original + synonyms)
    const allTerms = [rawTerm, ...extraTerms];
    const likePatterns = allTerms.map(t => `%${t}%`);
    const searchTerm = rawTerm;
    const likePattern = `%${searchTerm}%`;

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    // Build a dynamic OR clause for all expanded terms against name, description, tags, category
    const termConditions = allTerms.map((_, i) => {
      const np = 6 + (i * 2);      // name/desc param index
      const tp = 6 + (i * 2) + 1;  // tags param index
      return `(p.name ILIKE $${np} OR p.description ILIKE $${np} OR array_to_string(p.tags, ' ') ILIKE $${tp} OR c.name ILIKE $${np})`;
    });
    const expandedCondition = termConditions.join(' OR ');

    // Flatten params: [searchTerm, likePattern, sort, limitNum, offset, ...termLikePatterns]
    const dynamicParams = [];
    allTerms.forEach(t => {
      dynamicParams.push(`%${t}%`); // for name/desc/category
      dynamicParams.push(`%${t}%`); // for tags
    });

    const { rows } = await query(
      `SELECT p.id, p.name, p.description, p.base_price, p.category_id, p.tags,
              p.customization_mode, p.is_customizable, p.customization_schema, p.status, p.view_count, p.seller_id, p.created_at,
              p.slug,
              c.name AS category_name,
              COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
              COALESCE(
                json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
                '[]'
              ) AS images
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
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
           OR array_to_string(p.tags, ' ') ILIKE $2
           OR c.name ILIKE $2
           OR p.id IN (SELECT product_id FROM product_occasion_tags WHERE occasion_slug ILIKE $2)
           OR ${expandedCondition}
         )
       GROUP BY p.id, c.name, sp.store_name, s.store_name
       ORDER BY
         CASE WHEN $3 = 'price_low' THEN p.base_price END ASC,
         CASE WHEN $3 = 'price_high' THEN p.base_price END DESC,
         p.created_at DESC
       LIMIT $4 OFFSET $5`,
      [searchTerm, likePattern, sort, limitNum, offset, ...dynamicParams]
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
              p.tags, p.images AS direct_images,
              p.customization_mode, p.is_customizable, p.customization_schema, p.open_customization_config,
              p.status, p.view_count, p.seller_id, p.is_sponsored,
              p.special_packaging_available,
              COALESCE(p.preparation_days, 2) AS preparation_days,
              COALESCE(p.weight_grams, 500) AS weight_grams,
              p.created_at, p.updated_at,
              c.name AS category_name, c.slug AS category_slug,
              (SELECT parent_id FROM categories WHERE id = p.category_id) AS parent_category_id,
              COALESCE(
                (SELECT array_agg(pot.occasion_slug) FROM product_occasion_tags pot WHERE pot.product_id = p.id),
                '{}'::text[]
              ) AS occasions,
              COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name, COALESCE(s.photo_url, u.profile_photo_url) AS profile_photo,
              COALESCE(
                (SELECT json_agg(pi ORDER BY pi.sort_order)
                 FROM product_images pi WHERE pi.product_id = p.id),
                '[]'
              ) AS product_images,
              COALESCE(
                (SELECT json_agg(
                  json_build_object(
                    'id', pv.id,
                    'product_id', pv.product_id,
                    'variant_name', pv.variant_name,
                    'color_name', pv.color_name,
                    'color_hex', pv.color_hex,
                    'size', pv.size,
                    'additional_price', pv.additional_price,
                    'stock_qty', pv.stock_qty,
                    'image_url', pv.image_url,
                    'images', COALESCE(pv.images, CASE WHEN pv.image_url IS NOT NULL THEN ARRAY[pv.image_url] ELSE '{}'::text[] END)
                  ) ORDER BY pv.id ASC
                ) FROM product_variants pv WHERE pv.product_id = p.id),
                '[]'
              ) AS variants,
              COALESCE(
                (SELECT json_agg(fo) FROM fixed_customization_options fo WHERE fo.product_id = p.id),
                '[]'
              ) AS fixed_customization_options
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
       LEFT JOIN sellers s ON s.user_id = p.seller_id
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
// GET /api/products/seller/:sellerId & /api/seller/listings
// ---------------------------------------------------------------------------
async function getSellerProducts(req, res, next) {
  try {
    const { sellerId } = req.params;
    const { page = '1', limit = '50', status, search } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    const conditions = ['p.seller_id::text = $1'];
    const params = [String(sellerId)];

    // If caller explicitly specifies status
    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    } else if (!req.seller && !req.user?.role?.includes('admin')) {
      // For unauthenticated/public seller storefront view, only show active
      conditions.push("p.status = 'active'");
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      conditions.push(`LOWER(p.name) LIKE $${params.length}`);
    }

    const where = conditions.join(' AND ');
    params.push(limitNum);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT p.id, p.name, p.description, p.base_price, p.stock_quantity, p.low_stock_threshold, p.category_id,
              p.customization_mode, p.is_customizable, p.customization_schema, p.status, p.view_count, p.seller_id, p.created_at,
              p.discount_active, p.discount_percentage, p.sale_price,
              COALESCE(p.preparation_days, 2) AS preparation_days,
              COALESCE(p.weight_grams, 500) AS weight_grams,
              COALESCE(
                json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
                '[]'
              ) AS images
       FROM products p
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
       WHERE ${where}
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM products p WHERE ${where}`,
      params.slice(0, params.length - 2)
    );

    const sanitized = rows.map(sanitizeProduct);
    const total = parseInt(countRows[0]?.total || 0, 10);

    return res.json({
      success: true,
      data: {
        products: sanitized,
        listings: sanitized,
        total,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil(total / limitNum) || 1
      },
      products: sanitized,
      listings: sanitized,
      total
    });
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

    const priceVal = Number(base_price);
    const pricePaise = Math.round(priceVal * 100);

    const finalCategoryId = req.body.subcategory_id || req.body.category_id || null;

    const { rows } = await query(
      `INSERT INTO products
         (seller_id, name, description, category_id, base_price, price_paise, stock_quantity, low_stock_threshold,
          preparation_days, weight_grams, customization_mode, is_customizable, customization_schema, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
       RETURNING id, name, description, category_id, base_price, stock_quantity, low_stock_threshold,
                 preparation_days, weight_grams, customization_mode, is_customizable, customization_schema, status, created_at`,
      [
        sellerId,
        name,
        description || null,
        finalCategoryId,
        priceVal,
        pricePaise,
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

    // Handle occasions if provided in body
    const { occasions, occasion_tags } = req.body;
    const occList = Array.isArray(occasions) ? occasions : (Array.isArray(occasion_tags) ? occasion_tags : []);
    if (occList.length > 0) {
      for (const occ of occList) {
        const occSlug = String(occ).trim().toLowerCase().replace(/\s+/g, '-');
        if (occSlug) {
          await query(
            `INSERT INTO product_occasion_tags (product_id, occasion_slug)
             VALUES ($1, $2)
             ON CONFLICT (product_id, occasion_slug) DO NOTHING`,
            [product.id, occSlug]
          );
        }
      }
    }

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

    // Handle variants if provided in body
    const { variants } = req.body;
    if (Array.isArray(variants) && variants.length > 0) {
      for (const v of variants) {
        let vImgs = [];
        if (Array.isArray(v.images) && v.images.length > 0) {
          vImgs = v.images.map(img => (typeof img === 'string' ? img : (img.url || img.image_url || ''))).filter(Boolean);
        } else if (v.image_url) {
          vImgs = [v.image_url];
        }
        const primaryImg = vImgs[0] || v.image_url || null;

        await query(
          `INSERT INTO product_variants
             (product_id, variant_name, color_name, color_hex, size, stock_qty, additional_price, image_url, images)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            product.id,
            v.variant_name || v.name || v.variant_label || null,
            v.color_name || v.color || null,
            v.color_hex || null,
            v.size || null,
            v.stock_qty ?? v.stock_quantity ?? v.stock ?? 50,
            v.additional_price ?? v.price_modifier ?? 0,
            primaryImg,
            vImgs
          ]
        );
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
      subcategory_id,
      base_price,
      stock_quantity,
      low_stock_threshold,
      preparation_days,
      weight_grams,
      is_customizable,
      customization_mode,
      customization_schema,
      images,
      variants,
      occasions,
      occasion_tags,
    } = req.body;

    const { rows: existing } = await query(
      'SELECT id FROM products WHERE id = $1 AND (seller_id = $2 OR $3 = TRUE)',
      [id, sellerId, req.user?.role === 'admin' || req.user?.role === 'master_admin']
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

    const rawStock = stock_quantity !== undefined
      ? stock_quantity
      : (req.body.stock_count !== undefined ? req.body.stock_count : (req.body.stock !== undefined ? req.body.stock : req.body.stock_qty));
    const resolvedStock = (rawStock !== undefined && rawStock !== null && String(rawStock).trim() !== '')
      ? Math.max(0, parseInt(rawStock, 10))
      : null;

    const updatedPrice = base_price !== undefined ? Number(base_price) : (req.body.price !== undefined ? Number(req.body.price) : null);
    const updatedPaise = updatedPrice !== null ? Math.round(updatedPrice * 100) : (req.body.price_paise ? Number(req.body.price_paise) : null);
    const finalUpdateCatId = subcategory_id !== undefined ? subcategory_id : category_id;

    const { rows } = await query(
      `UPDATE products
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           category_id = COALESCE($3, category_id),
           base_price = COALESCE($4, base_price),
           price_paise = COALESCE($5, price_paise),
           stock_quantity = COALESCE($6, stock_quantity),
           low_stock_threshold = COALESCE($7, low_stock_threshold),
           preparation_days = COALESCE($8, preparation_days),
           weight_grams = COALESCE($9, weight_grams),
           customization_mode = COALESCE($10, customization_mode),
           is_customizable = COALESCE($11, is_customizable),
           customization_schema = COALESCE($12, customization_schema),
           updated_at = NOW()
       WHERE id = $13
       RETURNING id, name, description, category_id, base_price, stock_quantity, low_stock_threshold,
                 preparation_days, weight_grams, customization_mode, is_customizable, customization_schema, status, updated_at`,
      [
        name || null,
        description || null,
        finalUpdateCatId || null,
        updatedPrice,
        updatedPaise,
        resolvedStock !== null && !isNaN(resolvedStock) ? resolvedStock : null,
        low_stock_threshold !== undefined ? Number(low_stock_threshold) : null,
        preparation_days !== undefined ? Math.max(0, parseInt(preparation_days, 10)) : null,
        weight_grams !== undefined ? Math.max(1, parseInt(weight_grams, 10)) : null,
        finalMode || null,
        finalIsCustomizable,
        schemaJson,
        id
      ]
    );

    // Sync occasion tags if provided
    if (Array.isArray(occasions) || Array.isArray(occasion_tags)) {
      const occList = Array.isArray(occasions) ? occasions : (Array.isArray(occasion_tags) ? occasion_tags : []);
      await query('DELETE FROM product_occasion_tags WHERE product_id = $1', [id]);
      for (const occ of occList) {
        const occSlug = String(occ).trim().toLowerCase().replace(/\s+/g, '-');
        if (occSlug) {
          await query(
            `INSERT INTO product_occasion_tags (product_id, occasion_slug)
             VALUES ($1, $2)
             ON CONFLICT (product_id, occasion_slug) DO NOTHING`,
            [id, occSlug]
          );
        }
      }
    }

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

    // If variants array is provided, replace variants
    if (Array.isArray(variants)) {
      await query('DELETE FROM product_variants WHERE product_id = $1', [id]);
      for (const v of variants) {
        let vImgs = [];
        if (Array.isArray(v.images) && v.images.length > 0) {
          vImgs = v.images.map(img => (typeof img === 'string' ? img : (img.url || img.image_url || ''))).filter(Boolean);
        } else if (v.image_url) {
          vImgs = [v.image_url];
        }
        const primaryImg = vImgs[0] || v.image_url || null;

        await query(
          `INSERT INTO product_variants
             (product_id, variant_name, color_name, color_hex, size, stock_qty, additional_price, image_url, images)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            v.variant_name || v.name || v.variant_label || null,
            v.color_name || v.color || null,
            v.color_hex || null,
            v.size || null,
            v.stock_qty ?? v.stock_quantity ?? v.stock ?? 50,
            v.additional_price ?? v.price_modifier ?? 0,
            primaryImg,
            vImgs
          ]
        );
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
       WHERE id = $2 AND (seller_id = $3 OR $4 = TRUE)
       RETURNING id, status, updated_at`,
      [status, id, sellerId, req.user?.role === 'admin' || req.user?.role === 'master_admin']
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
      'SELECT id FROM products WHERE id = $1 AND (seller_id = $2 OR $3 = TRUE)',
      [id, sellerId, req.user?.role === 'admin' || req.user?.role === 'master_admin']
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
    const sellerId = req.seller?.id || req.user.id;
    const { variants } = req.body; // array of { variant_name, color_name, color_hex, size, stock_qty, additional_price, image_url, images }

    const { rows: existing } = await query(
      'SELECT id FROM products WHERE id = $1 AND (seller_id = $2 OR $3 = TRUE)',
      [id, sellerId, req.user?.role === 'admin' || req.user?.role === 'master_admin']
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
        let vImgs = [];
        if (Array.isArray(v.images) && v.images.length > 0) {
          vImgs = v.images.map(img => (typeof img === 'string' ? img : (img.url || img.image_url || ''))).filter(Boolean);
        } else if (v.image_url) {
          vImgs = [v.image_url];
        }
        const primaryImg = vImgs[0] || v.image_url || null;

        const { rows } = await client.query(
          `INSERT INTO product_variants
             (product_id, variant_name, color_name, color_hex, size, stock_qty, additional_price, image_url, images)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, product_id, variant_name, color_name, color_hex, size, stock_qty, additional_price, image_url, images`,
          [
            id,
            v.variant_name || v.name || v.variant_label || null,
            v.color_name || v.color || null,
            v.color_hex || null,
            v.size || null,
            v.stock_qty ?? v.stock_quantity ?? v.stock ?? 50,
            v.additional_price ?? v.price_modifier ?? 0,
            primaryImg,
            vImgs
          ]
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

// ---------------------------------------------------------------------------
// GET /api/products/:id/recommendations  — Similarity-based ("More like this")
// ---------------------------------------------------------------------------
async function getRecommendations(req, res, next) {
  try {
    const { id } = req.params;
    const cleanId = String(id || '').trim();
    if (!cleanId || cleanId === 'null' || cleanId === 'undefined') {
      return res.json({ success: true, data: [] });
    }

    // 1. Fetch reference product metadata
    const { rows: targetRows } = await query(
      `SELECT id, category_id, seller_id, tags, name FROM products WHERE id::text = $1 OR slug = $1 LIMIT 1`,
      [cleanId]
    );

    if (!targetRows.length) {
      return res.json({ success: true, data: [] });
    }

    const target = targetRows[0];
    const targetTags = Array.isArray(target.tags) ? target.tags : [];

    // 2. Query similar products scored by category, tags, and seller matches
    const { rows } = await query(
      `SELECT p.id, p.name, p.slug, p.description, p.base_price, p.stock_quantity, p.category_id,
              p.tags, p.images AS direct_images,
              p.customization_mode, p.is_customizable, p.status, p.view_count, p.seller_id,
              p.is_sponsored,
              c.name AS category_name, c.slug AS category_slug,
              COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
              COALESCE(
                (SELECT json_agg(pi ORDER BY pi.sort_order)
                 FROM product_images pi WHERE pi.product_id = p.id),
                '[]'
              ) AS product_images,
              (
                (CASE WHEN p.category_id = $2 THEN 100 ELSE 0 END) +
                (CASE WHEN $4::text[] && COALESCE(p.tags, '{}'::text[]) THEN 40 ELSE 0 END) +
                (CASE WHEN p.seller_id = $3 THEN 20 ELSE 0 END)
              ) AS similarity_score
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
       LEFT JOIN sellers s ON s.user_id = p.seller_id
       WHERE (p.id::text != $1 AND p.slug != $1)
         AND (p.status = 'active' OR p.is_active = TRUE)
         AND (
           sp.verification_status = 'verified'
           OR s.verification_status = 'verified'
           OR sp.is_approved = TRUE
           OR s.is_approved = TRUE
           OR (sp.user_id IS NULL AND s.user_id IS NULL)
         )
       GROUP BY p.id, sp.store_name, s.store_name, c.name, c.slug
       ORDER BY similarity_score DESC, p.view_count DESC, p.created_at DESC
       LIMIT 8`,
      [String(target.id), target.category_id, target.seller_id, targetTags]
    );

    const sanitized = rows.map(sanitizeProduct);
    return res.json({ success: true, data: sanitized, recommendations: sanitized, products: sanitized });
  } catch (err) {
    console.error('Recommendations error:', err);
    return res.json({ success: true, data: [] });
  }
}

module.exports = {
  listCategories,
  listProducts,
  getFeaturedProducts,
  forYouFeed,
  getSponsoredProducts,
  getTrendingProducts,
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
  getRecommendations,
  getMoreLikeThis: getRecommendations,
};

