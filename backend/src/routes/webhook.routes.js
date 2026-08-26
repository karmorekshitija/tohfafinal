/**
 * Tohfa v2 — Webhook Routes
 * File: backend/src/routes/webhook.routes.js
 * Mounts at: /api/webhook
 * Note: Must use express.raw() body parser for HMAC verification
 */
'use strict';

const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

router.post('/razorpay', express.raw({ type: 'application/json' }), webhookController.handleRazorpayWebhook);

module.exports = router;
