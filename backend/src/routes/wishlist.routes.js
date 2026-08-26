/**
 * Tohfa v2 — Wishlist Routes
 * File: backend/src/routes/wishlist.routes.js
 * Mounts at: /api/wishlist
 */
'use strict';

const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlist.controller');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', wishlistController.getWishlist);
router.post('/', wishlistController.addToWishlist);
router.post('/add', wishlistController.addToWishlist);
router.delete('/:productId', wishlistController.removeFromWishlist);

module.exports = router;
