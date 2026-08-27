/**
 * Tohfa v2 — Auth Controller
 * File: src/controllers/auth.controller.js
 * Role: HTTP handlers for all authentication endpoints.
 *       Delegates business logic to auth.service.js.
 *       Delegates email sending to email.service.js.
 */
'use strict';

const crypto = require('crypto');
const authService = require('../services/auth.service');
const emailService = require('../services/email.service');
const { query } = require('../config/db');

/**
 * POST /api/auth/register & POST /api/auth/register/buyer
 */
async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    return res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/signup-seller & POST /api/auth/register/seller
 * AUTH-03: Atomic Seller Registration & Profile Initialization
 */
async function signupSeller(req, res, next) {
  try {
    const result = await authService.signupSeller(req.body);
    return res.status(201).json({
      success: true,
      message: 'Seller registered successfully. Please complete store onboarding.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    return res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/admin-login & POST /api/auth/login/admin
 * AUTH-06: Dedicated Admin Login Endpoint
 */
async function adminLogin(req, res, next) {
  try {
    const result = await authService.adminLogin(req.body);
    return res.status(200).json({
      success: true,
      message: 'Admin authenticated successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required.' });
    }
    const tokens = await authService.refreshTokens(refreshToken);
    return res.status(200).json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Body: { refreshToken }
 */
async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    }
    return res.status(200).json({ success: true, data: { message: 'Logged out successfully.' } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(200).json({
        success: true,
        data: { message: 'If that email exists, a reset link has been sent.' },
      });
    }

    const normalized = authService.normalizeEmail(email);

    const { rows } = await query(
      'SELECT id, email FROM users WHERE LOWER(TRIM(email)) = $1 AND is_active = true',
      [normalized]
    );

    // Always return 200 to avoid user enumeration
    if (!rows.length) {
      return res.status(200).json({
        success: true,
        data: { message: 'If that email exists, a reset link has been sent.' },
      });
    }

    const user = rows[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    await authService.setPasswordResetToken(user.id, rawToken);

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/reset-password.html?token=${rawToken}`;
    await emailService.sendPasswordResetEmail(user.email, resetUrl);

    return res.status(200).json({
      success: true,
      data: { message: 'If that email exists, a reset link has been sent.' },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/reset-password
 * Body: { token, password }
 */
async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
    }

    const user = await authService.verifyAndConsumeResetToken(token);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
    }

    await authService.updatePassword(user.id, password);
    await authService.revokeAllUserTokens(user.id);

    return res.status(200).json({
      success: true,
      data: { message: 'Password updated successfully. Please log in again.' },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  signupSeller,
  registerSeller: signupSeller,
  login,
  adminLogin,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
};
