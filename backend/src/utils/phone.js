'use strict';

/**
 * Normalizes an Indian mobile phone number into Meta's required format: '91XXXXXXXXXX'
 *
 * Rules:
 * - Strip all non-digits.
 * - Strip leading 0s.
 * - Accept 10 digits starting with 6–9 -> prefix with '91'.
 * - Accept 12 digits starting with '91' followed by 6–9.
 * - (An 11-digit number starting with '0' + 10 digits becomes 10 digits after stripping leading zeros).
 * - All other lengths or starting digits return null.
 *
 * @param {string|number} input
 * @returns {string|null} e.g. '919876543210' or null
 */
function normalizeIndianMobile(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Strip all leading zeros (handles e.g. 09876543210 -> 9876543210 or 0091... -> 91...)
  const trimmed = digits.replace(/^0+/, '');

  // Case 1: 10 digits starting with 6-9
  if (/^[6-9]\d{9}$/.test(trimmed)) {
    return `91${trimmed}`;
  }

  // Case 2: 12 digits starting with 91 followed by 6-9
  if (/^91[6-9]\d{9}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Extracts the 10-digit mobile number for opt-out lookups
 * @param {string|number} input
 * @returns {string|null} 10-digit string or null
 */
function getPhone10(input) {
  const normalized = normalizeIndianMobile(input);
  if (normalized) {
    return normalized.slice(-10);
  }
  if (!input) return null;
  const digits = String(input).replace(/\D/g, '');
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    if (/^[6-9]\d{9}$/.test(last10)) {
      return last10;
    }
  }
  return null;
}

/**
 * Masks a phone number so only the last 4 digits are visible
 * e.g. '919755329298' -> '***9298'
 * @param {string} phone
 * @returns {string}
 */
function maskPhone(phone) {
  if (!phone) return '****';
  const str = String(phone).trim();
  if (str.length <= 4) return '****';
  return `***${str.slice(-4)}`;
}

module.exports = {
  normalizeIndianMobile,
  getPhone10,
  maskPhone,
};
