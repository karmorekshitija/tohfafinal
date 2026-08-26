/**
 * Tohfa v2 — Tanya AI Assistant Routes
 * File: backend/src/routes/tanya.routes.js
 * Mounts at: /api/tanya
 */
'use strict';

const express = require('express');
const router = express.Router();
const tanyaController = require('../controllers/tanya.controller');
const { tanyaRateLimiter } = require('../middleware/rateLimiter');

router.post('/chat', tanyaRateLimiter, tanyaController.chat);
router.post('/message', tanyaRateLimiter, tanyaController.chat);

module.exports = router;
