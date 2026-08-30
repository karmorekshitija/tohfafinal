/**
 * Tohfa v2 — Payment Routes
 * File: backend/src/routes/payment.routes.js
 * Mounts at: /api/payments
 */
'use strict';

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const sellerController = require('../controllers/seller.controller');
const { authMiddleware } = require('../middleware/auth');
const sellerOnly = require('../middleware/sellerOnly');

router.use(authMiddleware);

// Buyer & Gateway Payment Operations
router.post('/create-order', paymentController.createOrder);
router.post('/verify', paymentController.verifyPayment);
router.get('/status/:orderId', paymentController.getPaymentStatus);

// Seller Settlements & Payouts Financial Operations (consumed by Seller Studio payouts.html)
router.get('/earnings', sellerOnly, sellerController.getSellerEarnings);
router.get('/earnings/graph', sellerOnly, sellerController.getSellerEarningsGraph);
router.get('/receiving-details', sellerOnly, sellerController.getReceivingDetails);
router.post('/receiving-details', sellerOnly, sellerController.saveReceivingDetails);
router.get('/history/all', sellerOnly, sellerController.getPaymentHistory);
router.get('/tax', sellerOnly, sellerController.getTaxSettings);
router.post('/tax', sellerOnly, sellerController.saveTaxSettings);
router.get('/invoices/all', sellerOnly, sellerController.getSellerInvoices);
router.get('/disputes/all', sellerOnly, sellerController.getSellerDisputes);

module.exports = router;
