/**
 * Tohfa v2 — WhatsApp Messaging Service
 * File: backend/src/services/whatsapp.service.js
 * Role: Public WhatsApp messaging interface for Tohfa.
 *       All functions are non-blocking, never throw exceptions, and delegate
 *       to the persistent WhatsApp outbox service.
 */
'use strict';

const crypto = require('crypto');
const whatsappOutboxService = require('./whatsappOutbox.service');
const { normalizeIndianMobile } = require('../utils/phone');

/**
 * Format phone number into standard normalized format ('91XXXXXXXXXX') or null.
 * Kept exported for backward compatibility.
 *
 * @param {string|number} phone
 * @returns {string|null}
 */
function formatWhatsAppNumber(phone) {
  return normalizeIndianMobile(phone);
}

/**
 * Send automated occasion reminder via WhatsApp (Marketing message)
 * Requires recipient marketing opt-in consent.
 *
 * @param {string} phoneNumber
 * @param {object} options
 * @param {string} options.occasionLabel
 * @param {string} [options.personName]
 * @param {number|string} options.daysUntil
 * @param {string} [options.occasionId]
 * @param {string|number} [options.checkpoint]
 * @param {string} [options.recipientUserId]
 * @returns {Promise<boolean>} true if enqueued or exists, false on failure
 */
async function sendOccasionReminder(phoneNumber, { occasionLabel, personName, daysUntil, occasionId, checkpoint, recipientUserId }) {
  try {
    const occId = occasionId || 'occ';
    const cp = checkpoint || daysUntil || 'reminder';
    const idempotencyKey = `occasion:${occId}:${cp}`;

    const res = await whatsappOutboxService.enqueue({
      kind: 'occasion_reminder',
      idempotencyKey,
      recipientUserId,
      rawPhone: phoneNumber,
      templateKey: 'occasion',
      variables: {
        occasionLabel: occasionLabel || 'Special Occasion',
        personName: personName || 'your loved one',
        daysUntil: String(daysUntil || 7),
      },
      requiresMarketingOptIn: true,
    });

    return !!(res && res.ok);
  } catch (err) {
    console.error(`[WhatsApp] Occasion reminder enqueue error:`, err.message);
    return false;
  }
}

/**
 * Send new order notification to artisan seller (Utility message)
 *
 * @param {string} phoneNumber
 * @param {object} options
 * @param {string} options.orderId
 * @param {string} [options.buyerName]
 * @param {number|string} options.amount
 * @param {string} [options.sellerOrderId]
 * @param {string} [options.sellerId]
 * @param {string} [options.recipientUserId]
 * @returns {Promise<boolean>} true if enqueued or exists, false on failure
 */
async function sendSellerOrderNotification(phoneNumber, { orderId, buyerName, amount, sellerOrderId, sellerId, recipientUserId }) {
  try {
    const sOrderId = sellerOrderId || (sellerId ? `${orderId}_${sellerId}` : orderId);
    const idempotencyKey = `seller_order:${sOrderId}:new_order`;

    const shortId = String(orderId).slice(0, 8);
    const num = Number(amount);
    const formattedAmount = (!isNaN(num) && amount !== null && amount !== undefined)
      ? num.toFixed(2).replace(/\.00$/, '')
      : '0.00';

    const res = await whatsappOutboxService.enqueue({
      kind: 'seller_new_order',
      idempotencyKey,
      recipientUserId: recipientUserId || sellerId,
      rawPhone: phoneNumber,
      templateKey: 'new_order',
      variables: {
        orderId: shortId,
        buyerName: buyerName || 'a customer',
        amount: formattedAmount,
      },
      requiresMarketingOptIn: false,
    });

    return !!(res && res.ok);
  } catch (err) {
    console.error(`[WhatsApp] Seller order alert enqueue error:`, err.message);
    return false;
  }
}

/**
 * Send customization quote ready notification to buyer (Utility message)
 *
 * @param {string} phoneNumber
 * @param {object} options
 * @param {string} options.sellerStoreName
 * @param {string} options.productName
 * @param {number|string} options.quoteAmount
 * @param {string} [options.requestId]
 * @param {string} [options.recipientUserId]
 * @returns {Promise<boolean>} true if enqueued or exists, false on failure
 */
async function sendCustomizationQuoteNotification(phoneNumber, { sellerStoreName, productName, quoteAmount, requestId, recipientUserId }) {
  try {
    let idempotencyKey;
    if (requestId) {
      idempotencyKey = `quote:${requestId}`;
    } else {
      const stableHash = crypto
        .createHash('sha256')
        .update(`${sellerStoreName || ''}_${productName || ''}_${quoteAmount || ''}_${new Date().toISOString().slice(0, 10)}`)
        .digest('hex')
        .slice(0, 12);
      idempotencyKey = `quote:${stableHash}`;
    }

    const num = Number(quoteAmount);
    const formattedAmount = (!isNaN(num) && quoteAmount !== null && quoteAmount !== undefined)
      ? num.toFixed(2).replace(/\.00$/, '')
      : '0.00';

    const res = await whatsappOutboxService.enqueue({
      kind: 'buyer_quote',
      idempotencyKey,
      recipientUserId,
      rawPhone: phoneNumber,
      templateKey: 'quote',
      variables: {
        sellerStoreName: sellerStoreName || 'An artisan',
        quoteAmount: formattedAmount,
        productName: productName || 'your custom request',
      },
      requiresMarketingOptIn: false,
    });

    return !!(res && res.ok);
  } catch (err) {
    console.error(`[WhatsApp] Quote alert enqueue error:`, err.message);
    return false;
  }
}

/**
 * Send customization proof preview notification to buyer (Utility message)
 *
 * @param {string} phoneNumber
 * @param {object} options
 * @param {string} options.sellerStoreName
 * @param {string} options.productName
 * @param {string} options.proofImageUrl
 * @param {string} [options.orderItemId]
 * @param {string} [options.recipientUserId]
 * @returns {Promise<boolean>} true if enqueued or exists, false on failure
 */
async function sendProofPreviewNotification(phoneNumber, { sellerStoreName, productName, proofImageUrl, orderItemId, recipientUserId }) {
  try {
    const proofHash = crypto.createHash('sha256').update(proofImageUrl || '').digest('hex').slice(0, 16);
    const itemId = orderItemId || 'item';
    const idempotencyKey = `proof:${itemId}:${proofHash}`;

    const res = await whatsappOutboxService.enqueue({
      kind: 'buyer_proof',
      idempotencyKey,
      recipientUserId,
      rawPhone: phoneNumber,
      templateKey: 'proof',
      variables: {
        sellerStoreName: sellerStoreName || 'The artisan',
        productName: productName || 'your custom order',
        proofImageUrl: proofImageUrl || 'https://thetohfa.in/buyer/orders.html',
      },
      requiresMarketingOptIn: false,
    });

    return !!(res && res.ok);
  } catch (err) {
    console.error(`[WhatsApp] Proof preview alert enqueue error:`, err.message);
    return false;
  }
}

module.exports = {
  formatWhatsAppNumber,
  sendOccasionReminder,
  sendSellerOrderNotification,
  sendCustomizationQuoteNotification,
  sendProofPreviewNotification,
};
