/**
 * Tohfa v2 — Payment Controller
 * File: backend/src/controllers/payment.controller.js
 * Role: Handles Razorpay payment intent creation, verification, and logistics triggers.
 */
'use strict';

const crypto = require('crypto');
const paymentService = require('../services/payment.service');
const logisticsService = require('../services/logistics.service');
const whatsappService = require('../services/whatsapp.service');
const bestsellerService = require('../services/bestseller.service');
const ownerNotifyService = require('../services/ownerNotify.service');
const emailService = require('../services/email.service');
const { query, getClient } = require('../config/db');

/**
 * POST /api/payments/create-order
 * Buyer creates a Razorpay order for an unpaid order
 */
async function createOrder(req, res, next) {
  try {
    const orderId = req.body.orderId || req.body.order_id;
    const buyerId = req.user.id;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId or order_id is required.' });
    }

    const { rows } = await query(
      'SELECT * FROM orders WHERE id = $1 AND buyer_id = $2',
      [orderId, buyerId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = rows[0];
    if (order.payment_status === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid.' });
    }

    const razorpayOrder = await paymentService.createRazorpayOrder(
      order.total_amount,
      order.id,
      req.body.preferredAccount || 'primary'
    );

    // Save payment record with gateway_account tracking
    await query(
      `INSERT INTO payments (order_id, razorpay_order_id, amount, status, gateway_account)
       VALUES ($1, $2, $3, 'created', $4)
       ON CONFLICT (razorpay_order_id) DO UPDATE SET gateway_account = EXCLUDED.gateway_account`,
      [order.id, razorpayOrder.id, order.total_amount, razorpayOrder.gatewayAccount || 'primary']
    );

    // Fetch user details for prefill
    const { rows: userRows } = await query('SELECT name, email, phone FROM users WHERE id = $1', [buyerId]);
    const user = userRows[0] || {};

    const keyId = razorpayOrder.keyId || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_PRIMARY_KEY_ID || 'rzp_test_placeholder';
    const amountPaise = razorpayOrder.amount || (order.total_paise ? Number(order.total_paise) : Math.round(Number(order.total_amount) * 100));

    return res.json({
      success: true,
      data: {
        orderId: order.id,
        order_id: order.id,
        amount: amountPaise,
        amount_paise: amountPaise,
        razorpayKeyId: keyId,
        key_id: keyId,
        razorpay_order_id: razorpayOrder.id,
        gateway_account: razorpayOrder.gatewayAccount || 'primary',
        currency: 'INR',
        name: 'Tohfa Gifting',
        description: `Order #${String(order.id).slice(0, 8)}`,
        prefill: {
          name: user.name || '',
          email: user.email || '',
          contact: user.phone || '',
        },
      },
    });
  } catch (err) {
    console.error('[Payment createOrder error]:', err);
    if (err.statusCode === 401 || err.status === 401) {
      return res.status(502).json({
        success: false,
        message: 'Payment gateway authentication failed. Please verify Razorpay API keys in backend/.env',
        code: 'GATEWAY_AUTH_ERROR'
      });
    }
    next(err);
  }
}

/**
 * POST /api/payments/verify
 * Verifies Razorpay payment signature & dispatches logistics + alerts
 * Uses SELECT ... FOR UPDATE row locking and status guards against race conditions (BUG-02)
 */
async function verifyPayment(req, res, next) {
  const client = await getClient();
  try {
    const orderId = req.body.orderId || req.body.order_id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment verification parameters.',
      });
    }

    // SECURITY: Reject verification if Razorpay is not properly configured.
    // Prevents forged signatures against the known fallback 'placeholder_secret'.
    const primaryKeyId = process.env.RAZORPAY_PRIMARY_KEY_ID || process.env.RAZORPAY_KEY_ID || '';
    const primarySecret = process.env.RAZORPAY_PRIMARY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || '';
    const isPlaceholder =
      !primaryKeyId ||
      primaryKeyId === 'rzp_test_placeholder' ||
      primaryKeyId === 'YOUR_RAZORPAY_KEY_ID' ||
      primaryKeyId.includes('placeholder') ||
      primaryKeyId.includes('YOUR_') ||
      !primarySecret ||
      primarySecret === 'placeholder_secret' ||
      primarySecret === 'YOUR_RAZORPAY_KEY_SECRET' ||
      primarySecret.includes('placeholder') ||
      primarySecret.includes('YOUR_');

    if (isPlaceholder) {
      console.error('[SECURITY] Payment verification blocked: Razorpay keys are not configured. Set RAZORPAY_PRIMARY_KEY_ID and RAZORPAY_PRIMARY_KEY_SECRET in environment variables.');
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured. Please contact support.',
      });
    }

    // SECURITY: Reject obviously fake payment/order IDs used by test-mode mock bypass.
    if (
      String(razorpay_payment_id).startsWith('mock_pay_') ||
      String(razorpay_order_id) === 'mock_order_id' ||
      String(razorpay_signature) === 'mock_signature'
    ) {
      console.warn('[SECURITY] Payment verification blocked: mock/test payment IDs rejected in live endpoint.');
      return res.status(400).json({
        success: false,
        message: 'Invalid payment data.',
      });
    }

    // Lookup which gateway account handled this order
    const { rows: payRows } = await query(
      'SELECT gateway_account FROM payments WHERE razorpay_order_id = $1 LIMIT 1',
      [razorpay_order_id]
    );
    const gatewayAccount = payRows[0]?.gateway_account || null;

    const isValid = paymentService.verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      gatewayAccount
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Payment signature verification failed.',
      });
    }

    await client.query('BEGIN');

    const result = await paymentService.markOrderPaid(
      orderId,
      { razorpay_payment_id, razorpay_order_id, razorpay_signature, gateway_account: gatewayAccount },
      client
    );

    await client.query('COMMIT');

    if (result.alreadyProcessed) {
      return res.json({
        success: true,
        data: {
          message: 'Payment already verified and order confirmed.',
          orderId,
          order_id: orderId,
          alreadyProcessed: true,
        },
      });
    }

    const confirmedOrder = result.order;

    // Trigger logistics & notifications post-commit (errors here must not fail the verified payment)
    logisticsService.createShipment(confirmedOrder, { fromPayment: true }).catch(e => console.error('[Logistics Dispatch Error]:', e.message));
    bestsellerService.recomputeForOrder(confirmedOrder.id || orderId).catch(e => console.error('[Bestseller Recompute Error]:', e.message));

    // Send Order Confirmation Email to Buyer (awaited inside try/catch so Render free tier does not kill the socket)
    try {
      const [buyerRes, itemsRes] = await Promise.all([
        query('SELECT email, name FROM users WHERE id = $1', [confirmedOrder.buyer_id]),
        query(
          `SELECT COALESCE(p.name, 'Handcrafted Gift') AS name, oi.quantity
           FROM order_items oi
           LEFT JOIN products p ON p.id = oi.product_id
           WHERE oi.order_id = $1`,
          [confirmedOrder.id]
        ),
      ]);
      const buyer = buyerRes.rows[0] || {};
      const recipientEmail = buyer.email || req.user?.email;
      if (recipientEmail) {
        await emailService.sendOrderConfirmationEmail(recipientEmail, {
          orderId: String(confirmedOrder.id).slice(0, 8),
          buyerName: buyer.name || req.user?.name || 'Customer',
          totalAmount: confirmedOrder.total_amount,
          items: itemsRes.rows || [],
        });
      }
    } catch (emailErr) {
      console.error('[Payment] Order confirmation email error:', emailErr.message);
    }

    // Notify seller(s) via WhatsApp (and admin email if special)
    try {
      const { rows: sellerOrderRows } = await query(
        `SELECT so.id AS seller_order_id,
                so.seller_id,
                so.subtotal,
                u.name,
                COALESCE(sp.whatsapp_number, s.whatsapp_number, u.phone) AS whatsapp_number,
                (COALESCE(sp.is_admin_managed::text, s.is_admin_managed::text, 'false') IN ('true', 't', '1')) AS is_admin_managed,
                COALESCE(sp.store_name, s.store_name, u.name) AS store_name
         FROM seller_orders so
         JOIN users u ON u.id = so.seller_id
         LEFT JOIN seller_profiles sp ON sp.user_id = u.id
         LEFT JOIN sellers s ON s.user_id = u.id
         WHERE so.order_id = $1`,
        [confirmedOrder.id]
      );
      let sellersToNotify = sellerOrderRows;

      // Fallback to confirmedOrder.seller_id if no sub-orders exist
      if (!sellersToNotify.length && confirmedOrder.seller_id) {
        const { rows: fallbackRows } = await query(
          `SELECT NULL AS seller_order_id,
                  u.id AS seller_id,
                  $2::numeric AS subtotal,
                  u.name,
                  COALESCE(sp.whatsapp_number, s.whatsapp_number, u.phone) AS whatsapp_number,
                  (COALESCE(sp.is_admin_managed::text, s.is_admin_managed::text, 'false') IN ('true', 't', '1')) AS is_admin_managed,
                  COALESCE(sp.store_name, s.store_name, u.name) AS store_name
           FROM users u
           LEFT JOIN seller_profiles sp ON sp.user_id = u.id
           LEFT JOIN sellers s ON s.user_id = u.id
           WHERE u.id = $1`,
          [confirmedOrder.seller_id, confirmedOrder.total_amount]
        );
        sellersToNotify = fallbackRows;
      }

      for (const seller of sellersToNotify) {
        if (seller.whatsapp_number) {
          whatsappService.sendSellerOrderNotification(seller.whatsapp_number, {
            orderId: confirmedOrder.id,
            sellerOrderId: seller.seller_order_id || null,
            sellerId: seller.seller_id,
            recipientUserId: seller.seller_id,
            buyerName: req.user?.name || 'Customer',
            amount: seller.subtotal || confirmedOrder.total_amount,
          }).catch(e => console.error('[WhatsApp Seller Alert Error]:', e.message));
        }

        if (seller.is_admin_managed) {
          // Admin alert for special orders
          await ownerNotifyService.sendAdminAlertEmail('special_order', {
            id: confirmedOrder.id,
            orderId: String(confirmedOrder.id).slice(0, 8),
            shopName: seller.store_name || seller.name || 'Special Shop',
            buyerName: req.user?.name || 'Customer',
            amount: seller.subtotal || confirmedOrder.total_amount,
            link: 'https://thetohfa.in/admin/special-orders.html',
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Seller Query Error]:', e.message);
    }

    // In-app notification for buyer
    query(
      `INSERT INTO notifications (user_id, type, title, body, meta)
       VALUES ($1, 'order_confirmed', 'Order Confirmed!', $2, $3)`,
      [
        confirmedOrder.buyer_id,
        `Your payment for Order #${String(confirmedOrder.id).slice(0, 8)} was successful. The artisan has started preparing it.`,
        JSON.stringify({ orderId: confirmedOrder.id }),
      ]
    ).catch(e => console.error('[Notification Insert Error]:', e.message));

    // In-app notification for seller(s) on confirmed payment
    query(
      `SELECT seller_id, id AS seller_order_id FROM seller_orders WHERE order_id = $1`,
      [confirmedOrder.id || orderId]
    ).then(({ rows: sOrders }) => {
      sOrders.forEach(so => {
        query(
          `INSERT INTO notifications (user_id, type, title, body, meta)
           VALUES ($1, 'new_order', 'New Order Received! 🎁', $2, $3)`,
          [
            so.seller_id,
            `You have a confirmed sub-order #${String(so.seller_order_id).slice(0, 8)} in Order #${String(confirmedOrder.id || orderId).slice(0, 8)}.`,
            JSON.stringify({ order_id: confirmedOrder.id || orderId, seller_order_id: so.seller_order_id })
          ]
        ).catch(() => {});
      });
    }).catch(e => console.error('[Seller Notification Error]:', e.message));

    return res.json({
      success: true,
      data: {
        message: 'Payment verified and order confirmed.',
        orderId,
        order_id: orderId,
        order: confirmedOrder,
      },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/payments/test-pay
 * Instant test mode payment confirmation helper
 */
async function testPay(req, res, next) {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_TEST_PAY !== 'true') {
    return res.status(403).json({
      success: false,
      message: 'Test payment bypass is disabled in this environment. Please complete payment through Razorpay.',
    });
  }

  const client = await getClient();
  try {
    const orderId = req.body.orderId || req.body.order_id;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId or order_id is required.' });
    }

    const { rows } = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    const order = rows[0];

    const primarySecret = process.env.RAZORPAY_PRIMARY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || 'a83Jah98nRJs5Etu50o0a2P9';
    const razorpay_order_id = req.body.razorpay_order_id || `order_test_${Date.now()}`;
    const razorpay_payment_id = `pay_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const razorpay_signature = crypto.createHmac('sha256', primarySecret).update(payload).digest('hex');

    await client.query('BEGIN');

    const result = await paymentService.markOrderPaid(
      order.id,
      { razorpay_payment_id, razorpay_order_id, razorpay_signature, gateway_account: 'primary' },
      client
    );

    await client.query('COMMIT');

    logisticsService.createShipment(result.order, { fromPayment: true }).catch(() => {});
    bestsellerService.recomputeForOrder(order.id).catch(() => {});

    return res.json({
      success: true,
      data: {
        message: 'Test payment verified and order confirmed.',
        orderId: order.id,
        order_id: order.id,
        order: result.order,
      },
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    next(err);
  } finally {
    client.release();
  }
}

/**
 * GET /api/payments/status/:orderId
 */
async function getPaymentStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const { rows } = await query(
      'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [orderId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrder,
  verifyPayment,
  testPay,
  getPaymentStatus,
};
