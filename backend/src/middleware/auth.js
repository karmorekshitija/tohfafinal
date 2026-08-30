/**
 * Tohfa v2 — JWT Auth Middleware
 * File: backend/src/middleware/auth.js
 * Role: Verifies the Bearer JWT on protected routes.
 *       Attaches decoded user payload to req.user.
 *       Checks database to ensure user is active (Instant Revocation).
 *       Does NOT check role — use adminOnly.js or sellerOnly.js for that.
 */
'use strict';

const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, message: 'JWT_ACCESS_SECRET configuration is missing on server.' });
    }
    const payload = jwt.verify(token, secret);

    // Support demo mode / demo user IDs if in development
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.ALLOW_DEMO_LOGIN === 'true' &&
      payload.id &&
      String(payload.id).startsWith('d0000000-')
    ) {
      // FIX SEC-02: Warn if demo login is active in a non-development-like environment
      if (process.env.NODE_ENV === 'production') {
        console.error('[SECURITY] Demo login bypass triggered in production! Set ALLOW_DEMO_LOGIN=false immediately.');
      }
      req.user = payload;
      return next();
    }

    // Instant revocation: Check if user exists and is active in database
    const { rows } = await query(
      'SELECT id, role, is_active FROM users WHERE id = $1',
      [payload.id]
    );

    if (!rows.length || rows[0].is_active === false || rows[0].is_active === 0) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated or suspended.',
      });
    }

    req.user = payload; // { id, email, role, isSellerApproved }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid authentication token.' });
  }
}

module.exports = { authMiddleware };
