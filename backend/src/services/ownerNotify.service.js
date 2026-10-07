/**
 * Tohfa v2 — Owner Notification Service
 * File: backend/src/services/ownerNotify.service.js
 * Role: Sends owner task emails for manual WhatsApp mode and admin alerts.
 *       Every function is non-blocking and never throws to its caller.
 *
 * Manual Mode flow:
 *  1. queueTaskEmail(row) — sends one email per seller/buyer task.
 *  2. processManualQueue() — retries failed emails + sends escalation nudges.
 *  3. sendOccasionDigest(rows) — one digest email for all occasion reminder tasks.
 *
 * Admin alerts (independent of WhatsApp mode):
 *  4. sendAdminAlertEmail(type, data) — special order and seller application alerts.
 */
'use strict';

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { query } = require('../config/db');
const emailService = require('./email.service');
const whatsappConfig = require('../config/whatsapp');

let _transporter = null;
async function getTransporter() {
  if (_transporter) return _transporter;
  const port = parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || '465', 10);
  const secure = process.env.EMAIL_SECURE === 'true' || process.env.SMTP_SECURE === 'true' || port === 465;
  _transporter = nodemailer.createTransport({
    host: (process.env.EMAIL_HOST || process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
    port,
    secure,
    auth: {
      user: (process.env.EMAIL_USER || process.env.SMTP_USER || '').trim(),
      pass: (process.env.EMAIL_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    },
    family: 4,
  });
  return _transporter;
}

async function sendMail(to, subject, html, text) {
  if (module.exports.sendMail && module.exports.sendMail !== sendMail) {
    return module.exports.sendMail(to, subject, html, text);
  }
  if (emailService && typeof emailService.sendMail === 'function') {
    return emailService.sendMail(to, subject, html, text);
  }
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_FROM || '"Tohfa Gifting" <hello@thetohfa.in>',
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });
    return info;
  } catch (err) {
    console.error(`[Owner Notify Email] Failed to send to ${to}: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve recipient email address from OWNER_NOTIFY_EMAIL or ADMIN_EMAIL fallback */
function getRecipientEmail() {
  return (process.env.OWNER_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '').trim();
}

/** HTML-escape a string for safe insertion into HTML bodies */
function esc(val) {
  return String(val == null ? '' : val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sanitize a template variable value: strip control chars, trim, fallback if empty */
function san(val, fallback) {
  if (val === null || val === undefined || val === 'undefined' || val === 'null') {
    return String(fallback).trim();
  }
  let s = String(val)
    .replace(/[\r\n\t]/g, ' ')
    .replace(/ {4,}/g, '   ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || s === 'undefined' || s === 'null') s = String(fallback).trim();
  return s.slice(0, 200);
}

/** Generate HMAC token for the "Mark as Sent" link */
function buildMarkAsSentToken(rowId) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(String(rowId)).digest('hex').slice(0, 32);
}

/** Format a Date as IST readable string */
function toIST(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

// ---------------------------------------------------------------------------
// isConfigured
// ---------------------------------------------------------------------------

let _startupWarned = false;

/**
 * Returns true only if OWNER_NOTIFY_EMAIL/ADMIN_EMAIL and valid Resend or SMTP credentials exist.
 * Logs one startup warning if manual mode is on but email is not configured.
 */
function isConfigured() {
  const ownerEmail = getRecipientEmail();
  const hasEmail = Boolean(ownerEmail);

  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const isPlaceholder = (val) => !val || val.includes('placeholder') || val.includes('YOUR_') || val.includes('example.com') || val === 're_xxxx';
  const hasResend = Boolean(resendKey && !isPlaceholder(resendKey));

  const host = (process.env.EMAIL_HOST || process.env.SMTP_HOST || '').trim();
  const user = (process.env.EMAIL_USER || process.env.SMTP_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, '');

  const hasHostOrUser = Boolean((host && !isPlaceholder(host)) || (user && !isPlaceholder(user)));
  const hasPass = Boolean(pass && !isPlaceholder(pass));
  const hasSmtp = hasHostOrUser && hasPass;

  const configured = hasEmail && (hasResend || hasSmtp);

  if (!configured && !_startupWarned && whatsappConfig.getMode() === 'manual') {
    _startupWarned = true;
    console.warn('[Owner Notify] manual mode active but email is not configured — tasks will only be saved in whatsapp_outbox');
  }
  return configured;
}

// ---------------------------------------------------------------------------
// buildReadyMessage — THE COPY-PASTE MESSAGE BUILDER
// Produces the exact final plain-text message with ALL values filled in.
// No {{1}} placeholders, no undefined, no null, no HTML tags.
// ---------------------------------------------------------------------------

/**
 * Build the ready-to-paste WhatsApp message for a given outbox row.
 * @param {object} row - whatsapp_outbox row
 * @param {object} [extra] - extra data fetched from DB (itemLines, buyerName etc.)
 * @returns {string}
 */
function buildReadyMessage(row, extra = {}) {
  const v = row.variables || {};

  switch (row.kind) {
    case 'seller_new_order': {
      const storeName = san(v.storeName || extra.storeName, 'the artisan');
      const orderId = san(v.orderId, 'your order');
      const rawBuyer = san(v.buyerName || extra.buyerName, 'Customer');
      const buyerFirstName = rawBuyer.split(' ')[0] || 'Customer';
      const amount = san(v.amount, '0');
      const itemLines = extra.itemLines ? `Items:\n${extra.itemLines}\n` : '';
      const msg = [
        `Namaste ${storeName}! \uD83C\uDF81`,
        `You have a new order on Tohfa.`,
        `Order #${orderId} from ${buyerFirstName} — Rs ${amount}`,
        itemLines.trim(),
        `Please view the details and update fulfilment here: https://thetohfa.in/seller/orders.html`,
        `— Team Tohfa`,
      ].filter(Boolean).join('\n');
      return msg.slice(0, 1000);
    }
    case 'buyer_quote': {
      const sellerName = san(v.sellerStoreName || extra.sellerStoreName, 'An artisan');
      const amount = san(v.quoteAmount, '0');
      const product = san(v.productName, 'your custom request');
      const buyerName = san(v.buyerName || extra.buyerName, 'there');
      return [
        `Namaste ${buyerName}! \uD83C\uDF81`,
        `${sellerName} sent you a quote of Rs ${amount} for your custom request on ${product}.`,
        `Review it here: https://thetohfa.in/buyer/orders.html`,
        `— Team Tohfa`,
      ].join('\n').slice(0, 1000);
    }
    case 'buyer_proof': {
      const sellerName = san(v.sellerStoreName || extra.sellerStoreName, 'The artisan');
      const product = san(v.productName, 'your custom order');
      const proofUrl = san(v.proofImageUrl, 'https://thetohfa.in/buyer/orders.html');
      const buyerName = san(v.buyerName || extra.buyerName, 'there');
      return [
        `Namaste ${buyerName}! \uD83C\uDF81`,
        `${sellerName} has uploaded a design proof for your custom order ${product}.`,
        `Preview it here: ${proofUrl}`,
        `Please review and approve it before dispatch: https://thetohfa.in/buyer/orders.html`,
        `— Team Tohfa`,
      ].join('\n').slice(0, 1000);
    }
    case 'occasion_reminder': {
      const label = san(v.occasionLabel, 'Special Occasion');
      const person = san(v.personName, 'your loved one');
      const days = san(v.daysUntil, '7');
      const userName = san(v.userName || extra.userName, 'there');
      return [
        `Namaste ${userName}! \uD83C\uDF81`,
        `Your saved occasion ${label} for ${person} is ${days} days away.`,
        `Browse handmade gifts on Tohfa: https://thetohfa.in`,
        `— Team Tohfa`,
      ].join('\n').slice(0, 1000);
    }
    default:
      return '(message type not recognised)';
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers for queueTaskEmail
// ---------------------------------------------------------------------------

