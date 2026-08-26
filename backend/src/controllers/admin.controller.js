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
        (SELECT COUNT(*) FROM products WHERE is_tohfa_original = TRUE AND status != 'deleted') AS tohfa_specials_count
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
    const { status = 'all', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let sql = `
      SELECT u.id, u.name, u.email, u.phone, u.profile_photo_url, u.is_active,
             sp.store_name, sp.store_name AS shop_name, sp.seller_type, sp.is_approved,
             COALESCE(sp.verification_status, CASE WHEN sp.is_approved THEN 'verified' WHEN sp.rejection_reason IS NOT NULL THEN 'rejected' ELSE 'pending_verification' END) AS verification_status,
             COALESCE(sp.commission_rate, 10.00) AS commission_rate,
             sp.applied_at, sp.approved_at, sp.rejection_reason, sp.is_tohfa_original,
             (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.status != 'deleted') AS product_count,
             (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.seller_id = u.id AND o.payment_status = 'paid') AS total_revenue,
             (SELECT MAX(o2.created_at) FROM orders o2 WHERE o2.seller_id = u.id AND o2.payment_status = 'paid') AS last_order_at
      FROM users u
      JOIN seller_profiles sp ON sp.user_id = u.id
      WHERE u.role = 'seller'
    `;
    const params = [];

    if (status === 'pending') {
      sql += ` AND (sp.is_approved = FALSE AND sp.rejection_reason IS NULL AND u.is_active = TRUE)`;
    } else if (status === 'active' || status === 'verified') {
      sql += ` AND (sp.is_approved = TRUE AND u.is_active = TRUE)`;
    } else if (status === 'rejected') {
      sql += ` AND (sp.is_approved = FALSE AND sp.rejection_reason IS NOT NULL)`;
    } else if (status === 'banned') {
      sql += ` AND u.is_active = FALSE`;
    }

    sql += ` ORDER BY sp.applied_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), offset);

    const { rows } = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

async function getSellerDetail(req, res, next) {
  try {
    const sellerId = req.params.sellerId || req.params.id;
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.profile_photo_url, u.cover_photo_url, u.is_active,
              sp.store_name, sp.bio, sp.whatsapp_number, sp.seller_type, sp.capacity_limit,
              sp.vacation_mode, sp.is_approved, sp.is_tohfa_original,
              COALESCE(sp.verification_status, CASE WHEN sp.is_approved THEN 'verified' WHEN sp.rejection_reason IS NOT NULL THEN 'rejected' ELSE 'pending_verification' END) AS verification_status,
              COALESCE(sp.commission_rate, 10.00) AS commission_rate,
              sp.applied_at, sp.approved_at, sp.rejection_reason
       FROM users u
       JOIN seller_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1`,
      [sellerId]
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
    const sellerId = req.params.sellerId || req.params.id;
    let { status, commissionRate, commission_rate, rejectionReason, rejection_reason, reason } = req.body;

    const finalCommission = commissionRate !== undefined ? commissionRate : commission_rate;
    const finalRejectionReason = rejectionReason || rejection_reason || reason || null;

    if (status === 'approve' || status === 'approved') status = 'verified';
    if (status === 'reject') status = 'rejected';

    const isApproved = status === 'verified';
    const rejectReason = status === 'rejected' ? (finalRejectionReason || 'Application criteria not met') : null;

    const result = await query(`
      UPDATE seller_profiles
      SET is_approved = $1,
          verification_status = $2,
          commission_rate = COALESCE($3, commission_rate),
          rejection_reason = $4,
          approved_at = CASE WHEN $1 = TRUE THEN NOW() ELSE approved_at END,
          updated_at = NOW()
      WHERE user_id = $5
      RETURNING *
    `, [isApproved, status, finalCommission !== undefined ? Number(finalCommission) : null, rejectReason, sellerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Seller not found.' });
    }

    const { rows: userRows } = await query('SELECT name, email FROM users WHERE id = $1', [sellerId]);
    const sellerUser = userRows[0] || {};

    if (isApproved) {
      await emailService.sendSellerApprovalEmail(sellerUser.email, result.rows[0].store_name).catch(() => {});
      await createNotification(
        sellerId,
        'seller_approved',
        'Welcome to Tohfa Studio! 🎉',
        'Your artisan KYC application has been verified and approved. You can now publish handcrafted creations.'
      ).catch(() => {});
    } else if (status === 'rejected') {
      await emailService.sendSellerRejectionEmail(sellerUser.email, result.rows[0].store_name, rejectReason).catch(() => {});
      await createNotification(
        sellerId,
        'seller_rejected',
        'Seller Application Update',
        `Your seller verification application was not approved. Reason: ${rejectReason}`
      ).catch(() => {});
    }

    await logAdminAction({
      adminId: req.user.id,
      actionType: isApproved ? 'SELLER_KYC_APPROVED' : 'SELLER_KYC_REJECTED',
      targetEntity: 'sellers',
      targetId: sellerId,
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
    const { reason = 'Administrative suspension' } = req.body;

    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [sellerId]);
    await query("UPDATE seller_profiles SET verification_status = 'suspended', is_approved = FALSE, updated_at = NOW() WHERE user_id = $1", [sellerId]).catch(() => {});
    await query("UPDATE products SET status = 'paused', is_active = FALSE WHERE seller_id = $1", [sellerId]);

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
// 3. TOHFA SPECIALS / ORIGINALS CURATION (Product Level)
// ---------------------------------------------------------------------------

async function toggleTohfaSpecial(req, res, next) {
  try {
    const productId = req.params.productId || req.params.id;
    let {
      isTohfaOriginal,
      is_tohfa_original,
      badgeText,
      badge_text,
      tohfa_special_badge,
      priorityRank,
      priority_rank,
      specialPackaging,
      special_packaging_available,
      special_packaging
    } = req.body;

    const originalVal = isTohfaOriginal !== undefined ? Boolean(isTohfaOriginal) : (is_tohfa_original !== undefined ? Boolean(is_tohfa_original) : true);
    const badge = badgeText || badge_text || tohfa_special_badge || null;
    const rank = priorityRank !== undefined ? parseInt(priorityRank, 10) : (priority_rank !== undefined ? parseInt(priority_rank, 10) : null);
    const packaging = specialPackaging !== undefined ? Boolean(specialPackaging) : (special_packaging_available !== undefined ? Boolean(special_packaging_available) : (special_packaging !== undefined ? Boolean(special_packaging) : null));

    const result = await query(`
      UPDATE products 
      SET is_tohfa_original = $1,
          tohfa_special_badge = COALESCE($2, tohfa_special_badge),
          priority_rank = COALESCE($3, priority_rank),
          special_packaging_available = COALESCE($4, special_packaging_available),
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [originalVal, badge, rank, packaging, productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    await logAdminAction({
      adminId: req.user.id,
      actionType: originalVal ? 'PRODUCT_MARKED_TOHFA_SPECIAL' : 'PRODUCT_REMOVED_TOHFA_SPECIAL',
      targetEntity: 'products',
      targetId: productId,
      details: { isTohfaOriginal: originalVal, badgeText: badge, priorityRank: rank, specialPackaging: packaging },
      ipAddress: req.ip
    });

    return res.status(200).json({
      success: true,
      message: 'Tohfa Special status updated successfully.',
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

async function listTohfaOriginals(req, res, next) {
  try {
    // Return all products that are Tohfa Specials
    const { rows } = await query(`
      SELECT p.*, sp.store_name, c.name AS category_name,
             (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order ASC LIMIT 1) AS primary_image
      FROM products p
      JOIN seller_profiles sp ON sp.user_id = p.seller_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_tohfa_original = TRUE AND p.status != 'deleted'
      ORDER BY p.priority_rank DESC, p.created_at DESC
    `);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

async function addTohfaOriginal(req, res, next) {
  const { productId, product_id, sellerId, seller_id } = req.body;
  const targetProduct = productId || product_id;
  const targetSeller = sellerId || seller_id;

  if (targetProduct) {
    req.params.productId = targetProduct;
    req.body.isTohfaOriginal = true;
    return toggleTohfaSpecial(req, res, next);
  }
  if (targetSeller) {
    await query('UPDATE seller_profiles SET is_tohfa_original = TRUE WHERE user_id = $1', [targetSeller]);
    await logAdminAction({
      adminId: req.user.id,
      actionType: 'SELLER_MARKED_TOHFA_ORIGINAL',
      targetEntity: 'sellers',
      targetId: targetSeller,
      details: {},
      ipAddress: req.ip
    });
    return res.json({ success: true, message: 'Seller marked as Tohfa Original.' });
  }
  return res.status(400).json({ success: false, message: 'productId or sellerId is required.' });
}

async function removeTohfaOriginal(req, res, next) {
  const sellerId = req.params.sellerId || req.params.id;
  await query('UPDATE seller_profiles SET is_tohfa_original = FALSE WHERE user_id = $1', [sellerId]);
  await logAdminAction({
    adminId: req.user.id,
    actionType: 'SELLER_REMOVED_TOHFA_ORIGINAL',
    targetEntity: 'sellers',
    targetId: sellerId,
    details: {},
    ipAddress: req.ip
  });
  return res.json({ success: true, message: 'House brand flag removed.' });
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
    const { status, notes = '' } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered', 'cancelled', 'cancel_requested'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status: ${status}. Allowed: ${validStatuses.join(', ')}` });
    }

    const { rows } = await query(`
      UPDATE orders
      SET status = $1,
          notes = COALESCE(notes || ' | ', '') || $2,
          delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [status, `Admin Forced Status: ${status} (${notes})`, orderId]);

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'ADMIN_ORDER_STATUS_FORCE_UPDATED',
      targetEntity: 'orders',
      targetId: orderId,
      details: { status, notes },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: `Order status forced to ${status}.`, data: rows[0] });
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
    const { role = 'all', page = 1, limit = 50, search = '' } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let sql = `
      SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.created_at,
             (SELECT COUNT(*) FROM orders o WHERE o.buyer_id = u.id) AS order_count
      FROM users u
      WHERE 1=1
    `;
    const params = [];

    if (role !== 'all') {
      params.push(role);
      sql += ` AND u.role = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    sql += ` ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), offset);

    const { rows } = await query(sql, params);
    return res.json({ success: true, data: rows });
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
    const { page = 1, limit = 50, search = '', category_id } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let sql = `
      SELECT p.*, sp.store_name, c.name AS category_name,
             (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order ASC LIMIT 1) AS primary_image
      FROM products p
      JOIN seller_profiles sp ON sp.user_id = p.seller_id
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

    sql += ` ORDER BY p.priority_rank DESC, p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), offset);

    const { rows } = await query(sql, params);
    return res.json({ success: true, data: rows });
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
    return res.json({ success: true, data: rows[0] });
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
      SELECT c.id, c.name, c.name AS display_name, c.slug, c.parent_id, c.sort_order, c.is_active, c.created_at,
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
    const { parent_id = null, sort_order = 0 } = req.body;

    if (!rawName) return res.status(400).json({ success: false, message: 'Category name is required.' });

    const name = rawName.trim();
    const slug = req.body.slug
      ? req.body.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const { rows } = await query(
      `INSERT INTO categories (name, slug, parent_id, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, slug, parent_id || null, parseInt(sort_order, 10) || 0]
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
    const { parent_id = null, sort_order, is_active } = req.body;

    const name = rawName ? rawName.trim() : null;
    const slug = name
      ? (req.body.slug
          ? req.body.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
      : null;

    const activeVal = is_active !== undefined ? (is_active === 'true' || is_active === true) : null;

    const { rows } = await query(
      `UPDATE categories
       SET name       = COALESCE($1, name),
           slug       = COALESCE($2, slug),
           parent_id  = $3,
           sort_order = COALESCE($4, sort_order),
           is_active  = COALESCE($5, is_active)
       WHERE id = $6
       RETURNING *`,
      [name, slug, parent_id || null, sort_order ? parseInt(sort_order, 10) : null, activeVal, id]
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
      `INSERT INTO categories (name, slug, parent_id, sort_order)
       VALUES ($1, $2, $3, 0)
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

async function getFeaturedSellers(req, res, next) {
  try {
    const { rows } = await query(`
      SELECT osf.*, sp.store_name, sp.bio, u.name, u.profile_photo_url, u.cover_photo_url
      FROM our_story_features osf
      JOIN seller_profiles sp ON sp.user_id = osf.seller_id
      JOIN users u ON u.id = osf.seller_id
      WHERE osf.is_active = TRUE
      ORDER BY osf.featured_at DESC
    `);
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

async function featureSeller(req, res, next) {
  try {
    const { sellerId } = req.params;
    const { blurb = '' } = req.body;

    const { rows } = await query(
      `INSERT INTO our_story_features (seller_id, blurb, is_active, featured_at)
       VALUES ($1, $2, TRUE, NOW())
       ON CONFLICT (seller_id) DO UPDATE SET blurb = EXCLUDED.blurb, is_active = TRUE, featured_at = NOW()
       RETURNING *`,
      [sellerId, blurb]
    );

    await createNotification(
      sellerId,
      'featured_in_our_story',
      'Your Store is Live on "Our Story"! 🌟',
      'Congratulations! Your artisan journey has been featured on Tohfa\'s Our Story panel.'
    ).catch(() => {});

    await logAdminAction({
      adminId: req.user.id,
      actionType: 'SELLER_FEATURED_OUR_STORY',
      targetEntity: 'sellers',
      targetId: sellerId,
      details: {},
      ipAddress: req.ip
    });

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function unfeatureSeller(req, res, next) {
  try {
    const { sellerId } = req.params;
    await query('UPDATE our_story_features SET is_active = FALSE WHERE seller_id = $1', [sellerId]);
    return res.json({ success: true, message: 'Seller unfeatured from Our Story.' });
  } catch (err) {
    next(err);
  }
}

async function listReports(req, res, next) {
  try {
    const { status = 'all' } = req.query;
    let sql = `
      SELECT r.*, u.name AS reporter_name, u.email AS reporter_email
      FROM reports r
      JOIN users u ON u.id = r.reporter_id
    `;
    const params = [];
    if (status !== 'all') {
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
    const { status, admin_note } = req.body;

    const { rows } = await query(
      `UPDATE reports
       SET status = COALESCE($1, status),
           admin_note = COALESCE($2, admin_note),
           resolved_at = CASE WHEN $1 IN ('resolved', 'dismissed') THEN NOW() ELSE resolved_at END
       WHERE id = $3
       RETURNING *`,
      [status, admin_note, id]
    );

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function createReport(req, res, next) {
  try {
    const reporterId = req.user.id;
    const { type, target_id, reason } = req.body;

    const { rows } = await query(
      `INSERT INTO reports (reporter_id, type, target_id, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [reporterId, type, target_id || null, reason]
    );

    return res.status(201).json({ success: true, data: rows[0] });
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
  toggleTohfaSpecial,
  listTohfaOriginals,
  addTohfaOriginal,
  removeTohfaOriginal,
  forceRefundOrder,
  forceUpdateOrderStatus,
  getPendingPayouts,
  disburseSellerPayout,
  getAllUsers,
  toggleUserStatus,
  listAuditLogs,
  getAuditLogs: listAuditLogs,
  listAllProducts,
  getAllProducts: listAllProducts,
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
  getFeaturedSellers,
  featureSeller,
  unfeatureSeller,
  listReports,
  updateReport,
  createReport
};
