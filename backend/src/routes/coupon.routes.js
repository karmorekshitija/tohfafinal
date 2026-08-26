/**
 * Tohfa v2 — Coupon Routes
 * File: backend/src/routes/coupon.routes.js
 * Mounts at: /api/coupons & /api/coupon
 */
'use strict';

const express = require('express');
const router = express.Router();
const couponController = require('../controllers/coupon.controller');

// Public coupon endpoints
router.get('/', couponController.listCoupons);
router.get('/list', couponController.listCoupons);
router.post('/apply', couponController.applyCoupon);
router.post('/verify', couponController.verifyCoupon);

module.exports = router;
