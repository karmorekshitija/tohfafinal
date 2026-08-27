/**
 * Tohfa v2 — Coupon Controller
 * File: backend/src/controllers/coupon.controller.js
 * Role: Promo code validation, discount computation, and active coupon discovery.
 */
'use strict';

const { query } = require('../config/db');

// Built-in fallback coupons for instant availability & seeding
const STATIC_COUPONS = [
  {
    id: 1,
    code: 'WELCOME10',
    discount_type: 'percentage',
    discount_value: 10.00,
    min_order_amount: 500.00,
    max_discount_amount: 200.00,
    usage_limit_per_user: 1,
    is_active: true,
    description: 'Get 10% off on your handcrafted orders above ₹500 (Max ₹200)',
    starts_at: new Date('2024-01-01'),
    expires_at: new Date('2030-12-31')
  },
  {
    id: 2,
    code: 'TOHFA100',
    discount_type: 'flat',
    discount_value: 100.00,
    min_order_amount: 999.00,
    max_discount_amount: 100.00,
    usage_limit_per_user: 1,
    is_active: true,
    description: 'Flat ₹100 off on artisan orders above ₹999',
    starts_at: new Date('2024-01-01'),
    expires_at: new Date('2030-12-31')
  },
  {
    id: 3,
    code: 'ARTISAN20',
    discount_type: 'percentage',
    discount_value: 20.00,
    min_order_amount: 1500.00,
    max_discount_amount: 500.00,
    usage_limit_per_user: 1,
    is_active: true,
    description: '20% off on studio creations above ₹1,500 (Max ₹500)',
    starts_at: new Date('2024-01-01'),
    expires_at: new Date('2030-12-31')
  },
  {
    id: 4,
    code: 'FIRSTGIFT',
    discount_type: 'flat',
    discount_value: 50.00,
    min_order_amount: 299.00,
    max_discount_amount: 50.00,
    usage_limit_per_user: 1,
    is_active: true,
    description: 'Flat ₹50 off on your first handcrafted gift',
    starts_at: new Date('2024-01-01'),
    expires_at: new Date('2030-12-31')
  }
];

/**
 * Calculate coupon discount helper
 */
function calculateDiscount(coupon, orderAmount) {
  const amt = Number(orderAmount) || 0;
  const val = Number(coupon.discount_value) || 0;
  let discountAmount = 0;

  if (coupon.discount_type === 'percentage') {
    discountAmount = (amt * val) / 100;
    if (coupon.max_discount_amount && Number(coupon.max_discount_amount) > 0) {
      discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
    }
  } else if (coupon.discount_type === 'flat') {
    discountAmount = Math.min(val, amt);
  }

  discountAmount = parseFloat(discountAmount.toFixed(2));
  const finalAmount = parseFloat(Math.max(0, amt - discountAmount).toFixed(2));

  return {
    discountAmount,
    finalAmount,
  };
}

/**
 * POST /api/coupons/apply & POST /api/coupon/verify
 */
