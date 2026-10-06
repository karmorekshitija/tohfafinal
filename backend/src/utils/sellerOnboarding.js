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
 * Validates Indian PAN format if provided (10 characters: 5 letters, 4 digits, 1 letter)
 */
function isValidPan(pan) {
  if (!pan) return true; // Optional unless explicitly required
  const clean = String(pan).trim().toUpperCase();
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(clean);
}

/**
 * Validates Indian phone number (10 digits, optionally prefixed with +91 or 91 or 0)
 */
function isValidIndianPhone(phone) {
  if (!phone) return false;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return /^[6-9]\d{9}$/.test(digits);
  if (digits.length === 11 && digits.startsWith('0')) return /^[6-9]\d{9}$/.test(digits.slice(1));
  if (digits.length === 12 && digits.startsWith('91')) return /^[6-9]\d{9}$/.test(digits.slice(2));
  return digits.length >= 10 && digits.length <= 15;
}

function hasNonEmptyKeys(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return Object.values(obj).some(v => v !== null && v !== undefined && String(v).trim() !== '');
}

/**
 * Normalizes Billing & Business Address into a canonical JSONB structure
 * while retaining legacy keys (`line1`, `address_line1`, `gstin`, `gst_number`, `pan`, `pan_number`)
 * for backwards compatibility across Seller, Buyer, and Admin services.
 */
function normalizeBillingAddress(raw = {}, fallbacks = {}) {
  const src = parseJson(raw);
  const fb = parseJson(fallbacks);

  const legalBusinessName = String(
    src.legal_business_name ||
    src.business_name ||
    src.company_name ||
    fb.legal_business_name ||
    fb.business_name ||
    fb.store_name ||
    ''
  ).trim();

  const gstin = String(
    src.gstin ||
    src.gst_number ||
    fb.gstin ||
    fb.gst_number ||
    ''
  ).trim().toUpperCase();

  const pan = String(
    src.pan ||
    src.pan_number ||
    fb.pan ||
    fb.pan_number ||
    ''
  ).trim().toUpperCase();

  const line1 = String(
    src.address_line1 ||
    src.addressLine1 ||
    src.line1 ||
    src.street ||
    src.address ||
    fb.address_line1 ||
    fb.line1 ||
    ''
  ).trim();

  const line2 = String(
    src.address_line2 ||
    src.addressLine2 ||
    src.line2 ||
    fb.address_line2 ||
    fb.line2 ||
    ''
  ).trim();

  const landmark = String(
    src.landmark ||
    fb.landmark ||
    ''
  ).trim();

  const city = String(src.city || fb.city || '').trim();
  const state = String(src.state || fb.state || '').trim();
  const pincode = String(
    src.pincode ||
    src.postal_code ||
    src.postalCode ||
    src.zip ||
    fb.pincode ||
    ''
  ).trim();

  const country = String(src.country || fb.country || 'India').trim() || 'India';

  return {
    legal_business_name: legalBusinessName,
    business_name: legalBusinessName,
    gstin: gstin || null,
    gst_number: gstin || null,
    pan: pan || null,
    pan_number: pan || null,
    address_line1: line1,
    line1: line1,
    address_line2: line2,
    line2: line2,
    landmark,
    city,
    state,
    pincode,
    country,
    updated_at: src.updated_at || new Date().toISOString()
  };
}

/**
 * Normalizes Operational Pickup Address (for iThink Logistics) into a canonical JSONB structure.
 * Guarantees both `line1` and `address_line1`, `phone` and `contact_phone`, `facility_name` and `warehouse_name`
 * are populated so `logistics.service.js` and Seller Studio UI work seamlessly.
 */
function normalizePickupAddress(raw = {}, fallbacks = {}) {
  const src = parseJson(raw);
  const fb = parseJson(fallbacks);

  const sameAsBilling = Boolean(
    src.same_as_billing === true ||
    src.sameAsBilling === true ||
    src.same_as_billing === 'true'
  );

  const contactName = String(
    src.contact_name ||
    src.contactName ||
    src.name ||
    fb.contact_name ||
    fb.name ||
    fb.full_name ||
    fb.store_name ||
    ''
  ).trim();

  const rawPhoneInput = String(
    src.phone ||
    src.contact_phone ||
    src.contactPhone ||
    fb.phone ||
    fb.contact_phone ||
    fb.whatsapp_number ||
    ''
  ).trim();
  const phoneDigits = rawPhoneInput.replace(/\D/g, '');
  const rawPhone = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : rawPhoneInput;

  const facilityName = String(
    src.facility_name ||
    src.warehouse_name ||
    src.studio_name ||
    fb.facility_name ||
    fb.warehouse_name ||
    fb.store_name ||
    ''
  ).trim();

  const line1 = String(
    src.address_line1 ||
    src.addressLine1 ||
    src.line1 ||
    src.street ||
    src.address ||
    fb.address_line1 ||
    fb.line1 ||
    ''
  ).trim();

  const line2 = String(
    src.address_line2 ||
    src.addressLine2 ||
    src.line2 ||
    fb.address_line2 ||
    fb.line2 ||
    ''
  ).trim();

  const landmark = String(
    src.landmark ||
    fb.landmark ||
    ''
  ).trim();

  const city = String(src.city || fb.city || '').trim();
  const state = String(src.state || fb.state || '').trim();
  const pincode = String(
    src.pincode ||
    src.postal_code ||
    src.postalCode ||
    src.zip ||
    fb.pincode ||
    ''
  ).trim();

  const country = String(src.country || fb.country || 'India').trim() || 'India';

  return {
    same_as_billing: sameAsBilling,
    contact_name: contactName,
    phone: rawPhone,
    contact_phone: rawPhone,
    facility_name: facilityName,
    warehouse_name: facilityName,
    address_line1: line1,
    line1: line1,
    address_line2: line2,
    line2: line2,
    landmark,
    city,
    state,
    pincode,
    country,
    serviceable: src.serviceable !== undefined ? Boolean(src.serviceable) : true,
    warehouse_id: src.warehouse_id || fb.warehouse_id || null,
    updated_at: src.updated_at || new Date().toISOString()
  };
}

