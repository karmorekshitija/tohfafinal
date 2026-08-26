/**
 * Tohfa v2 — Razorpay Config
 * File: backend/src/config/razorpay.js
 * Role: Creates and exports Razorpay instance with safe development fallback.
 */
'use strict';
const Razorpay = require('razorpay');

const key_id = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
const key_secret = process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret';

const razorpay = new Razorpay({
  key_id,
  key_secret,
});

module.exports = razorpay;
