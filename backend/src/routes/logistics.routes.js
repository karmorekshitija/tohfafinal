/**
 * Tohfa v2 — Logistics Routes
 * File: backend/src/routes/logistics.routes.js
 * Mounts at: /api/logistics
 */
'use strict';

const express = require('express');
const router = express.Router();
const logisticsController = require('../controllers/logistics.controller');
const { authMiddleware } = require('../middleware/auth');
const { sellerOnly } = require('../middleware/sellerOnly');

// Public pincode serviceability check (BUG-08)
router.get('/serviceability', logisticsController.checkServiceability);

// Parcel tracking
router.get('/track/:trackingId', logisticsController.trackShipment);

// Seller/Admin manual shipment dispatch (BUG-07)
router.post('/ship/:orderId', authMiddleware, sellerOnly, logisticsController.shipOrder);

// Automated AWB generation (iThink Logistics)
router.post('/generate-awb', authMiddleware, sellerOnly, logisticsController.generateAWB);
router.post('/orders/:id/awb', authMiddleware, sellerOnly, logisticsController.generateAWB);

// Shipping label endpoints
router.get('/label/:sellerOrderId', authMiddleware, sellerOnly, logisticsController.getShippingLabel);
router.get('/orders/:id/label', authMiddleware, sellerOnly, logisticsController.getShippingLabel);

module.exports = router;


