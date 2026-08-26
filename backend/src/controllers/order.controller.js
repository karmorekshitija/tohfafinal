/**
 * Tohfa v2 — Order Controller
 * File: src/controllers/order.controller.js
 * Role: HTTP handlers for orders — place, list (buyer/seller/admin), detail,
 *       status update, overflow queue management.
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const { query } = require('../config/db');
const { placeOrders } = require('../services/order.service');
const paymentService = require('../services/payment.service');
const { createNotification } = require('./notification.controller');

// ---------------------------------------------------------------------------
// POST /api/orders
// ---------------------------------------------------------------------------
async function placeOrder(req, res, next) {
  try {
    const buyerId = req.user.id;
    const { address_id, cart_item_ids, coupon_code, coupon_id, coupon, code } = req.body;

    if (!address_id) {
      return res.status(400).json({ success: false, message: 'address_id is required.' });
    }

    const result = await placeOrders(buyerId, address_id, cart_item_ids || null, {
      coupon_code: coupon_code || coupon || code,
      coupon_id,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/orders  — buyer history
// ---------------------------------------------------------------------------
async function getBuyerOrders(req, res, next) {
  try {
    const buyerId = req.user.id;
    const { page = '1', limit = '20', status } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    const conditions = ['o.buyer_id = $1'];
    const params = [buyerId];

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    params.push(limitNum);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT o.id, o.seller_id, o.total_amount, o.status, o.created_at,
              sp.store_name,
              COALESCE(
                (SELECT json_agg(oi)
                 FROM order_items oi WHERE oi.order_id = o.id),
                '[]'
              ) AS items
       FROM orders o
       LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
       WHERE ${where}
       ORDER BY o.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM orders o WHERE ${where}`,
      params.slice(0, params.length - 2)
    );

    const formattedOrders = rows.map(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      const firstItem = items[0];
      let itemPreview = firstItem ? (firstItem.product_name || firstItem.name || 'Handcrafted Creation') : 'Handcrafted Creation';
      if (items.length > 1) {
        itemPreview += ` + ${items.length - 1} more`;
      }
      const totalPaise = Math.round(parseFloat(o.total_amount || 0) * 100);
      const orderRef = `TH-${String(o.id).substring(0, 8).toUpperCase()}`;
      const imageUrls = items.map(i => i.product_image || i.image_url).filter(Boolean);

      return {
        ...o,
        order_ref: orderRef,
        item_preview: itemPreview,
        total_paise: totalPaise,
        primary_image_url: imageUrls[0] || null,
        image_urls: imageUrls,
      };
    });

    return res.json({
      success: true,
      data: {
        orders: formattedOrders,
        total: parseInt(countRows[0].total, 10),
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/orders/seller  — seller's orders
// ---------------------------------------------------------------------------
async function getSellerOrders(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { page = '1', limit = '20', status } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    const conditions = ['o.seller_id = $1'];
    const params = [sellerId];

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    params.push(limitNum);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT o.id, o.buyer_id, o.total_amount, o.status, o.created_at,
              u.name AS buyer_name,
              COALESCE(
                (SELECT json_agg(oi)
                 FROM order_items oi WHERE oi.order_id = o.id),
                '[]'
              ) AS items
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_id
       WHERE ${where}
       ORDER BY o.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM orders o WHERE ${where}`,
      params.slice(0, params.length - 2)
    );

    return res.json({
      success: true,
      data: {
        orders: rows,
        total: parseInt(countRows[0].total, 10),
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/orders/admin  — all orders (admin)
// ---------------------------------------------------------------------------
async function getAdminOrders(req, res, next) {
  try {
    const { page = '1', limit = '20', status, seller_id, from_date, to_date } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }
    if (seller_id) {
      params.push(seller_id);
      conditions.push(`o.seller_id = $${params.length}`);
    }
    if (from_date) {
      params.push(from_date);
      conditions.push(`o.created_at >= $${params.length}`);
    }
    if (to_date) {
      params.push(to_date);
      conditions.push(`o.created_at <= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limitNum);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT o.id, o.buyer_id, o.seller_id, o.total_amount, o.status, o.created_at,
              u.name AS buyer_name, sp.store_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_id
       LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM orders o ${where}`,
      params.slice(0, params.length - 2)
    );

    return res.json({
      success: true,
      data: {
        orders: rows,
        total: parseInt(countRows[0].total, 10),
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/orders/:id  — order detail
// ---------------------------------------------------------------------------
async function getOrderById(req, res, next) {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    const { rows } = await query(
      `SELECT o.id, o.buyer_id, o.seller_id, o.address_id, o.total_amount, o.status, o.created_at,
              u.name AS buyer_name, u.email AS buyer_email,
              sp.store_name,
              a.line1, a.line2, a.city, a.state, a.pincode, a.name AS address_name, a.phone AS address_phone,
              COALESCE(
                (SELECT json_agg(oi)
                 FROM order_items oi WHERE oi.order_id = o.id),
                '[]'
              ) AS items
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_id
       LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
       LEFT JOIN addresses a ON a.id = o.address_id
       WHERE o.id = $1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = rows[0];

    // Authorization check
    if (role === 'buyer' && order.buyer_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (role === 'seller' && order.seller_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.json({ success: true, data: { order } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/orders/:id/status  — seller updates status
// ---------------------------------------------------------------------------
async function updateOrderStatus(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = req.user.role;
    const { status } = req.body;

    const allowed = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'cancel_requested'];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${allowed.join(', ')}.`,
      });
    }

    // Valid state transitions (BUG-13)
    const VALID_TRANSITIONS = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['shipped', 'cancelled', 'cancel_requested'],
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
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const currentOrder = existingRows[0];

    // Validate state machine transition (BUG-13)
    const allowedNext = VALID_TRANSITIONS[currentOrder.status] || [];
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition order status from "${currentOrder.status}" to "${status}". Valid transitions from "${currentOrder.status}" are: ${allowedNext.join(', ') || 'none (terminal state)'}.`,
      });
    }

    // When status becomes 'delivered', hold payout for 7 days (BUG-12: payout_status = 'holding')
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

    // If order was cancelled, restock product inventory
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
      confirmed:  'Your order has been confirmed by the seller.',
      shipped:    'Your order has been shipped! It is on the way.',
      delivered:  'Your order has been delivered. Enjoy!',
      cancelled:  'Your order has been cancelled.',
      cancel_requested: 'Cancellation request has been submitted for review.',
    };
    await createNotification(
      order.buyer_id,
      'order_status',
      `Order ${status.replace('_', ' ')}`,
      statusMessages[status] || `Your order status is now ${status}.`,
      { order_id: id, status }
    );

    return res.json({ success: true, data: { order } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/orders/overflow  — seller's overflow queue
// ---------------------------------------------------------------------------
async function getOverflowOrders(req, res, next) {
  try {
    const sellerId = req.user.id;

    const { rows } = await query(
      `SELECT oo.id, oo.buyer_id, oo.total_amount, oo.status,
              oo.items_snapshot, oo.created_at,
              u.name AS buyer_name
       FROM overflow_orders oo
       LEFT JOIN users u ON u.id = oo.buyer_id
       WHERE oo.seller_id = $1
       ORDER BY oo.created_at ASC`,
      [sellerId]
    );

    return res.json({ success: true, data: { overflow_orders: rows } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/orders/overflow/:id  — seller accepts or declines
// ---------------------------------------------------------------------------
async function handleOverflowOrder(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const { action } = req.body; // 'accept' | 'decline'

    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'accept' or 'decline'." });
    }

    const { rows: ovRows } = await query(
      "SELECT * FROM overflow_orders WHERE id = $1 AND seller_id = $2 AND status = 'pending'",
      [id, sellerId]
    );

    if (!ovRows.length) {
      return res.status(404).json({ success: false, message: 'Overflow order not found or already handled.' });
    }

    const ov = ovRows[0];

    if (action === 'decline') {
      await query(
        "UPDATE overflow_orders SET status = 'declined', updated_at = NOW() WHERE id = $1",
        [id]
      );
      await createNotification(
        ov.buyer_id,
        'overflow_declined',
        'Order could not be processed',
        'The seller could not accept your order at this time. Please try again later.',
        { overflow_order_id: id }
      );
      return res.json({ success: true, data: { message: 'Overflow order declined.' } });
    }

    // Accept: create a real order from the snapshot
    const items = typeof ov.items_snapshot === 'string'
      ? JSON.parse(ov.items_snapshot)
      : ov.items_snapshot;

    const { rows: orderRows } = await query(
      `INSERT INTO orders (buyer_id, seller_id, address_id, total_amount, status)
       VALUES ($1, $2, $3, $4, 'confirmed')
       RETURNING *`,
      [ov.buyer_id, sellerId, ov.address_id, ov.total_amount]
    );
    const order = orderRows[0];

    for (const item of items) {
      await query(
        `INSERT INTO order_items
           (order_id, product_id, variant_id, quantity, unit_price, customization_data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          order.id,
          item.product_id,
          item.variant_id || null,
          item.quantity,
          item.unit_price || item.base_price,
          item.customization_data ? JSON.stringify(item.customization_data) : null,
        ]
      );
    }

    await query(
      "UPDATE overflow_orders SET status = 'accepted', updated_at = NOW() WHERE id = $1",
      [id]
    );

    await createNotification(
      ov.buyer_id,
      'order_placed',
      'Order confirmed',
      'Your overflow order has been accepted by the seller!',
      { order_id: order.id }
    );

    return res.status(201).json({ success: true, data: { order } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/orders/:id/cancel  — buyer/seller/admin cancels order
// ---------------------------------------------------------------------------
async function cancelOrder(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { reason = 'Order cancellation requested', notes = '' } = req.body;

    const { rows: orderRows } = await query(
      `SELECT o.*, u.name AS buyer_name, u.phone AS buyer_phone, sp.store_name
       FROM orders o
       JOIN users u ON u.id = o.buyer_id
       LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
       WHERE o.id = $1`,
      [id]
    );

    if (!orderRows.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = orderRows[0];

    // Ownership check
    if (userRole === 'buyer' && order.buyer_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (userRole === 'seller' && order.seller_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Status checks
    const nonCancellableStates = ['shipped', 'out_for_delivery', 'delivered'];
    if (nonCancellableStates.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel an order that has already shipped.',
      });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Order is already cancelled.' });
    }

    // Fetch items for restocking
    const { rows: itemRows } = await query(
      `SELECT oi.*, p.customization_mode, p.name AS product_name
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [id]
    );

    // Restock inventory
    for (const item of itemRows) {
      await query(
        'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
        [item.quantity, item.product_id]
      ).catch(() => {});
    }

    const cancelReasonText = String(reason || notes || 'Cancelled by buyer').trim();
    let refundId = null;

    // Prepaid refund processing
    if (order.payment_status === 'paid' || order.payment_id) {
      let paymentId = order.payment_id;
      if (!paymentId) {
        const { rows: pRows } = await query(
          "SELECT razorpay_payment_id FROM payments WHERE order_id = $1 AND status = 'paid' ORDER BY created_at DESC LIMIT 1",
          [id]
        );
        if (pRows.length && pRows[0].razorpay_payment_id) {
          paymentId = pRows[0].razorpay_payment_id;
        }
      }

      if (paymentId) {
        try {
          const refundResult = await paymentService.refundPayment(paymentId, order.total_amount, { reason: cancelReasonText });
          refundId = refundResult?.id || `RFND-${Date.now()}`;
        } catch (rfErr) {
          console.warn('[Razorpay Refund Warning]:', rfErr.message);
          refundId = `RFND-MANUAL-${Date.now()}`;
        }
      } else {
        refundId = `RFND-AUTO-${Date.now()}`;
      }

      // Record refund request
      await query(
        `INSERT INTO refund_requests (order_id, buyer_id, seller_id, amount, reason, status, razorpay_refund_id, resolved_at, created_at)
         VALUES ($1, $2, $3, $4, $5, 'approved', $6, NOW(), NOW())`,
        [id, order.buyer_id, order.seller_id, order.total_amount, cancelReasonText, refundId]
      ).catch(() => {});
    }

    // Update order status = 'cancelled', payment_status = 'refunded' (if paid), cancellation_reason
    const newPaymentStatus = order.payment_status === 'paid' ? 'refunded' : order.payment_status;
    const { rows: updatedRows } = await query(
      `UPDATE orders 
       SET status = 'cancelled',
           payment_status = $1,
           cancellation_reason = $2,
           notes = COALESCE(notes || ' | ', '') || $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newPaymentStatus, cancelReasonText, `Cancelled: ${cancelReasonText}`, id]
    ).catch(async () => {
      // Fallback if cancellation_reason column is absent
      return await query(
        `UPDATE orders 
         SET status = 'cancelled',
             payment_status = $1,
             notes = COALESCE(notes || ' | ', '') || $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [newPaymentStatus, `Cancelled: ${cancelReasonText}`, id]
      );
    });

    // Notify buyer
    await createNotification(
      order.buyer_id,
      'order_cancelled',
      'Order Cancelled',
      `Your Order #${String(order.id).slice(0, 8).toUpperCase()} has been cancelled.${refundId ? ' Refund initiated to your original payment method.' : ''}`,
      { order_id: id, refund_id: refundId }
    ).catch(() => {});

    // Notify seller
    await createNotification(
      order.seller_id,
      'order_cancelled',
      'Order Cancelled',
      `Order #${String(order.id).slice(0, 8).toUpperCase()} was cancelled. Inventory has been restocked.`,
      { order_id: id }
    ).catch(() => {});

    return res.json({
      success: true,
      message: 'Order cancelled successfully. Refund initiated to your original payment method.',
      refundId: refundId || undefined,
      data: {
        order: updatedRows[0] || order,
        refundId: refundId || undefined,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// ADMIN REFUND ENDPOINTS
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/refunds
 * List all or status-filtered refund requests with order, buyer, and seller details
 */
