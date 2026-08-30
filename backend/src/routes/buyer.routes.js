/**
 * Tohfa v2 — Buyer Routes
 * File: backend/src/routes/buyer.routes.js
 * Mounts at: /api/buyer
 */
'use strict';

const express = require('express');
const router = express.Router();
const buyerController = require('../controllers/buyer.controller');
const { authMiddleware } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

// Profile
router.get('/profile', authMiddleware, buyerController.getOwnProfile);
router.get('/me', authMiddleware, buyerController.getOwnProfile);
router.put('/profile', authMiddleware, buyerController.updateOwnProfile);
router.get('/:userId/profile', buyerController.getPublicProfile);

// Addresses
router.get('/addresses', authMiddleware, buyerController.getAddresses);
router.post('/addresses', authMiddleware, validate(schemas.address), buyerController.createAddress);
router.put('/addresses/:id', authMiddleware, validate(schemas.address), buyerController.updateAddress);
router.delete('/addresses/:id', authMiddleware, buyerController.deleteAddress);
router.patch('/addresses/:id/default', authMiddleware, buyerController.setDefaultAddress);

// Following Artisans
router.get('/following', authMiddleware, buyerController.getFollowingArtisans);

// Bulk Gifting & Corporate Inquiries (public or auth)
router.post('/bulk-inquiries', buyerController.submitBulkInquiry);

module.exports = router;
