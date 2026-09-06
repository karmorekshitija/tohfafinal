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

function cleanVal(v) {
  if (!v) return '';
  return String(v).trim().replace(/^["']+|["']+$/g, '').trim();
}

let cloudName = cleanVal(process.env.CLOUDINARY_CLOUD_NAME);
let apiKey = cleanVal(process.env.CLOUDINARY_API_KEY);
let apiSecret = cleanVal(process.env.CLOUDINARY_API_SECRET);

// If CLOUDINARY_URL is provided (e.g. from cloud provider environment), parse it
const rawCloudUrl = cleanVal(process.env.CLOUDINARY_URL);
if (rawCloudUrl) {
  try {
    const parsed = new URL(rawCloudUrl);
    if (!cloudName || cloudName.startsWith('YOUR_')) cloudName = cleanVal(parsed.hostname);
    if (!apiKey || apiKey.startsWith('YOUR_')) apiKey = cleanVal(parsed.username);
    if (!apiSecret || apiSecret.startsWith('YOUR_')) apiSecret = cleanVal(parsed.password);
  } catch (e) {
    const match = rawCloudUrl.match(/cloudinary:\/\/([^:]+):([^@]+)@(.+)/);
    if (match) {
      if (!apiKey || apiKey.startsWith('YOUR_')) apiKey = cleanVal(match[1]);
      if (!apiSecret || apiSecret.startsWith('YOUR_')) apiSecret = cleanVal(match[2]);
      if (!cloudName || cloudName.startsWith('YOUR_')) cloudName = cleanVal(match[3]);
    }
  }
}

const isConfigured = Boolean(
  cloudName && !cloudName.startsWith('YOUR_') &&
  apiKey && !apiKey.startsWith('YOUR_') &&
  apiSecret && !apiSecret.startsWith('YOUR_')
);

if (!isConfigured) {
  const msg = '[Cloudinary] Missing or placeholder credentials (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET). Resilient fallback will be used.';
  if (process.env.NODE_ENV === 'production') {
    console.warn(msg);
  } else if (process.env.NODE_ENV !== 'test') {
    console.warn(msg);
  }
}

cloudinary.config({
  cloud_name: cloudName,
  api_key:    apiKey,
  api_secret: apiSecret,
  secure:     true,
});

module.exports = cloudinary;
