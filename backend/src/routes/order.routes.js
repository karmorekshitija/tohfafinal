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

const sellerOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'seller' || req.user.role === 'admin' || req.user.is_admin)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Access denied. Seller or Admin only.' });
};

router.use(authMiddleware);

// Buyer & shared
router.post('/', orderController.placeOrder);
router.post('/overflow', orderController.createOverflowOrder);
router.get('/', orderController.getBuyerOrders);
router.get('/seller', sellerOnly, orderController.getSellerOrders);
router.get('/admin', adminOnly, orderController.getAdminOrders);
router.get('/:id', orderController.getOrderById);
router.patch('/:id/status', sellerOrAdmin, orderController.updateOrderStatus);
router.patch('/:id', sellerOrAdmin, orderController.updateOrderStatus);
router.post('/:id/cancel', orderController.cancelOrder);

module.exports = router;
