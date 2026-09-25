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

/**
 * Optional auth middleware — for public routes that benefit from knowing who
 * the caller is when they ARE logged in (e.g. Tanya AI on public buyer pages).
 *
 * BEHAVIOUR:
 *   - No token present   → req.user = null, continues (guest allowed)
 *   - Valid token        → req.user = decoded payload, continues
 *   - Invalid/expired    → req.user = null, continues (treats as guest; does NOT block)
 *
 * Rate-limiting (tanyaRateLimiter) serves as the primary Denial-of-Wallet
 * protection in place of hard authentication.
 */
async function optionalAuthMiddleware(req, res, next) {
  req.user = null; // default: unauthenticated / guest

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // no token — continue as guest
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      // Can't verify — proceed as guest rather than crashing a public page
      return next();
    }

    const payload = jwt.verify(token, secret);

    // Demo mode passthrough
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.ALLOW_DEMO_LOGIN === 'true' &&
      payload.id &&
      String(payload.id).startsWith('d0000000-')
    ) {
      req.user = payload;
      return next();
    }

    // Instant revocation check — skip silently on error rather than blocking public request
    try {
      const { rows } = await query(
        'SELECT id, role, is_active FROM users WHERE id = $1',
        [payload.id]
      );
      if (rows.length && rows[0].is_active !== false && rows[0].is_active !== 0) {
        req.user = payload;
      }
    } catch {
      // DB error during optional check — continue as guest
    }
  } catch {
    // Invalid / expired token — continue as guest, not an error for a public route
  }

  next();
}

module.exports = { authMiddleware, optionalAuthMiddleware };
