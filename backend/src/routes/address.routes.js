/**
 * Tohfa v2 — Address Routes
 * File: backend/src/routes/address.routes.js
 * Mounts at: /api/addresses, /api/address, /api/v1/addresses
 */
'use strict';

const express = require('express');
const router = express.Router();
const buyerController = require('../controllers/buyer.controller');
const { authMiddleware } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.get('/', authMiddleware, buyerController.getAddresses);
router.post('/', authMiddleware, validate(schemas.address), buyerController.createAddress);
router.put('/:id', authMiddleware, validate(schemas.address), buyerController.updateAddress);
router.delete('/:id', authMiddleware, buyerController.deleteAddress);
router.patch('/:id/default', authMiddleware, buyerController.setDefaultAddress);

module.exports = router;
