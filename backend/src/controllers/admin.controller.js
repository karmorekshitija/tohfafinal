/**
 * Tohfa v2 â€” Master Admin Controller
 * File: backend/src/controllers/admin.controller.js
 * Role: Full platform governance, catalog curation, dispute resolution,
 *       and immutable audit logging for Super Admins.
 */
'use strict';

const db = require('../config/db');
const { query } = db;
const emailService = require('../services/email.service');
const paymentService = require('../services/payment.service');
const bestsellerService = require('../services/bestseller.service');
const { logAdminAction } = require('../services/audit.service');
const { createNotification } = require('./notification.controller');
const { slugify, isReservedSlug } = require('../utils/slug');

// ---------------------------------------------------------------------------
// 1. DASHBOARD & LIVE PLATFORM STATS
// ---------------------------------------------------------------------------

async function getPlatformStats(req, res, next) {
  try {
    const stats = await query(`
      SELECT 
        COALESCE(SUM(COALESCE(o.total_paise / 100.0, CASE WHEN o.total_amount >= 10000 THEN o.total_amount / 100.0 ELSE o.total_amount END, 0)), 0) AS total_gmv,
        COALESCE(SUM(CASE WHEN LOWER(o.status) = 'delivered' THEN COALESCE(o.total_paise / 100.0, CASE WHEN o.total_amount >= 10000 THEN o.total_amount / 100.0 ELSE o.total_amount END, 0) * 0.10 ELSE 0 END), 0) AS net_platform_revenue,
        (SELECT COUNT(*) FROM users WHERE role = 'buyer') AS total_buyers,
        (SELECT COUNT(*) FROM seller_profiles WHERE is_approved::text IN ('true', 't', '1') OR verification_status = 'verified') AS active_artisans,
        (SELECT COUNT(*) FROM seller_profiles WHERE (is_approved IS NULL OR is_approved::text IN ('false', 'f', '0')) AND rejection_reason IS NULL) AS pending_kyc_count,
        (SELECT COUNT(*) FROM orders WHERE LOWER(COALESCE(payment_status, '')) = 'paid' AND LOWER(COALESCE(status, '')) NOT IN ('delivered', 'cancelled', 'refunded')) AS active_orders_in_fulfillment,
        (SELECT COUNT(*) FROM seller_profiles WHERE is_admin_managed::text IN ('true', 't', '1')) AS tohfa_specials_count
      FROM orders o
      WHERE LOWER(COALESCE(o.payment_status, '')) = 'paid'
    `);

    const row = stats.rows[0] || {};
    return res.status(200).json({
      success: true,
      data: {
        total_gmv: parseFloat(parseFloat(row.total_gmv || 0).toFixed(2)),
        net_platform_revenue: parseFloat(parseFloat(row.net_platform_revenue || 0).toFixed(2)),
        total_buyers: parseInt(row.total_buyers || 0, 10),
        active_artisans: parseInt(row.active_artisans || 0, 10),
        pending_kyc_count: parseInt(row.pending_kyc_count || 0, 10),
        active_orders_in_fulfillment: parseInt(row.active_orders_in_fulfillment || 0, 10),
        tohfa_specials_count: parseInt(row.tohfa_specials_count || 0, 10)
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 2. SELLER KYC & GOVERNANCE
// ---------------------------------------------------------------------------

async function listSellers(req, res, next) {
  try {
    const { status = 'all', search, page = 1, limit = 50, per_page } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(per_page || limit, 10));
    const offset = (pageNum - 1) * limitNum;

    let baseSql = `
      FROM users u
      LEFT JOIN seller_profiles sp ON sp.user_id = u.id
      LEFT JOIN sellers s ON s.user_id = u.id
      WHERE u.role = 'seller'
    `;
    const params = [];

    if (status === 'pending') {
      baseSql += ` AND ((COALESCE(sp.is_approved::text, s.is_approved::text, 'false') IN ('false', 'f', '0')) AND sp.rejection_reason IS NULL AND s.rejection_reason IS NULL AND u.is_active = TRUE)`;
    } else if (status === 'active' || status === 'verified' || status === 'approved') {
      baseSql += ` AND ((COALESCE(sp.is_approved::text, s.is_approved::text, 'false') IN ('true', 't', '1') OR COALESCE(sp.verification_status, s.verification_status) = 'verified') AND u.is_active = TRUE)`;
    } else if (status === 'rejected') {
      baseSql += ` AND ((COALESCE(sp.is_approved::text, s.is_approved::text, 'false') IN ('false', 'f', '0')) AND (sp.rejection_reason IS NOT NULL OR s.rejection_reason IS NOT NULL))`;
    } else if (status === 'banned') {
      baseSql += ` AND u.is_active = FALSE`;
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      baseSql += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR sp.store_name ILIKE $${params.length} OR s.store_name ILIKE $${params.length})`;
    }

    const countRes = await query(`SELECT COUNT(*) AS total ${baseSql}`, params);
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    const selectSql = `
      SELECT u.id, u.name, u.email, u.phone, u.profile_photo_url, u.is_active,
             COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
             COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS shop_name,
             COALESCE(sp.seller_type, 'Artisan') AS seller_type,
             (COALESCE(sp.is_approved::text, s.is_approved::text, 'false') IN ('true', 't', '1')) AS is_approved,
             COALESCE(sp.pickup_address, s.pickup_address, '{}'::jsonb) AS pickup_address,
             COALESCE(sp.bank_details, s.bank_details, '{}'::jsonb) AS bank_details,
             COALESCE(sp.onboarding_completed, s.onboarding_completed, FALSE) AS onboarding_completed,
             COALESCE(sp.daily_capacity_min, s.daily_capacity_min) AS daily_capacity_min,
             COALESCE(sp.daily_capacity_max, s.daily_capacity_max) AS daily_capacity_max,
             COALESCE(sp.instagram_handle, s.instagram_handle) AS instagram_handle,
             COALESCE(sp.instagram_followers, s.instagram_followers) AS instagram_followers,
             COALESCE(sp.pan_number, s.pan_number) AS pan_number,
             COALESCE(sp.gst_number, s.gst_number) AS gst_number,
             COALESCE(sp.portfolio_images, s.portfolio_images, '{}'::text[]) AS portfolio_images,
             COALESCE(sp.verification_status, s.verification_status, CASE WHEN sp.is_approved::text IN ('true', 't', '1') OR s.is_approved::text IN ('true', 't', '1') THEN 'verified' WHEN sp.rejection_reason IS NOT NULL OR s.rejection_reason IS NOT NULL THEN 'rejected' ELSE 'pending_verification' END) AS verification_status,
             COALESCE(sp.commission_rate, s.commission_rate, 10.00) AS commission_rate,
             COALESCE(sp.applied_at, s.applied_at, u.created_at) AS applied_at,
             COALESCE(sp.approved_at, s.approved_at) AS approved_at,
             COALESCE(sp.rejection_reason, s.rejection_reason) AS rejection_reason,
             (COALESCE(sp.is_admin_managed::text, s.is_admin_managed::text, 'false') IN ('true', 't', '1')) AS is_admin_managed,
             COALESCE(sp.subscription_plan, s.subscription_plan, 'basic') AS subscription_plan,
             COALESCE(sp.subscription_status, s.subscription_status, 'active') AS subscription_status,
             COALESCE(sp.subscription_renews_at, s.subscription_renews_at) AS subscription_renews_at,
             COALESCE(sp.subscription_price_paid, s.subscription_price_paid, 0.00) AS subscription_price_paid,
             COALESCE(sp.subscription_plan, s.subscription_plan, 'basic') AS subscription_plan,
             COALESCE(sp.subscription_status, s.subscription_status, 'active') AS subscription_status,
             COALESCE(sp.subscription_renews_at, s.subscription_renews_at) AS subscription_renews_at,
             COALESCE(sp.subscription_price_paid, s.subscription_price_paid, 0.00) AS subscription_price_paid,
             (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status != 'deleted') AS product_count,
             (SELECT COALESCE(SUM(so.subtotal), 0) FROM seller_orders so JOIN orders o ON o.id = so.order_id WHERE so.seller_id = u.id AND o.payment_status = 'paid') AS total_revenue,
             (SELECT MAX(so2.created_at) FROM seller_orders so2 JOIN orders o2 ON o2.id = so2.order_id WHERE so2.seller_id = u.id AND o2.payment_status = 'paid') AS last_order_at
      ${baseSql}
      ORDER BY COALESCE(sp.applied_at, s.applied_at, u.created_at) DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limitNum, offset);

    const { rows } = await query(selectSql, params);
    return res.json({ 
      success: true, 
      data: {
        sellers: rows,
        total,
        page: pageNum,
        per_page: limitNum,
        total_pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getSellerDetail(req, res, next) {
  try {
    const sellerId = req.params.sellerId || req.params.id;
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.profile_photo_url, u.cover_photo_url, u.is_active,
              COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
              COALESCE(sp.bio, s.bio, '') AS bio,
              COALESCE(sp.whatsapp_number, s.whatsapp_number, u.phone) AS whatsapp_number,
              COALESCE(sp.seller_type, 'Artisan') AS seller_type,
              (COALESCE(sp.is_approved::text, s.is_approved::text, 'false') IN ('true', 't', '1')) AS is_approved,
              (COALESCE(sp.is_admin_managed::text, s.is_admin_managed::text, 'false') IN ('true', 't', '1')) AS is_admin_managed,
              COALESCE(sp.pickup_address, s.pickup_address, '{}'::jsonb) AS pickup_address,
              COALESCE(sp.bank_details, s.bank_details, '{}'::jsonb) AS bank_details,
              COALESCE(sp.onboarding_completed, s.onboarding_completed, FALSE) AS onboarding_completed,
              COALESCE(sp.daily_capacity_min, s.daily_capacity_min) AS daily_capacity_min,
              COALESCE(sp.daily_capacity_max, s.daily_capacity_max) AS daily_capacity_max,
              COALESCE(sp.instagram_handle, s.instagram_handle) AS instagram_handle,
              COALESCE(sp.instagram_followers, s.instagram_followers) AS instagram_followers,
              COALESCE(sp.pan_number, s.pan_number) AS pan_number,
              COALESCE(sp.gst_number, s.gst_number) AS gst_number,
              COALESCE(sp.portfolio_images, s.portfolio_images, '{}'::text[]) AS portfolio_images,
              COALESCE(sp.verification_status, s.verification_status, CASE WHEN sp.is_approved::text IN ('true', 't', '1') OR s.is_approved::text IN ('true', 't', '1') THEN 'verified' WHEN sp.rejection_reason IS NOT NULL OR s.rejection_reason IS NOT NULL THEN 'rejected' ELSE 'pending_verification' END) AS verification_status,
              COALESCE(sp.commission_rate, s.commission_rate, 10.00) AS commission_rate,
              COALESCE(sp.applied_at, s.applied_at, u.created_at) AS applied_at,
              COALESCE(sp.approved_at, s.approved_at) AS approved_at,
              COALESCE(sp.rejection_reason, s.rejection_reason) AS rejection_reason,
              (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status != 'deleted') AS product_count,
              (SELECT COALESCE(SUM(so.subtotal), 0) FROM seller_orders so JOIN orders o ON o.id = so.order_id WHERE so.seller_id = u.id AND o.payment_status = 'paid') AS total_revenue,
              (SELECT MAX(so2.created_at) FROM seller_orders so2 JOIN orders o2 ON o2.id = so2.order_id WHERE so2.seller_id = u.id AND o2.payment_status = 'paid') AS last_order_at
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE u.id::text = $1::text OR sp.id::text = $1::text OR s.id::text = $1::text
       ORDER BY CASE 
         WHEN u.id::text = $1::text AND (sp.id IS NOT NULL OR s.id IS NOT NULL) THEN 1
         WHEN u.id::text = $1::text THEN 2
         WHEN sp.id::text = $1::text THEN 3
         WHEN s.id::text = $1::text THEN 4
         ELSE 5 
       END ASC
       LIMIT 1`,
      [String(sellerId)]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Seller not found.' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function verifySellerKyc(req, res, next) {
  const id = req.params.id || req.params.sellerId;
  let { status, action, remarks, rejectionReason, rejection_reason, reason, commissionRate, commission_rate } = req.body;

  let normStatus = (status || action || '').toString().toUpperCase();
  if (['APPROVE', 'APPROVED', 'VERIFIED'].includes(normStatus)) {
    normStatus = 'VERIFIED';
  } else if (['REJECT', 'REJECTED'].includes(normStatus)) {
    normStatus = 'REJECTED';
  }

  if (!['VERIFIED', 'REJECTED'].includes(normStatus)) {
    return res.status(400).json({ success: false, message: 'Invalid verification status' });
  }

  const isApproved = normStatus === 'VERIFIED';
  const sellerStatus = isApproved ? 'APPROVED' : 'REJECTED';
  const kycRemarks = remarks || rejectionReason || rejection_reason || reason || null;
  const finalCommission = commissionRate !== undefined ? commissionRate : commission_rate;

  try {
    // Safely pre-ensure wallet row exists for approved sellers to satisfy fk_seller_wallet constraint
    if (isApproved) {
      await query(
        `INSERT INTO wallets (seller_id, user_id, balance, created_at, updated_at)
         SELECT s.id, s.user_id, 0.00, NOW(), NOW()
         FROM sellers s
         WHERE s.id::text = $1::text OR s.user_id::text = $1::text
         ON CONFLICT (seller_id) DO NOTHING;`,
        [String(id)]
      ).catch(async () => {
        await query(
          `INSERT INTO wallets (seller_id, balance, created_at, updated_at)
           VALUES ($1, 0.00, NOW(), NOW())
           ON CONFLICT DO NOTHING;`,
          [String(id)]
        ).catch(() => {});
      });
    }

    // Update seller KYC and approval status atomically in sellers table
    const { rows: updatedSellers } = await query(
      `UPDATE sellers 
       SET kyc_status = $1::varchar, 
           is_approved = $2::boolean, 
           status = $3::varchar, 
           verification_status = CASE WHEN $1::text = 'VERIFIED' THEN 'verified' ELSE 'rejected' END,
           kyc_remarks = COALESCE($4::text, kyc_remarks),
           rejection_reason = CASE WHEN $1::text = 'REJECTED' THEN COALESCE($4::text, rejection_reason) ELSE NULL END,
           commission_rate = COALESCE($5::numeric, commission_rate),
           verified_at = CASE WHEN $1::text = 'VERIFIED' THEN NOW() ELSE NULL END,
           approved_at = CASE WHEN $1::text = 'VERIFIED' THEN NOW() ELSE approved_at END,
           updated_at = NOW() 
       WHERE id::text = $6::text OR user_id::text = $6::text 
       RETURNING *;`,
      [normStatus, isApproved, sellerStatus, kycRemarks, finalCommission !== undefined && finalCommission !== null ? Number(finalCommission) : null, String(id)]
    );

    let sellerRecord = updatedSellers[0];

    if (!sellerRecord) {
      // Fallback: check seller_profiles or users table
      const { rows: profiles } = await query(
        `UPDATE seller_profiles
         SET is_approved = $1,
             verification_status = CASE WHEN $1 THEN 'verified' ELSE 'rejected' END,
             rejection_reason = CASE WHEN NOT $1 THEN $2 ELSE NULL END,
             commission_rate = COALESCE($3, commission_rate),
             approved_at = CASE WHEN $1 THEN NOW() ELSE approved_at END,
             updated_at = NOW()
         WHERE id::text = $4::text OR user_id::text = $4::text
         RETURNING *;`,
        [isApproved, kycRemarks, finalCommission !== undefined && finalCommission !== null ? Number(finalCommission) : null, String(id)]
      );

      if (profiles.length === 0) {
        return res.status(404).json({ success: false, message: 'Seller not found' });
      }
      sellerRecord = profiles[0];
    } else {
      // Sync seller_profiles table in parallel
      await query(
        `UPDATE seller_profiles
         SET is_approved = $1,
             verification_status = CASE WHEN $1 THEN 'verified' ELSE 'rejected' END,
             rejection_reason = CASE WHEN NOT $1 THEN $2 ELSE NULL END,
             commission_rate = COALESCE($3, commission_rate),
             approved_at = CASE WHEN $1 THEN NOW() ELSE approved_at END,
             updated_at = NOW()
         WHERE id::text = $4::text OR user_id::text = $4::text;`,
        [isApproved, kycRemarks, finalCommission !== undefined && finalCommission !== null ? Number(finalCommission) : null, String(id)]
      ).catch(() => {});
    }

    const userId = sellerRecord.user_id || sellerRecord.id;
    const sellerTableId = sellerRecord.id;

    // Ensure user role and status
    if (isApproved && userId) {
      await query(
        `UPDATE users SET is_active = TRUE, role = 'seller', updated_at = NOW() WHERE id::text = $1::text;`,
        [String(userId)]
      ).catch(() => {});
    }

    // Safely ensure wallet exists for newly verified sellers
    if (isApproved) {
      const targetSellerIdForWallet = sellerTableId || id;
      await query(
        `INSERT INTO wallets (seller_id, user_id, balance, created_at, updated_at)
         VALUES ($1, $2, 0.00, NOW(), NOW())
         ON CONFLICT (seller_id) DO NOTHING;`,
        [targetSellerIdForWallet, userId || null]
      ).catch(async () => {
        await query(
          `INSERT INTO wallets (seller_id, balance, created_at, updated_at)
           VALUES ($1, 0.00, NOW(), NOW())
           ON CONFLICT DO NOTHING;`,
          [targetSellerIdForWallet]
        ).catch(() => {});
      });
    }

    // Send emails & notifications
    if (isApproved && userId) {
      const { rows: userRows } = await query('SELECT name, email FROM users WHERE id::text = $1::text', [String(userId)]).catch(() => ({ rows: [] }));
      const sellerUser = userRows[0] || {};
      const storeName = sellerRecord.store_name || 'Artisan Studio';
      await emailService.sendSellerApprovalEmail(sellerUser.email, storeName).catch(() => {});
      await createNotification(
        userId,
        'seller_approved',
        'Welcome to Tohfa Studio! 🎉',
        'Your artisan KYC application has been verified and approved. You can now publish handcrafted creations.'
      ).catch(() => {});
    } else if (normStatus === 'REJECTED' && userId) {
      const { rows: userRows } = await query('SELECT name, email FROM users WHERE id::text = $1::text', [String(userId)]).catch(() => ({ rows: [] }));
      const sellerUser = userRows[0] || {};
      const storeName = sellerRecord.store_name || 'Artisan Studio';
      await emailService.sendSellerRejectionEmail(sellerUser.email, storeName, kycRemarks).catch(() => {});
      await createNotification(
        userId,
        'seller_rejected',
        'Seller Application Update',
        `Your seller verification application was not approved. Reason: ${kycRemarks || 'Application criteria not met'}`
      ).catch(() => {});
    }

    if (req.user?.id) {
      await logAdminAction({
        adminId: req.user.id,
        actionType: isApproved ? 'SELLER_KYC_APPROVED' : 'SELLER_KYC_REJECTED',
        targetEntity: 'sellers',
        targetId: id,
        details: { status: normStatus, commissionRate: finalCommission, remarks: kycRemarks },
        ipAddress: req.ip
      }).catch(() => {});
    }

    return res.json({
      success: true,
      message: `Seller KYC has been successfully ${normStatus.toLowerCase()}`,
      data: sellerRecord
    });
  } catch (error) {
    console.error('Error verifying seller KYC:', error);
    return res.status(500).json({ success: false, message: 'Internal server error while updating KYC' });
  }
}

const verifySellerKYC = verifySellerKyc;

async function suspendSeller(req, res, next) {
  try {
    const sellerId = req.params.sellerId || req.params.id;
    const reason = req.body.reason || req.body.ban_reason || 'Administrative suspension';

    // Resolve target user_id with priority given to direct user ID matches
    const userRes = await query(
      `SELECT u.id
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE u.id::text = $1::text OR sp.id::text = $1::text OR s.id::text = $1::text
       ORDER BY CASE 
         WHEN u.id::text = $1::text AND (sp.id IS NOT NULL OR s.id IS NOT NULL) THEN 1
         WHEN u.id::text = $1::text THEN 2
         WHEN sp.id::text = $1::text THEN 3
         WHEN s.id::text = $1::text THEN 4
         ELSE 5 
       END ASC
       LIMIT 1`,
      [String(sellerId)]
    );

    const targetUserId = userRes.rows[0]?.id || sellerId;

    await query('UPDATE users SET is_active = 0 WHERE id::text = $1', [String(targetUserId)])
      .catch(() => {});

    await query("UPDATE seller_profiles SET verification_status = 'suspended', is_approved = 0, updated_at = NOW() WHERE user_id::text = $1", [String(targetUserId)])
      .catch(() => {});

    await query("UPDATE sellers SET verification_status = 'suspended', is_approved = 0 WHERE user_id::text = $1", [String(targetUserId)])
      .catch(() => {});

    await query("UPDATE products SET status = 'paused' WHERE seller_id::text = $1", [String(targetUserId)])
      .catch(() => {});

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'SELLER_SUSPENDED',
      targetEntity: 'sellers',
      targetId: targetUserId,
      details: { reason },
      ipAddress: req.ip
    });

    return res.status(200).json({ success: true, message: 'Seller suspended and products paused.' });
  } catch (err) {
    next(err);
  }
}


// Backward-compatible approval / rejection helpers
async function approveSeller(req, res, next) {
  req.body.status = 'verified';
  return verifySellerKYC(req, res, next);
}

async function rejectSeller(req, res, next) {
  req.body.status = 'rejected';
  req.body.rejectionReason = req.body.reason || req.body.admin_notes || 'Application criteria not met';
  return verifySellerKYC(req, res, next);
}

async function banSeller(req, res, next) {
  return suspendSeller(req, res, next);
}

// ---------------------------------------------------------------------------
// 4. EMERGENCY REFUND & ORDER OVERRIDE
// ---------------------------------------------------------------------------

async function forceRefundOrder(req, res, next) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { reason = 'Administrative Emergency Refund', refundAmount, refund_amount } = req.body;
    const finalRefundAmt = refundAmount || refund_amount;

    const orderRes = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = orderRes.rows[0];

    // Find payment record
    const payRes = await query(
      "SELECT * FROM payments WHERE order_id = $1 AND status = 'paid' ORDER BY created_at DESC LIMIT 1",
      [orderId]
    );
    const payment = payRes.rows[0];
    const paymentId = payment?.razorpay_payment_id || order.payment_id;

    const refundPaise = finalRefundAmt
      ? Math.round(Number(finalRefundAmt) * 100)
      : Math.round(Number(order.total_amount) * 100);

    let rzpRefundId = `rfnd_${Date.now()}`;

    if (paymentId) {
      try {
        const refundResult = await paymentService.refundPayment(
          paymentId,
          finalRefundAmt || order.total_amount,
          {
            reason: `Admin Forced Refund: ${reason}`,
            order_id: orderId
          },
          payment?.gateway_account || 'primary'
        );
        if (refundResult && refundResult.id) {
          rzpRefundId = refundResult.id;
        }
      } catch (rzpErr) {
        console.warn('[Razorpay API Warning]:', rzpErr.message);
      }
    }

    // Update order status
    await query(`
      UPDATE orders 
      SET payment_status = 'refunded', status = 'cancelled', cancellation_reason = $1, updated_at = NOW() 
      WHERE id = $2
    `, [`Admin Forced Refund: ${reason}`, orderId]);

    // Update payments record
    if (payment) {
      await query("UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE id = $1", [payment.id]);
    }

    // Restock product inventory
    await query(`
      UPDATE products p
      SET stock_quantity = p.stock_quantity + oi.quantity, updated_at = NOW()
      FROM order_items oi
      WHERE oi.order_id = $1 AND p.id = oi.product_id
    `, [orderId]).catch(() => {});

    bestsellerService.recomputeForOrder(orderId).catch(e => console.error('[Bestseller Recompute Error]:', e.message));

    // Notify buyer & seller
    await createNotification(
      order.buyer_id,
      'refund_approved',
      'Refund Processed by Admin ðŸ’³',
      `An instant refund of â‚¹${(refundPaise / 100).toFixed(2)} for Order #${String(orderId).slice(0, 8).toUpperCase()} has been initiated.`,
      { order_id: orderId, refund_id: rzpRefundId }
    ).catch(() => {});

    await createNotification(
      order.seller_id,
      'refund_processed',
      'Order Refunded by Admin',
      `Order #${String(orderId).slice(0, 8).toUpperCase()} was refunded and cancelled by Admin. Inventory has been restocked.`,
      { order_id: orderId }
    ).catch(() => {});

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'ADMIN_FORCED_REFUND',
      targetEntity: 'orders',
      targetId: orderId,
      details: { refundId: rzpRefundId, amountPaise: refundPaise, reason },
      ipAddress: req.ip
    });

    return res.status(200).json({
      success: true,
      message: 'Refund successfully initiated via Razorpay and order cancelled.',
      refundId: rzpRefundId
    });
  } catch (err) {
    next(err);
  }
}

async function forceUpdateOrderStatus(req, res, next) {
  try {
    const orderId = req.params.orderId || req.params.id;
    const { status, notes = '', delivery_notes = '', buyer_message = '', reason = '' } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'in_production', 'packed', 'shipped', 'dispatched', 'delivered', 'cancelled', 'cancel_requested', 'awaiting_payment'];
    if (status && !validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({ success: false, message: `Invalid status: ${status}. Allowed: ${validStatuses.join(', ')}` });
    }

    const effectiveNote = buyer_message || delivery_notes || notes || reason || '';

    const { rows } = await query(`
      UPDATE orders
      SET status = COALESCE($1::text, status),
          studio_notes = CASE WHEN $2::text != '' THEN $2::text ELSE studio_notes END,
          delivered_at = CASE WHEN $1::text = 'delivered' THEN NOW()::text ELSE delivered_at END,
          updated_at = NOW()
      WHERE id::text = $3::text OR order_ref = $3::text
      RETURNING *, COALESCE(studio_notes, '') AS notes
    `, [status || null, effectiveNote, String(orderId)]);

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const updatedOrder = rows[0];

    // Also update seller_orders if any exist for this order
    if (status) {
      await query(`
        UPDATE seller_orders
        SET status = $1::text,
            delivered_at = CASE WHEN $1::text = 'delivered' THEN NOW()::text ELSE delivered_at END
        WHERE order_id = $2::int
      `, [status, updatedOrder.id]).catch(() => {});

      // Notify buyer
      if (updatedOrder.buyer_id) {
        const statusMessages = {
          confirmed: 'Your order has been confirmed.',
          processing: 'Your order is currently being prepared.',
          in_production: 'Your order is in production with the artisan.',
          packed: 'Your order has been packed and is ready for dispatch.',
          shipped: 'Your order has been shipped! It is on the way.',
          dispatched: 'Your order has been dispatched.',
          delivered: 'Your order has been delivered. Enjoy!',
          cancelled: 'Your order has been cancelled.',
          cancel_requested: 'Cancellation request has been submitted for review.',
        };
        await createNotification(
          updatedOrder.buyer_id,
          'order_status',
          `Order ${status.replace('_', ' ')}`,
          statusMessages[status] || `Your order status has been updated to ${status}.`,
          { order_id: updatedOrder.id, status }
        ).catch(() => {});
      }
    }

    if (status === 'cancelled') {
      bestsellerService.recomputeForOrder(orderId).catch(e => console.error('[Bestseller Recompute Error]:', e.message));
    }

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'ADMIN_ORDER_STATUS_FORCE_UPDATED',
      targetEntity: 'orders',
      targetId: orderId,
      details: { status, notes: effectiveNote },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: `Order status updated to ${status || rows[0].status}.`, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 5. SELLER PAYOUT DISBURSEMENT & FINANCIALS
// ---------------------------------------------------------------------------

async function getPendingPayouts(req, res, next) {
  try {
    const { rows } = await query(`
      SELECT sp.*, u.name AS seller_name, u.email AS seller_email, u.phone AS seller_phone,
             prof.store_name
      FROM seller_payouts sp
      JOIN users u ON u.id = sp.seller_id
      LEFT JOIN seller_profiles prof ON prof.user_id = sp.seller_id
      WHERE sp.status = 'pending' OR sp.status = 'scheduled'
      ORDER BY sp.created_at ASC
    `);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

async function disburseSellerPayout(req, res, next) {
  try {
    const payoutId = req.params.payoutId || req.params.id;
    const { utrNumber, utr_number } = req.body;
    const finalUtr = utrNumber || utr_number || `UTR_${Date.now()}`;

    const payout = await query(`
      UPDATE seller_payouts 
      SET status = 'paid', utr_number = $1, disbursed_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND status IN ('pending', 'scheduled', 'processing')
      RETURNING *
    `, [finalUtr, payoutId]);

    if (payout.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Payout not found or already processed.' });
    }

    const row = payout.rows[0];

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'SELLER_PAYOUT_DISBURSED',
      targetEntity: 'seller_payouts',
      targetId: payoutId,
      details: { utrNumber: row.utr_number, amount: row.amount, sellerId: row.seller_id },
      ipAddress: req.ip
    });

    return res.status(200).json({
      success: true,
      message: 'Payout marked as successfully disbursed.',
      data: row
    });
  } catch (err) {
    next(err);
  }
}

async function listAllPayouts(req, res, next) {
  try {
    const { status = 'all', search = '', page = 1, limit = 10, per_page } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(per_page || limit, 10));
    const offset = (pageNum - 1) * limitNum;

    let baseSql = `
      FROM seller_payouts sp
      JOIN users u ON u.id = sp.seller_id
      LEFT JOIN seller_profiles prof ON prof.user_id = sp.seller_id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      params.push(status.toLowerCase());
      baseSql += ` AND LOWER(sp.status) = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      baseSql += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR prof.store_name ILIKE $${params.length} OR sp.reference ILIKE $${params.length} OR sp.utr_number ILIKE $${params.length})`;
    }

    const countRes = await query(`SELECT COUNT(*) AS total ${baseSql}`, params);
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    const selectSql = `
      SELECT sp.id, sp.seller_id, sp.amount, sp.status, sp.utr_number, sp.reference,
             sp.disbursed_at, sp.created_at, sp.updated_at,
             u.name AS seller_name, u.email AS seller_email, u.phone AS seller_phone,
             COALESCE(prof.store_name, u.name, 'Artisan Studio') AS store_name
      ${baseSql}
      ORDER BY sp.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limitNum, offset);

    const { rows } = await query(selectSql, params);
    return res.json({
      success: true,
      data: {
        payouts: rows,
        total,
        page: pageNum,
        per_page: limitNum,
        total_pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (err) {
    next(err);
  }
}

async function listAllPayments(req, res, next) {
  try {
    const { status = 'all', from_date, to_date, search = '', page = 1, limit = 10, per_page } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(per_page || limit, 10));
    const offset = (pageNum - 1) * limitNum;

    let baseSql = `
      FROM payments p
      LEFT JOIN orders o ON o.id = p.order_id
      LEFT JOIN users u ON u.id = o.buyer_id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      params.push(status.toLowerCase());
      baseSql += ` AND LOWER(p.status) = $${params.length}`;
    }

    if (from_date) {
      params.push(from_date);
      baseSql += ` AND p.created_at >= $${params.length}::timestamptz`;
    }

    if (to_date) {
      params.push(`${to_date} 23:59:59.999Z`);
      baseSql += ` AND p.created_at <= $${params.length}::timestamptz`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      baseSql += ` AND (
        p.razorpay_payment_id ILIKE $${params.length} OR 
        p.razorpay_order_id ILIKE $${params.length} OR 
        o.order_ref ILIKE $${params.length} OR 
        CAST(p.order_id AS TEXT) ILIKE $${params.length} OR 
        u.name ILIKE $${params.length} OR 
        u.email ILIKE $${params.length}
      )`;
    }

    const countRes = await query(`SELECT COUNT(*) AS total ${baseSql}`, params);
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    const selectSql = `
      SELECT p.id, p.order_id, p.razorpay_order_id, p.razorpay_payment_id, p.amount, p.status,
             p.created_at, p.updated_at,
             COALESCE(o.order_ref, 'ORD-' || p.order_id) AS order_ref,
             u.name AS buyer_name, u.email AS buyer_email
      ${baseSql}
      ORDER BY p.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limitNum, offset);

    const { rows } = await query(selectSql, params);
    return res.json({
      success: true,
      data: {
        payments: rows,
        total,
        page: pageNum,
        per_page: limitNum,
        total_pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getPaymentsSummary(req, res, next) {
  try {
    const collectedRes = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total_collected
      FROM payments
      WHERE LOWER(status) = 'paid'
    `);
    const disbursedRes = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total_disbursed
      FROM seller_payouts
      WHERE LOWER(status) IN ('paid', 'completed')
    `);
    const pendingRes = await query(`
      SELECT COALESCE(SUM(amount), 0) AS pending_payout
      FROM seller_payouts
      WHERE LOWER(status) IN ('pending', 'scheduled', 'processing')
    `);

    const totalCollected = parseFloat(collectedRes.rows[0]?.total_collected || 0);
    const totalDisbursed = parseFloat(disbursedRes.rows[0]?.total_disbursed || 0);
    const pendingPayout = parseFloat(pendingRes.rows[0]?.pending_payout || 0);
    const commissionRetained = parseFloat((totalCollected * 0.10).toFixed(2));

    return res.json({
      success: true,
      data: {
        total_collected: totalCollected,
        total_disbursed: totalDisbursed,
        platform_commission: commissionRetained,
        pending_payout: pendingPayout,
        totalCollected,
        totalDisbursed,
        platformCommissionRetained: commissionRetained,
        pendingPayoutAmount: pendingPayout
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 6. USER MODERATION (BAN / ACTIVATE)
// ---------------------------------------------------------------------------

async function getAllUsers(req, res, next) {
  try {
    const { role = 'all', page = 1, limit = 50, per_page, search = '' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(per_page || limit, 10));
    const offset = (pageNum - 1) * limitNum;

    let baseSql = `
      FROM users u
      WHERE 1=1
    `;
    const params = [];

    if (role !== 'all') {
      params.push(role);
      baseSql += ` AND u.role = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      baseSql += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    const countRes = await query(`SELECT COUNT(*) AS total ${baseSql}`, params);
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    const selectSql = `
      SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.created_at,
             (SELECT COUNT(*) FROM orders o WHERE o.buyer_id = u.id) AS order_count
      ${baseSql}
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limitNum, offset);

    const { rows } = await query(selectSql, params);
    return res.json({ 
      success: true, 
      data: {
        users: rows,
        total,
        page: pageNum,
        per_page: limitNum,
        total_pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (err) {
    next(err);
  }
}

async function toggleUserStatus(req, res, next) {
  try {
    const userId = req.params.userId || req.params.id;
    const { isActive, is_active, banReason, reason } = req.body;
    // users.is_active, products.is_active, seller_profiles.is_active are integer on the live DB
    const activeVal = isActive !== undefined ? (isActive ? 1 : 0) : (is_active !== undefined ? (is_active ? 1 : 0) : 0);
    const why = banReason || reason || '';

    const result = await query(`
      UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role, is_active
    `, [activeVal, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!activeVal) {
      await query("UPDATE products SET status = 'paused', is_active = 0 WHERE seller_id = $1", [userId]).catch(() => {});
      await query("UPDATE seller_profiles SET is_active = 0 WHERE user_id = $1", [userId]).catch(() => {});
    }

    await logAdminAction({
      adminId: req.user.id,
      actionType: activeVal ? 'USER_ACTIVATED' : 'USER_BANNED',
      targetEntity: 'users',
      targetId: userId,
      details: { isActive: activeVal, banReason: why },
      ipAddress: req.ip
    });

    return res.status(200).json({
      success: true,
      message: `User ${activeVal ? 'activated' : 'banned'} successfully.`,
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 7. AUDIT LOGS & DIFF INSPECTION
// ---------------------------------------------------------------------------

async function listAuditLogs(req, res, next) {
  try {
    const { event_type, action, actor, from_date, to_date, page = 1, per_page = 20, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(per_page || limit, 10));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    const eventQuery = (event_type || action || '').trim();
    if (eventQuery) {
      const sanitized = eventQuery.replace(/^admin\./i, '').replace(/[\.\-_ ]+/g, '%');
      params.push(`%${eventQuery}%`);
      params.push(`%${sanitized}%`);
      conditions.push(`(al.action_type ILIKE $${params.length - 1} OR al.action_type ILIKE $${params.length} OR al.action ILIKE $${params.length - 1} OR al.action ILIKE $${params.length})`);
    }
    if (actor) {
      params.push(`%${actor}%`);
      conditions.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR CAST(al.admin_id AS TEXT) ILIKE $${params.length})`);
    }
    if (from_date) {
      params.push(from_date);
      conditions.push(`al.created_at >= $${params.length}::timestamptz`);
    }
    if (to_date) {
      params.push(`${to_date} 23:59:59.999Z`);
      conditions.push(`al.created_at <= $${params.length}::timestamptz`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(`
      SELECT COUNT(*) AS total
      FROM audit_logs al
      LEFT JOIN users u ON u.id = COALESCE(al.admin_id, al.actor_id)
      ${where}
    `, params);
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    params.push(limitNum, offset);
    const { rows } = await query(`
      SELECT al.*,
             COALESCE(al.action_type, al.action, 'SYSTEM_EVENT') AS event_type,
             COALESCE(al.action_type, al.action, 'SYSTEM_EVENT') AS event_label,
             COALESCE(al.target_entity, al.target_type, 'entity') AS target_label,
             COALESCE(al.details, al.meta, '{}'::jsonb) AS details_json,
             al.created_at AS timestamp,
             to_char(al.created_at, 'YYYY-MM-DD HH24:MI:SS') AS timestamp_display,
             COALESCE(u.name, 'Admin User') AS actor_name,
             COALESCE(u.role, 'super_admin') AS actor_role,
             u.email AS actor_email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = COALESCE(al.admin_id, al.actor_id)
      ${where}
      ORDER BY al.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const formatted = rows.map(r => {
      const details = typeof r.details_json === 'string' ? JSON.parse(r.details_json) : (r.details_json || {});
      const hasDiff = Boolean(details && Object.keys(details).length > 0);
      return {
        id: r.id,
        event_type: r.event_type,
        event_label: r.event_label,
        actor_name: r.actor_name,
        actor_role: r.actor_role,
        target_label: `${r.target_label} #${String(r.target_id || '').slice(0, 8)}`,
        timestamp: r.timestamp,
        timestamp_display: r.timestamp_display,
        has_diff: hasDiff,
        before_json: null,
        after_json: JSON.stringify(details)
      };
    });

    return res.json({
      success: true,
      data: {
        logs: formatted,
        total,
        page: pageNum,
        per_page: limitNum,
        total_pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 8. PRODUCTS MODERATION & CATEGORIES
// ---------------------------------------------------------------------------

async function listAllProducts(req, res, next) {
  try {
    const { page = 1, per_page = 10, limit = 10, search = '', category_id, filter = 'all' } = req.query;
    const limitNum = parseInt(per_page || limit, 10);
    const pageNum = parseInt(page, 10);
    const offset = (pageNum - 1) * limitNum;

    let sql = `
      SELECT p.*, sp.store_name, c.name AS category_name,
             COALESCE(
               (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order ASC LIMIT 1),
               CASE 
                 WHEN p.images IS NOT NULL AND array_length(p.images, 1) > 0 THEN p.images[1]
                 ELSE NULL
               END
             ) AS primary_image
      FROM products p
      LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status != 'deleted'
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND p.name ILIKE $${params.length}`;
    }
    if (category_id) {
      params.push(category_id);
      sql += ` AND p.category_id = $${params.length}`;
    }
    if (filter === 'sponsored') {
      sql += ` AND p.is_sponsored = TRUE`;
    } else if (filter === 'non_sponsored') {
      sql += ` AND (p.is_sponsored = FALSE OR p.is_sponsored IS NULL)`;
    }

    const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS sub`;
    const { rows: countRows } = await query(countSql, params);
    const total = parseInt(countRows[0].total, 10);

    const { rows: sponsoredRows } = await query(`SELECT COUNT(*) AS total FROM products WHERE status != 'deleted' AND is_sponsored = TRUE`);
    const sponsoredCount = parseInt(sponsoredRows[0].total, 10);

    sql += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offset);

    const { rows } = await query(sql, params);
    
    const formattedRows = rows.map(r => ({
      ...r,
      image_url: r.primary_image || '/img/placeholder-product.png',
      primary_image: r.primary_image || '/img/placeholder-product.png',
      seller_name: r.store_name || 'Artisan Studio',
      store_name: r.store_name || 'Artisan Studio',
      price_paise: Math.round(Number(r.base_price) * 100),
    }));

    return res.json({ 
      success: true, 
      data: {
        products: formattedRows,
        total,
        page: pageNum,
        per_page: limitNum,
        total_pages: Math.ceil(total / limitNum) || 1,
        sponsored_count: sponsoredCount
      }
    });
  } catch (err) {
    next(err);
  }
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

async function createProduct(req, res, next) {
  try {
    const { name, description, base_price, category_id, seller_id, image_url, images, variants } = req.body;
    
    if (!name || !base_price || !seller_id) {
      return res.status(400).json({ success: false, message: 'Name, price, and seller are required.' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now();

    const { rows } = await query(`
      INSERT INTO products (
        seller_id, category_id, name, slug, description, base_price, 
        status, stock_quantity, preparation_days
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'active', 50, 1)
      RETURNING *
    `, [seller_id, category_id || null, name, slug, description || '', base_price]);

    const newProduct = rows[0];

    const rawImage = req.body.image_url || req.body.img_url || req.body.imagePath || req.body.imageUrl || req.body.primary_image;
    const rawImagesList = dedupeAlternateFormatImages((Array.isArray(images) && images.length > 0) ? images : (
      (Array.isArray(req.body.photos) && req.body.photos.length > 0) ? req.body.photos : (
        rawImage ? [rawImage] : []
      )
    ));

    if (rawImagesList.length > 0) {
      let sortOrder = 0;
      const finalUrls = [];
      for (const img of rawImagesList) {
        const url = typeof img === 'string' ? img : (img?.url || img?.imagePath || img?.img_url || img?.image_url || '');
        if (url) {
          finalUrls.push(url);
          await query(
            'INSERT INTO product_images (product_id, url, sort_order) VALUES ($1, $2, $3)',
            [newProduct.id, url, sortOrder++]
          );
        }
      }
      if (finalUrls.length > 0) {
        await query(
          'UPDATE products SET images = $1, image_url = $2, updated_at = NOW() WHERE id = $3',
          [finalUrls, finalUrls[0], newProduct.id]
        );
      }
    }

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
            newProduct.id,
            v.variant_name || v.name || v.variant_label || null,
            v.color_name || v.color || null,
            v.color_hex || null,
            v.size || null,
            v.stock_qty ?? v.stock ?? 0,
            v.additional_price ?? v.price_modifier ?? 0,
            primaryImg,
            vImgs
          ]
        );
      }
    }

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'ADMIN_CREATED_PRODUCT',
      targetEntity: 'products',
      targetId: newProduct.id,
      details: { name, seller_id },
      ipAddress: req.ip
    });

    bestsellerService.recomputeForSeller(seller_id).catch(e => console.error('[Bestseller Recompute Error]:', e.message));

    return res.status(201).json({ success: true, data: newProduct });
  } catch (err) {
    next(err);
  }
}

async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      base_price,
      price,
      stock_quantity,
      stock_qty,
      category_id,
      status,
      special_packaging_available,
      image_url,
      images,
      variants,
    } = req.body;

    const finalPrice = base_price !== undefined ? parseFloat(base_price) : (price !== undefined ? parseFloat(price) : null);
    const finalStock = stock_quantity !== undefined ? parseInt(stock_quantity, 10) : (stock_qty !== undefined ? parseInt(stock_qty, 10) : null);

    const result = await query(
      `UPDATE products 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           base_price = COALESCE($3, base_price),
           stock_quantity = COALESCE($4, stock_quantity),
           category_id = COALESCE($5, category_id),
           status = COALESCE($6, status),
           special_packaging_available = COALESCE($7, special_packaging_available),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        name || null,
        description !== undefined ? description : null,
        finalPrice,
        finalStock,
        category_id ? parseInt(category_id, 10) : null,
        status || null,
        special_packaging_available !== undefined ? Boolean(special_packaging_available) : null,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    if (Array.isArray(images)) {
      await query('DELETE FROM product_images WHERE product_id = $1', [id]);
      let sortOrder = 0;
      const cleanImages = dedupeAlternateFormatImages(images);
      const finalClean = [];
      for (const img of cleanImages) {
        const url = typeof img === 'string' ? img : (img?.url || '');
        if (url) {
          finalClean.push(url);
          await query(
            `INSERT INTO product_images (product_id, url, sort_order)
             VALUES ($1, $2, $3)`,
            [id, url, sortOrder++]
          );
        }
      }
      if (finalClean.length > 0) {
        await query(
          'UPDATE products SET images = $1, image_url = $2, updated_at = NOW() WHERE id = $3',
          [finalClean, finalClean[0], id]
        );
      }
    } else if (image_url) {
      await query(
        `INSERT INTO product_images (product_id, url, sort_order) 
         VALUES ($1, $2, 0)
         ON CONFLICT DO NOTHING`,
        [id, image_url]
      ).catch(() => {});
      await query(
        'UPDATE products SET images = $1, image_url = $2, updated_at = NOW() WHERE id = $3',
        [[image_url], image_url, id]
      );
    }

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
            v.stock_qty ?? v.stock ?? 0,
            v.additional_price ?? v.price_modifier ?? 0,
            primaryImg,
            vImgs
          ]
        );
      }
    }

    await logAdminAction({
      adminId: req.user?.id || null,
      actionType: 'ADMIN_UPDATED_PRODUCT',
      targetEntity: 'products',
      targetId: id,
      details: req.body,
      ipAddress: req.ip
    });

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully.',
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

async function toggleProductStatus(req, res, next) {
  try {
    const { productId, id } = req.params;
    const targetId = productId || id;
    const { status } = req.body;

    const { rows } = await query(
      'UPDATE products SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, targetId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Product not found.' });

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'PRODUCT_STATUS_TOGGLED',
      targetEntity: 'products',
      targetId,
      details: { status },
      ipAddress: req.ip
    });

    if (rows[0]?.seller_id) {
      bestsellerService.recomputeForSeller(rows[0].seller_id).catch(e => console.error('[Bestseller Recompute Error]:', e.message));
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function toggleSponsor(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await query(
      'UPDATE products SET is_sponsored = NOT is_sponsored WHERE id = $1 RETURNING id, is_sponsored',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    const { rows: sc } = await query("SELECT COUNT(*) AS total FROM products WHERE is_sponsored = TRUE AND status != 'deleted'");
    return res.json({ 
      success: true, 
      data: {
        ...rows[0],
        sponsored_count: parseInt(sc[0]?.total || 0, 10)
      } 
    });
  } catch (err) {
    next(err);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;
    let rows;
    try {
      const resQuery = await query("UPDATE products SET status = 'deleted', is_active = 0, updated_at = NOW() WHERE id::text = $1 RETURNING seller_id", [String(id)]);
      rows = resQuery.rows;
    } catch (e) {
      const resQuery = await query("UPDATE products SET status = 'deleted', is_active = FALSE, updated_at = NOW() WHERE id::text = $1 RETURNING seller_id", [String(id)]);
      rows = resQuery.rows;
    }
    if (rows[0]?.seller_id) {
      bestsellerService.recomputeForSeller(rows[0].seller_id).catch(e => console.error('[Bestseller Recompute Error]:', e.message));
    }
    await logAdminAction({
      adminId: req.user.id,
      actionType: 'PRODUCT_DELETED',
      targetEntity: 'products',
      targetId: id,
      details: {},
      ipAddress: req.ip
    });
    return res.json({ success: true, message: 'Product removed.' });
  } catch (err) {
    next(err);
  }
}

// Categories Management
async function listCategories(req, res, next) {
  try {
    const { rows } = await query(`
      SELECT c.id, c.name, COALESCE(c.display_name, c.name) AS display_name,
             c.slug, c.emoji_icon, c.icon_emoji, c.image_url, c.banner_image_url,
             c.description, c.parent_id, c.sort_order, c.is_active, c.created_at,
             (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status != 'deleted') AS product_count
      FROM categories c
      ORDER BY c.sort_order ASC, c.name ASC
    `);

    const topLevel = rows.filter(r => r.parent_id === null);
    const children = rows.filter(r => r.parent_id !== null);

    const categories = topLevel.map(cat => ({
      ...cat,
      subcategories: children.filter(c => c.parent_id === cat.id),
    }));

    return res.json({ success: true, data: { categories } });
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const rawName = req.body.display_name || req.body.name;
    const {
      parent_id = null,
      sort_order,
      description = '',
      emoji_icon,
      icon_emoji,
      image_url,
      cover_image,
      banner_url,
      banner_image_url,
      fallback_image_url,
      is_active = true
    } = req.body;

    if (!rawName || !rawName.trim()) {
      return res.status(400).json({ success: false, code: 'INVALID_CATEGORY', message: 'Category name is required.' });
    }

    const name = rawName.trim();
    const candidateSlug = slugify(req.body.slug || name);
    if (!candidateSlug || isReservedSlug(candidateSlug)) {
      return res.status(400).json({ success: false, code: 'INVALID_SLUG', message: 'Category slug is invalid or reserved.' });
    }

    const { rows: existingSlug } = await query('SELECT id FROM categories WHERE slug = $1', [candidateSlug]);
    if (existingSlug.length > 0) {
      return res.status(409).json({ success: false, code: 'SLUG_TAKEN', message: 'A category or subcategory with this slug already exists.' });
    }

    let finalSortOrder = (sort_order !== undefined && sort_order !== null && sort_order !== '') ? parseInt(sort_order, 10) : null;
    if (finalSortOrder === null || isNaN(finalSortOrder)) {
      const { rows: maxOrderRows } = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM categories WHERE parent_id IS NULL');
      finalSortOrder = parseInt(maxOrderRows[0]?.next_order || 1, 10);
    }

    const emoji = emoji_icon || icon_emoji || '🏺';
    const newImageUrl = req.file
      ? (req.file.path || req.file.secure_url)
      : (image_url || cover_image || banner_url || banner_image_url || fallback_image_url || null);

    const { rows } = await query(
      `INSERT INTO categories (name, display_name, slug, description, emoji_icon, icon_emoji, image_url, cover_image, banner_image_url, parent_id, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $6, $6, $7, $8, $9)
       RETURNING *`,
      [name, name, candidateSlug, description, emoji, newImageUrl, parent_id || null, finalSortOrder, is_active !== false]
    );

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'CATEGORY_CREATED',
      targetEntity: 'categories',
      targetId: rows[0].id,
      details: { name, slug: candidateSlug },
      ipAddress: req.ip
    });

    return res.status(201).json({ success: true, data: { ...rows[0], display_name: rows[0].name } });
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name,
      display_name,
      slug,
      description,
      image_url,
      cover_image,
      banner_url,
      banner_image_url,
      fallback_image_url,
      is_active,
      parent_id = null,
      sort_order,
      emoji_icon,
      icon_emoji
    } = req.body;

    const rawName = display_name || name;
    const updatedName = rawName ? rawName.trim() : null;
    const updatedSlug = slug ? slug.trim().toLowerCase() : null;

    let activeVal = null;
    if (is_active !== undefined && is_active !== null && is_active !== '') {
      activeVal = (is_active === 'true' || is_active === true || is_active === 1 || is_active === '1');
    }
    const emoji = emoji_icon || icon_emoji || null;
    const newImageUrl = req.file
      ? (req.file.path || req.file.secure_url)
      : (image_url || cover_image || banner_url || banner_image_url || fallback_image_url || null);

    const { rows } = await query(
      `UPDATE categories
       SET name             = COALESCE($1, name),
           display_name     = COALESCE($2, display_name, name),
           slug             = COALESCE($3, slug),
           description      = COALESCE($4, description),
           image_url        = COALESCE($5, image_url, cover_image),
           cover_image      = COALESCE($5, cover_image, image_url),
           banner_image_url = COALESCE($5, banner_image_url, image_url),
           parent_id        = CASE WHEN $6::boolean THEN $7 ELSE parent_id END,
           sort_order       = COALESCE($8, sort_order),
           is_active        = COALESCE($9, is_active),
           emoji_icon       = COALESCE($10, emoji_icon),
           icon_emoji       = COALESCE($10, icon_emoji),
           updated_at       = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        updatedName,
        display_name ? display_name.trim() : updatedName,
        updatedSlug,
        description !== undefined ? description : null,
        newImageUrl,
        req.body.parent_id !== undefined,
        parent_id || null,
        (sort_order !== undefined && sort_order !== null && sort_order !== '') ? parseInt(sort_order, 10) : null,
        activeVal,
        emoji,
        id
      ]
    );

    if (!rows.length) return res.status(404).json({ success: false, message: 'Category not found.' });

    await logAdminAction({
      adminId: req.user ? req.user.id : null,
      actionType: 'CATEGORY_UPDATED',
      targetEntity: 'categories',
      targetId: id,
      details: { name: rows[0].name, image_url: rows[0].image_url },
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'Category updated successfully',
      data: {
        ...rows[0],
        display_name: rows[0].display_name || rows[0].name,
        cover_image: rows[0].cover_image || rows[0].image_url,
        image_url: rows[0].image_url || rows[0].cover_image
      }
    });
  } catch (err) {
    next(err);
  }
}

async function toggleCategoryStatus(req, res, next) {
  try {
    const { id } = req.params;
    let { is_active } = req.body;
    let newStatus;
    if (is_active !== undefined && is_active !== null && is_active !== '') {
      newStatus = (is_active === true || is_active === 'true' || is_active === 1 || is_active === '1');
    } else {
      const { rows: current } = await query('SELECT is_active FROM categories WHERE id = $1', [id]);
      if (!current.length) return res.status(404).json({ success: false, message: 'Category not found.' });
      newStatus = !current[0].is_active;
    }

    const { rows } = await query(
      `UPDATE categories SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [newStatus, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Category not found.' });

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'CATEGORY_STATUS_TOGGLED',
      targetEntity: 'categories',
      targetId: id,
      details: { is_active: newStatus },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: `Category ${newStatus ? 'activated' : 'hidden'}.`, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;

    // 1. Fetch category to verify existence
    const { rows: catRows } = await query('SELECT id, name, slug FROM categories WHERE id = $1', [id]);
    if (!catRows.length) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    const targetCat = catRows[0];

    // 2. Locate or auto-create "Uncategorized" fallback category
    let uncategorizedId = null;
    const { rows: uncatRows } = await query(
      "SELECT id FROM categories WHERE LOWER(slug) = 'uncategorized' OR LOWER(name) = 'uncategorized' LIMIT 1"
    );

    if (uncatRows.length > 0) {
      uncategorizedId = uncatRows[0].id;
    } else {
      const { rows: newUncat } = await query(
        `INSERT INTO categories (name, display_name, slug, description, emoji_icon, icon_emoji, is_active, sort_order)
         VALUES ('Uncategorized', 'Uncategorized', 'uncategorized', 'Default fallback for products from deleted categories', '📦', '📦', TRUE, 9999)
         RETURNING id`
      );
      uncategorizedId = newUncat[0].id;
    }

    // 3. Prevent deleting the Uncategorized category itself
    if (String(id) === String(uncategorizedId)) {
      return res.status(400).json({ success: false, message: 'Cannot delete the default Uncategorized category.' });
    }

    // 4. Reassign products linked to this category to Uncategorized
    const { rowCount: reassignedCount } = await query(
      'UPDATE products SET category_id = $1 WHERE category_id = $2',
      [uncategorizedId, id]
    );

    // 5. Unlink subcategories (set parent_id = NULL)
    const { rowCount: unlinkedSubcats } = await query(
      'UPDATE categories SET parent_id = NULL WHERE parent_id = $1',
      [id]
    );

    // 6. Delete the category record
    await query('DELETE FROM categories WHERE id = $1', [id]);

    // 7. Audit Log
    await logAdminAction({
      adminId: req.user ? req.user.id : null,
      actionType: 'CATEGORY_DELETED',
      targetEntity: 'categories',
      targetId: id,
      details: {
        categoryName: targetCat.name,
        reassignedProductsCount: reassignedCount || 0,
        unlinkedSubcategoriesCount: unlinkedSubcats || 0,
        uncategorizedId
      },
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `Category "${targetCat.name}" deleted successfully. ${reassignedCount || 0} products reassigned to Uncategorized.`
    });
  } catch (err) {
    next(err);
  }
}

async function createSubcategory(req, res, next) {
  try {
    const { category_id, name, slug: rawSlug, sort_order } = req.body;
    if (!category_id || !name || !name.trim()) {
      return res.status(400).json({ success: false, code: 'INVALID_CATEGORY', message: 'category_id and name are required.' });
    }

    const { rows: parentRows } = await query('SELECT id FROM categories WHERE id = $1 AND is_active = TRUE', [category_id]);
    if (!parentRows.length) {
      return res.status(400).json({ success: false, code: 'INVALID_CATEGORY', message: 'Parent category does not exist or is inactive.' });
    }

    const trimmedName = name.trim();
    const candidateSlug = slugify(rawSlug || trimmedName);
    if (!candidateSlug || isReservedSlug(candidateSlug)) {
      return res.status(400).json({ success: false, code: 'INVALID_SLUG', message: 'Subcategory slug is invalid or reserved.' });
    }

    const { rows: existingSlug } = await query('SELECT id FROM categories WHERE slug = $1', [candidateSlug]);
    if (existingSlug.length > 0) {
      return res.status(409).json({ success: false, code: 'SLUG_TAKEN', message: 'A category or subcategory with this slug already exists.' });
    }

    let finalSortOrder = (sort_order !== undefined && sort_order !== null && sort_order !== '') ? parseInt(sort_order, 10) : null;
    if (finalSortOrder === null || isNaN(finalSortOrder)) {
      const { rows: maxOrderRows } = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM categories WHERE parent_id = $1', [category_id]);
      finalSortOrder = parseInt(maxOrderRows[0]?.next_order || 1, 10);
    }

    const { rows } = await query(
      `INSERT INTO categories (name, display_name, slug, parent_id, sort_order, is_active)
       VALUES ($1, $1, $2, $3, $4, TRUE)
       RETURNING *`,
      [trimmedName, candidateSlug, category_id, finalSortOrder]
    );

    return res.status(201).json({ success: true, data: { ...rows[0], display_name: rows[0].name } });
  } catch (err) {
    next(err);
  }
}

async function updateSubcategory(req, res, next) {
  return updateCategory(req, res, next);
}

async function deleteSubcategory(req, res, next) {
  return deleteCategory(req, res, next);
}

// ---------------------------------------------------------------------------
// 9. COUPONS & PROMOTIONS
// ---------------------------------------------------------------------------

async function getAllCoupons(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM coupons ORDER BY created_at DESC');
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

async function createCoupon(req, res, next) {
  try {
    const {
      code,
      discount_type,
      discount_value,
      min_order_amount = 0,
      max_discount_amount = null,
      usage_limit_per_user = 1,
      starts_at = new Date(),
      expires_at
    } = req.body;

    if (!code || !discount_type || !discount_value || !expires_at) {
      return res.status(400).json({ success: false, message: 'code, discount_type, discount_value, and expires_at are required.' });
    }

    const { rows } = await query(`
      INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_discount_amount, usage_limit_per_user, starts_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [code.toUpperCase().trim(), discount_type, discount_value, min_order_amount, max_discount_amount, usage_limit_per_user, starts_at, expires_at]);

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'COUPON_CREATED',
      targetEntity: 'coupons',
      targetId: rows[0].id,
      details: { code: rows[0].code, discount_value },
      ipAddress: req.ip
    });

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function deleteCoupon(req, res, next) {
  try {
    const { id } = req.params;
    await query('UPDATE coupons SET is_active = FALSE WHERE id = $1', [id]);
    await logAdminAction({
      adminId: req.user.id,
      actionType: 'COUPON_DEACTIVATED',
      targetEntity: 'coupons',
      targetId: id,
      details: {},
      ipAddress: req.ip
    });
    return res.json({ success: true, message: 'Coupon deactivated.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 10. BANNERS, OUR STORY & USER REPORTS
// ---------------------------------------------------------------------------

async function listBanners(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM banners WHERE is_active = TRUE ORDER BY sort_order ASC');
    const topBanner = rows.length > 0 ? rows[0] : null;

    if (req.originalUrl && req.originalUrl.includes('ui-settings')) {
      return res.json({
        success: true,
        data: {
          banners: rows,
          home_seasonal_banner: topBanner ? {
            id: topBanner.id,
            content_url: topBanner.image_url,
            image_url: topBanner.image_url,
            label: topBanner.alt_text || 'Special Seasonal Showcase',
            link_url: topBanner.link_url
          } : null
        }
      });
    }

    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

async function createBanner(req, res, next) {
  try {
    const { link_url = null, alt_text = '', sort_order = 0, product_id = null } = req.body;
    const image_url = req.file ? req.file.path : req.body.image_url;

    if (!image_url) return res.status(400).json({ success: false, message: 'Banner image is required.' });

    const { rows } = await query(
      `INSERT INTO banners (image_url, link_url, alt_text, sort_order, product_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [image_url, link_url, alt_text, sort_order, product_id || null]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function toggleBanner(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await query(
      'UPDATE banners SET is_active = NOT is_active WHERE id = $1 RETURNING id, is_active',
      [id]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function deleteBanner(req, res, next) {
  try {
    const { id } = req.params;
    await query('DELETE FROM banners WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Banner deleted.' });
  } catch (err) {
    next(err);
  }
}

async function listReports(req, res, next) {
  try {
    const { status = 'all' } = req.query;
    let sql = `
      SELECT r.id,
             r.reporter_id,
             COALESCE(r.type, 'other') AS type,
             COALESCE(r.reason, r.description, r.subject, '') AS reason,
             COALESCE(r.reason, r.description, r.subject, '') AS description,
             COALESCE(r.subject, INITCAP(REPLACE(COALESCE(r.type, 'User Report'), '_', ' '))) AS subject,
             COALESCE(r.reporter_type, u.role, 'buyer') AS reporter_type,
             COALESCE(r.related_to_type, r.type, 'other') AS related_to_type,
             COALESCE(r.target_id, r.related_to_id) AS target_id,
             COALESCE(r.target_id, r.related_to_id) AS related_to_id,
             COALESCE(r.status, 'open') AS status,
             COALESCE(r.admin_note, r.admin_reply, '') AS admin_reply,
             COALESCE(r.admin_note, r.admin_reply, '') AS admin_note,
             r.created_at,
             r.resolved_at,
             u.name AS reporter_name,
             u.email AS reporter_email
      FROM reports r
      LEFT JOIN users u ON u.id = r.reporter_id
    `;
    const params = [];
    if (status !== 'all' && status !== '') {
      sql += ` WHERE r.status = $1`;
      params.push(status);
    }
    sql += ` ORDER BY r.created_at DESC`;

    const { rows } = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

async function updateReport(req, res, next) {
  try {
    const { id } = req.params;
    const { status, admin_note, admin_reply } = req.body;
    const finalNote = admin_note !== undefined ? admin_note : admin_reply;

    const { rows } = await query(
      `UPDATE reports
       SET status = COALESCE($1, status),
           admin_note = COALESCE($2, admin_note),
           admin_reply = COALESCE($2, admin_reply),
           resolved_at = CASE WHEN $1 IN ('resolved', 'dismissed') THEN NOW() ELSE resolved_at END
       WHERE id::text = $3::text
       RETURNING *`,
      [status, finalNote, String(id)]
    );

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function createReport(req, res, next) {
  try {
    const reporterId = req.user ? req.user.id : null;
    const { type, target_id, targetId, reason, description, subject } = req.body;
    const reportType = type || 'other';
    const reportReason = reason || description || subject || 'No details provided';
    const finalTargetId = target_id || targetId || null;

    const { rows } = await query(
      `INSERT INTO reports (reporter_id, type, target_id, reason, status, created_at)
       VALUES ($1, $2, $3, $4, 'open', NOW())
       RETURNING *`,
      [reporterId, reportType, finalTargetId ? String(finalTargetId) : null, reportReason]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 11. TOFA SPECIAL ADMIN-OWNED SHOPS MANAGEMENT
// ---------------------------------------------------------------------------

async function listSpecialShops(req, res, next) {
  try {
    const { rows } = await query(`
      SELECT u.id AS user_id, u.id, u.name, u.email, u.phone, u.profile_photo_url, u.is_active,
             COALESCE(s.id, sp.id) AS seller_id,
             COALESCE(s.commission_rate, 0) AS commission_rate,
             COALESCE(sp.store_name, s.store_name) AS store_name,
             COALESCE(sp.slug, s.slug) AS slug,
             COALESCE(sp.bio, s.bio) AS bio,
             COALESCE(sp.pickup_address, s.pickup_address) AS pickup_address,
             COALESCE(sp.is_approved, s.is_approved) AS is_approved,
             COALESCE(sp.verification_status, s.verification_status) AS verification_status,
             TRUE AS is_admin_managed,
             COALESCE(sp.created_at, s.created_at) AS created_at,
             sp.updated_at AS updated_at,
             (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status != 'deleted') AS product_count,
             (SELECT COALESCE(SUM(so.subtotal), 0) FROM seller_orders so JOIN orders o ON o.id = so.order_id WHERE so.seller_id = u.id AND o.payment_status = 'paid') AS total_revenue,
             (SELECT COUNT(*) FROM seller_orders so WHERE so.seller_id = u.id) AS total_orders
      FROM users u
      LEFT JOIN seller_profiles sp ON sp.user_id = u.id
      LEFT JOIN sellers s ON s.user_id = u.id
      WHERE sp.is_admin_managed::text IN ('true', 't', '1') OR s.is_admin_managed::text IN ('true', 't', '1')
      ORDER BY u.id ASC
    `);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

async function createSpecialShop(req, res, next) {
  const client = await db.getClient();
  try {
    const { store_name, slug, email, phone, bio, pickup_address } = req.body;
    if (!store_name) {
      return res.status(400).json({ success: false, message: 'Store name is required.' });
    }

    const cleanSlug = (slug || store_name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const cleanEmail = (email || `${cleanSlug}@thetohfa.in`).toLowerCase().trim();
    const cleanPhone = phone ? String(phone).trim() : null;

    const bcrypt = require('bcrypt');
    const dummyHash = await bcrypt.hash('TofaSpecialAdmin@2026!', 10);

    await client.query('BEGIN');

    const { rows: existingUser } = await client.query('SELECT id FROM users WHERE LOWER(TRIM(email)) = $1', [cleanEmail]);
    let userId;

    if (existingUser.length > 0) {
      userId = existingUser[0].id;
      await client.query('UPDATE users SET role = $1, is_active = TRUE, name = $2 WHERE id = $3', ['seller', store_name, userId]);
    } else {
      const { rows: newUser } = await client.query(
        `INSERT INTO users (name, full_name, display_name, email, phone, password_hash, role, is_active)
         VALUES ($1, $1, $1, $2, $3, $4, 'seller', 1)
         RETURNING id`,
        [store_name, cleanEmail, cleanPhone, dummyHash]
      );
      userId = newUser[0].id;
    }

    const pickupAddressJson = typeof pickup_address === 'object' && pickup_address !== null
      ? JSON.stringify(pickup_address)
      : (pickup_address || '{}');

    await client.query(
      `INSERT INTO sellers (user_id, store_name, slug, bio, pickup_address, is_admin_managed, is_approved, verification_status, is_active)
       VALUES ($1, $2, $3, $4, $5, 1, 1, 'verified', 1)
       ON CONFLICT (user_id) DO UPDATE SET
         store_name = EXCLUDED.store_name,
         slug = EXCLUDED.slug,
         bio = EXCLUDED.bio,
         pickup_address = EXCLUDED.pickup_address,
         is_admin_managed = TRUE,
         is_approved = TRUE,
         verification_status = 'verified',
         is_active = TRUE`,
      [userId, store_name, cleanSlug, bio || '', pickupAddressJson]
    );

    const { rows: spRows } = await client.query(
      `INSERT INTO seller_profiles (user_id, store_name, slug, bio, pickup_address, is_admin_managed, is_approved, verification_status, is_active, seller_type)
       VALUES ($1, $2, $3, $4, $5, 1, 1, 'verified', 1, 'special')
       ON CONFLICT (user_id) DO UPDATE SET
         store_name = EXCLUDED.store_name,
         slug = EXCLUDED.slug,
         bio = EXCLUDED.bio,
         pickup_address = EXCLUDED.pickup_address,
         is_admin_managed = TRUE,
         is_approved = TRUE,
         verification_status = 'verified',
         is_active = TRUE,
         seller_type = 'special',
         updated_at = NOW()
       RETURNING *`,
      [userId, store_name, cleanSlug, bio || '', pickupAddressJson]
    );

    const { rows: sIdRows } = await client.query('SELECT id FROM sellers WHERE user_id = $1', [userId]);
    if (sIdRows.length > 0) {
      await client.query(
        `INSERT INTO wallets (seller_id, user_id, balance, currency)
         VALUES ($1, $2, 0, 'INR')
         ON CONFLICT (seller_id) DO NOTHING`,
        [sIdRows[0].id, userId]
      );
    }

    await client.query('COMMIT');

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'SPECIAL_SHOP_CREATED',
      targetEntity: 'sellers',
      targetId: userId,
      details: { store_name, slug: cleanSlug, email: cleanEmail },
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      message: `Tohfa Special shop "${store_name}" created successfully.`,
      data: {
        user_id: userId,
        ...spRows[0]
      }
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

async function updateSpecialShop(req, res, next) {
  try {
    const shopId = req.params.id || req.params.sellerId;
    const { store_name, bio, pickup_address, is_active, commission_rate } = req.body;

    const parsedCommRate = (commission_rate !== undefined && commission_rate !== null && commission_rate !== '')
      ? parseFloat(commission_rate)
      : null;

    const formattedAddress = pickup_address 
      ? (typeof pickup_address === 'string' ? pickup_address : JSON.stringify(pickup_address))
      : null;

    // Find the user/seller associated with this shop
    const { rows: matchRows } = await query(
      `SELECT u.id AS user_id, s.id AS seller_id, sp.id AS profile_id
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE (u.id::text = $1 OR sp.id::text = $1 OR s.id::text = $1 OR sp.slug = $1 OR s.slug = $1)
         AND (sp.is_admin_managed::text IN ('true', 't', '1') OR s.is_admin_managed::text IN ('true', 't', '1'))
       ORDER BY CASE 
         WHEN sp.slug = $1 OR s.slug = $1 THEN 1
         WHEN u.id::text = $1 AND (sp.id IS NOT NULL OR s.id IS NOT NULL) THEN 2
         WHEN u.id::text = $1 THEN 3
         WHEN sp.id::text = $1 THEN 4
         WHEN s.id::text = $1 THEN 5
         ELSE 6 
       END ASC
       LIMIT 1`,
      [shopId]
    );

    if (!matchRows.length) {
      return res.status(404).json({ success: false, message: 'Tohfa Special shop not found.' });
    }

    const { user_id, seller_id } = matchRows[0];

    // Update seller_profiles
    const { rows: spRows } = await query(
      `UPDATE seller_profiles
       SET store_name = COALESCE($1, store_name),
           bio = COALESCE($2, bio),
           pickup_address = COALESCE($3, pickup_address),
           is_active = COALESCE($4, is_active),
           commission_rate = COALESCE($5, commission_rate),
           updated_at = NOW()
       WHERE user_id = $6
       RETURNING *`,
      [
        store_name || null,
        bio || null,
        formattedAddress,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        parsedCommRate,
        user_id
      ]
    );

    // Update sellers (including commission_rate)
    const { rows: sRows } = await query(
      `UPDATE sellers
       SET store_name = COALESCE($1, store_name),
           bio = COALESCE($2, bio),
           pickup_address = COALESCE($3, pickup_address),
           is_active = COALESCE($4, is_active),
           commission_rate = COALESCE($5, commission_rate)
       WHERE user_id = $6
       RETURNING *`,
      [
        store_name || null,
        bio || null,
        formattedAddress,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        parsedCommRate,
        user_id
      ]
    );

    const merged = {
      ...(spRows[0] || {}),
      ...(sRows[0] || {}),
      user_id,
      seller_id: seller_id || sRows[0]?.id || spRows[0]?.id,
      commission_rate: sRows[0]?.commission_rate !== undefined ? parseFloat(sRows[0].commission_rate) : (parsedCommRate || 0),
      store_name: sRows[0]?.store_name || spRows[0]?.store_name || store_name,
      bio: sRows[0]?.bio || spRows[0]?.bio || bio,
      pickup_address: sRows[0]?.pickup_address || spRows[0]?.pickup_address || formattedAddress,
      is_active: sRows[0]?.is_active ?? spRows[0]?.is_active ?? true,
    };

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'SPECIAL_SHOP_UPDATED',
      targetEntity: 'sellers',
      targetId: user_id,
      details: { store_name: merged.store_name, commission_rate: merged.commission_rate, is_active: merged.is_active },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Tohfa Special shop updated.', data: merged });
  } catch (err) {
    next(err);
  }
}

async function switchSessionToSpecialShop(req, res, next) {
  try {
    const shopId = req.params.id || req.params.sellerId;
    const authService = require('../services/auth.service');

    const { rows } = await query(
      `SELECT COALESCE(sp.id, s.id) AS profile_id,
              COALESCE(sp.store_name, s.store_name, s.shop_name, 'Tohfa Special') AS store_name,
              COALESCE(sp.slug, s.slug, s.store_slug) AS slug,
              u.id AS user_id, u.email, u.name
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE (u.id::text = $1 OR sp.id::text = $1 OR s.id::text = $1 OR sp.slug = $1 OR s.slug = $1)
         AND (sp.is_admin_managed::text IN ('true', 't', '1') OR s.is_admin_managed::text IN ('true', 't', '1'))
       ORDER BY CASE 
         WHEN sp.slug = $1 OR s.slug = $1 THEN 1
         WHEN u.id::text = $1 AND (sp.id IS NOT NULL OR s.id IS NOT NULL) THEN 2
         WHEN u.id::text = $1 THEN 3
         WHEN sp.id::text = $1 THEN 4
         WHEN s.id::text = $1 THEN 5
         ELSE 6 
       END ASC
       LIMIT 1`,
      [shopId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Tohfa Special shop not found or is not admin-managed.'
      });
    }

    const shop = rows[0];

    const tokenPayload = {
      id: shop.user_id,
      email: shop.email,
      role: 'seller',
      isSellerApproved: true,
      isAdminManaged: true,
      realAdminId: req.user.id,
      actingAsSpecialShop: true
    };

    const tokens = await authService.issueTokenPair(tokenPayload);

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'ADMIN_SWITCHED_TO_SPECIAL_SHOP',
      targetEntity: 'sellers',
      targetId: shop.user_id,
      details: { store_name: shop.store_name, slug: shop.slug },
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `Successfully generated session for "${shop.store_name}".`,
      data: {
        user: {
          id: shop.user_id,
          name: shop.name || shop.store_name,
          email: shop.email,
          role: 'seller',
          store_name: shop.store_name,
          is_approved: 1,
          verification_status: 'verified',
          is_admin_managed: true
        },
        seller: shop,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        token: tokens.accessToken,
        returnUrl: '/admin/sellers.html'
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getRevenueBreakdown(req, res, next) {
  try {
    const { rows } = await query(`
      SELECT 
        COALESCE(SUM(CASE WHEN sp.is_admin_managed::text IN ('true', 't', '1') THEN o.total_amount ELSE 0 END), 0) AS tofa_special_revenue,
        COALESCE(SUM(CASE WHEN (sp.is_admin_managed IS NULL OR sp.is_admin_managed::text IN ('false', 'f', '0')) THEN o.total_amount ELSE 0 END), 0) AS marketplace_revenue,
        COUNT(CASE WHEN sp.is_admin_managed::text IN ('true', 't', '1') THEN 1 END) AS tofa_special_orders,
        COUNT(CASE WHEN (sp.is_admin_managed IS NULL OR sp.is_admin_managed::text IN ('false', 'f', '0')) THEN 1 END) AS marketplace_orders,
        COALESCE(SUM(o.total_amount), 0) AS total_gmv
      FROM orders o
      LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
      WHERE o.payment_status = 'paid' AND o.status != 'cancelled'
    `);

    const row = rows[0] || {};
    return res.json({
      success: true,
      data: {
        tofa_special_revenue: parseFloat(row.tofa_special_revenue || 0),
        marketplace_revenue: parseFloat(row.marketplace_revenue || 0),
        tofa_special_orders: parseInt(row.tofa_special_orders || 0, 10),
        marketplace_orders: parseInt(row.marketplace_orders || 0, 10),
        total_gmv: parseFloat(row.total_gmv || 0)
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getAuditLogDiff(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await query('SELECT details, meta, before_json, after_json FROM audit_logs WHERE id = $1', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Log not found.' });
    }
    const details = rows[0].details || rows[0].meta || {};
    const beforeJson = rows[0].before_json || (details.before ? JSON.stringify(details.before) : null);
    const afterJson = rows[0].after_json || (details.after ? JSON.stringify(details.after) : JSON.stringify(details));
    return res.json({
      success: true,
      data: {
        before_json: beforeJson,
        after_json: afterJson
      }
    });
  } catch (err) {
    next(err);
  }
}


async function getPlansOverview(req, res, next) {
  try {
    const { rows: planCounts } = await query(`
      SELECT COALESCE(sp.subscription_plan, 'basic') AS plan, COUNT(*) AS count
      FROM seller_profiles sp
      GROUP BY COALESCE(sp.subscription_plan, 'basic')
    `);
    const distribution = { basic: 0, pro: 0, max: 0 };
    planCounts.forEach(r => {
      const p = (r.plan || 'basic').toLowerCase();
      if (distribution[p] !== undefined) distribution[p] = parseInt(r.count, 10);
    });

    const { rows: paidDiscountRows } = await query(`
      SELECT plan, COUNT(DISTINCT user_id) AS paid_count
      FROM subscription_payments
      WHERE status = 'paid' AND discount_applied = TRUE
      GROUP BY plan
    `).catch(() => ({ rows: [] }));
    const discountPaid = { pro: 0, max: 0 };
    paidDiscountRows.forEach(r => {
      const p = (r.plan || '').toLowerCase();
      if (discountPaid[p] !== undefined) discountPaid[p] = parseInt(r.paid_count, 10);
    });

    const discountSlots = {
      pro: { total: 20, used: discountPaid.pro, remaining: Math.max(0, 20 - discountPaid.pro) },
      max: { total: 20, used: discountPaid.max, remaining: Math.max(0, 20 - discountPaid.max) },
    };

    const { rows: bulkPriorityList } = await query(`
      SELECT u.id, u.name, u.email, u.phone,
             COALESCE(sp.store_name, s.store_name, u.name) AS store_name,
             COALESCE(sp.whatsapp_number, s.whatsapp_number, u.phone) AS whatsapp_number,
             COALESCE(sp.subscription_plan, s.subscription_plan, 'basic') AS subscription_plan,
             COALESCE(sp.daily_capacity_max, s.daily_capacity_max, 50) AS daily_capacity,
             (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status = 'active') AS active_products
      FROM users u
      LEFT JOIN seller_profiles sp ON sp.user_id = u.id
      LEFT JOIN sellers s ON s.user_id = u.id
      WHERE u.role = 'seller' AND u.is_active = TRUE
      ORDER BY 
        CASE 
          WHEN COALESCE(sp.subscription_plan, s.subscription_plan) = 'max' THEN 1
          WHEN COALESCE(sp.subscription_plan, s.subscription_plan) = 'pro' THEN 2
          ELSE 3
        END ASC,
        (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status = 'active') DESC
      LIMIT 50
    `);

    const { rows: metaAdsEligible } = await query(`
      SELECT u.id, u.name, u.email,
             COALESCE(sp.store_name, s.store_name, u.name) AS store_name,
             COALESCE(sp.instagram_handle, s.instagram_handle) AS instagram_handle,
             COALESCE(sp.instagram_followers, s.instagram_followers) AS instagram_followers,
             COALESCE(sp.subscription_plan, s.subscription_plan) AS subscription_plan,
             (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status = 'active') AS active_products,
             (SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'base_price', p.base_price, 'is_sponsored', p.is_sponsored)) 
              FROM (SELECT * FROM products WHERE seller_id = u.id AND status = 'active' ORDER BY is_sponsored DESC, created_at DESC LIMIT 3) p
             ) AS showcase_products
      FROM users u
      JOIN seller_profiles sp ON sp.user_id = u.id
      LEFT JOIN sellers s ON s.user_id = u.id
      WHERE u.role = 'seller'
        AND u.is_active = TRUE
        AND COALESCE(sp.subscription_plan, s.subscription_plan) IN ('pro', 'max')
      ORDER BY CASE WHEN COALESCE(sp.subscription_plan, s.subscription_plan) = 'max' THEN 1 ELSE 2 END ASC
    `);

    return res.json({
      success: true,
      data: {
        distribution,
        discount_slots: discountSlots,
        bulk_priority_sellers: bulkPriorityList,
        meta_ads_eligible: metaAdsEligible
      }
    });
  } catch (err) {
    next(err);
  }
}

async function updateSellerPlan(req, res, next) {
  try {
    const sellerId = req.params.id || req.params.sellerId;
    const { plan = 'basic', status = 'active' } = req.body;
    const adminUser = req.user?.email || 'admin';

    const normalizedPlan = String(plan).toLowerCase().trim();
    if (!['basic', 'pro', 'max'].includes(normalizedPlan)) {
      return res.status(400).json({ success: false, message: 'Invalid plan tier. Must be basic, pro, or max.' });
    }

    const renewsAt = normalizedPlan === 'basic' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await query(
      `UPDATE sellers
       SET subscription_plan = $1,
           subscription_status = $2,
           subscription_renews_at = $3,
           subscription_updated_by = $4,
           updated_at = NOW()
       WHERE id::text = $5::text OR user_id::text = $5::text`,
      [normalizedPlan, status, renewsAt, 'admin:' + adminUser, String(sellerId)]
    );

    await query(
      `UPDATE seller_profiles
       SET subscription_plan = $1,
           subscription_status = $2,
           subscription_renews_at = $3,
           subscription_updated_by = $4,
           updated_at = NOW()
       WHERE id::text = $5::text OR user_id::text = $5::text`,
      [normalizedPlan, status, renewsAt, 'admin:' + adminUser, String(sellerId)]
    );

    return res.json({
      success: true,
      message: 'Seller plan updated to ' + normalizedPlan + ' (' + status + ').',
      data: {
        seller_id: sellerId,
        subscription_plan: normalizedPlan,
        subscription_status: status,
        subscription_renews_at: renewsAt
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Fetch seller plan subscriptions summary and breakdown
 */
async function getSellerSubscriptions(req, res, next) {
  try {
    // Query seller plans joining sellers and users
    // Supports either a dedicated seller_subscriptions table or subscription columns on sellers / subscription_payments
    const queryStr = `
      SELECT 
        s.id AS seller_id,
        COALESCE(s.shop_name, s.store_name, 'Artisan Studio') AS shop_name,
        u.name AS seller_name,
        u.email AS seller_email,
        u.phone AS seller_phone,
        COALESCE(sub.plan_name, s.plan_type, s.subscription_plan, 'Free / Standard') AS plan_name,
        COALESCE(sub.amount, s.plan_amount, s.subscription_price_paid, 0) AS plan_amount,
        COALESCE(sub.start_date, s.plan_started_at, s.subscription_started_at, s.created_at) AS start_date,
        COALESCE(sub.end_date, s.plan_expires_at, s.subscription_renews_at, s.created_at + INTERVAL '30 days') AS end_date,
        CASE 
          WHEN COALESCE(sub.end_date, s.plan_expires_at, s.subscription_renews_at) < NOW() THEN 'EXPIRED'
          ELSE 'ACTIVE'
        END AS status
      FROM sellers s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT plan_name, amount, start_date, end_date
        FROM seller_subscriptions 
        WHERE seller_id = s.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) sub ON true
      WHERE s.is_approved = TRUE OR s.is_approved::text IN ('true', 't', '1')
      ORDER BY start_date DESC;
    `;

    let subscriptions = [];
    try {
      const { rows } = await query(queryStr);
      subscriptions = rows;
    } catch (dbErr) {
      // Fallback if seller_subscriptions table does not exist
      const fallbackQueryStr = `
        SELECT 
          s.id AS seller_id,
          COALESCE(s.shop_name, s.store_name, 'Artisan Studio') AS shop_name,
          u.name AS seller_name,
          u.email AS seller_email,
          u.phone AS seller_phone,
          COALESCE(sub.plan, s.subscription_plan, 'Free / Standard') AS plan_name,
          COALESCE(sub.amount, s.subscription_price_paid, 0) AS plan_amount,
          COALESCE(sub.started_at, s.subscription_started_at, s.created_at) AS start_date,
          COALESCE(sub.renews_at, s.subscription_renews_at, s.created_at + INTERVAL '30 days') AS end_date,
          CASE 
            WHEN COALESCE(sub.renews_at, s.subscription_renews_at) < NOW() THEN 'EXPIRED'
            ELSE 'ACTIVE'
          END AS status
        FROM sellers s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT plan, amount, started_at, renews_at
          FROM subscription_payments 
          WHERE (seller_id = s.id OR user_id = s.user_id) AND status = 'paid'
          ORDER BY created_at DESC 
          LIMIT 1
        ) sub ON true
        WHERE s.is_approved = TRUE OR s.is_approved::text IN ('true', 't', '1')
        ORDER BY start_date DESC;
      `;
      const { rows } = await query(fallbackQueryStr);
      subscriptions = rows;
    }

    const stats = {
      totalSellersOnPlans: subscriptions.length,
      activePlans: subscriptions.filter(s => s.status === 'ACTIVE').length,
      expiredPlans: subscriptions.filter(s => s.status === 'EXPIRED').length
    };

    return res.json({
      success: true,
      data: {
        stats,
        subscriptions
      }
    });
  } catch (error) {
    console.error('Error fetching seller plan subscriptions:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve seller plans' });
  }
}

/**
 * Fetch all Special Orders joined with Buyer details, Delivery address, Shop name, and line items.
 */
async function getSpecialOrders(req, res, next) {
  try {
    const { rows: orders } = await query(`
      SELECT 
        o.id,
        COALESCE(o.order_number, o.order_ref, 'TOHFA-' || UPPER(SUBSTRING(o.id::text, 1, 8))) AS order_number,
        o.order_ref,
        o.total_amount,
        o.status,
        o.payment_status,
        o.payment_method,
        COALESCE(o.special_instructions, o.notes, o.studio_notes) AS special_instructions,
        COALESCE(o.customization_details, '{}'::jsonb) AS customization_details,
        o.shipping_address,
        o.created_at,
        o.updated_at,
        u.id AS buyer_id,
        u.name AS buyer_name,
        u.email AS buyer_email,
        u.phone AS buyer_phone,
        COALESCE(s.shop_name, sp.store_name, sel.store_name, 'Tohfa Special Store') AS shop_name,
        COALESCE(s.shop_name, sp.store_name, sel.store_name, 'Tohfa Special Store') AS store_name,
        COALESCE(
          json_agg(
            json_build_object(
              'product_name', COALESCE(p.name, 'Handcrafted Item'),
              'quantity', oi.quantity,
              'price', COALESCE(oi.unit_price, 0)
            )
          ) FILTER (WHERE oi.id IS NOT NULL), '[]'
        ) AS items
      FROM orders o
      LEFT JOIN users u ON (o.buyer_id = u.id OR o.user_id = u.id)
      LEFT JOIN shops s ON o.shop_id = s.id
      LEFT JOIN seller_profiles sp ON o.seller_id = sp.user_id OR o.seller_id = sp.id
      LEFT JOIN sellers sel ON o.seller_id = sel.id OR o.seller_id = sel.user_id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE o.is_special = TRUE 
         OR o.shop_id IN (SELECT id FROM shops WHERE is_special = TRUE)
         OR sp.is_admin_managed::text IN ('true', 't', '1')
         OR sel.is_admin_managed::text IN ('true', 't', '1')
         OR sp.seller_type = 'special'
      GROUP BY o.id, u.id, s.id, s.shop_name, sp.id, sel.id
      ORDER BY o.created_at DESC;
    `);

    return res.json({
      success: true,
      data: { orders }
    });
  } catch (error) {
    console.error('Error fetching special orders:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve special orders' });
  }
}

/**
 * Update Special Order status and admin remarks.
 */
async function updateSpecialOrderStatus(req, res, next) {
  const id = req.params.id || req.params.orderId;
  const { status, remarks, notes, admin_notes } = req.body;

  if (!status) {
    return res.status(400).json({ success: false, message: 'Status is required' });
  }

  const normalizedStatus = String(status).trim().toUpperCase();
  const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

  if (!VALID_STATUSES.includes(normalizedStatus)) {
    return res.status(400).json({ 
      success: false, 
      message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` 
    });
  }

  try {
    const effectiveRemarks = remarks || notes || admin_notes || null;
    const { rows: updatedRows } = await query(
      `UPDATE orders 
       SET status = $1, 
           admin_notes = COALESCE($2, admin_notes),
           studio_notes = COALESCE($2, studio_notes),
           delivered_at = CASE WHEN $1 = 'DELIVERED' THEN NOW() ELSE delivered_at END,
           updated_at = NOW() 
       WHERE id::text = $3::text OR order_ref = $3::text
       RETURNING *;`,
      [normalizedStatus, effectiveRemarks, String(id)]
    );

    if (updatedRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    return res.json({
      success: true,
      message: `Special order status updated to ${normalizedStatus}`,
      data: updatedRows[0]
    });
  } catch (error) {
    console.error('Error updating special order status:', error);
    return res.status(500).json({ success: false, message: 'Database error updating order status' });
  }
}

module.exports = {
  getPlatformStats,
  listSellers,
  getAllSellers: listSellers,
  getSellerDetail,
  getSellerDetails: getSellerDetail,
  verifySellerKyc,
  verifySellerKYC,
  approveSeller,
  rejectSeller,
  suspendSeller,
  banSeller,
  forceRefundOrder,
  forceUpdateOrderStatus,
  getPendingPayouts,
  disburseSellerPayout,
  listAllPayouts,
  listAllPayments,
  getPaymentsSummary,
  getAllUsers,
  toggleUserStatus,
  listAuditLogs,
  getAuditLogs: listAuditLogs,
  getAuditLogDiff,
  listAllProducts,
  getAllProducts: listAllProducts,
  createProduct,
  updateProduct,
  toggleProductStatus,
  toggleSponsor,
  deleteProduct,
  listCategories,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  getAllCoupons,
  createCoupon,
  deleteCoupon,
  listBanners,
  createBanner,
  toggleBanner,
  deleteBanner,
  listReports,
  updateReport,
  createReport,
  listSpecialShops,
  createSpecialShop,
  updateSpecialShop,
  switchSessionToSpecialShop,
  getRevenueBreakdown,
  getPlansOverview,
  updateSellerPlan,
  getSellerSubscriptions,
  getSpecialOrders,
  updateSpecialOrderStatus,
};
