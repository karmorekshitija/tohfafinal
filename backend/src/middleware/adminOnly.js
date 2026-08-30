/**
 * Tohfa v2 — Admin Middleware with Role Guard
 * File: backend/src/middleware/adminOnly.js
 * Role: Must be used AFTER authMiddleware. Rejects non-admin or deactivated users.
 */
'use strict';

const db = require('../config/db');

async function adminOnly(req, res, next) {
  try {
    if (!req.user || !['admin', 'master_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden: Super-Admin authority required.'
      });
    }

    if (
      process.env.NODE_ENV === 'development' &&
      process.env.ALLOW_DEMO_LOGIN === 'true' &&
      req.user.id &&
      String(req.user.id).startsWith('d0000000-')
    ) {
      return next();
    }

    // Verify user is active & not banned
    const userRes = await db.query('SELECT is_active, is_banned FROM users WHERE id::text = $1', [String(req.user.id)]);
    if (userRes.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'User account not found.'
      });
    }

    const u = userRes.rows[0];
    const isActive = u.is_active === true || u.is_active === 1 || u.is_active === '1';
    const isBanned = u.is_banned === true || u.is_banned === 1 || u.is_banned === '1';

    if (!isActive || isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Admin account deactivated or suspended.'
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = adminOnly;
module.exports.adminOnly = adminOnly;
