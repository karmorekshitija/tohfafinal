/**
 * Tohfa v2 — Seller Onboarding Enforcement Middleware (Zero-Bypass)
 * File: backend/src/middleware/sellerOnboarding.js
 * Role: Prevents sellers from creating, drafting, or publishing listings
 *       until Banking/Payout and Billing/Address information are fully completed.
 */
'use strict';

const { getSellerOnboardingStatus } = require('../utils/sellerOnboarding');

/**
 * Middleware that strictly blocks product listing creation or publishing
 * if the seller has not completed billing address and banking details.
 */
async function enforceSellerOnboarding(req, res, next) {
  try {
    const userRole = String(req.user?.role || '').toLowerCase();
    const isAdmin = userRole === 'admin' || userRole === 'master_admin' || Boolean(req.user?.realAdminId || req.user?.actingAsSeller || req.user?.actingAsSpecialShop);

    // Admins managing marketplace or system shops bypass this check unless testing seller context
    if (isAdmin && !req.headers['x-enforce-seller-gating']) {
      return next();
    }

    const sellerUserId = req.user?.id;
    if (!sellerUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const status = await getSellerOnboardingStatus(sellerUserId);

    if (!status.hasBillingAddress || !status.hasBankingDetails) {
      return res.status(403).json({
        success: false,
        errorCode: 'ONBOARDING_INCOMPLETE',
        message: 'Banking and billing information must be completed before listing new products.'
      });
    }

    // Attach onboarding status to request for downstream handlers if needed
    req.sellerOnboarding = status;
    return next();
  } catch (err) {
    console.error('[SellerOnboardingGuard] Error checking onboarding status:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify seller onboarding status'
    });
  }
}

module.exports = {
  enforceSellerOnboarding
};
