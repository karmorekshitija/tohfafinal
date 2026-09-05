/**
 * Tohfa v2 — Auth Routes
 * File: backend/src/routes/auth.routes.js
 * Mounts at: /api/auth
 */
'use strict';

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { validate, schemas } = require('../middleware/validate');

// Registration endpoints
router.post('/register', authRateLimiter, validate(schemas.register), authController.register);
router.post('/register/buyer', authRateLimiter, validate(schemas.register), authController.register);
router.post('/register/seller', authRateLimiter, validate(schemas.signupSeller), authController.signupSeller);
router.post('/signup-seller', authRateLimiter, validate(schemas.signupSeller), authController.signupSeller);

// Login endpoints
router.post('/login', authRateLimiter, validate(schemas.login), authController.login);
router.post('/login/admin', authRateLimiter, validate(schemas.adminLogin), authController.adminLogin);
router.post('/admin-login', authRateLimiter, validate(schemas.adminLogin), authController.adminLogin);

// Session token management
router.post('/refresh', authController.refresh);
router.post('/refresh-token', authController.refresh);
router.post('/logout', authController.logout);

// Password recovery
router.post('/forgot-password', authRateLimiter, validate(schemas.forgotPassword), authController.forgotPassword);
router.post('/reset-password', authRateLimiter, validate(schemas.resetPassword), authController.resetPassword);

module.exports = router;
