/**
 * Tohfa v2 — iThink Logistics Client
 * File: backend/src/config/ithink.js
 * Role: Configured HTTP client for iThink Logistics REST API.
 *       Used by logistics.service.js to book, track, and check serviceability.
 *       Strictly guarded: Tohfa Special Shops (is_admin_managed = true) never touch this.
 */
'use strict';

const ITHINK_API_URL = process.env.ITHINK_API_URL || 'https://api.ithinklogistics.com/api/v3';
const ITHINK_ACCESS_TOKEN = process.env.ITHINK_ACCESS_TOKEN;
const ITHINK_SECRET_KEY = process.env.ITHINK_SECRET_KEY;
const ITHINK_API_KEY = process.env.ITHINK_API_KEY;
const ITHINK_TIMEOUT_MS = parseInt(process.env.ITHINK_REQUEST_TIMEOUT_MS, 10) || 15000;

/**
 * Checks whether the iThink Logistics integration is explicitly enabled.
 * Feature flag defaults to false to prevent runtime failures with placeholder keys.
 * @returns {boolean}
 */
function isIThinkEnabled() {
  return process.env.ITHINK_ENABLED === 'true';
}

/**
 * Make an authenticated request to the iThink Logistics API.
 * 
 * TODO(verify against iThink docs): Verify endpoint naming (e.g. .json extension)
 * and whether auth parameters belong in headers or nested {"data": { ... }} body.
 *
 * @param {string} endpoint - API path, e.g. '/order/add.json' or '/order/add'
 * @param {string} method   - HTTP method ('POST', 'GET')
 * @param {Object} body     - Request payload
 * @returns {Promise<Object>} API response JSON
 */
async function ithinkRequest(endpoint, method = 'POST', body = {}) {
  if (!isIThinkEnabled()) {
    const disabledErr = new Error('iThink Logistics integration is currently disabled (ITHINK_ENABLED != true).');
    disabledErr.status = 503;
    disabledErr.code = 'ITHINK_DISABLED';
    throw disabledErr;
  }

  // Construct request URL
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${ITHINK_API_URL.replace(/\/+$/, '')}${cleanEndpoint}`;

  // Build authenticated payload
  // TODO(verify against iThink docs): Supports both access_token/secret_key and legacy api_key
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (ITHINK_API_KEY) {
    headers['api_key'] = ITHINK_API_KEY;
  }

  let requestBody = body;
  if (method !== 'GET') {
    // If access_token & secret_key exist, include inside data wrapper per iThink standard v3
    if (ITHINK_ACCESS_TOKEN || ITHINK_SECRET_KEY) {
      requestBody = {
        data: {
          access_token: ITHINK_ACCESS_TOKEN || '',
          secret_key: ITHINK_SECRET_KEY || '',
          ...body,
        },
      };
    } else if (!body.data && ITHINK_API_KEY) {
      // Legacy flat body with api_key header
      requestBody = { ...body };
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ITHINK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method !== 'GET' ? JSON.stringify(requestBody) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data;
    const textResponse = await response.text();
    try {
      data = JSON.parse(textResponse);
    } catch (_) {
      data = { raw: textResponse };
    }

    if (!response.ok) {
      const errMsg = (data && (data.message || data.html_message || data.error)) || `iThink Logistics HTTP error ${response.status}`;
      const err = new Error(errMsg);
      err.status = response.status;
      err.data = data;
      throw err;
    }

    // Check application-level failure response (e.g. { status: 'error', message: '...' })
    if (data && (data.status === 'error' || data.status === 'failed' || data.status_code === 400 || data.status_code === 500)) {
      const appErr = new Error(data.message || data.html_message || 'iThink Logistics returned an error response');
      appErr.status = 400;
      appErr.data = data;
      throw appErr;
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`[iThink] API request timed out after ${ITHINK_TIMEOUT_MS}ms (${endpoint})`);
      timeoutErr.status = 504;
      timeoutErr.code = 'ETIMEDOUT';
      throw timeoutErr;
    }
    throw err;
  }
}

module.exports = {
  ithinkRequest,
  isIThinkEnabled,
};
