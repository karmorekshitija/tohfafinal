/**
 * Tohfa v2 — Razorpay Config
 * File: backend/src/config/razorpay.js
 * Role: Manages Primary and Secondary (Failover) Razorpay instances with safe fallbacks.
 */
'use strict';
const Razorpay = require('razorpay');

// Primary Account Configuration
const primaryKeyId = process.env.RAZORPAY_PRIMARY_KEY_ID || process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
const primaryKeySecret = process.env.RAZORPAY_PRIMARY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret';
const primaryWebhookSecret = process.env.RAZORPAY_PRIMARY_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET || '';

// Secondary Account Configuration (Failover / Backup)
const secondaryKeyId = process.env.RAZORPAY_SECONDARY_KEY_ID || '';
const secondaryKeySecret = process.env.RAZORPAY_SECONDARY_KEY_SECRET || '';
const secondaryWebhookSecret = process.env.RAZORPAY_SECONDARY_WEBHOOK_SECRET || '';

// Primary Client Instance
const primaryClient = new Razorpay({
  key_id: primaryKeyId,
  key_secret: primaryKeySecret,
});

// Secondary Client Instance (Lazily or Safely Initialized)
let secondaryClient = null;
if (secondaryKeyId && secondaryKeySecret && secondaryKeyId !== 'rzp_test_placeholder') {
  secondaryClient = new Razorpay({
    key_id: secondaryKeyId,
    key_secret: secondaryKeySecret,
  });
}

/**
 * Check if the secondary Razorpay account is configured
 * @returns {boolean}
 */
function isSecondaryConfigured() {
  return Boolean(
    secondaryKeyId &&
    secondaryKeySecret &&
    secondaryKeyId !== 'rzp_test_placeholder' &&
    secondaryKeySecret !== 'placeholder_secret'
  );
}

/**
 * Get the Razorpay client instance for a specific account ('primary' or 'secondary')
 * @param {string} account - 'primary' | 'secondary'
 * @returns {Razorpay}
 */
function getClient(account = 'primary') {
  if (account === 'secondary') {
    if (secondaryClient) return secondaryClient;
    // Fallback if secondary instance is not initialized
    if (secondaryKeyId && secondaryKeySecret) {
      secondaryClient = new Razorpay({ key_id: secondaryKeyId, key_secret: secondaryKeySecret });
      return secondaryClient;
    }
  }
  return primaryClient;
}

/**
 * Get credentials metadata for a specific account
 * @param {string} account - 'primary' | 'secondary'
 * @returns {{ keyId: string, keySecret: string, webhookSecret: string }}
 */
function getAccountCredentials(account = 'primary') {
  if (account === 'secondary') {
    return {
      keyId: secondaryKeyId || primaryKeyId,
      keySecret: secondaryKeySecret || primaryKeySecret,
      webhookSecret: secondaryWebhookSecret || primaryWebhookSecret,
    };
  }
  return {
    keyId: primaryKeyId,
    keySecret: primaryKeySecret,
    webhookSecret: primaryWebhookSecret,
  };
}

// Preserve backward compatibility while exposing multi-account APIs
primaryClient.getClient = getClient;
primaryClient.getAccountCredentials = getAccountCredentials;
primaryClient.isSecondaryConfigured = isSecondaryConfigured;
primaryClient.primaryClient = primaryClient;
primaryClient.getSecondaryClient = () => secondaryClient;

module.exports = primaryClient;
