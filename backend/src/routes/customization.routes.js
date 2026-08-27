/**
 * Tohfa v2 — Customization Routes
 * File: backend/src/routes/customization.routes.js
 * Mounts at: /api/customization
 */
'use strict';

const express = require('express');
const router = express.Router();
const customizationController = require('../controllers/customization.controller');
const { authMiddleware } = require('../middleware/auth');
const { sellerOnly } = require('../middleware/sellerOnly');
const { validate, schemas } = require('../middleware/validate');

const { uploadProofImage } = require('../middleware/upload');

// Public form configuration
router.get('/config/:productId', customizationController.getConfig);

// Seller Setup
router.post('/config', authMiddleware, sellerOnly, validate(schemas.openCustomizationConfig), customizationController.saveConfig);

// Proof-of-Work Lifecycle (Seller uploads proof, buyer approves/rejects)
router.post('/proof', authMiddleware, sellerOnly, uploadProofImage, customizationController.uploadProof);
router.post('/orders/:orderId/items/:itemId/proof', authMiddleware, sellerOnly, uploadProofImage, customizationController.uploadProof);

router.post('/proof/approve', authMiddleware, customizationController.approveProof);
router.post('/proof/reject', authMiddleware, customizationController.rejectProof);
router.post('/orders/:orderId/items/:itemId/proof-status', authMiddleware, customizationController.updateProofStatus);
router.patch('/orders/:orderId/items/:itemId/proof-status', authMiddleware, customizationController.updateProofStatus);

router.get('/orders/:orderId/items/:itemId/proof', authMiddleware, customizationController.getProof);
router.get('/proof/:itemId', authMiddleware, customizationController.getProof);

module.exports = router;
