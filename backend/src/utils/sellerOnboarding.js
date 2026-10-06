/**
 * Tohfa v2 — Seller Onboarding & Prerequisite Evaluation Utility
 * File: backend/src/utils/sellerOnboarding.js
 * Role: Single source of truth for evaluating seller onboarding flags:
 *       - hasBillingAddress
 *       - hasBankingDetails
 *       - onboardingTourDismissed
 */
'use strict';

const { query } = require('../config/db');

function parseJson(val) {
  if (!val) return {};
  if (typeof val === 'object' && val !== null) return val;
  try {
    return JSON.parse(val);
  } catch (_) {
    return {};
  }
}

/**
 * Validates Indian IFSC code format: 4 alphabetic chars, 0, 6 alphanumeric chars
 * Also accepts standard 8-11 character routing/IBAN codes.
 */
function isValidIfscOrRouting(code) {
  if (!code || typeof code !== 'string') return false;
  const clean = code.trim().toUpperCase();
  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  const generalRoutingRegex = /^[A-Z0-9]{8,18}$/;
  return ifscRegex.test(clean) || generalRoutingRegex.test(clean);
}

/**
 * Validates Indian Pincode (6 digits) or 5-10 character international postal code
 */
function isValidPincode(pincode) {
  if (!pincode) return false;
  const clean = String(pincode).trim();
  const digits = clean.replace(/\D/g, '');
  if (digits.length < 3) return false;
  const indianPincodeRegex = /^\d{6}$/;
  const generalPostalRegex = /^[A-Za-z0-9\- ]{3,10}$/;
  return indianPincodeRegex.test(clean) || generalPostalRegex.test(clean);
}

/**
 * Validates GSTIN if provided (15 characters)
 */
function isValidGstin(gstin) {
  if (!gstin) return true; // Optional/if applicable
  const clean = String(gstin).trim().toUpperCase();
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(clean);
}

/**
 * Evaluates whether a seller has valid billing address, banking details, and tour status.
 * Accepts raw seller/seller_profiles database row or merged object.
 */
