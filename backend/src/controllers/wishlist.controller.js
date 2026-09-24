/**
 * Tohfa v2 — Wishlist Controller
 * File: src/controllers/wishlist.controller.js
 * Role: HTTP handlers for buyer wishlist — get, add, remove.
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const { query } = require('../config/db');

// Cache unique constraint check
let hasConflictConstraint = null;
async function checkUniqueConstraint() {
  if (hasConflictConstraint !== null) return hasConflictConstraint;
  try {
    const { rows } = await query(`
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'wishlists'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE '%(user_id, product_id)%'
      LIMIT 1
    `);
    hasConflictConstraint = rows.length > 0;
  } catch (_) {
    hasConflictConstraint = false;
  }
  return hasConflictConstraint;
}

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
         w.created_at AS added_at,
         w.created_at,
         p.name,
         (COALESCE(p.base_price, 0) * 100)::bigint AS price_paise,
         COALESCE(p.base_price, 0) AS base_price,
         p.status,
         p.seller_id,
         COALESCE(sp.store_name, sp.shop_name, 'Artisan Studio') AS store_name,
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
       ORDER BY w.created_at DESC`,
      [userId]
    );

    return res.json({
      success: true,
      data: {
        wishlist: rows,
        items: rows,
        total: rows.length,
        count: rows.length,
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/wishlist / POST /api/wishlist/:id
// ---------------------------------------------------------------------------
async function addToWishlist(req, res, next) {
  try {
    const userId = req.user.id;
    const productId = req.params.id || req.params.productId || req.body.product_id || req.body.productId;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'product_id is required.' });
    }

    // Verify product exists
    const { rows: pRows } = await query(
      "SELECT id FROM products WHERE id = $1 AND status != 'deleted'",
      [productId]
    );
    if (!pRows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    // Check whether an ON CONFLICT (user_id, product_id) constraint exists
    const hasConflict = await checkUniqueConstraint();

    let item;
    if (hasConflict) {
      try {
        const { rows } = await query(
          `INSERT INTO wishlists (user_id, product_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, product_id) DO NOTHING
           RETURNING id, product_id`,
          [userId, productId]
        );
        if (!rows.length) {
          const { rows: existing } = await query(
            'SELECT id, product_id FROM wishlists WHERE user_id = $1 AND product_id = $2 LIMIT 1',
            [userId, productId]
          );
          return res.status(200).json({ success: true, data: { message: 'Already in wishlist.', item: existing[0] } });
        }
        item = rows[0];
      } catch (err) {
        // Fallback to explicit SELECT then conditional INSERT
        const { rows: existing } = await query(
          'SELECT id, product_id FROM wishlists WHERE user_id = $1 AND product_id = $2 LIMIT 1',
          [userId, productId]
        );
        if (existing.length) {
          return res.status(200).json({ success: true, data: { message: 'Already in wishlist.', item: existing[0] } });
        }
        const { rows } = await query(
          'INSERT INTO wishlists (user_id, product_id) VALUES ($1, $2) RETURNING id, product_id',
          [userId, productId]
        );
        item = rows[0];
      }
    } else {
      // Explicit SELECT check to avoid relying on undefined unique indexes
      const { rows: existing } = await query(
        'SELECT id, product_id FROM wishlists WHERE user_id = $1 AND product_id = $2 LIMIT 1',
        [userId, productId]
      );
      if (existing.length) {
        return res.status(200).json({ success: true, data: { message: 'Already in wishlist.', item: existing[0] } });
      }

      // Conditional INSERT
      const { rows } = await query(
        'INSERT INTO wishlists (user_id, product_id) VALUES ($1, $2) RETURNING id, product_id',
        [userId, productId]
      );
      item = rows[0];
    }

    return res.status(201).json({ success: true, data: { item } });
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
    const productId = req.params.id || req.params.productId || req.body.product_id || req.body.productId;

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

module.exports = {
  getWishlist,
  addToWishlist,
  toggleWishlist: addToWishlist,
  removeFromWishlist,
};
