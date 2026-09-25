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
const bestsellerService = require('../services/bestseller.service');

function uniqueImageUrls(values) {
  const seen = new Set();
  return values.map((value) => {
    if (typeof value === 'string') return value;
    return value?.url || value?.image_url || value?.imagePath || value?.img_url || null;
  }).filter((url) => {
    if (!url) return false;
    const normalizedUrl = url
      .split('?')[0]
      .replace(/\.(jpe?g|png|webp)$/i, '')
      .toLowerCase();
    if (seen.has(normalizedUrl)) return false;
    seen.add(normalizedUrl);
    return true;
  });
}

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
  images = uniqueImageUrls(images).map(url => ({ url }));

  const primaryImg = (images.length > 0 && images[0].url)
    ? images[0].url
    : (p.image_url || p.primary_image || null);

  const sellerName = p.store_name || p.seller_name || 'Artisan Studio';
  const sellerAvatar = p.profile_photo || p.avatar_url || '/img/default-avatar.png';

  const rawVariants = Array.isArray(p.variants) ? p.variants : [];
  const variants = rawVariants.map(v => {
    let vImgs = [];
    if (Array.isArray(v.images) && v.images.length > 0) {
      vImgs = uniqueImageUrls(v.images);
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
    discount_active: Boolean(p.discount_active && p.discount_active != 0),
    discount_percentage: p.discount_percentage ? parseInt(p.discount_percentage, 10) : null,
    discounted_price: p.sale_price ? Math.round(parseFloat(p.sale_price) * 100) : ((p.discount_active && p.discount_active != 0) && p.discount_percentage ? Math.round(price * (1 - p.discount_percentage / 100) * 100) : null),
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
    avg_rating: (p.avg_rating !== undefined && p.avg_rating !== null && !isNaN(parseFloat(p.avg_rating)) && parseInt(p.review_count || 0, 10) > 0)
      ? parseFloat(p.avg_rating)
      : null, // null means no reviews yet — display as "No ratings" not "5 stars"
    review_count: parseInt(p.review_count || 0, 10),
    is_bestseller: p.is_bestseller === true,
    type: p.is_sponsored ? 'sponsored' : 'organic'
  };
}

// Deduplicate alternate format pairs (e.g. JPEG and WebP of the same image)
function dedupeAlternateFormatImages(list) {
  if (!Array.isArray(list)) return [];
  const map = new Map();
  for (const item of list) {
    const url = typeof item === 'string' ? item : (item?.url || item?.imagePath || item?.path || item?.img_url || item?.image_url || '');
    if (!url) continue;
    const clean = url.split('?')[0];
    const lastSlash = clean.lastIndexOf('/');
    const dir = lastSlash !== -1 ? clean.substring(0, lastSlash).toLowerCase() : '';
    const filename = lastSlash !== -1 ? clean.substring(lastSlash + 1) : clean;
    const lastDot = filename.lastIndexOf('.');
    const stem = (lastDot !== -1 ? filename.substring(0, lastDot) : filename).toLowerCase();
    const ext = (lastDot !== -1 ? filename.substring(lastDot) : '').toLowerCase();
    const key = `${dir}/${stem}`;

    if (!map.has(key)) {
      map.set(key, item);
    } else {
      const existing = map.get(key);
      const existingUrl = typeof existing === 'string' ? existing : (existing?.url || existing?.imagePath || existing?.path || existing?.img_url || existing?.image_url || '');
      const existingClean = existingUrl.split('?')[0];
      const existingExt = existingClean.substring(existingClean.lastIndexOf('.')).toLowerCase();
      if (ext === '.webp' && existingExt !== '.webp') {
        map.set(key, item);
      }
    }
  }
  return Array.from(map.values());
}

// Helper to safely resolve category from ID, slug, or name (Bug Audit Phase 1 & 2)
async function resolveCategoryId(rawCategory) {
  if (rawCategory === undefined || rawCategory === null) {
    return null;
  }

  let cleanStr = '';
  if (typeof rawCategory === 'object') {
    cleanStr = String(rawCategory.id || rawCategory.slug || rawCategory.name || '').trim();
  } else {
    cleanStr = String(rawCategory).trim();
  }
  if (!cleanStr) return null;

  // 1. Exact match on id::text
  const { rows: idRows } = await query(
    'SELECT id FROM categories WHERE id::text = $1 AND (is_active = TRUE OR is_active IS NULL) LIMIT 1',
    [cleanStr]
  );
  if (idRows.length > 0) return idRows[0].id;

  // 2. Exact match on slug (lowercased)
  const lowerStr = cleanStr.toLowerCase();
  const { rows: slugRows } = await query(
    'SELECT id FROM categories WHERE LOWER(slug) = $1 AND (is_active = TRUE OR is_active IS NULL) LIMIT 1',
    [lowerStr]
  );
  if (slugRows.length > 0) return slugRows[0].id;

  // 3. Exact match on lower(name) or lower(display_name)
  const { rows: nameRows } = await query(
    'SELECT id FROM categories WHERE (LOWER(name) = $1 OR LOWER(display_name) = $1) AND (is_active = TRUE OR is_active IS NULL) LIMIT 1',
    [lowerStr]
  );
  if (nameRows.length > 0) return nameRows[0].id;

  return null;
}

// ---------------------------------------------------------------------------
// GET /api/products/categories & /api/categories  (PUBLIC — used by buyer home/search/categories)
// ---------------------------------------------------------------------------
async function listCategories(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT c.id, c.name, c.display_name, c.slug, c.emoji_icon, c.icon_emoji,
              c.description, COALESCE(c.image_url, c.cover_image, c.banner_image_url) AS image_url, c.cover_image, c.banner_image_url, c.is_featured,
              c.parent_id, c.sort_order,
              (SELECT COUNT(*) FROM products p 
               WHERE (p.category_id = c.id OR p.category_id IN (SELECT id FROM categories WHERE parent_id = c.id AND is_active = TRUE))
                 AND p.status = 'active' AND (p.is_active IS NULL OR p.is_active = TRUE)
              ) AS product_count
       FROM categories c
       WHERE c.is_active = TRUE
       ORDER BY c.sort_order ASC, c.name ASC, c.id ASC`
    );

    if (rows && rows.length > 0) {
      const rootCategories = [];
      const categoriesMap = {};

      rows.forEach(row => {
        if (!row.parent_id) {
          const img = row.image_url || row.cover_image || row.banner_image_url || '/img/categories/artisan_showcase.jpg';
          const emoji = row.emoji_icon || row.icon_emoji || '🏺';
          categoriesMap[row.id] = {
            id: row.id,
            name: row.name,
            display_name: row.display_name || row.name,
            slug: row.slug,
            emoji_icon: emoji,
            icon_emoji: emoji,
            description: row.description || '',
            product_count: parseInt(row.product_count || 0, 10),
            image_url: img,
            cover_image: img,
            banner_image_url: row.banner_image_url || img,
            banner_url: row.banner_image_url || img,
            is_featured: !!row.is_featured,
            sort_order: row.sort_order,
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
            display_name: row.display_name || row.name,
            slug: row.slug,
            sort_order: row.sort_order,
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

// ---------------------------------------------------------------------------
// GET /api/products/categories/:slug (PUBLIC — strict slug resolver)
// ---------------------------------------------------------------------------
async function getCategoryBySlug(req, res, next) {
  try {
    const rawSlug = req.params.slug;
    const slug = (rawSlug ? String(rawSlug) : '').trim().toLowerCase();
    if (!slug) {
      return res.status(404).json({
        success: false,
        code: 'CATEGORY_NOT_FOUND',
        message: 'This collection is not available.'
      });
    }

    // Look up category by exact slug with is_active = TRUE
    const { rows } = await query(
      `SELECT id, name, display_name, slug, description, emoji_icon, icon_emoji,
              COALESCE(image_url, cover_image, banner_image_url) AS image_url, cover_image, banner_image_url, parent_id, sort_order, is_active
       FROM categories
       WHERE slug = $1 AND is_active = TRUE`,
      [slug]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        code: 'CATEGORY_NOT_FOUND',
        message: 'This collection is not available.'
      });
    }

    const matchedRow = rows[0];
    let rootCategoryRow = matchedRow;
    let selectedSubcategory = null;

    if (matchedRow.parent_id !== null) {
      // Subcategory requested: load its active parent
      const { rows: parentRows } = await query(
        `SELECT id, name, display_name, slug, description, emoji_icon, icon_emoji,
                COALESCE(image_url, cover_image, banner_image_url) AS image_url, cover_image, banner_image_url, parent_id, sort_order, is_active
         FROM categories
         WHERE id = $1 AND is_active = TRUE`,
        [matchedRow.parent_id]
      );

      if (!parentRows.length) {
        return res.status(404).json({
          success: false,
          code: 'CATEGORY_NOT_FOUND',
          message: 'This collection is not available.'
        });
      }

      rootCategoryRow = parentRows[0];
    }

    // Load active children of the root category ordered by sort_order, name
    const { rows: subRows } = await query(
      `SELECT c.id, c.name, c.display_name, c.slug, c.sort_order,
              (SELECT COUNT(*) FROM products p 
               WHERE p.category_id = c.id AND p.status = 'active' AND (p.is_active IS NULL OR p.is_active = TRUE)
              ) AS product_count
       FROM categories c
       WHERE c.parent_id = $1 AND c.is_active = TRUE
       ORDER BY c.sort_order ASC, c.name ASC`,
      [rootCategoryRow.id]
    );

    const subcategories = subRows.map(s => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      product_count: parseInt(s.product_count || 0, 10)
    }));

    if (matchedRow.parent_id !== null) {
      const matchedInSubs = subcategories.find(s => s.id === matchedRow.id);
      selectedSubcategory = {
        id: matchedRow.id,
        name: matchedRow.name,
        slug: matchedRow.slug,
        product_count: matchedInSubs ? matchedInSubs.product_count : 0
      };
    }

    // product_count = active products in the category or its active subcategories (same subtree rule listProducts uses)
    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total_count FROM products p
       WHERE p.status = 'active' AND (p.is_active IS NULL OR p.is_active = TRUE)
         AND (
           p.category_id = $1 
           OR p.category_id IN (SELECT id FROM categories WHERE parent_id = $1 AND is_active = TRUE)
         )`,
      [rootCategoryRow.id]
    );
    const rootProductCount = parseInt(countRows[0]?.total_count || 0, 10);

    const emoji = rootCategoryRow.emoji_icon || rootCategoryRow.icon_emoji || '🏺';
    const img = rootCategoryRow.image_url || rootCategoryRow.cover_image || rootCategoryRow.banner_image_url || '/img/categories/artisan_showcase.jpg';
    const banner = rootCategoryRow.banner_image_url || img;

    return res.json({
      success: true,
      data: {
        category: {
          id: rootCategoryRow.id,
          name: rootCategoryRow.name,
          display_name: rootCategoryRow.display_name || rootCategoryRow.name,
          slug: rootCategoryRow.slug,
          description: rootCategoryRow.description || '',
          emoji_icon: emoji,
          image_url: img,
          cover_image: img,
          banner_image_url: banner,
          banner_url: banner,
          product_count: rootProductCount,
          subcategories
        },
        selected_subcategory: selectedSubcategory
      }
    });
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

    const subcategoryParam = req.query.subcategory_ids || req.query.subcategory_id || req.query.subcategories;
    if (subcategoryParam) {
      const subIds = String(subcategoryParam).split(',').map(s => s.trim()).filter(Boolean);
      if (subIds.length > 0) {
        params.push(subIds);
        conditions.push(`(
          p.category_id::text = ANY($${params.length})
          OR p.category_id::text IN (SELECT id::text FROM categories WHERE slug = ANY($${params.length}))
        )`);
      }
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

    const includeRatings = req.query.include_ratings === 'true';
    const ratingsSelect = includeRatings ? `,
              (SELECT COALESCE(ROUND(AVG(r.rating)::numeric,2),0) FROM reviews r WHERE r.product_id = p.id) AS avg_rating,
              (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count` : '';

    const { rows: products } = await query(
      `SELECT p.id, p.name, p.description, p.base_price, p.stock_quantity, p.low_stock_threshold, p.category_id,
              p.tags, p.images AS direct_images,
              p.customization_mode, p.is_customizable, p.customization_schema, p.status, p.view_count, p.seller_id,
              p.is_sponsored, p.is_bestseller, p.special_packaging_available, p.slug,
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
              ) AS product_images${ratingsSelect}
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
        `SELECT p.id, p.name, p.description, p.base_price, p.category_id, p.tags,
                p.images AS direct_images,
                p.customization_mode, p.is_customizable, p.is_sponsored, p.is_bestseller,
                p.status, p.view_count, p.seller_id, p.created_at,
                p.special_packaging_available, p.slug,
                COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
                COALESCE(
                  json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
                  '[]'
                ) AS product_images
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
         ORDER BY RANDOM()
         LIMIT $2`,
        [userId, limit]
      );
      rows = fetched;
    } else {
      // Anonymous: random active products
      const { rows: fetched } = await query(
        `SELECT p.id, p.name, p.description, p.base_price, p.category_id, p.tags,
                p.images AS direct_images,
                p.customization_mode, p.is_customizable, p.is_sponsored, p.is_bestseller,
                p.status, p.view_count, p.seller_id, p.created_at,
                p.special_packaging_available, p.slug,
                COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
                COALESCE(
                  json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
                  '[]'
                ) AS product_images
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
         ORDER BY RANDOM()
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
    // Capped at 5 top sitewide sponsored slots by default, max 5 for featured carousel
    const limit = Math.min(Math.max(parseInt(req.query.limit || 5, 10), 1), 5);

    // 1. First fetch products explicitly flagged as sponsored, prioritized by Max Studio first, then Pro Studio
    const { rows: sponsoredRows } = await query(
      `SELECT p.id, p.name, p.description, p.base_price, p.category_id, p.tags,
              p.customization_mode, p.is_customizable,
              TRUE AS is_sponsored, p.is_bestseller,
              p.status, p.view_count, p.seller_id, p.created_at,
              p.special_packaging_available, p.slug,
              COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
              COALESCE(sp.subscription_plan, s.subscription_plan, 'basic') AS subscription_plan,
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
       GROUP BY p.id, sp.store_name, s.store_name, sp.subscription_plan, s.subscription_plan, p.special_packaging_available
       ORDER BY 
         CASE 
           WHEN COALESCE(sp.subscription_plan, s.subscription_plan) = 'max' THEN 1
           WHEN COALESCE(sp.subscription_plan, s.subscription_plan) = 'pro' THEN 2
           ELSE 3
         END ASC,
         p.priority_rank DESC,
         p.created_at DESC
       LIMIT $1`,
      [limit]
    );

    let finalRows = sponsoredRows;

    // 2. Fallback if fewer than 5 (supplement with high quality active listings)
    if (finalRows.length < limit) {
      const needed = limit - finalRows.length;
      const existingIds = finalRows.map(r => r.id);
      
      const { rows: fallbackRows } = await query(
        `SELECT p.id, p.name, p.description, p.base_price, p.category_id, p.tags,
                p.customization_mode, p.is_customizable,
                TRUE AS is_sponsored, p.is_bestseller,
                p.status, p.view_count, p.seller_id, p.created_at,
                p.special_packaging_available, p.slug,
                COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
                COALESCE(sp.subscription_plan, s.subscription_plan, 'basic') AS subscription_plan,
                COALESCE(
                  json_agg(pi ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
                  '[]'
                ) AS images
         FROM products p
         LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
         LEFT JOIN sellers s ON s.user_id = p.seller_id
         LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
         WHERE (p.status = 'active' OR p.is_active = TRUE)
           AND NOT (p.id::text = ANY($1::text[]))
           AND (
             sp.verification_status = 'verified'
             OR s.verification_status = 'verified'
             OR sp.is_approved = TRUE
             OR s.is_approved = TRUE
             OR (sp.user_id IS NULL AND s.user_id IS NULL)
           )
         GROUP BY p.id, sp.store_name, s.store_name, sp.subscription_plan, s.subscription_plan, p.special_packaging_available
         ORDER BY 
           CASE 
             WHEN COALESCE(sp.subscription_plan, s.subscription_plan) = 'max' THEN 1
             WHEN COALESCE(sp.subscription_plan, s.subscription_plan) = 'pro' THEN 2
             ELSE 3
           END ASC,
           p.priority_rank DESC,
           p.created_at DESC
         LIMIT $2`,
        [existingIds.length ? existingIds.map(String) : ['-1'], needed]
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
              p.customization_mode, p.is_customizable, p.is_sponsored, p.is_bestseller,
              p.status, p.view_count, p.seller_id, p.created_at,
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
       ORDER BY COALESCE(p.view_count, 0) DESC, p.created_at DESC
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
              p.customization_mode, p.is_customizable, p.customization_schema, p.status, p.view_count, p.seller_id, p.is_bestseller, p.created_at,
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
              p.customization_mode, p.is_customizable, p.customization_schema,
              COALESCE(
                p.open_customization_config,
                (SELECT to_jsonb(occ) FROM open_customization_configs occ WHERE occ.product_id = p.id),
                NULL
              ) AS open_customization_config,
              p.status, p.view_count, p.seller_id, p.is_sponsored, p.is_bestseller,
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
       WHERE (p.id::text = $1 OR p.slug = $1) AND p.status NOT IN ('deleted')`,
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
    let { sellerId } = req.params;
    if (!sellerId && req.user) {
      sellerId = req.user.id;
    }
    const headerSellerId = req.headers['x-seller-id'] || req.headers['x-impersonate-seller-id'] || req.query.seller_id || req.query.sellerId;
    const userRole = String(req.user?.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'MASTER_ADMIN';
    if (isAdmin && headerSellerId) {
      sellerId = headerSellerId;
    }

    const { page = '1', limit = '50', status, search } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    // Resolve all possible seller IDs (both user_id and sellers.id / seller_profiles.id)
    const { rows: matchedSellers } = await query(
      'SELECT id, user_id FROM sellers WHERE id::text = $1 OR user_id::text = $1 UNION SELECT id, user_id FROM seller_profiles WHERE id::text = $1 OR user_id::text = $1',
      [String(sellerId)]
    );
    const sellerIds = new Set([String(sellerId)]);
    matchedSellers.forEach(s => {
      if (s.id) sellerIds.add(String(s.id));
      if (s.user_id) sellerIds.add(String(s.user_id));
    });
    const sellerIdArray = Array.from(sellerIds);

    const conditions = [`p.seller_id::text = ANY($1)`];
    const params = [sellerIdArray];

    // Status filtering: Exclude soft-deleted products
    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
      if (status !== 'deleted') {
        conditions.push("p.is_active = TRUE");
      }
    } else {
      conditions.push("p.status != 'deleted'");
      conditions.push("p.is_active = TRUE");
      if (!req.seller && !isAdmin) {
        // For unauthenticated/public seller storefront view, only show active
        conditions.push("p.status = 'active'");
      }
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
              p.customization_mode, p.is_customizable, p.customization_schema, p.status, p.view_count, p.seller_id, p.is_bestseller, p.created_at,
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
    let sellerId = null;
    const userRole = String(req.user?.role || '').toUpperCase();
    if (userRole === 'ADMIN' || userRole === 'MASTER_ADMIN') {
      sellerId = req.headers['x-seller-id'] || req.headers['x-acting-seller-id'] || req.body?.seller_id || req.query?.seller_id;
    } else if (userRole === 'SELLER') {
      const { rows } = await query('SELECT id FROM sellers WHERE user_id = $1 LIMIT 1', [req.user.id]);
      if (rows.length > 0) sellerId = rows[0].id;
      if (!sellerId) sellerId = req.user.id;
    }
    if (!sellerId) {
      return res.status(400).json({ success: false, message: 'Valid seller ID required' });
    }

    // Resolve sellerId to valid user_id if sellers table ID was provided (for FK constraint)
    const { rows: matchedSellers } = await query(
      'SELECT id, user_id FROM sellers WHERE id::text = $1 OR user_id::text = $1 LIMIT 1',
      [String(sellerId)]
    );
    if (matchedSellers.length > 0 && matchedSellers[0].user_id) {
      sellerId = matchedSellers[0].user_id;
    }

    const {
      name,
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

    let schemaJson = '{}';
    if (customization_schema) {
      if (typeof customization_schema === 'object') {
        schemaJson = JSON.stringify(customization_schema);
      } else if (typeof customization_schema === 'string') {
        try {
          JSON.parse(customization_schema);
          schemaJson = customization_schema;
        } catch {
          schemaJson = JSON.stringify({ custom_field: customization_schema });
        }
      }
    }

    const priceVal = Number(base_price);
    const pricePaise = Math.round(priceVal * 100);

    const rawCat = req.body.category_id || req.body.category || req.body.categoryId;
    const categoryId = await resolveCategoryId(rawCat);
    if (!categoryId) {
      return res.status(400).json({ success: false, message: 'Valid category required' });
    }

    const rawSubcategory = req.body.subcategory_id || req.body.subcategory || req.body.subcategoryId;
    let resolvedSubId = null;

    if (rawSubcategory !== undefined && rawSubcategory !== null && String(rawSubcategory).trim() !== '') {
      resolvedSubId = await resolveCategoryId(rawSubcategory);
      if (!resolvedSubId) {
        return res.status(400).json({ success: false, code: 'INVALID_CATEGORY', message: 'Selected subcategory does not exist or is inactive.' });
      }
    }

    if (categoryId && resolvedSubId) {
      const { rows: subRows } = await query('SELECT parent_id FROM categories WHERE id::text = $1', [String(resolvedSubId)]);
      if (subRows.length && subRows[0].parent_id && String(subRows[0].parent_id) !== String(categoryId)) {
        return res.status(400).json({ success: false, code: 'INVALID_CATEGORY', message: 'Selected subcategory does not belong to the selected category.' });
      }
    }

    const finalCategoryId = resolvedSubId || categoryId;

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
        finalIsCustomizable ? 1 : 0,
        schemaJson,
      ]
    );

    const product = rows[0];

    // Handle occasions if provided in body
    const { occasions, occasion_tags } = req.body;
    let occList = [];
    if (Array.isArray(occasions)) occList = occasions;
    else if (Array.isArray(occasion_tags)) occList = occasion_tags;
    else if (typeof occasions === 'string' && occasions.trim()) {
      try {
        const parsed = JSON.parse(occasions);
        if (Array.isArray(parsed)) occList = parsed;
        else occList = [occasions];
      } catch {
        occList = [occasions];
      }
    }

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

    // Handle images cleanly whether they come as pre-uploaded URLs (req.body.images) or uploaded files (req.files)
    let imageList = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const f of req.files) {
        const url = f.path || f.secure_url || f.url;
        if (url) imageList.push(url);
      }
    } else if (req.file) {
      const url = req.file.path || req.file.secure_url || req.file.url;
      if (url) imageList.push(url);
    }

    const rawImagesList = (Array.isArray(images) && images.length > 0) ? images : (
      (Array.isArray(req.body.photos) && req.body.photos.length > 0) ? req.body.photos : (
        (req.body.img_url || req.body.imagePath || req.body.imageUrl || req.body.image_url)
          ? [req.body.img_url || req.body.imagePath || req.body.imageUrl || req.body.image_url]
          : []
      )
    );

    if (Array.isArray(rawImagesList)) {
      for (const img of rawImagesList) {
        if (typeof img === 'string') {
          try {
            const parsed = JSON.parse(img);
            if (Array.isArray(parsed)) imageList.push(...parsed);
            else imageList.push(img);
          } catch {
            imageList.push(img);
          }
        } else if (img && typeof img === 'object') {
          const u = img.url || img.secure_url || img.image_url || img.imagePath;
          if (u) imageList.push(u);
        }
      }
    } else if (typeof rawImagesList === 'string' && rawImagesList.trim()) {
      try {
        const parsed = JSON.parse(rawImagesList);
        if (Array.isArray(parsed)) imageList.push(...parsed);
        else imageList.push(rawImagesList);
      } catch {
        imageList.push(rawImagesList);
      }
    }

    const uniqueRawImagesList = uniqueImageUrls(imageList);
    if (uniqueRawImagesList.length > 0) {
      let sortOrder = 0;
      for (const url of uniqueRawImagesList) {
        if (url) {
          await query(
            `INSERT INTO product_images (product_id, url, sort_order)
             VALUES ($1, $2, $3)`,
            [product.id, url, sortOrder++]
          );
        }
      }
      await query(
        'UPDATE products SET images = $1 WHERE id = $2',
        [uniqueRawImagesList, product.id]
      );
      product.images = uniqueRawImagesList;
      product.product_images = uniqueRawImagesList.map((url, idx) => ({ id: `img_${idx}`, url, sort_order: idx }));
      product.image_url = uniqueRawImagesList[0] || null;
      product.primary_image = uniqueRawImagesList[0] || null;
    }

    // Handle variants if provided in body
    let variants = req.body.variants;
    if (typeof variants === 'string' && variants.trim()) {
      try {
        variants = JSON.parse(variants);
      } catch {}
    }
    if (Array.isArray(variants) && variants.length > 0) {
      for (const v of variants) {
        let vImgs = [];
        if (Array.isArray(v.images) && v.images.length > 0) {
          vImgs = uniqueImageUrls(v.images);
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

    bestsellerService.recomputeForSeller(sellerId).catch(err => {
      console.error('[Bestseller] Error recomputing after createProduct:', err.message);
    });

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
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'master_admin';

    // Retrieve all valid seller identity representations (user_id and sellers.id / seller_profiles.id)
    // seller_id in products is UUID — collect as UUID strings, not Numbers.
    const { rows: sRows } = await query(
      'SELECT id, user_id FROM sellers WHERE user_id = $1 UNION SELECT id, user_id FROM seller_profiles WHERE user_id = $1',
      [req.user.id]
    );
    const validSellerIds = Array.from(new Set([
      req.user.id,
      req.seller?.id,
      req.seller?.user_id,
      ...sRows.flatMap(s => [s.id, s.user_id])
    ].filter(v => v != null && String(v).trim() !== '')));

    const { rows: existing } = await query(
      'SELECT id FROM products WHERE id::text = $1 AND (seller_id = ANY($2::uuid[]) OR $3 = TRUE)',
      [String(id), validSellerIds, isAdmin]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const {
      name,
      photos,
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

    const resolvedName = req.body.name !== undefined ? req.body.name : req.body.title;

    let finalMode = customization_mode;
    if (finalMode === undefined && is_customizable !== undefined) {
      finalMode = (is_customizable === true || is_customizable === 'true' || is_customizable === 1) ? 'fixed' : 'none';
    }
    const finalIsCustomizable = is_customizable !== undefined
      ? Boolean(is_customizable === true || is_customizable === 'true' || is_customizable === 1 || (finalMode && finalMode !== 'none'))
      : (finalMode ? finalMode !== 'none' : null);

    let schemaJson = null;
    if (customization_schema !== undefined) {
      if (typeof customization_schema === 'object' && customization_schema !== null) {
        schemaJson = JSON.stringify(customization_schema);
      } else if (typeof customization_schema === 'string') {
        try {
          JSON.parse(customization_schema);
          schemaJson = customization_schema;
        } catch {
          schemaJson = JSON.stringify({ custom_field: customization_schema });
        }
      } else {
        schemaJson = '{}';
      }
    }

    const rawStock = stock_quantity !== undefined
      ? stock_quantity
      : (req.body.stock_count !== undefined ? req.body.stock_count : (req.body.stock !== undefined ? req.body.stock : req.body.stock_qty));
    const resolvedStock = (rawStock !== undefined && rawStock !== null && String(rawStock).trim() !== '')
      ? Math.max(0, parseInt(rawStock, 10))
      : null;

    const updatedPrice = base_price !== undefined ? Number(base_price) : (req.body.price !== undefined ? Number(req.body.price) : null);
    const updatedPaise = updatedPrice !== null ? Math.round(updatedPrice * 100) : (req.body.price_paise ? Number(req.body.price_paise) : null);
    
    const rawCategory = category_id !== undefined ? category_id : req.body.category;
    const rawSubcategory = subcategory_id;

    let resolvedCatId = null;
    let resolvedSubId = null;

    if (rawCategory !== undefined && rawCategory !== null && String(rawCategory).trim() !== '') {
      resolvedCatId = await resolveCategoryId(rawCategory);
      if (!resolvedCatId) {
        return res.status(400).json({ success: false, code: 'INVALID_CATEGORY', message: 'Selected category does not exist or is inactive.' });
      }
    }

    if (rawSubcategory !== undefined && rawSubcategory !== null && String(rawSubcategory).trim() !== '') {
      resolvedSubId = await resolveCategoryId(rawSubcategory);
      if (!resolvedSubId) {
        return res.status(400).json({ success: false, code: 'INVALID_CATEGORY', message: 'Selected category does not exist or is inactive.' });
      }
    }

    if (resolvedCatId && resolvedSubId) {
      const { rows: subRows } = await query('SELECT parent_id FROM categories WHERE id = $1', [resolvedSubId]);
      if (!subRows.length || String(subRows[0].parent_id) !== String(resolvedCatId)) {
        return res.status(400).json({ success: false, code: 'INVALID_CATEGORY', message: 'Selected subcategory does not belong to the selected category.' });
      }
    }

    const finalUpdatedCatId = (rawCategory !== undefined || rawSubcategory !== undefined)
      ? (resolvedSubId || resolvedCatId)
      : null;

    // Defensive numeric parsing: treat null, '', and NaN as null (no change via COALESCE)
    const parsedLowStock = (low_stock_threshold !== undefined && low_stock_threshold !== null && String(low_stock_threshold).trim() !== '')
      ? Number(low_stock_threshold)
      : null;
    const resolvedLowStock = (parsedLowStock !== null && !isNaN(parsedLowStock)) ? Math.max(0, parsedLowStock) : null;

    const parsedPrepDays = (preparation_days !== undefined && preparation_days !== null && String(preparation_days).trim() !== '')
      ? parseInt(preparation_days, 10)
      : null;
    const resolvedPrepDays = (parsedPrepDays !== null && !isNaN(parsedPrepDays)) ? Math.max(0, parsedPrepDays) : null;

    const parsedWeight = (weight_grams !== undefined && weight_grams !== null && String(weight_grams).trim() !== '')
      ? parseInt(weight_grams, 10)
      : null;
    const resolvedWeight = (parsedWeight !== null && !isNaN(parsedWeight)) ? Math.max(1, parsedWeight) : null;

    const { rows } = await query(
      `UPDATE products
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           category_id = COALESCE($3, category_id),
           base_price = COALESCE($4, base_price),
           price_paise = COALESCE($5, price_paise),
           sale_price = CASE
             WHEN $4 IS NOT NULL AND (discount_active = TRUE OR discount_active IS TRUE) AND discount_percentage IS NOT NULL
               THEN ROUND(($4::numeric * (100 - discount_percentage::numeric) / 100.0), 2)
             ELSE sale_price
           END,
           stock_quantity = COALESCE($6, stock_quantity),
           low_stock_threshold = COALESCE($7, low_stock_threshold),
           preparation_days = COALESCE($8, preparation_days),
           weight_grams = COALESCE($9, weight_grams),
           customization_mode = COALESCE($10, customization_mode),
           is_customizable = COALESCE($11, is_customizable),
           customization_schema = COALESCE($12, customization_schema),
           updated_at = NOW()
       WHERE id = $13
       RETURNING id, name, description, category_id, base_price, sale_price, discount_active, discount_percentage,
                 stock_quantity, low_stock_threshold, preparation_days, weight_grams,
                 customization_mode, is_customizable, customization_schema, status, updated_at`,
      [
        resolvedName || null,
        description || null,
        finalUpdatedCatId || null,
        updatedPrice,
        updatedPaise,
        resolvedStock !== null && !isNaN(resolvedStock) ? resolvedStock : null,
        resolvedLowStock,
        resolvedPrepDays,
        resolvedWeight,
        finalMode || null,
        finalIsCustomizable !== null && finalIsCustomizable !== undefined ? (finalIsCustomizable ? 1 : 0) : null,
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

    // If photos or images array is provided, replace images (supports img_url, imagePath, etc.)
    const photoList = dedupeAlternateFormatImages(Array.isArray(photos) ? photos : (Array.isArray(images) ? images : (
      (req.body.img_url || req.body.imagePath || req.body.imageUrl || req.body.image_url)
        ? [req.body.img_url || req.body.imagePath || req.body.imageUrl || req.body.image_url]
        : null
    )));
    if (Array.isArray(photoList)) {
      await query('DELETE FROM product_images WHERE product_id = $1', [id]);
      // Order by provided sort_order when present (stable, otherwise array order)
      const sortedPhotos = [...photoList].sort((a, b) => {
        const orderA = (a && typeof a === 'object' && typeof a.sort_order === 'number' && !isNaN(a.sort_order))
          ? a.sort_order
          : Infinity;
        const orderB = (b && typeof b === 'object' && typeof b.sort_order === 'number' && !isNaN(b.sort_order))
          ? b.sort_order
          : Infinity;
        return orderA - orderB;
      });

      let sortOrder = 0;
      const seenImageKeys = new Set();
      for (const image of sortedPhotos) {
        const url = uniqueImageUrls([image])[0];
        if (!url || typeof url !== 'string' || url.startsWith('blob:')) continue;
        const imageKey = url.split('?')[0].replace(/\.(jpe?g|png|webp)$/i, '').toLowerCase();
        if (!imageKey || seenImageKeys.has(imageKey)) continue;
        seenImageKeys.add(imageKey);

        const assignedOrder = sortOrder++;
        await query(
          `INSERT INTO product_images (product_id, url, sort_order)
           VALUES ($1, $2, $3)`,
          [id, url, assignedOrder]
        );
      }
    }

    // If variants array is provided, replace variants
    if (Array.isArray(variants)) {
      await query('DELETE FROM product_variants WHERE product_id = $1', [id]);
      for (const v of variants) {
        let vImgs = [];
        if (Array.isArray(v.images) && v.images.length > 0) {
          vImgs = uniqueImageUrls(v.images);
        } else if (v.image_url || v.imagePath) {
          vImgs = [v.image_url || v.imagePath];
        }
        const primaryImg = vImgs[0] || v.image_url || v.imagePath || null;

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
// DELETE /api/products/:id  (seller only, own products or admin)
// ---------------------------------------------------------------------------
async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user?.id;
    const userRole = String(req.user?.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'MASTER_ADMIN';
    const headerSellerId = req.headers['x-seller-id'] || req.headers['x-impersonate-seller-id'] || req.query.seller_id || req.query.sellerId;
    const userSellerId = (isAdmin && headerSellerId) ? headerSellerId : sellerId;

    const { rows: existing } = await query(
      'SELECT id, seller_id FROM products WHERE id::text = $1',
      [String(id)]
    );

    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    if (!isAdmin) {
      const productSellerIdStr = String(existing[0].seller_id);
      const reqUserIdStr = String(sellerId);

      let isOwner = (productSellerIdStr === reqUserIdStr);
      if (!isOwner) {
        const { rows: match } = await query(
          `SELECT 1 FROM sellers WHERE (id::text = $1 AND user_id::text = $2) OR (user_id::text = $1 AND id::text = $2)
           UNION
           SELECT 1 FROM seller_profiles WHERE (id::text = $1 AND user_id::text = $2) OR (user_id::text = $1 AND id::text = $2)`,
          [productSellerIdStr, reqUserIdStr]
        );
        if (match.length > 0) {
          isOwner = true;
        }
      }
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Forbidden: You do not have ownership of this product listing.' });
      }
    }

    const targetSellerId = existing[0].seller_id;
    try {
      await query(
        `UPDATE products SET status = 'deleted', is_active = 0, updated_at = NOW() WHERE id::text = $1`,
        [String(id)]
      );
    } catch (e) {
      await query(
        `UPDATE products SET status = 'deleted', is_active = FALSE, updated_at = NOW() WHERE id::text = $1`,
        [String(id)]
      );
    }

    bestsellerService.recomputeForSeller(targetSellerId).catch(err => {
      console.error('[Bestseller] Error recomputing after deleteProduct:', err.message);
    });

    return res.json({ success: true, message: 'Product deleted successfully.', id });
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
       RETURNING id, seller_id, status, updated_at`,
      [status, id, sellerId, req.user?.role === 'admin' || req.user?.role === 'master_admin']
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    bestsellerService.recomputeForSeller(rows[0].seller_id).catch(err => {
      console.error('[Bestseller] Error recomputing after updateProductStatus:', err.message);
    });

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
    for (const filePath of uniqueImageUrls(req.files.map(file => file.path))) {
      const { rows } = await query(
        `INSERT INTO product_images (product_id, url, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id, url, sort_order`,
        [id, filePath, sortOrder++]
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
          vImgs = uniqueImageUrls(v.images);
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
              p.is_sponsored, p.is_bestseller,
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
  getCategoryBySlug,
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
  deleteProduct,
  resolveCategoryId,
  uploadImages,
  upsertVariants,
  saveFixedOptions,
  recordView,
  getRecommendations,
  getMoreLikeThis: getRecommendations,
};
