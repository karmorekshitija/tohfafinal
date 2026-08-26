/**
 * Tohfa v2 — Payment Controller
 * File: backend/src/controllers/payment.controller.js
 * Role: Handles Razorpay payment intent creation, verification, and logistics triggers.
 */
'use strict';

const paymentService = require('../services/payment.service');
const logisticsService = require('../services/logistics.service');
const whatsappService = require('../services/whatsapp.service');
const { query, getClient } = require('../config/db');

/**
 * POST /api/payments/create-order
 * Buyer creates a Razorpay order for an unpaid order
 */
async function createOrder(req, res, next) {
  try {
    const { orderId } = req.body;
    const buyerId = req.user.id;

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
      order.id
    );

    // Save payment record
    await query(
      `INSERT INTO payments (order_id, razorpay_order_id, amount, status)
       VALUES ($1, $2, $3, 'created')
       ON CONFLICT (razorpay_order_id) DO NOTHING`,
      [order.id, razorpayOrder.id, order.total_amount]
    );

    // Fetch user details for prefill
    const { rows: userRows } = await query('SELECT name, email, phone FROM users WHERE id = $1', [buyerId]);
    const user = userRows[0] || {};

    return res.json({
      success: true,
      data: {
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
        razorpay_order_id: razorpayOrder.id,
        amount: order.total_amount,
        currency: 'INR',
        name: 'Tohfa Gifting',
        description: `Order #${String(order.id).slice(0, 8)}`,
        prefill: {
          name: user.name || '',
          email: user.email || '',
          contact: user.phone || '',
        },
        orderId: order.id,
      },
    });
  } catch (err) {
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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment verification parameters.',
      });
    }

    const isValid = paymentService.verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
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
      { razorpay_payment_id, razorpay_order_id, razorpay_signature },
      client
    );

    await client.query('COMMIT');

    if (result.alreadyProcessed) {
      return res.json({
        success: true,
        data: {
          message: 'Payment already verified and order confirmed.',
          orderId,
          alreadyProcessed: true,
        },
      });
    }

    const confirmedOrder = result.order;

    // Trigger logistics & notifications post-commit (errors here must not fail the verified payment)
    logisticsService.createShipment(confirmedOrder).catch(e => console.error('[Logistics Dispatch Error]:', e.message));


    // Notify seller via WhatsApp
    query(
      `SELECT sp.whatsapp_number, u.name 
       FROM seller_profiles sp 
       JOIN users u ON u.id = sp.user_id 
       WHERE sp.user_id = $1`,
      [confirmedOrder.seller_id]
    ).then(({ rows: sellerRows }) => {
      if (sellerRows.length && sellerRows[0].whatsapp_number) {
        whatsappService.sendSellerOrderNotification(sellerRows[0].whatsapp_number, {
          orderId: confirmedOrder.id,
          buyerName: req.user?.name || 'Customer',
          amount: confirmedOrder.total_amount,
        }).catch(e => console.error('[WhatsApp Seller Alert Error]:', e.message));
      }
    }).catch(e => console.error('[Seller Query Error]:', e.message));

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

    return res.json({
      success: true,
      data: {
        message: 'Payment verified and order confirmed.',
        orderId,
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
  getPaymentStatus,
};
