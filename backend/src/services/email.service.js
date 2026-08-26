/**
 * Tohfa v2 — Email Service (Dev Stub)
 * File: src/services/email.service.js
 * Role: Stub email functions that log in development.
 *       Real SMTP/SendGrid integration will be wired by the integration agent.
 *       Never log passwords, tokens, or sensitive PII beyond email address.
 */
'use strict';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Send a password reset email.
 * @param {string} email - Recipient email address
 * @param {string} resetUrl - Full password reset URL containing the raw token
 */
async function sendPasswordResetEmail(email, resetUrl) {
  if (isDev) {
    console.log(`[EMAIL STUB] Password reset email → ${email}`);
    console.log(`[EMAIL STUB] Reset URL: ${resetUrl}`);
    return;
  }
  // Production: wire real transporter here
  // await transporter.sendMail({ to: email, subject: 'Reset your Tohfa password', html: ... });
}

/**
 * Send an order confirmation email to the buyer.
 * @param {string} email - Buyer email address
 * @param {object} orderDetails - Order summary object
 */
async function sendOrderConfirmationEmail(email, orderDetails) {
  if (isDev) {
    console.log(`[EMAIL STUB] Order confirmation → ${email}`, { orderId: orderDetails?.id });
    return;
  }
  // Production: wire real transporter here
}

/**
 * Notify a seller that their application has been approved.
 * @param {string} email - Seller email address
 * @param {string} storeName - Seller's store name
 */
async function sendSellerApprovalEmail(email, storeName) {
  if (isDev) {
    console.log(`[EMAIL STUB] Seller approved → ${email} (store: ${storeName})`);
    return;
  }
  // Production: wire real transporter here
}

/**
 * Notify a seller that their application has been rejected.
 * @param {string} email - Seller email address
 * @param {string} storeName - Seller's store name
 * @param {string} reason - Human-readable rejection reason
 */
async function sendSellerRejectionEmail(email, storeName, reason) {
  if (isDev) {
    console.log(`[EMAIL STUB] Seller rejected → ${email} (store: ${storeName}) reason: ${reason}`);
    return;
  }
  // Production: wire real transporter here
}

module.exports = {
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendSellerApprovalEmail,
  sendSellerRejectionEmail,
};