async function listRefundRequests(req, res, next) {
  try {
    const { status = 'all', page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(limit, 10));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`rr.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limitNum);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT rr.*,
              o.status AS order_status, o.payment_status AS order_payment_status,
              o.total_amount AS order_total_amount, o.created_at AS order_created_at,
              u_b.name AS buyer_name, u_b.email AS buyer_email, u_b.phone AS buyer_phone,
              u_s.name AS seller_name, u_s.email AS seller_email,
              sp.store_name,
              p.razorpay_payment_id, p.razorpay_order_id,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'quantity', oi.quantity,
                  'unit_price', oi.unit_price,
                  'product_name', pr.name,
                  'customization_mode', pr.customization_mode,
                  'customization_data', oi.customization_data
                ))
                FROM order_items oi
                JOIN products pr ON pr.id = oi.product_id
                WHERE oi.order_id = rr.order_id),
                '[]'
              ) AS items
       FROM refund_requests rr
       JOIN orders o ON o.id = rr.order_id
       JOIN users u_b ON u_b.id = rr.buyer_id
       JOIN users u_s ON u_s.id = rr.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = rr.seller_id
       LEFT JOIN payments p ON p.order_id = rr.order_id AND p.status = 'paid'
       ${where}
       ORDER BY rr.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total FROM refund_requests rr ${where}`,
      params.slice(0, params.length - 2)
    );

    return res.json({
      success: true,
      data: {
        refund_requests: rows,
        refunds: rows,
        total: parseInt(countRows[0]?.total || 0, 10),
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/refunds/:id/approve
 * Approves refund, executes Razorpay refund API, updates order/payment, restocks inventory, and notifies buyer
 */
async function approveRefund(req, res, next) {
  try {
    const { id } = req.params;
    const { notes = '', admin_notes = '' } = req.body;
    const finalNotes = admin_notes || notes || 'Approved by Admin';

    const { rows: refundRows } = await query(
      `SELECT rr.*, o.payment_status AS order_payment_status, o.status AS order_status
       FROM refund_requests rr
       JOIN orders o ON o.id = rr.order_id
       WHERE rr.id = $1`,
      [id]
    );

    if (!refundRows.length) {
      return res.status(404).json({ success: false, message: 'Refund request not found.' });
    }

    const refundReq = refundRows[0];
    if (refundReq.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Refund request has already been ${refundReq.status}.`,
      });
    }

    // Fetch payment record for Razorpay refund
    const { rows: payRows } = await query(
      `SELECT * FROM payments WHERE order_id = $1 AND status = 'paid' ORDER BY created_at DESC LIMIT 1`,
      [refundReq.order_id]
    );

    let razorpayRefundId = null;
    if (payRows.length && payRows[0].razorpay_payment_id) {
      try {
        const refundRes = await paymentService.refundPayment(
          payRows[0].razorpay_payment_id,
          refundReq.amount,
          {
            order_id: refundReq.order_id,
            refund_request_id: refundReq.id,
          }
        );
        razorpayRefundId = refundRes?.id || null;
      } catch (refundErr) {
        console.error('[Razorpay Refund Error]:', refundErr.message);
        if (process.env.NODE_ENV === 'production' && !payRows[0].razorpay_payment_id.startsWith('pay_mock')) {
          return res.status(500).json({
            success: false,
            message: `Razorpay refund processing failed: ${refundErr.message}`,
          });
        }
      }
    }

    // Update refund request status
    const { rows: updatedRefundRows } = await query(
      `UPDATE refund_requests
       SET status = 'approved', admin_notes = $1, razorpay_refund_id = $2, resolved_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [finalNotes, razorpayRefundId, id]
    );

    // Update order status = 'cancelled', payment_status = 'refunded'
    const { rows: updatedOrderRows } = await query(
      `UPDATE orders
       SET status = 'cancelled', payment_status = 'refunded', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [refundReq.order_id]
    );

    // Update payments table
    await query(
      `UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE order_id = $1`,
      [refundReq.order_id]
    );

    // Restock product inventory
    await query(
      `UPDATE products p
       SET stock_quantity = p.stock_quantity + oi.quantity, updated_at = NOW()
       FROM order_items oi
       WHERE oi.order_id = $1 AND p.id = oi.product_id`,
      [refundReq.order_id]
    );

    // Notify buyer
    await createNotification(
      refundReq.buyer_id,
      'refund_approved',
      'Refund Approved & Processed 💰',
      `Your refund request of ₹${refundReq.amount} for Order #${String(refundReq.order_id).slice(0, 8).toUpperCase()} has been approved. The amount has been refunded to your original payment method.`,
      { order_id: refundReq.order_id, refund_request_id: id }
    );

    // Notify seller
    await createNotification(
      refundReq.seller_id,
      'refund_processed',
      'Order Refund Processed',
      `Refund of ₹${refundReq.amount} for Order #${String(refundReq.order_id).slice(0, 8).toUpperCase()} has been approved by admin. Inventory has been restocked.`,
      { order_id: refundReq.order_id, refund_request_id: id }
    );

    return res.json({
      success: true,
      data: {
        message: 'Refund approved and processed successfully.',
        refund_request: updatedRefundRows[0],
        order: updatedOrderRows[0],
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/refunds/:id/reject
 * Rejects refund, records admin notes, keeps order active in confirmed status, and notifies buyer
 */
async function rejectRefund(req, res, next) {
  try {
    const { id } = req.params;
    const { reason = 'Refund request rejected by admin', notes = '', admin_notes = '' } = req.body;
    const rejectionReason = admin_notes || notes || reason;

    const { rows: refundRows } = await query(
      `SELECT rr.* FROM refund_requests rr WHERE rr.id = $1`,
      [id]
    );

    if (!refundRows.length) {
      return res.status(404).json({ success: false, message: 'Refund request not found.' });
    }

    const refundReq = refundRows[0];
    if (refundReq.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Refund request has already been ${refundReq.status}.`,
      });
    }

    // Update refund request to rejected
    const { rows: updatedRefundRows } = await query(
      `UPDATE refund_requests
       SET status = 'rejected', admin_notes = $1, resolved_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [rejectionReason, id]
    );

    // Revert order status back to confirmed (keeping order active)
    const { rows: updatedOrderRows } = await query(
      `UPDATE orders
       SET status = 'confirmed', updated_at = NOW()
       WHERE id = $1 AND status = 'cancel_requested'
       RETURNING *`,
      [refundReq.order_id]
    );

    // Notify buyer
    await createNotification(
      refundReq.buyer_id,
      'refund_rejected',
      'Refund Request Update',
      `Your cancellation/refund request for Order #${String(refundReq.order_id).slice(0, 8).toUpperCase()} was not approved. Note: ${rejectionReason}. Your order remains active with the artisan.`,
      { order_id: refundReq.order_id, refund_request_id: id, reason: rejectionReason }
    );

    return res.json({
      success: true,
      data: {
        message: 'Refund request rejected.',
        refund_request: updatedRefundRows[0],
        order: updatedOrderRows[0] || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  placeOrder,
  getBuyerOrders,
  getSellerOrders,
  getAdminOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  getOverflowOrders,
  handleOverflowOrder,
  listRefundRequests,
  approveRefund,
  rejectRefund,
};

