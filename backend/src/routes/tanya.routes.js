/**
 * Tohfa v2 — Tanya AI Assistant Routes
 * File: backend/src/routes/tanya.routes.js
 * Mounts at: /api/tanya
 *
 * SECURITY: optionalAuthMiddleware enriches req.user when a token is present,
 * but does NOT block unauthenticated guests. Tanya is a public-facing widget
 * shown on buyer pages to all visitors including guests, so hard auth would
 * cause a redirect-to-login loop for anyone not logged in.
 *
 * tanyaRateLimiter (per-IP cap) is the primary Denial-of-Wallet guard and is
 * kept as the strict rate control layer on both routes.
 */
'use strict';

const express = require('express');
const router = express.Router();
const tanyaController = require('../controllers/tanya.controller');
const { tanyaRateLimiter } = require('../middleware/rateLimiter');
const { optionalAuthMiddleware } = require('../middleware/auth');

router.post('/chat',    tanyaRateLimiter, optionalAuthMiddleware, tanyaController.chat);
router.post('/message', tanyaRateLimiter, optionalAuthMiddleware, tanyaController.chat);

module.exports = router;
