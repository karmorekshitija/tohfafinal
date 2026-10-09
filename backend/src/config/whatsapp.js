/**
 * Tohfa v2 — WhatsApp Configuration & Template Registry
 * File: backend/src/config/whatsapp.js
 *
 * Master Switch & Rules:
 * - WHATSAPP_ENABLED: Must equal string 'true' for anything to be sent outbound.
 * - WHATSAPP_REDIRECT_ALL_TO: Defaults in code to '919755329298'. When non-empty,
 *   all outbound messages are delivered to this number for testing. Real recipient is
 *   preserved in whatsapp_outbox.intended_to. Set to explicitly empty ('') to disable redirect.
 * - Provider: Meta WhatsApp Cloud API (Graph API).
 *
 * Template Definitions (Approved Body Texts for Meta Business Manager):
 *
 * 1. new_order (Category: UTILITY, Lang: en)
 *    Body:
 *    New order on Tohfa! Order #{{1}} from {{2}} for Rs {{3}}. View and update it here: https://thetohfa.in/seller/orders.html
 *
 * 2. quote (Category: UTILITY, Lang: en)
 *    Body:
 *    {{1}} sent you a quote of Rs {{2}} for your custom request on {{3}}. Review it here: https://thetohfa.in/buyer/orders.html
 *
 * 3. proof (Category: UTILITY, Lang: en)
 *    Body:
 *    {{1}} has uploaded a design proof for your custom order {{2}}. Preview it here: {{3}}. Please review and approve it before dispatch: https://thetohfa.in/buyer/orders.html
 *
 * 4. occasion (Category: MARKETING, Lang: en)
 *    Body:
 *    Your saved occasion {{1}} for {{2}} is {{3}} days away. Browse handmade gifts on Tohfa: https://thetohfa.in
 */
'use strict';

const { normalizeIndianMobile, maskPhone } = require('../utils/phone');

/**
 * Returns true if WhatsApp outbound messaging is enabled
 * @returns {boolean}
 */
function isEnabled() {
  return process.env.WHATSAPP_ENABLED === 'true';
}

/**
 * Resolves owner email from OWNER_NOTIFY_EMAIL or ADMIN_EMAIL fallback.
 * @returns {string}
 */
function getOwnerEmail() {
  return (process.env.OWNER_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '').trim();
}

/**
 * Returns the current WhatsApp operating mode.
 * 1. WHATSAPP_ENABLED === 'true'                                    → 'api'
 * 2. WHATSAPP_MANUAL_MODE !== 'false' AND OWNER_NOTIFY_EMAIL set   → 'manual'
 * 3. else                                                          → 'suppressed'
 *
 * @returns {'api'|'manual'|'suppressed'}
 */
function getMode() {
  if (process.env.WHATSAPP_ENABLED === 'true') return 'api';
  const manualOff = process.env.WHATSAPP_MANUAL_MODE === 'false';
  const hasEmail = !!getOwnerEmail();
  if (!manualOff && hasEmail) return 'manual';
  return 'suppressed';
}

/**
 * Returns the test redirect destination phone number if redirect is active, or null if direct sending.
 * Defaults in code to '919755329298'. Setting WHATSAPP_REDIRECT_ALL_TO='' turns it off.
 * @returns {string|null}
 */
function redirectTo() {
  if (process.env.WHATSAPP_REDIRECT_ALL_TO !== undefined) {
    const val = process.env.WHATSAPP_REDIRECT_ALL_TO.trim();
    if (!val) return null;
    return normalizeIndianMobile(val) || val;
  }
  return '919755329298';
}

/**
 * Helper to sanitize Meta template parameters.
 * Meta template variable rules:
 * - No newlines, no tabs
 * - No more than 4 consecutive spaces
 * - Never empty
 * - Length limited to ~200 chars
 *
 * @param {string|number} value
 * @param {string} fallback
 * @returns {string}
 */
function sanitizeParam(value, fallback = '') {
  if (value === null || value === undefined) {
    return String(fallback).trim();
  }
  let str = String(value)
    .replace(/[\r\n\t]/g, ' ')
    .replace(/ {4,}/g, '   ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!str) {
    str = String(fallback).trim();
  }

  if (str.length > 200) {
    str = str.slice(0, 197) + '...';
  }
  return str;
}

