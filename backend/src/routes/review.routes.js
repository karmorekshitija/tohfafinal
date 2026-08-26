/**
 * Tohfa v2 — Review Routes
 * File: backend/src/routes/review.routes.js
 * Mounts at: /api/reviews
 */
'use strict';

const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const { authMiddleware } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

// Public reading
router.get('/seller/:sellerId', reviewController.getSellerReviews);
router.get('/product/:productId', reviewController.getProductReviews);

// Buyer submission
router.post('/', authMiddleware, validate(schemas.review), reviewController.submitReview);

// Artisan/Admin review reply
router.post('/:id/reply', authMiddleware, reviewController.replyToReview);

module.exports = router;
