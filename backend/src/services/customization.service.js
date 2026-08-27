/**
 * Tohfa v2 — Dynamic Customization Service
 * File: backend/src/services/customization.service.js
 * Role: Powers the Open Customization two-way workflow:
 *       1. Seller-side question/boundary configuration at listing time.
 *       2. Buyer-side dynamic form submission.
 *       3. Seller review & single quote issuance with auto-expiration window.
 *       4. Buyer quote acceptance, payment, and auto-conversion to confirmed order.
 */
'use strict';

const { query } = require('../config/db');
const paymentService = require('./payment.service');
const whatsappService = require('./whatsapp.service');

/**
 * Get Open Customization configuration for a product
 */
async function getConfigForProduct(productId) {
  const { rows } = await query(
    'SELECT * FROM open_customization_configs WHERE product_id = $1',
    [productId]
  );
  return rows[0] || null;
}

/**
 * Seller sets up or updates the customization questions & boundaries
 */
async function saveConfig(productId, sellerId, config) {
  // Verify ownership
  const { rows: prodRows } = await query(
    'SELECT id, seller_id FROM products WHERE id = $1',
    [productId]
  );
  if (!prodRows.length) {
    const err = new Error('Product not found.');
    err.status = 404;
    throw err;
  }
  if (prodRows[0].seller_id !== sellerId) {
    const err = new Error('Unauthorized to configure this product.');
    err.status = 403;
    throw err;
  }

  const {
    allowed_types = ['text'],
    instructions = '',
    ref_image_mode = 'optional',
    budget_min = null,
    budget_max = null,
    turnaround_days = '5-7 business days',
    quote_window_hours = 48,
  } = config;

  const { rows } = await query(
    `INSERT INTO open_customization_configs 
      (product_id, allowed_types, instructions, ref_image_mode, budget_min, budget_max, turnaround_days, quote_window_hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (product_id) DO UPDATE SET
      allowed_types = EXCLUDED.allowed_types,
      instructions = EXCLUDED.instructions,
      ref_image_mode = EXCLUDED.ref_image_mode,
      budget_min = EXCLUDED.budget_min,
      budget_max = EXCLUDED.budget_max,
      turnaround_days = EXCLUDED.turnaround_days,
      quote_window_hours = EXCLUDED.quote_window_hours,
      updated_at = NOW()
     RETURNING *`,
    [
      productId,
      JSON.stringify(allowed_types),
      instructions,
      ref_image_mode,
      budget_min,
      budget_max,
      turnaround_days,
      quote_window_hours,
    ]
  );

  return rows[0];
}


/**
 * ---------------------------------------------------------------------------
 * CUSTOMIZATION PROOF-OF-WORK LIFECYCLE (5-Step Pipeline)
 * States: none -> pending_proof -> proof_uploaded -> buyer_approved -> in_crafting -> shipped
 * ---------------------------------------------------------------------------
 */

/**
 * Seller uploads sample proof mockup / photo for buyer review
 */
async function uploadProof(orderItemId, sellerId, proofImageUrl, notes = '') {
  if (!orderItemId) {
    const err = new Error('Order Item ID is required.');
    err.status = 400;
    throw err;
  }
  if (!proofImageUrl) {
    const err = new Error('Proof image URL is required.');
    err.status = 400;
    throw err;
  }

  // Fetch item and order
  const { rows } = await query(
    `SELECT oi.*, o.id AS order_id, o.seller_id, o.buyer_id, o.status AS order_status,
            p.name AS product_name, u_b.name AS buyer_name, u_b.email AS buyer_email, u_b.phone AS buyer_phone,
            sp.store_name
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     JOIN users u_b ON u_b.id = o.buyer_id
     LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
     WHERE oi.id = $1`,
    [orderItemId]
  );

  if (!rows.length) {
    const err = new Error('Order item not found.');
    err.status = 404;
    throw err;
  }

  const item = rows[0];

  if (item.seller_id !== sellerId) {
    const err = new Error('Unauthorized to upload proof for this item.');
    err.status = 403;
    throw err;
  }

  const { rows: updatedRows } = await query(
    `UPDATE order_items
     SET proof_image_url = $1,
         customization_status = 'proof_uploaded'
     WHERE id = $2
     RETURNING *`,
    [proofImageUrl, orderItemId]
  );

  // Notify buyer in-app
  await query(
    `INSERT INTO notifications (user_id, type, title, body, meta)
     VALUES ($1, 'proof_uploaded', 'Customization Proof Ready for Review! 🎨', $2, $3)`,
    [
      item.buyer_id,
      `${item.store_name || 'The artisan'} uploaded a design proof for "${item.product_name}". Please review and approve.`,
      JSON.stringify({ orderId: item.order_id, itemId: orderItemId, proofImageUrl, notes }),
    ]
  ).catch(e => console.error('[Proof Upload Notification Error]:', e.message));

  // Notify buyer via WhatsApp preview notification
  if (item.buyer_phone) {
    await whatsappService.sendProofPreviewNotification(item.buyer_phone, {
      sellerStoreName: item.store_name || 'Artisan',
      productName: item.product_name,
      proofImageUrl,
    }).catch(e => console.error('[WhatsApp Error]', e.message));
  }

  return updatedRows[0];
}

