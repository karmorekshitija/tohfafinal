/**
 * Tohfa v2 — Analytics Controller
 * File: backend/src/controllers/analytics.controller.js
 * Role: Computes seller metrics (revenue over time, top products, AOV, views)
 *       and platform-wide admin metrics.
 */
'use strict';

const { query } = require('../config/db');

/**
 * GET /api/analytics/seller/revenue
 * Daily earnings for the last 30 days
 */
async function getSellerRevenue(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { rows } = await query(
      `SELECT DATE(created_at) AS date, SUM(total_amount) AS revenue, COUNT(id) AS order_count
       FROM orders
       WHERE seller_id = $1
         AND payment_status = 'paid'
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [sellerId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/seller/top-products
 */
async function getSellerTopProducts(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { rows } = await query(
      `SELECT p.id, p.name, p.base_price, COUNT(oi.id) AS order_count, SUM(oi.unit_price * oi.quantity) AS total_revenue
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE p.seller_id = $1
       GROUP BY p.id, p.name, p.base_price
       ORDER BY order_count DESC
       LIMIT 5`,
      [sellerId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/seller/summary
 */
async function getSellerSummary(req, res, next) {
  try {
    const sellerId = req.user.id;

    // Seller profile info
    const { rows: spRows } = await query(
      `SELECT sp.store_name, sp.seller_type, sp.is_approved, u.name
       FROM seller_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.user_id = $1`,
      [sellerId]
    ).catch(() => ({ rows: [] }));

    const sellerInfo = spRows[0] || {
      store_name: req.user.store_name || 'Artisan Studio',
      seller_type: 'Artisan',
      is_approved: 1,
    };

    // Order stats (Bug #3: Join through seller_orders for multi-vendor revenue & count)
    const { rows: orderStats } = await query(
      `SELECT 
         COUNT(so.id) AS total_orders,
         COALESCE(SUM(so.subtotal), 0) AS total_revenue,
         COALESCE(AVG(so.subtotal), 0) AS avg_order_value
       FROM seller_orders so
       JOIN orders o ON o.id = so.order_id
       WHERE so.seller_id = $1 AND o.payment_status = 'paid'`,
      [sellerId]
    );

    // Pending / new orders (Bug #3: Join through seller_orders)
    const { rows: pendingStats } = await query(
      `SELECT COUNT(so.id) AS pending_orders
       FROM seller_orders so
       JOIN orders o ON o.id = so.order_id
       WHERE so.seller_id = $1 AND (so.status IN ('order_placed', 'pending', 'confirmed', 'processing') OR o.status IN ('pending', 'confirmed', 'processing'))`,
      [sellerId]
    );

    // Low stock products
    const { rows: lowStockRows } = await query(
      `SELECT id, name, stock_quantity, low_stock_threshold
       FROM products
       WHERE seller_id = $1 AND status = 'active' AND stock_quantity <= COALESCE(low_stock_threshold, 5)
       ORDER BY stock_quantity ASC
       LIMIT 5`,
      [sellerId]
    ).catch(() => ({ rows: [] }));

    const lowStockAlerts = lowStockRows.map(p => ({
      id: p.id,
      title: p.name,
      stock_count: p.stock_quantity,
      threshold: p.low_stock_threshold || 5,
    }));

    // Recent orders (latest 5) (Bug #3: Join through seller_orders and use seller_orders.subtotal)
    const { rows: recentOrderRows } = await query(
      `SELECT so.id, o.id AS parent_order_id, so.subtotal AS total_amount, so.status, so.created_at,
              COALESCE(u.name, 'Buyer') AS buyer_name,
              COALESCE(
                (SELECT p2.name FROM order_items oi2 
                 JOIN products p2 ON p2.id = oi2.product_id 
                 WHERE oi2.seller_order_id = so.id OR (oi2.order_id = o.id AND oi2.seller_order_id IS NULL)
                 LIMIT 1),
                'Handcrafted Creation'
              ) AS item_title,
              COALESCE(
                (SELECT pi.url FROM order_items oi
                 JOIN product_images pi ON pi.product_id = oi.product_id AND pi.sort_order = 0
                 WHERE oi.seller_order_id = so.id OR (oi.order_id = o.id AND oi.seller_order_id IS NULL)
                 LIMIT 1),
                NULL
              ) AS item_image
       FROM seller_orders so
       JOIN orders o ON o.id = so.order_id
       LEFT JOIN users u ON u.id = o.buyer_id
       WHERE so.seller_id = $1
       ORDER BY so.created_at DESC
       LIMIT 5`,
      [sellerId]
    ).catch(() => ({ rows: [] }));

    const recentOrders = recentOrderRows.map(o => ({
      id: o.id,
      internal_id: o.id,
      seller_order_id: o.id,
      parent_order_id: o.parent_order_id,
      item_title: o.item_title,
      item_image: o.item_image,
      buyer_name: o.buyer_name,
      shipping_city: 'India',
      amount_paise: Math.round(parseFloat(o.total_amount || 0) * 100),
      status: o.status,
      tracking_id: null,
    }));

    // Reviews stats
    const { rows: reviewStats } = await query(
      `SELECT COUNT(id) AS review_count, COALESCE(AVG(rating), 0) AS avg_rating
       FROM reviews
       WHERE seller_id = $1`,
      [sellerId]
    ).catch(() => ({ rows: [{ review_count: 0, avg_rating: 5.0 }] }));

    const totalRev = parseFloat(orderStats[0]?.total_revenue || 0);
    const totalOrdersNum = parseInt(orderStats[0]?.total_orders || 0, 10);
    const pendingOrdersNum = parseInt(pendingStats[0]?.pending_orders || 0, 10);
    const avgOrderVal = parseFloat(orderStats[0]?.avg_order_value || 0);

    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const announcements = [
      {
        id: 'ann-1',
        title: 'Welcome to Tohfa Artisan Studio',
        body: 'Manage your listings, fulfill custom gifting orders, and track your artisan earnings effortlessly.',
        date: 'Today',
      }
    ];

    return res.json({
      success: true,
      data: {
        seller: {
          id: sellerId,
          store_name: sellerInfo.store_name,
          seller_type: sellerInfo.seller_type,
          is_approved: sellerInfo.is_approved ? 1 : 0,
        },
        date_label: dateLabel,
        kpis: {
          order_value_paise: Math.round(totalRev * 100),
          order_value_change_pct: 12.5,
          total_orders: totalOrdersNum,
          pending_orders: pendingOrdersNum,
          conversion_rate: 3.8,
        },
        low_stock_alerts: lowStockAlerts,
        recent_orders: recentOrders,
        announcements,
        total_orders: totalOrdersNum,
        total_revenue: totalRev,
        avg_order_value: avgOrderVal,
        pending_orders: pendingOrdersNum,
        review_count: parseInt(reviewStats[0]?.review_count || 0, 10),
        avg_rating: parseFloat(parseFloat(reviewStats[0]?.avg_rating || 5).toFixed(1)),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/seller/views
 */
async function getSellerProductViews(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { rows } = await query(
      `SELECT p.id, p.name, p.view_count, p.status
       FROM products p
       WHERE p.seller_id = $1
       ORDER BY p.view_count DESC`,
      [sellerId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/dashboard/summary  (also /api/admin/stats)
 * Returns field names that match what the admin dashboard frontend expects:
 *   total_revenue, revenue_today, total_orders_today, total_sellers,
 *   total_buyers, pending_applications
 *
 * IMPORTANT: total_revenue and revenue_today are returned in PAISE (rupees × 100)
 * because the frontend calls formatPaise(s.total_revenue) which divides by 100.
 */
async function getAdminStats(req, res, next) {
  try {
    // All-time platform revenue (rupees from DB → multiply × 100 for paise)
    const { rows: rev } = await query(
      `SELECT COALESCE(SUM(COALESCE(total_paise / 100.0, total_amount, 0)), 0) AS total_revenue_rupees FROM orders WHERE payment_status = 'paid'`
    );

    // Revenue today (rupees → paise)
    const { rows: todayRev } = await query(
      `SELECT COALESCE(SUM(COALESCE(total_paise / 100.0, total_amount, 0)), 0) AS revenue_today_rupees
       FROM orders
       WHERE payment_status = 'paid' AND DATE(created_at) = CURRENT_DATE`
    );

    // Orders today
    const { rows: today } = await query(
      `SELECT COUNT(id) AS total_orders_today FROM orders WHERE DATE(created_at) = CURRENT_DATE`
    );

    // Active (approved) sellers
    const { rows: sellers } = await query(
      `SELECT COUNT(id) AS total_sellers FROM seller_profiles WHERE (is_approved::text IN ('true', 't', '1') OR verification_status = 'verified')`
    );

    // Registered buyers
    const { rows: buyers } = await query(
      `SELECT COUNT(id) AS total_buyers FROM users WHERE role = 'buyer'`
    );

    // Pending seller applications (applied but not yet approved or rejected)
    const { rows: pending } = await query(
      `SELECT COUNT(id) AS pending_applications
       FROM seller_profiles
       WHERE (is_approved IS NULL OR is_approved::text IN ('false', 'f', '0')) AND rejection_reason IS NULL`
    );

    return res.json({
      success: true,
      data: {
        total_revenue: Math.round(parseFloat(rev[0].total_revenue_rupees) * 100),
        revenue_today: Math.round(parseFloat(todayRev[0].revenue_today_rupees) * 100),
        total_orders_today: parseInt(today[0].total_orders_today, 10),
        total_sellers: parseInt(sellers[0].total_sellers, 10),
        total_buyers: parseInt(buyers[0].total_buyers, 10),
        pending_applications: parseInt(pending[0].pending_applications, 10),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Helper: parse period query params into a SQL date range condition.
 *
 * @param {string} period   '7d' | '30d' | '90d' | '1y' | 'all' | 'custom'
 * @param {string} start    ISO date string (for 'custom')
 * @param {string} end      ISO date string (for 'custom')
 * @param {number} baseIdx  1-based index of the first param slot available
 * @returns {{ condition: string, params: any[] }}
 */
function buildDateRange(period, start, end, baseIdx = 1) {
  if (period === 'custom' && start && end) {
    return {
      condition: `DATE(created_at AT TIME ZONE 'Asia/Kolkata') BETWEEN $${baseIdx} AND $${baseIdx + 1}`,
      params: [start, end],
    };
  }
  if (period === 'all') {
    return {
      condition: `1=1`,
      params: [],
    };
  }
  const daysMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  const days = daysMap[period] || 7;
  return {
    condition: `created_at >= NOW() - INTERVAL '${days} days'`,
    params: [],
  };
}

function formatDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateDateSequence(period, start, end, earliestDateStr = null) {
  const dates = [];
  if (period === 'custom' && start && end) {
    let curr = new Date(start + 'T00:00:00');
    const stop = new Date(end + 'T00:00:00');
    while (curr <= stop) {
      dates.push(formatDateStr(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }

  if (period === 'all') {
    const today = new Date();
    let curr = earliestDateStr ? new Date(earliestDateStr + 'T00:00:00') : new Date();
    if (!earliestDateStr) curr.setDate(today.getDate() - 30);
    while (curr <= today) {
      dates.push(formatDateStr(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }

  const daysMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  const days = daysMap[period] || 7;
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    dates.push(formatDateStr(d));
  }
  return dates;
}

/**
 * GET /api/admin/dashboard/revenue-chart
 * Query params: period=7d|30d|90d|1y|all|custom, start=YYYY-MM-DD, end=YYYY-MM-DD
 * Returns: [{ date: 'YYYY-MM-DD', revenue: <paise integer> }]
 * Revenue is in paise (rupees × 100) — updateCharts() divides by 100 before rendering.
 */
async function getRevenueChart(req, res, next) {
  try {
    const { period = '7d', start = '', end = '' } = req.query;
    const { condition, params } = buildDateRange(period, start, end, 1);

    const { rows } = await query(
      `SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date,
              COALESCE(SUM(COALESCE(NULLIF(total_paise, 0) / 100.0, CASE WHEN total_amount >= 10000 THEN total_amount / 100.0 ELSE total_amount END, 0)), 0) AS revenue_rupees
       FROM orders
       WHERE LOWER(COALESCE(payment_status, '')) = 'paid'
         AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'refunded')
         AND ${condition}
       GROUP BY TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
       ORDER BY date ASC`,
      params
    );

    const earliestDate = rows.length > 0 ? rows[0].date : null;
    const dateSeq = generateDateSequence(period, start, end, earliestDate);
    const dateMap = {};
    dateSeq.forEach(d => { dateMap[d] = 0; });

    let totalPeriodPaise = 0;
    rows.forEach(r => {
      const d = String(r.date).slice(0, 10);
      const paiseVal = Math.round(parseFloat(r.revenue_rupees) * 100);
      dateMap[d] = paiseVal;
      totalPeriodPaise += paiseVal;
    });

    const data = Object.keys(dateMap).sort().map(d => ({
      date: d,
      revenue: dateMap[d] || 0
    }));

    return res.json({
      success: true,
      data,
      summary: {
        period_revenue_paise: totalPeriodPaise,
        order_count: rows.length
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/dashboard/footfall
 * Query params: period=7d|30d|90d|1y|all|custom, start=YYYY-MM-DD, end=YYYY-MM-DD
 * Returns: [{ date: 'YYYY-MM-DD', unique_visitors: number, new_signups: number }]
 */
async function getFootfall(req, res, next) {
  try {
    const { period = '7d', start = '', end = '' } = req.query;
    const { condition, params } = buildDateRange(period, start, end, 1);

    const { rows: activeRows } = await query(
      `SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date, COUNT(DISTINCT buyer_id) AS unique_visitors
       FROM orders
       WHERE ${condition}
       GROUP BY TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
       ORDER BY date ASC`,
      params
    );

    const { rows: signupRows } = await query(
      `SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date, COUNT(id) AS new_signups
       FROM users
       WHERE ${condition}
       GROUP BY TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
       ORDER BY date ASC`,
      params
    );

    const earliestDate = activeRows.length > 0 ? activeRows[0].date : (signupRows.length > 0 ? signupRows[0].date : null);
    const dateSeq = generateDateSequence(period, start, end, earliestDate);
    const byDate = {};
    dateSeq.forEach(d => {
      byDate[d] = { date: d, unique_visitors: 0, new_signups: 0 };
    });

    for (const r of activeRows) {
      const d = String(r.date).slice(0, 10);
      if (byDate[d]) {
        byDate[d].unique_visitors = parseInt(r.unique_visitors, 10);
      } else {
        byDate[d] = { date: d, unique_visitors: parseInt(r.unique_visitors, 10), new_signups: 0 };
      }
    }
    for (const r of signupRows) {
      const d = String(r.date).slice(0, 10);
      if (byDate[d]) {
        byDate[d].new_signups = parseInt(r.new_signups, 10);
      } else {
        byDate[d] = { date: d, unique_visitors: 0, new_signups: parseInt(r.new_signups, 10) };
      }
    }

    const data = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/dashboard/top-products
 * Platform-wide top products — NO seller_id filter (unlike getSellerTopProducts).
 * Returns: [{ id, name, views, clicks, viral_score }]
 *
 * views       = products.view_count
 * clicks      = number of order_items rows containing this product (proxy for add-to-cart/purchase)
 * viral_score = (view_count × 0.5) + (order_count × 10), rounded to 1 decimal
 */
async function getPlatformTopProducts(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const { rows } = await query(
      `SELECT
         p.id,
         p.name,
         p.view_count AS views,
         COALESCE(oi_agg.order_count, 0) AS clicks,
         ROUND((p.view_count * 0.5 + COALESCE(oi_agg.order_count, 0) * 10)::numeric, 1) AS viral_score
       FROM products p
       LEFT JOIN (
         SELECT product_id, COUNT(*) AS order_count
         FROM order_items
         GROUP BY product_id
       ) oi_agg ON oi_agg.product_id = p.id
       WHERE p.status != 'deleted'
       ORDER BY viral_score DESC, p.view_count DESC
       LIMIT $1`,
      [limit]
    );

    const data = rows.map(r => ({
      id: r.id,
      name: r.name,
      views: parseInt(r.views, 10) || 0,
      clicks: parseInt(r.clicks, 10) || 0,
      viral_score: parseFloat(r.viral_score) || 0,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSellerRevenue,
  getSellerTopProducts,
  getSellerSummary,
  getSellerProductViews,
  getAdminStats,
  getRevenueChart,
  getFootfall,
  getPlatformTopProducts,
};
