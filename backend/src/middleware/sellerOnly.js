/**
 * Tohfa v2 — Seller Role Guard
 * File: backend/src/middleware/sellerOnly.js
 * Role: Must be used AFTER authMiddleware.
 *       Rejects non-sellers AND unapproved sellers (application pending).
 */
'use strict';

const { query } = require('../config/db');

async function sellerOnly(req, res, next) {
  // 1. Admin acting on behalf of an admin-managed TOFA Special shop
  if (req.user && ['admin', 'master_admin'].includes(req.user.role)) {
    const actingSellerId = req.headers['x-acting-seller-id'] ||
                           req.headers['x-seller-id'] ||
                           req.query?.acting_seller_id ||
                           req.query?.seller_id ||
                           req.body?.acting_seller_id ||
                           req.body?.seller_id;

    if (!actingSellerId) {
      return res.status(403).json({
        success: false,
        message: 'Admin access to seller endpoints requires specifying an admin-managed shop via X-Acting-Seller-Id header or acting_seller_id parameter.'
      });
    }

    try {
      let { rows } = await query(
        `SELECT sp.*, u.id AS user_id, u.email, u.name,
                COALESCE(sp.is_admin_managed, s.is_admin_managed, FALSE) AS is_admin_managed
         FROM users u
         LEFT JOIN seller_profiles sp ON sp.user_id = u.id
         LEFT JOIN sellers s ON s.user_id = u.id
         WHERE (u.id::text = $1 OR sp.id::text = $1 OR s.id::text = $1 OR sp.slug = $1 OR s.slug = $1)
           AND u.role = 'seller'`,
        [actingSellerId]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Target seller profile not found.'
        });
      }

      const seller = rows[0];
      const isAdminManaged = seller.is_admin_managed === true ||
                             seller.is_admin_managed === 1 ||
                             seller.is_admin_managed === 'true';

      if (!isAdminManaged) {
        return res.status(403).json({
          success: false,
          code: 'NOT_ADMIN_MANAGED_SELLER',
          message: 'Forbidden: Admin authority can only act on behalf of TOFA Special (admin-managed) shops.'
        });
      }

      req.seller = seller;
      req.seller.id = seller.id || seller.user_id;
      req.user.id = seller.user_id;
      req.user.isSellerApproved = true;
      req.isAdminActing = true;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  // 2. Regular seller authorization check
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

    if (seller.verification_status === 'suspended' || seller.is_active === false) {
      return res.status(403).json({
        success: false,
        code: 'SELLER_SUSPENDED',
        message: 'Your seller account has been suspended by administration.'
      });
    }

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

