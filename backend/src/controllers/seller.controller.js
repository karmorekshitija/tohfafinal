/**
 * Tohfa v2 — Seller Controller
 * File: src/controllers/seller.controller.js
 * Role: HTTP handlers for seller profile, dashboard metrics, analytics,
 *       order lifecycle management, customization proofs, payouts with escrow holding,
 *       store configuration, and logistics fulfillment.
 *       is_tohfa_original is NEVER returned in any response.
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const { query, getClient } = require('../config/db');
const { createNotification } = require('./notification.controller');
const logisticsService = require('../services/logistics.service');

// Strip internal fields (never exposed in public or seller responses)
function sanitizeSellerProfile(sp) {
  if (!sp) return null;
  const { is_tohfa_original, is_admin_managed, ...rest } = sp;
  return rest;
}

// Ensure custom proof and customization columns exist on order_items
let orderItemColsChecked = false;
async function ensureOrderItemColumns() {
  if (orderItemColsChecked) return;
  try {
    await query(`
      ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS proof_image_url TEXT,
      ADD COLUMN IF NOT EXISTS customization_status TEXT,
      ADD COLUMN IF NOT EXISTS customization_data JSONB,
      ADD COLUMN IF NOT EXISTS unit_price NUMERIC;
    `);
    orderItemColsChecked = true;
  } catch (err) {
    // Ignore schema update error if permission or already exists
    orderItemColsChecked = true;
  }
}

// Ensure tax_details column exists on seller_profiles
let taxColsChecked = false;
async function ensureTaxColumns() {
  if (taxColsChecked) return;
  try {
    await query(`
      ALTER TABLE seller_profiles
      ADD COLUMN IF NOT EXISTS tax_details JSONB DEFAULT '{}';
    `);
    taxColsChecked = true;
  } catch (err) {
    taxColsChecked = true;
  }
}

// Ensure seller_payouts table exists
let payoutTablesChecked = false;
async function ensurePayoutTables() {
  if (payoutTablesChecked) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS seller_payouts (
        id           SERIAL PRIMARY KEY,
        seller_id    INTEGER NOT NULL,
        amount       NUMERIC(10,2) NOT NULL,
        status       VARCHAR(50) DEFAULT 'pending',
        utr_number   VARCHAR(100),
        reference    TEXT,
        disbursed_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    payoutTablesChecked = true;
  } catch (err) {
    payoutTablesChecked = true;
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/profile  — own seller profile
// ---------------------------------------------------------------------------
async function getOwnSellerProfile(req, res, next) {
  try {
    const userId = req.user.id;

    const { rows } = await query(
      `SELECT sp.id, sp.user_id,
              COALESCE(sp.store_name, sp.shop_name, sp.display_name, u.name) AS store_name,
              COALESCE(sp.bio, sp.shop_bio) AS bio,
              sp.whatsapp_number,
              COALESCE(sp.profile_photo, sp.avatar_url, u.profile_photo_url) AS profile_photo,
              COALESCE(sp.banner_url, u.cover_photo_url) AS cover_photo,
              COALESCE(sp.profile_photo, sp.avatar_url, u.profile_photo_url) AS logo_url,
              COALESCE(sp.banner_url, u.cover_photo_url) AS banner_url,
              sp.seller_type, sp.is_approved,
              sp.rejection_reason,
              COALESCE(sp.vacation_mode_active, 0) AS vacation_mode,
              sp.pickup_address, sp.bank_details,
              COALESCE(sp.onboarding_completed, FALSE) AS onboarding_completed,
              COALESCE(sp.is_admin_managed, FALSE) AS is_admin_managed,
              sp.created_at,
              u.name, u.email, u.phone
       FROM seller_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.user_id = $1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Seller profile not found.' });
    }

    const profile = sanitizeSellerProfile(rows[0]);
    const photo = profile.profile_photo || '/img/default-avatar.png';
    const banner = profile.banner_url || '/img/default-seller-banner.png';
    profile.profile_photo = photo;
    profile.avatar_url = photo;
    profile.logo_url = profile.logo_url || photo;
    profile.banner_url = banner;
    profile.cover_photo = banner;

    return res.json({
      success: true,
      data: {
        ...profile,
        profile,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/seller/profile  — update seller profile
// ---------------------------------------------------------------------------
async function updateSellerProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { store_name, bio, whatsapp_number } = req.body;

    // Photo from upload middleware
    const profilePhoto = req.file?.path || null;
    const coverPhoto   = req.coverFile?.path || null;

    const { rows } = await query(
      `UPDATE seller_profiles
       SET store_name      = COALESCE($1, store_name),
           bio             = COALESCE($2, bio),
           whatsapp_number = COALESCE($3, whatsapp_number),
           logo_url        = COALESCE($4, logo_url),
           banner_url      = COALESCE($5, banner_url),
           updated_at      = NOW()
       WHERE user_id = $6
       RETURNING id, store_name, bio, whatsapp_number,
                 logo_url AS profile_photo, banner_url AS cover_photo, logo_url, banner_url,
                 seller_type, is_approved, vacation_mode, store_visibility, capacity_limit`,
      [store_name || null, bio || null, whatsapp_number || null, profilePhoto, coverPhoto, userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Seller profile not found.' });
    }

    return res.json({ success: true, data: { profile: sanitizeSellerProfile(rows[0]) } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/public/:userId / /api/sellers/:id  — public seller profile (buyer view)
// ---------------------------------------------------------------------------
async function getPublicSellerProfile(req, res, next) {
  try {
    const rawId = req.params.userId || req.params.sellerId || req.params.id;
    if (!rawId) {
      return res.status(400).json({ success: false, message: 'Seller ID or slug is required.' });
    }

    const { rows } = await query(
      `SELECT u.id AS user_id, u.name, u.email, u.phone, u.profile_photo_url, u.cover_photo_url,
              sp.id AS profile_id,
              COALESCE(sp.store_name, s.store_name, u.name, 'Artisan Studio') AS store_name,
              COALESCE(sp.slug, s.slug) AS slug,
              COALESCE(sp.bio, s.bio) AS bio,
              sp.banner_url, sp.about_image_url,
              sp.whatsapp_number, sp.pickup_address, sp.created_at,
              (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status = 'active') AS product_count,
              (SELECT COALESCE(AVG(r.rating), 5.0) FROM reviews r WHERE r.seller_id = u.id) AS avg_rating,
              (SELECT COUNT(*) FROM reviews r WHERE r.seller_id = u.id) AS review_count
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE u.id::text = $1::text
          OR sp.id::text = $1::text
          OR s.id::text = $1::text
          OR sp.slug = $1
          OR s.slug = $1
       LIMIT 1`,
      [String(rawId)]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Seller not found.' });
    }

    const row = rows[0];
    const storeName = row.store_name || row.name || 'Artisan Studio';
    const slug = row.slug || (storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    const avatarUrl = row.profile_photo_url || row.profile_photo || '/img/default-avatar.png';
    const isLegacyDefaultBanner = (url) => !url || url.includes('default-banner.png') || url.includes('artisan_showcase.jpg');
    const coverPhotoUrl = (!isLegacyDefaultBanner(row.cover_photo_url))
      ? row.cover_photo_url
      : (!isLegacyDefaultBanner(row.cover_photo))
        ? row.cover_photo
        : (!isLegacyDefaultBanner(row.banner_url))
          ? row.banner_url
          : '/img/default-seller-banner.png';
    
    let locationStr = 'Indian Artisan Studio';
    if (row.pickup_address && typeof row.pickup_address === 'object') {
      const parts = [row.pickup_address.city, row.pickup_address.state].filter(Boolean);
      if (parts.length > 0) locationStr = parts.join(', ');
    }

    const normalized = {
      id: row.user_id,
      user_id: row.user_id,
      store_name: storeName,
      shop_name: storeName,
      name: row.name || storeName,
      handle: slug,
      slug: slug,
      location: locationStr,
      bio: row.bio || 'Curating beautiful handcrafted creations with intention.',
      artisan_story: row.bio || '',
      about_headline: `Our Story: ${storeName}`,
      about_image_url: row.about_image_url || '/img/categories/artisan_showcase.jpg',
      avg_rating: parseFloat(row.avg_rating || 5.0),
      review_count: parseInt(row.review_count || 0, 10),
      product_count: parseInt(row.product_count || 0, 10),
      avatar_url: avatarUrl,
      profile_photo_url: avatarUrl,
      profile_photo: avatarUrl,
      cover_photo_url: coverPhotoUrl,
      cover_photo: coverPhotoUrl,
      banner_url: coverPhotoUrl,
      whatsapp_number: row.whatsapp_number || row.phone || null,
      created_at: row.created_at,
      workspace_photos: [
        { photo_url: '/img/ceramic_bowls.jpg', caption: 'Centering clay' },
        { photo_url: '/img/linen_journal.jpg', caption: 'Artisan craft materials' },
        { photo_url: '/img/categories/artisan_showcase.jpg', caption: 'Artisan studio space' }
      ]
    };

    return res.json({
      success: true,
      data: {
        ...normalized,
        profile: normalized
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT/PATCH /api/seller/store-config  — vacation_mode, visibility, shipping, capacity
// ---------------------------------------------------------------------------
async function updateStoreConfig(req, res, next) {
  try {
    const userId = req.user.id;
    const { vacation_mode, vacation_mode_active, store_visibility, shipping_presets, capacity_limit, pickup_address, vacation_message, vacation_note } = req.body;
    const finalVacationMode = vacation_mode !== undefined ? Boolean(vacation_mode) : (vacation_mode_active !== undefined ? Boolean(vacation_mode_active) : undefined);

    const { rows } = await query(
      `UPDATE seller_profiles
       SET vacation_mode    = COALESCE($1, vacation_mode),
           store_visibility = COALESCE($2, store_visibility),
           shipping_presets = COALESCE($3, shipping_presets),
           capacity_limit   = COALESCE($4, capacity_limit),
           pickup_address   = COALESCE($5, pickup_address),
           vacation_message = COALESCE($6, vacation_message),
           is_active        = CASE WHEN $1 = TRUE THEN FALSE WHEN $1 = FALSE THEN TRUE ELSE is_active END,
           updated_at       = NOW()
       WHERE user_id = $7
       RETURNING id, vacation_mode, store_visibility, shipping_presets, capacity_limit, pickup_address, vacation_message`,
      [
        finalVacationMode !== undefined ? finalVacationMode : null,
        store_visibility !== undefined ? store_visibility : (finalVacationMode === true ? false : null),
        shipping_presets ? JSON.stringify(shipping_presets) : null,
        capacity_limit !== undefined ? capacity_limit : null,
        pickup_address ? (typeof pickup_address === 'string' ? pickup_address : JSON.stringify(pickup_address)) : null,
        vacation_message || vacation_note || null,
        userId,
      ]
    );

    if (finalVacationMode !== undefined) {
      await query(
        `UPDATE sellers
         SET is_active = $1, vacation_mode = $2, updated_at = NOW()
         WHERE user_id = $3 OR id = $3`,
        [!finalVacationMode, finalVacationMode, userId]
      ).catch(() => {});
    }

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Seller profile not found.' });
    }

    return res.json({ success: true, data: { config: rows[0] } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/seller/status  — toggle vacation mode / active status
// ---------------------------------------------------------------------------
async function toggleVacationMode(req, res, next) {
  try {
    const userId = req.user.id;
    const { vacation_mode, is_active, store_visibility, vacation_message } = req.body;

    const { rows: currentProfile } = await query(
      'SELECT vacation_mode, store_visibility FROM seller_profiles WHERE user_id = $1',
      [userId]
    );

    if (!currentProfile.length) {
      return res.status(404).json({ success: false, message: 'Seller profile not found.' });
    }

    let newVacationMode = currentProfile[0].vacation_mode;
    if (vacation_mode !== undefined) {
      newVacationMode = Boolean(vacation_mode);
    } else if (is_active !== undefined) {
      newVacationMode = !Boolean(is_active);
    }

    let newVisibility = currentProfile[0].store_visibility;
    if (store_visibility !== undefined) {
      newVisibility = Boolean(store_visibility);
    } else if (newVacationMode) {
      newVisibility = false;
    } else {
      newVisibility = true;
    }

    const { rows } = await query(
      `UPDATE seller_profiles
       SET vacation_mode = $1,
           store_visibility = $2,
           is_active = $3,
           vacation_message = COALESCE($4, vacation_message),
           updated_at = NOW()
       WHERE user_id = $5
       RETURNING id, vacation_mode, store_visibility, capacity_limit, is_active, vacation_message`,
      [newVacationMode, newVisibility, !newVacationMode, vacation_message || null, userId]
    );

    await query(
      `UPDATE sellers
       SET is_active = $1, vacation_mode = $2, updated_at = NOW()
       WHERE user_id = $3 OR id = $3`,
      [!newVacationMode, newVacationMode, userId]
    ).catch(() => {});

    return res.json({
      success: true,
      message: newVacationMode ? 'Store placed on vacation mode.' : 'Store is now active and accepting orders.',
      data: {
        config: rows[0],
        vacation_mode: rows[0].vacation_mode,
        store_visibility: rows[0].store_visibility,
        is_active: rows[0].is_active,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/seller/apply  — create sellers + seller_profiles rows (onboarding)
// ---------------------------------------------------------------------------
async function applyAsSeller(req, res, next) {
  const client = await getClient();
  try {
    const userId = req.user.id;

    // Allow buyers (and existing sellers re-submitting application)
    if (!['buyer', 'seller', 'user'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Invalid user role for seller application.' });
    }

    const {
      store_name, storeName, shop_name,
      bio, craft_specialty, craftSpecialty,
      whatsapp_number, phone,
      pickup_address, address_line1, street, address_line2, city, state, pincode, postal_code,
      daily_capacity_min, daily_capacity_max, capacity_min, capacity_max,
      instagram_handle, instagram, instagram_followers,
      bank_details, account_holder_name, account_holder, account_number, ifsc_code, ifsc, bank_name,
      pan_number, pan, gst_number, gst,
      portfolio_images, portfolio_url
    } = req.body;

    const { rows: userRows } = await client.query('SELECT name, full_name, email FROM users WHERE id = $1', [userId]);
    const userName = userRows[0]?.full_name || userRows[0]?.name || 'Artisan';
    const finalStoreName = (store_name || storeName || shop_name || `${userName}'s Studio`).trim();
    const specialty = craft_specialty || craftSpecialty || '';
    const finalBio = bio || (specialty ? `Artisan specializing in ${specialty}` : 'Artisan specializing in handcrafted gifts');
    const finalPhone = whatsapp_number || phone || null;

    const capMin = parseInt(daily_capacity_min || capacity_min || 0, 10) || null;
    const capMax = parseInt(daily_capacity_max || capacity_max || 0, 10) || null;
    const instaHandle = (instagram_handle || instagram || '').trim().replace(/^@/, '') || null;
    const instaFollowers = instagram_followers || null;

    const baseSlug = finalStoreName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'artisan';
    const storeSlug = `${baseSlug}-${Date.now()}`;

    const parsedPickup = (typeof pickup_address === 'object' && pickup_address !== null && Object.keys(pickup_address).length > 0)
      ? pickup_address
      : (address_line1 || city ? {
          address_line1: address_line1 || street || '',
          address_line2: address_line2 || '',
          city: city || '',
          state: state || '',
          pincode: pincode || postal_code || ''
        } : {});

    const parsedBank = (typeof bank_details === 'object' && bank_details !== null && Object.keys(bank_details).length > 0)
      ? bank_details
      : (account_number ? {
          account_holder: account_holder_name || account_holder || userName,
          account_number: account_number || '',
          ifsc_code: (ifsc_code || ifsc || '').toUpperCase(),
          bank_name: bank_name || ''
        } : {});

    const parsedPan = pan_number || pan || null;
    const parsedGst = gst_number || gst || null;
    const parsedPortfolio = Array.isArray(portfolio_images)
      ? portfolio_images
      : (portfolio_url ? [portfolio_url] : []);

    await client.query('BEGIN');

    // 1. Promote user role to 'seller'
    await client.query(
      `UPDATE users SET role = 'seller', updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    // 2. Initialize / upsert master sellers row
    const { rows: sellerRows } = await client.query(
      `INSERT INTO sellers (user_id, store_name, slug, bio, verification_status, is_active, is_approved, pickup_address, bank_details, onboarding_completed)
       VALUES ($1, $2, $3, $4, 'pending_verification', true, false, $5, $6, false)
       ON CONFLICT (user_id) DO UPDATE SET
         store_name = EXCLUDED.store_name,
         slug = EXCLUDED.slug,
         bio = EXCLUDED.bio,
         pickup_address = EXCLUDED.pickup_address,
         verification_status = 'pending_verification',
         is_approved = false
       RETURNING *`,
      [userId, finalStoreName, storeSlug, finalBio, JSON.stringify(parsedPickup), JSON.stringify(parsedBank)]
    );

    await client.query(
      `UPDATE sellers SET
         pan_number = $2,
         gst_number = $3,
         portfolio_images = $4::text[],
         daily_capacity_min = $5,
         daily_capacity_max = $6,
         instagram_handle = $7,
         instagram_followers = $8,
         applied_at = NOW(),
         onboarding_completed = FALSE
       WHERE user_id = $1`,
      [userId, parsedPan, parsedGst, parsedPortfolio, capMin, capMax, instaHandle, instaFollowers]
    ).catch(() => {});

    // 3. Initialize / upsert seller_profiles row for unified shape
    const { rows: profileRows } = await client.query(
      `INSERT INTO seller_profiles (user_id, store_name, slug, bio, seller_type, verification_status, is_approved, is_active, pickup_address, bank_details, pan_number, gst_number, portfolio_images, applied_at, onboarding_completed)
       VALUES ($1, $2, $3, $4, 'regular', 'pending_verification', false, true, $5, $6, $7, $8, $9::text[], NOW(), false)
       ON CONFLICT (user_id) DO UPDATE SET
         store_name = EXCLUDED.store_name,
         slug = EXCLUDED.slug,
         bio = EXCLUDED.bio,
         pickup_address = EXCLUDED.pickup_address,
         bank_details = EXCLUDED.bank_details,
         pan_number = EXCLUDED.pan_number,
         gst_number = EXCLUDED.gst_number,
         portfolio_images = EXCLUDED.portfolio_images,
         verification_status = 'pending_verification',
         is_approved = false
       RETURNING *`,
      [userId, finalStoreName, storeSlug, finalBio, JSON.stringify(parsedPickup), JSON.stringify(parsedBank), parsedPan, parsedGst, parsedPortfolio]
    );

    await client.query(
      `UPDATE seller_profiles SET
         daily_capacity_min = $2,
         daily_capacity_max = $3,
         instagram_handle = $4,
         instagram_followers = $5,
         whatsapp_number = COALESCE($6, whatsapp_number),
         onboarding_completed = FALSE
       WHERE user_id = $1`,
      [userId, capMin, capMax, instaHandle, instaFollowers, finalPhone]
    ).catch(() => {});

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Seller application submitted successfully and is pending review.',
      data: { profile: profileRows[0], seller: sellerRows[0] }
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/application-status
// ---------------------------------------------------------------------------
async function getApplicationStatus(req, res, next) {
  try {
    const userId = req.user.id;

    let { rows } = await query(
      `SELECT is_approved, verification_status, rejection_reason, seller_type, created_at, is_active,
              COALESCE(onboarding_completed, FALSE) AS onboarding_completed,
              COALESCE(is_admin_managed, FALSE) AS is_admin_managed
       FROM seller_profiles WHERE user_id = $1`,
      [userId]
    );

    if (!rows.length) {
      const sellerRes = await query(
        `SELECT is_approved, verification_status, rejection_reason, created_at, is_active,
                COALESCE(onboarding_completed, FALSE) AS onboarding_completed,
                COALESCE(is_admin_managed, FALSE) AS is_admin_managed
         FROM sellers WHERE user_id = $1`,
        [userId]
      );
      rows = sellerRes.rows;
    }

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'No seller application found.' });
    }

    return res.json({ success: true, data: { application: rows[0] } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GET /api/seller/dashboard-metrics (aliases: /dashboard-stats, /dashboard)
// ---------------------------------------------------------------------------
async function getDashboardMetrics(req, res, next) {
  try {
    await ensureOrderItemColumns();
    const sellerId = req.user.id;
    const period = (req.query.period || req.query.range || '7d').toLowerCase();

    let days = 7;
    if (period === '30d') days = 30;
    else if (period === '90d') days = 90;

    // 0. Seller profile info
    const { rows: profileRows } = await query(
      `SELECT sp.store_name, COALESCE(sp.store_name, u.name) AS display_name, u.name, u.email
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1`,
      [sellerId]
    );
    const sellerInfo = profileRows[0] || {};
    const displayName = sellerInfo.display_name || sellerInfo.store_name || sellerInfo.name || 'Artisan Studio';

    // 1. All-time Core KPIs
    const { rows: allTimeStats } = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_status, '')) = 'paid' AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN COALESCE(NULLIF(total_paise, 0) / 100.0, CASE WHEN total_amount >= 10000 THEN total_amount / 100.0 ELSE total_amount END, 0) ELSE 0 END), 0) AS all_revenue,
         COUNT(CASE WHEN LOWER(COALESCE(payment_status, '')) = 'paid' AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN 1 END) AS all_orders,
         COUNT(CASE WHEN LOWER(COALESCE(status, '')) IN ('pending', 'confirmed', 'crafting', 'packed', 'processing') THEN 1 END) AS pending_orders
       FROM orders
       WHERE (seller_id = $1::integer OR seller_id::text = $1::text)`,
      [sellerId]
    ).catch(() => ({ rows: [{ all_revenue: 0, all_orders: 0, pending_orders: 0 }] }));

    // Current period stats
    const { rows: currPeriodStats } = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_status, '')) = 'paid' AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN COALESCE(NULLIF(total_paise, 0) / 100.0, CASE WHEN total_amount >= 10000 THEN total_amount / 100.0 ELSE total_amount END, 0) ELSE 0 END), 0) AS curr_revenue,
         COUNT(CASE WHEN LOWER(COALESCE(payment_status, '')) = 'paid' AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN 1 END) AS curr_orders
       FROM orders
       WHERE (seller_id = $1::integer OR seller_id::text = $1::text)
         AND created_at >= NOW() - ($2 || ' days')::interval`,
      [sellerId, days]
    ).catch(() => ({ rows: [{ curr_revenue: 0, curr_orders: 0 }] }));

    // Previous period stats (for % delta comparison)
    const { rows: prevPeriodStats } = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_status, '')) = 'paid' AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN COALESCE(NULLIF(total_paise, 0) / 100.0, CASE WHEN total_amount >= 10000 THEN total_amount / 100.0 ELSE total_amount END, 0) ELSE 0 END), 0) AS prev_revenue,
         COUNT(CASE WHEN LOWER(COALESCE(payment_status, '')) = 'paid' AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN 1 END) AS prev_orders
       FROM orders
       WHERE (seller_id = $1::integer OR seller_id::text = $1::text)
         AND created_at >= NOW() - ($2 || ' days')::interval * 2
         AND created_at < NOW() - ($2 || ' days')::interval`,
      [sellerId, days]
    ).catch(() => ({ rows: [{ prev_revenue: 0, prev_orders: 0 }] }));

    const { rows: prodRows } = await query(
      `SELECT COUNT(*) AS active_products, COALESCE(SUM(view_count), 0) AS total_views
       FROM products WHERE (seller_id = $1::integer OR seller_id::text = $1::text) AND status != 'deleted'`,
      [sellerId]
    ).catch(() => ({ rows: [{ active_products: 0, total_views: 0 }] }));

    const { rows: reviewRows } = await query(
      `SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 5.0) AS average_rating, COUNT(*) AS review_count
       FROM reviews WHERE (seller_id = $1::integer OR seller_id::text = $1::text)`,
      [sellerId]
    ).catch(() => ({ rows: [{ average_rating: 5.0, review_count: 0 }] }));

    const currRevenue = parseFloat(currPeriodStats[0]?.curr_revenue || 0);
    const currOrders = parseInt(currPeriodStats[0]?.curr_orders || 0, 10);
    const prevRevenue = parseFloat(prevPeriodStats[0]?.prev_revenue || 0);
    const prevOrders = parseInt(prevPeriodStats[0]?.prev_orders || 0, 10);

    const allRevenue = parseFloat(allTimeStats[0]?.all_revenue || 0);
    const allOrders = parseInt(allTimeStats[0]?.all_orders || 0, 10);
    const pendingOrders = parseInt(allTimeStats[0]?.pending_orders || 0, 10);
    const activeProducts = parseInt(prodRows[0]?.active_products || 0, 10);
    const totalViews = parseInt(prodRows[0]?.total_views || 0, 10);
    const averageRating = parseFloat(reviewRows[0]?.average_rating || 5.0);
    const reviewCount = parseInt(reviewRows[0]?.review_count || 0, 10);

    // Revenue % change calculation
    let orderValueChangePct = 0;
    if (prevRevenue > 0) {
      orderValueChangePct = Math.round(((currRevenue - prevRevenue) / prevRevenue) * 100);
    } else if (currRevenue > 0) {
      orderValueChangePct = 100;
    }

    // Conversion rate: (currOrders / GREATEST(totalViews, currOrders, 1)) * 100
    let conversionRate = 0;
    const viewBase = Math.max(totalViews, currOrders, 1);
    if (currOrders > 0) {
      conversionRate = parseFloat(((currOrders / viewBase) * 100).toFixed(1));
    }

    // 2. Low Stock Alerts
    const { rows: lowStockRows } = await query(
      `SELECT id, name, name AS title, stock_quantity, stock_quantity AS stock_count,
              COALESCE(low_stock_threshold, 5) AS threshold
       FROM products
       WHERE (seller_id = $1::integer OR seller_id::text = $1::text) AND status != 'deleted' AND stock_quantity <= COALESCE(low_stock_threshold, 5)
       ORDER BY stock_quantity ASC
       LIMIT 5`,
      [sellerId]
    ).catch(() => ({ rows: [] }));

    // 3. Recent orders (latest 5)
    const { rows: recentOrderRows } = await query(
      `SELECT o.id, o.total_amount, o.total_amount AS subtotal, o.status, o.created_at, o.payment_status, o.payout_status,
              COALESCE(u.name, 'Valued Buyer') AS buyer_name,
              u.email AS buyer_email,
              COALESCE(a.city, 'India') AS shipping_city,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'product_name', COALESCE(oi.product_name, p.name),
                  'name', COALESCE(oi.product_name, p.name),
                  'quantity', oi.quantity,
                  'unit_price', COALESCE(oi.unit_price, (oi.unit_price_paise::numeric / 100.0), 0),
                  'customization_data', oi.customization_data,
                  'proof_image_url', oi.proof_image_url,
                  'customization_status', oi.customization_status,
                  'image_url', (SELECT url FROM product_images pi WHERE pi.product_id = oi.product_id ORDER BY sort_order ASC LIMIT 1)
                ))
                FROM order_items oi
                LEFT JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id),
                '[]'
              ) AS items
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_id
       LEFT JOIN addresses a ON a.id = o.address_id
       WHERE o.seller_id = $1
       ORDER BY o.created_at DESC
       LIMIT 5`,
      [sellerId]
    );

    const formattedRecentOrders = recentOrderRows.map(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      const firstItem = items[0] || {};
      return {
        id: o.id,
        order_ref: `TOHFA-${String(o.id).substring(0, 8).toUpperCase()}`,
        buyer_name: o.buyer_name,
        buyer_email: o.buyer_email,
        shipping_city: o.shipping_city || 'India',
        item_title: firstItem.product_name || firstItem.name || 'Handcrafted Item',
        item_image: firstItem.image_url || null,
        subtotal: parseFloat(o.subtotal || o.total_amount || 0),
        total_amount: parseFloat(o.total_amount || 0),
        total_paise: Math.round(parseFloat(o.total_amount || 0) * 100),
        amount_paise: Math.round(parseFloat(o.total_amount || 0) * 100),
        status: o.status,
        payment_status: o.payment_status,
        payout_status: o.payout_status,
        created_at: o.created_at,
        items,
      };
    });

    // 4. Sales & Visits Chart for requested period
    const { rows: dailyData } = await query(
      `SELECT DATE(created_at) AS date,
              COALESCE(SUM(CASE WHEN payment_status = 'paid' AND status != 'cancelled' THEN total_amount ELSE 0 END), 0) AS revenue,
              COUNT(CASE WHEN status != 'cancelled' THEN 1 END) AS orders_count
       FROM orders
       WHERE seller_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [sellerId, days]
    );

    // Build complete daily date sequence
    const chartLabels = [];
    const chartRevenue = [];
    const chartVisits = [];
    const dayMap = {};

    dailyData.forEach(r => {
      const dStr = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
      dayMap[dStr] = {
        revenue: parseFloat(r.revenue || 0),
        orders: parseInt(r.orders_count || 0, 10),
      };
    });

    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const displayLabel = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      chartLabels.push(displayLabel);
      
      const found = dayMap[iso] || { revenue: 0, orders: 0 };
      chartRevenue.push(found.revenue);
      // Visits proxy from active orders and views
      const estVisits = found.orders > 0 ? found.orders * 8 : (totalViews > 0 ? Math.ceil(totalViews / days) : 0);
      chartVisits.push(estVisits);
    }

    const metrics = {
      total_revenue: currRevenue,
      total_revenue_all_time: allRevenue,
      total_orders: currOrders,
      total_orders_all_time: allOrders,
      order_value_paise: Math.round(currRevenue * 100),
      order_value_change_pct: orderValueChangePct,
      new_orders_since_last_period: currOrders,
      conversion_rate: conversionRate,
      average_rating: averageRating,
      active_products: activeProducts,
      pending_orders: pendingOrders,
      review_count: reviewCount,
    };

    return res.json({
      success: true,
      data: {
        period,
        seller: {
          display_name: displayName,
          store_name: sellerInfo.store_name || displayName,
          name: sellerInfo.name || displayName
        },
        date_label: new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        metrics,
        kpis: metrics,
        low_stock_alerts: lowStockRows,
        recentOrders: formattedRecentOrders,
        recent_orders: formattedRecentOrders,
        salesChart: {
          labels: chartLabels,
          data: chartRevenue,
          revenue: chartRevenue,
          visits: chartVisits,
        },
        // Backwards compatibility mirrors
        total_revenue: currRevenue,
        total_orders: currOrders,
        average_rating: averageRating,
        active_products: activeProducts,
        pending_orders: pendingOrders,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/analytics (aliases: /analytics/full)
// ---------------------------------------------------------------------------
async function getSellerAnalytics(req, res, next) {
  try {
    const sellerId = req.user.id;
    const selectedRange = (req.query.range || req.query.period || '30d').toLowerCase();
    const start = req.query.start || req.query.startDate || '';
    const end = req.query.end || req.query.endDate || '';

    let dateCondition = `o.created_at >= NOW() - INTERVAL '30 days'`;
    let queryParams = [sellerId];
    let daysCount = 30;

    if (selectedRange === 'today') {
      dateCondition = `o.created_at >= CURRENT_DATE`;
      daysCount = 1;
    } else if (selectedRange === '7d') {
      dateCondition = `o.created_at >= NOW() - INTERVAL '7 days'`;
      daysCount = 7;
    } else if (selectedRange === '90d') {
      dateCondition = `o.created_at >= NOW() - INTERVAL '90 days'`;
      daysCount = 90;
    } else if (selectedRange === 'custom' && start && end) {
      dateCondition = `DATE(o.created_at) BETWEEN $2 AND $3`;
      queryParams.push(start, end);
      const diffMs = new Date(end).getTime() - new Date(start).getTime();
      daysCount = Math.max(1, Math.round(diffMs / 86400000) + 1);
    }

    // 1. Revenue & Order totals in this window (excluding cancelled & refunded)
    const { rows: totalsRows } = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN COALESCE(NULLIF(o.total_paise, 0) / 100.0, CASE WHEN o.total_amount >= 10000 THEN o.total_amount / 100.0 ELSE o.total_amount END, 0) ELSE 0 END), 0) AS total_revenue,
         COUNT(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN 1 END) AS total_orders,
         COUNT(CASE WHEN LOWER(COALESCE(o.status, '')) IN ('cancelled', 'refunded', 'cancel_requested') OR LOWER(COALESCE(o.payment_status, '')) = 'refunded' THEN 1 END) AS returns_cancellations
       FROM orders o
       WHERE (o.seller_id = $1::integer OR o.seller_id::text = $1::text) AND ${dateCondition}`,
      queryParams
    ).catch(() => ({ rows: [{ total_revenue: 0, total_orders: 0, returns_cancellations: 0 }] }));

    // 2. Product Views for real conversion rate
    const { rows: prodViews } = await query(
      `SELECT COALESCE(SUM(view_count), 0) AS total_views, COUNT(*) AS active_products
       FROM products
       WHERE (seller_id = $1::integer OR seller_id::text = $1::text) AND status != 'deleted'`,
      [sellerId]
    ).catch(() => ({ rows: [{ total_views: 0, active_products: 0 }] }));

    const totalRevenue = parseFloat(parseFloat(totalsRows[0]?.total_revenue || 0).toFixed(2));
    const totalOrders = parseInt(totalsRows[0]?.total_orders || 0, 10);
    const returnsCancellations = parseInt(totalsRows[0]?.returns_cancellations || 0, 10);
    const avgOrderVal = totalOrders > 0 ? parseFloat((totalRevenue / totalOrders).toFixed(2)) : 0;
    const totalViews = parseInt(prodViews[0]?.total_views || 0, 10);
    const storeVisitors = Math.max(totalViews, totalOrders);
    const conversionRate = totalOrders > 0 ? parseFloat(((totalOrders / Math.max(totalViews, totalOrders, 1)) * 100).toFixed(1)) : 0.0;

    // 3. Orders per day & daily revenue series
    const { rows: dailyRows } = await query(
      `SELECT
         TO_CHAR(o.created_at, 'YYYY-MM-DD') AS date_str,
         COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN COALESCE(NULLIF(o.total_paise, 0) / 100.0, CASE WHEN o.total_amount >= 10000 THEN o.total_amount / 100.0 ELSE o.total_amount END, 0) ELSE 0 END), 0) AS daily_revenue,
         COUNT(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN 1 END) AS daily_orders
       FROM orders o
       WHERE (o.seller_id = $1::integer OR o.seller_id::text = $1::text) AND ${dateCondition}
       GROUP BY TO_CHAR(o.created_at, 'YYYY-MM-DD')
       ORDER BY date_str ASC`,
      queryParams
    ).catch(() => ({ rows: [] }));

    const dailyMap = {};
    (dailyRows || []).forEach(r => {
      dailyMap[r.date_str] = {
        revenue: parseFloat(r.daily_revenue || 0),
        orders: parseInt(r.daily_orders || 0, 10),
      };
    });

    const chartLabels = [];
    const chartRevenue = [];
    const chartOrders = [];
    const chartConversion = [];
    const now = new Date();

    if (selectedRange === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      chartLabels.push(todayStr);
      const entry = dailyMap[todayStr] || { revenue: 0, orders: 0 };
      chartRevenue.push(entry.revenue);
      chartOrders.push(entry.orders);
      chartConversion.push(entry.orders > 0 ? conversionRate : 0);
    } else {
      const numDays = Math.min(daysCount, 90);
      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        chartLabels.push(dateStr);
        const entry = dailyMap[dateStr] || { revenue: 0, orders: 0 };
        chartRevenue.push(entry.revenue);
        chartOrders.push(entry.orders);
        const dailyConv = entry.orders > 0 ? parseFloat(((entry.orders / Math.max(Math.round(totalViews / numDays), entry.orders, 1)) * 100).toFixed(1)) : 0;
        chartConversion.push(dailyConv);
      }
    }

    // 4. Product performance & top products
    const { rows: topProducts } = await query(
      `SELECT 
         p.id, p.name, p.base_price, p.view_count, p.stock_quantity,
         COUNT(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN oi.id END) AS units_sold,
         COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN COALESCE(oi.unit_price * oi.quantity, 0) ELSE 0 END), 0) AS total_revenue
       FROM products p
       LEFT JOIN order_items oi ON oi.product_id = p.id
       LEFT JOIN orders o ON o.id = oi.order_id AND ${dateCondition}
       WHERE (p.seller_id = $1::integer OR p.seller_id::text = $1::text) AND p.status != 'deleted'
       GROUP BY p.id, p.name, p.base_price, p.view_count, p.stock_quantity
       ORDER BY total_revenue DESC, units_sold DESC
       LIMIT 10`,
      queryParams
    ).catch(() => ({ rows: [] }));

    const productPerformance = (topProducts || []).map(p => ({
      id: p.id,
      name: p.name,
      base_price: parseFloat(p.base_price || 0),
      sales_count: parseInt(p.units_sold || 0, 10),
      units_sold: parseInt(p.units_sold || 0, 10),
      total_revenue: parseFloat(p.total_revenue || 0),
      revenue: parseFloat(p.total_revenue || 0),
      view_count: parseInt(p.view_count || 0, 10),
      stock: p.stock_quantity != null ? parseInt(p.stock_quantity, 10) : '—',
      stock_quantity: p.stock_quantity != null ? parseInt(p.stock_quantity, 10) : '—',
      rating: 4.8,
    }));

    // 5. Custom vs Pre-made comparison
    const { rows: orderTypesRows } = await query(
      `SELECT 
         COUNT(CASE WHEN (LOWER(COALESCE(o.order_type, '')) IN ('custom', 'customized') OR o.customization IS NOT NULL OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (oi.customization_data IS NOT NULL AND oi.customization_data::text NOT IN ('', 'null', '{}')))) THEN 1 END) AS custom_count,
         COALESCE(SUM(CASE WHEN (LOWER(COALESCE(o.order_type, '')) IN ('custom', 'customized') OR o.customization IS NOT NULL OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (oi.customization_data IS NOT NULL AND oi.customization_data::text NOT IN ('', 'null', '{}')))) THEN COALESCE(NULLIF(o.total_paise, 0) / 100.0, CASE WHEN o.total_amount >= 10000 THEN o.total_amount / 100.0 ELSE o.total_amount END, 0) ELSE 0 END), 0) AS custom_revenue,
         COUNT(CASE WHEN (LOWER(COALESCE(o.order_type, '')) NOT IN ('custom', 'customized') AND o.customization IS NULL AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (oi.customization_data IS NOT NULL AND oi.customization_data::text NOT IN ('', 'null', '{}')))) THEN 1 END) AS premade_count,
         COALESCE(SUM(CASE WHEN (LOWER(COALESCE(o.order_type, '')) NOT IN ('custom', 'customized') AND o.customization IS NULL AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (oi.customization_data IS NOT NULL AND oi.customization_data::text NOT IN ('', 'null', '{}')))) THEN COALESCE(NULLIF(o.total_paise, 0) / 100.0, CASE WHEN o.total_amount >= 10000 THEN o.total_amount / 100.0 ELSE o.total_amount END, 0) ELSE 0 END), 0) AS premade_revenue
       FROM orders o
       WHERE (o.seller_id = $1::integer OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested')
         AND ${dateCondition}`,
      queryParams
    ).catch(() => ({ rows: [{ custom_count: 0, custom_revenue: 0, premade_count: 0, premade_revenue: 0 }] }));

    // 6. Customer Insights (Repeat vs New Buyers & Top Cities)
    const { rows: buyerStatsRows } = await query(
      `WITH seller_buyers AS (
         SELECT o.buyer_id, COUNT(o.id) AS order_count
         FROM orders o
         WHERE (o.seller_id = $1::integer OR o.seller_id::text = $1::text)
           AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
           AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested')
         GROUP BY o.buyer_id
       )
       SELECT 
         COUNT(CASE WHEN order_count > 1 THEN 1 END) AS repeat_buyers,
         COUNT(CASE WHEN order_count = 1 THEN 1 END) AS new_buyers
       FROM seller_buyers`,
      [sellerId]
    ).catch(() => ({ rows: [{ repeat_buyers: 0, new_buyers: 0 }] }));

    const { rows: locationRows } = await query(
      `SELECT 
         COALESCE(NULLIF(TRIM(o.shipping_address->>'city'), ''), NULLIF(TRIM(a.city), ''), 'Jaipur') AS city,
         COUNT(o.id) AS order_count,
         COALESCE(SUM(COALESCE(NULLIF(o.total_paise, 0) / 100.0, CASE WHEN o.total_amount >= 10000 THEN o.total_amount / 100.0 ELSE o.total_amount END, 0)), 0) AS revenue
       FROM orders o
       LEFT JOIN addresses a ON a.id = o.address_id
       WHERE (o.seller_id = $1::integer OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested')
       GROUP BY city
       ORDER BY order_count DESC, revenue DESC
       LIMIT 5`,
      [sellerId]
    ).catch(() => ({ rows: [] }));

    return res.json({
      success: true,
      data: {
        period: selectedRange,
        range: selectedRange,
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        avg_order_value: avgOrderVal,
        kpis: {
          total_revenue: totalRevenue,
          total_orders: totalOrders,
          avg_order_value: avgOrderVal,
          store_visitors: storeVisitors,
          conversion_rate: conversionRate,
          returns_cancellations: returnsCancellations,
        },
        charts: {
          labels: chartLabels,
          revenue: chartRevenue,
          orders: chartOrders,
          conversion: chartConversion,
        },
        revenue_chart: {
          labels: chartLabels,
          data: chartRevenue,
        },
        orders_chart: {
          labels: chartLabels,
          data: chartOrders,
        },
        conversion_chart: {
          labels: chartLabels,
          data: chartConversion,
        },
        sales_data: dailyRows,
        product_performance: productPerformance,
        top_products: productPerformance,
        order_types: {
          custom: {
            orders_count: parseInt(orderTypesRows[0]?.custom_count || 0, 10),
            revenue: parseFloat(orderTypesRows[0]?.custom_revenue || 0),
          },
          premade: {
            orders_count: parseInt(orderTypesRows[0]?.premade_count || 0, 10),
            revenue: parseFloat(orderTypesRows[0]?.premade_revenue || 0),
          },
        },
        customer_insights: {
          repeat_buyers: parseInt(buyerStatsRows[0]?.repeat_buyers || 0, 10),
          new_buyers: parseInt(buyerStatsRows[0]?.new_buyers || 0, 10),
          top_locations: (locationRows || []).map(l => ({
            city: l.city,
            order_count: parseInt(l.order_count || 0, 10),
            revenue: parseFloat(l.revenue || 0),
          })),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/orders  — list orders scoped strictly to logged-in seller
// ---------------------------------------------------------------------------
async function getSellerOrders(req, res, next) {
  try {
    await ensureOrderItemColumns();
    const sellerId = req.user.id;
    const { page = '1', limit = '20', status, search } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    const conditions = ['o.seller_id = $1'];
    const params = [sellerId];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const sIdx = params.length;
      conditions.push(`(
        LOWER(u.name) LIKE $${sIdx} OR
        LOWER(u.email) LIKE $${sIdx} OR
        CAST(o.id AS TEXT) LIKE $${sIdx} OR
        LOWER(COALESCE(o.tracking_id, '')) LIKE $${sIdx}
      )`);
    }

    const where = conditions.join(' AND ');
    params.push(limitNum);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT o.id, o.buyer_id, o.seller_id, o.listing_id, o.product_name, o.total_amount, o.total_paise,
              o.order_ref, o.order_type, o.customization, o.customization_summary,
              o.status, o.payment_status, o.payout_status,
              o.tracking_id, o.tracking_url, o.delivered_at, o.created_at, o.updated_at,
              u.name AS buyer_name, u.email AS buyer_email, u.phone AS buyer_phone,
              a.line1 AS delivery_line1, a.line2 AS delivery_line2, a.city AS delivery_city,
              a.state AS delivery_state, a.pincode AS delivery_pincode,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'product_name', COALESCE(oi.product_name, p.name),
                  'name', COALESCE(oi.product_name, p.name),
                  'quantity', oi.quantity,
                  'unit_price', COALESCE(oi.unit_price, (oi.unit_price_paise::numeric / 100.0), 0),
                  'customization_data', oi.customization_data,
                  'proof_image_url', oi.proof_image_url,
                  'customization_status', oi.customization_status,
                  'image_url', (SELECT url FROM product_images pi WHERE pi.product_id = oi.product_id ORDER BY sort_order ASC LIMIT 1)
                ))
                FROM order_items oi
                LEFT JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id),
                '[]'
              ) AS items
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_id
       LEFT JOIN addresses a ON a.id = o.address_id
       WHERE ${where}
       ORDER BY o.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_id
       WHERE ${where}`,
      params.slice(0, params.length - 2)
    );

    const formattedOrders = rows.map(o => {
      let items = Array.isArray(o.items) && o.items.length > 0 ? o.items : [];
      if (items.length === 0 && (o.product_name || o.listing_id || o.customization_summary || o.customization)) {
        let parsedCustom = null;
        if (o.customization_summary) {
          try { parsedCustom = typeof o.customization_summary === 'string' ? JSON.parse(o.customization_summary) : o.customization_summary; } catch { parsedCustom = { summary_text: o.customization_summary }; }
        } else if (o.customization) {
          try { parsedCustom = typeof o.customization === 'string' ? JSON.parse(o.customization) : o.customization; } catch { parsedCustom = { summary_text: o.customization }; }
        }
        items = [{
          id: o.id,
          product_id: o.listing_id,
          product_name: o.product_name || 'Handcrafted Creation',
          name: o.product_name || 'Handcrafted Creation',
          quantity: 1,
          unit_price: o.total_amount ? (o.total_amount >= 10000 ? o.total_amount / 100.0 : parseFloat(o.total_amount)) : (o.total_paise ? o.total_paise / 100.0 : 0),
          customization_data: parsedCustom,
          customization_status: 'pending',
          image_url: null
        }];
      }

      const firstItem = items[0];
      let itemPreview = firstItem ? (firstItem.product_name || firstItem.name || o.product_name || 'Handcrafted Creation') : (o.product_name || 'Handcrafted Creation');
      if (items.length > 1) {
        itemPreview += ` + ${items.length - 1} more`;
      }
      const rawTotal = o.total_amount ? (o.total_amount >= 10000 ? o.total_amount / 100.0 : parseFloat(o.total_amount)) : (o.total_paise ? o.total_paise / 100.0 : 0);

      return {
        ...o,
        order_ref: o.order_ref || `TOHFA-${String(o.id).substring(0, 8).toUpperCase()}`,
        subtotal: rawTotal,
        total_amount: rawTotal,
        total_paise: Math.round(rawTotal * 100),
        item_preview: itemPreview,
        items,
      };
    });

    return res.json({
      success: true,
      data: {
        orders: formattedOrders,
        total: parseInt(countRows[0]?.total || 0, 10),
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/orders/:id  — full seller order details
// ---------------------------------------------------------------------------
async function getSellerOrderDetail(req, res, next) {
  try {
    await ensureOrderItemColumns();
    const { id } = req.params;
    const sellerId = req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'master_admin';

    const { rows } = await query(
      `SELECT o.id, o.buyer_id, o.seller_id, o.address_id, o.total_amount, o.status, o.payment_status,
              o.payout_status, o.tracking_id, o.tracking_url, o.notes, o.delivered_at, o.created_at, o.updated_at,
              u.name AS buyer_name, u.email AS buyer_email, u.phone AS buyer_phone,
              sp.store_name, sp.whatsapp_number AS seller_whatsapp, sp.pickup_address,
              a.name AS recipient_name, a.phone AS recipient_phone,
              a.line1 AS delivery_line1, a.line2 AS delivery_line2, a.city AS delivery_city,
              a.state AS delivery_state, a.pincode AS delivery_pincode,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'product_name', COALESCE(oi.product_name, p.name),
                  'name', COALESCE(oi.product_name, p.name),
                  'quantity', oi.quantity,
                  'unit_price', COALESCE(oi.unit_price, (oi.unit_price_paise::numeric / 100.0), 0),
                  'customization_data', oi.customization_data,
                  'proof_image_url', oi.proof_image_url,
                  'customization_status', oi.customization_status,
                  'image_url', (SELECT url FROM product_images pi WHERE pi.product_id = oi.product_id ORDER BY sort_order ASC LIMIT 1)
                ))
                FROM order_items oi
                LEFT JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id),
                '[]'
              ) AS items
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_id
       LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
       LEFT JOIN addresses a ON a.id = o.address_id
       WHERE o.id = $1 AND (o.seller_id = $2 OR $3 = true)`,
      [id, sellerId, isAdmin]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found or access denied.' });
    }

    const order = rows[0];
    let items = Array.isArray(order.items) && order.items.length > 0 ? order.items : [];
    if (items.length === 0 && (order.product_name || order.listing_id || order.customization_summary || order.customization)) {
      let parsedCustom = null;
      if (order.customization_summary) {
        try { parsedCustom = typeof order.customization_summary === 'string' ? JSON.parse(order.customization_summary) : order.customization_summary; } catch { parsedCustom = { summary_text: order.customization_summary }; }
      } else if (order.customization) {
        try { parsedCustom = typeof order.customization === 'string' ? JSON.parse(order.customization) : order.customization; } catch { parsedCustom = { summary_text: order.customization }; }
      }
      items = [{
        id: order.id,
        product_id: order.listing_id,
        product_name: order.product_name || 'Handcrafted Creation',
        name: order.product_name || 'Handcrafted Creation',
        quantity: 1,
        unit_price: order.total_amount ? (order.total_amount >= 10000 ? order.total_amount / 100.0 : parseFloat(order.total_amount)) : (order.total_paise ? order.total_paise / 100.0 : 0),
        customization_data: parsedCustom,
        customization_status: 'pending',
        image_url: null
      }];
    }
    const firstItem = items[0];

    const orderRef = `TOHFA-${String(order.id).substring(0, 8).toUpperCase()}`;
    const addressParts = [
      order.delivery_line1,
      order.delivery_line2,
      order.delivery_city,
      order.delivery_state,
      order.delivery_pincode ? `PIN: ${order.delivery_pincode}` : ''
    ].filter(Boolean);
    const buyerAddressStr = addressParts.length > 0 ? addressParts.join(', ') : 'No shipping address provided.';

    // Tracking events synthesis
    const tracking_events = [];
    if (order.created_at) {
      tracking_events.push({ status: 'awaiting_payment', occurred_at: order.created_at });
    }
    if (['confirmed', 'processing', 'in_production', 'crafting', 'packed', 'shipped', 'dispatched', 'delivered'].includes(order.status)) {
      tracking_events.push({ status: 'processing', occurred_at: order.created_at });
    }
    if (['in_production', 'crafting', 'packed', 'shipped', 'dispatched', 'delivered'].includes(order.status)) {
      tracking_events.push({ status: 'in_production', occurred_at: order.updated_at || order.created_at });
    }
    if (['packed', 'shipped', 'dispatched', 'delivered'].includes(order.status)) {
      tracking_events.push({ status: 'packed', occurred_at: order.updated_at || order.created_at });
    }
    if (['shipped', 'dispatched', 'delivered'].includes(order.status)) {
      tracking_events.push({ status: 'dispatched', occurred_at: order.updated_at || order.created_at });
    }
    if (order.status === 'delivered') {
      tracking_events.push({ status: 'delivered', occurred_at: order.delivered_at || order.updated_at || order.created_at });
    }

    // Customization details extraction
    let customizationDetails = null;
    const firstItemCustom = items.find(it => it.customization_data && (typeof it.customization_data === 'string' ? it.customization_data.trim().length > 0 : Object.keys(it.customization_data).length > 0));
    if (firstItemCustom && firstItemCustom.customization_data) {
      const cd = firstItemCustom.customization_data;
      if (typeof cd === 'string') {
        customizationDetails = cd;
      } else if (typeof cd === 'object') {
        customizationDetails = Object.entries(cd)
          .filter(([_, v]) => v != null && v !== '')
          .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
          .join(', ');
      }
    } else if (order.notes) {
      customizationDetails = order.notes;
    }

    // Studio notes extraction
    let studio_notes = [];
    if (order.notes) {
      try {
        const parsed = JSON.parse(order.notes);
        if (Array.isArray(parsed)) studio_notes = parsed;
        else if (typeof parsed === 'object') studio_notes = [parsed];
        else studio_notes = [{ text: String(order.notes), ts: order.updated_at || order.created_at }];
      } catch {
        studio_notes = [{ text: String(order.notes), ts: order.updated_at || order.created_at }];
      }
    }

    const deadlineAt = new Date(new Date(order.created_at || Date.now()).getTime() + 2 * 86400000).toISOString();
    const estimatedDelivery = new Date(new Date(order.created_at || Date.now()).getTime() + 5 * 86400000).toISOString();

    const formattedOrder = {
      ...order,
      id: order.id,
      internal_id: order.id,
      order_id: orderRef,
      order_ref: orderRef,
      order_date: order.created_at,
      fulfillment_status: order.status,
      buyer_name: order.buyer_name || order.recipient_name || 'Artisan Patron',
      buyer_phone: order.buyer_phone || order.recipient_phone || '',
      buyer_address: buyerAddressStr,
      subtotal: parseFloat(order.total_amount || 0),
      total_paise: Math.round(parseFloat(order.total_amount || 0) * 100),
      deadline_at: deadlineAt,
      estimated_delivery: estimatedDelivery,
      tracking_number: order.tracking_id,
      tracking_id: order.tracking_id,
      tracking_url: order.tracking_url,
      tracking_events,
      studio_notes,
      items,
      item_title: firstItem ? (firstItem.product_name || firstItem.name || 'Handcrafted Creation') : 'Handcrafted Creation',
      item_photo_url: firstItem ? firstItem.image_url : null,
      item_image: firstItem ? firstItem.image_url : null,
      product_id_display: firstItem && firstItem.product_id ? String(firstItem.product_id).substring(0, 8).toUpperCase() : null,
      quantity: firstItem ? firstItem.quantity : 1,
      customization_details: customizationDetails,
      proof_image_url: firstItem ? firstItem.proof_image_url : null,
      customization_status: firstItem ? firstItem.customization_status : null,
      shipping_address: {
        recipient_name: order.recipient_name || order.buyer_name,
        phone: order.recipient_phone || order.buyer_phone,
        line1: order.delivery_line1,
        line2: order.delivery_line2,
        city: order.delivery_city,
        state: order.delivery_state,
        pincode: order.delivery_pincode,
        formatted: buyerAddressStr,
      },
    };

    return res.json({
      success: true,
      data: {
        ...formattedOrder,
        order: formattedOrder,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/seller/orders/:id/status  — update order lifecycle state
// ---------------------------------------------------------------------------
async function updateSellerOrderStatus(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = req.user.role;
    const { status } = req.body;

    const allowed = ['pending', 'confirmed', 'crafting', 'packed', 'shipped', 'delivered', 'cancelled', 'cancel_requested'];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${allowed.join(', ')}.`,
      });
    }

    const VALID_TRANSITIONS = {
      pending: ['confirmed', 'crafting', 'cancelled'],
      confirmed: ['crafting', 'packed', 'shipped', 'cancelled', 'cancel_requested'],
      crafting: ['packed', 'shipped', 'cancelled'],
      packed: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: [], // Terminal state
      cancelled: [], // Terminal state
      cancel_requested: ['cancelled', 'confirmed'],
    };

    // Fetch existing order
    const { rows: existingRows } = await query(
      `SELECT * FROM orders WHERE id = $1 AND (seller_id = $2 OR $3 = 'admin' OR $3 = 'master_admin')`,
      [id, sellerId, role]
    );

    if (!existingRows.length) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
    }

    const currentOrder = existingRows[0];

    // Validate state transition if not admin
    if (role !== 'admin' && role !== 'master_admin') {
      const allowedNext = VALID_TRANSITIONS[currentOrder.status] || [];
      if (!allowedNext.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot transition order status from "${currentOrder.status}" to "${status}". Valid transitions are: ${allowedNext.join(', ') || 'none (terminal state)'}.`,
        });
      }
    }

    let updateQuery = `UPDATE orders
                       SET status = $1,
                           delivered_at = CASE WHEN $1 = 'delivered' THEN NOW()::text ELSE delivered_at END,
                           updated_at = NOW()`;
    let queryParams = [status];

    if (req.body.studio_note) {
      let existingNotes = [];
      try {
        const p = JSON.parse(currentOrder.notes);
        if (Array.isArray(p)) existingNotes = p;
        else if (currentOrder.notes) existingNotes = [{ text: currentOrder.notes, ts: currentOrder.created_at }];
      } catch {
        if (currentOrder.notes) existingNotes = [{ text: currentOrder.notes, ts: currentOrder.created_at }];
      }
      existingNotes.push({ text: req.body.studio_note, ts: new Date().toISOString() });
      queryParams.push(JSON.stringify(existingNotes));
      updateQuery += `, notes = $${queryParams.length}`;
    }

    if (req.body.tracking_id || req.body.tracking_number) {
      const trk = req.body.tracking_id || req.body.tracking_number;
      queryParams.push(trk);
      updateQuery += `, tracking_id = $${queryParams.length}`;
    }

    queryParams.push(id);
    updateQuery += ` WHERE id = $${queryParams.length} RETURNING *`;

    const { rows } = await query(updateQuery, queryParams);

    const order = rows[0];

    // If cancelled, restock product inventory
    if (status === 'cancelled') {
      const { rows: itemRows } = await query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
        [id]
      );
      for (const item of itemRows) {
        await query(
          'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }
    }

    // Notify buyer
    const statusMessages = {
      confirmed: 'Your handcrafted gift order has been confirmed by the artisan.',
      crafting: 'The artisan has begun handcrafting your bespoke creation!',
      packed: 'Your order is packed and ready for courier pickup.',
      shipped: 'Your order is on the way! 🚚',
      delivered: 'Your handcrafted creation has been delivered. Enjoy!',
      cancelled: 'Your order has been cancelled.',
    };

    if (order.buyer_id) {
      await createNotification(
        order.buyer_id,
        'order_status',
        `Order ${status.replace('_', ' ').toUpperCase()}`,
        statusMessages[status] || `Your order status is now ${status}.`,
        { order_id: id, status }
      ).catch(e => console.warn('[Order Status] Notification trigger failed:', e.message));
    }

    return res.json({
      success: true,
      message: `Order status updated to ${status}.`,
      data: {
        ...order,
        order,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// POST /api/seller/orders/custom-proof  — upload artisan proof of work (CHK-29)
// ---------------------------------------------------------------------------
async function uploadCustomProof(req, res, next) {
  try {
    await ensureOrderItemColumns();
    const sellerId = req.user.id;
    const orderId = req.body.orderId || req.body.sellerOrderId || req.body.order_id || req.params.id;
    const proofUrl = req.body.proofImageUrl || req.body.proof_image_url || req.body.proofUrl || req.body.url;
    const orderItemId = req.body.order_item_id || req.body.orderItemId;
    const notes = req.body.notes || '';

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId or sellerOrderId is required.' });
    }
    if (!proofUrl) {
      return res.status(400).json({ success: false, message: 'proofImageUrl is required.' });
    }

    // Verify order or sub-order belongs to seller
    const { rows: orderRows } = await query(
      `SELECT o.id AS parent_order_id, o.buyer_id, COALESCE(so.seller_id, o.seller_id) AS seller_id,
              o.status AS parent_status, so.id AS sub_order_id
       FROM orders o
       LEFT JOIN seller_orders so ON so.order_id = o.id AND so.seller_id = $2
       WHERE (o.id = $1 OR so.id = $1)
         AND (o.seller_id = $2 OR so.seller_id = $2)
       LIMIT 1`,
      [orderId, sellerId]
    );

    if (!orderRows.length) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
    }

    const order = orderRows[0];
    const parentId = order.parent_order_id;
    const subId = order.sub_order_id || orderId;

    // Update order items with proof_image_url and customization_status = 'proof_uploaded'
    let updatedItemRows;
    if (orderItemId) {
      const { rows } = await query(
        `UPDATE order_items
         SET proof_image_url = $1, customization_status = 'proof_uploaded',
             customization_data = COALESCE(customization_data, '{}'::jsonb) || jsonb_build_object('proof_image_url', $1::text, 'customization_status', 'proof_uploaded', 'proof_notes', $2::text, 'proof_uploaded_at', NOW())
         WHERE id = $3 AND (order_id = $4 OR seller_order_id = $5)
         RETURNING *`,
        [proofUrl, notes, orderItemId, parentId, subId]
      );
      updatedItemRows = rows;
    } else {
      const { rows } = await query(
        `UPDATE order_items
         SET proof_image_url = $1, customization_status = 'proof_uploaded',
             customization_data = COALESCE(customization_data, '{}'::jsonb) || jsonb_build_object('proof_image_url', $1::text, 'customization_status', 'proof_uploaded', 'proof_notes', $2::text, 'proof_uploaded_at', NOW())
         WHERE order_id = $3 OR seller_order_id = $4
         RETURNING *`,
        [proofUrl, notes, parentId, subId]
      );
      updatedItemRows = rows;
    }

    await query(
      `UPDATE orders SET updated_at = NOW() WHERE id = $1`,
      [parentId]
    ).catch(() => {});

    // Notify buyer
    if (order.buyer_id) {
      await createNotification(
        order.buyer_id,
        'custom_proof_uploaded',
        'Design Proof Ready for Review 🎨',
        'The artisan has uploaded a design proof for your customized gift. Please review and approve.',
        {
          order_id: parentId,
          seller_order_id: subId,
          proof_image_url: proofUrl,
          link_url: `/buyer/order-detail.html?id=${parentId}`,
        }
      ).catch(e => console.warn('[Custom Proof] Notification trigger failed:', e.message));
    }

    return res.json({
      success: true,
      message: 'Design proof uploaded successfully and buyer notified.',
      data: {
        order_id: parentId,
        seller_order_id: subId,
        proof_image_url: proofUrl,
        items: updatedItemRows,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/payouts  — payouts & 7-day escrow balance breakdown (CHK-40)
// ---------------------------------------------------------------------------
async function getPayoutOverview(req, res, next) {
  try {
    const sellerId = req.user.id;
    await ensurePayoutTables();

    // Available / Eligible balance: orders delivered > 7 days ago and not yet disbursed
    const { rows: availableRows } = await query(
      `SELECT
         COALESCE(SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0), 0) AS available_balance,
         COUNT(o.id) AS eligible_count
       FROM orders o
       WHERE (o.seller_id = $1::integer OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.status, '')) = 'delivered'
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         AND o.created_at <= NOW() - INTERVAL '7 days'`,
      [sellerId]
    ).catch(() => ({ rows: [{ available_balance: 0, eligible_count: 0 }] }));

    // Holding / Unsettled balance: orders in progress or delivered within the 7-day escrow window
    const { rows: holdingRows } = await query(
      `SELECT
         COALESCE(SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0), 0) AS holding_balance,
         COUNT(o.id) AS holding_count
       FROM orders o
       WHERE (o.seller_id = $1::integer OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         AND (
           LOWER(COALESCE(o.status, '')) IN ('pending', 'confirmed', 'processing', 'crafting', 'packed', 'shipped', 'in_production')
           OR (LOWER(COALESCE(o.status, '')) = 'delivered' AND o.created_at > NOW() - INTERVAL '7 days')
         )`,
      [sellerId]
    ).catch(() => ({ rows: [{ holding_balance: 0, holding_count: 0 }] }));

    // Completed payouts
    const { rows: completedRows } = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid_out
       FROM seller_payouts
       WHERE (seller_id = $1::integer OR seller_id::text = $1::text)
         AND LOWER(status) IN ('paid', 'completed')`,
      [sellerId]
    ).catch(async () => {
      return await query(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid_out
         FROM payouts
         WHERE (seller_id = $1::integer OR seller_id::text = $1::text)
           AND LOWER(status) IN ('paid', 'completed')`,
        [sellerId]
      ).catch(() => ({ rows: [{ total_paid_out: 0 }] }));
    });

    // Payout records history
    const { rows: payoutList } = await query(
      `SELECT id, amount, status, utr_number, reference, disbursed_at, created_at
       FROM seller_payouts
       WHERE (seller_id = $1::integer OR seller_id::text = $1::text)
       ORDER BY created_at DESC`,
      [sellerId]
    ).catch(async () => {
      return await query(
        `SELECT id, amount, status, reference_id AS reference, initiated_at, completed_at, initiated_at AS created_at
         FROM payouts
         WHERE (seller_id = $1::integer OR seller_id::text = $1::text)
         ORDER BY id DESC`,
        [sellerId]
      ).catch(() => ({ rows: [] }));
    });

    // Total, month, week calculations
    const { rows: periodRows } = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN o.created_at >= DATE_TRUNC('month', NOW()) THEN COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0 ELSE 0 END), 0) AS month_earned,
         COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '7 days' THEN COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0 ELSE 0 END), 0) AS week_earned,
         COALESCE(SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0), 0) AS total_earned
       FROM orders o
       WHERE (o.seller_id = $1::integer OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'`,
      [sellerId]
    ).catch(() => ({ rows: [{ month_earned: 0, week_earned: 0, total_earned: 0 }] }));

    const availableBalance = parseFloat(availableRows[0]?.available_balance || 0);
    const holdingBalance = parseFloat(holdingRows[0]?.holding_balance || 0);
    const totalPaidOut = parseFloat(completedRows[0]?.total_paid_out || 0);
    const totalEarned = parseFloat(periodRows[0]?.total_earned || 0);
    const monthEarned = parseFloat(periodRows[0]?.month_earned || 0);
    const weekEarned = parseFloat(periodRows[0]?.week_earned || 0);

    const availableBalancePaise = Math.round(availableBalance * 100);
    const holdingBalancePaise = Math.round(holdingBalance * 100);
    const totalPaidOutPaise = Math.round(totalPaidOut * 100);
    const totalEarnedPaise = Math.round(totalEarned * 100);
    const monthEarnedPaise = Math.round(monthEarned * 100);
    const weekEarnedPaise = Math.round(weekEarned * 100);

    return res.json({
      success: true,
      data: {
        availableBalance,
        pendingBalance: holdingBalance,
        eligible_balance: availableBalancePaise,
        holding_balance: holdingBalancePaise,
        total_paid_out: totalPaidOutPaise,
        total_earned: totalEarnedPaise,
        this_month_earned: monthEarnedPaise,
        this_week_earned: weekEarnedPaise,
        on_hold_amount: holdingBalancePaise,
        available_balance_inr: availableBalance,
        holding_balance_inr: holdingBalance,
        total_paid_out_inr: totalPaidOut,
        total_earned_inr: totalEarned,
        this_month_earned_inr: monthEarned,
        this_week_earned_inr: weekEarned,
        eligible_orders_count: parseInt(availableRows[0]?.eligible_count || 0, 10),
        holding_orders_count: parseInt(holdingRows[0]?.holding_count || 0, 10),
        escrow_holding_days: 7,
        history: payoutList,
        payouts: payoutList,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/earnings & GET /api/seller/earnings
// ---------------------------------------------------------------------------
async function getSellerEarnings(req, res, next) {
  return getPayoutOverview(req, res, next);
}

// ---------------------------------------------------------------------------
// GET /api/payments/earnings/graph & GET /api/seller/earnings/graph
// ---------------------------------------------------------------------------
async function getSellerEarningsGraph(req, res, next) {
  try {
    const sellerId = req.user.id;
    const range = req.query.range || '7d';
    let days = 7;
    if (range === '30d') days = 30;
    if (range === '3m' || range === '90d') days = 90;

    const { rows } = await query(
      `SELECT 
         TO_CHAR(o.created_at, 'YYYY-MM-DD') AS date_str,
         SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0) AS total_day_amount
       FROM orders o
       WHERE (o.seller_id = $1::integer OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         AND o.created_at >= NOW() - ($2 || ' days')::INTERVAL
       GROUP BY TO_CHAR(o.created_at, 'YYYY-MM-DD')
       ORDER BY date_str ASC`,
      [sellerId, days]
    ).catch(() => ({ rows: [] }));

    const map = {};
    (rows || []).forEach(r => {
      map[r.date_str] = parseFloat(r.total_day_amount || 0);
    });

    const result = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        amount: map[dateStr] || 0,
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/receiving-details & GET /api/seller/receiving-details
// ---------------------------------------------------------------------------
async function getReceivingDetails(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { rows } = await query(
      `SELECT bank_details FROM seller_profiles WHERE (user_id = $1::integer OR user_id::text = $1::text)`,
      [sellerId]
    ).catch(() => ({ rows: [] }));
    const bd = rows[0]?.bank_details || {};
    return res.json({
      success: true,
      data: {
        bank: bd.bank || (bd.account_number ? {
          account_holder_name: bd.account_holder_name || '',
          bank_name: bd.bank_name || '',
          account_number: bd.account_number || '',
          ifsc_code: bd.ifsc_code || '',
        } : null),
        upi: bd.upi || (bd.upi_id ? {
          account_holder_name: bd.account_holder_name || '',
          upi_id: bd.upi_id || '',
        } : null),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/receiving-details & POST /api/seller/receiving-details
// ---------------------------------------------------------------------------
async function saveReceivingDetails(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { type, account_holder_name, bank_name, account_number, ifsc_code, upi_id } = req.body;

    const { rows } = await query(
      `SELECT bank_details FROM seller_profiles WHERE (user_id = $1::integer OR user_id::text = $1::text)`,
      [sellerId]
    ).catch(() => ({ rows: [] }));
    let currentBd = rows[0]?.bank_details || {};
    if (typeof currentBd !== 'object' || Array.isArray(currentBd)) currentBd = {};

    if (type === 'BANK') {
      if (!account_holder_name || !bank_name || !account_number || !ifsc_code) {
        return res.status(400).json({ success: false, message: 'All bank account fields are required.' });
      }
      currentBd.bank = {
        account_holder_name: String(account_holder_name).trim(),
        bank_name: String(bank_name).trim(),
        account_number: String(account_number).trim(),
        ifsc_code: String(ifsc_code).toUpperCase().trim(),
      };
    } else if (type === 'UPI') {
      if (!account_holder_name || !upi_id) {
        return res.status(400).json({ success: false, message: 'UPI holder name and UPI ID are required.' });
      }
      currentBd.upi = {
        account_holder_name: String(account_holder_name).trim(),
        upi_id: String(upi_id).trim(),
      };
    }

    await query(
      `UPDATE seller_profiles SET bank_details = $1, updated_at = NOW() WHERE (user_id = $2::integer OR user_id::text = $2::text)`,
      [JSON.stringify(currentBd), sellerId]
    );
    await query(
      `UPDATE sellers SET bank_details = $1 WHERE (user_id = $2::integer OR user_id::text = $2::text)`,
      [JSON.stringify(currentBd), sellerId]
    ).catch(() => {});

    return res.json({
      success: true,
      message: 'Settlement receiving details updated successfully.',
      data: currentBd,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/history/all & GET /api/seller/payouts/history
// ---------------------------------------------------------------------------
async function getPaymentHistory(req, res, next) {
  try {
    const sellerId = req.user.id;
    const limit = parseInt(req.query.limit || '20', 10);
    await ensurePayoutTables();

    const { rows: payoutRows } = await query(
      `SELECT id, amount, status, reference, utr_number,
              COALESCE(disbursed_at, created_at) AS date,
              COALESCE(reference, 'Payout Settlement') AS buyer_name
       FROM seller_payouts
       WHERE (seller_id = $1::integer OR seller_id::text = $1::text)
       ORDER BY created_at DESC
       LIMIT $2`,
      [sellerId, limit]
    ).catch(() => ({ rows: [] }));

    const { rows: orderRows } = await query(
      `SELECT o.id, ROUND(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0, 2) AS amount,
              'settled' AS status,
              COALESCE(o.order_ref, 'TOHFA-' || o.id::text) AS reference,
              COALESCE(u.name, 'Artisan Patron') AS buyer_name,
              o.created_at AS date
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_id
       WHERE (o.seller_id = $1::integer OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [sellerId, limit]
    ).catch(() => ({ rows: [] }));

    const items = [...payoutRows, ...orderRows]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);

    return res.json({
      success: true,
      data: {
        items,
        total: items.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/tax & GET /api/seller/tax
// ---------------------------------------------------------------------------
async function getTaxSettings(req, res, next) {
  try {
    const sellerId = req.user.id;
    await ensureTaxColumns();
    const { rows } = await query(
      `SELECT tax_details FROM seller_profiles WHERE (user_id = $1::integer OR user_id::text = $1::text)`,
      [sellerId]
    ).catch(() => ({ rows: [] }));
    const tax = rows[0]?.tax_details || {};
    return res.json({
      success: true,
      data: {
        is_gst_registered: !!tax.is_gst_registered,
        gstin: tax.gstin || '',
        pan_number: tax.pan_number || '',
        tds_applicable: !!tax.tds_applicable,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/tax & POST /api/seller/tax
// ---------------------------------------------------------------------------
async function saveTaxSettings(req, res, next) {
  try {
    const sellerId = req.user.id;
    await ensureTaxColumns();
    const { is_gst_registered, gstin, pan_number, tds_applicable } = req.body;
    const taxPayload = {
      is_gst_registered: !!is_gst_registered,
      gstin: is_gst_registered ? String(gstin || '').toUpperCase().trim() : '',
      pan_number: String(pan_number || '').toUpperCase().trim(),
      tds_applicable: !!tds_applicable,
      updated_at: new Date().toISOString(),
    };
    await query(
      `UPDATE seller_profiles SET tax_details = $1, updated_at = NOW() WHERE (user_id = $2::integer OR user_id::text = $2::text)`,
      [JSON.stringify(taxPayload), sellerId]
    );
    return res.json({
      success: true,
      message: 'Tax settings updated successfully.',
      data: taxPayload,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/invoices/all & GET /api/seller/invoices
// ---------------------------------------------------------------------------
async function getSellerInvoices(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { rows } = await query(
      `SELECT 
         TO_CHAR(o.created_at, 'YYYY-MM') AS month_key,
         TO_CHAR(o.created_at, 'Month YYYY') AS month_name,
         COUNT(o.id) AS total_orders,
         SUM(COALESCE(o.total_paise, o.total_amount * 100, 0) / 100.0) AS gross_sales,
         ROUND(SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0), 2) AS net_payout
       FROM orders o
       WHERE (o.seller_id = $1::integer OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
       GROUP BY TO_CHAR(o.created_at, 'YYYY-MM'), TO_CHAR(o.created_at, 'Month YYYY')
       ORDER BY month_key DESC`,
      [sellerId]
    ).catch(() => ({ rows: [] }));

    const invoices = (rows || []).map(r => ({
      id: `INV-${(r.month_key || '').replace('-', '')}`,
      month_name: (r.month_name || '').trim(),
      month_key: r.month_key,
      total_orders: parseInt(r.total_orders, 10),
      gross_sales: parseFloat(r.gross_sales || 0),
      amount: parseFloat(r.net_payout || 0),
      status: 'GENERATED',
    }));

    return res.json({
      success: true,
      data: invoices,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/disputes/all & GET /api/seller/disputes
// ---------------------------------------------------------------------------
async function getSellerDisputes(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { rows } = await query(
      `SELECT 
         rr.id,
         CASE 
           WHEN LOWER(rr.status) = 'pending' THEN 'OPEN'
           WHEN LOWER(rr.status) = 'approved' THEN 'ACCEPTED'
           ELSE 'RESOLVED'
         END AS status,
         rr.amount,
         rr.reason,
         COALESCE(o.order_ref, 'TOHFA-' || rr.order_id::text) AS order_ref,
         COALESCE(u.name, 'Artisan Patron') AS buyer_name,
         rr.created_at
       FROM refund_requests rr
       LEFT JOIN orders o ON o.id = rr.order_id
       LEFT JOIN users u ON u.id = rr.buyer_id
       WHERE (rr.seller_id = $1::integer OR rr.seller_id::text = $1::text)
       ORDER BY rr.created_at DESC`,
      [sellerId]
    ).catch(() => ({ rows: [] }));

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/seller/payouts/request  — request payout withdrawal
// ---------------------------------------------------------------------------
async function requestPayout(req, res, next) {
  try {
    const sellerId = req.user.id;
    await ensurePayoutTables();

    // Verify eligible balance
    const { rows: availableRows } = await query(
      `SELECT
         COALESCE(SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0), 0) AS available_balance
       FROM orders o
       WHERE (o.seller_id = $1::integer OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.status, '')) = 'delivered'
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         AND o.created_at <= NOW() - INTERVAL '7 days'`,
      [sellerId]
    ).catch(() => ({ rows: [{ available_balance: 0 }] }));

    const availableBalance = parseFloat(availableRows[0]?.available_balance || 0);

    let requestedAmount = parseFloat(req.body.amount || req.body.requestedAmount);
    if (isNaN(requestedAmount) || requestedAmount <= 0) {
      requestedAmount = availableBalance;
    }

    if (availableBalance <= 0 || requestedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'You have no eligible payout balance available for withdrawal at this time. Delivered orders become eligible after a 7-day escrow holding period.',
      });
    }

    if (requestedAmount > availableBalance) {
      return res.status(400).json({
        success: false,
        message: `Requested payout of ₹${requestedAmount.toLocaleString('en-IN')} exceeds your available eligible balance of ₹${availableBalance.toLocaleString('en-IN')}. Note that earnings remain in 7-day escrow holding after delivery.`,
      });
    }

    const reference = `PAYOUT-REQ-${Date.now().toString().slice(-6)}`;

    let payoutRow;
    try {
      const { rows: payoutRows } = await query(
        `INSERT INTO seller_payouts (seller_id, amount, status, reference, created_at)
         VALUES ($1, $2, 'pending', $3, NOW())
         RETURNING *`,
        [sellerId, requestedAmount, reference]
      );
      payoutRow = payoutRows[0];
    } catch {
      const { rows: payoutRows } = await query(
        `INSERT INTO payouts (seller_id, amount, status, reference_id, initiated_at)
         VALUES ($1, $2, 'pending', $3, NOW()::text)
         RETURNING *`,
        [sellerId, requestedAmount, reference]
      );
      payoutRow = payoutRows[0];
    }

    // Notify seller
    await createNotification(
      sellerId,
      'payout_requested',
      'Payout Request Submitted 💳',
      `Your withdrawal request for ₹${requestedAmount.toLocaleString('en-IN')} has been received and scheduled for transfer.`,
      { payout_id: payoutRow?.id, amount: requestedAmount, reference }
    ).catch(e => console.warn('[Payout] Notification trigger failed:', e.message));

    return res.status(201).json({
      success: true,
      message: `Payout withdrawal request for ₹${requestedAmount.toLocaleString('en-IN')} submitted successfully.`,
      data: {
        payout: payoutRow,
        withdrawn_amount: requestedAmount,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/orders/:id/label & POST /api/seller/orders/:id/awb
// ---------------------------------------------------------------------------
async function getOrderLabel(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const labelData = await logisticsService.getShippingLabel(id, req.user.role === 'admin' ? null : sellerId);
    return res.json({
      success: true,
      data: {
        label: labelData,
        label_url: `/api/logistics/label/${id}`,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function generateOrderAWB(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const result = await logisticsService.generateSellerAWB(id, req.user.role === 'admin' ? null : sellerId);
    return res.json({
      success: true,
      message: 'AWB generated successfully.',
      data: result,
    });
  } catch (err) {
    if (err.manual_fulfillment_required) {
      return res.json({
        success: true,
        message: err.message,
        data: {
          manual_fulfillment_required: true,
          label_url: `/api/logistics/label/${req.params.id}`,
        }
      });
    }
    next(err);
  }
}

async function followSeller(req, res, next) {
  try {
    const userId = req.user.id;
    const sellerId = req.params.id || req.body.seller_id || req.body.sellerId || req.body.id;

    if (!sellerId) {
      return res.status(400).json({ success: false, message: 'Seller ID is required to follow.' });
    }

    if (userId === sellerId) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself.' });
    }

    // Insert into seller_followers table
    await query(
      `INSERT INTO seller_followers (user_id, seller_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, seller_id) DO NOTHING`,
      [userId, sellerId]
    ).catch(() => {});

    // Also insert into follows table for graph compatibility
    await query(
      `INSERT INTO follows (follower_id, followee_id)
       VALUES ($1, $2)
       ON CONFLICT (follower_id, followee_id) DO NOTHING`,
      [userId, sellerId]
    ).catch(() => {});

    return res.json({
      success: true,
      message: 'Artisan followed successfully.',
      is_following: true,
    });
  } catch (err) {
    next(err);
  }
}

async function unfollowSeller(req, res, next) {
  try {
    const userId = req.user.id;
    const sellerId = req.params.id || req.body.seller_id || req.body.sellerId || req.body.id;

    if (!sellerId) {
      return res.status(400).json({ success: false, message: 'Seller ID is required to unfollow.' });
    }

    await query(
      'DELETE FROM seller_followers WHERE user_id = $1 AND seller_id = $2',
      [userId, sellerId]
    ).catch(() => {});

    await query(
      'DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2',
      [userId, sellerId]
    ).catch(() => {});

    return res.json({
      success: true,
      message: 'Artisan unfollowed.',
      is_following: false,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Ensure discount columns exist on products table
// ---------------------------------------------------------------------------
let discountColsChecked = false;
async function ensureProductDiscountColumns() {
  if (discountColsChecked) return;
  try {
    await query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS discount_active BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS discount_percentage INTEGER DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2) DEFAULT NULL;
    `);
    discountColsChecked = true;
  } catch (err) {
    discountColsChecked = true;
  }
}

// ---------------------------------------------------------------------------
// PATCH / POST /api/seller/orders/:id/tracking — update shipping tracking
// ---------------------------------------------------------------------------
async function updateOrderTracking(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = req.user.role;
    const trackingNumber = req.body.tracking_number || req.body.tracking_id || req.body.trackingId || req.body.awb_number;
    const courier = req.body.courier || req.body.carrier || 'iThink Logistics';

    if (!trackingNumber) {
      return res.status(400).json({ success: false, message: 'Tracking number is required.' });
    }

    const trackingUrl = req.body.tracking_url || `https://ithinklogistics.com/track/${encodeURIComponent(trackingNumber)}`;

    // Verify order exists and belongs to seller (or admin)
    const { rows: existingRows } = await query(
      `SELECT * FROM orders WHERE id = $1 AND (seller_id = $2 OR $3 = 'admin' OR $3 = 'master_admin')`,
      [id, sellerId, role]
    );

    if (!existingRows.length) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
    }

    const order = existingRows[0];
    const newStatus = ['pending', 'confirmed', 'crafting', 'packed'].includes(order.status) ? 'shipped' : order.status;

    const { rows } = await query(
      `UPDATE orders
       SET tracking_id = $1,
           tracking_url = $2,
           status = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [trackingNumber, trackingUrl, newStatus, id]
    );

    await query(
      `UPDATE seller_orders
       SET tracking_url = $1,
           updated_at = NOW()
       WHERE order_id = $2 OR id = $2`,
      [trackingUrl, id]
    ).catch(() => {});

    const updatedOrder = rows[0];

    // Notify buyer
    if (updatedOrder.buyer_id) {
      await createNotification(
        updatedOrder.buyer_id,
        'order_shipped',
        'Your Order Has Been Dispatched! 🚚',
        `Your handcrafted creation is on its way with ${courier}. Waybill tracking #${trackingNumber}.`,
        {
          order_id: id,
          tracking_id: trackingNumber,
          tracking_url: trackingUrl,
          courier
        }
      ).catch(e => console.warn('[Order Tracking] Notification trigger failed:', e.message));
    }

    return res.json({
      success: true,
      message: 'Order tracking details updated successfully.',
      data: { order: updatedOrder }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/catalog/summary — aggregate catalog statistics
// ---------------------------------------------------------------------------
async function getCatalogSummary(req, res, next) {
  try {
    await ensureProductDiscountColumns();
    const sellerId = req.user.id;

    const { rows } = await query(
      `SELECT 
         COUNT(*)::int AS total_listings,
         COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(low_stock_threshold, 5))::int AS low_stock,
         COUNT(*) FILTER (WHERE discount_active::text IN ('true', '1', 't'))::int AS on_discount
       FROM products
       WHERE seller_id::text = $1`,
      [String(sellerId)]
    );

    const summary = rows[0] || { total_listings: 0, low_stock: 0, on_discount: 0 };
    return res.json({
      success: true,
      data: {
        total_listings: summary.total_listings || 0,
        low_stock: summary.low_stock || 0,
        on_discount: summary.on_discount || 0
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/seller/listings/:id/discount — update individual listing discount
// ---------------------------------------------------------------------------
async function updateListingDiscount(req, res, next) {
  try {
    await ensureProductDiscountColumns();
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = req.user.role;
    const { discount_active, discount_percentage } = req.body;

    const isActive = Boolean(discount_active);
    const pct = isActive ? parseInt(discount_percentage, 10) : null;

    if (isActive && (!pct || isNaN(pct) || pct < 1 || pct > 90)) {
      return res.status(400).json({ success: false, message: 'Discount percentage must be between 1 and 90.' });
    }

    const { rows: pRows } = await query(
      `SELECT id, base_price FROM products WHERE id = $1 AND (seller_id = $2 OR $3 = 'admin' OR $3 = 'master_admin')`,
      [id, sellerId, role]
    );

    if (!pRows.length) {
      return res.status(404).json({ success: false, message: 'Product listing not found or unauthorized.' });
    }

    const basePrice = parseFloat(pRows[0].base_price || 0);
    const discountedPrice = isActive ? Math.round(basePrice * (1 - pct / 100) * 100) / 100 : null;

    const { rows } = await query(
      `UPDATE products
       SET discount_active = $1,
           discount_percentage = $2,
           sale_price = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, base_price, discount_active, discount_percentage, sale_price`,
      [isActive, pct, discountedPrice, id]
    );

    return res.json({
      success: true,
      message: isActive ? `Discount of ${pct}% applied.` : 'Discount removed.',
      data: {
        listing_id: id,
        id,
        discount_active: isActive,
        discount_percentage: pct,
        discounted_price: discountedPrice
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/seller/listings/bulk-discount — apply discount to selected listings
// ---------------------------------------------------------------------------
async function bulkDiscountListings(req, res, next) {
  try {
    await ensureProductDiscountColumns();
    const sellerId = req.user.id;
    const role = req.user.role;
    const { product_ids, discount_percentage, discount_active } = req.body;

    const isActive = discount_active !== false && discount_active !== 'false' && discount_active !== 0;
    const pct = isActive ? parseInt(discount_percentage, 10) : null;

    if (isActive && (!pct || isNaN(pct) || pct < 1 || pct > 90)) {
      return res.status(400).json({ success: false, message: 'Discount percentage must be between 1 and 90.' });
    }

    if (!Array.isArray(product_ids) || !product_ids.length) {
      return res.status(400).json({ success: false, message: 'product_ids array is required.' });
    }

    const { rows } = await query(
      `UPDATE products
       SET discount_active = $1,
           discount_percentage = $2,
           sale_price = CASE WHEN $1 = TRUE THEN ROUND((base_price * (1 - ($2::numeric / 100)))::numeric, 2) ELSE NULL END,
           updated_at = NOW()
       WHERE id = ANY($3::uuid[]) AND (seller_id = $4 OR $5 = 'admin' OR $5 = 'master_admin')
       RETURNING id, base_price, discount_active, discount_percentage, sale_price`,
      [isActive, pct, product_ids, sellerId, role]
    );

    return res.json({
      success: true,
      message: `Bulk discount updated for ${rows.length} listings.`,
      data: { updated_count: rows.length, listings: rows }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/seller/listings/bulk-discount-all — apply discount to all listings
// ---------------------------------------------------------------------------
async function bulkDiscountAllListings(req, res, next) {
  try {
    await ensureProductDiscountColumns();
    const sellerId = req.user.id;
    const role = req.user.role;
    const { discount_percentage, discount_active } = req.body;

    const isActive = discount_active !== false && discount_active !== 'false' && discount_active !== 0;
    const pct = isActive ? parseInt(discount_percentage, 10) : null;

    if (isActive && (!pct || isNaN(pct) || pct < 1 || pct > 90)) {
      return res.status(400).json({ success: false, message: 'Discount percentage must be between 1 and 90.' });
    }

    const { rows } = await query(
      `UPDATE products
       SET discount_active = $1,
           discount_percentage = $2,
           sale_price = CASE WHEN $1 = TRUE THEN ROUND((base_price * (1 - ($2::numeric / 100)))::numeric, 2) ELSE NULL END,
           updated_at = NOW()
       WHERE (seller_id = $3 OR $4 = 'admin' OR $4 = 'master_admin')
       RETURNING id, base_price, discount_active, discount_percentage, sale_price`,
      [isActive, pct, sellerId, role]
    );

    return res.json({
      success: true,
      message: `Bulk discount updated for all ${rows.length} listings.`,
      data: { updated_count: rows.length, listings: rows }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/seller/complete-onboarding
 * Post-approval studio setup for marketplace sellers: collects courier pickup address and payout bank details.
 * Sets onboarding_completed = TRUE in seller_profiles and sellers.
 */
