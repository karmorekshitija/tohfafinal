/**
 * Tohfa v2 — Central Error Handler
 * File: backend/src/middleware/errorHandler.js
 * Role: Last middleware in the Express chain. Catches all unhandled errors,
 *       formats them consistently, never leaks stack traces in production.
 */
'use strict';

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Log full error in dev, minimal in prod
  if (process.env.NODE_ENV === 'development') {
    console.error(`[Error] ${req.method} ${req.path}:`, err);
  } else {
    console.error(`[Error] ${req.method} ${req.path}: ${err.message}`);
  }

  // Joi validation errors
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      message: err.details?.[0]?.message || 'Validation failed.',
      field:   err.details?.[0]?.context?.key,
    });
  }

  // Multer errors (already handled in upload.js, but just in case)
  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: err.message });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }

  // Known app errors with status code
  const statusCode = err.status || err.statusCode || 500;
  const message = (statusCode < 500 || process.env.NODE_ENV === 'development')
    ? err.message
    : 'Something went wrong. Please try again.';

  res.status(statusCode).json({ success: false, message });
}

module.exports = { errorHandler };
