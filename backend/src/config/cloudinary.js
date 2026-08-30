/**
 * Tohfa v2 — Cloudinary Config
 * File: backend/src/config/cloudinary.js
 * Role: Initializes Cloudinary SDK v2. Used by upload middleware & media storage.
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const cloudinary = require('cloudinary').v2;

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('⚠️ [Cloudinary] Credentials missing (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET). Media uploads will fail.');
  }
}

cloudinary.config({
  cloud_name: cloudName,
  api_key:    apiKey,
  api_secret: apiSecret,
  secure:     true,
});

module.exports = cloudinary;
