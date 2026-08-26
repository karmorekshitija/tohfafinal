/**
 * Tohfa v2 — Twilio WhatsApp Client
 * File: backend/src/config/twilio.js
 * Role: Initializes Twilio client with safe development fallbacks.
 */
'use strict';
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;

let twilioClient = null;
if (accountSid && authToken && accountSid.startsWith('AC')) {
  try {
    twilioClient = twilio(accountSid, authToken);
  } catch (e) {
    console.warn('[Twilio] Init skipped:', e.message);
  }
}

const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

module.exports = { twilioClient, WHATSAPP_FROM };
