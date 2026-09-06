/**
 * Tohfa v2 — Ownership Verification Middleware (IDOR Prevention)
 * File: backend/src/middleware/ownership.js
 * Role: Guards seller-scoped resources (/api/seller/orders/:id, /api/seller/listings/:id)
 *       Ensures seller cannot view or mutate another seller's orders or listings.
 *       Returns 403 Forbidden on ownership mismatch.
 */
'use strict';

const { query } = require('../config/db');

/**
 * Verifies that the authenticated user owns the requested order or product resource.
 * @param {'order' | 'product'} resourceType
 */
function verifySellerOwnership(resourceType = 'order') {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: 'Unauthorized: Authentication required.' });
      }

      // Admins bypass seller ownership checks
      if (user.role === 'admin' || user.role === 'master_admin') {
        return next();
      }

      const resourceId = req.params.id || req.params.orderId || req.params.productId;
      if (!resourceId) {
        return next();
      }

      // Look up current seller's seller IDs (both user_id and sellers.id)
      const { rows: sellerRows } = await query(
        'SELECT id, user_id FROM sellers WHERE user_id = $1 UNION SELECT id, user_id FROM seller_profiles WHERE user_id = $1',
        [user.id]
      );
      const validSellerIds = new Set([
        user.id,
        Number(user.id),
        String(user.id),
        ...sellerRows.flatMap(s => [s.id, s.user_id, Number(s.id), String(s.id)])
      ]);

      if (resourceType === 'order') {
        const { rows } = await query(
          'SELECT id, seller_id FROM orders WHERE id::text = $1 OR order_ref = $1',
          [String(resourceId)]
        );

        if (!rows.length) {
          return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const order = rows[0];
        const hasAccess = validSellerIds.has(order.seller_id) ||
                          validSellerIds.has(Number(order.seller_id)) ||
                          validSellerIds.has(String(order.seller_id));

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: You do not have ownership of this order.',
          });
        }
      } else if (resourceType === 'product') {
        const { rows } = await query(
          'SELECT id, seller_id FROM products WHERE id::text = $1',
          [String(resourceId)]
        );

        if (!rows.length) {
          return res.status(404).json({ success: false, message: 'Product listing not found.' });
        }

        const product = rows[0];
        const hasAccess = validSellerIds.has(product.seller_id) ||
                          validSellerIds.has(Number(product.seller_id)) ||
                          validSellerIds.has(String(product.seller_id));

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: You do not have ownership of this product listing.',
          });
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { verifySellerOwnership };
