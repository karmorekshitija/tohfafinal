/**
 * Tohfa v2 — Analytics Routes
 * File: backend/src/routes/analytics.routes.js
 * Mounts at: /api/analytics
 */
'use strict';

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authMiddleware } = require('../middleware/auth');
const { sellerOnly } = require('../middleware/sellerOnly');
const { adminOnly } = require('../middleware/adminOnly');

router.use(authMiddleware);

// Seller analytics
router.get('/seller/revenue', sellerOnly, analyticsController.getSellerRevenue);
router.get('/seller/top-products', sellerOnly, analyticsController.getSellerTopProducts);
router.get('/seller/summary', sellerOnly, analyticsController.getSellerSummary);
router.get('/seller/views', sellerOnly, analyticsController.getSellerProductViews);

// Admin KPIs
router.get('/admin/stats', adminOnly, analyticsController.getAdminStats);

module.exports = router;
