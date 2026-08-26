/**
 * Tohfa v2 — Seller Role Guard
 * File: backend/src/middleware/sellerOnly.js
 * Role: Must be used AFTER authMiddleware.
 *       Rejects non-sellers AND unapproved sellers (application pending).
 */
'use strict';

const { query } = require('../config/db');

async function sellerOnly(req, res, next) {
  if (!req.user || req.user.role !== 'seller') {
    return res.status(403).json({ success: false, message: 'Seller access required.' });
  }

  // Demo user bypass for development
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.ALLOW_DEMO_LOGIN === 'true' &&
    req.user.id &&
    String(req.user.id).startsWith('d0000000-')
  ) {
    req.user.isSellerApproved = true;
    req.seller = { id: req.user.id, user_id: req.user.id, is_approved: true, vacation_mode: false };
    return next();
  }

  try {
    let { rows } = await query(
      'SELECT * FROM seller_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (rows.length === 0) {
      const sellerRes = await query('SELECT * FROM sellers WHERE user_id = $1 OR id = $1', [req.user.id]);
      if (sellerRes.rows.length > 0) {
        rows = sellerRes.rows;
      }
    }

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Seller profile not found. Please complete onboarding.'
      });
    }

    const seller = rows[0];
    const isApproved = seller.is_approved === true || seller.is_approved === 1 || seller.verification_status === 'verified' || seller.is_verified === true;

    if (!isApproved) {
      return res.status(403).json({
        success: false,
        code: 'SELLER_NOT_VERIFIED',
        message: 'Your seller account is pending admin verification.'
      });
    }

    req.seller = seller;
    req.seller.id = seller.id || seller.user_id;
    req.user.isSellerApproved = true;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = sellerOnly;
module.exports.sellerOnly = sellerOnly;

