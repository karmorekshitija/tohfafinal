/**
 * Tohfa v2 — Cloudinary Config
 * File: backend/src/config/cloudinary.js
 * Role: Initializes Cloudinary SDK (v1). Used by upload.js middleware.
 *       Note: Using cloudinary v1 for compatibility with multer-storage-cloudinary@4.
 */
'use strict';
const cloudinary = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

module.exports = cloudinary;
