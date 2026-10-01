/**
 * Tohfa v2 — WhatsApp Cloud API Service
 * File: backend/src/services/whatsappCloud.service.js
 * Role: Sends WhatsApp messages via Meta Graph Cloud API.
 *
 * Rules:
 * - If isEnabled() is false, NEVER call fetch.
 * - 10-second timeout with AbortController.
 * - Never log access tokens or full phone numbers (use maskPhone).
 * - Never log full response bodies; only Meta error code and message.
 * - Return structured result { ok, messageId, errorCode, errorMessage, retryable } — never throw.
 */
'use strict';

const whatsappConfig = require('../config/whatsapp');
const { maskPhone } = require('../utils/phone');

const RETRYABLE_META_CODES = new Set([
  130429, // Rate limit hit
  131016, // Service unavailable
  80007,  // Rate limit issues
  130428, // Cloud API throughput limit
  133016, // Server temporary error
  130472, // Temporary system error
]);

const NON_RETRYABLE_META_CODES = new Set([
  131026, // Message undeliverable / invalid recipient
  131047, // Re-engagement window expired
  132001, // Template not found
  132012, // Template paused
  132015, // Template param count mismatch
  190,    // Invalid / expired token
  100,    // Invalid parameter
]);

/**
 * Execute a POST request to Meta Cloud API
 *
 * @param {string} to - Recipient phone number in international format ('91XXXXXXXXXX')
 * @param {object} payload - Body payload for Graph API
 * @returns {Promise<{ ok: boolean, messageId: string|null, errorCode: string|null, errorMessage: string|null, retryable: boolean }>}
 */
async function _sendRequest(to, payload) {
  if (!whatsappConfig.isEnabled()) {
    return {
      ok: false,
      messageId: null,
      errorCode: 'DISABLED',
      errorMessage: 'WhatsApp outbound messaging is disabled.',
      retryable: false,
    };
  }

  const version = whatsappConfig.GRAPH_VERSION;
  const phoneNumberId = whatsappConfig.PHONE_NUMBER_ID;
  const accessToken = whatsappConfig.ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error(`[WhatsApp Cloud] Cannot send to ${maskPhone(to)}: Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN`);
    return {
      ok: false,
      messageId: null,
      errorCode: 'CONFIG_MISSING',
      errorMessage: 'Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN.',
      retryable: false,
    };
  }

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (response.ok) {
      const messageId = data?.messages?.[0]?.id || null;
      return {
        ok: true,
        messageId,
        errorCode: null,
        errorMessage: null,
        retryable: false,
      };
    }

    // Handle HTTP Error
    const metaError = data?.error;
    const metaCode = metaError?.code;
    const errorCode = metaCode ? String(metaCode) : String(response.status);
    const rawErrorMessage = metaError?.message || response.statusText || 'Meta Graph API call failed';
    const errorMessage = String(rawErrorMessage).slice(0, 500);

    let retryable = false;
    if (response.status === 429 || response.status >= 500) {
      retryable = true;
    } else if (metaCode && RETRYABLE_META_CODES.has(Number(metaCode))) {
      retryable = true;
    } else if (metaCode && NON_RETRYABLE_META_CODES.has(Number(metaCode))) {
      retryable = false;
    }

    console.error(`[WhatsApp Cloud] Meta error ${errorCode} sending to ${maskPhone(to)}: ${errorMessage}`);

    return {
      ok: false,
      messageId: null,
      errorCode,
      errorMessage,
      retryable,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    const errorCode = isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR';
    const errorMessage = String(err.message || 'Network request failed').slice(0, 500);

    console.error(`[WhatsApp Cloud] Request error sending to ${maskPhone(to)}: ${errorMessage}`);

    return {
      ok: false,
      messageId: null,
      errorCode,
      errorMessage,
      retryable: true,
    };
  }
}

/**
 * Send an approved Meta WhatsApp template
 *
 * @param {object} params
 * @param {string} params.to - Recipient phone ('91XXXXXXXXXX')
 * @param {string} params.name - Approved template name
 * @param {string} [params.language='en'] - Template language code
 * @param {Array<string>} [params.bodyParams=[]] - Array of string values for {{1}}, {{2}}, etc.
 * @returns {Promise<{ ok: boolean, messageId: string|null, errorCode: string|null, errorMessage: string|null, retryable: boolean }>}
 */
async function sendTemplate({ to, name, language = 'en', bodyParams = [] }) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name,
      language: {
        code: language || 'en',
      },
      components: [
        {
          type: 'body',
          parameters: (bodyParams || []).map((text) => ({
            type: 'text',
            text: String(text),
          })),
        },
      ],
    },
  };

  return _sendRequest(to, payload);
}

/**
 * Send a freeform text WhatsApp message (within 24-hr customer service window)
 *
 * @param {object} params
 * @param {string} params.to - Recipient phone ('91XXXXXXXXXX')
 * @param {string} params.text - Text message body
 * @returns {Promise<{ ok: boolean, messageId: string|null, errorCode: string|null, errorMessage: string|null, retryable: boolean }>}
 */
async function sendText({ to, text }) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: String(text),
    },
  };

  return _sendRequest(to, payload);
}

/**
 * Backward compatibility wrapper for sendTextMessage
 *
 * @param {string} to - Recipient phone
 * @param {string} text - Message text body
 * @returns {Promise<void>}
 */
async function sendTextMessage(to, text) {
  try {
    await sendText({ to, text });
  } catch (err) {
    console.error(`[WhatsApp Cloud] sendTextMessage failed for ${maskPhone(to)}:`, err.message);
  }
}

module.exports = {
  sendTemplate,
  sendText,
  sendTextMessage,
};
