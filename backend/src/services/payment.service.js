/**
 * Tohfa v2 — Payment Service
 * File: backend/src/services/payment.service.js
 * Role: Dual-Gateway Razorpay order creation with automatic failover, timing-safe HMAC SHA256 verification, and refunds.
 */
'use strict';

const crypto = require('crypto');
const razorpay = require('../config/razorpay');
const db = require('../config/db');

/**
 * Timing-safe HMAC-SHA256 signature verification helper
 * @param {string} payload - Data string
 * @param {string} signature - Received hex signature
 * @param {string} secret - Secret key
 * @returns {boolean}
 */
function verifyHmacSignature(payload, signature, secret) {
  if (!payload || !signature || !secret) return false;
  try {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(String(signature), 'utf8');
    if (expectedBuf.length !== signatureBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  } catch (_) {
    return false;
  }
}

/**
 * Create a Razorpay Order with automatic multi-account failover
 * @param {number} amountINR - Amount in INR
 * @param {string} orderReference - Internal reference / order ID
 * @param {string} [preferredAccount='primary'] - 'primary' | 'secondary'
 * @returns {Promise<{ id: string, gatewayAccount: string, keyId: string, [key: string]: any }>}
 */
async function createRazorpayOrder(amountINR, orderReference, preferredAccount = 'primary') {
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

  const hasSecondary = razorpay.isSecondaryConfigured();

  if (preferredAccount === 'secondary' && hasSecondary) {
    try {
      const secondaryClient = razorpay.getClient('secondary');
      const order = await secondaryClient.orders.create(options);
      const creds = razorpay.getAccountCredentials('secondary');
      return {
        ...order,
        gatewayAccount: 'secondary',
        keyId: creds.keyId,
      };
    } catch (secErr) {
      console.warn('[Payment Gateway] Secondary account order creation failed, falling back to primary:', secErr.message);
      const primaryClient = razorpay.getClient('primary');
      const order = await primaryClient.orders.create(options);
      const creds = razorpay.getAccountCredentials('primary');
      return {
        ...order,
        gatewayAccount: 'primary',
        keyId: creds.keyId,
      };
    }
  }

  // Default: Try Primary First
  try {
    const primaryClient = razorpay.getClient('primary');
    const order = await primaryClient.orders.create(options);
    const creds = razorpay.getAccountCredentials('primary');
    return {
      ...order,
      gatewayAccount: 'primary',
      keyId: creds.keyId,
    };
  } catch (primaryErr) {
    if (hasSecondary) {
      console.warn('[Payment Gateway] Primary account order creation failed. Initiating automatic failover to secondary account:', primaryErr.message);
      try {
        const secondaryClient = razorpay.getClient('secondary');
        const order = await secondaryClient.orders.create(options);
        const creds = razorpay.getAccountCredentials('secondary');
        return {
          ...order,
          gatewayAccount: 'secondary',
          keyId: creds.keyId,
        };
      } catch (secErr) {
        console.error('[Payment Gateway] Both primary and secondary order creations failed.', {
          primaryError: primaryErr.message,
          secondaryError: secErr.message,
        });
        throw new Error(`Payment gateway unavailable: ${primaryErr.message}`);
      }
    }
    throw primaryErr;
  }
}

/**
 * Verify Razorpay Payment Signature against specific or fallback account secrets
 * @param {string} razorpayOrderId
 * @param {string} razorpayPaymentId
 * @param {string} signature
 * @param {string} [gatewayAccount=null] - 'primary' | 'secondary'
 * @returns {boolean}
 */
function verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, signature, gatewayAccount = null) {
  if (!razorpayOrderId || !razorpayPaymentId || !signature) return false;
  const payload = `${razorpayOrderId}|${razorpayPaymentId}`;

  if (gatewayAccount) {
    const creds = razorpay.getAccountCredentials(gatewayAccount);
    if (verifyHmacSignature(payload, signature, creds.keySecret)) {
      return true;
    }
  }

  // Fallback: Check primary account secret
  const primaryCreds = razorpay.getAccountCredentials('primary');
  if (verifyHmacSignature(payload, signature, primaryCreds.keySecret)) {
    return true;
  }

  // Fallback: Check secondary account secret if configured
  if (razorpay.isSecondaryConfigured()) {
    const secondaryCreds = razorpay.getAccountCredentials('secondary');
    if (verifyHmacSignature(payload, signature, secondaryCreds.keySecret)) {
      return true;
    }
  }

  return false;
}

