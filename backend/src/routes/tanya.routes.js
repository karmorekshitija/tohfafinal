/**
 * Tohfa v2 — Tanya AI Assistant Routes
 * File: backend/src/routes/tanya.routes.js
 * Mounts at: /api/tanya
 *
 * SECURITY: authMiddleware is required on all Tanya endpoints to prevent
 * anonymous Denial-of-Wallet attacks against the paid Gemini API.
 * tanyaRateLimiter is kept as a second layer (per-IP cap even for authed users).
 */
'use strict';

const express = require('express');
const router = express.Router();
const tanyaController = require('../controllers/tanya.controller');
const { tanyaRateLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/auth');

router.post('/chat',    authMiddleware, tanyaRateLimiter, tanyaController.chat);
router.post('/message', authMiddleware, tanyaRateLimiter, tanyaController.chat);

module.exports = router;
