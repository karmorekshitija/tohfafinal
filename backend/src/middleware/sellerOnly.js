/**
 * Tohfa v2 — Seller Role Guard
 * File: backend/src/middleware/sellerOnly.js
 * Role: Must be used AFTER authMiddleware.
 *       Allows Sellers and Admins managing shops.
 */
'use strict';

const sellerOnly = (req, res, next) => {
  const role = req.user && req.user.role ? String(req.user.role).toUpperCase() : '';
  if (['SELLER', 'ADMIN', 'MASTER_ADMIN'].includes(role)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Seller or Admin access required' });
};

module.exports = { sellerOnly };
