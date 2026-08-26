/**
 * Tohfa v2 — Payment Service
 * File: backend/src/services/payment.service.js
 * Role: Razorpay order creation, HMAC SHA256 signature verification, and refunds.
 */
'use strict';

const crypto = require('crypto');
const razorpay = require('../config/razorpay');

/**
 * Create a Razorpay Order
 * @param {number} amountINR - Amount in INR (will be converted strictly to integer paise)
 * @param {string} orderReference - Internal reference / order ID
 * @returns {Promise<Object>} Razorpay order object
 */
async function createRazorpayOrder(amountINR, orderReference) {
  const amountInPaise = Math.round(Number(amountINR) * 100);
  if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
    throw new Error(`Invalid order amount: ${amountINR}`);
  }

  const options = {
    amount: amountInPaise,
    currency: 'INR',
    receipt: String(orderReference).substring(0, 40),
    payment_capture: 1,
  };

  const razorpayOrder = await razorpay.orders.create(options);
  return razorpayOrder;
}

/**
 * Verify Razorpay Payment Signature
 * @param {string} razorpayOrderId
 * @param {string} razorpayPaymentId
 * @param {string} signature
 * @returns {boolean}
 */
function verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, signature) {
  if (!razorpayOrderId || !razorpayPaymentId || !signature) return false;
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${razorpayOrderId}|${razorpayPaymentId}`);
  const generatedSignature = hmac.digest('hex');
  return generatedSignature === signature;
}

/**
 * Issue refund via Razorpay SDK
 * @param {string} paymentId - Razorpay payment ID (e.g. pay_xxx)
 * @param {number} [amountINR] - Amount in INR (if partial/full), converted strictly to integer paise
 * @param {object} [notes] - Optional metadata / notes
 * @returns {Promise<Object>} Razorpay refund response object
 */
async function refundPayment(paymentId, amountINR = null, notes = {}) {
  if (!paymentId) {
    throw new Error('Payment ID is required for refund.');
  }

  const options = {};
  if (amountINR !== null && amountINR !== undefined) {
    const amountInPaise = Math.round(Number(amountINR) * 100);
    if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
      throw new Error(`Invalid refund amount: ${amountINR}`);
    }
    options.amount = amountInPaise;
  }
  if (notes && typeof notes === 'object' && Object.keys(notes).length > 0) {
    options.notes = notes;
  }

  const refund = await razorpay.payments.refund(paymentId, options);
  return refund;
}

const db = require('../config/db');

/**
 * Mark order as paid with row-level locking, duplicate guard, and atomic stock decrement.
 * @param {string|number} orderId - Order identifier
 * @param {object} paymentDetails - { razorpay_payment_id, razorpay_order_id, razorpay_signature }
 * @param {object} [externalClient] - Optional active pg Client from caller transaction
 * @returns {Promise<{ alreadyProcessed: boolean, order: Object }>}
 */
async function markOrderPaid(orderId, paymentDetails = {}, externalClient = null) {
  const client = externalClient || await db.getClient();
  const shouldManageTx = !externalClient;

  try {
    if (shouldManageTx) {
      await client.query('BEGIN');
    }

    // 1. Row-level lock to prevent concurrent verification / webhook race conditions
    const orderRes = await client.query(
      `SELECT id, buyer_id, seller_id, total_amount, status, payment_status, created_at
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const order = orderRes.rows[0];

    // 2. Guard against duplicate execution
    const processedStatuses = ['confirmed', 'processing', 'packed', 'shipped', 'delivered'];
    if (processedStatuses.includes(order.status) || order.payment_status === 'paid') {
      if (shouldManageTx) {
        await client.query('COMMIT');
      }
      return { alreadyProcessed: true, order };
    }

    const paymentId = paymentDetails.razorpay_payment_id || paymentDetails.payment_id || null;
    const razorpayOrderId = paymentDetails.razorpay_order_id || null;
    const signature = paymentDetails.razorpay_signature || null;

    // 3. Atomically update orders table
    const updateOrderRes = await client.query(
      `UPDATE orders 
       SET status = 'confirmed',
           payment_status = 'paid',
           payment_id = COALESCE($2, payment_id),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [orderId, paymentId]
    );

    // Update split seller_orders sub-orders
    await client.query(
      `UPDATE seller_orders
       SET status = 'confirmed'
       WHERE order_id = $1 AND status IN ('order_placed', 'pending')`,
      [orderId]
    ).catch(() => {});

    // 4. Update payments table if it exists
    try {
      await client.query(
        `UPDATE payments 
         SET status = 'paid',
             razorpay_payment_id = COALESCE($1, razorpay_payment_id),
             razorpay_signature = COALESCE($2, razorpay_signature),
             updated_at = NOW()
         WHERE order_id = $3 OR (razorpay_order_id = $4 AND razorpay_order_id IS NOT NULL)`,
        [paymentId, signature, orderId, razorpayOrderId]
      );
    } catch (_) {
      // payments table might have slightly different schema or constraints, don't fail transaction
    }

    // 5. Atomically decrement product inventory
    await client.query(
      `UPDATE products p
       SET stock_quantity = p.stock_quantity - oi.quantity,
           updated_at = NOW()
       FROM order_items oi
       WHERE oi.order_id = $1 AND p.id = oi.product_id`,
      [orderId]
    );

    if (shouldManageTx) {
      await client.query('COMMIT');
    }

    return {
      alreadyProcessed: false,
      order: updateOrderRes.rows[0] || order
    };
  } catch (err) {
    if (shouldManageTx) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    throw err;
  } finally {
    if (shouldManageTx) {
      client.release();
    }
  }
}

module.exports = {
  createRazorpayOrder,
  verifyPaymentSignature,
  refundPayment,
  markOrderPaid,
};


