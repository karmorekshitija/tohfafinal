/**
 * Tohfa v2 — Email Service
 * File: src/services/email.service.js
 * Role: Provides dual-transport email delivery (Resend HTTPS API over Port 443 primary,
 *       Nodemailer SMTP fallback, and dev test fallback).
 *       Guards against placeholder credentials and guarantees email delivery on Render Free tier.
 */
'use strict';

const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Credential & Placeholder Validation
// ---------------------------------------------------------------------------

function isPlaceholderValue(val) {
  if (!val || typeof val !== 'string') return true;
  const s = val.trim().toLowerCase();
  return (
    !s ||
    s.includes('placeholder') ||
    s.includes('your_') ||
    s.includes('example.com') ||
    s === 're_xxxx' ||
    s === 're_your_api_key_here' ||
    s === 'your_email@gmail.com' ||
    s === 'your_app_password'
  );
}

function getResendApiKey() {
  const key = (process.env.RESEND_API_KEY || '').trim();
  if (isPlaceholderValue(key)) return null;
  return key;
}

function sanitizeCredentials() {
  let user = (process.env.EMAIL_USER || process.env.SMTP_USER || '').trim();
  let pass = (process.env.EMAIL_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const host = (process.env.EMAIL_HOST || process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || '465', 10);
  const secure = process.env.EMAIL_SECURE === 'true' || process.env.SMTP_SECURE === 'true' || port === 465;

  if (isPlaceholderValue(user)) user = '';
  if (isPlaceholderValue(pass)) pass = '';

  return { user, pass, host, port, secure };
}

function getFromAddress() {
  const resendKey = getResendApiKey();
  const configuredFrom = (process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.RESEND_FROM || '').trim();

  if (configuredFrom && !isPlaceholderValue(configuredFrom)) {
    return configuredFrom;
  }
  const { user } = sanitizeCredentials();
  if (user) {
    return `"Tohfa Gifting" <${user}>`;
  }
  if (resendKey) {
    return 'Tohfa <onboarding@resend.dev>';
  }
  return '"Tohfa Gifting" <hello@thetohfa.in>';
}

let _transporter = null;

function resetTransporter() {
  _transporter = null;
}

async function getTransporter() {
  if (_transporter) return _transporter;

  const { user, pass, host, port, secure } = sanitizeCredentials();
  const hasCredentials = Boolean(user && pass);

  // 1. If real credentials exist, ALWAYS use real SMTP (production, preview, or development)
  if (hasCredentials) {
    const isGmail = !host || host.toLowerCase().includes('gmail') || user.toLowerCase().endsWith('@gmail.com');

    if (isGmail) {
      _transporter = nodemailer.createTransport({
        service: 'gmail',
        host: host || 'smtp.gmail.com',
        port,
        secure,
        auth: { user, pass },
        // Force IPv4 to prevent Render container IPv6 connection hangs (ETIMEDOUT)
        family: 4,
      });
      console.log(`[Email] Initialized Gmail transport for account: ${user} (port=${port}, secure=${secure}, IPv4 enabled)`);
    } else {
      _transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        family: 4,
      });
      console.log(`[Email] Initialized custom SMTP transport for ${host}:${port} (secure=${secure}, IPv4 enabled)`);
    }
    return _transporter;
  }

  // 2. If no credentials and running in non-production, fallback to Ethereal mock SMTP
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    try {
      const testAccount = await nodemailer.createTestAccount();
      _transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
        family: 4,
      });
      console.log(`[Email] Dev mode without credentials: using Ethereal SMTP. Preview at https://ethereal.email`);
      return _transporter;
    } catch (e) {
      console.warn(`[Email] Could not create Ethereal test account: ${e.message}`);
    }
  }

  // 3. Fallback unauthenticated transport (will log error when send is attempted)
  _transporter = nodemailer.createTransport({
    host: host || 'smtp.gmail.com',
    port: port || 465,
    secure: Boolean(secure),
    family: 4,
  });
  return _transporter;
}

async function verifyConnection() {
  const resendApiKey = getResendApiKey();
  if (resendApiKey) {
    return { success: true, transport: 'resend' };
  }
  const transporter = await getTransporter();
  return transporter.verify();
}

/**
 * Dispatches email using Resend HTTPS API (Primary) or Nodemailer SMTP (Fallback).
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML body content
 * @param {string} [text] - Plain text body fallback
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string, code?: string }>}
 */
