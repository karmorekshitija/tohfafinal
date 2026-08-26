/**
 * Tohfa v2 — Wishlist Controller
 * File: src/controllers/wishlist.controller.js
 * Role: HTTP handlers for buyer wishlist — get, add, remove.
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const { query } = require('../config/db');

// ---------------------------------------------------------------------------
// GET /api/wishlist
// ---------------------------------------------------------------------------
async function getWishlist(req, res, next) {
  try {
    const userId = req.user.id;

    const { rows } = await query(
      `SELECT
         w.id,
         w.product_id,
         w.added_at,
         p.name,
         COALESCE(p.price_paise, p.base_price * 100, 0) AS price_paise,
         COALESCE(p.base_price, p.price_paise / 100, 0) AS base_price,
         p.status,
         p.seller_id,
         COALESCE(sp.store_name, sp.shop_name, sp.display_name, 'Artisan Studio') AS store_name,
         COALESCE(
           (SELECT url FROM product_images pi
            WHERE pi.product_id = p.id
            ORDER BY pi.sort_order ASC LIMIT 1),
           NULL
         ) AS product_image
       FROM wishlists w
       JOIN products p ON p.id = w.product_id
       LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
       WHERE w.user_id = $1
       ORDER BY w.added_at DESC`,
      [userId]
    );

    return res.json({
      success: true,
      data: {
        wishlist: rows,
        items: rows,
        total: rows.length
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/wishlist
// ---------------------------------------------------------------------------
async function addToWishlist(req, res, next) {
  try {
    const userId = req.user.id;
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ success: false, message: 'product_id is required.' });
    }

    // Verify product exists
    const { rows: pRows } = await query(
      "SELECT id FROM products WHERE id = $1 AND status != 'deleted'",
      [product_id]
    );
    if (!pRows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const { rows } = await query(
      `INSERT INTO wishlists (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING
       RETURNING id, product_id, added_at`,
      [userId, product_id]
    );

    if (!rows.length) {
      return res.status(200).json({ success: true, data: { message: 'Already in wishlist.' } });
    }

    return res.status(201).json({ success: true, data: { item: rows[0] } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/wishlist/:productId
// ---------------------------------------------------------------------------
async function removeFromWishlist(req, res, next) {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    const { rowCount } = await query(
      'DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );

    if (!rowCount) {
      return res.status(404).json({ success: false, message: 'Item not found in wishlist.' });
    }

    return res.json({ success: true, data: { message: 'Removed from wishlist.' } });
  } catch (err) {
    next(err);
  }
}

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
