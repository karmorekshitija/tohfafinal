/**
 * Tohfa v2 — Coupon Routes
 * File: backend/src/routes/coupon.routes.js
 * Mounts at: /api/coupons & /api/coupon
 */
'use strict';

const express = require('express');
const router = express.Router();
const couponController = require('../controllers/coupon.controller');
const { authMiddleware } = require('../middleware/auth');

// S-03 fix: Coupon list requires auth — prevents bots from scraping all active codes
router.get('/', authMiddleware, couponController.listCoupons);
router.get('/list', authMiddleware, couponController.listCoupons);
router.post('/apply', authMiddleware, couponController.applyCoupon);
router.post('/verify', authMiddleware, couponController.verifyCoupon);

module.exports = router;