/** Fetch seller item lines for a seller_new_order row */
async function fetchSellerItemLines(row) {
  try {
    const v = row.variables || {};
    const orderId = v.orderId;
    if (!orderId) return { itemLines: '', storeName: null, buyerName: null };

    // Look up the full order ID from short ID prefix (first 8 chars)
    const { rows: orderRows } = await query(
      `SELECT o.id, u_b.name AS buyer_name FROM orders o
       JOIN users u_b ON u_b.id = o.buyer_id
       WHERE o.id::text LIKE $1
       LIMIT 1`,
      [`${orderId}%`]
    );
    if (!orderRows.length) return { itemLines: '', storeName: null, buyerName: null };
    const fullOrderId = orderRows[0].id;
    const buyerName = orderRows[0].buyer_name || null;

    // Get seller items for this seller only
    const { rows: items } = await query(
      `SELECT p.name AS product_name, oi.quantity
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1
         AND p.seller_id = $2
       ORDER BY oi.id
       LIMIT 6`,
      [fullOrderId, row.recipient_user_id]
    );

    if (!items.length) return { itemLines: '', storeName: null, buyerName };

    const shown = items.slice(0, 5);
    const extra = items.length > 5 ? items.length - 5 : 0;
    let lines = shown.map((i) => `- ${san(i.product_name, 'Item')} x ${i.quantity}`).join('\n');
    if (extra > 0) lines += `\n+ ${extra} more`;

    // Fetch store name
    let storeName = null;
    if (row.recipient_user_id) {
      const { rows: spRows } = await query(
        `SELECT COALESCE(sp.store_name, s.store_name, u.name) AS store_name
         FROM users u
         LEFT JOIN seller_profiles sp ON sp.user_id = u.id
         LEFT JOIN sellers s ON s.user_id = u.id
         WHERE u.id = $1 LIMIT 1`,
        [row.recipient_user_id]
      );
      storeName = spRows[0]?.store_name || null;
    }

    return { itemLines: lines, storeName, buyerName };
  } catch (e) {
    console.error('[Owner Notify] fetchSellerItemLines error:', e.message);
    return { itemLines: '', storeName: null, buyerName: null };
  }
}

