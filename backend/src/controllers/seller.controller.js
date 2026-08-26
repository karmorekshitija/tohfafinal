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

const { query } = require('../config/db');
const { createNotification } = require('./notification.controller');
const logisticsService = require('../services/logistics.service');

// Strip internal field
function sanitizeSellerProfile(sp) {
  if (!sp) return null;
  const { is_tohfa_original, ...rest } = sp;
  return rest;
}

// Ensure custom proof columns exist on order_items
let orderItemColsChecked = false;
async function ensureOrderItemColumns() {
  if (orderItemColsChecked) return;
  try {
    await query(`
      ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS proof_image_url TEXT,
      ADD COLUMN IF NOT EXISTS customization_status TEXT;
    `);
    orderItemColsChecked = true;
  } catch (err) {
    // Ignore schema update error if permission or already exists
    orderItemColsChecked = true;
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/profile  — own seller profile
// ---------------------------------------------------------------------------
async function getOwnSellerProfile(req, res, next) {
  try {
    const userId = req.user.id;

    const { rows } = await query(
      `SELECT sp.id, sp.user_id, sp.store_name, sp.bio, sp.whatsapp_number,
              sp.profile_photo, sp.cover_photo, sp.seller_type, sp.is_approved,
              sp.rejection_reason, sp.vacation_mode, sp.store_visibility,
              sp.capacity_limit, sp.shipping_presets, sp.pickup_address, sp.created_at,
              u.name, u.email, u.phone
       FROM seller_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.user_id = $1`,
      [userId]
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
           profile_photo   = COALESCE($4, profile_photo),
           cover_photo     = COALESCE($5, cover_photo),
           updated_at      = NOW()
       WHERE user_id = $6
       RETURNING id, store_name, bio, whatsapp_number, profile_photo, cover_photo,
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
// GET /api/seller/public/:userId  — public seller profile (buyer view)
// ---------------------------------------------------------------------------
async function getPublicSellerProfile(req, res, next) {
  try {
    const { userId } = req.params;

    const { rows } = await query(
      `SELECT sp.store_name, sp.bio, sp.profile_photo, sp.cover_photo,
              sp.store_visibility, sp.created_at, u.name
       FROM seller_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.user_id = $1
         AND sp.is_approved = true
         AND sp.store_visibility != false`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Seller not found.' });
    }

    return res.json({ success: true, data: { profile: rows[0] } });
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
// POST /api/seller/apply  — create seller_profiles row (onboarding)
// ---------------------------------------------------------------------------
async function applyAsSeller(req, res, next) {
  try {
    const userId = req.user.id;

    if (req.user.role !== 'seller') {
      return res.status(403).json({ success: false, message: 'Only users with seller role can apply.' });
    }

    // Check if already exists
    const { rows: existing } = await query(
      'SELECT id FROM seller_profiles WHERE user_id = $1',
      [userId]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Seller profile already exists.' });
    }

    const { store_name, bio, whatsapp_number } = req.body;

    const { rows: userRows } = await query('SELECT name FROM users WHERE id = $1', [userId]);
    const defaultStoreName = store_name || userRows[0]?.name || 'My Store';

    const { rows } = await query(
      `INSERT INTO seller_profiles
         (user_id, store_name, bio, whatsapp_number, seller_type, is_approved)
       VALUES ($1, $2, $3, $4, 'regular', false)
       RETURNING id, store_name, bio, whatsapp_number, seller_type, is_approved`,
      [userId, defaultStoreName, bio || null, whatsapp_number || null]
    );

    return res.status(201).json({ success: true, data: { profile: rows[0] } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/application-status
// ---------------------------------------------------------------------------
async function getApplicationStatus(req, res, next) {
  try {
    const userId = req.user.id;

    const { rows } = await query(
      `SELECT is_approved, rejection_reason, seller_type, created_at
       FROM seller_profiles WHERE user_id = $1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'No seller application found.' });
    }

    return res.json({ success: true, data: { application: rows[0] } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/dashboard-metrics (aliases: /dashboard-stats, /dashboard)
// ---------------------------------------------------------------------------
async function getDashboardMetrics(req, res, next) {
  try {
    await ensureOrderItemColumns();
    const sellerId = req.user.id;

    // 1. Core KPIs
    const { rows: statsRows } = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_status = 'paid' AND status != 'cancelled' THEN total_amount ELSE 0 END), 0) AS total_revenue,
         COUNT(CASE WHEN status != 'cancelled' THEN 1 END) AS total_orders,
         COUNT(CASE WHEN status IN ('pending', 'confirmed', 'crafting', 'packed') THEN 1 END) AS pending_orders
       FROM orders
       WHERE seller_id = $1`,
      [sellerId]
    );

    const { rows: prodRows } = await query(
      `SELECT COUNT(*) AS active_products FROM products WHERE seller_id = $1 AND status = 'active'`,
      [sellerId]
    );

    const { rows: reviewRows } = await query(
      `SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 5.0) AS average_rating, COUNT(*) AS review_count
       FROM reviews WHERE seller_id = $1`,
      [sellerId]
    );

    const totalRevenue = parseFloat(statsRows[0]?.total_revenue || 0);
    const totalOrders = parseInt(statsRows[0]?.total_orders || 0, 10);
    const pendingOrders = parseInt(statsRows[0]?.pending_orders || 0, 10);
    const activeProducts = parseInt(prodRows[0]?.active_products || 0, 10);
    const averageRating = parseFloat(reviewRows[0]?.average_rating || 5.0);
    const reviewCount = parseInt(reviewRows[0]?.review_count || 0, 10);

    // 2. Recent orders (latest 5)
    const { rows: recentOrderRows } = await query(
      `SELECT o.id, o.total_amount, o.total_amount AS subtotal, o.status, o.created_at, o.payment_status, o.payout_status,
              COALESCE(u.name, 'Valued Buyer') AS buyer_name,
              u.email AS buyer_email,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'product_name', p.name,
                  'name', p.name,
                  'quantity', oi.quantity,
                  'unit_price', oi.unit_price,
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
       WHERE o.seller_id = $1
       ORDER BY o.created_at DESC
       LIMIT 5`,
      [sellerId]
    );

    const formattedRecentOrders = recentOrderRows.map(o => ({
      id: o.id,
      order_ref: `TOHFA-${String(o.id).substring(0, 8).toUpperCase()}`,
      buyer_name: o.buyer_name,
      buyer_email: o.buyer_email,
      subtotal: parseFloat(o.subtotal || o.total_amount || 0),
      total_amount: parseFloat(o.total_amount || 0),
      total_paise: Math.round(parseFloat(o.total_amount || 0) * 100),
      status: o.status,
      payment_status: o.payment_status,
      payout_status: o.payout_status,
      created_at: o.created_at,
      items: Array.isArray(o.items) ? o.items : [],
    }));

    // 3. Sales chart for past 6 months
    const { rows: monthlySales } = await query(
      `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month_label,
              DATE_TRUNC('month', created_at) AS month_date,
              COALESCE(SUM(total_amount), 0) AS revenue,
              COUNT(id) AS order_count
       FROM orders
       WHERE seller_id = $1 AND payment_status = 'paid' AND status != 'cancelled'
         AND created_at >= NOW() - INTERVAL '6 months'
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY month_date ASC`,
      [sellerId]
    );

    let chartLabels = [];
    let chartData = [];

    if (monthlySales.length > 0) {
      chartLabels = monthlySales.map(r => r.month_label);
      chartData = monthlySales.map(r => parseFloat(r.revenue));
    } else {
      const currentMonth = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      chartLabels = [currentMonth];
      chartData = [0];
    }

    const metrics = {
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      average_rating: averageRating,
      active_products: activeProducts,
      pending_orders: pendingOrders,
      review_count: reviewCount,
    };

    return res.json({
      success: true,
      data: {
        metrics,
        recentOrders: formattedRecentOrders,
        recent_orders: formattedRecentOrders,
        salesChart: {
          labels: chartLabels,
          data: chartData,
        },
        // Backwards compatibility mirrors
        total_revenue: totalRevenue,
        total_orders: totalOrders,
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
    const selectedRange = req.query.range || req.query.period || '30d';
    const { start = '', end = '' } = req.query;

    let dateCondition = `created_at >= NOW() - INTERVAL '30 days'`;
    let queryParams = [sellerId];

    if (selectedRange === '7d') {
      dateCondition = `created_at >= NOW() - INTERVAL '7 days'`;
    } else if (selectedRange === '90d') {
      dateCondition = `created_at >= NOW() - INTERVAL '90 days'`;
    } else if (selectedRange === 'custom' && start && end) {
      dateCondition = `DATE(created_at) BETWEEN $2 AND $3`;
      queryParams.push(start, end);
    }

    // Revenue & Order totals in this window
    const { rows: totalsRows } = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_status = 'paid' AND status != 'cancelled' THEN total_amount ELSE 0 END), 0) AS revenue,
         COUNT(CASE WHEN status != 'cancelled' THEN 1 END) AS orders_count,
         COALESCE(AVG(CASE WHEN payment_status = 'paid' AND status != 'cancelled' THEN total_amount ELSE NULL END), 0) AS avg_order_value
       FROM orders
       WHERE seller_id = $1 AND ${dateCondition}`,
      queryParams
    );

    // Orders per day & daily revenue series
    const { rows: dailyRows } = await query(
      `SELECT
         DATE(created_at) AS date,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' AND status != 'cancelled' THEN total_amount ELSE 0 END), 0) AS revenue,
         COUNT(CASE WHEN status != 'cancelled' THEN 1 END) AS order_count
       FROM orders
       WHERE seller_id = $1 AND ${dateCondition}
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      queryParams
    );

    // Top products
    const { rows: topProducts } = await query(
      `SELECT p.id, p.name, p.base_price, p.view_count,
              COUNT(oi.id) AS sales_count,
              COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS total_revenue
       FROM products p
       LEFT JOIN order_items oi ON oi.product_id = p.id
       LEFT JOIN orders o ON o.id = oi.order_id AND o.payment_status = 'paid' AND o.status != 'cancelled'
       WHERE p.seller_id = $1 AND p.status != 'deleted'
       GROUP BY p.id, p.name, p.base_price, p.view_count
       ORDER BY total_revenue DESC, sales_count DESC
       LIMIT 5`,
      [sellerId]
    );

    const labels = dailyRows.map(r => (r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10)));
    const revenuePoints = dailyRows.map(r => parseFloat(r.revenue));
    const orderPoints = dailyRows.map(r => parseInt(r.order_count, 10));

    const totalRevenue = parseFloat(totalsRows[0]?.revenue || 0);
    const totalOrders = parseInt(totalsRows[0]?.orders_count || 0, 10);
    const avgOrderVal = parseFloat(parseFloat(totalsRows[0]?.avg_order_value || 0).toFixed(2));

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
          conversion_rate: 3.8,
        },
        revenue_chart: {
          labels: labels.length ? labels : [new Date().toISOString().slice(0, 10)],
          data: revenuePoints.length ? revenuePoints : [0],
        },
        orders_chart: {
          labels: labels.length ? labels : [new Date().toISOString().slice(0, 10)],
          data: orderPoints.length ? orderPoints : [0],
        },
        sales_data: dailyRows,
        top_products: topProducts.map(p => ({
          id: p.id,
          name: p.name,
          base_price: parseFloat(p.base_price || 0),
          sales_count: parseInt(p.sales_count || 0, 10),
          total_revenue: parseFloat(p.total_revenue || 0),
          view_count: parseInt(p.view_count || 0, 10),
        })),
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
      `SELECT o.id, o.buyer_id, o.seller_id, o.total_amount, o.status, o.payment_status, o.payout_status,
              o.tracking_id, o.tracking_url, o.delivered_at, o.created_at, o.updated_at,
              u.name AS buyer_name, u.email AS buyer_email, u.phone AS buyer_phone,
              a.line1 AS delivery_line1, a.line2 AS delivery_line2, a.city AS delivery_city,
              a.state AS delivery_state, a.pincode AS delivery_pincode,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'product_name', p.name,
                  'name', p.name,
                  'quantity', oi.quantity,
                  'unit_price', oi.unit_price,
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
      const items = Array.isArray(o.items) ? o.items : [];
      const firstItem = items[0];
      let itemPreview = firstItem ? (firstItem.product_name || firstItem.name || 'Handcrafted Creation') : 'Handcrafted Creation';
      if (items.length > 1) {
        itemPreview += ` + ${items.length - 1} more`;
      }
      return {
        ...o,
        order_ref: `TOHFA-${String(o.id).substring(0, 8).toUpperCase()}`,
        subtotal: parseFloat(o.total_amount || 0),
        total_paise: Math.round(parseFloat(o.total_amount || 0) * 100),
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
    const isAdmin = req.user.role === 'admin';

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
                  'product_name', p.name,
                  'name', p.name,
                  'quantity', oi.quantity,
                  'unit_price', oi.unit_price,
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
    const items = Array.isArray(order.items) ? order.items : [];

    const formattedOrder = {
      ...order,
      order_ref: `TOHFA-${String(order.id).substring(0, 8).toUpperCase()}`,
      subtotal: parseFloat(order.total_amount || 0),
      total_paise: Math.round(parseFloat(order.total_amount || 0) * 100),
      items,
      shipping_address: {
        recipient_name: order.recipient_name || order.buyer_name,
        phone: order.recipient_phone || order.buyer_phone,
        line1: order.delivery_line1,
        line2: order.delivery_line2,
        city: order.delivery_city,
        state: order.delivery_state,
        pincode: order.delivery_pincode,
      },
    };

    return res.json({ success: true, data: { order: formattedOrder } });
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
      `SELECT * FROM orders WHERE id = $1 AND (seller_id = $2 OR $3 = 'admin')`,
      [id, sellerId, role]
    );

    if (!existingRows.length) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
    }

    const currentOrder = existingRows[0];

    // Validate state transition if not admin
    if (role !== 'admin') {
      const allowedNext = VALID_TRANSITIONS[currentOrder.status] || [];
      if (!allowedNext.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot transition order status from "${currentOrder.status}" to "${status}". Valid transitions are: ${allowedNext.join(', ') || 'none (terminal state)'}.`,
        });
      }
    }

    // When status is set to delivered, set delivered_at = NOW(), payout_status = 'holding'
    const { rows } = await query(
      `UPDATE orders
       SET status = $1,
           delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END,
           payout_status = CASE WHEN $1 = 'delivered' THEN 'holding' ELSE payout_status END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

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

    return res.json({ success: true, message: `Order status updated to ${status}.`, data: { order } });
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

    // Auto-promote matured escrow sub-orders / orders (> 7 days post-delivery) to 'eligible'
    await query(
      `UPDATE seller_orders
       SET payout_status = 'eligible'
       WHERE seller_id = $1
         AND status = 'delivered'
         AND COALESCE(delivered_at, created_at) <= NOW() - INTERVAL '7 days'
         AND payout_status IN ('unsettled', 'holding')`,
      [sellerId]
    ).catch(() => {});

    await query(
      `UPDATE orders
       SET payout_status = 'eligible'
       WHERE seller_id = $1
         AND status = 'delivered'
         AND payment_status = 'paid'
         AND COALESCE(delivered_at, updated_at) <= NOW() - INTERVAL '7 days'
         AND payout_status IN ('unsettled', 'holding', 'pending')`,
      [sellerId]
    ).catch(() => {});

    // Available / Eligible balance: orders delivered > 7 days ago and not yet disbursed
    const { rows: availableRows } = await query(
      `SELECT
         COALESCE(
           (SELECT SUM(so.seller_payout_amount)
            FROM seller_orders so
            WHERE so.seller_id = $1
              AND so.status = 'delivered'
              AND COALESCE(so.delivered_at, so.created_at) <= NOW() - INTERVAL '7 days'
              AND so.payout_status NOT IN ('paid', 'completed')),
           (SELECT SUM(o.total_amount)
            FROM orders o
            WHERE o.seller_id = $1
              AND o.status = 'delivered'
              AND o.payment_status = 'paid'
              AND COALESCE(o.delivered_at, o.updated_at) <= NOW() - INTERVAL '7 days'
              AND o.payout_status NOT IN ('paid', 'completed')),
           0
         ) AS available_balance,
         COALESCE(
           (SELECT COUNT(so.id)
            FROM seller_orders so
            WHERE so.seller_id = $1
              AND so.status = 'delivered'
              AND COALESCE(so.delivered_at, so.created_at) <= NOW() - INTERVAL '7 days'
              AND so.payout_status NOT IN ('paid', 'completed')),
           (SELECT COUNT(o.id)
            FROM orders o
            WHERE o.seller_id = $1
              AND o.status = 'delivered'
              AND o.payment_status = 'paid'
              AND COALESCE(o.delivered_at, o.updated_at) <= NOW() - INTERVAL '7 days'
              AND o.payout_status NOT IN ('paid', 'completed')),
           0
         ) AS eligible_count`,
      [sellerId]
    );

    // Holding / Unsettled balance: orders in progress or delivered within the 7-day escrow window
    const { rows: holdingRows } = await query(
      `SELECT
         COALESCE(
           (SELECT SUM(so.seller_payout_amount)
            FROM seller_orders so
            WHERE so.seller_id = $1
              AND (
                so.status IN ('order_placed', 'pending', 'confirmed', 'crafting', 'packed', 'shipped')
                OR (so.status = 'delivered' AND COALESCE(so.delivered_at, so.created_at) > NOW() - INTERVAL '7 days')
              )
              AND so.payout_status NOT IN ('paid', 'completed')),
           (SELECT SUM(o.total_amount)
            FROM orders o
            WHERE o.seller_id = $1
              AND o.payment_status = 'paid'
              AND (
                o.status IN ('pending', 'confirmed', 'crafting', 'packed', 'shipped')
                OR (o.status = 'delivered' AND COALESCE(o.delivered_at, o.updated_at) > NOW() - INTERVAL '7 days')
              )
              AND o.payout_status NOT IN ('paid', 'completed')),
           0
         ) AS holding_balance,
         COALESCE(
           (SELECT COUNT(so.id)
            FROM seller_orders so
            WHERE so.seller_id = $1
              AND (
                so.status IN ('order_placed', 'pending', 'confirmed', 'crafting', 'packed', 'shipped')
                OR (so.status = 'delivered' AND COALESCE(so.delivered_at, so.created_at) > NOW() - INTERVAL '7 days')
              )
              AND so.payout_status NOT IN ('paid', 'completed')),
           0
         ) AS holding_count`,
      [sellerId]
    );

    // Completed payouts
    const { rows: completedRows } = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid_out
       FROM seller_payouts
       WHERE seller_id = $1 AND status IN ('paid', 'completed')`,
      [sellerId]
    ).catch(async () => {
      return await query(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid_out
         FROM payouts
         WHERE seller_id = $1 AND status = 'completed'`,
        [sellerId]
      ).catch(() => ({ rows: [{ total_paid_out: 0 }] }));
    });

    // Payout records history
    const { rows: payoutList } = await query(
      `SELECT id, amount, status, utr_number, reference, disbursed_at, created_at
       FROM seller_payouts
       WHERE seller_id = $1
       ORDER BY created_at DESC`,
      [sellerId]
    ).catch(async () => {
      return await query(
        `SELECT id, amount, status, reference, initiated_at, completed_at, initiated_at AS created_at
         FROM payouts
         WHERE seller_id = $1
         ORDER BY initiated_at DESC`,
        [sellerId]
      ).catch(() => ({ rows: [] }));
    });

    const availableBalance = parseFloat(availableRows[0]?.available_balance || 0);
    const holdingBalance = parseFloat(holdingRows[0]?.holding_balance || 0);
    const totalPaidOut = parseFloat(completedRows[0]?.total_paid_out || 0);

    return res.json({
      success: true,
      data: {
        availableBalance,
        pendingBalance: holdingBalance,
        eligible_balance: availableBalance,
        holding_balance: holdingBalance,
        eligible_orders_count: parseInt(availableRows[0]?.eligible_count || 0, 10),
        holding_orders_count: parseInt(holdingRows[0]?.holding_count || 0, 10),
        total_paid_out: totalPaidOut,
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
// POST /api/seller/payouts/request  — request payout withdrawal
// ---------------------------------------------------------------------------
async function requestPayout(req, res, next) {
  try {
    const sellerId = req.user.id;
    const requestedAmount = parseFloat(req.body.amount || req.body.requestedAmount);

    if (isNaN(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid payout amount greater than zero is required.',
      });
    }

    // Verify eligible balance
    const { rows: availableRows } = await query(
      `SELECT
         COALESCE(
           (SELECT SUM(so.seller_payout_amount)
            FROM seller_orders so
            WHERE so.seller_id = $1
              AND so.status = 'delivered'
              AND COALESCE(so.delivered_at, so.created_at) <= NOW() - INTERVAL '7 days'
              AND so.payout_status NOT IN ('paid', 'completed')),
           (SELECT SUM(o.total_amount)
            FROM orders o
            WHERE o.seller_id = $1
              AND o.status = 'delivered'
              AND o.payment_status = 'paid'
              AND COALESCE(o.delivered_at, o.updated_at) <= NOW() - INTERVAL '7 days'
              AND o.payout_status NOT IN ('paid', 'completed')),
           0
         ) AS available_balance`,
      [sellerId]
    );

    const availableBalance = parseFloat(availableRows[0]?.available_balance || 0);

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
        `INSERT INTO payouts (seller_id, amount, status, reference, initiated_at)
         VALUES ($1, $2, 'scheduled', $3, NOW())
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
      message: 'Payout withdrawal request submitted successfully.',
      data: {
        payout: payoutRow,
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

module.exports = {
  getOwnSellerProfile,
  updateSellerProfile,
  getPublicSellerProfile,
  updateStoreConfig,
  toggleVacationMode,
  applyAsSeller,
  getApplicationStatus,
  getDashboardMetrics,
  getSellerAnalytics,
  getSellerOrders,
  getSellerOrderDetail,
  updateSellerOrderStatus,
  uploadCustomProof,
  getPayoutOverview,
  getSellerPayouts: getPayoutOverview,
  requestPayout,
  getOrderLabel,
  generateOrderAWB,
  followSeller,
  unfollowSeller,
};

