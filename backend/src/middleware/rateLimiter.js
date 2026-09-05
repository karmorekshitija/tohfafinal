/**
 * Tohfa v2 — Rate Limiter
 * File: backend/src/middleware/rateLimiter.js
 * Role: General API rate limiter + stricter auth-specific limiter.
 *       Applied globally to /api/* in server.js; auth-specific applied in auth.routes.js.
 */
'use strict';

const rateLimit = require('express-rate-limit');

// General limiter — 200 requests per minute per IP
const rateLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  skip: (req) => process.env.NODE_ENV === 'test',
});

// Temporary diagnostic logging for Task 1 Step 1a
const authRateLimitDebug = (req, res, next) => {
  console.log('[RATE-LIMIT-DEBUG]', {
    resolvedIp: req.ip,
    xForwardedFor: req.headers['x-forwarded-for'],
    remoteAddress: req.socket?.remoteAddress,
  });
  res.setHeader('X-Debug-Resolved-Ip', String(req.ip || ''));
  res.setHeader('X-Debug-X-Forwarded-For', String(req.headers['x-forwarded-for'] || ''));
  next();
};

// Strict auth limiter — 10 attempts per 15 minutes per IP
// Apply to: POST /api/auth/login, POST /api/auth/register, POST /api/auth/forgot-password
const authRateLimiter = [
  authRateLimitDebug,
  rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' },
    skip: (req) => process.env.NODE_ENV === 'test',
  }),
];

// Tanya AI limiter — 30 messages per minute per IP (prevent abuse)
const tanyaRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Chat rate limit reached. Please wait a moment.' },
  skip: (req) => process.env.NODE_ENV === 'test',
});

module.exports = { rateLimiter, authRateLimiter, tanyaRateLimiter };
