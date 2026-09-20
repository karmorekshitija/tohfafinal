/**
 * Tohfa v2 — Buyer Routes
 * File: backend/src/routes/buyer.routes.js
 * Mounts at: /api/buyer
 */
'use strict';

const express = require('express');
const router = express.Router();
const buyerController = require('../controllers/buyer.controller');
const sellerController = require('../controllers/seller.controller');
const { authMiddleware } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { uploadAvatar } = require('../middleware/upload');

// Profile
router.get('/profile', authMiddleware, buyerController.getOwnProfile);
router.get('/me', authMiddleware, buyerController.getOwnProfile);
router.put('/profile', authMiddleware, buyerController.updateOwnProfile);
router.patch('/profile', authMiddleware, buyerController.updateOwnProfile);
router.put('/me', authMiddleware, buyerController.updateOwnProfile);
router.patch('/me', authMiddleware, buyerController.updateOwnProfile);
router.post('/profile/avatar', authMiddleware, uploadAvatar, buyerController.uploadAvatar);
router.post('/me/avatar', authMiddleware, uploadAvatar, buyerController.uploadAvatar);
router.get('/:userId/profile', buyerController.getPublicProfile);

// Addresses
router.get('/addresses', authMiddleware, buyerController.getAddresses);
router.post('/addresses', authMiddleware, validate(schemas.address), buyerController.createAddress);
router.put('/addresses/:id', authMiddleware, validate(schemas.address), buyerController.updateAddress);
router.delete('/addresses/:id', authMiddleware, buyerController.deleteAddress);
router.patch('/addresses/:id/default', authMiddleware, buyerController.setDefaultAddress);

// Following Artisans
router.get('/following', authMiddleware, buyerController.getFollowingArtisans);
router.delete('/follow/:id', authMiddleware, sellerController.unfollowSeller);
router.post('/follow/:id', authMiddleware, sellerController.followSeller);
router.delete('/follow', authMiddleware, sellerController.unfollowSeller);
router.post('/follow', authMiddleware, sellerController.followSeller);

// Bulk Gifting & Corporate Inquiries (public or auth)
router.post('/bulk-inquiries', buyerController.submitBulkInquiry);

module.exports = router;