async function completeOnboarding(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      address_line1, addressLine1, address_line2, addressLine2, city, state, pincode, postal_code,
      account_holder_name, accountHolderName, account_holder,
      bank_name, bankName,
      account_number, accountNumber,
      ifsc_code, ifscCode, ifsc,
      upi_id, upiId
    } = req.body;

    const finalAddr1 = (address_line1 || addressLine1 || '').trim();
    const finalAddr2 = (address_line2 || addressLine2 || '').trim();
    const finalCity = (city || '').trim();
    const finalState = (state || '').trim();
    const finalPincode = (pincode || postal_code || '').trim();

    if (!finalAddr1 || !finalCity || !finalState || !finalPincode) {
      return res.status(400).json({
        success: false,
        message: 'All pickup address fields (Street Address, City, State, 6-digit Pincode) are required.'
      });
    }

    if (!/^\d{6}$/.test(finalPincode)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit Indian pincode.'
      });
    }

    const finalHolder = (account_holder_name || accountHolderName || account_holder || '').trim();
    const finalBank = (bank_name || bankName || '').trim();
    const finalAccount = (account_number || accountNumber || '').trim();
    const finalIfsc = (ifsc_code || ifscCode || ifsc || '').toUpperCase().trim();
    const finalUpi = (upi_id || upiId || '').trim();

    if (!finalHolder || !finalBank || !finalAccount || !finalIfsc) {
      return res.status(400).json({
        success: false,
        message: 'All bank account details (Holder Name, Bank Name, Account Number, IFSC Code) are required for payout settlements.'
      });
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(finalIfsc)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 11-character Indian IFSC code (e.g. SBIN0001234, HDFC0000456).'
      });
    }

    const pickupAddress = {
      address_line1: finalAddr1,
      address_line2: finalAddr2,
      city: finalCity,
      state: finalState,
      pincode: finalPincode,
      country: 'India'
    };

    const bankDetails = {
      account_holder: finalHolder,
      account_holder_name: finalHolder,
      bank_name: finalBank,
      account_number: finalAccount,
      ifsc_code: finalIfsc,
      upi_id: finalUpi || null
    };

    // Update seller_profiles
    const { rows: updatedProfiles } = await query(
      `UPDATE seller_profiles
       SET pickup_address = $1,
           bank_details = $2,
           onboarding_completed = TRUE,
           updated_at = NOW()
       WHERE user_id = $3
       RETURNING *`,
      [JSON.stringify(pickupAddress), JSON.stringify(bankDetails), userId]
    );

    // Update master sellers table
    await query(
      `UPDATE sellers
       SET pickup_address = $1,
           bank_details = $2,
           onboarding_completed = TRUE
       WHERE user_id = $3`,
      [JSON.stringify(pickupAddress), JSON.stringify(bankDetails), userId]
    ).catch(() => {});

    // Save default dispatch address to user_addresses if not existing
    try {
      const { rows: addrRows } = await query('SELECT id FROM user_addresses WHERE user_id = $1 LIMIT 1', [userId]);
      if (!addrRows.length) {
        const { rows: uRows } = await query('SELECT name, phone FROM users WHERE id = $1', [userId]);
        await query(
          `INSERT INTO user_addresses (user_id, name, phone, address_line1, address_line2, city, state, pincode, address_type, is_default)
           VALUES ($1, $2, COALESCE($3, '9999999999'), $4, $5, $6, $7, $8, 'office', TRUE)`,
          [userId, uRows[0]?.name || 'Artisan Workshop', uRows[0]?.phone, finalAddr1, finalAddr2, finalCity, finalState, finalPincode]
        );
      }
    } catch (addrErr) {
      console.warn('Address sync notice in completeOnboarding:', addrErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Studio setup completed successfully! Welcome to Tohfa Seller Studio.',
      data: {
        pickup_address: pickupAddress,
        bank_details: bankDetails,
        onboarding_completed: true,
        profile: updatedProfiles[0] || {}
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOwnSellerProfile,
  updateSellerProfile,
  getPublicSellerProfile,
  updateStoreConfig,
  toggleVacationMode,
  applyAsSeller,
  getApplicationStatus,
  completeOnboarding,
  getDashboardMetrics,
  getSellerAnalytics,
  getSellerOrders,
  getSellerOrderDetail,
  updateSellerOrderStatus,
  updateOrderTracking,
  uploadCustomProof,
  getPayoutOverview,
  getSellerPayouts: getPayoutOverview,
  getSellerEarnings,
  getSellerEarningsGraph,
  getReceivingDetails,
  saveReceivingDetails,
  getPaymentHistory,
  getTaxSettings,
  saveTaxSettings,
  getSellerInvoices,
  getSellerDisputes,
  requestPayout,
  getOrderLabel,
  generateOrderAWB,
  getCatalogSummary,
  updateListingDiscount,
  bulkDiscountListings,
  bulkDiscountAllListings,
  followSeller,
  unfollowSeller,
};

