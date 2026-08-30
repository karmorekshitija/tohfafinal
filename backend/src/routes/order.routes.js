/**
 * Tohfa v2 — Order Routes
 * File: backend/src/routes/order.routes.js
 * Mounts at: /api/orders
 */
'use strict';

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { authMiddleware } = require('../middleware/auth');
const { sellerOnly } = require('../middleware/sellerOnly');
const { adminOnly } = require('../middleware/adminOnly');

router.use(authMiddleware);

// Buyer & shared
router.post('/', orderController.placeOrder);
router.get('/', orderController.getBuyerOrders);
router.get('/seller', sellerOnly, orderController.getSellerOrders);
router.get('/admin', adminOnly, orderController.getAdminOrders);
router.get('/:id', orderController.getOrderById);
router.patch('/:id/status', sellerOnly, orderController.updateOrderStatus);
router.post('/:id/cancel', orderController.cancelOrder);

module.exports = router;