/**
 * Normalizes Bank / Payout Details into a canonical JSONB structure
 * with both top-level keys and `.bank` nested object for full compatibility.
 */
function normalizeBankDetails(raw = {}, fallbacks = {}) {
  const src = parseJson(raw);
  const srcBank = (src.bank && typeof src.bank === 'object') ? src.bank : src;
  const fb = parseJson(fallbacks);
  const fbBank = (fb.bank && typeof fb.bank === 'object') ? fb.bank : fb;

  const accountHolderName = String(
    srcBank.account_holder_name ||
    srcBank.accountHolderName ||
    srcBank.account_holder ||
    srcBank.holder_name ||
    src.account_holder_name ||
    fbBank.account_holder_name ||
    fbBank.account_holder ||
    fb.account_holder_name ||
    ''
  ).trim();

  const bankName = String(
    srcBank.bank_name ||
    srcBank.bankName ||
    src.bank_name ||
    fbBank.bank_name ||
    fb.bank_name ||
    ''
  ).trim();

  const accountNumber = String(
    srcBank.account_number ||
    srcBank.accountNumber ||
    src.account_number ||
    fbBank.account_number ||
    fb.account_number ||
    ''
  ).trim();

  const ifscCode = String(
    srcBank.ifsc_code ||
    srcBank.ifscCode ||
    srcBank.ifsc ||
    srcBank.routing_number ||
    srcBank.iban ||
    src.ifsc_code ||
    fbBank.ifsc_code ||
    fbBank.ifsc ||
    fb.ifsc_code ||
    ''
  ).trim().toUpperCase();

  const upiId = String(
    src.upi_id ||
    srcBank.upi_id ||
    src.upi ||
    fb.upi_id ||
    fbBank.upi_id ||
    ''
  ).trim();

  const updatedAt = src.updated_at || new Date().toISOString();

  return {
    account_holder_name: accountHolderName,
    bank_name: bankName,
    account_number: accountNumber,
    ifsc_code: ifscCode,
    upi_id: upiId || null,
    razorpay_contact_id: src.razorpay_contact_id || fb.razorpay_contact_id || null,
    razorpay_fund_account_id: src.razorpay_fund_account_id || fb.razorpay_fund_account_id || null,
    updated_at: updatedAt,
    bank: {
      account_holder_name: accountHolderName,
      bank_name: bankName,
      account_number: accountNumber,
      ifsc_code: ifscCode
    }
  };
}

/**
 * Evaluates whether a seller has valid billing address, pickup address, banking details, and tour status.
 * Accepts raw seller/seller_profiles database row or merged object.
 */
function evaluateSellerOnboarding(seller, fallbackAddresses = []) {
  if (!seller) {
    return {
      hasBillingAddress: false,
      hasPickupAddress: false,
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
  if (billingAddr && (billingAddr.address_line1 || billingAddr.line1 || billingAddr.street || billingAddr.address)) {
    addressCandidate = billingAddr;
  } else if (pickupAddr && (pickupAddr.address_line1 || pickupAddr.line1 || pickupAddr.street || pickupAddr.address)) {
    addressCandidate = pickupAddr;
  } else if (Array.isArray(fallbackAddresses) && fallbackAddresses.length > 0) {
    addressCandidate = fallbackAddresses[0];
  }

  const addrLine = String(
    addressCandidate.address_line1 ||
    addressCandidate.addressLine1 ||
    addressCandidate.line1 ||
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

  // Operational Pickup Address Evaluation
  const pickupCandidate = (pickupAddr && (pickupAddr.address_line1 || pickupAddr.line1 || pickupAddr.street || pickupAddr.address))
    ? pickupAddr
    : addressCandidate;
  const pickupLine = String(
    pickupCandidate.address_line1 ||
    pickupCandidate.addressLine1 ||
    pickupCandidate.line1 ||
    pickupCandidate.street ||
    pickupCandidate.address ||
    ''
  ).trim();
  const pickupCity = String(pickupCandidate.city || '').trim();
  const pickupState = String(pickupCandidate.state || '').trim();
  const pickupPin = String(
    pickupCandidate.pincode ||
    pickupCandidate.postal_code ||
    pickupCandidate.postalCode ||
    pickupCandidate.zip ||
    ''
  ).trim();

  const hasPickupAddress = Boolean(
    pickupLine.length >= 3 &&
    pickupCity.length >= 2 &&
    pickupState.length >= 2 &&
    isValidPincode(pickupPin)
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
    hasPickupAddress,
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
      pickup: {
        address_line1: pickupLine,
        city: pickupCity,
        state: pickupState,
        pincode: pickupPin
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
    const spBilling = parseJson(row.billing_address);
    const sBilling = parseJson(row.s_billing_address);
    const spPickup = parseJson(row.pickup_address);
    const sPickup = parseJson(row.s_pickup_address);
    const spBank = parseJson(row.bank_details);
    const sBank = parseJson(row.s_bank_details);

    const merged = {
      ...row,
      billing_address: hasNonEmptyKeys(spBilling) ? spBilling : sBilling,
      pickup_address: hasNonEmptyKeys(spPickup) ? spPickup : sPickup,
      bank_details: hasNonEmptyKeys(spBank) ? spBank : sBank,
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
  isValidGstin,
  isValidPan,
  isValidIndianPhone,
  normalizeBillingAddress,
  normalizePickupAddress,
  normalizeBankDetails
};