/** Fetch buyer name for buyer_quote and buyer_proof rows */
async function fetchBuyerName(row) {
  try {
    if (!row.recipient_user_id) return null;
    const { rows } = await query('SELECT name FROM users WHERE id = $1', [row.recipient_user_id]);
    return rows[0]?.name || null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// buildTaskEmailBody — builds both HTML and plain text bodies
// ---------------------------------------------------------------------------

function buildTaskEmailBody(row, message, recipientLabel, phone, adminLink, extra = {}) {
  const isSeller = row.kind === 'seller_new_order';
  const roleLabel = isSeller ? 'SELLER' : 'BUYER';
  const waPhone = (row.intended_to || phone || '').replace(/\D/g, '');
  const waUrl = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message.slice(0, 1500))}`
    : null;

  const token = buildMarkAsSentToken(row.id);
  const markAsSentUrl = token
    ? `${process.env.API_BASE_URL || 'https://api.thetohfa.in'}/api/admin/whatsapp/outbox/${row.id}/done?token=${token}`
    : null;

  const createdAt = toIST(row.created_at || new Date());

  // ── HTML body ──────────────────────────────────────────────────────────────
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; font-size: 15px; color: #222; max-width: 640px; margin: 0 auto; padding: 20px; }
  h2 { color: #1a1a1a; margin-bottom: 4px; }
  .label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .recipient { font-size: 16px; margin: 8px 0 20px; }
  .msg-wrapper { margin: 20px 0; }
  .msg-label { font-size: 12px; color: #555; margin-bottom: 6px; padding: 6px 14px; background: #25D366; color: white; border-radius: 6px 6px 0 0; display: inline-block; }
  .msg-box { border: 2px solid #25D366; border-radius: 0 8px 8px 8px; background: #f0fff4; padding: 18px 20px; font-family: Arial, sans-serif; font-size: 15px; white-space: pre-wrap; line-height: 1.6; word-break: break-word; }
  .wa-btn { display: inline-block; background: #25D366; color: white !important; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-size: 16px; font-weight: bold; margin: 20px 0 8px; }
  .fallback-note { font-size: 12px; color: #888; margin-bottom: 20px; }
  .meta { font-size: 13px; color: #555; border-top: 1px solid #eee; padding-top: 14px; margin-top: 20px; }
  .mark-link { display: inline-block; margin-top: 10px; background: #f5f5f5; border: 1px solid #ccc; color: #333 !important; text-decoration: none; padding: 8px 18px; border-radius: 6px; font-size: 14px; }
</style></head>
<body>
  <h2>\uD83D\uDCF1 WhatsApp Task — ${esc(extra.subjectLabel || row.kind)}</h2>
  <div class="label">Send this to:</div>
  <div class="recipient"><strong>${esc(recipientLabel)}</strong><br><span style="color:#555">${esc(phone)}</span> &mdash; <strong>${roleLabel}</strong></div>

  <div class="msg-wrapper">
    <div class="msg-label">\uD83D\uDCCB Copy this message</div>
    <div class="msg-box">${esc(message)}</div>
  </div>

  ${waUrl ? `<a href="${esc(waUrl)}" class="wa-btn">\uD83D\uDCF1 Open WhatsApp with this message</a>
  <div class="fallback-note">Button not filling the message? Copy it from the box above and paste it into the chat.</div>` : ''}

  <div class="meta">
    ${adminLink ? `<div>\uD83D\uDD17 <a href="${esc(adminLink)}">View in admin panel</a></div>` : ''}
    <div>\u23F0 Task created: ${esc(createdAt)}</div>
    ${markAsSentUrl ? `<div style="margin-top:10px"><a href="${esc(markAsSentUrl)}" class="mark-link">\u2705 Mark as Sent</a></div>` : ''}
  </div>
</body>
</html>`;

  // ── Plain text body ────────────────────────────────────────────────────────
  const text = [
    `WhatsApp Task — ${extra.subjectLabel || row.kind}`,
    '',
    `Send this to: ${recipientLabel}`,
    `Phone: ${phone}  |  ${roleLabel}`,
    '',
    '-------------------------------------------',
    message,
    '-------------------------------------------',
    '',
    waUrl ? `Open WhatsApp: ${waUrl.slice(0, 300)}` : '',
    '(or copy the message from between the dashes above and paste it)',
    '',
    adminLink ? `Admin panel: ${adminLink}` : '',
    `Created at: ${createdAt}`,
    markAsSentUrl ? `Mark as Sent: ${markAsSentUrl}` : '',
  ].filter((l) => l !== null && l !== undefined).join('\n');

  return { html, text };
}

