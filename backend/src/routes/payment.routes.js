/**
 * Tohfa v2 — Payment Routes
 * File: backend/src/routes/payment.routes.js
 * Mounts at: /api/payments
 */
'use strict';

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.post('/create-order', paymentController.createOrder);
router.post('/verify', paymentController.verifyPayment);
router.get('/status/:orderId', paymentController.getPaymentStatus);

module.exports = router;
