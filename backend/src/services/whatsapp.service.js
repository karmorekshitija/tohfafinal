/**
 * Tohfa v2 — WhatsApp Messaging Service
 * File: backend/src/services/whatsapp.service.js
 * Role: Twilio WhatsApp bot integration for automated occasion reminders,
 *       seller order notifications, and customization quote alerts.
 *       All methods fail safely without throwing exceptions to preserve business flows.
 */
'use strict';

const { twilioClient, WHATSAPP_FROM } = require('../config/twilio');

/**
 * Helper to normalize Indian phone number into Twilio whatsapp destination
 * @param {string} phone
 * @returns {string} e.g. "whatsapp:+919876543210"
 */
function formatWhatsAppNumber(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length !== 10) return null;
  return `whatsapp:+91${last10}`;
}

/**
 * Send automated occasion reminder via WhatsApp
 */
async function sendOccasionReminder(phoneNumber, { occasionLabel, personName, daysUntil }) {
  try {
    const to = formatWhatsAppNumber(phoneNumber);
    if (!to || !twilioClient || !WHATSAPP_FROM) return false;

    const person = personName ? ` for ${personName}` : '';
    const body = `Namaste! 🎁 Your saved occasion "${occasionLabel}"${person} is coming up in ${daysUntil} days.\nFind a handcrafted, memorable gift on Tohfa: https://thetohfa.in`;

    await twilioClient.messages.create({
      from: WHATSAPP_FROM,
      to,
      body,
    });
    return true;
  } catch (err) {
    console.error(`[WhatsApp] Occasion reminder failed for ${phoneNumber}:`, err.message);
    return false;
  }
}

/**
 * Send new order notification to artisan seller
 */
async function sendSellerOrderNotification(phoneNumber, { orderId, buyerName, amount }) {
  try {
    const to = formatWhatsAppNumber(phoneNumber);
    if (!to || !twilioClient || !WHATSAPP_FROM) return false;

    const shortId = String(orderId).slice(0, 8);
    const body = `🎁 New Order on Tohfa Studio!\nOrder #${shortId} placed by ${buyerName || 'a customer'} for ₹${amount}.\nCheck details & update fulfillment: https://thetohfa.in/seller/desktop/orders.html`;

    await twilioClient.messages.create({
      from: WHATSAPP_FROM,
      to,
      body,
    });
    return true;
  } catch (err) {
    console.error(`[WhatsApp] Seller order alert failed for ${phoneNumber}:`, err.message);
    return false;
  }
}

/**
 * Send customization quote ready notification to buyer
 */
async function sendCustomizationQuoteNotification(phoneNumber, { sellerStoreName, productName, quoteAmount }) {
  try {
    const to = formatWhatsAppNumber(phoneNumber);
    if (!to || !twilioClient || !WHATSAPP_FROM) return false;

    const body = `🎁 Quote Received!\n${sellerStoreName} sent a quote of ₹${quoteAmount} for your custom request on "${productName}".\nReview and confirm your order: https://thetohfa.in/buyer/desktop/profile.html`;

    await twilioClient.messages.create({
      from: WHATSAPP_FROM,
      to,
      body,
    });
    return true;
  } catch (err) {
    console.error(`[WhatsApp] Quote alert failed for ${phoneNumber}:`, err.message);
    return false;
  }
}

module.exports = {
  formatWhatsAppNumber,
  sendOccasionReminder,
  sendSellerOrderNotification,
  sendCustomizationQuoteNotification,
};
