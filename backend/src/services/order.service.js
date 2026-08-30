/**
 * Tohfa v2 — Order Service
 * File: src/services/order.service.js
 * Role: Business logic for placing orders — multi-vendor order splitting,
 *       coupon validation & discount snapshots, parent 'orders' creation (for Razorpay),
 *       split 'seller_orders' (one per artisan), 'order_items' referencing both order_id
 *       and seller_order_id, cart cleanup, and notification dispatch.
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const { query, getClient } = require('../config/db');
const { createNotification } = require('../controllers/notification.controller');
const { calculateDiscount, STATIC_COUPONS } = require('../controllers/coupon.controller');

/**
 * Helper to verify coupon in DB or static catalog
 */
async function verifyAndFetchCoupon(couponCodeOrId, grossAmount) {
  if (!couponCodeOrId) return null;

  let coupon = null;
  const cleanCode = String(couponCodeOrId).trim().toUpperCase();

  try {
    const isId = Number.isInteger(Number(couponCodeOrId)) && !isNaN(Number(couponCodeOrId));
    let q;
    let p;
    if (isId) {
      q = `SELECT * FROM coupons WHERE id = $1 AND is_active = TRUE AND starts_at <= NOW() AND expires_at >= NOW()`;
      p = [Number(couponCodeOrId)];
    } else {
      q = `SELECT * FROM coupons WHERE UPPER(code) = $1 AND is_active = TRUE AND starts_at <= NOW() AND expires_at >= NOW()`;
      p = [cleanCode];
    }
    const { rows } = await query(q, p);
    if (rows.length > 0) {
      coupon = rows[0];
    }
  } catch (err) {
    // Database fallback
  }

  if (!coupon) {
    const now = new Date();
    coupon = STATIC_COUPONS.find(c =>
      (c.code.toUpperCase() === cleanCode || String(c.id) === String(couponCodeOrId)) &&
      c.is_active &&
      new Date(c.starts_at) <= now &&
      new Date(c.expires_at) >= now
    );
  }

  if (coupon) {
    const minOrder = parseFloat(coupon.min_order_amount || 0);
    if (grossAmount >= minOrder) {
      const { discountAmount } = calculateDiscount(coupon, grossAmount);
      return {
        coupon_id: coupon.id,
        code: coupon.code,
        discount_amount: discountAmount,
      };
    }
  }

  return null;
}

/**
 * Place orders from a buyer's cart with Multi-Vendor Split.
 * Creates ONE parent 'orders' record (for Razorpay payment) and creates
 * split 'seller_orders' records (one per vendor) with 'order_items'
 * referencing both order_id and seller_order_id. (CHK-25)
 *
 * @param {string} buyerId
 * @param {string} addressId
 * @param {string[]} [cartItemIds]  Optional: subset of cart item IDs. If omitted, use all.
 * @param {object} [options]        Optional: { coupon_code, coupon_id, notes }
 * @returns {{ order: object, orders: object[], seller_orders: object[], items: object[], coupon_applied: object|null }}
 */
