/**
 * Tohfa v2 — Email Service (Dev Stub)
 * File: src/services/email.service.js
 * Role: Stub email functions that log in development.
 *       Real SMTP/SendGrid integration will be wired by the integration agent.
 *       Never log passwords, tokens, or sensitive PII beyond email address.
 */
'use strict';

const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Transporter Configuration
// Reads from environment variables. Falls back to Ethereal (fake SMTP) in dev.
// Required env vars for production: EMAIL_HOST, EMAIL_PORT, EMAIL_USER,
//   EMAIL_PASS, EMAIL_FROM
// ---------------------------------------------------------------------------

let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev && !process.env.EMAIL_HOST) {
    // Create an Ethereal test account automatically in dev (emails are viewable at ethereal.email)
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log(`[Email] Dev mode: using Ethereal SMTP. Preview at https://ethereal.email`);
  } else {
    _transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  return _transporter;
}

const FROM_ADDRESS = process.env.EMAIL_FROM || '"Tohfa Gifting" <hello@thetohfa.in>';

async function sendMail(to, subject, html, text) {
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''), // Strip HTML for plain text fallback
    });
    console.log(`[Email] Sent to ${to}: ${subject} (msgId: ${info.messageId})`);
    return info;
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}: ${err.message}`);
    // Non-fatal — log and continue, don't crash the caller
  }
}

/**
 * Send a password reset email.
 * @param {string} email - Recipient email address
 * @param {string} resetUrl - Full password reset URL containing the raw token
 */
async function sendPasswordResetEmail(email, resetUrl) {
  const subject = 'Reset your Tohfa password';
  const html = `
    <h1>Password Reset Request</h1>
    <p>You requested a password reset for your Tohfa account.</p>
    <p>Click the link below to reset your password:</p>
    <a href="${resetUrl}">Reset Password</a>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `;
  await sendMail(email, subject, html);
}

/**
 * Send an order confirmation email to the buyer.
 * @param {string} email - Buyer email address
 * @param {object} orderDetails - Order summary object
 */
async function sendOrderConfirmationEmail(email, { orderId, buyerName, totalAmount, items }) {
  const subject = `Order Confirmed — Tohfa #${orderId}`;
  const html = `
    <h1>Order Confirmed</h1>
    <p>Hi ${buyerName || 'Customer'},</p>
    <p>Your order <strong>#${orderId}</strong> has been confirmed.</p>
    <p>Total amount: ₹${totalAmount}</p>
    <p>Order Summary:</p>
    <ul>
      ${(items || []).map(item => `<li>${item.name || 'Item'} x ${item.quantity || 1}</li>`).join('')}
    </ul>
    <p>Thank you for shopping on Tohfa!</p>
  `;
  await sendMail(email, subject, html);
}

/**
 * Notify a seller that their application has been approved.
 * @param {string} email - Seller email address
 * @param {object} details - Seller details
 */
async function sendSellerApprovalEmail(email, { sellerName, storeName }) {
  const subject = 'Welcome to Tohfa — Your artisan studio is approved!';
  const html = `
    <h1>Congratulations ${sellerName}!</h1>
    <p>Your application to become a seller has been approved.</p>
    <p>Your store, <strong>${storeName}</strong>, is now ready.</p>
    <p>Please log in and add your first listing.</p>
  `;
  await sendMail(email, subject, html);
}

/**
 * Notify a seller that their application has been rejected.
 * @param {string} email - Seller email address
 * @param {object} details - Rejection details
 */
async function sendSellerRejectionEmail(email, { sellerName, rejectionReason }) {
  const subject = 'Tohfa Seller Application Update';
  const html = `
    <h1>Application Update</h1>
    <p>Hi ${sellerName},</p>
    <p>Unfortunately, your application to become a seller on Tohfa has not been approved at this time.</p>
    <p>Reason for rejection:</p>
    <blockquote>${rejectionReason}</blockquote>
    <p>We invite you to reapply in the future once the above issues are addressed.</p>
  `;
  await sendMail(email, subject, html);
}

module.exports = {
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendSellerApprovalEmail,
  sendSellerRejectionEmail,
};
