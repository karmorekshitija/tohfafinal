/**
 * Tohfa v2 — WhatsApp Cloud API Service
 * File: backend/src/services/whatsappCloud.service.js
 * Role: Sends WhatsApp messages via Meta Graph Cloud API.
 */
'use strict';

/**
 * Send a plain text WhatsApp message via Meta Cloud API.
 *
 * @param {string} to - Recipient phone number with country code (e.g. '919876543210')
 * @param {string} text - Message text body
 * @returns {Promise<void>}
 */
async function sendTextMessage(to, text) {
  try {
    const version = process.env.WHATSAPP_GRAPH_VERSION || 'v26.0';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      console.error('[WhatsApp Cloud] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
      return;
    }

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      console.error(`[WhatsApp Cloud] Error response from Graph API: status ${response.status}, body: ${responseBody}`);
    }
  } catch (err) {
    console.error('[WhatsApp Cloud] Failed to send message:', err.message);
  }
}

module.exports = {
  sendTextMessage,
};