async function placeOrders(buyerId, addressId, cartItemIds, options = {}) {
  // 1. Fetch cart items (optionally filtered)
  let cartQuery;
  let cartParams;

  if (cartItemIds && cartItemIds.length) {
    cartQuery = `
      SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity,
             COALESCE(ci.customization_payload, ci.customization_data, '{}'::jsonb) AS customization_payload,
             p.base_price, p.stock_quantity, p.low_stock_threshold, p.customization_mode,
             p.seller_id, p.name AS product_name, p.status AS product_status,
             COALESCE(p.preparation_days, 2) AS preparation_days,
             COALESCE(p.weight_grams, 500) AS weight_grams,
             COALESCE(pv.additional_price, 0) AS variant_additional_price,
             COALESCE(sp.commission_rate, s.commission_rate, 10.00) AS commission_rate,
             COALESCE(sp.capacity_limit, 50) AS capacity_limit,
             COALESCE(sp.vacation_mode, FALSE) AS vacation_mode,
             COALESCE(sp.store_visibility, TRUE) AS store_visibility
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
      LEFT JOIN sellers s ON s.user_id = p.seller_id
      LEFT JOIN product_variants pv ON pv.id = ci.variant_id
      WHERE (ci.buyer_id = $1 OR ci.cart_id IN (SELECT id FROM carts WHERE user_id = $1))
        AND ci.id = ANY($2::uuid[])
        AND (p.status = 'active' OR p.is_active = TRUE)
    `;
    cartParams = [buyerId, cartItemIds];
  } else {
    cartQuery = `
      SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity,
             COALESCE(ci.customization_payload, ci.customization_data, '{}'::jsonb) AS customization_payload,
             p.base_price, p.stock_quantity, p.low_stock_threshold, p.customization_mode,
             p.seller_id, p.name AS product_name, p.status AS product_status,
             COALESCE(p.preparation_days, 2) AS preparation_days,
             COALESCE(p.weight_grams, 500) AS weight_grams,
             COALESCE(pv.additional_price, 0) AS variant_additional_price,
             COALESCE(sp.commission_rate, s.commission_rate, 10.00) AS commission_rate,
             COALESCE(sp.capacity_limit, 50) AS capacity_limit,
             COALESCE(sp.vacation_mode, FALSE) AS vacation_mode,
             COALESCE(sp.store_visibility, TRUE) AS store_visibility
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
      LEFT JOIN sellers s ON s.user_id = p.seller_id
      LEFT JOIN product_variants pv ON pv.id = ci.variant_id
      WHERE (ci.buyer_id = $1 OR ci.cart_id IN (SELECT id FROM carts WHERE user_id = $1))
        AND (p.status = 'active' OR p.is_active = TRUE)
    `;
    cartParams = [buyerId];
  }

  const { rows: rawCartItems } = await query(cartQuery, cartParams);

  if (!rawCartItems.length) {
    const err = new Error('No active items found in cart.');
    err.status = 400;
    throw err;
  }

  // Validate quantities, stock availability, and compute server-side item unit prices (CHK-28)
  const cartItems = rawCartItems.map(item => {
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    if (item.stock_quantity < qty) {
      const err = new Error(`Insufficient stock for "${item.product_name}". Only ${item.stock_quantity} available.`);
      err.status = 400;
      throw err;
    }
    const variantDelta = parseFloat(item.variant_additional_price || 0);
    const unitPrice = parseFloat((parseFloat(item.base_price) + variantDelta).toFixed(2));
    return {
      ...item,
      quantity: qty,
      unit_price: unitPrice,
      subtotal: parseFloat((unitPrice * qty).toFixed(2)),
    };
  });

  // Validate address belongs to buyer (check user_addresses first, fallback to addresses)
  let shippingAddressSnapshot = {};
  const { rows: addrRows } = await query(
    `SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2
     UNION ALL
     SELECT * FROM addresses WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [addressId, buyerId]
  ).catch(async () => {
    return await query('SELECT * FROM addresses WHERE id = $1 AND user_id = $2 LIMIT 1', [addressId, buyerId]);
  });

  if (!addrRows.length) {
    const err = new Error('Invalid delivery address.');
    err.status = 400;
    throw err;
  }
  shippingAddressSnapshot = addrRows[0];

  // 2. Calculate cart gross total for coupon evaluation
  const cartGrossTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

  // Evaluate coupon if provided (recalculated strictly server-side)
  const couponParam = options.coupon_code || options.coupon_id || options.coupon || options.code;
  const verifiedCoupon = couponParam ? await verifyAndFetchCoupon(couponParam, cartGrossTotal) : null;
  const totalDiscount = verifiedCoupon ? verifiedCoupon.discount_amount : 0;

  // Buyer pays a 5% platform fee added to the subtotal
  const buyerPlatformFee = parseFloat((cartGrossTotal * 0.05).toFixed(2));

  // Server-side shipping fee calculation (e.g. Free shipping >= ₹999, else ₹50)
  const shippingAmount = cartGrossTotal >= 999 ? 0 : 50;
  const finalParentTotal = parseFloat(Math.max(0, (cartGrossTotal + buyerPlatformFee - totalDiscount + shippingAmount)).toFixed(2));

  // 3. Group by seller and check capacity
  const sellerGroups = {};
  for (const item of cartItems) {
    if (item.store_visibility === false || item.store_visibility === 'hidden') continue;
    if (!sellerGroups[item.seller_id]) sellerGroups[item.seller_id] = { items: [], capacity_limit: item.capacity_limit, vacation_mode: item.vacation_mode };
    sellerGroups[item.seller_id].items.push(item);
  }

  if (!Object.keys(sellerGroups).length) {
    const err = new Error('All sellers for selected items are currently on vacation or unavailable.');
    err.status = 400;
    throw err;
  }

  // Check vacation for each seller
  for (const sellerId of Object.keys(sellerGroups)) {
    const group = sellerGroups[sellerId];
    if (group.vacation_mode) {
      const err = new Error('Artisan is currently on vacation and not accepting new orders.');
      err.status = 400;
      throw err;
    }
  }

  const client = await getClient();
  const sellerOrdersCreated = [];
  const allOrderItemsCreated = [];
  let parentOrder = null;

  try {
    await client.query('BEGIN');

    // 4. Create the ONE Parent Order (CHK-25: for Razorpay payment and invoice)
    // BUG-05: For single-seller orders, set seller_id on the parent order
    // For multi-seller, use the first/primary seller's ID
    const sellerIds = Object.keys(sellerGroups);
    const primarySellerId = sellerIds[0] || cartItems[0]?.seller_id || null;

    const { rows: parentOrderRows } = await client.query(
      `INSERT INTO orders
         (user_id, buyer_id, seller_id, address_id, total_amount, discount_amount, shipping_amount,
          coupon_id, payment_method, payment_status, status, payout_status, shipping_address, notes)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, 'razorpay', 'pending', 'pending', 'pending', $8, $9)
       RETURNING *`,
      [
        buyerId,
        primarySellerId,
        addressId,
        finalParentTotal.toFixed(2),
        totalDiscount.toFixed(2),
        shippingAmount.toFixed(2),
        verifiedCoupon ? verifiedCoupon.coupon_id : null,
        JSON.stringify(shippingAddressSnapshot),
        options.notes || null,
      ]
    );

    parentOrder = parentOrderRows[0];

    // 5. Create split 'seller_orders' records (one per vendor) & corresponding 'order_items'
    let remainingDiscountToDistribute = totalDiscount;

    for (let i = 0; i < sellerIds.length; i++) {
      const sellerId = sellerIds[i];
      const items = sellerGroups[sellerId].items;
      const commissionRate = parseFloat(items[0].commission_rate || 10.00);

      // Server-side subtotal for this seller
      const sellerSubtotal = items.reduce((sum, it) => sum + (it.unit_price * it.quantity), 0);

      // Calculate allocated discount for this seller sub-order
      let sellerDiscount = 0;
      if (remainingDiscountToDistribute > 0 && cartGrossTotal > 0) {
        if (i === sellerIds.length - 1) {
          sellerDiscount = Math.min(sellerSubtotal, remainingDiscountToDistribute);
        } else {
          sellerDiscount = parseFloat(((sellerSubtotal / cartGrossTotal) * totalDiscount).toFixed(2));
          sellerDiscount = Math.min(sellerDiscount, remainingDiscountToDistribute);
        }
        remainingDiscountToDistribute = Math.max(0, remainingDiscountToDistribute - sellerDiscount);
      }

      // Platform commission and net seller payout calculations
      const platformCommission = parseFloat((sellerSubtotal * 0.05).toFixed(2));
      const sellerPayoutAmount = parseFloat(Math.max(0, sellerSubtotal - platformCommission).toFixed(2));
      const sellerShippingFee = i === 0 ? shippingAmount : 0;

      // Insert seller sub-order
      const { rows: sellerOrderRows } = await client.query(
        `INSERT INTO seller_orders
           (order_id, seller_id, subtotal, shipping_fee, platform_commission,
            seller_payout_amount, status, payout_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'order_placed', 'unsettled')
         RETURNING *`,
        [
          parentOrder.id,
          sellerId,
          sellerSubtotal.toFixed(2),
          sellerShippingFee.toFixed(2),
          platformCommission.toFixed(2),
          sellerPayoutAmount.toFixed(2),
        ]
      );

      const sellerOrder = sellerOrderRows[0];
      sellerOrdersCreated.push(sellerOrder);

      // Insert order items referencing BOTH order_id and seller_order_id (CHK-19 & CHK-25)
      for (const item of items) {
        const customPayload = item.customization_payload || item.customization_data || {};
        const customJson = typeof customPayload === 'object' && customPayload !== null
          ? JSON.stringify(customPayload)
          : (customPayload || '{}');
        const customStatus = (item.customization_mode && item.customization_mode !== 'none') || (customPayload && Object.keys(customPayload).length > 0)
          ? 'pending'
          : 'none';

        const { rows: itemRows } = await client.query(
          `INSERT INTO order_items
             (order_id, seller_order_id, product_id, variant_id, quantity,
              unit_price, customization_details, customization_data, customization_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
           RETURNING *`,
          [
            parentOrder.id,
            sellerOrder.id,
            item.product_id,
            item.variant_id || null,
            item.quantity,
            item.unit_price,
            customJson,
            customStatus,
          ]
        );

        allOrderItemsCreated.push(itemRows[0]);
      }

      // Notify seller
      await createNotification(
        sellerId,
        'new_order',
        'New Order Received! 🎁',
        `You have a new sub-order #${sellerOrder.id.slice(0, 8)} in Order #${parentOrder.id.slice(0, 8)}.`,
        { order_id: parentOrder.id, seller_order_id: sellerOrder.id }
      ).catch(() => {});
    }

    // 6. Delete processed cart items from DB
    const itemIds = cartItems.map(it => it.id);
    await client.query(
      `DELETE FROM cart_items
       WHERE id = ANY($1::uuid[])
         AND (buyer_id = $2 OR cart_id IN (SELECT id FROM carts WHERE user_id = $2))`,
      [itemIds, buyerId]
    );

    // 7. Notify buyer
    await createNotification(
      buyerId,
      'order_placed',
      'Order Placed Successfully! 🎉',
      `Your order #${parentOrder.id.slice(0, 8).toUpperCase()} for ₹${parentOrder.total_amount} has been placed. Complete payment to begin crafting.`,
      { order_id: parentOrder.id }
    ).catch(() => {});

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    order: parentOrder,
    orders: [parentOrder],
    seller_orders: sellerOrdersCreated,
    items: allOrderItemsCreated,
    coupon_applied: verifiedCoupon || null,
  };
}

module.exports = { placeOrders };