function evaluateSellerOnboarding(seller, fallbackAddresses = []) {
  if (!seller) {
    return {
      hasBillingAddress: false,
      hasBankingDetails: false,
      onboardingTourDismissed: false,
      isComplete: false,
      missing: ['billing_address', 'banking_details'],
      details: {}
    };
  }

  // Tohfa Special / Admin-Managed Shops: platform manages banking and finances
  const isAdminManaged = Boolean(seller && (seller.is_admin_managed === true ||
      seller.is_admin_managed === 'true' ||
      seller.is_admin_managed === 1 ||
      seller.is_admin_managed === '1' ||
      seller.is_admin_managed === 't' ||
      seller.s_is_admin_managed === true ||
      seller.s_is_admin_managed === 'true' ||
      seller.s_is_admin_managed === 1 ||
      seller.s_is_admin_managed === '1' ||
      seller.s_is_admin_managed === 't' ||
      seller.seller_type === 'special' ||
      seller.isAdminManaged === true ||
      seller.actingAsSpecialShop === true
    )
  );

  // 1. Billing & Dispatch Address Validation
  const billingAddr = parseJson(seller.billing_address);
  const pickupAddr = parseJson(seller.pickup_address);
  
  // Also inspect fallback addresses from addresses table if provided
  let addressCandidate = {};
  if (billingAddr && (billingAddr.address_line1 || billingAddr.street || billingAddr.address)) {
    addressCandidate = billingAddr;
  } else if (pickupAddr && (pickupAddr.address_line1 || pickupAddr.street || pickupAddr.address)) {
    addressCandidate = pickupAddr;
  } else if (Array.isArray(fallbackAddresses) && fallbackAddresses.length > 0) {
    addressCandidate = fallbackAddresses[0];
  }

  const addrLine = String(
    addressCandidate.address_line1 ||
    addressCandidate.addressLine1 ||
    addressCandidate.street ||
    addressCandidate.address ||
    ''
  ).trim();

  const city = String(addressCandidate.city || '').trim();
  const state = String(addressCandidate.state || '').trim();
  const pincode = String(
    addressCandidate.pincode ||
    addressCandidate.postal_code ||
    addressCandidate.postalCode ||
    addressCandidate.zip ||
    ''
  ).trim();

  const taxDetails = parseJson(seller.tax_details);
  const rawGst = seller.gst_number || seller.gstin || taxDetails.gstin || addressCandidate.gstin || '';
  const isGstValid = !rawGst || isValidGstin(rawGst);

  const hasBillingAddress = isAdminManaged
    ? true
    : Boolean(
        addrLine.length >= 3 &&
        city.length >= 2 &&
        state.length >= 2 &&
        isValidPincode(pincode) &&
        isGstValid
      );

  // 2. Banking / Payout Details Validation
  const bd = parseJson(seller.bank_details);
  const bankObj = (bd.bank && typeof bd.bank === 'object') ? bd.bank : bd;

  const accountHolder = String(
    bankObj.account_holder_name ||
    bankObj.accountHolderName ||
    bankObj.account_holder ||
    bankObj.holder_name ||
    bd.account_holder_name ||
    bd.account_holder ||
    bd.holder_name ||
    ''
  ).trim();

  const accountNumber = String(
    bankObj.account_number ||
    bankObj.accountNumber ||
    bd.account_number ||
    ''
  ).trim();

  const ifscCode = String(
    bankObj.ifsc_code ||
    bankObj.ifscCode ||
    bankObj.ifsc ||
    bankObj.routing_number ||
    bankObj.iban ||
    bd.ifsc_code ||
    ''
  ).trim().toUpperCase();

  const hasBankingDetails = isAdminManaged
    ? true
    : Boolean(
        accountHolder.length >= 2 &&
        accountNumber.length >= 6 &&
        isValidIfscOrRouting(ifscCode)
      );

  // 3. Tour Dismissed Flag
  const onboardingTourDismissed = isAdminManaged
    ? true
    : Boolean(
        seller.onboarding_tour_dismissed === true ||
        seller.onboardingTourDismissed === true ||
        seller.onboarding_tour_dismissed === 'true' ||
        seller.onboarding_tour_dismissed === 1
      );

  const missing = [];
  if (!hasBillingAddress) missing.push('billing_address');
  if (!hasBankingDetails) missing.push('banking_details');

  return {
    hasBillingAddress,
    hasBankingDetails,
    onboardingTourDismissed,
    isComplete: hasBillingAddress && hasBankingDetails,
    missing,
    isAdminManaged,
    details: {
      address: {
        address_line1: addrLine,
        city,
        state,
        pincode,
        gstin: rawGst || null
      },
      bank: {
        account_holder: accountHolder ? `${accountHolder.slice(0, 3)}***` : (isAdminManaged ? 'Platform Managed' : ''),
        account_number_masked: accountNumber ? `••••${accountNumber.slice(-4)}` : (isAdminManaged ? '••••PLATFORM' : ''),
        ifsc_code: ifscCode || (isAdminManaged ? 'PLATFORM' : '')
      }
    }
  };
}

/**
 * Fetches the seller record for a user or seller ID and returns evaluated onboarding status.
 */
async function getSellerOnboardingStatus(userId) {
  if (!userId) {
    return evaluateSellerOnboarding(null);
  }

  try {
    const { rows } = await query(
      `SELECT sp.*, 
              s.pickup_address AS s_pickup_address, 
              s.billing_address AS s_billing_address,
              s.bank_details AS s_bank_details,
              s.onboarding_tour_dismissed AS s_onboarding_tour_dismissed,
              s.is_admin_managed AS s_is_admin_managed
       FROM seller_profiles sp
       LEFT JOIN sellers s ON s.user_id = sp.user_id
       WHERE sp.user_id = $1 OR s.id = $1 OR s.user_id = $1
       LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      // Check if user has a master sellers record without a profile
      const { rows: masterRows } = await query(
        `SELECT * FROM sellers WHERE user_id = $1 OR id = $1 LIMIT 1`,
        [userId]
      );
      if (!masterRows.length) {
        return evaluateSellerOnboarding(null);
      }
      return evaluateSellerOnboarding(masterRows[0]);
    }

    const row = rows[0];
    const merged = {
      ...row,
      billing_address: row.billing_address || row.s_billing_address,
      pickup_address: row.pickup_address || row.s_pickup_address,
      bank_details: row.bank_details || row.s_bank_details,
      onboarding_tour_dismissed: row.onboarding_tour_dismissed || row.s_onboarding_tour_dismissed,
      is_admin_managed: row.is_admin_managed || row.s_is_admin_managed
    };

    return evaluateSellerOnboarding(merged);
  } catch (err) {
    console.error('[SellerOnboarding] Error fetching onboarding status:', err.message);
    return evaluateSellerOnboarding(null);
  }
}

module.exports = {
  evaluateSellerOnboarding,
  getSellerOnboardingStatus,
  isValidIfscOrRouting,
  isValidPincode,
  isValidGstin
};
