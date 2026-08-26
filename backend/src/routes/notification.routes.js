/**
 * Tohfa v2 — Notification Routes
 * File: backend/src/routes/notification.routes.js
 * Mounts at: /api/notifications
 */
'use strict';

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', notificationController.getNotifications);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', notificationController.markOneRead);

module.exports = router;
