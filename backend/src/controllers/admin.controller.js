/**
 * Tohfa v2 — Master Admin Controller
 * File: backend/src/controllers/admin.controller.js
 * Role: Full platform governance, catalog curation, dispute resolution,
 *       and immutable audit logging for Super Admins.
 */
'use strict';

const db = require('../config/db');
const { query } = db;
const emailService = require('../services/email.service');
const paymentService = require('../services/payment.service');
const { logAdminAction } = require('../services/audit.service');
const { createNotification } = require('./notification.controller');

// ---------------------------------------------------------------------------
// 1. DASHBOARD & LIVE PLATFORM STATS
// ---------------------------------------------------------------------------

async function getPlatformStats(req, res, next) {
  try {
    const stats = await query(`
      SELECT 
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE payment_status = 'paid') AS total_gmv,
        (SELECT COALESCE(SUM(total_amount * 0.10), 0) FROM orders WHERE status = 'delivered') AS net_platform_revenue,
        (SELECT COUNT(*) FROM users WHERE role = 'buyer') AS total_buyers,
        (SELECT COUNT(*) FROM seller_profiles WHERE is_approved = TRUE OR verification_status = 'verified') AS active_artisans,
        (SELECT COUNT(*) FROM seller_profiles WHERE (is_approved = FALSE AND rejection_reason IS NULL) OR verification_status = 'pending_verification') AS pending_kyc_count,
        (SELECT COUNT(*) FROM orders WHERE payment_status = 'paid' AND status NOT IN ('delivered', 'cancelled')) AS active_orders_in_fulfillment,
        (SELECT COUNT(*) FROM seller_profiles WHERE is_admin_managed = TRUE) AS tohfa_specials_count
    `);

    const row = stats.rows[0] || {};
    return res.status(200).json({
      success: true,
      data: {
        total_gmv: parseFloat(row.total_gmv || 0),
        net_platform_revenue: parseFloat(row.net_platform_revenue || 0),
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
      baseSql += ` AND (COALESCE(sp.is_approved, s.is_approved, FALSE) = FALSE AND sp.rejection_reason IS NULL AND s.rejection_reason IS NULL AND u.is_active = TRUE)`;
    } else if (status === 'active' || status === 'verified' || status === 'approved') {
      baseSql += ` AND (COALESCE(sp.is_approved, s.is_approved, FALSE) = TRUE AND u.is_active = TRUE)`;
    } else if (status === 'rejected') {
      baseSql += ` AND (COALESCE(sp.is_approved, s.is_approved, FALSE) = FALSE AND (sp.rejection_reason IS NOT NULL OR s.rejection_reason IS NOT NULL))`;
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
             COALESCE(sp.is_approved, s.is_approved, FALSE) AS is_approved,
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
             COALESCE(sp.verification_status, s.verification_status, CASE WHEN sp.is_approved OR s.is_approved THEN 'verified' WHEN sp.rejection_reason IS NOT NULL OR s.rejection_reason IS NOT NULL THEN 'rejected' ELSE 'pending_verification' END) AS verification_status,
             COALESCE(sp.commission_rate, s.commission_rate, 10.00) AS commission_rate,
             COALESCE(sp.applied_at, s.applied_at, u.created_at) AS applied_at,
             COALESCE(sp.approved_at, s.approved_at) AS approved_at,
             COALESCE(sp.rejection_reason, s.rejection_reason) AS rejection_reason,
             COALESCE(sp.is_admin_managed, s.is_admin_managed, FALSE) AS is_admin_managed,
             (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status != 'deleted') AS product_count,
             (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.seller_id = u.id AND o.payment_status = 'paid') AS total_revenue,
             (SELECT MAX(o2.created_at) FROM orders o2 WHERE o2.seller_id = u.id AND o2.payment_status = 'paid') AS last_order_at
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
              COALESCE(sp.is_approved, s.is_approved, FALSE) AS is_approved,
              COALESCE(sp.is_admin_managed, s.is_admin_managed, FALSE) AS is_admin_managed,
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
              COALESCE(sp.verification_status, s.verification_status, CASE WHEN sp.is_approved OR s.is_approved THEN 'verified' WHEN sp.rejection_reason IS NOT NULL OR s.rejection_reason IS NOT NULL THEN 'rejected' ELSE 'pending_verification' END) AS verification_status,
              COALESCE(sp.commission_rate, s.commission_rate, 10.00) AS commission_rate,
              COALESCE(sp.applied_at, s.applied_at, u.created_at) AS applied_at,
              COALESCE(sp.approved_at, s.approved_at) AS approved_at,
              COALESCE(sp.rejection_reason, s.rejection_reason) AS rejection_reason,
              (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status != 'deleted') AS product_count,
              (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.seller_id = u.id AND o.payment_status = 'paid') AS total_revenue,
              (SELECT MAX(o2.created_at) FROM orders o2 WHERE o2.seller_id = u.id AND o2.payment_status = 'paid') AS last_order_at
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE u.id::text = $1::text OR sp.id::text = $1::text OR s.id::text = $1::text`,
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

async function verifySellerKYC(req, res, next) {
  try {
    const rawId = req.params.sellerId || req.params.id;
    let { status, commissionRate, commission_rate, rejectionReason, rejection_reason, reason } = req.body;

    const finalCommission = commissionRate !== undefined ? commissionRate : commission_rate;
    const finalRejectionReason = rejectionReason || rejection_reason || reason || null;

    if (status === 'approve' || status === 'approved') status = 'verified';
    if (status === 'reject') status = 'rejected';

    const isApproved = status === 'verified';
    const rejectReason = status === 'rejected' ? (finalRejectionReason || 'Application criteria not met') : null;

    // Resolve target user_id
    const userRes = await query(
      `SELECT u.id, u.email, COALESCE(sp.store_name, s.store_name, 'Artisan Studio') as store_name
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE u.id::text = $1::text OR sp.id::text = $1::text OR s.id::text = $1::text`,
      [String(rawId)]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Seller not found.' });
    }

    const targetUserId = userRes.rows[0].id;
    const storeName = userRes.rows[0].store_name;
    const sellerEmail = userRes.rows[0].email;

    const result = await query(`
      UPDATE seller_profiles
      SET is_approved = $1,
          verification_status = $2,
          commission_rate = COALESCE($3, commission_rate),
          rejection_reason = $4,
          approved_at = CASE WHEN $1 = TRUE THEN NOW() ELSE approved_at END,
          updated_at = NOW()
      WHERE user_id::text = $5::text
      RETURNING *
    `, [isApproved, status, finalCommission !== undefined ? Number(finalCommission) : null, rejectReason, String(targetUserId)]);

    // Also sync master sellers table
    await query(`
      UPDATE sellers
      SET is_approved = $1,
          verification_status = $2,
          commission_rate = COALESCE($3, commission_rate),
          rejection_reason = $4,
          approved_at = CASE WHEN $1 = TRUE THEN NOW() ELSE approved_at END
      WHERE user_id::text = $5::text
    `, [isApproved, status, finalCommission !== undefined ? Number(finalCommission) : null, rejectReason, String(targetUserId)]).catch(() => {});

    // Ensure user role and status
    await query(`UPDATE users SET is_active = TRUE, role = 'seller' WHERE id::text = $1::text`, [String(targetUserId)]).catch(() => {});

    const { rows: userRows } = await query('SELECT name, email FROM users WHERE id::text = $1::text', [String(targetUserId)]);
    const sellerUser = userRows[0] || {};

    if (isApproved) {
      await emailService.sendSellerApprovalEmail(sellerUser.email || sellerEmail, result.rows[0]?.store_name || storeName).catch(() => {});
      await createNotification(
        targetUserId,
        'seller_approved',
        'Welcome to Tohfa Studio! 🎉',
        'Your artisan KYC application has been verified and approved. You can now publish handcrafted creations.'
      ).catch(() => {});
    } else if (status === 'rejected') {
      await emailService.sendSellerRejectionEmail(sellerUser.email || sellerEmail, result.rows[0]?.store_name || storeName, rejectReason).catch(() => {});
      await createNotification(
        targetUserId,
        'seller_rejected',
        'Seller Application Update',
        `Your seller verification application was not approved. Reason: ${rejectReason}`
      ).catch(() => {});
    }

    await logAdminAction({
      adminId: req.user.id,
      actionType: isApproved ? 'SELLER_KYC_APPROVED' : 'SELLER_KYC_REJECTED',
      targetEntity: 'sellers',
      targetId: targetUserId,
      details: { status, commissionRate: finalCommission, rejectionReason: rejectReason },
      ipAddress: req.ip
    });

    return res.status(200).json({
      success: true,
      message: `Seller KYC updated to ${status}.`,
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

async function suspendSeller(req, res, next) {
  try {
    const sellerId = req.params.sellerId || req.params.id;
    const reason = req.body.reason || req.body.ban_reason || 'Administrative suspension';

    await query('UPDATE users SET is_active = FALSE WHERE id::text = $1', [String(sellerId)])
      .catch(() => {});

    await query("UPDATE seller_profiles SET verification_status = 'suspended', is_approved = FALSE, updated_at = NOW() WHERE user_id::text = $1", [String(sellerId)])
      .catch(() => {});

    await query("UPDATE sellers SET verification_status = 'suspended', is_approved = FALSE WHERE user_id::text = $1", [String(sellerId)])
      .catch(() => {});

    await query("UPDATE products SET status = 'paused' WHERE seller_id::text = $1", [String(sellerId)])
      .catch(() => {});

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'SELLER_SUSPENDED',
      targetEntity: 'sellers',
      targetId: sellerId,
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
        const refundResult = await paymentService.refundPayment(paymentId, finalRefundAmt || order.total_amount, {
          reason: `Admin Forced Refund: ${reason}`,
          order_id: orderId
        });
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

    // Notify buyer & seller
    await createNotification(
      order.buyer_id,
      'refund_approved',
      'Refund Processed by Admin 💳',
      `An instant refund of ₹${(refundPaise / 100).toFixed(2)} for Order #${String(orderId).slice(0, 8).toUpperCase()} has been initiated.`,
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
    const activeVal = isActive !== undefined ? Boolean(isActive) : (is_active !== undefined ? Boolean(is_active) : false);
    const why = banReason || reason || '';

    const result = await query(`
      UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role, is_active
    `, [activeVal, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!activeVal) {
      await query("UPDATE products SET status = 'paused', is_active = FALSE WHERE seller_id = $1", [userId]).catch(() => {});
      await query("UPDATE seller_profiles SET is_active = FALSE WHERE user_id = $1", [userId]).catch(() => {});
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

    const eventQuery = event_type || action;
    if (eventQuery) {
      params.push(`%${eventQuery}%`);
      conditions.push(`(al.action_type ILIKE $${params.length} OR al.action ILIKE $${params.length})`);
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

    if (Array.isArray(images) && images.length > 0) {
      let sortOrder = 0;
      for (const img of images) {
        const url = typeof img === 'string' ? img : (img?.url || '');
        if (url) {
          await query(
            'INSERT INTO product_images (product_id, url, sort_order) VALUES ($1, $2, $3)',
            [newProduct.id, url, sortOrder++]
          );
        }
      }
    } else if (image_url) {
      await query(
        'INSERT INTO product_images (product_id, url, sort_order) VALUES ($1, $2, 0)',
        [newProduct.id, image_url]
      );
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
    } else if (image_url) {
      await query(
        `INSERT INTO product_images (product_id, url, sort_order) 
         VALUES ($1, $2, 0)
         ON CONFLICT DO NOTHING`,
        [id, image_url]
      ).catch(() => {});
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
    await query("UPDATE products SET status = 'deleted' WHERE id = $1", [id]);
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
    const { parent_id = null, sort_order = 0, description = '', emoji_icon, icon_emoji, image_url, banner_image_url, is_active = true } = req.body;

    if (!rawName) return res.status(400).json({ success: false, message: 'Category name is required.' });

    const name = rawName.trim();
    const slug = req.body.slug
      ? req.body.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const emoji = emoji_icon || icon_emoji || '🏺';
    const uploadedUrl = req.file ? req.file.path : null;
    const imgUrl = uploadedUrl || image_url || banner_image_url || null;

    const { rows } = await query(
      `INSERT INTO categories (name, display_name, slug, description, emoji_icon, icon_emoji, image_url, banner_image_url, parent_id, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $6, $7, $8, $9)
       RETURNING *`,
      [name, name, slug, description, emoji, imgUrl, parent_id || null, parseInt(sort_order, 10) || 0, is_active !== false]
    );

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'CATEGORY_CREATED',
      targetEntity: 'categories',
      targetId: rows[0].id,
      details: { name, slug },
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
    const rawName = req.body.display_name || req.body.name;
    const { parent_id = null, sort_order, is_active, description, emoji_icon, icon_emoji, image_url, banner_image_url } = req.body;

    const name = rawName ? rawName.trim() : null;
    const slug = name
      ? (req.body.slug
          ? req.body.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
      : (req.body.slug ? req.body.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null);

    const activeVal = is_active !== undefined ? (is_active === 'true' || is_active === true) : null;
    const emoji = emoji_icon || icon_emoji || null;
    const uploadedUrl = req.file ? req.file.path : null;
    const imgUrl = uploadedUrl || image_url || banner_image_url || null;

    const { rows } = await query(
      `UPDATE categories
       SET name             = COALESCE($1, name),
           display_name     = COALESCE($1, display_name, name),
           slug             = COALESCE($2, slug),
           parent_id        = $3,
           sort_order       = COALESCE($4, sort_order),
           is_active        = COALESCE($5, is_active),
           description      = COALESCE($6, description),
           emoji_icon       = COALESCE($7, emoji_icon),
           icon_emoji       = COALESCE($7, icon_emoji),
           image_url        = COALESCE($8, image_url),
           banner_image_url = COALESCE($8, banner_image_url),
           updated_at       = NOW()
       WHERE id = $9
       RETURNING *`,
      [name, slug, parent_id || null, sort_order ? parseInt(sort_order, 10) : null, activeVal, description !== undefined ? description : null, emoji, imgUrl, id]
    );

    if (!rows.length) return res.status(404).json({ success: false, message: 'Category not found.' });

    return res.json({ success: true, data: { ...rows[0], display_name: rows[0].name } });
  } catch (err) {
    next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    await query('UPDATE categories SET is_active = FALSE WHERE id = $1', [id]);
    await logAdminAction({
      adminId: req.user.id,
      actionType: 'CATEGORY_DELETED',
      targetEntity: 'categories',
      targetId: id,
      details: {},
      ipAddress: req.ip
    });
    return res.json({ success: true, message: 'Category deactivated.' });
  } catch (err) {
    next(err);
  }
}

async function createSubcategory(req, res, next) {
  try {
    const { category_id, name, slug: rawSlug } = req.body;
    if (!category_id || !name) return res.status(400).json({ success: false, message: 'category_id and name are required.' });
    const trimmedName = name.trim();
    const slug = rawSlug
      ? rawSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const { rows } = await query(
      `INSERT INTO categories (name, display_name, slug, parent_id, sort_order, is_active)
       VALUES ($1, $1, $2, $3, 0, TRUE)
       RETURNING *`,
      [trimmedName, slug, category_id]
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
    const { rows } = await query('SELECT * FROM banners ORDER BY sort_order ASC');
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
      SELECT u.id, u.name, u.email, u.phone, u.profile_photo_url, u.is_active,
             sp.store_name, sp.slug, sp.bio, sp.pickup_address, sp.is_approved,
             sp.verification_status, sp.is_admin_managed, sp.created_at, sp.updated_at,
             (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status != 'deleted') AS product_count,
             (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.seller_id = u.id AND o.payment_status = 'paid') AS total_revenue,
             (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id) AS total_orders
      FROM users u
      JOIN seller_profiles sp ON sp.user_id = u.id
      WHERE sp.is_admin_managed = TRUE
      ORDER BY sp.created_at ASC
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
         VALUES ($1, $1, $1, $2, $3, $4, 'seller', TRUE)
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
       VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, 'verified', TRUE)
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
       VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, 'verified', TRUE, 'Artisan')
       ON CONFLICT (user_id) DO UPDATE SET
         store_name = EXCLUDED.store_name,
         slug = EXCLUDED.slug,
         bio = EXCLUDED.bio,
         pickup_address = EXCLUDED.pickup_address,
         is_admin_managed = TRUE,
         is_approved = TRUE,
         verification_status = 'verified',
         is_active = TRUE,
         seller_type = 'Artisan',
         updated_at = NOW()
       RETURNING *`,
      [userId, store_name, cleanSlug, bio || '', pickupAddressJson]
    );

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
    const { store_name, bio, pickup_address, is_active } = req.body;

    const { rows } = await query(
      `UPDATE seller_profiles
       SET store_name = COALESCE($1, store_name),
           bio = COALESCE($2, bio),
           pickup_address = COALESCE($3, pickup_address),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE (user_id::text = $5 OR id::text = $5) AND is_admin_managed = TRUE
       RETURNING *`,
      [
        store_name || null,
        bio || null,
        pickup_address ? (typeof pickup_address === 'string' ? pickup_address : JSON.stringify(pickup_address)) : null,
        is_active !== undefined ? Boolean(is_active) : null,
        shopId
      ]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Tohfa Special shop not found.' });
    }

    return res.json({ success: true, message: 'Tohfa Special shop updated.', data: rows[0] });
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
         AND (sp.is_admin_managed = TRUE OR s.is_admin_managed = TRUE)`,
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
        COALESCE(SUM(CASE WHEN sp.is_admin_managed = TRUE THEN o.total_amount ELSE 0 END), 0) AS tofa_special_revenue,
        COALESCE(SUM(CASE WHEN sp.is_admin_managed = FALSE OR sp.is_admin_managed IS NULL THEN o.total_amount ELSE 0 END), 0) AS marketplace_revenue,
        COUNT(CASE WHEN sp.is_admin_managed = TRUE THEN 1 END) AS tofa_special_orders,
        COUNT(CASE WHEN sp.is_admin_managed = FALSE OR sp.is_admin_managed IS NULL THEN 1 END) AS marketplace_orders,
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
    const { rows } = await query('SELECT details, meta FROM audit_logs WHERE id = $1', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Log not found.' });
    }
    const details = rows[0].details || rows[0].meta || {};
    return res.json({
      success: true,
      data: {
        before_json: details.before ? JSON.stringify(details.before) : null,
        after_json: details.after ? JSON.stringify(details.after) : JSON.stringify(details)
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPlatformStats,
  listSellers,
  getAllSellers: listSellers,
  getSellerDetail,
  getSellerDetails: getSellerDetail,
  verifySellerKYC,
  approveSeller,
  rejectSeller,
  suspendSeller,
  banSeller,
  forceRefundOrder,
  forceUpdateOrderStatus,
  getPendingPayouts,
  disburseSellerPayout,
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
};