/**
 * Buyer approves the customization proof
 */
async function approveProof(orderItemId, buyerId, feedback = '') {
  if (!orderItemId) {
    const err = new Error('Order Item ID is required.');
    err.status = 400;
    throw err;
  }

  const { rows } = await query(
    `SELECT oi.*, o.id AS order_id, o.seller_id, o.buyer_id, p.name AS product_name,
            u_b.name AS buyer_name, sp.whatsapp_number
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     JOIN users u_b ON u_b.id = o.buyer_id
     LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
     WHERE oi.id = $1`,
    [orderItemId]
  );

  if (!rows.length) {
    const err = new Error('Order item not found.');
    err.status = 404;
    throw err;
  }

  const item = rows[0];

  if (item.buyer_id !== buyerId) {
    const err = new Error('Unauthorized to approve this proof.');
    err.status = 403;
    throw err;
  }

  const { rows: updatedRows } = await query(
    `UPDATE order_items
     SET customization_status = 'buyer_approved'
     WHERE id = $1
     RETURNING *`,
    [orderItemId]
  );

  // Notify artisan in-app
  await query(
    `INSERT INTO notifications (user_id, type, title, body, meta)
     VALUES ($1, 'proof_approved', 'Proof Approved by Buyer! ✅', $2, $3)`,
    [
      item.seller_id,
      `${item.buyer_name || 'Customer'} approved the design proof for "${item.product_name}". You can now proceed to crafting.`,
      JSON.stringify({ orderId: item.order_id, itemId: orderItemId, feedback }),
    ]
  ).catch(e => console.error('[Proof Approval Notification Error]:', e.message));

  return updatedRows[0];
}

/**
 * Buyer rejects proof and requests revisions
 */
async function rejectProof(orderItemId, buyerId, reason = '') {
  if (!orderItemId) {
    const err = new Error('Order Item ID is required.');
    err.status = 400;
    throw err;
  }

  const { rows } = await query(
    `SELECT oi.*, o.id AS order_id, o.seller_id, o.buyer_id, p.name AS product_name,
            u_b.name AS buyer_name
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     JOIN users u_b ON u_b.id = o.buyer_id
     WHERE oi.id = $1`,
    [orderItemId]
  );

  if (!rows.length) {
    const err = new Error('Order item not found.');
    err.status = 404;
    throw err;
  }

  const item = rows[0];

  if (item.buyer_id !== buyerId) {
    const err = new Error('Unauthorized to reject this proof.');
    err.status = 403;
    throw err;
  }

  const { rows: updatedRows } = await query(
    `UPDATE order_items
     SET customization_status = 'pending_proof'
     WHERE id = $1
     RETURNING *`,
    [orderItemId]
  );

  // Notify seller of requested changes
  await query(
    `INSERT INTO notifications (user_id, type, title, body, meta)
     VALUES ($1, 'proof_rejected', 'Proof Changes Requested ✏️', $2, $3)`,
    [
      item.seller_id,
      `${item.buyer_name || 'Customer'} requested revisions for "${item.product_name}": ${reason || 'Please review and upload an updated proof.'}`,
      JSON.stringify({ orderId: item.order_id, itemId: orderItemId, reason }),
    ]
  ).catch(e => console.error('[Proof Rejection Notification Error]:', e.message));

  return updatedRows[0];
}

/**
 * Update proof / customization status (in_crafting, shipped, etc.)
 */
