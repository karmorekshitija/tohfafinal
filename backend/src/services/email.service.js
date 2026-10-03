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
  if (module.exports.sendMail && module.exports.sendMail !== sendMail) {
    return module.exports.sendMail(to, subject, html, text);
  }
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

function esc(val) {
  return String(val == null ? '' : val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Notify a newly created seller (normal artisan or special shop) with account and login details.
 * @param {string} email - Recipient seller email address
 * @param {object} details - { sellerName, storeName, identifier, password, plan, sellerType, loginUrl }
 */
async function sendSellerAccountCreatedEmail(email, {
  sellerName,
  storeName,
  identifier,
  password,
  plan,
  sellerType = 'regular',
  loginUrl
} = {}) {
  const isSpecial = sellerType === 'special';
  const displayStore = storeName || 'Artisan Studio';
  const displayName = sellerName || displayStore;
  const loginLink = loginUrl || `${process.env.FRONTEND_URL || 'https://thetohfa.in'}/auth/login.html`;
  const planDisplay = plan ? String(plan).toUpperCase() : (isSpecial ? 'SPECIAL STUDIO' : 'BASIC');

  const subject = isSpecial
    ? `Welcome to Tohfa Special — "${displayStore}" is Live! 🎉`
    : `Welcome to Tohfa Studio — Your Artisan Seller Account is Active! 🎉`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background-color: #FAF4E3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1C1C1C; }
    .email-wrapper { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(20,56,31,0.08); border: 1px solid #DCE6D8; }
    .header { background-color: #14381F; padding: 32px 24px; text-align: center; color: #FFF8E7; }
    .header h1 { margin: 0 0 8px 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }
    .header p { margin: 0; font-size: 13px; opacity: 0.9; letter-spacing: 1px; text-transform: uppercase; }
    .content { padding: 32px 28px; background-color: #ffffff; }
    .greeting { font-size: 18px; font-weight: 600; color: #14381F; margin-bottom: 12px; }
    .intro { font-size: 15px; line-height: 1.6; color: #3D3D3D; margin-bottom: 24px; }
    .creds-card { background: #FFF8E7; border: 1px solid #A8BFA5; border-radius: 10px; padding: 20px; margin-bottom: 24px; }
    .creds-title { font-size: 13px; text-transform: uppercase; font-weight: 700; color: #14381F; letter-spacing: 0.8px; margin-bottom: 14px; border-bottom: 1px dashed #A8BFA5; padding-bottom: 8px; }
    .cred-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
    .cred-label { color: #587A5B; font-weight: 500; }
    .cred-value { font-weight: 700; color: #1C1C1C; word-break: break-all; }
    .cred-code { font-family: monospace, Courier; background: #F7F1E1; padding: 2px 6px; border-radius: 4px; border: 1px solid #DCE6D8; }
    .btn-container { text-align: center; margin: 28px 0 20px 0; }
    .login-btn { display: inline-block; background-color: #14381F; color: #FFF8E7 !important; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; letter-spacing: 0.3px; }
    .note { font-size: 13px; color: #666666; line-height: 1.5; margin-top: 16px; background: #F7F1E1; padding: 12px; border-radius: 6px; }
    .steps-card { margin-top: 24px; border-top: 1px solid #EFEFEF; padding-top: 20px; }
    .steps-title { font-weight: 600; font-size: 14px; color: #14381F; margin-bottom: 10px; }
    .steps-list { margin: 0; padding-left: 20px; font-size: 14px; color: #4A4A4A; line-height: 1.6; }
    .footer { background: #FAF4E3; padding: 20px; text-align: center; font-size: 12px; color: #7A7A7A; border-top: 1px solid #DCE6D8; }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header">
      <p>Tohfa ${isSpecial ? 'Specials' : 'Studio'}</p>
      <h1>${isSpecial ? 'Special Studio Shop Live' : 'Artisan Account Created'}</h1>
    </div>
    <div class="content">
      <div class="greeting">Namaste ${esc(displayName)}! 🎁</div>
      <p class="intro">
        ${isSpecial
          ? `Your curated TOHFA Special shop <strong>"${esc(displayStore)}"</strong> has been successfully configured by platform administration and is now ready for catalog curation and order fulfillment.`
          : `Congratulations! Your artisan seller account for <strong>"${esc(displayStore)}"</strong> has been created and verified by administration. You can now log in to list handcrafted creations and manage orders.`}
      </p>

      <div class="creds-card">
        <div class="creds-title">🔐 Your Studio Access Details</div>
        <div class="cred-row"><span class="cred-label">Store Name:</span> <span class="cred-value">${esc(displayStore)}</span></div>
        <div class="cred-row"><span class="cred-label">Studio Plan:</span> <span class="cred-value">${esc(planDisplay)}</span></div>
        <div class="cred-row"><span class="cred-label">Login Identifier:</span> <span class="cred-value cred-code">${esc(identifier || email)}</span></div>
        ${password ? `<div class="cred-row"><span class="cred-label">Temporary Password:</span> <span class="cred-value cred-code">${esc(password)}</span></div>` : ''}
      </div>

      <div class="btn-container">
        <a href="${esc(loginLink)}" class="login-btn">Log In to Seller Studio →</a>
      </div>

      <div class="note">
        🔒 <strong>Security Tip:</strong> For your security, please log in and update your password from your account settings after your first sign in.
      </div>

      <div class="steps-card">
        <div class="steps-title">Quick Next Steps:</div>
        <ol class="steps-list">
          <li>Log in to your Seller Studio dashboard.</li>
          <li>Set up your courier pickup address in Studio Settings.</li>
          <li>Upload your handcrafted creations with images and pricing.</li>
          <li>Receive orders, print shipping labels, and track your payouts.</li>
        </ol>
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Tohfa Gifting Platform. Handcrafted with love.</p>
      <p>Questions? Contact our artisan support team at <a href="mailto:support@thetohfa.in" style="color: #14381F;">support@thetohfa.in</a></p>
    </div>
  </div>
</body>
</html>
  `;

  const text = [
    `Welcome to Tohfa ${isSpecial ? 'Specials' : 'Studio'}!`,
    '',
    `Namaste ${displayName},`,
    '',
    isSpecial
      ? `Your curated TOHFA Special shop "${displayStore}" has been successfully set up.`
      : `Your artisan seller account for "${displayStore}" has been created and verified by administration.`,
    '',
    '-------------------------------------------',
    'YOUR STUDIO ACCESS CREDENTIALS',
    '-------------------------------------------',
    `Store Name: ${displayStore}`,
    `Studio Plan: ${planDisplay}`,
    `Login Identifier: ${identifier || email}`,
    password ? `Password: ${password}` : '',
    `Login URL: ${loginLink}`,
    '-------------------------------------------',
    '',
    'Next steps: Log in to your seller studio to manage products, courier pickup addresses, and payouts.',
    '',
    '— Team Tohfa',
    'Artisan Support: support@thetohfa.in'
  ].filter(Boolean).join('\n');

  await sendMail(email, subject, html, text);
}

/**
 * Notify a seller that their application has been approved.
 * Accepts either an options object or a storeName string.
 * @param {string} email - Seller email address
 * @param {object|string} detailsOrStore - Seller details object or store name
 */
async function sendSellerApprovalEmail(email, detailsOrStore) {
  let sellerName = 'Artisan';
  let storeName = 'Your Store';

  if (typeof detailsOrStore === 'string') {
    storeName = detailsOrStore;
    sellerName = detailsOrStore;
  } else if (typeof detailsOrStore === 'object' && detailsOrStore !== null) {
    sellerName = detailsOrStore.sellerName || detailsOrStore.storeName || 'Artisan';
    storeName = detailsOrStore.storeName || detailsOrStore.sellerName || 'Your Store';
  }

  const subject = `Welcome to Tohfa — Your artisan studio "${storeName}" is approved!`;
  const loginUrl = `${process.env.FRONTEND_URL || 'https://thetohfa.in'}/auth/login.html`;
  const html = `
    <h1>Congratulations ${esc(sellerName)}!</h1>
    <p>Your application to become an artisan seller on Tohfa has been approved.</p>
    <p>Your store, <strong>${esc(storeName)}</strong>, is now ready.</p>
    <p>Please log in and add your first handcrafted listing:</p>
    <p><a href="${esc(loginUrl)}" style="display:inline-block;padding:10px 20px;background:#14381F;color:#FFF8E7;text-decoration:none;border-radius:6px;font-weight:bold;">Log In to Tohfa Studio</a></p>
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
    <p>Hi ${esc(sellerName || 'Artisan')},</p>
    <p>Unfortunately, your application to become a seller on Tohfa has not been approved at this time.</p>
    <p>Reason for rejection:</p>
    <blockquote>${esc(rejectionReason || 'Application criteria not met')}</blockquote>
    <p>We invite you to reapply in the future once the above issues are addressed.</p>
  `;
  await sendMail(email, subject, html);
}

module.exports = {
  sendMail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendSellerApprovalEmail,
  sendSellerAccountCreatedEmail,
  sendSellerRejectionEmail,
};
