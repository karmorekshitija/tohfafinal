/**
 * Tohfa v2 — Cart Controller
 * File: src/controllers/cart.controller.js
 * Role: HTTP handlers for buyer cart — get, add (upsert), update, remove, clear,
 *       and guest-to-authenticated cart merge (AUTH-05).
 *       Includes support for item customisation payload and seller-grouped structures.
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const { query } = require('../config/db');

// ---------------------------------------------------------------------------
// GET /api/cart
// ---------------------------------------------------------------------------
async function getCart(req, res, next) {
  try {
    const buyerId = req.user.id;

    const { rows } = await query(
      `SELECT
         ci.id,
         ci.product_id,
         ci.variant_id,
         ci.quantity,
         COALESCE(ci.customization_data, ci.customization_payload) AS customization_data,
         ci.created_at,
         p.name AS product_name,
         p.name AS title,
         COALESCE(p.base_price, 0) AS base_price,
         p.status AS product_status,
         p.seller_id,
         COALESCE(sp.store_name, s.store_name, 'Artisan Studio') AS store_name,
         COALESCE(u.profile_photo_url, sp.logo_url, s.logo_url) AS seller_photo,
         pv.color_name AS color,
         pv.size AS size,
         COALESCE(pv.additional_price, 0) AS variant_additional_price,
         COALESCE(
           (SELECT url FROM product_images pi
            WHERE pi.product_id = p.id
            ORDER BY pi.sort_order ASC LIMIT 1),
           NULL
         ) AS product_image
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       LEFT JOIN sellers s ON s.user_id = p.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
       LEFT JOIN users u ON u.id = p.seller_id
       LEFT JOIN product_variants pv ON pv.id = ci.variant_id
       WHERE (ci.buyer_id = $1 OR ci.cart_id IN (SELECT id FROM carts WHERE user_id = $1))
       ORDER BY ci.created_at DESC`,
      [buyerId]
    ).catch(async () => {
      // Fallback query for legacy column variations
      return await query(
        `SELECT
           ci.id,
           ci.product_id,
           ci.variant_id,
           ci.quantity,
           ci.customization_data,
           ci.created_at,
           p.name AS product_name,
           p.name AS title,
           COALESCE(p.base_price, 0) AS base_price,
           p.status AS product_status,
           p.seller_id,
           COALESCE(sp.store_name, 'Artisan Studio') AS store_name,
           pv.color_name AS color,
           pv.size AS size,
           COALESCE(pv.additional_price, 0) AS variant_additional_price
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
         LEFT JOIN product_variants pv ON pv.id = ci.variant_id
         WHERE (ci.buyer_id = $1)
         ORDER BY ci.created_at DESC`,
        [buyerId]
      );
    });

    const items = [];
    const grouped = {};

    for (const item of rows) {
      const basePrice = parseFloat(item.base_price || 0);
      const deltaPrice = parseFloat(item.variant_additional_price || 0);
      const unitPrice = parseFloat((basePrice + deltaPrice).toFixed(2));
      const itemPricePaise = Math.round(unitPrice * 100);
      const isAvailable = item.product_status === 'active';
      const quantity = Math.max(1, parseInt(item.quantity || 1, 10));

      let customizationData = item.customization_data;
      if (typeof customizationData === 'string') {
        try {
          customizationData = JSON.parse(customizationData);
        } catch {
          // Keep string as is
        }
      }

      const itemObj = {
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product_name,
        title: item.product_name,
        name: item.product_name,
        image_url: item.product_image,
        product_image: item.product_image,
        product_status: item.product_status,
        available: isAvailable,
        unavailable_reason: isAvailable ? null : 'paused',
        quantity: quantity,
        unit_price: unitPrice,
        price: unitPrice,
        price_paise: itemPricePaise,
        subtotal: parseFloat((unitPrice * quantity).toFixed(2)),
        subtotal_paise: itemPricePaise * quantity,
        color: item.color,
        size: item.size,
        store_name: item.store_name || 'Artisan Store',
        seller_id: item.seller_id,
        seller_photo: item.seller_photo,
        customization_data: customizationData || null,
        customization_payload: customizationData || null,
      };

      items.push(itemObj);

      if (!grouped[item.seller_id]) {
        grouped[item.seller_id] = {
          seller_id: item.seller_id,
          store_name: item.store_name || 'Artisan Store',
          seller_photo: item.seller_photo,
          items: [],
        };
      }
      grouped[item.seller_id].items.push(itemObj);
    }

    const cartGroups = Object.values(grouped);
    const totalItems = items.reduce((s, r) => s + r.quantity, 0);
    const subtotal = items.reduce((sum, i) => sum + (i.available ? i.subtotal : 0), 0);
    const subtotalPaise = items.reduce((sum, i) => sum + (i.available ? i.subtotal_paise : 0), 0);
    const shipping = subtotal > 0 ? (subtotal >= 999 ? 0 : 50) : 0;
    const shippingPaise = shipping * 100;
    const totalAmount = parseFloat((subtotal + shipping).toFixed(2));
    const totalPaise = subtotalPaise + shippingPaise;

    return res.json({
      success: true,
      data: {
        items,
        cart: cartGroups,
        totalItems,
        item_count: totalItems,
        subtotal: parseFloat(subtotal.toFixed(2)),
        subtotal_paise: subtotalPaise,
        shipping,
        shipping_paise: shippingPaise,
        totalAmount,
        total_amount: totalAmount,
        total_paise: totalPaise,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/cart & POST /api/cart/items  — add item (upsert)
// ---------------------------------------------------------------------------
async function addToCart(req, res, next) {
  try {
    const buyerId = req.user.id;
    const {
      product_id,
      variant_id = null,
      quantity = 1,
      customization_data,
      customization_payload,
      customization,
    } = req.body;

    if (!product_id) {
      return res.status(400).json({ success: false, message: 'product_id is required.' });
    }

    // Verify product is active
    const { rows: pRows } = await query(
      "SELECT id, name FROM products WHERE id = $1 AND (status = 'active' OR is_active = true)",
      [product_id]
    );
    if (!pRows.length) {
      return res.status(404).json({ success: false, message: 'Product not found or not active.' });
    }

    const finalCustomization = customization_data || customization_payload || customization || null;
    const jsonCustomization = finalCustomization ? JSON.stringify(finalCustomization) : null;
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    // Upsert
    const { rows } = await query(
      `INSERT INTO cart_items (buyer_id, product_id, variant_id, quantity, customization_data, customization_payload)
       VALUES ($1, $2, $3, $4, $5, COALESCE($5::jsonb, '{}'::jsonb))
       ON CONFLICT (buyer_id, product_id, variant_id)
       DO UPDATE SET
         quantity = cart_items.quantity + EXCLUDED.quantity,
         customization_data = COALESCE(EXCLUDED.customization_data, cart_items.customization_data),
         customization_payload = COALESCE(EXCLUDED.customization_payload, cart_items.customization_payload)
       RETURNING id, product_id, variant_id, quantity, customization_data`,
      [
        buyerId,
        product_id,
        variant_id || null,
        qty,
        jsonCustomization,
      ]
    ).catch(async () => {
      // Fallback query without customization_payload column if not present
      return await query(
        `INSERT INTO cart_items (buyer_id, product_id, variant_id, quantity, customization_data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (buyer_id, product_id, variant_id)
         DO UPDATE SET
           quantity = cart_items.quantity + EXCLUDED.quantity,
           customization_data = COALESCE(EXCLUDED.customization_data, cart_items.customization_data)
         RETURNING id, product_id, variant_id, quantity, customization_data`,
        [
          buyerId,
          product_id,
          variant_id || null,
          qty,
          jsonCustomization,
        ]
      );
    });

    return res.status(201).json({
      success: true,
      message: 'Item added to cart successfully.',
      data: { cartItem: rows[0] },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/cart/merge (AUTH-05: Guest-to-Authenticated Cart Merge Engine)
// ---------------------------------------------------------------------------
/**
 * Merges local storage guest cart items into the authenticated user's DB cart.
 * Body: { items: [ { product_id, variant_id, quantity, customization_data } ] } or array [ ... ]
 */