async function updateProofStatus(orderItemId, userId, userRole, status, payload = {}) {
  const allowedStatuses = ['none', 'pending_proof', 'proof_uploaded', 'buyer_approved', 'in_crafting', 'shipped'];
  if (!allowedStatuses.includes(status)) {
    const err = new Error(`Invalid customization status: ${status}. Allowed: ${allowedStatuses.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const { rows } = await query(
    `SELECT oi.*, o.id AS order_id, o.seller_id, o.buyer_id, p.name AS product_name,
            sp.store_name, u_b.name AS buyer_name
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     JOIN users u_b ON u_b.id = o.buyer_id
     LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
     WHERE oi.id = $1`,
    [orderItemId]
  );

  if (!rows.length) {
    const err = new Error('Order item not found.');
    err.status = 404;
    throw err;
  }

  const item = rows[0];
  const isSeller = item.seller_id === userId;
  const isBuyer = item.buyer_id === userId;
  const isAdmin = userRole === 'admin' || userRole === 'master_admin';

  if (!isSeller && !isBuyer && !isAdmin) {
    const err = new Error('Unauthorized.');
    err.status = 403;
    throw err;
  }

  // Update status and optionally proof_image_url
  const proofUrl = payload.proof_image_url || payload.proofImageUrl || item.proof_image_url;

  const { rows: updatedRows } = await query(
    `UPDATE order_items
     SET customization_status = $1,
         proof_image_url = COALESCE($2, proof_image_url)
     WHERE id = $3
     RETURNING *`,
    [status, proofUrl, orderItemId]
  );

  // If status is 'in_crafting', alert buyer
  if (status === 'in_crafting') {
    await query(
      `INSERT INTO notifications (user_id, type, title, body, meta)
       VALUES ($1, 'customization_crafting', 'Artisan is Crafting Your Creation! 🔨', $2, $3)`,
      [
        item.buyer_id,
        `${item.store_name || 'The artisan'} has started crafting your custom order for "${item.product_name}".`,
        JSON.stringify({ orderId: item.order_id, itemId: orderItemId }),
      ]
    ).catch(() => {});
  }

  return updatedRows[0];
}

/**
 * Get proof details for an order item
 */
async function getProofDetails(orderItemId, userId, userRole) {
  const { rows } = await query(
    `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.unit_price,
            oi.customization_data, oi.customization_status, oi.proof_image_url,
            p.name AS product_name, p.images AS product_images,
            o.buyer_id, o.seller_id, o.status AS order_status, o.created_at AS order_date,
            sp.store_name, u_b.name AS buyer_name
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     JOIN users u_b ON u_b.id = o.buyer_id
     LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
     WHERE oi.id = $1`,
    [orderItemId]
  );

  if (!rows.length) {
    const err = new Error('Order item not found.');
    err.status = 404;
    throw err;
  }

  const item = rows[0];
  const isSeller = item.seller_id === userId;
  const isBuyer = item.buyer_id === userId;
  const isAdmin = userRole === 'admin' || userRole === 'master_admin';

  if (!isSeller && !isBuyer && !isAdmin) {
    const err = new Error('Unauthorized.');
    err.status = 403;
    throw err;
  }

  return item;
}

// FIX: Added expireStaleQuotes function for daily cron job
/**
 * Expire stale open customization quotes whose quote_expires_at has passed.
 * Called daily at 09:00 AM by the occasion cron scheduler.
 * Updates customization_requests: status 'quoted' → 'expired' when quote_expires_at < NOW().
 */
async function expireStaleQuotes() {
  try {
    const { rows } = await query(
      `UPDATE customization_requests
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'quoted'
         AND quote_expires_at IS NOT NULL
         AND quote_expires_at < NOW()
       RETURNING id, buyer_id, seller_id`
    );

    if (rows.length > 0) {
      console.log(`[Customization] Expired ${rows.length} stale quote(s).`);

      // Insert in-app notifications for buyers whose quotes expired
      for (const req of rows) {
        await query(
          `INSERT INTO notifications (user_id, type, title, body, meta)
           VALUES ($1, 'quote_expired', 'Customization Quote Expired',
                   'A seller quote for your customization request has expired. You can request a new quote anytime.',
                   $2)`,
          [req.buyer_id, JSON.stringify({ customization_request_id: req.id, seller_id: req.seller_id })]
        ).catch(() => {}); // Non-fatal — don't break the cron if notification insert fails
      }
    }
  } catch (err) {
    console.error('[Customization] expireStaleQuotes error:', err.message);
    // Non-fatal — log and continue
  }
}

module.exports = {
  getConfigForProduct,
  saveConfig,
  uploadProof,
  approveProof,
  rejectProof,
  updateProofStatus,
  getProofDetails,
  expireStaleQuotes,
};