async function applyCoupon(req, res, next) {
  try {
    const rawCode = req.body.code || req.body.coupon_code || req.body.coupon || req.body.promo_code;
    const rawAmount = req.body.order_amount ?? req.body.amount ?? req.body.cart_total ?? req.body.total_amount ?? req.body.subtotal;

    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code is required.',
      });
    }

    const orderAmount = parseFloat(rawAmount) || 0;
    const cleanCode = rawCode.trim().toUpperCase();

    let coupon = null;

    // 1. Try DB lookup
    try {
      const { rows } = await query(
        `SELECT * FROM coupons
         WHERE UPPER(code) = $1
           AND is_active = TRUE
           AND starts_at <= NOW()
           AND expires_at >= NOW()`,
        [cleanCode]
      );
      if (rows.length > 0) {
        coupon = rows[0];
      }
    } catch (dbErr) {
      // If table doesn't exist yet, fall back to static list
    }

    // 2. Fall back to static catalogue if not found in DB
    if (!coupon) {
      const now = new Date();
      coupon = STATIC_COUPONS.find(c =>
        c.code.toUpperCase() === cleanCode &&
        c.is_active &&
        new Date(c.starts_at) <= now &&
        new Date(c.expires_at) >= now
      );
    }

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired coupon code.',
      });
    }

    // SEC-03: Check per-user usage limit (only for DB coupons that have a coupon.id and buyer is logged in)
    if (coupon.id && req.user && coupon.usage_limit_per_user) {
      try {
        const { rows: usageRows } = await query(
          `SELECT COUNT(*) AS use_count
           FROM orders
           WHERE coupon_id = $1
             AND (user_id = $2 OR buyer_id = $2)
             AND payment_status != 'failed'`,
          [coupon.id, req.user.id]
        );
        const usedCount = parseInt(usageRows[0]?.use_count || 0, 10);
        if (usedCount >= coupon.usage_limit_per_user) {
          return res.status(400).json({
            success: false,
            message: `You have already used this coupon ${usedCount} time(s). Maximum allowed: ${coupon.usage_limit_per_user}.`,
          });
        }
      } catch (usageErr) {
        // If usage check fails (e.g., orders table not accessible), allow coupon but log
        console.warn('[Coupon] Per-user usage check failed (non-fatal):', usageErr.message);
      }
    }

    // Check minimum order amount
    const minOrderAmt = parseFloat(coupon.min_order_amount || 0);
    if (orderAmount < minOrderAmt) {
      return res.status(400).json({
        success: false,
        message: `This coupon requires a minimum order amount of ₹${minOrderAmt.toLocaleString('en-IN')}.`,
      });
    }

    const { discountAmount, finalAmount } = calculateDiscount(coupon, orderAmount);

    // SEC-03: Increment global usage counter for DB-tracked coupons
    if (coupon.id) {
      query(
        `UPDATE coupons SET times_used = COALESCE(times_used, 0) + 1 WHERE id = $1`,
        [coupon.id]
      ).catch(err => console.warn('[Coupon] Failed to increment times_used:', err.message));
    }

    return res.json({
      success: true,
      data: {
        valid: true,
        coupon_id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: parseFloat(coupon.discount_value),
        discount_amount: discountAmount,
        discount: discountAmount,
        final_amount: finalAmount,
        order_amount: orderAmount,
        min_order_amount: minOrderAmt,
        max_discount_amount: coupon.max_discount_amount ? parseFloat(coupon.max_discount_amount) : null,
        message: 'Coupon applied successfully',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/coupons & GET /api/coupon
 * List all active public coupons
 */
async function listCoupons(req, res, next) {
  try {
    let coupons = [];

    try {
      const { rows } = await query(
        `SELECT id, code, discount_type, discount_value, min_order_amount,
                max_discount_amount, usage_limit_per_user, starts_at, expires_at, is_active, created_at
         FROM coupons
         WHERE is_active = TRUE
           AND starts_at <= NOW()
           AND expires_at >= NOW()
         ORDER BY discount_value DESC`
      );
      if (rows.length > 0) {
        coupons = rows;
      }
    } catch (dbErr) {
      // Fallback
    }

    if (!coupons.length) {
      coupons = STATIC_COUPONS;
    }

    const formattedCoupons = coupons.map(c => ({
      id: c.id,
      code: c.code,
      discount_type: c.discount_type,
      discount_value: parseFloat(c.discount_value),
      min_order_amount: parseFloat(c.min_order_amount || 0),
      max_discount_amount: c.max_discount_amount ? parseFloat(c.max_discount_amount) : null,
      description: c.description || (c.discount_type === 'percentage'
        ? `${parseFloat(c.discount_value)}% OFF on orders above ₹${parseFloat(c.min_order_amount || 0)}`
        : `₹${parseFloat(c.discount_value)} FLAT OFF on orders above ₹${parseFloat(c.min_order_amount || 0)}`),
      starts_at: c.starts_at,
      expires_at: c.expires_at,
      is_active: c.is_active,
    }));

    return res.json({
      success: true,
      data: {
        coupons: formattedCoupons,
        total: formattedCoupons.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  applyCoupon,
  verifyCoupon: applyCoupon,
  listCoupons,
  calculateDiscount,
  STATIC_COUPONS,
};
