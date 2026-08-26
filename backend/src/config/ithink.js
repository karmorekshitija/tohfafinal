/**
 * Tohfa v2 — iThink Logistics Client
 * File: backend/src/config/ithink.js
 * Role: Configured axios instance for iThink Logistics REST API.
 *       Used by logistics.service.js to create and track shipments.
 *       NOT used for special/top-class sellers (skipped in service layer).
 */
'use strict';

// Using native fetch (Node 18+). Falls back to axios if needed.
const ITHINK_API_URL = process.env.ITHINK_API_URL || 'https://api.ithinklogistics.com/api/v3';
const ITHINK_API_KEY  = process.env.ITHINK_API_KEY;

/**
 * Make an authenticated request to the iThink Logistics API
 * @param {string} endpoint - API path e.g. '/order/add'
 * @param {string} method   - HTTP method
 * @param {Object} body     - Request body
 */
async function ithinkRequest(endpoint, method = 'POST', body = {}) {
  const response = await fetch(`${ITHINK_API_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'api_key': ITHINK_API_KEY,    // iThink uses api_key header
    },
    body: method !== 'GET' ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(data.message || 'iThink Logistics API error');
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

module.exports = { ithinkRequest };