const templates = {
  new_order: {
    get name() {
      return process.env.WHATSAPP_TEMPLATE_NEW_ORDER || 'tohfa_new_order_v1';
    },
    category: 'UTILITY',
    defaultLanguage: 'en',
    paramCount: 3,
    // Params: [1: orderId, 2: buyerName, 3: amount]
    buildParams: ({ orderId, buyerName, amount }) => [
      sanitizeParam(orderId, 'your order'),
      sanitizeParam(buyerName, 'a customer'),
      sanitizeParam(amount, '0.00'),
    ],
  },
  quote: {
    get name() {
      return process.env.WHATSAPP_TEMPLATE_QUOTE || 'tohfa_quote_received_v1';
    },
    category: 'UTILITY',
    defaultLanguage: 'en',
    paramCount: 3,
    // Params: [1: sellerStoreName, 2: quoteAmount, 3: productName]
    buildParams: ({ sellerStoreName, quoteAmount, productName }) => [
      sanitizeParam(sellerStoreName, 'An artisan'),
      sanitizeParam(quoteAmount, '0.00'),
      sanitizeParam(productName, 'your custom request'),
    ],
  },
  proof: {
    get name() {
      return process.env.WHATSAPP_TEMPLATE_PROOF || 'tohfa_proof_ready_v1';
    },
    category: 'UTILITY',
    defaultLanguage: 'en',
    paramCount: 3,
    // Params: [1: sellerStoreName, 2: productName, 3: proofImageUrl]
    buildParams: ({ sellerStoreName, productName, proofImageUrl }) => [
      sanitizeParam(sellerStoreName, 'The artisan'),
      sanitizeParam(productName, 'your custom order'),
      sanitizeParam(proofImageUrl, 'https://thetohfa.in/buyer/orders.html'),
    ],
  },
  occasion: {
    get name() {
      return process.env.WHATSAPP_TEMPLATE_OCCASION || 'tohfa_occasion_reminder_v1';
    },
    category: 'MARKETING',
    defaultLanguage: 'en',
    paramCount: 3,
    // Params: [1: occasionLabel, 2: personName, 3: daysUntil]
    buildParams: ({ occasionLabel, personName, daysUntil }) => [
      sanitizeParam(occasionLabel, 'Special Occasion'),
      sanitizeParam(personName, 'your loved one'),
      sanitizeParam(daysUntil, '7'),
    ],
  },
};

// Check startup configuration and log one warning if active
let startupWarned = false;
function checkStartupWarning() {
  if (startupWarned) return;
  startupWarned = true;
  if (isEnabled()) {
    const target = redirectTo();
    if (target) {
      console.warn(`[WhatsApp] ENABLED with redirect to ${maskPhone(target)} — real recipients will NOT receive messages`);
    } else {
      console.log('[WhatsApp] Outbound messaging is ENABLED (live direct delivery).');
    }
  } else {
    const mode = getMode();
    if (mode === 'manual') {
      const email = process.env.OWNER_NOTIFY_EMAIL || '';
      console.log(`[WhatsApp] MANUAL MODE — tasks will be emailed to ${maskPhone(email)} for hand-sending.`);
    } else {
      console.log('[WhatsApp] SUPPRESSED — outbox rows will be recorded but no messages sent or emailed.');
    }
  }
}

// Call on startup
checkStartupWarning();

module.exports = {
  isEnabled,
  getMode,
  getOwnerEmail,
  redirectTo,
  sanitizeParam,
  templates,
  maskPhone,
  checkStartupWarning,
  get GRAPH_VERSION() {
    return process.env.WHATSAPP_GRAPH_VERSION || 'v26.0';
  },
  get PHONE_NUMBER_ID() {
    return process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  },
  get ACCESS_TOKEN() {
    return process.env.WHATSAPP_ACCESS_TOKEN || '';
  },
  get APP_SECRET() {
    return process.env.WHATSAPP_APP_SECRET || '';
  },
  get VERIFY_TOKEN() {
    return process.env.WHATSAPP_VERIFY_TOKEN || '';
  },
  get AUTOREPLY_ENABLED() {
    return process.env.WHATSAPP_AUTOREPLY_ENABLED === 'true';
  },
  get TEMPLATE_LANG() {
    return process.env.WHATSAPP_TEMPLATE_LANG || 'en';
  },
  get MAX_ATTEMPTS() {
    return parseInt(process.env.WHATSAPP_MAX_ATTEMPTS, 10) || 4;
  },
  get EMAIL_FALLBACK_ENABLED() {
    return process.env.SELLER_ORDER_EMAIL_FALLBACK_ENABLED === 'true';
  },
  get CRON_SECRET() {
    return process.env.CRON_SECRET || '';
  },
  get MANUAL_MODE() {
    return process.env.WHATSAPP_MANUAL_MODE !== 'false';
  },
  get OWNER_NOTIFY_EMAIL() {
    return process.env.OWNER_NOTIFY_EMAIL || '';
  },
  get ESCALATION_MINUTES() {
    return parseInt(process.env.MANUAL_ESCALATION_MINUTES, 10) || 60;
  },
  get MANUAL_REMINDERS_REQUIRE_OPT_IN() {
    return process.env.MANUAL_REMINDERS_REQUIRE_OPT_IN !== 'false';
  },
};
