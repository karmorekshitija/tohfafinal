/**
 * Tohfa v2 — Cart Routes
 * File: backend/src/routes/cart.routes.js
 * Mounts at: /api/cart
 */
'use strict';

const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cart.controller');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Get Cart
router.get('/', cartController.getCart);
router.get('/items', cartController.getCart);

// Add to Cart
router.post('/', cartController.addToCart);
router.post('/items', cartController.addToCart);

// Merge Guest Cart (AUTH-05)
router.post('/merge', cartController.mergeCart);

// Update Cart Item (supports multiple endpoint patterns)
router.put('/update', cartController.updateCartItem);
router.put('/items/:id', cartController.updateCartItem);
router.put('/:itemId', cartController.updateCartItem);

// Remove Cart Item
router.delete('/items/:id', cartController.removeCartItem);
router.delete('/:itemId', cartController.removeCartItem);

// Clear Cart
router.delete('/', cartController.clearCart);

module.exports = router;
