/**
 * Tohfa v2 — Unified Upload Routes
 * File: backend/src/routes/upload.routes.js
 * Role: Handles single media uploads with automatic compression and Cloudinary optimization.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { uploadSingleMedia, optimizeCloudinaryUrl } = require('../middleware/upload');
const { authMiddleware } = require('../middleware/auth');

// Optional auth: allows authenticated sellers/buyers to upload, or handles general uploads
router.post('/', (req, res, next) => {
  // Use uploadSingleMedia
  uploadSingleMedia(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const rawUrl = req.file.path || req.file.secure_url;
    const optimizedUrl = optimizeCloudinaryUrl(rawUrl);

    return res.status(200).json({
      success: true,
      url: optimizedUrl,
      data: {
        url: optimizedUrl,
        public_id: req.file.filename || null,
        format: req.file.format || null,
        bytes: req.file.bytes || req.file.size || null,
      },
    });
  });
});

module.exports = router;