async function mergeCart(req, res, next) {
  try {
    const buyerId = req.user.id;
    const rawItems = Array.isArray(req.body) ? req.body : (req.body?.items || []);

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No items to merge.',
        data: { merged_count: 0 },
      });
    }

    // Ensure carts row exists for user
    await query(
      `INSERT INTO carts (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [buyerId]
    ).catch(() => {});

    let mergedCount = 0;

    for (const item of rawItems) {
      const productId = item.product_id || item.productId || item.id;
      if (!productId) continue;

      // Verify product is active and exists
      const { rows: pRows } = await query(
        "SELECT id FROM products WHERE id = $1 AND (status = 'active' OR is_active = true)",
        [productId]
      );
      if (!pRows.length) continue;

      const variantId = item.variant_id || item.variantId || null;
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      const customData = item.customization_data || item.customization_payload || item.customization || null;
      const jsonCustom = customData ? (typeof customData === 'string' ? customData : JSON.stringify(customData)) : null;

      try {
        await query(
          `INSERT INTO cart_items (buyer_id, product_id, variant_id, quantity, customization_data, customization_payload)
           VALUES ($1, $2, $3, $4, $5, COALESCE($5::jsonb, '{}'::jsonb))
           ON CONFLICT (buyer_id, product_id, variant_id)
           DO UPDATE SET
             quantity = cart_items.quantity + EXCLUDED.quantity,
             customization_data = COALESCE(EXCLUDED.customization_data, cart_items.customization_data),
             customization_payload = COALESCE(EXCLUDED.customization_payload, cart_items.customization_payload)`,
          [buyerId, productId, variantId, quantity, jsonCustom]
        );
        mergedCount++;
      } catch (upsertErr) {
        // Fallback for schemas with different conflict targets or column subsets
        try {
          await query(
            `INSERT INTO cart_items (buyer_id, product_id, variant_id, quantity, customization_data)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (buyer_id, product_id, variant_id)
             DO UPDATE SET
               quantity = cart_items.quantity + EXCLUDED.quantity,
               customization_data = COALESCE(EXCLUDED.customization_data, cart_items.customization_data)`,
            [buyerId, productId, variantId, quantity, jsonCustom]
          );
          mergedCount++;
        } catch (fallbackErr) {
          console.warn('[Cart Merge] Item upsert warning:', fallbackErr.message);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Successfully merged ${mergedCount} items into cart.`,
      data: { merged_count: mergedCount },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/cart/:itemId, PUT /api/cart/items/:id & PUT /api/cart/update
// ---------------------------------------------------------------------------
async function updateCartItem(req, res, next) {
  try {
    const itemId = req.params.itemId || req.params.id || req.body.itemId || req.body.item_id || req.body.id;
    const buyerId = req.user.id;
    const {
      quantity,
      customization_data,
      customization_payload,
      customization,
    } = req.body;

    if (!itemId) {
      return res.status(400).json({ success: false, message: 'Cart item ID is required.' });
    }

    const finalCustomization = customization_data || customization_payload || customization;
    const jsonCustomization = finalCustomization !== undefined ? (typeof finalCustomization === 'string' ? finalCustomization : JSON.stringify(finalCustomization)) : null;

    let updateQuery;
    let params;

    if (quantity !== undefined && finalCustomization !== undefined) {
      const qty = Math.max(1, parseInt(quantity, 10) || 1);
      updateQuery = `UPDATE cart_items SET quantity = $1, customization_data = $2 WHERE id = $3 AND buyer_id = $4 RETURNING *`;
      params = [qty, jsonCustomization, itemId, buyerId];
    } else if (quantity !== undefined) {
      const qty = Math.max(1, parseInt(quantity, 10) || 1);
      updateQuery = `UPDATE cart_items SET quantity = $1 WHERE id = $2 AND buyer_id = $3 RETURNING *`;
      params = [qty, itemId, buyerId];
    } else if (finalCustomization !== undefined) {
      updateQuery = `UPDATE cart_items SET customization_data = $1 WHERE id = $2 AND buyer_id = $3 RETURNING *`;
      params = [jsonCustomization, itemId, buyerId];
    } else {
      return res.status(400).json({ success: false, message: 'Quantity or customization data required for update.' });
    }

    const { rows } = await query(updateQuery, params);

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }

    return res.json({
      success: true,
      message: 'Cart item updated successfully.',
      data: { cartItem: rows[0] },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/cart/:itemId & DELETE /api/cart/items/:id
// ---------------------------------------------------------------------------
async function removeCartItem(req, res, next) {
  try {
    const itemId = req.params.itemId || req.params.id;
    const buyerId = req.user.id;

    const { rowCount } = await query(
      'DELETE FROM cart_items WHERE id = $1 AND buyer_id = $2',
      [itemId, buyerId]
    );

    if (!rowCount) {
      return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }

    return res.json({ success: true, data: { message: 'Item removed from cart.' } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/cart  — clear all
// ---------------------------------------------------------------------------
async function clearCart(req, res, next) {
  try {
    const buyerId = req.user.id;
    await query('DELETE FROM cart_items WHERE buyer_id = $1', [buyerId]);
    return res.json({ success: true, data: { message: 'Cart cleared.' } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCart,
  addToCart,
  mergeCart,
  updateCartItem,
  removeCartItem,
  clearCart,
};