/**
 * Issue refund via Razorpay SDK routed to the correct merchant account
 * @param {string} paymentId - Razorpay payment ID (e.g. pay_xxx)
 * @param {number} [amountINR] - Amount in INR, converted strictly to integer paise
 * @param {object} [notes] - Optional metadata / notes
 * @param {string} [gatewayAccount='primary'] - 'primary' | 'secondary'
 * @returns {Promise<Object>} Razorpay refund response object
 */
async function refundPayment(paymentId, amountINR = null, notes = {}, gatewayAccount = 'primary') {
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

  const client = razorpay.getClient(gatewayAccount || 'primary');
  try {
    const refund = await client.payments.refund(paymentId, options);
    return refund;
  } catch (err) {
    // If account was unspecified and secondary exists, try secondary as failover
    if (!gatewayAccount && razorpay.isSecondaryConfigured()) {
      try {
        const secClient = razorpay.getClient('secondary');
        const refund = await secClient.payments.refund(paymentId, options);
        return refund;
      } catch (_) {}
    }
    throw err;
  }
}

/**
 * Mark order as paid with row-level locking, duplicate guard, and atomic stock decrement.
 * @param {string|number} orderId - Order identifier
 * @param {object} paymentDetails - { razorpay_payment_id, razorpay_order_id, razorpay_signature, gateway_account }
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
    const gatewayAccount = paymentDetails.gateway_account || 'primary';

    // 3. Reserve product inventory exactly once, with row locks and stock guards.
    const productStockRes = await client.query(
      `WITH requested AS (
         SELECT product_id, SUM(quantity)::INTEGER AS quantity
         FROM order_items
         WHERE order_id = $1
         GROUP BY product_id
       )
       UPDATE products p
       SET stock_quantity = p.stock_quantity - requested.quantity,
           updated_at = NOW()
       FROM requested
       WHERE p.id = requested.product_id
         AND p.stock_quantity >= requested.quantity
       RETURNING p.id`,
      [orderId]
    );
    const { rows: productCountRows } = await client.query(
      `SELECT COUNT(DISTINCT product_id)::INTEGER AS count
       FROM order_items
       WHERE order_id = $1`,
      [orderId]
    );
    if (productStockRes.rowCount !== productCountRows[0].count) {
      const stockError = new Error('One or more products no longer have enough stock.');
      stockError.status = 409;
      throw stockError;
    }

    const variantStockRes = await client.query(
      `WITH requested AS (
         SELECT variant_id, SUM(quantity)::INTEGER AS quantity
         FROM order_items
         WHERE order_id = $1 AND variant_id IS NOT NULL
         GROUP BY variant_id
       )
       UPDATE product_variants v
       SET stock_qty = v.stock_qty - requested.quantity
       FROM requested
       WHERE v.id = requested.variant_id
         AND v.stock_qty >= requested.quantity
       RETURNING v.id`,
      [orderId]
    );
    const { rows: variantCountRows } = await client.query(
      `SELECT COUNT(DISTINCT variant_id)::INTEGER AS count
       FROM order_items
       WHERE order_id = $1 AND variant_id IS NOT NULL`,
      [orderId]
    );
    if (variantStockRes.rowCount !== variantCountRows[0].count) {
      const stockError = new Error('One or more selected variants no longer have enough stock.');
      stockError.status = 409;
      throw stockError;
    }

    // 4. Atomically update orders table after inventory reservation succeeds.
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

    // 4. Update payments table with gateway_account tracking
    try {
      await client.query(
        `UPDATE payments 
         SET status = 'paid',
             razorpay_payment_id = COALESCE($1, razorpay_payment_id),
             razorpay_signature = COALESCE($2, razorpay_signature),
             gateway_account = COALESCE($3, gateway_account),
             updated_at = NOW()
         WHERE order_id = $4 OR (razorpay_order_id = $5 AND razorpay_order_id IS NOT NULL)`,
        [paymentId, signature, gatewayAccount, orderId, razorpayOrderId]
      );
    } catch (_) {
      // payments table update guard
    }

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
  verifyHmacSignature,
};
