/**
 * Tohfa v2 — Occasion Routes
 * File: backend/src/routes/occasion.routes.js
 * Mounts at: /api/occasions & /api/occasion
 */
'use strict';

const express = require('express');
const router = express.Router();
const occasionController = require('../controllers/occasion.controller');
const { authMiddleware } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.use(authMiddleware);

router.get('/', occasionController.getOccasions);
router.post('/new', validate(schemas.occasion), occasionController.createOccasion);
router.post('/', validate(schemas.occasion), occasionController.createOccasion);
router.put('/:id', validate(schemas.occasion), occasionController.updateOccasion);
router.delete('/:id', occasionController.deleteOccasion);

module.exports = router;