// ---------------------------------------------------------------------------
// queueTaskEmail
// ---------------------------------------------------------------------------

const KIND_LABELS = {
  seller_new_order: 'New order for seller',
  buyer_quote: 'Quote ready for buyer',
  buyer_proof: 'Proof ready for buyer',
  occasion_reminder: 'Occasion reminder',
};

const ADMIN_LINKS = {
  seller_new_order: 'https://thetohfa.in/admin/special-orders.html',
  buyer_quote: 'https://thetohfa.in/admin/orders.html',
  buyer_proof: 'https://thetohfa.in/admin/orders.html',
  occasion_reminder: null,
};

/**
 * Send one owner task email for a whatsapp_outbox row.
 * Fetches any needed context from the DB, builds the copy-paste message,
 * sends the email, and updates owner_email_status on the row.
 * Never throws.
 */
async function queueTaskEmail(row) {
  if (!isConfigured()) return;
  if (!row || !row.id) return;
  if (row.kind === 'occasion_reminder') return; // occasions go in digest

  try {
    // Increment attempt counter first
    await query(
      `UPDATE whatsapp_outbox
       SET owner_email_attempts = owner_email_attempts + 1, updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );

    // Fetch extra context from DB
    let extra = {};
    if (row.kind === 'seller_new_order') {
      extra = await fetchSellerItemLines(row);
    } else if (row.kind === 'buyer_quote' || row.kind === 'buyer_proof') {
      const name = await fetchBuyerName(row);
      extra = { buyerName: name };
    }

    extra.subjectLabel = KIND_LABELS[row.kind] || row.kind;

    // Build the ready message
    const message = buildReadyMessage(row, extra);

    // Determine recipient display
    const v = row.variables || {};
    const isSeller = row.kind === 'seller_new_order';
    const recipientLabel = isSeller
      ? san(v.storeName || extra.storeName, 'Artisan')
      : san(v.buyerName || extra.buyerName, 'Customer');
    const phone = row.intended_to || '';

    const shortId = String(row.id).slice(0, 8);
    const subject = `[Tohfa] Send WhatsApp: ${extra.subjectLabel} (#${shortId})`;
    const adminLink = ADMIN_LINKS[row.kind];

    const { html, text } = buildTaskEmailBody(row, message, recipientLabel, phone, adminLink, extra);

    const recipientEmail = getRecipientEmail();
    const result = await sendMail(
      recipientEmail,
      subject,
      html,
      text
    );

    const emailStatus = (result && result.success === true) ? 'sent' : 'failed';
    await query(
      `UPDATE whatsapp_outbox
       SET owner_email_status = $1, owner_emailed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [emailStatus, row.id]
    );
  } catch (err) {
    console.error(`[Owner Notify] queueTaskEmail error for row ${row.id}:`, err.message);
    try {
      await query(
        `UPDATE whatsapp_outbox
         SET owner_email_status = 'failed', updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
    } catch (_) {}
  }
}

/**
 * Send a short "number missing or invalid" alert for a manual_mode invalid_number row.
 * Never throws.
 */
async function queueInvalidNumberAlert(row) {
  if (!isConfigured()) return;
  try {
    const v = row.variables || {};
    const kind = KIND_LABELS[row.kind] || row.kind;
    const shortId = String(row.id).slice(0, 8);
    const subject = `[Tohfa] ⚠️ Missing number: ${kind} (#${shortId})`;
    const html = `<p><strong>Manual WhatsApp task could not be created.</strong></p>
<p>Kind: ${esc(kind)}<br>Outbox ID: ${esc(shortId)}<br>Reason: Phone number missing or invalid.</p>
<p>Please contact the recipient directly to fulfil this task.</p>`;
    const text = `Manual WhatsApp task — MISSING NUMBER\n\nKind: ${kind}\nOutbox ID: ${shortId}\nPhone was missing or invalid. Please contact the recipient directly.`;
    const recipientEmail = getRecipientEmail();
    await sendMail(recipientEmail, subject, html, text);
  } catch (err) {
    console.error('[Owner Notify] queueInvalidNumberAlert error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// processManualQueue — retry failed emails + escalation
// ---------------------------------------------------------------------------

// Backoff intervals in milliseconds for owner_email retries
const EMAIL_BACKOFFS_MS = [1, 5, 15, 30].map((m) => m * 60 * 1000);

/**
 * Process manual queue: retry pending/failed task emails and send escalation nudges.
 * Only runs in manual mode. Never throws.
 * @returns {{ ownerEmailsSent: number, escalated: number }}
 */
async function processManualQueue() {
  if (whatsappConfig.getMode() !== 'manual') {
    return { ownerEmailsSent: 0, escalated: 0 };
  }
  if (!isConfigured()) {
    return { ownerEmailsSent: 0, escalated: 0 };
  }

  let ownerEmailsSent = 0;
  let escalated = 0;

  try {
    // 1. Retry failed/pending task emails
    const { rows: retryRows } = await query(`
      SELECT * FROM whatsapp_outbox
      WHERE kind IN ('seller_new_order', 'buyer_quote', 'buyer_proof')
        AND owner_email_status IN ('pending', 'failed')
        AND owner_email_attempts < 5
        AND (
          owner_emailed_at IS NULL OR
          owner_emailed_at < NOW() - (CASE
            WHEN owner_email_attempts = 1 THEN INTERVAL '1 minute'
            WHEN owner_email_attempts = 2 THEN INTERVAL '5 minutes'
            WHEN owner_email_attempts = 3 THEN INTERVAL '15 minutes'
            ELSE INTERVAL '30 minutes'
          END)
        )
      ORDER BY created_at ASC
      LIMIT 20
    `);

    for (const row of retryRows) {
      try {
        await queueTaskEmail(row);
        ownerEmailsSent++;
      } catch (e) {
        console.error(`[Owner Notify] Retry email failed for ${row.id}:`, e.message);
      }
    }

    // 2. Escalation — tasks still manual_pending after ESCALATION_MINUTES
    const escalationMinutes = whatsappConfig.ESCALATION_MINUTES;
    const { rows: escalateRows } = await query(`
      SELECT * FROM whatsapp_outbox
      WHERE kind IN ('seller_new_order', 'buyer_quote', 'buyer_proof')
        AND status = 'manual_pending'
        AND escalated_at IS NULL
        AND created_at < NOW() - ($1 * INTERVAL '1 minute')
      ORDER BY created_at ASC
      LIMIT 20
    `, [escalationMinutes]);

    for (const row of escalateRows) {
      try {
        const v = row.variables || {};
        const kind = KIND_LABELS[row.kind] || row.kind;
        const name = row.kind === 'seller_new_order'
          ? san(v.storeName, 'the seller')
          : san(v.buyerName, 'the buyer');
        const shortId = String(row.id).slice(0, 8);

        const subject = `[Tohfa] Still waiting: send WhatsApp to ${name} (#${shortId})`;
        const waPhone = (row.intended_to || '').replace(/\D/g, '');
        const message = buildReadyMessage(row);
        const waUrl = waPhone
          ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message.slice(0, 1500))}`
          : null;

        const html = `<p>\uD83D\uDD14 <strong>Escalation reminder</strong></p>
<p>A WhatsApp task has been waiting for <strong>${escalationMinutes} minutes</strong> without being sent.</p>
<p>Task: <strong>${esc(kind)}</strong><br>Recipient: ${esc(name)} — ${esc(row.intended_to || '')}</p>
<p><strong>Message to send:</strong></p>
<div style="border:2px solid #25D366;border-radius:8px;background:#f0fff4;padding:16px;white-space:pre-wrap;font-family:Arial,sans-serif;">${esc(message)}</div>
${waUrl ? `<p><a href="${esc(waUrl)}" style="background:#25D366;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:12px;">\uD83D\uDCF1 Open WhatsApp</a></p>` : ''}`;

        const text = `ESCALATION: ${kind}\nRecipient: ${name} — ${row.intended_to || ''}\n\n---\n${message}\n---\n${waUrl ? `WhatsApp: ${waUrl}` : ''}`;

        const recipientEmail = getRecipientEmail();
        const result = await sendMail(
          recipientEmail,
          subject,
          html,
          text
        );

        // Mark escalated even if email failed (to avoid repeat escalations)
        await query(
          `UPDATE whatsapp_outbox SET escalated_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [row.id]
        );

        if (result && result.success === true) escalated++;
      } catch (e) {
        console.error(`[Owner Notify] Escalation failed for ${row.id}:`, e.message);
      }
    }
  } catch (err) {
    console.error('[Owner Notify] processManualQueue error:', err.message);
  }

  return { ownerEmailsSent, escalated };
}

// ---------------------------------------------------------------------------
// sendOccasionDigest
// ---------------------------------------------------------------------------

/**
 * Send one digest email listing all new occasion reminder tasks.
 * Each entry includes the copy-paste message and a wa.me link.
 * Marks included rows owner_email_status='sent'.
 * Never throws.
 */
async function sendOccasionDigest(rowsInput) {
  if (!isConfigured()) return;
  if (!Array.isArray(rowsInput) || !rowsInput.length) return;

  // Filter: only manual_pending occasion rows
  const rows = rowsInput.filter((r) => r && r.kind === 'occasion_reminder');
  if (!rows.length) return;

  try {
    // Build per-row sections
    const sections = [];
    const htmlSections = [];

    for (const row of rows) {
      const v = row.variables || {};
      const userName = san(v.userName || v.recipientName, 'there');
      const message = buildReadyMessage(row, { userName });
      const waPhone = (row.intended_to || '').replace(/\D/g, '');
      const waUrl = waPhone
        ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message.slice(0, 1500))}`
        : null;

      // Plain text section
      sections.push([
        `Recipient: ${userName} — ${row.intended_to || '(no phone)'}`,
        '---',
        message,
        '---',
        waUrl ? `WhatsApp link: ${waUrl.slice(0, 300)}` : '(no phone number)',
        '',
      ].join('\n'));

      // HTML section
      htmlSections.push(`
<div style="margin-bottom:32px;">
  <p><strong>${esc(userName)}</strong> &mdash; ${esc(row.intended_to || '(no phone)')}</p>
  <div style="border:2px solid #25D366;border-radius:8px;background:#f0fff4;padding:16px;white-space:pre-wrap;font-family:Arial,sans-serif;margin-bottom:10px;">${esc(message)}</div>
  ${waUrl ? `<a href="${esc(waUrl)}" style="background:#25D366;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">\uD83D\uDCF1 Open WhatsApp</a>` : ''}
</div>`);
    }

    const count = rows.length;
    const subject = `[Tohfa] WhatsApp Occasion Reminders — ${count} message${count === 1 ? '' : 's'} to send`;
    const html = `<h2>\uD83D\uDCC5 Occasion Reminder Digest (${count})</h2>
<p>Please send each of the following WhatsApp messages:</p>
${htmlSections.join('<hr style="margin:24px 0">')}`;
    const text = `Occasion Reminder Digest (${count})\nPlease send each of the following WhatsApp messages:\n\n${'='.repeat(50)}\n${sections.join('='.repeat(50) + '\n')}`;

    const recipientEmail = getRecipientEmail();
    await sendMail(recipientEmail, subject, html, text);

    // Mark rows as emailed
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length) {
      await query(
        `UPDATE whatsapp_outbox
         SET owner_email_status = 'sent', owner_emailed_at = NOW(), updated_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [ids]
      );
    }
  } catch (err) {
    console.error('[Owner Notify] sendOccasionDigest error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Admin alert dedup
// ---------------------------------------------------------------------------

const _alertDedup = new Map();
const DEDUP_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Send an admin alert email for special orders or new seller applications.
 * Deduped in-memory by type+id for 10 minutes to prevent duplicate emails
 * when both the payment route and the Razorpay webhook fire.
 *
 * @param {'special_order'|'seller_application'} type
 * @param {object} data
 */
async function sendAdminAlertEmail(type, data) {
  const ownerEmail = getRecipientEmail();
  if (!isConfigured()) {
    console.warn(`[Owner Notify] sendAdminAlertEmail (${type}) skipped: email config incomplete (recipientEmail=${ownerEmail ? 'SET' : 'MISSING'})`);
    return { success: false, reason: 'unconfigured' };
  }

  try {
    // For admin-created sellers, keep dedup to 5 seconds (prevent accidental double-click),
    // instead of locking out for 10 minutes.
    const dedupWindow = type === 'seller_created' ? 5000 : DEDUP_MS;
    const dedupKey = `${type}:${data.id || data.orderId || data.storeName || ''}`;
    const last = _alertDedup.get(dedupKey);
    if (last && Date.now() - last < dedupWindow) {
      console.log(`[Owner Notify] sendAdminAlertEmail (${type}) suppressed by dedup window (${dedupWindow}ms)`);
      return { success: false, reason: 'duplicate' };
    }
    _alertDedup.set(dedupKey, Date.now());

    let subject, html, text;

    if (type === 'special_order') {
      const shortId = String(data.orderId || data.id || '').slice(0, 8);
      subject = `[Tohfa Admin] Special Order: #${shortId} — ${data.shopName || 'Shop'}`;
      html = `<h2>\uD83C\uDF81 Tohfa Special Order Alert</h2>
<p><strong>Order ID:</strong> #${esc(shortId)}<br>
<strong>Shop:</strong> ${esc(data.shopName || 'N/A')}<br>
<strong>Buyer:</strong> ${esc(data.buyerName || 'N/A')}<br>
<strong>Amount:</strong> Rs ${esc(String(data.amount || ''))}</p>
<p><a href="${esc(data.link || 'https://thetohfa.in/admin/special-orders.html')}">View Special Orders</a></p>`;
      text = `Special Order Alert\nOrder: #${shortId}\nShop: ${data.shopName}\nBuyer: ${data.buyerName}\nAmount: Rs ${data.amount}\n${data.link}`;
    } else if (type === 'seller_application') {
      subject = `[Tohfa Admin] New Seller Application: ${data.storeName || 'New Store'}`;
      const loc = [data.city, data.state].filter(Boolean).join(', ') || 'N/A';
      html = `<h2>\uD83D\uDCDD New Seller Application</h2>
<p><strong>Store:</strong> ${esc(data.storeName || 'N/A')}<br>
<strong>Artisan:</strong> ${esc(data.artisanName || 'N/A')}<br>
<strong>Phone:</strong> ${esc(data.phone || 'N/A')}<br>
<strong>Location:</strong> ${esc(loc)}</p>
<p><a href="${esc(data.link || 'https://thetohfa.in/admin/sellers.html?tab=applications')}">Review Application</a></p>`;
      text = `New Seller Application\nStore: ${data.storeName}\nArtisan: ${data.artisanName}\nPhone: ${data.phone}\nLocation: ${loc}\n${data.link}`;
    } else if (type === 'seller_created') {
      const isSpecial = data.sellerType === 'special';
      const typeLabel = isSpecial ? 'TOHFA Special Shop' : 'Normal Artisan Seller';
      subject = `[Tohfa Admin] New Seller Created: ${data.storeName || 'New Store'} (${typeLabel})`;
      const loc = [data.city, data.state].filter(Boolean).join(', ') || 'N/A';
      html = `<h2>\uD83C\uDF81 New Seller Created by Admin</h2>
<p><strong>Store:</strong> ${esc(data.storeName || 'N/A')}<br>
<strong>Type:</strong> ${esc(typeLabel)}<br>
<strong>Artisan / Contact:</strong> ${esc(data.artisanName || data.storeName || 'N/A')}<br>
<strong>Login Email:</strong> ${esc(data.email || 'N/A')}<br>
<strong>Phone:</strong> ${esc(data.phone || 'N/A')}<br>
<strong>Plan:</strong> ${esc(data.plan ? String(data.plan).toUpperCase() : 'N/A')}<br>
<strong>Location:</strong> ${esc(loc)}</p>
<p><a href="${esc(data.link || 'https://thetohfa.in/admin/sellers.html')}">View in Admin Panel</a></p>`;
      text = `New Seller Created by Admin\nStore: ${data.storeName}\nType: ${typeLabel}\nEmail: ${data.email}\nPhone: ${data.phone || 'N/A'}\nPlan: ${data.plan || 'N/A'}\nLocation: ${loc}\n${data.link || 'https://thetohfa.in/admin/sellers.html'}`;
    } else {
      return { success: false, reason: 'unknown_type' };
    }

    const res = await sendMail(ownerEmail, subject, html, text);
    return res || { success: true };
  } catch (err) {
    console.error(`[Owner Notify] sendAdminAlertEmail error (${type}):`, err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getRecipientEmail,
  isConfigured,
  sendMail,
  buildReadyMessage,
  queueTaskEmail,
  queueInvalidNumberAlert,
  processManualQueue,
  sendOccasionDigest,
  sendAdminAlertEmail,
  buildMarkAsSentToken,
};