async function sendMail(to, subject, html, text) {
  if (module.exports.sendMail && module.exports.sendMail !== sendMail) {
    return module.exports.sendMail(to, subject, html, text);
  }

  if (!to) {
    console.error('[Email] sendMail called without recipient email');
    return { success: false, error: 'Missing recipient email' };
  }

  const resendApiKey = getResendApiKey();
  const plainText = text || (html ? html.replace(/<[^>]+>/g, '') : '');

  // -------------------------------------------------------------------------
  // Path A: Primary — Resend HTTPS API (Port 443)
  // Unblocked on Render Free tier where outbound SMTP ports 25/465/587 are blocked
  // -------------------------------------------------------------------------
  if (resendApiKey) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(resendApiKey);
      const from = getFromAddress();

      const response = await resend.emails.send({
        from,
        to,
        subject,
        html,
        text: plainText,
      });

      if (response.error) {
        const errMsg = response.error.message || (typeof response.error === 'string' ? response.error : JSON.stringify(response.error));
        console.error(`[Email Resend] FAILED sending to ${to} ("${subject}"): ${errMsg}`);
        return { success: false, error: errMsg };
      }

      const messageId = response.data?.id || response.id || 'resend_ok';
      console.log(`[Email Resend] Successfully dispatched email via HTTPS to ${to}: "${subject}" (msgId: ${messageId})`);
      return { success: true, messageId };
    } catch (err) {
      console.error(`[Email Resend] Exception sending to ${to} ("${subject}"): ${err.message}`);
      return { success: false, error: err.message, code: err.code };
    }
  }

  // -------------------------------------------------------------------------
  // Path B: Fallback — Nodemailer SMTP
  // -------------------------------------------------------------------------
  try {
    const transporter = await getTransporter();
    const from = getFromAddress();
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text: plainText,
    });
    console.log(`[Email SMTP] Successfully dispatched email to ${to}: "${subject}" (msgId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email SMTP] FAILED sending to ${to} ("${subject}"): ${err.message}${err.code ? ` [Code: ${err.code}]` : ''}`);
    return { success: false, error: err.message, code: err.code };
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
  return await sendMail(email, subject, html);
}

/**
 * Send an order confirmation email to the buyer.
 * @param {string} email - Buyer email address
 * @param {object} orderDetails - Order summary object
 */
async function sendOrderConfirmationEmail(email, { orderId, buyerName, totalAmount, items } = {}) {
  if (!email) return { success: false, error: 'Missing recipient email' };
  const safeOrderId = orderId || 'N/A';
  const safeBuyerName = buyerName || 'Customer';
  const safeTotal = totalAmount != null ? totalAmount : '0.00';
  const safeItems = Array.isArray(items) ? items : [];

  const subject = `Order Confirmed — Tohfa #${safeOrderId}`;
  const html = `
    <h1>Order Confirmed</h1>
    <p>Hi ${esc(safeBuyerName)},</p>
    <p>Your order <strong>#${esc(safeOrderId)}</strong> has been confirmed.</p>
    <p>Total amount: ₹${esc(safeTotal)}</p>
    <p>Order Summary:</p>
    <ul>
      ${safeItems.map(item => `<li>${esc(item?.name || item?.product_name || 'Item')} x ${esc(item?.quantity || 1)}</li>`).join('')}
    </ul>
    <p>Thank you for shopping on Tohfa!</p>
  `;
  return await sendMail(email, subject, html);
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
  const displayStore = storeName || sellerName || 'Artisan Studio';
  const displayName = sellerName || displayStore || 'Artisan';
  const loginId = identifier || email || 'N/A';
  const safePassword = password ? String(password) : null;
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
        <div class="cred-row"><span class="cred-label">Login Identifier:</span> <span class="cred-value cred-code">${esc(loginId)}</span></div>
        ${safePassword ? `<div class="cred-row"><span class="cred-label">Temporary Password:</span> <span class="cred-value cred-code">${esc(safePassword)}</span></div>` : ''}
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
    `Login Identifier: ${loginId}`,
    safePassword ? `Password: ${safePassword}` : '',
    `Login URL: ${loginLink}`,
    '-------------------------------------------',
    '',
    'Next steps: Log in to your seller studio to manage products, courier pickup addresses, and payouts.',
    '',
    '— Team Tohfa',
    'Artisan Support: support@thetohfa.in'
  ].filter(Boolean).join('\n');

  return await sendMail(email, subject, html, text);
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
  return await sendMail(email, subject, html);
}

/**
 * Notify a seller that their application has been rejected.
 * @param {string} email - Seller email address
 * @param {object} details - Rejection details
 */
async function sendSellerRejectionEmail(email, { sellerName, rejectionReason } = {}) {
  const subject = 'Tohfa Seller Application Update';
  const html = `
    <h1>Application Update</h1>
    <p>Hi ${esc(sellerName || 'Artisan')},</p>
    <p>Unfortunately, your application to become a seller on Tohfa has not been approved at this time.</p>
    <p>Reason for rejection:</p>
    <blockquote>${esc(rejectionReason || 'Application criteria not met')}</blockquote>
    <p>We invite you to reapply in the future once the above issues are addressed.</p>
  `;
  return await sendMail(email, subject, html);
}

/**
 * Checks whether valid email sending credentials (Resend API key or SMTP user/pass) are configured.
 * @returns {boolean}
 */
function isEmailConfigured() {
  if (getResendApiKey() !== null) return true;
  const { user, pass } = sanitizeCredentials();
  return Boolean(user && pass);
}

module.exports = {
  isEmailConfigured,
  sendMail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendSellerApprovalEmail,
  sendSellerAccountCreatedEmail,
  sendSellerRejectionEmail,
  getResendApiKey,
  getTransporter,
  resetTransporter,
  sanitizeCredentials,
  getFromAddress,
  verifyConnection,
};

