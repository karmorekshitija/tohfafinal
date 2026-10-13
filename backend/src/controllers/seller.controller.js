/**
 * Tohfa v2 — Seller Controller
 * File: src/controllers/seller.controller.js
 * Role: HTTP handlers for seller profile, dashboard metrics, analytics,
 *       order lifecycle management, customization proofs, payouts with escrow holding,
 *       store configuration, and logistics fulfillment.
 *       is_tohfa_original is NEVER returned in any response.
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const { query, getClient } = require('../config/db');
const bcrypt = require('bcrypt');
const { createNotification } = require('./notification.controller');
const logisticsService = require('../services/logistics.service');
const paymentService = require('../services/payment.service');
const ownerNotifyService = require('../services/ownerNotify.service');
const { PLANS, getPlan, calculateEffectivePrice } = require('../config/plans');
const {
  evaluateSellerOnboarding,
  getSellerOnboardingStatus,
  isValidIfscOrRouting,
  isValidPincode,
  isValidGstin,
  isValidPan,
  isValidIndianPhone,
  normalizeBillingAddress,
  normalizePickupAddress,
  normalizeBankDetails,
} = require('../utils/sellerOnboarding');

// Strip internal fields (never exposed in public or seller responses)
function sanitizeSellerProfile(sp) {
  if (!sp) return null;
  const { is_tohfa_original, is_admin_managed, ...rest } = sp;
  return rest;
}

// Ensure custom proof and customization columns exist on order_items
let orderItemColsChecked = false;
async function ensureOrderItemColumns() {
  if (orderItemColsChecked) return;
  try {
    await query(`
      ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS proof_image_url TEXT,
      ADD COLUMN IF NOT EXISTS customization_status TEXT,
      ADD COLUMN IF NOT EXISTS customization_data JSONB,
      ADD COLUMN IF NOT EXISTS unit_price NUMERIC;
    `);
    orderItemColsChecked = true;
  } catch (err) {
    // Ignore schema update error if permission or already exists
    orderItemColsChecked = true;
  }
}

// Ensure tax_details and address/location columns exist on seller_profiles
let taxColsChecked = false;
async function ensureTaxColumns() {
  if (taxColsChecked) return;
  try {
    await query(`
      ALTER TABLE seller_profiles
      ADD COLUMN IF NOT EXISTS tax_details JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS billing_address JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS pickup_address JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS location TEXT;
    `);
    taxColsChecked = true;
  } catch (err) {
    taxColsChecked = true;
  }
}

// Ensure seller_payouts table exists
let payoutTablesChecked = false;
async function ensurePayoutTables() {
  if (payoutTablesChecked) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS seller_payouts (
        id           SERIAL PRIMARY KEY,
        seller_id    INTEGER NOT NULL,
        amount       NUMERIC(10,2) NOT NULL,
        status       VARCHAR(50) DEFAULT 'pending',
        utr_number   VARCHAR(100),
        reference    TEXT,
        disbursed_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    payoutTablesChecked = true;
  } catch (err) {
    payoutTablesChecked = true;
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/profile  — own seller profile
// ---------------------------------------------------------------------------
async function getOwnSellerProfile(req, res, next) {
  try {
    const userId = req.user.id;

    let rows = [];
    try {
      const result = await query(
        `SELECT COALESCE(sp.id, s.id, u.id) AS id,
                u.id AS user_id,
                COALESCE(sp.store_name, sp.shop_name, s.store_name, u.name) AS store_name,
                COALESCE(sp.shop_name, sp.store_name, s.store_name, u.name) AS shop_name,
                u.name AS display_name,
                COALESCE(sp.handle, s.slug) AS handle,
                sp.location,
                COALESCE(sp.bio, sp.shop_bio, s.bio) AS bio,
                sp.shop_bio,
                sp.badges,
                sp.story_headline, sp.story_description, sp.working_on, sp.video_url, sp.about_image_url,
                COALESCE(sp.whatsapp_number, s.whatsapp_number, u.phone) AS whatsapp_number,
                COALESCE(sp.profile_photo, sp.avatar_url, sp.photo_url, s.photo_url, u.profile_photo_url) AS profile_photo,
                COALESCE(sp.banner_url, s.banner_url, u.cover_photo_url) AS cover_photo,
                COALESCE(sp.profile_photo, sp.avatar_url, sp.photo_url, s.photo_url, u.profile_photo_url) AS avatar_url,
                COALESCE(sp.profile_photo, sp.avatar_url, sp.photo_url, s.photo_url, u.profile_photo_url) AS logo_url,
                COALESCE(sp.banner_url, s.banner_url, u.cover_photo_url) AS banner_url,
                COALESCE(sp.seller_type, 'regular') AS seller_type,
                (COALESCE(sp.is_approved, FALSE) = TRUE OR COALESCE(s.is_approved, FALSE) = TRUE OR COALESCE(sp.verification_status, s.verification_status) = 'verified') AS is_approved,
                sp.rejection_reason,
                COALESCE(sp.vacation_mode_active, 0) AS vacation_mode,
                COALESCE(sp.vacation_mode_active, 0) AS vacation_mode_active,
                sp.vacation_message,
                COALESCE(sp.is_accepting_orders, TRUE) AS is_accepting_orders,
                COALESCE(sp.zai_mode_enabled, 0) AS zai_mode_enabled,
                COALESCE(sp.pickup_address, s.pickup_address) AS pickup_address,
                COALESCE(sp.billing_address, s.billing_address) AS billing_address,
                COALESCE(sp.bank_details, s.bank_details) AS bank_details,
                sp.tax_details,
                sp.pan_number, sp.gst_number,
                COALESCE(sp.onboarding_completed, FALSE) AS onboarding_completed,
                COALESCE(sp.onboarding_tour_dismissed, s.onboarding_tour_dismissed, FALSE) AS onboarding_tour_dismissed,
                s.pickup_address AS s_pickup_address,
                s.billing_address AS s_billing_address,
                s.bank_details AS s_bank_details,
                s.onboarding_tour_dismissed AS s_onboarding_tour_dismissed,
                (COALESCE(sp.is_admin_managed::text, s.is_admin_managed::text, 'false') IN ('true', 't', '1')) AS is_admin_managed,
                COALESCE(sp.subscription_plan, s.subscription_plan, 'basic') AS subscription_plan,
                COALESCE(sp.subscription_status, s.subscription_status, 'active') AS subscription_status,
                COALESCE(sp.subscription_price_paid, s.subscription_price_paid, 0.00) AS subscription_price_paid,
                COALESCE(sp.subscription_started_at, s.subscription_started_at) AS subscription_started_at,
                COALESCE(sp.subscription_renews_at, s.subscription_renews_at) AS subscription_renews_at,
                COALESCE(sp.subscription_discount_used, s.subscription_discount_used, FALSE) AS subscription_discount_used,
                COALESCE(sp.created_at, s.created_at, u.created_at) AS created_at,
                u.name, u.email, u.phone
         FROM users u
         LEFT JOIN seller_profiles sp ON sp.user_id = u.id
         LEFT JOIN sellers s ON s.user_id = u.id
         WHERE u.id = $1`,
        [userId]
      );
      rows = result.rows;
    } catch (selectErr) {
      await ensureTaxColumns();
      const fallbackResult = await query(
        `SELECT COALESCE(sp.id, s.id, u.id) AS id,
                u.id AS user_id,
                COALESCE(sp.store_name, s.store_name, u.name) AS store_name,
                COALESCE(sp.store_name, s.store_name, u.name) AS shop_name,
                u.name AS display_name,
                COALESCE(sp.slug, s.slug) AS handle,
                COALESCE(sp.bio, s.bio) AS bio,
                COALESCE(sp.whatsapp_number, u.phone) AS whatsapp_number,
                COALESCE(sp.profile_photo, sp.avatar_url, sp.photo_url, s.photo_url, u.profile_photo_url) AS profile_photo,
                COALESCE(sp.banner_url, s.banner_url, u.cover_photo_url) AS cover_photo,
                COALESCE(sp.profile_photo, sp.avatar_url, sp.photo_url, s.photo_url, u.profile_photo_url) AS avatar_url,
                COALESCE(sp.profile_photo, sp.avatar_url, sp.photo_url, s.photo_url, u.profile_photo_url) AS logo_url,
                COALESCE(sp.banner_url, s.banner_url, u.cover_photo_url) AS banner_url,
                COALESCE(sp.seller_type, 'regular') AS seller_type,
                (COALESCE(sp.is_approved, FALSE) = TRUE OR COALESCE(s.is_approved, FALSE) = TRUE) AS is_approved,
                sp.rejection_reason,
                COALESCE(sp.pickup_address, s.pickup_address) AS pickup_address,
                COALESCE(sp.billing_address, s.billing_address) AS billing_address,
                COALESCE(sp.bank_details, s.bank_details) AS bank_details,
                sp.pan_number, sp.gst_number,
                COALESCE(sp.onboarding_completed, FALSE) AS onboarding_completed,
                COALESCE(sp.onboarding_tour_dismissed, s.onboarding_tour_dismissed, FALSE) AS onboarding_tour_dismissed,
                s.pickup_address AS s_pickup_address,
                s.billing_address AS s_billing_address,
                s.bank_details AS s_bank_details,
                s.onboarding_tour_dismissed AS s_onboarding_tour_dismissed,
                (COALESCE(sp.is_admin_managed::text, s.is_admin_managed::text, 'false') IN ('true', 't', '1')) AS is_admin_managed,
                u.name, u.email, u.phone
         FROM users u
         LEFT JOIN seller_profiles sp ON sp.user_id = u.id
         LEFT JOIN sellers s ON s.user_id = u.id
         WHERE u.id = $1`,
        [userId]
      );
      rows = fallbackResult.rows;
    }

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Seller profile not found.' });
    }

    const rawRow = rows[0];
    const profile = sanitizeSellerProfile(rawRow);
    const photo = profile.profile_photo || '/img/default-avatar.png';
    const banner = profile.banner_url || '/img/default-seller-banner.png';
    profile.profile_photo = photo;
    profile.avatar_url = photo;
    profile.logo_url = profile.logo_url || photo;
    profile.banner_url = banner;
    profile.cover_photo = banner;

    const taxObj = (profile.tax_details && typeof profile.tax_details === 'object') ? profile.tax_details : {};
    const normalizedBilling = normalizeBillingAddress(
      profile.billing_address,
      {
        ...(rawRow.s_billing_address || {}),
        ...(profile.pickup_address || {}),
        ...(rawRow.s_pickup_address || {}),
        store_name: profile.store_name,
        gst_number: profile.gst_number || taxObj.gstin,
        pan_number: profile.pan_number || taxObj.pan_number,
        legal_business_name: taxObj.legal_business_name || profile.store_name,
      }
    );

    const normalizedPickup = normalizePickupAddress(
      profile.pickup_address,
      {
        ...(rawRow.s_pickup_address || {}),
        ...(normalizedBilling.address_line1 ? normalizedBilling : {}),
        contact_name: profile.display_name || profile.name || profile.store_name,
        phone: profile.whatsapp_number || profile.phone,
        facility_name: profile.store_name,
      }
    );

    const normalizedBank = normalizeBankDetails(profile.bank_details, rawRow.s_bank_details || {});

    profile.billing_address = normalizedBilling;
    profile.pickup_address = normalizedPickup;
    profile.bank_details = normalizedBank;
    profile.payout_details = normalizedBank;
    profile.legal_business_name = normalizedBilling.legal_business_name || taxObj.legal_business_name || profile.store_name || '';
    profile.gst_number = profile.gst_number || normalizedBilling.gstin || taxObj.gstin || null;
    profile.pan_number = profile.pan_number || normalizedBilling.pan || taxObj.pan_number || null;
    profile.tax_details = {
      ...taxObj,
      legal_business_name: profile.legal_business_name,
      is_gst_registered: Boolean(profile.gst_number || taxObj.is_gst_registered),
      gstin: profile.gst_number || '',
      pan_number: profile.pan_number || '',
    };

    // Compute onboarding flags
    const onboardingStatus = evaluateSellerOnboarding({
      ...profile,
      billing_address: normalizedBilling,
      pickup_address: normalizedPickup,
      bank_details: normalizedBank,
      onboarding_tour_dismissed: profile.onboarding_tour_dismissed || rawRow.s_onboarding_tour_dismissed,
      gst_number: profile.gst_number,
      pan_number: profile.pan_number,
    });

    profile.hasBillingAddress = onboardingStatus.hasBillingAddress;
    profile.hasPickupAddress = onboardingStatus.hasPickupAddress;
    profile.hasBankingDetails = onboardingStatus.hasBankingDetails;
    profile.onboardingTourDismissed = onboardingStatus.onboardingTourDismissed;
    profile.has_billing_address = onboardingStatus.hasBillingAddress;
    profile.has_pickup_address = onboardingStatus.hasPickupAddress;
    profile.has_banking_details = onboardingStatus.hasBankingDetails;
    profile.onboarding_tour_dismissed = onboardingStatus.onboardingTourDismissed;
    profile.onboardingStatus = onboardingStatus;

    // Auto-expire subscription if renewal date has passed
    if (profile.subscription_renews_at && new Date(profile.subscription_renews_at) < new Date() && profile.subscription_plan !== 'basic') {
      await query(
        "UPDATE sellers SET subscription_plan = 'basic', subscription_status = 'expired', updated_at = NOW() WHERE user_id = $1",
        [userId]
      ).catch(() => {});
      await query(
        "UPDATE seller_profiles SET subscription_plan = 'basic', subscription_status = 'expired', updated_at = NOW() WHERE user_id = $1",
        [userId]
      ).catch(() => {});
      await query(
        "UPDATE products SET is_sponsored = FALSE, updated_at = NOW() WHERE seller_id = $1 AND is_sponsored = TRUE",
        [userId]
      ).catch(() => {});
      profile.subscription_plan = 'basic';
      profile.subscription_status = 'expired';
    }

    const planDef = getPlan(profile.subscription_plan);
    profile.subscription_plan = planDef.id;
    profile.studio_badge = (profile.subscription_status === 'active' || !profile.subscription_status) ? planDef.badge : null;
    profile.sponsor_cap = planDef.sponsorCap;

    return res.json({
      success: true,
      data: {
        ...profile,
        hasBillingAddress: onboardingStatus.hasBillingAddress,
        hasPickupAddress: onboardingStatus.hasPickupAddress,
        hasBankingDetails: onboardingStatus.hasBankingDetails,
        onboardingTourDismissed: onboardingStatus.onboardingTourDismissed,
        profile,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/seller/profile  — update seller profile
// ---------------------------------------------------------------------------
async function updateSellerProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      store_name, shop_name, display_name, handle, location,
      bio, shop_bio, badges, whatsapp_number,
      story_headline, story_description, working_on, video_url,
      bank_details, bank_holder_name, bank_name, bank_account_num, bank_ifsc, bank_upi
    } = req.body;

    const resolvedStoreName = store_name || shop_name || null;
    const resolvedBio = bio || shop_bio || null;
    const resolvedBadges = Array.isArray(badges) ? JSON.stringify(badges) : (badges || null);

    // Profile photo & banner from upload middleware (if multipart was used)
    const profilePhoto = req.file?.path || null;
    const coverPhoto   = req.coverFile?.path || null;

    let resolvedBankDetails = null;
    if (bank_details && typeof bank_details === 'object') {
      resolvedBankDetails = JSON.stringify(bank_details);
    } else if (bank_holder_name || bank_name || bank_account_num || bank_ifsc || bank_upi) {
      // B-08: Validate IFSC format before saving
      const ifscClean = (bank_ifsc || '').toUpperCase().trim();
      if (ifscClean && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscClean)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid IFSC code format. Expected format: XXXX0XXXXXX (e.g. SBIN0001234).',
        });
      }
      resolvedBankDetails = JSON.stringify({
        account_holder: bank_holder_name || '',
        account_holder_name: bank_holder_name || '',
        bank_name: bank_name || '',
        account_number: bank_account_num || '',
        ifsc_code: ifscClean || '',
        upi_id: bank_upi || null
      });
    }

    const { rows } = await query(
      `INSERT INTO seller_profiles (
         user_id, store_name, shop_name, display_name, handle, location,
         bio, shop_bio, badges, whatsapp_number, story_headline, story_description,
         working_on, video_url, profile_photo, avatar_url, banner_url, bank_details, updated_at
       )
       VALUES (
         $15, COALESCE($1, 'Artisan Studio'), $1, $2, $3, $4,
         $5, $5, $6, $7, $8, $9,
         $10, $11, $12, $12, $13, COALESCE($14::jsonb, '{}'::jsonb), NOW()
       )
       ON CONFLICT (user_id) DO UPDATE
       SET store_name        = COALESCE($1, seller_profiles.store_name),
           shop_name         = COALESCE($1, seller_profiles.shop_name),
           display_name      = COALESCE($2, seller_profiles.display_name),
           handle            = COALESCE($3, seller_profiles.handle),
           location          = COALESCE($4, seller_profiles.location),
           bio               = COALESCE($5, seller_profiles.bio),
           shop_bio          = COALESCE($5, seller_profiles.shop_bio),
           badges            = COALESCE($6, seller_profiles.badges),
           whatsapp_number   = COALESCE($7, seller_profiles.whatsapp_number),
           story_headline    = COALESCE($8, seller_profiles.story_headline),
           story_description = COALESCE($9, seller_profiles.story_description),
           working_on        = COALESCE($10, seller_profiles.working_on),
           video_url         = COALESCE($11, seller_profiles.video_url),
           profile_photo     = COALESCE($12, seller_profiles.profile_photo),
           avatar_url        = COALESCE($12, seller_profiles.avatar_url),
           banner_url        = COALESCE($13, seller_profiles.banner_url),
           bank_details      = COALESCE($14::jsonb, seller_profiles.bank_details),
           updated_at        = NOW()
       RETURNING *`,
      [
        resolvedStoreName,
        display_name || null,
        handle ? handle.toLowerCase() : null,
        location || null,
        resolvedBio,
        resolvedBadges,
        whatsapp_number || null,
        story_headline || null,
        story_description || null,
        working_on || null,
        video_url || null,
        profilePhoto,
        coverPhoto,
        resolvedBankDetails,
        userId
      ]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Seller profile not found.' });
    }

    // Keep sellers master table in sync if applicable
    await query(
      `UPDATE sellers
       SET store_name        = COALESCE($1, store_name),
           shop_name         = COALESCE($1, shop_name),
           handle            = COALESCE($2, handle),
           city              = COALESCE($3, city),
           bio               = COALESCE($4, bio),
           badges            = COALESCE($5, badges),
           whatsapp_number   = COALESCE($6, whatsapp_number),
           about_headline    = COALESCE($7, about_headline),
           about_description = COALESCE($8, about_description),
           working_on_label  = COALESCE($9, working_on_label),
           about_video_url   = COALESCE($10, about_video_url),
           photo_url         = COALESCE($11, photo_url),
           banner_url        = COALESCE($12, banner_url),
           bank_details      = COALESCE($13::jsonb, bank_details),
           updated_at        = NOW()
       WHERE user_id = $14`,
      [
        resolvedStoreName,
        handle ? handle.toLowerCase() : null,
        location || null,
        resolvedBio,
        resolvedBadges,
        whatsapp_number || null,
        story_headline || null,
        story_description || null,
        working_on || null,
        video_url || null,
        profilePhoto,
        coverPhoto,
        resolvedBankDetails,
        userId
      ]
    ).catch(() => {});

    const updatedProfile = sanitizeSellerProfile(rows[0]);
    const photo = updatedProfile.profile_photo || updatedProfile.avatar_url || '/img/default-avatar.png';
    const banner = updatedProfile.banner_url || '/img/default-seller-banner.png';
    updatedProfile.profile_photo = photo;
    updatedProfile.avatar_url = photo;
    updatedProfile.logo_url = photo;
    updatedProfile.banner_url = banner;
    updatedProfile.cover_photo = banner;
    updatedProfile.vacation_mode = Boolean(updatedProfile.vacation_mode_active);

    return res.json({ success: true, data: { profile: updatedProfile, ...updatedProfile } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/public/:userId / /api/sellers/:id  — public seller profile (buyer view)
// ---------------------------------------------------------------------------
async function getPublicSellerProfile(req, res, next) {
  try {
    const rawId = req.params.userId || req.params.sellerId || req.params.id;
    if (!rawId) {
      return res.status(400).json({ success: false, message: 'Seller ID or slug is required.' });
    }

    const { rows } = await query(
      `SELECT u.id AS user_id, u.name, u.profile_photo_url, u.cover_photo_url,
              sp.id AS profile_id,
              COALESCE(sp.store_name, s.store_name, u.name, 'Artisan Studio') AS store_name,
              COALESCE(sp.handle, sp.slug, s.handle, s.slug) AS slug,
              COALESCE(sp.bio, s.bio) AS bio,
              sp.banner_url, sp.about_image_url,
              sp.pickup_address, sp.created_at,
              sp.verification_status AS sp_verification_status, sp.is_approved AS sp_is_approved,
              s.verification_status AS s_verification_status, s.is_approved AS s_is_approved,
              COALESCE(sp.subscription_plan, s.subscription_plan, 'basic') AS subscription_plan,
              COALESCE(sp.subscription_status, s.subscription_status, 'active') AS subscription_status,
              p.product_count,
              r.avg_rating,
              r.review_count
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       LEFT JOIN LATERAL (SELECT COUNT(p.id) AS product_count FROM products p WHERE p.seller_id = u.id AND p.status = 'active') p ON true
       LEFT JOIN LATERAL (SELECT AVG(r.rating) AS avg_rating, COUNT(r.id) AS review_count FROM reviews r WHERE r.seller_id = u.id) r ON true
       WHERE u.id::text = $1::text
          OR sp.id::text = $1::text
          OR s.id::text = $1::text
          OR sp.slug = $1
          OR s.slug = $1
          OR sp.handle = $1
          OR s.handle = $1
       ORDER BY CASE 
         WHEN sp.slug = $1 OR s.slug = $1 OR sp.handle = $1 OR s.handle = $1 THEN 1
         WHEN u.id::text = $1::text AND (sp.id IS NOT NULL OR s.id IS NOT NULL) THEN 2
         WHEN u.id::text = $1::text THEN 3
         WHEN sp.id::text = $1::text THEN 4
         WHEN s.id::text = $1::text THEN 5
         ELSE 6 
       END ASC
       LIMIT 1`,
      [String(rawId)]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Seller not found.' });
    }

    const row = rows[0];
    const planDef = getPlan(row.subscription_plan);
    const storeName = row.store_name || row.name || 'Artisan Studio';
    const slug = row.slug || (storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    const avatarUrl = row.profile_photo_url || row.profile_photo || '/img/default-avatar.png';
    const isLegacyDefaultBanner = (url) => !url || url.includes('default-banner.png') || url.includes('artisan_showcase.jpg');
    const coverPhotoUrl = (!isLegacyDefaultBanner(row.cover_photo_url))
      ? row.cover_photo_url
      : (!isLegacyDefaultBanner(row.cover_photo))
        ? row.cover_photo
        : (!isLegacyDefaultBanner(row.banner_url))
          ? row.banner_url
          : '/img/default-seller-banner.png';
    
    let locationStr = 'Indian Artisan Studio';
    if (row.pickup_address && typeof row.pickup_address === 'object') {
      const parts = [row.pickup_address.city, row.pickup_address.state].filter(Boolean);
      if (parts.length > 0) locationStr = parts.join(', ');
    }

    const isVerified = (
      row.sp_verification_status === 'verified' ||
      row.sp_is_approved === true ||
      row.s_verification_status === 'verified' ||
      row.s_is_approved === true
    );

    const studioBadge = (row.subscription_status === 'active' || !row.subscription_status) ? planDef.badge : null;

    const normalized = {
      id: row.user_id,
      user_id: row.user_id,
      store_name: storeName,
      shop_name: storeName,
      name: row.name || storeName,
      handle: slug,
      slug: slug,
      location: locationStr,
      bio: row.bio || 'Curating beautiful handcrafted creations with intention.',
      artisan_story: row.bio || '',
      about_headline: `Our Story: ${storeName}`,
      about_image_url: row.about_image_url || null,
      avg_rating: parseFloat(row.avg_rating || 5.0),
      review_count: parseInt(row.review_count || 0, 10),
      product_count: parseInt(row.product_count || 0, 10),
      is_verified: isVerified,
      subscription_plan: planDef.id,
      studio_badge: studioBadge,
      avatar_url: avatarUrl,
      profile_photo_url: avatarUrl,
      profile_photo: avatarUrl,
      cover_photo_url: coverPhotoUrl,
      cover_photo: coverPhotoUrl,
      banner_url: coverPhotoUrl,
      created_at: row.created_at,
      workspace_photos: []
    };

    return res.json({
      success: true,
      data: {
        ...normalized,
        profile: normalized
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT/PATCH /api/seller/store-config  — vacation_mode, visibility, shipping, capacity
// ---------------------------------------------------------------------------
async function updateStoreConfig(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      vacation_mode,
      vacation_mode_active,
      is_accepting_orders,
      accept_orders,
      zai_mode,
      zai_mode_enabled,
      pickup_address,
      vacation_message,
      weekly_capacity,
      daily_limit
    } = req.body;

    let finalVacationMode = null;
    if (vacation_mode !== undefined) {
      finalVacationMode = (vacation_mode === true || vacation_mode === 1 || vacation_mode === '1') ? 1 : 0;
    } else if (vacation_mode_active !== undefined) {
      finalVacationMode = (vacation_mode_active === true || vacation_mode_active === 1 || vacation_mode_active === '1') ? 1 : 0;
    }

    let finalAcceptingOrders = null;
    if (is_accepting_orders !== undefined) {
      finalAcceptingOrders = (is_accepting_orders === true || is_accepting_orders === 1 || is_accepting_orders === '1') ? 1 : 0;
    } else if (accept_orders !== undefined) {
      finalAcceptingOrders = (accept_orders === true || accept_orders === 1 || accept_orders === '1') ? 1 : 0;
    }

    let finalZaiMode = null;
    if (zai_mode !== undefined) {
      finalZaiMode = (zai_mode === true || zai_mode === 1 || zai_mode === '1') ? 1 : 0;
    } else if (zai_mode_enabled !== undefined) {
      finalZaiMode = (zai_mode_enabled === true || zai_mode_enabled === 1 || zai_mode_enabled === '1') ? 1 : 0;
    }

    const msg = vacation_message !== undefined ? vacation_message : null;

    const { rows } = await query(
      `UPDATE seller_profiles
       SET vacation_mode_active = COALESCE($1, vacation_mode_active),
           is_accepting_orders  = COALESCE($2, is_accepting_orders),
           zai_mode_enabled     = COALESCE($3, zai_mode_enabled),
           vacation_message     = COALESCE($4, vacation_message),
           pickup_address       = COALESCE($5::jsonb, pickup_address),
           weekly_production_capacity = COALESCE($6, weekly_production_capacity),
           daily_order_limit    = COALESCE($7, daily_order_limit),
           is_active            = CASE WHEN $1 = 1 THEN FALSE WHEN $1 = 0 THEN TRUE ELSE is_active END,
           updated_at           = NOW()
       WHERE user_id = $8
       RETURNING id, user_id, vacation_mode_active, vacation_mode_active AS vacation_mode,
                 is_accepting_orders, is_accepting_orders AS store_visibility,
                 zai_mode_enabled, vacation_message, pickup_address,
                 weekly_production_capacity, daily_order_limit, is_active`,
      [
        finalVacationMode,
        finalAcceptingOrders,
        finalZaiMode,
        msg,
        pickup_address ? (typeof pickup_address === 'string' ? pickup_address : JSON.stringify(pickup_address)) : null,
        weekly_capacity !== undefined ? parseInt(weekly_capacity, 10) : null,
        daily_limit !== undefined ? parseInt(daily_limit, 10) : null,
        userId
      ]
    );

    if (finalVacationMode !== null) {
      await query(
        `UPDATE sellers
         SET is_active = $1::boolean, updated_at = NOW()
         WHERE user_id = $2 OR id = $2`,
        [finalVacationMode === 1 ? false : true, userId]
      ).catch(() => {});
    }

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Seller profile not found.' });
    }

    const config = {
      ...rows[0],
      vacation_mode: Boolean(rows[0].vacation_mode_active),
      vacation_mode_active: rows[0].vacation_mode_active,
      is_accepting_orders: rows[0].is_accepting_orders,
      store_visibility: Boolean(rows[0].is_accepting_orders),
      zai_mode_enabled: rows[0].zai_mode_enabled,
    };

    return res.json({ success: true, data: { config, ...config } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/seller/status  — toggle vacation mode / active status
// ---------------------------------------------------------------------------
async function toggleVacationMode(req, res, next) {
  try {
    const userId = req.user.id;
    const { vacation_mode, is_active, vacation_message } = req.body;

    const { rows: currentProfile } = await query(
      'SELECT vacation_mode_active, is_active FROM seller_profiles WHERE user_id = $1',
      [userId]
    );

    if (!currentProfile.length) {
      return res.status(404).json({ success: false, message: 'Seller profile not found.' });
    }

    let newVacationMode = currentProfile[0].vacation_mode_active === 1;
    if (vacation_mode !== undefined) {
      newVacationMode = Boolean(vacation_mode === true || vacation_mode === 1 || vacation_mode === '1');
    } else if (is_active !== undefined) {
      newVacationMode = !Boolean(is_active === true || is_active === 1 || is_active === '1');
    } else {
      newVacationMode = !newVacationMode;
    }

    const { rows } = await query(
      `UPDATE seller_profiles
       SET vacation_mode_active = $1,
           is_active = $2::boolean,
           vacation_message = COALESCE($3, vacation_message),
           updated_at = NOW()
       WHERE user_id = $4
       RETURNING id, vacation_mode_active, is_active, vacation_message`,
      [newVacationMode ? 1 : 0, newVacationMode ? false : true, vacation_message || null, userId]
    );

    await query(
      `UPDATE sellers
       SET is_active = $1::boolean, updated_at = NOW()
       WHERE user_id = $2 OR id = $2`,
      [newVacationMode ? false : true, userId]
    ).catch(() => {});

    return res.json({
      success: true,
      message: newVacationMode ? 'Store placed on vacation mode.' : 'Store is now active and accepting orders.',
      data: {
        config: rows[0],
        vacation_mode: newVacationMode,
        vacation_mode_active: newVacationMode ? 1 : 0,
        is_active: rows[0].is_active,
        vacation_message: rows[0].vacation_message
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST/PUT /api/seller/zai-mode — toggle ZAI AI automated review reply mode
// Does NOT touch vacation mode or is_active!
// ---------------------------------------------------------------------------
async function toggleZaiMode(req, res, next) {
  try {
    const userId = req.user.id;
    const { enabled, zai_mode, zai_mode_enabled } = req.body;
    let isZai = true;
    if (enabled !== undefined) {
      isZai = Boolean(enabled === true || enabled === 1 || enabled === '1' || enabled === 'true');
    } else if (zai_mode !== undefined) {
      isZai = Boolean(zai_mode === true || zai_mode === 1 || zai_mode === '1' || zai_mode === 'true');
    } else if (zai_mode_enabled !== undefined) {
      isZai = Boolean(zai_mode_enabled === true || zai_mode_enabled === 1 || zai_mode_enabled === '1' || zai_mode_enabled === 'true');
    }

    await query(
      `UPDATE seller_profiles
       SET zai_mode_enabled = $1, updated_at = NOW()
       WHERE user_id = $2`,
      [isZai ? 1 : 0, userId]
    );

    return res.json({
      success: true,
      message: isZai ? 'ZAI Auto-Reply Mode activated.' : 'ZAI Auto-Reply Mode deactivated.',
      data: {
        zai_mode_enabled: isZai,
        enabled: isZai
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/review-settings — get automated review reply settings
// ---------------------------------------------------------------------------
async function getReviewSettings(req, res, next) {
  try {
    const userId = req.user.id;
    const { rows } = await query(
      `SELECT review_settings, zai_mode_enabled FROM seller_profiles WHERE user_id = $1`,
      [userId]
    ).catch(() => ({ rows: [] }));

    let settings = rows[0]?.review_settings;
    if (typeof settings === 'string') {
      try { settings = JSON.parse(settings); } catch {}
    }
    if (!settings || typeof settings !== 'object') {
      settings = {
        enabled: true,
        delay_days_after_del: 3
      };
    }

    return res.json({
      success: true,
      data: {
        ...settings,
        zai_mode_enabled: Boolean(rows[0]?.zai_mode_enabled)
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/seller/review-settings — save automated review reply settings
// ---------------------------------------------------------------------------
async function saveReviewSettings(req, res, next) {
  try {
    const userId = req.user.id;
    const { enabled, delay_days_after_del } = req.body;

    const currentSettings = {
      enabled: enabled !== 0 && enabled !== false && enabled !== '0' && enabled !== 'false',
      delay_days_after_del: Math.max(1, Math.min(30, parseInt(delay_days_after_del || '3', 10)))
    };

    await query(
      `UPDATE seller_profiles
       SET review_settings = $1, updated_at = NOW()
       WHERE user_id = $2`,
      [JSON.stringify(currentSettings), userId]
    );

    return res.json({
      success: true,
      message: 'Review settings saved successfully.',
      data: currentSettings
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/seller/change-password — update seller account password
// ---------------------------------------------------------------------------
async function changeSellerPassword(req, res, next) {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.'
      });
    }

    if (String(new_password).length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long.'
      });
    }

    const { rows: userRows } = await query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (!userRows.length) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.'
      });
    }

    const currentHash = userRows[0].password_hash;
    if (currentHash) {
      const isMatch = await bcrypt.compare(String(current_password), currentHash);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect.'
        });
      }
    }

    const newHash = await bcrypt.hash(String(new_password).trim(), 10);
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, userId]
    );

    return res.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/seller/apply  — create sellers + seller_profiles rows (onboarding)
// ---------------------------------------------------------------------------
async function applyAsSeller(req, res, next) {
  const client = await getClient();
  try {
    const userId = req.user.id;

    // Allow buyers (and existing sellers re-submitting application)
    if (!['buyer', 'seller', 'user'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Invalid user role for seller application.' });
    }

    const {
      store_name, storeName, shop_name,
      bio, craft_specialty, craftSpecialty,
      whatsapp_number, phone,
      pickup_address, address_line1, street, address_line2, city, state, pincode, postal_code,
      daily_capacity_min, daily_capacity_max, capacity_min, capacity_max,
      instagram_handle, instagram, instagram_followers,
      bank_details, account_holder_name, account_holder, account_number, ifsc_code, ifsc, bank_name,
      pan_number, pan, gst_number, gst,
      portfolio_images, portfolio_url
    } = req.body;

    const { rows: userRows } = await client.query('SELECT name, full_name, email FROM users WHERE id = $1', [userId]);
    const userName = userRows[0]?.full_name || userRows[0]?.name || 'Artisan';
    const finalStoreName = (store_name || storeName || shop_name || `${userName}'s Studio`).trim();
    const specialty = craft_specialty || craftSpecialty || '';
    const finalBio = bio || (specialty ? `Artisan specializing in ${specialty}` : 'Artisan specializing in handcrafted gifts');
    const finalPhone = whatsapp_number || phone || null;

    const capMin = parseInt(daily_capacity_min || capacity_min || 0, 10) || null;
    const capMax = parseInt(daily_capacity_max || capacity_max || 0, 10) || null;
    const instaHandle = (instagram_handle || instagram || '').trim().replace(/^@/, '') || null;
    const instaFollowers = instagram_followers || null;

    const baseSlug = finalStoreName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'artisan';
    const storeSlug = `${baseSlug}-${Date.now()}`;

    const parsedPickup = (typeof pickup_address === 'object' && pickup_address !== null && Object.keys(pickup_address).length > 0)
      ? pickup_address
      : (address_line1 || city ? {
          address_line1: address_line1 || street || '',
          address_line2: address_line2 || '',
          city: city || '',
          state: state || '',
          pincode: pincode || postal_code || ''
        } : {});

    const parsedBank = (typeof bank_details === 'object' && bank_details !== null && Object.keys(bank_details).length > 0)
      ? bank_details
      : (account_number ? {
          account_holder: account_holder_name || account_holder || userName,
          account_number: account_number || '',
          ifsc_code: (ifsc_code || ifsc || '').toUpperCase(),
          bank_name: bank_name || ''
        } : {});

    const parsedPan = pan_number || pan || null;
    const parsedGst = gst_number || gst || null;
    const parsedPortfolio = Array.isArray(portfolio_images)
      ? portfolio_images
      : (portfolio_url ? [portfolio_url] : []);

    await client.query('BEGIN');

    // 1. Promote user role to 'seller'
    await client.query(
      `UPDATE users SET role = 'seller', updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    // 2. Initialize / upsert master sellers row
    const { rows: sellerRows } = await client.query(
      `INSERT INTO sellers (user_id, store_name, slug, bio, verification_status, is_active, is_approved, pickup_address, bank_details, onboarding_completed)
       VALUES ($1, $2, $3, $4, 'pending_verification', true, false, $5, $6, false)
       ON CONFLICT (user_id) DO UPDATE SET
         store_name = EXCLUDED.store_name,
         slug = EXCLUDED.slug,
         bio = EXCLUDED.bio,
         pickup_address = EXCLUDED.pickup_address,
         verification_status = 'pending_verification',
         is_approved = false
       RETURNING *`,
      [userId, finalStoreName, storeSlug, finalBio, JSON.stringify(parsedPickup), JSON.stringify(parsedBank)]
    );

    const newSellerId = sellerRows[0]?.id;
    if (newSellerId) {
      await client.query(`
        INSERT INTO wallets (seller_id, user_id, balance, holding_balance, currency)
        VALUES ($1, $2, 0.00, 0.00, 'INR')
        ON CONFLICT (seller_id) DO NOTHING
      `, [newSellerId, userId]).catch(() => {});
    }

    await client.query(
      `UPDATE sellers SET
         pan_number = $2,
         gst_number = $3,
         portfolio_images = $4::text[],
         daily_capacity_min = $5,
         daily_capacity_max = $6,
         instagram_handle = $7,
         instagram_followers = $8,
         applied_at = NOW(),
         onboarding_completed = FALSE
       WHERE user_id = $1`,
      [userId, parsedPan, parsedGst, parsedPortfolio, capMin, capMax, instaHandle, instaFollowers]
    ).catch(() => {});

    // 3. Initialize / upsert seller_profiles row for unified shape
    const { rows: profileRows } = await client.query(
      `INSERT INTO seller_profiles (user_id, store_name, slug, bio, seller_type, verification_status, is_approved, is_active, pickup_address, bank_details, pan_number, gst_number, portfolio_images, applied_at, onboarding_completed)
       VALUES ($1, $2, $3, $4, 'regular', 'pending_verification', false, true, $5, $6, $7, $8, $9::text[], NOW(), false)
       ON CONFLICT (user_id) DO UPDATE SET
         store_name = EXCLUDED.store_name,
         slug = EXCLUDED.slug,
         bio = EXCLUDED.bio,
         pickup_address = EXCLUDED.pickup_address,
         bank_details = EXCLUDED.bank_details,
         pan_number = EXCLUDED.pan_number,
         gst_number = EXCLUDED.gst_number,
         portfolio_images = EXCLUDED.portfolio_images,
         verification_status = 'pending_verification',
         is_approved = false
       RETURNING *`,
      [userId, finalStoreName, storeSlug, finalBio, JSON.stringify(parsedPickup), JSON.stringify(parsedBank), parsedPan, parsedGst, parsedPortfolio]
    );

    await client.query(
      `UPDATE seller_profiles SET
         daily_capacity_min = $2,
         daily_capacity_max = $3,
         instagram_handle = $4,
         instagram_followers = $5,
         whatsapp_number = COALESCE($6, whatsapp_number),
         onboarding_completed = FALSE
       WHERE user_id = $1`,
      [userId, capMin, capMax, instaHandle, instaFollowers, finalPhone]
    ).catch(() => {});

    await client.query('COMMIT');

    // Notify admins of the new application
    await ownerNotifyService.sendAdminAlertEmail('seller_application', {
      id: finalStoreName,
      storeName: finalStoreName,
      artisanName: userName,
      phone: finalPhone || 'N/A',
      city: parsedPickup?.city || '',
      state: parsedPickup?.state || '',
      link: 'https://thetohfa.in/admin/sellers.html?tab=applications',
    }).catch(() => {});


    return res.status(201).json({
      success: true,
      message: 'Seller application submitted successfully and is pending review.',
      data: { profile: profileRows[0], seller: sellerRows[0] }
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/application-status
// ---------------------------------------------------------------------------
async function getApplicationStatus(req, res, next) {
  try {
    const userId = req.user.id;

    let { rows } = await query(
      `SELECT is_approved, verification_status, rejection_reason, seller_type, created_at, is_active,
              COALESCE(onboarding_completed, FALSE) AS onboarding_completed,
              (COALESCE(is_admin_managed::text, 'false') IN ('true', 't', '1')) AS is_admin_managed
       FROM seller_profiles WHERE user_id = $1`,
      [userId]
    );

    if (!rows.length) {
      const sellerRes = await query(
        `SELECT is_approved, verification_status, rejection_reason, created_at, is_active,
                COALESCE(onboarding_completed, FALSE) AS onboarding_completed,
                (COALESCE(is_admin_managed::text, 'false') IN ('true', 't', '1')) AS is_admin_managed
         FROM sellers WHERE user_id = $1`,
        [userId]
      );
      rows = sellerRes.rows;
    }

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'No seller application found.' });
    }

    return res.json({ success: true, data: { application: rows[0] } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GET /api/seller/dashboard-metrics (aliases: /dashboard-stats, /dashboard)
// ---------------------------------------------------------------------------
async function getDashboardMetrics(req, res, next) {
  try {
    await ensureOrderItemColumns();
    const sellerId = req.user.id;
    const period = (req.query.period || req.query.range || '7d').toLowerCase();

    let days = 7;
    if (period === '30d') days = 30;
    else if (period === '90d') days = 90;

    // Execute independent dashboard queries in parallel
    const [
      profileRes,
      allTimeStatsRes,
      currPeriodStatsRes,
      prevPeriodStatsRes,
      prodRowsRes,
      reviewRowsRes,
      lowStockRowsRes,
      recentOrderRowsRes,
      dailyDataRes
    ] = await Promise.all([
      // 0. Seller profile info
      query(
        `SELECT sp.store_name, COALESCE(sp.store_name, u.name) AS display_name, u.name, u.email
         FROM users u
         LEFT JOIN seller_profiles sp ON sp.user_id = u.id
         WHERE u.id = $1`,
        [sellerId]
      ),
      // 1. All-time Core KPIs
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(so.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN so.subtotal ELSE 0 END), 0) AS all_revenue,
           COUNT(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(so.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN 1 END) AS all_orders,
           COUNT(CASE WHEN LOWER(COALESCE(so.status, '')) IN ('order_placed', 'pending', 'confirmed', 'crafting', 'packed', 'processing') THEN 1 END) AS pending_orders
         FROM seller_orders so
         JOIN orders o ON o.id = so.order_id
         WHERE (so.seller_id = $1 OR so.seller_id::text = $1::text)`,
        [sellerId]
      ).catch(() => ({ rows: [{ all_revenue: 0, all_orders: 0, pending_orders: 0 }] })),
      // Current period stats
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(so.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN so.subtotal ELSE 0 END), 0) AS curr_revenue,
           COUNT(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(so.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN 1 END) AS curr_orders
         FROM seller_orders so
         JOIN orders o ON o.id = so.order_id
         WHERE (so.seller_id = $1 OR so.seller_id::text = $1::text)
           AND so.created_at >= NOW() - ($2 || ' days')::INTERVAL`,
        [sellerId, days]
      ).catch(() => ({ rows: [{ curr_revenue: 0, curr_orders: 0 }] })),
      // Previous period stats (for % delta comparison)
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(so.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN so.subtotal ELSE 0 END), 0) AS prev_revenue,
           COUNT(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(so.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN 1 END) AS prev_orders
         FROM seller_orders so
         JOIN orders o ON o.id = so.order_id
         WHERE (so.seller_id = $1 OR so.seller_id::text = $1::text)
           AND so.created_at >= NOW() - ($2 || ' days')::INTERVAL * 2
           AND so.created_at < NOW() - ($2 || ' days')::INTERVAL`,
        [sellerId, days]
      ).catch(() => ({ rows: [{ prev_revenue: 0, prev_orders: 0 }] })),
      // Products count & views
      query(
        `SELECT COUNT(*) AS active_products, COALESCE(SUM(view_count), 0) AS total_views
         FROM products WHERE (seller_id = $1 OR seller_id::text = $1::text) AND status != 'deleted'`,
        [sellerId]
      ).catch(() => ({ rows: [{ active_products: 0, total_views: 0 }] })),
      // Review rating & count
      query(
        `SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 5.0) AS average_rating, COUNT(*) AS review_count
         FROM reviews WHERE (seller_id = $1 OR seller_id::text = $1::text)`,
        [sellerId]
      ).catch(() => ({ rows: [{ average_rating: 5.0, review_count: 0 }] })),
      // 2. Low Stock Alerts
      query(
        `SELECT id, name, name AS title, stock_quantity, stock_quantity AS stock_count,
                COALESCE(low_stock_threshold, 5) AS threshold
         FROM products
         WHERE (seller_id = $1 OR seller_id::text = $1::text) AND status != 'deleted' AND stock_quantity <= COALESCE(low_stock_threshold, 5)
         ORDER BY stock_quantity ASC
         LIMIT 5`,
        [sellerId]
      ).catch(() => ({ rows: [] })),
      // 3. Recent orders (latest 5)
      query(
        `SELECT o.id AS parent_order_id, so.id AS id, so.subtotal, so.subtotal AS total_amount, so.status, so.created_at, o.payment_status, so.payout_status,
                COALESCE(u.name, 'Valued Buyer') AS buyer_name,
                u.email AS buyer_email,
                COALESCE(NULLIF(TRIM(o.shipping_address->>'city'), ''), NULLIF(TRIM(a.city), ''), 'India') AS shipping_city,
                COALESCE(
                  (SELECT json_agg(json_build_object(
                    'id', oi.id,
                    'product_id', oi.product_id,
                    'product_name', p.name,
                    'name', p.name,
                    'quantity', oi.quantity,
                    'unit_price', COALESCE(oi.unit_price, (oi.unit_price_paise::numeric / 100.0), 0),
                    'customization_data', oi.customization_data,
                    'proof_image_url', oi.proof_image_url,
                    'customization_status', oi.customization_status,
                    'image_url', (SELECT url FROM product_images pi WHERE pi.product_id = oi.product_id ORDER BY sort_order ASC LIMIT 1)
                  ))
                  FROM order_items oi
                  LEFT JOIN products p ON p.id = oi.product_id
                  WHERE oi.seller_order_id = so.id OR (oi.order_id = o.id AND oi.seller_order_id IS NULL)),
                  '[]'
                ) AS items
         FROM seller_orders so
         JOIN orders o ON o.id = so.order_id
         LEFT JOIN users u ON u.id = o.buyer_id
         LEFT JOIN addresses a ON a.id = o.address_id
         WHERE (so.seller_id = $1 OR so.seller_id::text = $1::text)
         ORDER BY so.created_at DESC
         LIMIT 5`,
        [sellerId]
      ).catch(() => ({ rows: [] })),
      // 4. Sales & Visits Chart for requested period
      query(
        `SELECT DATE(so.created_at) AS date,
                COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(so.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN so.subtotal ELSE 0 END), 0) AS revenue,
                COUNT(CASE WHEN LOWER(COALESCE(so.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN 1 END) AS orders_count
         FROM seller_orders so
         JOIN orders o ON o.id = so.order_id
         WHERE (so.seller_id = $1 OR so.seller_id::text = $1::text)
           AND so.created_at >= NOW() - ($2 || ' days')::INTERVAL
         GROUP BY DATE(so.created_at)
         ORDER BY date ASC`,
        [sellerId, days]
      ).catch(() => ({ rows: [] }))
    ]);

    const profileRows = profileRes.rows || [];
    const allTimeStats = allTimeStatsRes.rows || [];
    const currPeriodStats = currPeriodStatsRes.rows || [];
    const prevPeriodStats = prevPeriodStatsRes.rows || [];
    const prodRows = prodRowsRes.rows || [];
    const reviewRows = reviewRowsRes.rows || [];
    const lowStockRows = lowStockRowsRes.rows || [];
    const recentOrderRows = recentOrderRowsRes.rows || [];
    const dailyData = dailyDataRes.rows || [];

    const sellerInfo = profileRows[0] || {};
    const displayName = sellerInfo.display_name || sellerInfo.store_name || sellerInfo.name || 'Artisan Studio';

    const currRevenue = parseFloat(currPeriodStats[0]?.curr_revenue || 0);
    const currOrders = parseInt(currPeriodStats[0]?.curr_orders || 0, 10);
    const prevRevenue = parseFloat(prevPeriodStats[0]?.prev_revenue || 0);
    const prevOrders = parseInt(prevPeriodStats[0]?.prev_orders || 0, 10);

    const allRevenue = parseFloat(allTimeStats[0]?.all_revenue || 0);
    const allOrders = parseInt(allTimeStats[0]?.all_orders || 0, 10);
    const pendingOrders = parseInt(allTimeStats[0]?.pending_orders || 0, 10);
    const activeProducts = parseInt(prodRows[0]?.active_products || 0, 10);
    const totalViews = parseInt(prodRows[0]?.total_views || 0, 10);
    const averageRating = parseFloat(reviewRows[0]?.average_rating || 5.0);
    const reviewCount = parseInt(reviewRows[0]?.review_count || 0, 10);

    // Revenue % change calculation
    let orderValueChangePct = 0;
    if (prevRevenue > 0) {
      orderValueChangePct = Math.round(((currRevenue - prevRevenue) / prevRevenue) * 100);
    } else if (currRevenue > 0) {
      orderValueChangePct = 100;
    }

    // Conversion rate: (currOrders / GREATEST(periodViews, currOrders, 1)) * 100
    let conversionRate = 0;
    const scaledPeriodViews = totalViews > 0 ? Math.max(Math.ceil((totalViews / 365) * days), currOrders) : currOrders;
    const viewBase = Math.max(scaledPeriodViews, currOrders, 1);
    if (currOrders > 0) {
      conversionRate = parseFloat(((currOrders / viewBase) * 100).toFixed(1));
    }

    const formattedRecentOrders = recentOrderRows.map(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      const firstItem = items[0] || {};
      return {
        id: o.id,
        order_ref: `TOHFA-${String(o.id).substring(0, 8).toUpperCase()}`,
        buyer_name: o.buyer_name,
        buyer_email: o.buyer_email,
        shipping_city: o.shipping_city || 'India',
        item_title: firstItem.product_name || firstItem.name || 'Handcrafted Item',
        item_image: firstItem.image_url || null,
        subtotal: parseFloat(o.subtotal || o.total_amount || 0),
        total_amount: parseFloat(o.total_amount || 0),
        total_paise: Math.round(parseFloat(o.total_amount || 0) * 100),
        amount_paise: Math.round(parseFloat(o.total_amount || 0) * 100),
        status: o.status,
        payment_status: o.payment_status,
        payout_status: o.payout_status,
        created_at: o.created_at,
        items,
      };
    });

    // Build complete daily date sequence
    const chartLabels = [];
    const chartRevenue = [];
    const chartVisits = [];
    const dayMap = {};

    dailyData.forEach(r => {
      const dStr = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
      dayMap[dStr] = {
        revenue: parseFloat(r.revenue || 0),
        orders: parseInt(r.orders_count || 0, 10),
      };
    });

    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const displayLabel = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      chartLabels.push(displayLabel);
      
      const found = dayMap[iso] || { revenue: 0, orders: 0 };
      chartRevenue.push(found.revenue);
      // Visits proxy from active orders and views
      const estVisits = found.orders > 0 ? found.orders * 8 : (totalViews > 0 ? Math.ceil(totalViews / days) : 0);
      chartVisits.push(estVisits);
    }

    const metrics = {
      total_revenue: currRevenue,
      total_revenue_all_time: allRevenue,
      total_orders: currOrders,
      total_orders_all_time: allOrders,
      order_value_paise: Math.round(currRevenue * 100),
      order_value_change_pct: orderValueChangePct,
      new_orders_since_last_period: currOrders,
      conversion_rate: conversionRate,
      average_rating: averageRating,
      active_products: activeProducts,
      pending_orders: pendingOrders,
      review_count: reviewCount,
    };

    return res.json({
      success: true,
      data: {
        period,
        seller: {
          display_name: displayName,
          store_name: sellerInfo.store_name || displayName,
          name: sellerInfo.name || displayName
        },
        date_label: new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        metrics,
        kpis: metrics,
        low_stock_alerts: lowStockRows,
        recentOrders: formattedRecentOrders,
        recent_orders: formattedRecentOrders,
        salesChart: {
          labels: chartLabels,
          data: chartRevenue,
          revenue: chartRevenue,
          visits: chartVisits,
        },
        // Backwards compatibility mirrors
        total_revenue: currRevenue,
        total_orders: currOrders,
        average_rating: averageRating,
        active_products: activeProducts,
        pending_orders: pendingOrders,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/analytics (aliases: /analytics/full)
// ---------------------------------------------------------------------------
async function getSellerAnalytics(req, res, next) {
  try {
    const sellerId = req.user.id;
    const selectedRange = (req.query.range || req.query.period || '30d').toLowerCase();
    const start = req.query.start || req.query.startDate || '';
    const end = req.query.end || req.query.endDate || '';

    let dateCondition = `o.created_at >= NOW() - INTERVAL '30 days'`;
    let queryParams = [sellerId];
    let daysCount = 30;

    if (selectedRange === 'today') {
      dateCondition = `o.created_at >= CURRENT_DATE`;
      daysCount = 1;
    } else if (selectedRange === '7d') {
      dateCondition = `o.created_at >= NOW() - INTERVAL '7 days'`;
      daysCount = 7;
    } else if (selectedRange === '90d') {
      dateCondition = `o.created_at >= NOW() - INTERVAL '90 days'`;
      daysCount = 90;
    } else if (selectedRange === 'custom' && start && end) {
      dateCondition = `DATE(o.created_at) BETWEEN $2 AND $3`;
      queryParams.push(start, end);
      const diffMs = new Date(end).getTime() - new Date(start).getTime();
      daysCount = Math.max(1, Math.round(diffMs / 86400000) + 1);
    }

    // Execute independent analytics queries in parallel with Promise.all
    const [
      totalsRes,
      prodViewsRes,
      dailyRes,
      topProductsRes,
      orderTypesRes,
      buyerStatsRes,
      locationRes
    ] = await Promise.all([
      // 1. Revenue & Order totals in this window (excluding cancelled & refunded)
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN COALESCE(NULLIF(o.total_paise, 0) / 100.0, CASE WHEN o.total_amount >= 10000 THEN o.total_amount / 100.0 ELSE o.total_amount END, 0) ELSE 0 END), 0) AS total_revenue,
           COUNT(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN 1 END) AS total_orders,
           COUNT(CASE WHEN LOWER(COALESCE(o.status, '')) IN ('cancelled', 'refunded', 'cancel_requested') OR LOWER(COALESCE(o.payment_status, '')) = 'refunded' THEN 1 END) AS returns_cancellations
         FROM orders o
         WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text) AND ${dateCondition}`,
        queryParams
      ).catch(() => ({ rows: [{ total_revenue: 0, total_orders: 0, returns_cancellations: 0 }] })),

      // 2. Product Views for real conversion rate
      query(
        `SELECT COALESCE(SUM(view_count), 0) AS total_views, COUNT(*) AS active_products
         FROM products
         WHERE (seller_id = $1 OR seller_id::text = $1::text) AND status != 'deleted'`,
        [sellerId]
      ).catch(() => ({ rows: [{ total_views: 0, active_products: 0 }] })),

      // 3. Orders per day & daily revenue series
      query(
        `SELECT
           TO_CHAR(o.created_at, 'YYYY-MM-DD') AS date_str,
           COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN COALESCE(NULLIF(o.total_paise, 0) / 100.0, CASE WHEN o.total_amount >= 10000 THEN o.total_amount / 100.0 ELSE o.total_amount END, 0) ELSE 0 END), 0) AS daily_revenue,
           COUNT(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN 1 END) AS daily_orders
         FROM orders o
         WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text) AND ${dateCondition}
         GROUP BY TO_CHAR(o.created_at, 'YYYY-MM-DD')
         ORDER BY date_str ASC`,
        queryParams
      ).catch(() => ({ rows: [] })),

      // 4. Product performance & top products
      query(
        `SELECT 
           p.id, p.name, p.base_price, p.view_count, p.stock_quantity,
           COUNT(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN oi.id END) AS units_sold,
           COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.payment_status, '')) = 'paid' AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested') THEN COALESCE(oi.unit_price * oi.quantity, 0) ELSE 0 END), 0) AS total_revenue
         FROM products p
         LEFT JOIN order_items oi ON oi.product_id = p.id
         LEFT JOIN orders o ON o.id = oi.order_id AND ${dateCondition}
         WHERE (p.seller_id = $1 OR p.seller_id::text = $1::text) AND p.status != 'deleted'
         GROUP BY p.id, p.name, p.base_price, p.view_count, p.stock_quantity
         ORDER BY total_revenue DESC, units_sold DESC
         LIMIT 10`,
        queryParams
      ).catch(() => ({ rows: [] })),

      // 5. Custom vs Pre-made comparison
      query(
        `SELECT 
           COUNT(CASE WHEN (LOWER(COALESCE(o.order_type, '')) IN ('custom', 'customized') OR o.customization IS NOT NULL OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (oi.customization_data IS NOT NULL AND oi.customization_data::text NOT IN ('', 'null', '{}')))) THEN 1 END) AS custom_count,
           COALESCE(SUM(CASE WHEN (LOWER(COALESCE(o.order_type, '')) IN ('custom', 'customized') OR o.customization IS NOT NULL OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (oi.customization_data IS NOT NULL AND oi.customization_data::text NOT IN ('', 'null', '{}')))) THEN COALESCE(NULLIF(o.total_paise, 0) / 100.0, CASE WHEN o.total_amount >= 10000 THEN o.total_amount / 100.0 ELSE o.total_amount END, 0) ELSE 0 END), 0) AS custom_revenue,
           COUNT(CASE WHEN (LOWER(COALESCE(o.order_type, '')) NOT IN ('custom', 'customized') AND o.customization IS NULL AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (oi.customization_data IS NOT NULL AND oi.customization_data::text NOT IN ('', 'null', '{}')))) THEN 1 END) AS premade_count,
           COALESCE(SUM(CASE WHEN (LOWER(COALESCE(o.order_type, '')) NOT IN ('custom', 'customized') AND o.customization IS NULL AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (oi.customization_data IS NOT NULL AND oi.customization_data::text NOT IN ('', 'null', '{}')))) THEN COALESCE(NULLIF(o.total_paise, 0) / 100.0, CASE WHEN o.total_amount >= 10000 THEN o.total_amount / 100.0 ELSE o.total_amount END, 0) ELSE 0 END), 0) AS premade_revenue
         FROM orders o
         WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text)
           AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
           AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested')
           AND ${dateCondition}`,
        queryParams
      ).catch(() => ({ rows: [{ custom_count: 0, custom_revenue: 0, premade_count: 0, premade_revenue: 0 }] })),

      // 6. Customer Insights (Repeat vs New Buyers & Top Cities)
      query(
        `WITH seller_buyers AS (
           SELECT o.buyer_id, COUNT(o.id) AS order_count
           FROM orders o
           WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text)
             AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
             AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested')
           GROUP BY o.buyer_id
         )
         SELECT 
           COUNT(CASE WHEN order_count > 1 THEN 1 END) AS repeat_buyers,
           COUNT(CASE WHEN order_count = 1 THEN 1 END) AS new_buyers
         FROM seller_buyers`,
        [sellerId]
      ).catch(() => ({ rows: [{ repeat_buyers: 0, new_buyers: 0 }] })),

      // 7. Top cities
      query(
        `SELECT 
           COALESCE(NULLIF(TRIM(o.shipping_address->>'city'), ''), NULLIF(TRIM(a.city), ''), 'Jaipur') AS city,
           COUNT(o.id) AS order_count,
           COALESCE(SUM(COALESCE(NULLIF(o.total_paise, 0) / 100.0, CASE WHEN o.total_amount >= 10000 THEN o.total_amount / 100.0 ELSE o.total_amount END, 0)), 0) AS revenue
         FROM orders o
         LEFT JOIN addresses a ON a.id = o.address_id
         WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text)
           AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
           AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded', 'cancel_requested')
         GROUP BY city
         ORDER BY order_count DESC, revenue DESC
         LIMIT 5`,
        [sellerId]
      ).catch(() => ({ rows: [] }))
    ]);

    const totalsRows = totalsRes.rows || [];
    const prodViews = prodViewsRes.rows || [];
    const dailyRows = dailyRes.rows || [];
    const topProducts = topProductsRes.rows || [];
    const orderTypesRows = orderTypesRes.rows || [];
    const buyerStatsRows = buyerStatsRes.rows || [];
    const locationRows = locationRes.rows || [];

    const totalRevenue = parseFloat(parseFloat(totalsRows[0]?.total_revenue || 0).toFixed(2));
    const totalOrders = parseInt(totalsRows[0]?.total_orders || 0, 10);
    const returnsCancellations = parseInt(totalsRows[0]?.returns_cancellations || 0, 10);
    const avgOrderVal = totalOrders > 0 ? parseFloat((totalRevenue / totalOrders).toFixed(2)) : 0;
    const totalViews = parseInt(prodViews[0]?.total_views || 0, 10);
    const storeVisitors = Math.max(totalViews, totalOrders);
    const conversionRate = totalOrders > 0 ? parseFloat(((totalOrders / Math.max(totalViews, totalOrders, 1)) * 100).toFixed(1)) : 0.0;

    return res.json({
      success: true,
      data: {
        period: selectedRange,
        range: selectedRange,
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        avg_order_value: avgOrderVal,
        kpis: {
          total_revenue: totalRevenue,
          total_orders: totalOrders,
          avg_order_value: avgOrderVal,
          store_visitors: storeVisitors,
          conversion_rate: conversionRate,
          returns_cancellations: returnsCancellations,
        },
        charts: {
          labels: chartLabels,
          revenue: chartRevenue,
          orders: chartOrders,
          conversion: chartConversion,
        },
        revenue_chart: {
          labels: chartLabels,
          data: chartRevenue,
        },
        orders_chart: {
          labels: chartLabels,
          data: chartOrders,
        },
        conversion_chart: {
          labels: chartLabels,
          data: chartConversion,
        },
        sales_data: dailyRows,
        product_performance: productPerformance,
        top_products: productPerformance,
        order_types: {
          custom: {
            orders_count: parseInt(orderTypesRows[0]?.custom_count || 0, 10),
            revenue: parseFloat(orderTypesRows[0]?.custom_revenue || 0),
          },
          premade: {
            orders_count: parseInt(orderTypesRows[0]?.premade_count || 0, 10),
            revenue: parseFloat(orderTypesRows[0]?.premade_revenue || 0),
          },
        },
        customer_insights: {
          repeat_buyers: parseInt(buyerStatsRows[0]?.repeat_buyers || 0, 10),
          new_buyers: parseInt(buyerStatsRows[0]?.new_buyers || 0, 10),
          top_locations: (locationRows || []).map(l => ({
            city: l.city,
            order_count: parseInt(l.order_count || 0, 10),
            revenue: parseFloat(l.revenue || 0),
          })),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/orders  — list orders scoped strictly to logged-in seller
// ---------------------------------------------------------------------------
async function getSellerOrders(req, res, next) {
  try {
    await ensureOrderItemColumns();
    const headerSellerId = req.headers['x-seller-id'] || req.headers['x-impersonate-seller-id'] || req.query.seller_id || req.query.sellerId || req.params?.sellerId;
    const userRole = String(req.user?.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'MASTER_ADMIN';
    const effectiveSellerId = (isAdmin && headerSellerId) ? headerSellerId : req.user.id;

    const { page = '1', limit = '20', status, search, period } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, parseInt(limit, 10));
    const offset   = (pageNum - 1) * limitNum;

    const { rows: sRows } = await query(
      'SELECT id, user_id FROM sellers WHERE user_id::text = $1 OR id::text = $1 UNION SELECT id, user_id FROM seller_profiles WHERE user_id::text = $1 OR id::text = $1',
      [String(effectiveSellerId)]
    ).catch(() => ({ rows: [] }));

    const validIds = Array.from(new Set([
      Number(effectiveSellerId),
      String(effectiveSellerId),
      ...sRows.flatMap(s => [Number(s.id), String(s.id), Number(s.user_id), String(s.user_id)])
    ])).filter(Boolean);

    const conditions = ['(so.seller_id::text = ANY($1::text[]) OR o.seller_id::text = ANY($1::text[]))'];
    const params = [validIds.map(String)];

    if (period && period !== 'all') {
      const p = String(period).toLowerCase().trim();
      if (p === '7d') {
        conditions.push("so.created_at >= NOW() - INTERVAL '7 days'");
      } else if (p === '30d') {
        conditions.push("so.created_at >= NOW() - INTERVAL '30 days'");
      } else if (p === '90d') {
        conditions.push("so.created_at >= NOW() - INTERVAL '90 days'");
      }
    }

    if (status && status !== 'all') {
      const st = String(status).toLowerCase().trim();
      if (st === 'in_production' || st === 'crafting' || st === 'processing') {
        conditions.push(`LOWER(so.status) IN ('in_production', 'crafting', 'processing')`);
      } else if (st === 'pending' || st === 'unfulfilled') {
        conditions.push(`LOWER(so.status) IN ('pending', 'unfulfilled', 'confirmed', 'order_placed')`);
      } else if (st === 'shipped' || st === 'dispatched') {
        conditions.push(`LOWER(so.status) IN ('shipped', 'dispatched')`);
      } else if (st === 'custom' || st === 'customized') {
        conditions.push(`(
          o.is_special = TRUE OR
          (o.customization_details IS NOT NULL AND o.customization_details::text NOT IN ('', 'null', '{}')) OR
          EXISTS (
            SELECT 1 FROM order_items oi
            WHERE (oi.seller_order_id = so.id OR oi.order_id = o.id)
              AND (
                (oi.customization_data IS NOT NULL AND oi.customization_data::text NOT IN ('', 'null', '{}')) OR
                (oi.customization_details IS NOT NULL AND oi.customization_details <> '') OR
                (oi.proof_image_url IS NOT NULL AND oi.proof_image_url <> '')
              )
          )
        )`);
      } else {
        params.push(st);
        conditions.push(`LOWER(so.status) = $${params.length}`);
      }
    }

    const isCustomFilter = req.query.custom === 'true' || req.query.customized === 'true' || req.query.is_custom === 'true' || req.query.type === 'custom' || req.query.type === 'customized';
    if (isCustomFilter && !(status && (status.toLowerCase() === 'custom' || status.toLowerCase() === 'customized'))) {
      conditions.push(`(
        o.is_special = TRUE OR
        (o.customization_details IS NOT NULL AND o.customization_details::text NOT IN ('', 'null', '{}')) OR
        EXISTS (
          SELECT 1 FROM order_items oi
          WHERE (oi.seller_order_id = so.id OR oi.order_id = o.id)
            AND (
              (oi.customization_data IS NOT NULL AND oi.customization_data::text NOT IN ('', 'null', '{}')) OR
              (oi.customization_details IS NOT NULL AND oi.customization_details <> '') OR
              (oi.proof_image_url IS NOT NULL AND oi.proof_image_url <> '')
            )
        )
      )`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const sIdx = params.length;
      conditions.push(`(
        LOWER(u.name) LIKE $${sIdx} OR
        LOWER(u.email) LIKE $${sIdx} OR
        CAST(o.id AS TEXT) LIKE $${sIdx} OR
        CAST(so.id AS TEXT) LIKE $${sIdx} OR
        LOWER(COALESCE(so.awb_number, o.tracking_id, '')) LIKE $${sIdx}
      )`);
    }

    const where = conditions.join(' AND ');
    params.push(limitNum);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `SELECT o.id AS parent_order_id, o.buyer_id, so.seller_id,
              so.subtotal AS total_amount, (so.subtotal * 100) AS total_paise,
              so.id AS id, o.order_ref, NULL AS order_type, NULL AS customization, o.customization_details AS customization_summary,
              so.status, o.payment_status, so.payout_status,
              COALESCE(so.awb_number, o.tracking_id) AS tracking_id, COALESCE(so.tracking_url, o.tracking_url) AS tracking_url,
              o.notes AS buyer_notes, o.notes, o.studio_notes,
              COALESCE(o.special_instructions, '') AS special_instructions,
              COALESCE(sp.is_admin_managed, sel.is_admin_managed, FALSE) AS is_admin_managed,
              COALESCE(sp.seller_type, sel.seller_type, 'normal') AS seller_type,
              o.is_special,
              so.delivered_at, so.created_at, o.updated_at,
              u.name AS buyer_name, u.email AS buyer_email, u.phone AS buyer_phone,
              COALESCE(NULLIF(TRIM(o.shipping_address->>'line1'), ''), NULLIF(TRIM(a.line1), '')) AS delivery_line1,
              COALESCE(NULLIF(TRIM(o.shipping_address->>'line2'), ''), NULLIF(TRIM(a.line2), '')) AS delivery_line2,
              COALESCE(NULLIF(TRIM(o.shipping_address->>'city'), ''), NULLIF(TRIM(a.city), ''), 'India') AS delivery_city,
              COALESCE(NULLIF(TRIM(o.shipping_address->>'state'), ''), NULLIF(TRIM(a.state), '')) AS delivery_state,
              COALESCE(NULLIF(TRIM(o.shipping_address->>'pincode'), ''), NULLIF(TRIM(a.pincode), '')) AS delivery_pincode,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'product_name', p.name,
                  'name', p.name,
                  'description', COALESCE(p.description, ''),
                  'quantity', oi.quantity,
                  'unit_price', COALESCE(oi.unit_price, (oi.unit_price_paise::numeric / 100.0), 0),
                  'customization_data', oi.customization_data,
                  'customization_details', oi.customization_details,
                  'variant_name', (SELECT pv.variant_name FROM product_variants pv WHERE pv.id = oi.variant_id LIMIT 1),
                  'proof_image_url', oi.proof_image_url,
                  'customization_status', oi.customization_status,
                  'image_url', (SELECT url FROM product_images pi WHERE pi.product_id = oi.product_id ORDER BY sort_order ASC LIMIT 1)
                ))
                FROM order_items oi
                LEFT JOIN products p ON p.id = oi.product_id
                WHERE oi.seller_order_id = so.id OR (oi.order_id = o.id AND (oi.seller_order_id IS NULL OR oi.seller_order_id = so.id))),
                '[]'
              ) AS items
       FROM seller_orders so
       JOIN orders o ON o.id = so.order_id
       LEFT JOIN users u ON u.id = o.buyer_id
       LEFT JOIN addresses a ON a.id = o.address_id
       LEFT JOIN seller_profiles sp ON sp.user_id = so.seller_id
       LEFT JOIN sellers sel ON sel.id = so.seller_id OR sel.user_id = so.seller_id
       WHERE ${where}
       ORDER BY so.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total
       FROM seller_orders so
       JOIN orders o ON o.id = so.order_id
       LEFT JOIN users u ON u.id = o.buyer_id
       LEFT JOIN seller_profiles sp ON sp.user_id = so.seller_id
       LEFT JOIN sellers sel ON sel.id = so.seller_id OR sel.user_id = so.seller_id
       WHERE ${where}`,
      params.slice(0, params.length - 2)
    );

    const formattedOrders = rows.map(o => {
      let items = Array.isArray(o.items) && o.items.length > 0 ? o.items : [];
      if (items.length === 0 && (o.customization_summary || o.customization)) {
        let parsedCustom = null;
        if (o.customization_summary) {
          try { parsedCustom = typeof o.customization_summary === 'string' ? JSON.parse(o.customization_summary) : o.customization_summary; } catch { parsedCustom = { summary_text: o.customization_summary }; }
        } else if (o.customization) {
          try { parsedCustom = typeof o.customization === 'string' ? JSON.parse(o.customization) : o.customization; } catch { parsedCustom = { summary_text: o.customization }; }
        }
        items = [{
          id: o.id,
          product_id: o.listing_id,
          product_name: o.product_name || 'Handcrafted Creation',
          name: o.product_name || 'Handcrafted Creation',
          description: '',
          quantity: 1,
          unit_price: o.total_amount ? (o.total_amount >= 10000 ? o.total_amount / 100.0 : parseFloat(o.total_amount)) : (o.total_paise ? o.total_paise / 100.0 : 0),
          customization_data: parsedCustom,
          customization_status: 'pending',
          image_url: null
        }];
      }

      const firstItem = items[0];
      let itemPreview = firstItem ? (firstItem.product_name || firstItem.name || o.product_name || 'Handcrafted Creation') : (o.product_name || 'Handcrafted Creation');
      if (items.length > 1) {
        itemPreview += ` + ${items.length - 1} more`;
      }
      const rawTotal = o.total_amount ? (o.total_amount >= 10000 ? o.total_amount / 100.0 : parseFloat(o.total_amount)) : (o.total_paise ? o.total_paise / 100.0 : 0);

      let studio_notes = [];
      const rawNotes = o.notes || o.studio_notes;
      if (rawNotes) {
        try {
          const parsed = JSON.parse(rawNotes);
          if (Array.isArray(parsed)) studio_notes = parsed;
          else if (typeof parsed === 'object') studio_notes = [parsed];
          else studio_notes = [{ text: String(rawNotes), ts: o.updated_at || o.created_at }];
        } catch {
          studio_notes = [{ text: String(rawNotes), ts: o.updated_at || o.created_at }];
        }
      }

      return {
        ...o,
        order_ref: o.order_ref || `TOHFA-${String(o.id).substring(0, 8).toUpperCase()}`,
        subtotal: rawTotal,
        total_amount: rawTotal,
        total_paise: Math.round(rawTotal * 100),
        item_preview: itemPreview,
        items,
        studio_notes,
        buyer_notes: o.buyer_notes || o.notes || '',
        special_instructions: o.special_instructions || '',
        is_admin_managed: Boolean(o.is_admin_managed),
        seller_type: o.seller_type || 'normal'
      };
    });

    const total = parseInt(countRows[0]?.total || 0, 10);
    const totalPages = Math.ceil(total / limitNum) || 1;

    return res.json({
      success: true,
      data: {
        orders: formattedOrders,
        total,
        page: pageNum,
        limit: limitNum,
        total_pages: totalPages,
      },
      orders: formattedOrders,
      total,
      page: pageNum,
      limit: limitNum,
      total_pages: totalPages
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/orders/:id  — full seller order details
// ---------------------------------------------------------------------------
async function getSellerOrderDetail(req, res, next) {
  try {
    await ensureOrderItemColumns();
    const { id } = req.params;
    const headerSellerId = req.headers['x-seller-id'] || req.headers['x-impersonate-seller-id'] || req.query.seller_id || req.query.sellerId;
    const userRole = String(req.user?.role || '').toUpperCase();
    const isAdmin = userRole === 'ADMIN' || userRole === 'MASTER_ADMIN';
    const effectiveSellerId = (isAdmin && headerSellerId) ? headerSellerId : req.user.id;

    // IDOR Check: Ensure order exists and belongs to this seller
    const { rows: orderCheck } = await query(
      `SELECT so.id, so.seller_id FROM seller_orders so JOIN orders o ON o.id = so.order_id WHERE so.id::text = $1 OR (o.id::text = $1 AND (so.seller_id = $2 OR so.seller_id::text = $2::text)) OR o.order_ref = $1`,
      [String(id), String(effectiveSellerId)]
    );
    if (!orderCheck.length && !isAdmin) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (!isAdmin) {
      const { rows: sRows } = await query('SELECT id, user_id FROM sellers WHERE user_id::text = $1 OR id::text = $1 UNION SELECT id, user_id FROM seller_profiles WHERE user_id::text = $1 OR id::text = $1', [String(effectiveSellerId)]);
      const validIds = [Number(effectiveSellerId), String(effectiveSellerId), ...sRows.flatMap(s => [s.id, s.user_id, Number(s.id), String(s.id), Number(s.user_id), String(s.user_id)])];
      if (!validIds.includes(orderCheck[0].seller_id) && !validIds.includes(Number(orderCheck[0].seller_id)) && !validIds.includes(String(orderCheck[0].seller_id))) {
        return res.status(403).json({ success: false, message: 'Forbidden: You do not have ownership of this order.' });
      }
    }

    const { rows } = await query(
      `SELECT o.id AS parent_order_id, so.id AS id, o.buyer_id, so.seller_id, o.address_id, so.subtotal AS total_amount, so.status, o.payment_status,
              so.payout_status, COALESCE(so.awb_number, o.tracking_id) AS tracking_id, COALESCE(so.tracking_url, o.tracking_url) AS tracking_url,
              o.notes AS buyer_notes, o.notes, o.studio_notes,
              COALESCE(o.special_instructions, '') AS special_instructions,
              COALESCE(sp.is_admin_managed, sel.is_admin_managed, FALSE) AS is_admin_managed,
              COALESCE(sp.seller_type, sel.seller_type, 'normal') AS seller_type,
              o.is_special,
              so.delivered_at, so.created_at, o.updated_at,
              u.name AS buyer_name, u.email AS buyer_email, u.phone AS buyer_phone,
              sp.store_name, sp.whatsapp_number AS seller_whatsapp, sp.pickup_address,
              a.name AS recipient_name, a.phone AS recipient_phone,
              a.line1 AS delivery_line1, a.line2 AS delivery_line2, a.city AS delivery_city,
              a.state AS delivery_state, a.pincode AS delivery_pincode,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'product_name', p.name,
                  'name', p.name,
                  'description', COALESCE(p.description, ''),
                  'quantity', oi.quantity,
                  'unit_price', COALESCE(oi.unit_price, (oi.unit_price_paise::numeric / 100.0), 0),
                  'customization_data', oi.customization_data,
                  'customization_details', oi.customization_details,
                  'variant_name', (SELECT pv.variant_name FROM product_variants pv WHERE pv.id = oi.variant_id LIMIT 1),
                  'proof_image_url', oi.proof_image_url,
                  'customization_status', oi.customization_status,
                  'image_url', (SELECT url FROM product_images pi WHERE pi.product_id = oi.product_id ORDER BY sort_order ASC LIMIT 1)
                ))
                FROM order_items oi
                LEFT JOIN products p ON p.id = oi.product_id
                WHERE oi.seller_order_id = so.id OR (oi.order_id = o.id AND (oi.seller_order_id IS NULL OR oi.seller_order_id = so.id))),
                '[]'
              ) AS items
       FROM seller_orders so
       JOIN orders o ON o.id = so.order_id
       LEFT JOIN users u ON u.id = o.buyer_id
       LEFT JOIN seller_profiles sp ON sp.user_id = so.seller_id
       LEFT JOIN sellers sel ON sel.id = so.seller_id OR sel.user_id = so.seller_id
       LEFT JOIN addresses a ON a.id = o.address_id
       WHERE so.id::text = $1 OR (o.id::text = $1 AND (so.seller_id = $2 OR so.seller_id::text = $2::text)) OR o.order_ref = $1`,
      [String(id), String(effectiveSellerId)]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = rows[0];
    let items = Array.isArray(order.items) && order.items.length > 0 ? order.items : [];
    if (items.length === 0 && (order.customization_summary || order.customization)) {
      let parsedCustom = null;
      if (order.customization_summary) {
        try { parsedCustom = typeof order.customization_summary === 'string' ? JSON.parse(order.customization_summary) : order.customization_summary; } catch { parsedCustom = { summary_text: order.customization_summary }; }
      } else if (order.customization) {
        try { parsedCustom = typeof order.customization === 'string' ? JSON.parse(order.customization) : order.customization; } catch { parsedCustom = { summary_text: order.customization }; }
      }
      items = [{
        id: order.id,
        product_id: order.listing_id,
        product_name: order.product_name || 'Handcrafted Creation',
        name: order.product_name || 'Handcrafted Creation',
        description: '',
        quantity: 1,
        unit_price: order.total_amount ? (order.total_amount >= 10000 ? order.total_amount / 100.0 : parseFloat(order.total_amount)) : (order.total_paise ? order.total_paise / 100.0 : 0),
        customization_data: parsedCustom,
        customization_status: 'pending',
        image_url: null
      }];
    }
    const firstItem = items[0];

    const orderRef = `TOHFA-${String(order.id).substring(0, 8).toUpperCase()}`;
    const addressParts = [
      order.delivery_line1,
      order.delivery_line2,
      order.delivery_city,
      order.delivery_state,
      order.delivery_pincode ? `PIN: ${order.delivery_pincode}` : ''
    ].filter(Boolean);
    const buyerAddressStr = addressParts.length > 0 ? addressParts.join(', ') : 'No shipping address provided.';

    // Tracking events synthesis
    const tracking_events = [];
    if (order.created_at) {
      tracking_events.push({ status: 'awaiting_payment', occurred_at: order.created_at });
    }
    if (['confirmed', 'processing', 'in_production', 'crafting', 'packed', 'shipped', 'dispatched', 'delivered'].includes(order.status)) {
      tracking_events.push({ status: 'processing', occurred_at: order.created_at });
    }
    if (['in_production', 'crafting', 'packed', 'shipped', 'dispatched', 'delivered'].includes(order.status)) {
      tracking_events.push({ status: 'in_production', occurred_at: order.updated_at || order.created_at });
    }
    if (['packed', 'shipped', 'dispatched', 'delivered'].includes(order.status)) {
      tracking_events.push({ status: 'packed', occurred_at: order.updated_at || order.created_at });
    }
    if (['shipped', 'dispatched', 'delivered'].includes(order.status)) {
      tracking_events.push({ status: 'dispatched', occurred_at: order.updated_at || order.created_at });
    }
    if (order.status === 'delivered') {
      tracking_events.push({ status: 'delivered', occurred_at: order.delivered_at || order.updated_at || order.created_at });
    }

    // Customization details extraction
    let customizationDetails = null;
    const firstItemCustom = items.find(it => it.customization_data && (typeof it.customization_data === 'string' ? it.customization_data.trim().length > 0 : Object.keys(it.customization_data).length > 0));
    if (firstItemCustom && firstItemCustom.customization_data) {
      const cd = firstItemCustom.customization_data;
      if (typeof cd === 'string') {
        customizationDetails = cd;
      } else if (typeof cd === 'object') {
        customizationDetails = Object.entries(cd)
          .filter(([_, v]) => v != null && v !== '')
          .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(', ');
      }
    } else if (order.notes) {
      customizationDetails = order.notes;
    }

    // Studio notes extraction
    let studio_notes = [];
    const rawNotes = order.notes || order.studio_notes;
    if (rawNotes) {
      try {
        const parsed = JSON.parse(rawNotes);
        if (Array.isArray(parsed)) studio_notes = parsed;
        else if (typeof parsed === 'object') studio_notes = [parsed];
        else studio_notes = [{ text: String(rawNotes), ts: order.updated_at || order.created_at }];
      } catch {
        studio_notes = [{ text: String(rawNotes), ts: order.updated_at || order.created_at }];
      }
    }

    const deadlineAt = new Date(new Date(order.created_at || Date.now()).getTime() + 2 * 86400000).toISOString();
    const estimatedDelivery = new Date(new Date(order.created_at || Date.now()).getTime() + 5 * 86400000).toISOString();

    const formattedOrder = {
      ...order,
      id: order.id,
      internal_id: order.id,
      order_id: orderRef,
      order_ref: orderRef,
      order_date: order.created_at,
      fulfillment_status: order.status,
      buyer_name: order.buyer_name || order.recipient_name || 'Artisan Patron',
      buyer_phone: order.buyer_phone || order.recipient_phone || '',
      buyer_address: buyerAddressStr,
      subtotal: parseFloat(order.total_amount || 0),
      total_paise: Math.round(parseFloat(order.total_amount || 0) * 100),
      deadline_at: deadlineAt,
      estimated_delivery: estimatedDelivery,
      tracking_number: order.tracking_id,
      tracking_id: order.tracking_id,
      tracking_url: order.tracking_url,
      tracking_events,
      studio_notes,
      items,
      item_title: firstItem ? (firstItem.product_name || firstItem.name || 'Handcrafted Creation') : 'Handcrafted Creation',
      item_photo_url: firstItem ? firstItem.image_url : null,
      item_image: firstItem ? firstItem.image_url : null,
      product_id_display: firstItem && firstItem.product_id ? String(firstItem.product_id).substring(0, 8).toUpperCase() : null,
      quantity: firstItem ? firstItem.quantity : 1,
      customization_details: customizationDetails,
      proof_image_url: firstItem ? firstItem.proof_image_url : null,
      customization_status: firstItem ? firstItem.customization_status : null,
      buyer_notes: order.buyer_notes || order.notes || '',
      special_instructions: order.special_instructions || '',
      is_admin_managed: Boolean(order.is_admin_managed),
      seller_type: order.seller_type || 'normal',
      shipping_address: {
        recipient_name: order.recipient_name || order.buyer_name,
        phone: order.recipient_phone || order.buyer_phone,
        line1: order.delivery_line1,
        line2: order.delivery_line2,
        city: order.delivery_city,
        state: order.delivery_state,
        pincode: order.delivery_pincode,
        formatted: buyerAddressStr,
      },
    };

    return res.json({
      success: true,
      data: {
        ...formattedOrder,
        order: formattedOrder,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/seller/orders/:id/status  — update order lifecycle state
// ---------------------------------------------------------------------------
async function updateSellerOrderStatus(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = req.user.role;
    const { status } = req.body;

    const allowed = ['pending', 'confirmed', 'crafting', 'packed', 'shipped', 'delivered', 'cancelled', 'cancel_requested'];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${allowed.join(', ')}.`,
      });
    }

    const VALID_TRANSITIONS = {
      pending: ['confirmed', 'crafting', 'cancelled'],
      confirmed: ['crafting', 'packed', 'shipped', 'cancelled', 'cancel_requested'],
      crafting: ['packed', 'shipped', 'cancelled'],
      packed: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: [], // Terminal state
      cancelled: [], // Terminal state
      cancel_requested: ['cancelled', 'confirmed'],
    };

    // Fetch existing order & check IDOR
    const { rows: orderCheck } = await query('SELECT * FROM orders WHERE id::text = $1 OR order_ref = $1', [String(id)]);
    if (!orderCheck.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    const isAdmin = role === 'admin' || role === 'master_admin';
    if (!isAdmin) {
      const { rows: sRows } = await query('SELECT id FROM sellers WHERE user_id = $1', [sellerId]);
      const validIds = [Number(sellerId), String(sellerId), ...sRows.map(s => s.id), ...sRows.map(s => String(s.id))];
      if (!validIds.includes(orderCheck[0].seller_id) && !validIds.includes(Number(orderCheck[0].seller_id)) && !validIds.includes(String(orderCheck[0].seller_id))) {
        return res.status(403).json({ success: false, message: 'Forbidden: You do not have ownership of this order.' });
      }
    }

    const currentOrder = orderCheck[0];
    const currentStatus = String(currentOrder.status || '').toLowerCase();
    const targetStatus = String(status || '').toLowerCase();
    const isStatusChange = currentStatus !== targetStatus;
    const isNoteOnly = Boolean(req.body.studio_note && !isStatusChange);

    // Validate state transition if not admin and not a note-only update
    if (role !== 'admin' && role !== 'master_admin' && !isNoteOnly) {
      const allowedNext = VALID_TRANSITIONS[currentOrder.status] || VALID_TRANSITIONS[currentStatus] || [];
      if (!allowedNext.includes(targetStatus)) {
        return res.status(400).json({
          success: false,
          message: `Cannot transition order status from "${currentOrder.status}" to "${status}". Valid transitions are: ${allowedNext.join(', ') || 'none (terminal state)'}.`,
        });
      }
    }

    let updateQuery = `UPDATE orders
                       SET status = $1,
                           delivered_at = CASE WHEN LOWER($1) = 'delivered' THEN NOW() ELSE delivered_at END,
                           updated_at = NOW()`;
    let queryParams = [status];

    if (req.body.studio_note) {
      let existingNotes = [];
      const rawNotes = currentOrder.notes || currentOrder.studio_notes;
      try {
        const p = JSON.parse(rawNotes);
        if (Array.isArray(p)) existingNotes = p;
        else if (rawNotes) existingNotes = [{ text: String(rawNotes), ts: currentOrder.created_at }];
      } catch {
        if (rawNotes) existingNotes = [{ text: String(rawNotes), ts: currentOrder.created_at }];
      }
      existingNotes.push({ text: req.body.studio_note, ts: new Date().toISOString() });
      const serializedNotes = JSON.stringify(existingNotes);
      queryParams.push(serializedNotes);
      updateQuery += `, notes = $${queryParams.length}, studio_notes = $${queryParams.length}`;
    }

    if (req.body.tracking_id || req.body.tracking_number) {
      const trk = req.body.tracking_id || req.body.tracking_number;
      queryParams.push(trk);
      updateQuery += `, tracking_id = $${queryParams.length}`;
    }

    queryParams.push(id);
    updateQuery += ` WHERE id = $${queryParams.length} RETURNING *`;

    const { rows } = await query(updateQuery, queryParams);

    const order = rows[0];

    // If cancelled, restock product inventory (only when status actually changes to cancelled)
    if (isStatusChange && targetStatus === 'cancelled') {
      const { rows: itemRows } = await query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
        [id]
      );
      for (const item of itemRows) {
        await query(
          'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }
    }

    // Notify buyer only if the status actually changed
    const statusMessages = {
      confirmed: 'Your handcrafted gift order has been confirmed by the artisan.',
      crafting: 'The artisan has begun handcrafting your bespoke creation!',
      packed: 'Your order is packed and ready for courier pickup.',
      shipped: 'Your order is on the way! 🚚',
      delivered: 'Your handcrafted creation has been delivered. Enjoy!',
      cancelled: 'Your order has been cancelled.',
    };

    if (isStatusChange && order.buyer_id) {
      await createNotification(
        order.buyer_id,
        'order_status',
        `Order ${status.replace('_', ' ').toUpperCase()}`,
        statusMessages[status] || `Your order status is now ${status}.`,
        { order_id: id, status }
      ).catch(e => console.warn('[Order Status] Notification trigger failed:', e.message));
    }

    const responseMsg = isNoteOnly
      ? 'Studio note saved.'
      : `Order status updated to ${status}.`;

    return res.json({
      success: true,
      message: responseMsg,
      data: {
        ...order,
        order,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// POST /api/seller/orders/custom-proof  — upload artisan proof of work (CHK-29)
// ---------------------------------------------------------------------------
async function uploadCustomProof(req, res, next) {
  try {
    await ensureOrderItemColumns();
    const sellerId = req.user.id;
    const orderId = req.body.orderId || req.body.sellerOrderId || req.body.order_id || req.params.id;
    const proofUrl = req.body.proofImageUrl || req.body.proof_image_url || req.body.proofUrl || req.body.url;
    const orderItemId = req.body.order_item_id || req.body.orderItemId;
    const notes = req.body.notes || '';

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId or sellerOrderId is required.' });
    }
    if (!proofUrl) {
      return res.status(400).json({ success: false, message: 'proofImageUrl is required.' });
    }

    // Verify order or sub-order belongs to seller
    const { rows: orderRows } = await query(
      `SELECT o.id AS parent_order_id, o.buyer_id, COALESCE(so.seller_id, o.seller_id) AS seller_id,
              o.status AS parent_status, so.id AS sub_order_id
       FROM orders o
       LEFT JOIN seller_orders so ON so.order_id = o.id AND so.seller_id = $2
       WHERE (o.id = $1 OR so.id = $1)
         AND (o.seller_id = $2 OR so.seller_id = $2)
       LIMIT 1`,
      [orderId, sellerId]
    );

    if (!orderRows.length) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
    }

    const order = orderRows[0];
    const parentId = order.parent_order_id;
    const subId = order.sub_order_id || orderId;

    // Update order items with proof_image_url and customization_status = 'proof_uploaded'
    let updatedItemRows;
    if (orderItemId) {
      const { rows } = await query(
        `UPDATE order_items
         SET proof_image_url = $1, customization_status = 'proof_uploaded',
             customization_data = COALESCE(customization_data, '{}'::jsonb) || jsonb_build_object('proof_image_url', $1::text, 'customization_status', 'proof_uploaded', 'proof_notes', $2::text, 'proof_uploaded_at', NOW())
         WHERE id = $3 AND (order_id = $4 OR seller_order_id = $5)
         RETURNING *`,
        [proofUrl, notes, orderItemId, parentId, subId]
      );
      updatedItemRows = rows;
    } else {
      const { rows } = await query(
        `UPDATE order_items
         SET proof_image_url = $1, customization_status = 'proof_uploaded',
             customization_data = COALESCE(customization_data, '{}'::jsonb) || jsonb_build_object('proof_image_url', $1::text, 'customization_status', 'proof_uploaded', 'proof_notes', $2::text, 'proof_uploaded_at', NOW())
         WHERE order_id = $3 OR seller_order_id = $4
         RETURNING *`,
        [proofUrl, notes, parentId, subId]
      );
      updatedItemRows = rows;
    }

    await query(
      `UPDATE orders SET updated_at = NOW() WHERE id = $1`,
      [parentId]
    ).catch(() => {});

    // Notify buyer
    if (order.buyer_id) {
      await createNotification(
        order.buyer_id,
        'custom_proof_uploaded',
        'Design Proof Ready for Review 🎨',
        'The artisan has uploaded a design proof for your customized gift. Please review and approve.',
        {
          order_id: parentId,
          seller_order_id: subId,
          proof_image_url: proofUrl,
          link_url: `/buyer/order-detail.html?id=${parentId}`,
        }
      ).catch(e => console.warn('[Custom Proof] Notification trigger failed:', e.message));
    }

    return res.json({
      success: true,
      message: 'Design proof uploaded successfully and buyer notified.',
      data: {
        order_id: parentId,
        seller_order_id: subId,
        proof_image_url: proofUrl,
        items: updatedItemRows,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/wallet — read wallet balance & reconcile with wallets table (Bug Audit Phase 2)
// ---------------------------------------------------------------------------
async function getSellerWallet(req, res, next) {
  try {
    const userId = req.user.id;

    // Find seller ID
    const { rows: sellerRows } = await query(
      'SELECT id, user_id FROM sellers WHERE user_id = $1 UNION SELECT id, user_id FROM seller_profiles WHERE user_id = $1',
      [userId]
    );

    const sellerId = sellerRows[0]?.id || userId;

    // Query or auto-initialize wallet
    let { rows } = await query(
      'SELECT * FROM wallets WHERE seller_id = $1 OR user_id = $2',
      [sellerId, userId]
    );

    if (!rows.length) {
      try {
        const initRes = await query(
          `INSERT INTO wallets (seller_id, user_id, balance, holding_balance, currency)
           VALUES ($1, $2, 0.00, 0.00, 'INR')
           ON CONFLICT (seller_id) DO UPDATE SET updated_at = NOW()
           RETURNING *`,
          [sellerId, userId]
        );
        rows = initRes.rows;
      } catch (initErr) {
        console.warn('[getSellerWallet] Auto-insert wallet notice:', initErr.message);
      }
    }

    const wallet = rows[0];

    if (!wallet) {
      return res.json({
        success: true,
        data: {
          wallet: {
            balance: 0,
            holding_balance: 0,
            currency: 'INR',
            seller_id: sellerId,
            status: 'not_initialized'
          },
          balance: 0,
          holding_balance: 0,
          currency: 'INR',
          seller_id: sellerId,
          updated_at: new Date().toISOString()
        }
      });
    }

    // Compute live holding & available balances to keep wallet in sync
    const { rows: liveAvail } = await query(
      `SELECT
         COALESCE(SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0), 0) AS available_balance
       FROM orders o
       WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.status, '')) = 'delivered'
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         AND o.created_at <= NOW() - INTERVAL '7 days'`,
      [sellerId]
    ).catch(() => ({ rows: [{ available_balance: 0 }] }));

    const { rows: liveHold } = await query(
      `SELECT
         COALESCE(SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0), 0) AS holding_balance
       FROM orders o
       WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         AND (
           LOWER(COALESCE(o.status, '')) IN ('pending', 'confirmed', 'processing', 'crafting', 'packed', 'shipped', 'in_production')
           OR (LOWER(COALESCE(o.status, '')) = 'delivered' AND o.created_at > NOW() - INTERVAL '7 days')
         )`,
      [sellerId]
    ).catch(() => ({ rows: [{ holding_balance: 0 }] }));

    const availableBal = parseFloat(liveAvail[0]?.available_balance || wallet.balance || 0);
    const holdingBal = parseFloat(liveHold[0]?.holding_balance || wallet.holding_balance || 0);

    // Sync back to wallets table
    await query(
      'UPDATE wallets SET balance = $1, holding_balance = $2, updated_at = NOW() WHERE id = $3',
      [availableBal, holdingBal, wallet.id]
    ).catch(() => {});

    return res.json({
      success: true,
      data: {
        wallet: {
          ...wallet,
          balance: availableBal,
          holding_balance: holdingBal
        },
        balance: availableBal,
        holding_balance: holdingBal,
        currency: wallet.currency || 'INR',
        seller_id: wallet.seller_id,
        updated_at: wallet.updated_at,
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/payouts  — payouts & 7-day escrow balance breakdown (CHK-40)
// ---------------------------------------------------------------------------
async function getPayoutOverview(req, res, next) {
  try {
    const sellerId = req.user.id;
    await ensurePayoutTables();

    // Available / Eligible balance: orders delivered > 7 days ago and not yet disbursed
    const { rows: availableRows } = await query(
      `SELECT
         COALESCE(SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0), 0) AS available_balance,
         COUNT(o.id) AS eligible_count
       FROM orders o
       WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.status, '')) = 'delivered'
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         AND o.created_at <= NOW() - INTERVAL '7 days'`,
      [sellerId]
    ).catch(() => ({ rows: [{ available_balance: 0, eligible_count: 0 }] }));

    // Holding / Unsettled balance: orders in progress or delivered within the 7-day escrow window
    const { rows: holdingRows } = await query(
      `SELECT
         COALESCE(SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0), 0) AS holding_balance,
         COUNT(o.id) AS holding_count
       FROM orders o
       WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         AND (
           LOWER(COALESCE(o.status, '')) IN ('pending', 'confirmed', 'processing', 'crafting', 'packed', 'shipped', 'in_production')
           OR (LOWER(COALESCE(o.status, '')) = 'delivered' AND o.created_at > NOW() - INTERVAL '7 days')
         )`,
      [sellerId]
    ).catch(() => ({ rows: [{ holding_balance: 0, holding_count: 0 }] }));

    // Completed payouts
    const { rows: completedRows } = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid_out
       FROM seller_payouts
       WHERE (seller_id = $1 OR seller_id::text = $1::text)
         AND LOWER(status) IN ('paid', 'completed')`,
      [sellerId]
    ).catch(async () => {
      return await query(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid_out
         FROM payouts
         WHERE (seller_id = $1 OR seller_id::text = $1::text)
           AND LOWER(status) IN ('paid', 'completed')`,
        [sellerId]
      ).catch(() => ({ rows: [{ total_paid_out: 0 }] }));
    });

    // Payout records history
    const { rows: payoutList } = await query(
      `SELECT id, amount, status, utr_number, reference, disbursed_at, created_at
       FROM seller_payouts
       WHERE (seller_id = $1 OR seller_id::text = $1::text)
       ORDER BY created_at DESC`,
      [sellerId]
    ).catch(async () => {
      return await query(
        `SELECT id, amount, status, reference_id AS reference, initiated_at, completed_at, initiated_at AS created_at
         FROM payouts
         WHERE (seller_id = $1 OR seller_id::text = $1::text)
         ORDER BY id DESC`,
        [sellerId]
      ).catch(() => ({ rows: [] }));
    });

    // Total, month, week calculations
    const { rows: periodRows } = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN o.created_at >= DATE_TRUNC('month', NOW()) THEN COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0 ELSE 0 END), 0) AS month_earned,
         COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '7 days' THEN COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0 ELSE 0 END), 0) AS week_earned,
         COALESCE(SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0), 0) AS total_earned
       FROM orders o
       WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'`,
      [sellerId]
    ).catch(() => ({ rows: [{ month_earned: 0, week_earned: 0, total_earned: 0 }] }));

    const totalPaidOut = parseFloat(completedRows[0]?.total_paid_out || 0);
    const grossAvailable = parseFloat(availableRows[0]?.available_balance || 0);
    const availableBalance = Math.max(0, grossAvailable - totalPaidOut);
    const holdingBalance = parseFloat(holdingRows[0]?.holding_balance || 0);
    const totalEarned = parseFloat(periodRows[0]?.total_earned || 0);
    const monthEarned = parseFloat(periodRows[0]?.month_earned || 0);
    const weekEarned = parseFloat(periodRows[0]?.week_earned || 0);

    const availableBalancePaise = Math.round(availableBalance * 100);
    const holdingBalancePaise = Math.round(holdingBalance * 100);
    const totalPaidOutPaise = Math.round(totalPaidOut * 100);
    const totalEarnedPaise = Math.round(totalEarned * 100);
    const monthEarnedPaise = Math.round(monthEarned * 100);
    const weekEarnedPaise = Math.round(weekEarned * 100);

    return res.json({
      success: true,
      data: {
        availableBalance,
        pendingBalance: holdingBalance,
        eligible_balance: availableBalancePaise,
        holding_balance: holdingBalancePaise,
        total_paid_out: totalPaidOutPaise,
        total_earned: totalEarnedPaise,
        this_month_earned: monthEarnedPaise,
        this_week_earned: weekEarnedPaise,
        on_hold_amount: holdingBalancePaise,
        available_balance_inr: availableBalance,
        holding_balance_inr: holdingBalance,
        total_paid_out_inr: totalPaidOut,
        total_earned_inr: totalEarned,
        this_month_earned_inr: monthEarned,
        this_week_earned_inr: weekEarned,
        eligible_orders_count: parseInt(availableRows[0]?.eligible_count || 0, 10),
        holding_orders_count: parseInt(holdingRows[0]?.holding_count || 0, 10),
        escrow_holding_days: 7,
        history: payoutList,
        payouts: payoutList,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/earnings & GET /api/seller/earnings
// ---------------------------------------------------------------------------
async function getSellerEarnings(req, res, next) {
  return getPayoutOverview(req, res, next);
}

// ---------------------------------------------------------------------------
// GET /api/payments/earnings/graph & GET /api/seller/earnings/graph
// ---------------------------------------------------------------------------
async function getSellerEarningsGraph(req, res, next) {
  try {
    const sellerId = req.user.id;
    const range = req.query.range || '7d';
    let days = 7;
    if (range === '30d') days = 30;
    if (range === '3m' || range === '90d') days = 90;

    const { rows } = await query(
      `SELECT 
         TO_CHAR(o.created_at, 'YYYY-MM-DD') AS date_str,
         SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0) AS total_day_amount
       FROM orders o
       WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         AND o.created_at >= NOW() - ($2 || ' days')::INTERVAL
       GROUP BY TO_CHAR(o.created_at, 'YYYY-MM-DD')
       ORDER BY date_str ASC`,
      [sellerId, days]
    ).catch(() => ({ rows: [] }));

    const map = {};
    (rows || []).forEach(r => {
      map[r.date_str] = parseFloat(r.total_day_amount || 0);
    });

    const result = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        amount: map[dateStr] || 0,
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/receiving-details & GET /api/seller/receiving-details
// ---------------------------------------------------------------------------
async function getReceivingDetails(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { rows } = await query(
      `SELECT sp.bank_details, s.bank_details AS s_bank_details
       FROM seller_profiles sp
       LEFT JOIN sellers s ON s.user_id = sp.user_id
       WHERE (sp.user_id = $1 OR sp.user_id::text = $1::text)`,
      [sellerId]
    ).catch(() => ({ rows: [] }));
    const normalized = normalizeBankDetails(rows[0]?.bank_details, rows[0]?.s_bank_details || {});
    return res.json({
      success: true,
      data: {
        bank: normalized.account_number ? {
          account_holder_name: normalized.account_holder_name || '',
          bank_name: normalized.bank_name || '',
          account_number: normalized.account_number || '',
          ifsc_code: normalized.ifsc_code || '',
        } : null,
        upi: normalized.upi_id ? {
          account_holder_name: normalized.account_holder_name || '',
          upi_id: normalized.upi_id || '',
        } : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/receiving-details & POST /api/seller/receiving-details
// ---------------------------------------------------------------------------
async function saveReceivingDetails(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { type, account_holder_name, bank_name, account_number, ifsc_code, upi_id } = req.body;

    const { rows } = await query(
      `SELECT sp.bank_details, s.bank_details AS s_bank_details
       FROM seller_profiles sp
       LEFT JOIN sellers s ON s.user_id = sp.user_id
       WHERE (sp.user_id = $1 OR sp.user_id::text = $1::text)`,
      [sellerId]
    ).catch(() => ({ rows: [] }));
    let currentBd = normalizeBankDetails(rows[0]?.bank_details, rows[0]?.s_bank_details || {});

    if (type === 'BANK') {
      if (!account_holder_name || !bank_name || !account_number || !ifsc_code) {
        return res.status(400).json({ success: false, message: 'All bank account fields are required.' });
      }
      currentBd = normalizeBankDetails({
        ...currentBd,
        account_holder_name: String(account_holder_name).trim(),
        bank_name: String(bank_name).trim(),
        account_number: String(account_number).trim(),
        ifsc_code: String(ifsc_code).toUpperCase().trim(),
      });
    } else if (type === 'UPI') {
      if (!account_holder_name || !upi_id) {
        return res.status(400).json({ success: false, message: 'UPI holder name and UPI ID are required.' });
      }
      currentBd = normalizeBankDetails({
        ...currentBd,
        account_holder_name: currentBd.account_holder_name || String(account_holder_name).trim(),
        upi_id: String(upi_id).trim(),
      });
      currentBd.upi = {
        account_holder_name: String(account_holder_name).trim(),
        upi_id: String(upi_id).trim(),
      };
    }

    await query(
      `UPDATE seller_profiles SET bank_details = $1, updated_at = NOW() WHERE (user_id = $2 OR user_id::text = $2::text)`,
      [JSON.stringify(currentBd), sellerId]
    );
    await query(
      `UPDATE sellers SET bank_details = $1, updated_at = NOW() WHERE (user_id = $2 OR user_id::text = $2::text)`,
      [JSON.stringify(currentBd), sellerId]
    ).catch(() => {});

    return res.json({
      success: true,
      message: 'Settlement receiving details updated successfully.',
      data: currentBd,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/history/all & GET /api/seller/payouts/history
// ---------------------------------------------------------------------------
async function getPaymentHistory(req, res, next) {
  try {
    const sellerId = req.user.id;
    const limit = parseInt(req.query.limit || '20', 10);
    await ensurePayoutTables();

    const { rows: payoutRows } = await query(
      `SELECT id, amount, status, reference, utr_number,
              COALESCE(disbursed_at, created_at) AS date,
              COALESCE(reference, 'Payout Settlement') AS buyer_name
       FROM seller_payouts
       WHERE (seller_id = $1 OR seller_id::text = $1::text)
       ORDER BY created_at DESC
       LIMIT $2`,
      [sellerId, limit]
    ).catch(() => ({ rows: [] }));

    const { rows: orderRows } = await query(
      `SELECT o.id, ROUND(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0, 2) AS amount,
              'settled' AS status,
              COALESCE(o.order_ref, 'TOHFA-' || o.id::text) AS reference,
              COALESCE(u.name, 'Artisan Patron') AS buyer_name,
              o.created_at AS date
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_id
       WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [sellerId, limit]
    ).catch(() => ({ rows: [] }));

    const items = [...payoutRows, ...orderRows]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);

    return res.json({
      success: true,
      data: {
        items,
        total: items.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/tax & GET /api/seller/tax
// ---------------------------------------------------------------------------
async function getTaxSettings(req, res, next) {
  try {
    const sellerId = req.user.id;
    await ensureTaxColumns();
    const { rows } = await query(
      `SELECT tax_details, gst_number, pan_number, billing_address, store_name
       FROM seller_profiles
       WHERE (user_id = $1 OR user_id::text = $1::text)`,
      [sellerId]
    ).catch(() => ({ rows: [] }));
    const row = rows[0] || {};
    const tax = (row.tax_details && typeof row.tax_details === 'object') ? row.tax_details : {};
    const billing = normalizeBillingAddress(row.billing_address, row);
    const gstin = tax.gstin || row.gst_number || billing.gstin || '';
    const pan = tax.pan_number || row.pan_number || billing.pan || '';
    return res.json({
      success: true,
      data: {
        legal_business_name: tax.legal_business_name || billing.legal_business_name || row.store_name || '',
        is_gst_registered: Boolean(tax.is_gst_registered || gstin),
        gstin,
        pan_number: pan,
        tds_applicable: !!tax.tds_applicable,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/payments/tax & POST /api/seller/tax
// ---------------------------------------------------------------------------
async function saveTaxSettings(req, res, next) {
  try {
    const sellerId = req.user.id;
    await ensureTaxColumns();
    const { is_gst_registered, gstin, pan_number, tds_applicable, legal_business_name } = req.body;
    const cleanGst = is_gst_registered ? String(gstin || '').toUpperCase().trim() : '';
    const cleanPan = String(pan_number || '').toUpperCase().trim();
    if (cleanGst && !isValidGstin(cleanGst)) {
      return res.status(400).json({ success: false, message: 'Invalid GSTIN format.' });
    }
    if (cleanPan && !isValidPan(cleanPan)) {
      return res.status(400).json({ success: false, message: 'Invalid PAN format.' });
    }
    const taxPayload = {
      legal_business_name: String(legal_business_name || '').trim() || undefined,
      is_gst_registered: !!is_gst_registered,
      gstin: cleanGst,
      pan_number: cleanPan,
      tds_applicable: !!tds_applicable,
      updated_at: new Date().toISOString(),
    };
    await query(
      `UPDATE seller_profiles
       SET tax_details = $1,
           gst_number = COALESCE(NULLIF($2, ''), gst_number),
           pan_number = COALESCE(NULLIF($3, ''), pan_number),
           updated_at = NOW()
       WHERE (user_id = $4 OR user_id::text = $4::text)`,
      [JSON.stringify(taxPayload), cleanGst || null, cleanPan || null, sellerId]
    );
    return res.json({
      success: true,
      message: 'Tax settings updated successfully.',
      data: taxPayload,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/invoices/all & GET /api/seller/invoices
// ---------------------------------------------------------------------------
async function getSellerInvoices(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { rows } = await query(
      `SELECT 
         TO_CHAR(o.created_at, 'YYYY-MM') AS month_key,
         TO_CHAR(o.created_at, 'Month YYYY') AS month_name,
         COUNT(o.id) AS total_orders,
         SUM(COALESCE(o.total_paise, o.total_amount * 100, 0) / 100.0) AS gross_sales,
         ROUND(SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0), 2) AS net_payout
       FROM orders o
       WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
       GROUP BY TO_CHAR(o.created_at, 'YYYY-MM'), TO_CHAR(o.created_at, 'Month YYYY')
       ORDER BY month_key DESC`,
      [sellerId]
    ).catch(() => ({ rows: [] }));

    const invoices = (rows || []).map(r => ({
      id: `INV-${(r.month_key || '').replace('-', '')}`,
      month_name: (r.month_name || '').trim(),
      month_key: r.month_key,
      total_orders: parseInt(r.total_orders, 10),
      gross_sales: parseFloat(r.gross_sales || 0),
      amount: parseFloat(r.net_payout || 0),
      status: 'GENERATED',
    }));

    return res.json({
      success: true,
      data: invoices,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/disputes/all & GET /api/seller/disputes
// ---------------------------------------------------------------------------
async function getSellerDisputes(req, res, next) {
  try {
    const sellerId = req.user.id;
    const { rows } = await query(
      `SELECT 
         rr.id,
         CASE 
           WHEN LOWER(rr.status) = 'pending' THEN 'OPEN'
           WHEN LOWER(rr.status) = 'approved' THEN 'ACCEPTED'
           ELSE 'RESOLVED'
         END AS status,
         rr.amount,
         rr.reason,
         COALESCE(o.order_ref, 'TOHFA-' || rr.order_id::text) AS order_ref,
         COALESCE(u.name, 'Artisan Patron') AS buyer_name,
         rr.created_at
       FROM refund_requests rr
       LEFT JOIN orders o ON o.id = rr.order_id
       LEFT JOIN users u ON u.id = rr.buyer_id
       WHERE (rr.seller_id = $1 OR rr.seller_id::text = $1::text)
       ORDER BY rr.created_at DESC`,
      [sellerId]
    ).catch(() => ({ rows: [] }));

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/seller/payouts/request  — request payout withdrawal
// ---------------------------------------------------------------------------
async function requestPayout(req, res, next) {
  try {
    const sellerId = req.user.id;
    await ensurePayoutTables();

    // Verify consolidated bank/payout details from Settings > Profile
    const { rows: profRows } = await query(
      `SELECT sp.bank_details, sp.billing_address, sp.tax_details, sp.gst_number, sp.pan_number, sp.store_name,
              s.bank_details AS s_bank_details, s.billing_address AS s_billing_address
       FROM seller_profiles sp
       LEFT JOIN sellers s ON s.user_id = sp.user_id
       WHERE (sp.user_id = $1 OR sp.user_id::text = $1::text)`,
      [sellerId]
    ).catch(() => ({ rows: [] }));

    const prof = profRows[0] || {};
    const bankInfo = normalizeBankDetails(prof.bank_details, prof.s_bank_details || {});
    const billingInfo = normalizeBillingAddress(prof.billing_address, prof.s_billing_address || {});

    if ((!bankInfo.account_number || !bankInfo.ifsc_code) && !bankInfo.upi_id) {
      return res.status(400).json({
        success: false,
        errorCode: 'PAYOUT_DETAILS_MISSING',
        message: 'Please configure your Bank Account & Billing details in Settings > Profile before requesting a payout.',
      });
    }

    // Verify eligible balance
    const { rows: availableRows } = await query(
      `SELECT
         COALESCE(SUM(COALESCE(o.seller_payout, ROUND(COALESCE(o.total_paise, o.total_amount * 100, 0) * 0.95)) / 100.0), 0) AS available_balance
       FROM orders o
       WHERE (o.seller_id = $1 OR o.seller_id::text = $1::text)
         AND LOWER(COALESCE(o.status, '')) = 'delivered'
         AND LOWER(COALESCE(o.payment_status, '')) = 'paid'
         AND o.created_at <= NOW() - INTERVAL '7 days'`,
      [sellerId]
    ).catch(() => ({ rows: [{ available_balance: 0 }] }));

    const { rows: completedRows } = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid_out
       FROM seller_payouts
       WHERE (seller_id = $1 OR seller_id::text = $1::text)
         AND status IN ('pending', 'processing', 'scheduled', 'paid')`,
      [sellerId]
    ).catch(() => ({ rows: [{ total_paid_out: 0 }] }));
    const totalPaidOut = parseFloat(completedRows[0]?.total_paid_out || 0);

    const grossAvailable = parseFloat(availableRows[0]?.available_balance || 0);
    const availableBalance = Math.max(0, grossAvailable - totalPaidOut);

    let requestedAmount = parseFloat(req.body.amount || req.body.requestedAmount);
    if (isNaN(requestedAmount) || requestedAmount <= 0) {
      requestedAmount = availableBalance;
    }

    if (availableBalance <= 0 || requestedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'You have no eligible payout balance available for withdrawal at this time. Delivered orders become eligible after a 7-day escrow holding period.',
      });
    }

    if (requestedAmount > availableBalance) {
      return res.status(400).json({
        success: false,
        message: `Requested payout of ₹${requestedAmount.toLocaleString('en-IN')} exceeds your available eligible balance of ₹${availableBalance.toLocaleString('en-IN')}. Note that earnings remain in 7-day escrow holding after delivery.`,
      });
    }

    const reference = `PAYOUT-REQ-${Date.now().toString().slice(-6)}`;
    const payoutDestination = {
      legal_business_name: billingInfo.legal_business_name || prof.store_name || '',
      account_holder_name: bankInfo.account_holder_name || '',
      bank_name: bankInfo.bank_name || '',
      masked_account: bankInfo.account_number ? `••••${String(bankInfo.account_number).slice(-4)}` : null,
      ifsc_code: bankInfo.ifsc_code || null,
      upi_id: bankInfo.upi_id || null,
      gstin: prof.gst_number || billingInfo.gstin || null,
      pan: prof.pan_number || billingInfo.pan || null,
    };

    let payoutRow;
    try {
      const { rows: payoutRows } = await query(
        `INSERT INTO seller_payouts (seller_id, amount, status, reference, created_at)
         VALUES ($1, $2, 'pending', $3, NOW())
         RETURNING *`,
        [sellerId, requestedAmount, reference]
      );
      payoutRow = payoutRows[0];
    } catch {
      const { rows: payoutRows } = await query(
        `INSERT INTO payouts (seller_id, amount, status, reference_id, initiated_at)
         VALUES ($1, $2, 'pending', $3, NOW()::text)
         RETURNING *`,
        [sellerId, requestedAmount, reference]
      );
      payoutRow = payoutRows[0];
    }

    // Notify seller
    await createNotification(
      sellerId,
      'payout_requested',
      'Payout Request Submitted 💳',
      `Your withdrawal request for ₹${requestedAmount.toLocaleString('en-IN')} has been received and scheduled for transfer.`,
      { payout_id: payoutRow?.id, amount: requestedAmount, reference, payout_destination: payoutDestination }
    ).catch(e => console.warn('[Payout] Notification trigger failed:', e.message));

    return res.status(201).json({
      success: true,
      message: `Payout withdrawal request for ₹${requestedAmount.toLocaleString('en-IN')} submitted successfully.`,
      data: {
        payout: payoutRow,
        withdrawn_amount: requestedAmount,
        payout_destination: payoutDestination,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/orders/:id/label & POST /api/seller/orders/:id/awb
// ---------------------------------------------------------------------------
async function getOrderLabel(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    if (req.query.format === 'html') {
      return res.redirect(`/api/logistics/label/${id}?format=html`);
    }
    const labelData = await logisticsService.getShippingLabel(id, req.user.role === 'admin' ? null : sellerId);
    return res.json({
      success: true,
      data: {
        label: labelData,
        label_url: `/api/logistics/label/${id}?format=html`,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function generateOrderAWB(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const result = await logisticsService.generateSellerAWB(id, req.user.role === 'admin' ? null : sellerId);
    return res.json({
      success: true,
      message: 'AWB generated successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function followSeller(req, res, next) {
  try {
    const userId = req.user.id;
    const sellerId = req.params.id || req.body.seller_id || req.body.sellerId || req.body.id;

    if (!sellerId) {
      return res.status(400).json({ success: false, message: 'Seller ID is required to follow.' });
    }

    if (userId === sellerId) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself.' });
    }

    // Insert into seller_followers table
    await query(
      `INSERT INTO seller_followers (user_id, seller_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, seller_id) DO NOTHING`,
      [userId, sellerId]
    ).catch(() => {});

    // Also insert into follows table for graph compatibility
    await query(
      `INSERT INTO follows (follower_id, followee_id)
       VALUES ($1, $2)
       ON CONFLICT (follower_id, followee_id) DO NOTHING`,
      [userId, sellerId]
    ).catch(() => {});

    return res.json({
      success: true,
      message: 'Artisan followed successfully.',
      is_following: true,
    });
  } catch (err) {
    next(err);
  }
}

async function unfollowSeller(req, res, next) {
  try {
    const userId = req.user.id;
    const sellerId = req.params.id || req.body.seller_id || req.body.sellerId || req.body.id;

    if (!sellerId) {
      return res.status(400).json({ success: false, message: 'Seller ID is required to unfollow.' });
    }

    await query(
      'DELETE FROM seller_followers WHERE user_id = $1 AND seller_id = $2',
      [userId, sellerId]
    ).catch(() => {});

    await query(
      'DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2',
      [userId, sellerId]
    ).catch(() => {});

    return res.json({
      success: true,
      message: 'Artisan unfollowed.',
      is_following: false,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Ensure discount columns exist on products table
// ---------------------------------------------------------------------------
let discountColsChecked = false;
async function ensureProductDiscountColumns() {
  if (discountColsChecked) return;
  try {
    await query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS discount_active BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS discount_percentage INTEGER DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2) DEFAULT NULL;
    `);
    discountColsChecked = true;
  } catch (err) {
    discountColsChecked = true;
  }
}

// ---------------------------------------------------------------------------
// PATCH / POST /api/seller/orders/:id/tracking — update shipping tracking
// ---------------------------------------------------------------------------
async function updateOrderTracking(req, res, next) {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = req.user.role;
    const trackingNumber = req.body.tracking_number || req.body.tracking_id || req.body.trackingId || req.body.awb_number;
    const courier = (req.body.courier || req.body.carrier || '').trim() || 'Manual Dispatch';

    if (!trackingNumber) {
      return res.status(400).json({ success: false, message: 'Tracking number is required.' });
    }

    // Default tracking URL only if courier is explicitly iThink, or if tracking_url was provided
    let trackingUrl = req.body.tracking_url;
    if (!trackingUrl) {
      if (courier.toLowerCase().includes('ithink')) {
        trackingUrl = `https://ithinklogistics.com/track/${encodeURIComponent(trackingNumber)}`;
      } else {
        trackingUrl = '';
      }
    }

    // Verify order exists and belongs to seller (or admin)
    const { rows: existingRows } = await query(
      `SELECT * FROM orders 
       WHERE (id::text = $1 OR order_ref = $1)
         AND (
           seller_id = $2 
           OR seller_id IN (SELECT id FROM sellers WHERE user_id = $2)
           OR seller_id IN (SELECT id FROM seller_profiles WHERE user_id = $2)
           OR $3 = 'admin' 
           OR $3 = 'master_admin'
         )`,
      [id, sellerId, role]
    );

    if (!existingRows.length) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
    }

    const order = existingRows[0];

    // Protect against accidentally overwriting an active iThink AWB without explicit overwrite flag
    if (order.tracking_id && order.shipment_status === 'booked' && !req.body.overwrite) {
      return res.status(409).json({
        success: false,
        message: `Order already has an automated courier waybill (${order.tracking_id}). Pass overwrite: true if you must replace it manually.`,
      });
    }

    const newStatus = ['pending', 'confirmed', 'crafting', 'packed'].includes(order.status) ? 'shipped' : order.status;

    const { rows } = await query(
      `UPDATE orders
       SET tracking_id = $1,
           courier = $2,
           tracking_url = $3,
           status = $4,
           shipment_status = 'manual',
           dispatched_at = COALESCE(dispatched_at, NOW()),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [trackingNumber, courier, trackingUrl, newStatus, order.id]
    );

    await query(
      `UPDATE seller_orders
       SET awb_number = $1,
           courier_name = $2,
           tracking_url = $3,
           status = $4,
           updated_at = NOW()
       WHERE order_id = $5 OR id = $5`,
      [trackingNumber, courier, trackingUrl, newStatus, order.id]
    ).catch(e => console.warn('[Order Tracking] Non-fatal seller_orders update notice:', e.message));

    const updatedOrder = rows[0] || order;
    if (updatedOrder) {
      updatedOrder.tracking_number = updatedOrder.tracking_id;
    }

    // Notify buyer
    if (updatedOrder.buyer_id) {
      await createNotification(
        updatedOrder.buyer_id,
        'order_shipped',
        'Your Order Has Been Dispatched! 🚚',
        `Your handcrafted creation is on its way with ${courier}. Waybill tracking #${trackingNumber}.`,
        {
          order_id: order.id,
          tracking_id: trackingNumber,
          tracking_url: trackingUrl,
          courier
        }
      ).catch(e => console.warn('[Order Tracking] Notification trigger failed:', e.message));
    }

    return res.json({
      success: true,
      message: 'Order tracking details updated successfully.',
      data: { 
        order: updatedOrder,
        tracking_number: trackingNumber,
        tracking_id: trackingNumber,
        courier
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/catalog/summary — aggregate catalog statistics
// ---------------------------------------------------------------------------
async function getCatalogSummary(req, res, next) {
  try {
    await ensureProductDiscountColumns();
    const sellerId = req.user.id;

    const { rows } = await query(
      `SELECT 
         COUNT(*) FILTER (WHERE status IN ('active', 'paused')) AS total_listings,
         COUNT(*) FILTER (WHERE status = 'active') AS active_listings,
         COUNT(*) FILTER (WHERE status = 'paused') AS paused_listings,
         COUNT(*) FILTER (WHERE status IN ('active', 'paused') AND COALESCE(stock_quantity, 0) <= COALESCE(low_stock_threshold, 5)) AS low_stock,
         COUNT(*) FILTER (WHERE status IN ('active', 'paused') AND discount_active::text IN ('true', '1', 't')) AS on_discount
       FROM products
       WHERE (
         seller_id::text = $1 
         OR seller_id::text IN (SELECT id::text FROM sellers WHERE user_id::text = $1)
         OR seller_id::text IN (SELECT id::text FROM seller_profiles WHERE user_id::text = $1)
       ) AND status IN ('active', 'paused')`,
      [String(sellerId)]
    );

    const summary = rows[0] || { total_listings: 0, active_listings: 0, paused_listings: 0, low_stock: 0, on_discount: 0 };
    return res.json({
      success: true,
      data: {
        total_listings: parseInt(summary.total_listings || 0, 10),
        active_listings: parseInt(summary.active_listings || 0, 10),
        paused_listings: parseInt(summary.paused_listings || 0, 10),
        low_stock: parseInt(summary.low_stock || 0, 10),
        on_discount: parseInt(summary.on_discount || 0, 10)
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/seller/listings/:id/discount — update individual listing discount
// ---------------------------------------------------------------------------
async function updateListingDiscount(req, res, next) {
  try {
    await ensureProductDiscountColumns();
    const { id } = req.params;
    const sellerId = req.user.id;
    const role = req.user.role;
    const { discount_active, discount_percentage } = req.body;

    const isActive = discount_active === true || discount_active === 'true' || discount_active === 1 || discount_active === '1';
    const pct = isActive ? parseInt(discount_percentage, 10) : null;

    if (isActive && (!pct || isNaN(pct) || pct < 1 || pct > 90)) {
      return res.status(400).json({ success: false, message: 'Discount percentage must be between 1 and 90.' });
    }

    const { rows: pRows } = await query(
      `SELECT id, base_price FROM products 
       WHERE id::text = $1 
         AND (
           seller_id = $2 
           OR seller_id IN (SELECT id FROM sellers WHERE user_id = $2)
           OR seller_id IN (SELECT id FROM seller_profiles WHERE user_id = $2)
           OR $3 = 'admin' 
           OR $3 = 'master_admin'
         )`,
      [id, sellerId, role]
    );

    if (!pRows.length) {
      return res.status(404).json({ success: false, message: 'Product listing not found or unauthorized.' });
    }

    const basePrice = parseFloat(pRows[0].base_price || 0);
    const salePrice = isActive ? Math.round(basePrice * (1 - pct / 100) * 100) / 100 : null;
    const discountedPricePaise = isActive ? Math.round(basePrice * (1 - pct / 100) * 100) : null;

    const { rows } = await query(
      `UPDATE products
       SET discount_active = $1,
           discount_percentage = $2,
           sale_price = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, base_price, discount_active, discount_percentage, sale_price`,
      [isActive ? 1 : 0, pct, salePrice, pRows[0].id]
    );

    return res.json({
      success: true,
      message: isActive ? `Discount of ${pct}% applied.` : 'Discount removed.',
      data: {
        listing_id: id,
        id,
        discount_active: isActive,
        discount_percentage: pct,
        discounted_price: discountedPricePaise,
        sale_price: salePrice
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/seller/listings/bulk-discount — apply discount to selected listings
// ---------------------------------------------------------------------------
async function bulkDiscountListings(req, res, next) {
  try {
    await ensureProductDiscountColumns();
    const sellerId = req.user.id;
    const role = req.user.role;
    const { product_ids, discount_percentage, discount_active } = req.body;

    const isActive = discount_active !== false && discount_active !== 'false' && discount_active !== 0 && discount_active !== '0';
    const pct = isActive ? parseInt(discount_percentage, 10) : null;

    if (isActive && (!pct || isNaN(pct) || pct < 1 || pct > 90)) {
      return res.status(400).json({ success: false, message: 'Discount percentage must be between 1 and 90.' });
    }

    if (!Array.isArray(product_ids) || !product_ids.length) {
      return res.status(400).json({ success: false, message: 'product_ids array is required.' });
    }

    const numericIds = product_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (!numericIds.length) {
      return res.status(400).json({ success: false, message: 'Valid product IDs are required.' });
    }

    const multiplier = (isActive && pct) ? (1.0 - pct / 100.0) : null;

    const { rows } = await query(
      `UPDATE products
       SET discount_active = $1,
           discount_percentage = $2,
           sale_price = CASE 
             WHEN $1 = 1 AND $3::numeric IS NOT NULL 
             THEN ROUND(COALESCE(base_price, price, 0) * $3::numeric, 2) 
             ELSE NULL 
           END,
           updated_at = NOW()
       WHERE id = ANY($4[]) 
         AND (
           seller_id = $5 
           OR seller_id IN (SELECT id FROM sellers WHERE user_id = $5)
           OR seller_id IN (SELECT id FROM seller_profiles WHERE user_id = $5)
           OR $6 = 'admin' 
           OR $6 = 'master_admin'
         )
       RETURNING id, base_price, discount_active, discount_percentage, sale_price`,
      [isActive ? 1 : 0, pct, multiplier, numericIds, sellerId, role]
    );

    return res.json({
      success: true,
      message: `Bulk discount updated for ${rows.length} listings.`,
      data: { updated_count: rows.length, listings: rows }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/seller/listings/bulk-discount-all — apply discount to all listings
// ---------------------------------------------------------------------------
async function bulkDiscountAllListings(req, res, next) {
  try {
    await ensureProductDiscountColumns();
    const sellerId = req.user.id;
    const role = req.user.role;
    const { discount_percentage, discount_active } = req.body;

    const isActive = discount_active !== false && discount_active !== 'false' && discount_active !== 0 && discount_active !== '0';
    const pct = isActive ? parseInt(discount_percentage, 10) : null;

    if (isActive && (!pct || isNaN(pct) || pct < 1 || pct > 90)) {
      return res.status(400).json({ success: false, message: 'Discount percentage must be between 1 and 90.' });
    }

    const multiplier = (isActive && pct) ? (1.0 - pct / 100.0) : null;

    const { rows } = await query(
      `UPDATE products
       SET discount_active = $1,
           discount_percentage = $2,
           sale_price = CASE 
             WHEN $1 = 1 AND $3::numeric IS NOT NULL 
             THEN ROUND(COALESCE(base_price, price, 0) * $3::numeric, 2) 
             ELSE NULL 
           END,
           updated_at = NOW()
       WHERE (
         seller_id = $4 
         OR seller_id IN (SELECT id FROM sellers WHERE user_id = $4)
         OR seller_id IN (SELECT id FROM seller_profiles WHERE user_id = $4)
         OR $5 = 'admin' 
         OR $5 = 'master_admin'
       ) AND status NOT IN ('deleted')
       RETURNING id, base_price, discount_active, discount_percentage, sale_price`,
      [isActive ? 1 : 0, pct, multiplier, sellerId, role]
    );

    return res.json({
      success: true,
      message: `Bulk discount updated for all ${rows.length} listings.`,
      data: { updated_count: rows.length, listings: rows }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/seller/complete-onboarding
 * Post-approval studio setup for marketplace sellers: collects courier pickup address and payout bank details.
 * Sets onboarding_completed = TRUE in seller_profiles and sellers.
 */
async function completeOnboarding(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      address_line1, addressLine1, address_line2, addressLine2, city, state, pincode, postal_code,
      account_holder_name, accountHolderName, account_holder,
      bank_name, bankName,
      account_number, accountNumber,
      ifsc_code, ifscCode, ifsc,
      upi_id, upiId
    } = req.body;

    const finalAddr1 = (address_line1 || addressLine1 || '').trim();
    const finalAddr2 = (address_line2 || addressLine2 || '').trim();
    const finalCity = (city || '').trim();
    const finalState = (state || '').trim();
    const finalPincode = (pincode || postal_code || '').trim();

    if (!finalAddr1 || !finalCity || !finalState || !finalPincode) {
      return res.status(400).json({
        success: false,
        message: 'All pickup address fields (Street Address, City, State, 6-digit Pincode) are required.'
      });
    }

    if (!/^\d{6}$/.test(finalPincode)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit Indian pincode.'
      });
    }

    const finalHolder = (account_holder_name || accountHolderName || account_holder || '').trim();
    const finalBank = (bank_name || bankName || '').trim();
    const finalAccount = (account_number || accountNumber || '').trim();
    const finalIfsc = (ifsc_code || ifscCode || ifsc || '').toUpperCase().trim();
    const finalUpi = (upi_id || upiId || '').trim();

    if (!finalHolder || !finalBank || !finalAccount || !finalIfsc) {
      return res.status(400).json({
        success: false,
        message: 'All bank account details (Holder Name, Bank Name, Account Number, IFSC Code) are required for payout settlements.'
      });
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(finalIfsc)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 11-character Indian IFSC code (e.g. SBIN0001234, HDFC0000456).'
      });
    }

    const pickupAddress = {
      address_line1: finalAddr1,
      address_line2: finalAddr2,
      city: finalCity,
      state: finalState,
      pincode: finalPincode,
      country: 'India'
    };

    const bankDetails = {
      account_holder: finalHolder,
      account_holder_name: finalHolder,
      bank_name: finalBank,
      account_number: finalAccount,
      ifsc_code: finalIfsc,
      upi_id: finalUpi || null
    };

    // Update seller_profiles
    const { rows: updatedProfiles } = await query(
      `UPDATE seller_profiles
       SET pickup_address = $1,
           billing_address = $1,
           bank_details = $2,
           onboarding_completed = TRUE,
           updated_at = NOW()
       WHERE user_id = $3
       RETURNING *`,
      [JSON.stringify(pickupAddress), JSON.stringify(bankDetails), userId]
    );

    // Update master sellers table
    await query(
      `UPDATE sellers
       SET pickup_address = $1,
           billing_address = $1,
           bank_details = $2,
           onboarding_completed = TRUE
       WHERE user_id = $3`,
      [JSON.stringify(pickupAddress), JSON.stringify(bankDetails), userId]
    ).catch(() => {});

    // Ensure wallet exists for this seller
    try {
      const { rows: sellerRecord } = await query('SELECT id FROM sellers WHERE user_id = $1', [userId]);
      const targetSellerId = sellerRecord[0]?.id || userId;
      await query(
        `INSERT INTO wallets (seller_id, user_id, balance, currency)
         VALUES ($1, $2, 0, 'INR')
         ON CONFLICT (seller_id) DO NOTHING`,
        [targetSellerId, userId]
      );
    } catch (wErr) {
      console.warn('Wallet initialization notice in completeOnboarding:', wErr.message);
    }

    // Save default dispatch address to user_addresses if not existing
    try {
      const { rows: addrRows } = await query('SELECT id FROM user_addresses WHERE user_id = $1 LIMIT 1', [userId]);
      if (!addrRows.length) {
        const { rows: uRows } = await query('SELECT name, phone FROM users WHERE id = $1', [userId]);
        await query(
          `INSERT INTO user_addresses (user_id, name, phone, address_line1, address_line2, city, state, pincode, address_type, is_default)
           VALUES ($1, $2, COALESCE($3, '9999999999'), $4, $5, $6, $7, $8, 'office', TRUE)`,
          [userId, uRows[0]?.name || 'Artisan Workshop', uRows[0]?.phone, finalAddr1, finalAddr2, finalCity, finalState, finalPincode]
        );
      }
    } catch (addrErr) {
      console.warn('Address sync notice in completeOnboarding:', addrErr.message);
    }

    const onboardingStatus = await getSellerOnboardingStatus(userId);

    return res.status(200).json({
      success: true,
      message: 'Studio setup completed successfully! Welcome to Tohfa Seller Studio.',
      data: {
        pickup_address: pickupAddress,
        billing_address: pickupAddress,
        bank_details: bankDetails,
        onboarding_completed: true,
        hasBillingAddress: onboardingStatus.hasBillingAddress,
        hasBankingDetails: onboardingStatus.hasBankingDetails,
        onboardingStatus,
        profile: updatedProfiles[0] || {}
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/onboarding/status
// ---------------------------------------------------------------------------
async function getOnboardingStatus(req, res, next) {
  try {
    const userId = req.user.id;
    const status = await getSellerOnboardingStatus(userId);
    return res.json({
      success: true,
      data: status
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/seller/onboarding/dismiss-tour
// ---------------------------------------------------------------------------
async function dismissTour(req, res, next) {
  try {
    const userId = req.user.id;
    await query(
      `UPDATE seller_profiles SET onboarding_tour_dismissed = TRUE, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    ).catch(() => {});
    await query(
      `UPDATE sellers SET onboarding_tour_dismissed = TRUE, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    ).catch(() => {});

    return res.json({
      success: true,
      onboardingTourDismissed: true,
      message: 'Onboarding walkthrough tour dismissed.'
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/seller/profile/billing & POST/PUT /api/seller/settings/billing
// Consolidated Business, Tax, Billing Address & Payout Bank Details Handler
// ---------------------------------------------------------------------------
async function updateBillingProfile(req, res, next) {
  try {
    const userId = req.user.id;
    await ensureTaxColumns();

    const billingInput = (req.body.billing_address && typeof req.body.billing_address === 'object')
      ? { ...req.body, ...req.body.billing_address }
      : req.body;

    const bankInput = (req.body.bank_details && typeof req.body.bank_details === 'object')
      ? { ...req.body, ...req.body.bank_details }
      : (req.body.payout_details && typeof req.body.payout_details === 'object')
        ? { ...req.body, ...req.body.payout_details }
        : req.body;

    const {
      legal_business_name, business_name, company_name,
      address_line1, addressLine1, line1, address_line2, addressLine2, line2,
      landmark, street, city, state, pincode, pinCode, postal_code, postalCode, country = 'India',
      gst_number, gst, gstin, pan_number, pan, tds_applicable,
      same_as_billing, sameAsBilling
    } = billingInput;

    const {
      account_holder_name, accountHolderName, account_holder,
      bank_name, bankName, account_number, accountNumber,
      confirm_account_number, confirmAccountNumber,
      ifsc_code, ifscCode, ifsc, upi_id, upiId
    } = bankInput;

    const finalBusinessName = String(legal_business_name || business_name || company_name || '').trim();
    const finalAddr1 = String(address_line1 || addressLine1 || line1 || street || '').trim();
    const finalAddr2 = String(address_line2 || addressLine2 || line2 || '').trim();
    const finalLandmark = String(landmark || '').trim();
    const finalCity = String(city || '').trim();
    const finalState = String(state || '').trim();
    const finalPincode = String(pincode || pinCode || postal_code || postalCode || '').trim();
    const finalCountry = String(country || 'India').trim() || 'India';
    const finalPan = String(pan_number || pan || '').toUpperCase().trim();
    const finalGst = String(gst_number || gst || gstin || '').toUpperCase().trim();

    if (!finalAddr1 || !finalCity || !finalState || !finalPincode) {
      return res.status(400).json({
        success: false,
        message: 'All billing address fields (Address Line 1, City, State, 6-digit Pincode) are required.'
      });
    }

    if (!/^\d{6}$/.test(finalPincode)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit Indian postal pincode.'
      });
    }

    if (finalGst && !isValidGstin(finalGst)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 15-character Indian GSTIN (e.g. 27AAAAA0000A1Z5).'
      });
    }

    if (finalPan && !isValidPan(finalPan)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-character Indian PAN number (e.g. ABCDE1234F).'
      });
    }

    const finalHolder = String(account_holder_name || accountHolderName || account_holder || '').trim();
    const rawBankName = String(bank_name || bankName || '').trim();
    const finalAccount = String(account_number || accountNumber || '').trim();
    const finalConfirmAccount = String(confirm_account_number || confirmAccountNumber || '').trim();
    const finalIfsc = String(ifsc_code || ifscCode || ifsc || '').toUpperCase().trim();
    const finalUpi = String(upi_id || upiId || '').trim();

    if (finalConfirmAccount && finalConfirmAccount !== finalAccount) {
      return res.status(400).json({
        success: false,
        message: 'Bank account number and confirm account number do not match.'
      });
    }

    const hasAnyBankInput = Boolean(finalHolder || rawBankName || finalAccount || finalIfsc);
    if (hasAnyBankInput) {
      if (!finalHolder || !finalAccount || !finalIfsc) {
        return res.status(400).json({
          success: false,
          message: 'Bank account fields (Account Holder Name, Account Number, and IFSC Code) are required when configuring bank payouts.'
        });
      }

      if (!isValidIfscOrRouting(finalIfsc)) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid 11-character Indian IFSC code (e.g. SBIN0001234, HDFC0000456).'
        });
      }
    }

    // Fetch existing seller profile to preserve pickup metadata or sync if same_as_billing
    const existingRes = await Promise.resolve(query(
      `SELECT sp.store_name, sp.pickup_address, sp.billing_address, sp.bank_details, sp.whatsapp_number,
              s.pickup_address AS s_pickup_address, s.billing_address AS s_billing_address, s.bank_details AS s_bank_details,
              u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    )).catch(() => ({ rows: [] }));
    const existingRows = existingRes?.rows || [];
    const existing = existingRows[0] || {};
    const existingBank = normalizeBankDetails(existing.bank_details, existing.s_bank_details || {});

    const finalBank = rawBankName || existingBank.bank_name || (finalIfsc ? `${finalIfsc.slice(0, 4)} Bank` : '');

    const addressPayload = normalizeBillingAddress({
      legal_business_name: finalBusinessName || existing.store_name || '',
      address_line1: finalAddr1,
      address_line2: finalAddr2,
      landmark: finalLandmark,
      city: finalCity,
      state: finalState,
      pincode: finalPincode,
      country: finalCountry,
      gstin: finalGst || null,
      pan: finalPan || null
    });

    const bankPayload = hasAnyBankInput
      ? normalizeBankDetails({
          ...existingBank,
          account_holder_name: finalHolder,
          bank_name: finalBank,
          account_number: finalAccount,
          ifsc_code: finalIfsc,
          upi_id: finalUpi || existingBank.upi_id || null
        })
      : normalizeBankDetails({
          ...existingBank,
          upi_id: finalUpi || existingBank.upi_id || null
        });

    const taxPayload = {
      legal_business_name: addressPayload.legal_business_name,
      is_gst_registered: Boolean(finalGst),
      gstin: finalGst,
      pan_number: finalPan,
      tds_applicable: Boolean(tds_applicable),
      updated_at: new Date().toISOString()
    };

    const existingPickup = normalizePickupAddress(existing.pickup_address, existing.s_pickup_address || {});
    const shouldSyncPickup = Boolean(
      same_as_billing === true ||
      sameAsBilling === true ||
      same_as_billing === 'true' ||
      !existingPickup.address_line1
    );

    const pickupPayload = shouldSyncPickup
      ? normalizePickupAddress({
          ...existingPickup,
          same_as_billing: true,
          contact_name: existingPickup.contact_name || existing.user_name || finalHolder || existing.store_name || 'Artisan',
          phone: existingPickup.phone || existing.whatsapp_number || existing.user_phone || '',
          facility_name: existingPickup.facility_name || finalBusinessName || existing.store_name || 'Artisan Studio',
          address_line1: finalAddr1,
          address_line2: finalAddr2,
          landmark: finalLandmark,
          city: finalCity,
          state: finalState,
          pincode: finalPincode,
          country: finalCountry
        })
      : existingPickup;

    // Non-blocking Razorpay Linked Account / Fund Account sync
    let razorpaySync = null;
    try {
      razorpaySync = await paymentService.syncSellerRazorpayAccount(userId, {
        billingAddress: addressPayload,
        bankDetails: bankPayload,
        taxDetails: taxPayload,
        email: existing.user_email,
        phone: existing.user_phone || existing.whatsapp_number
      });
      if (razorpaySync?.razorpay_account_id) {
        bankPayload.razorpay_account_id = razorpaySync.razorpay_account_id;
      }
      if (razorpaySync?.razorpay_fund_account_id) {
        bankPayload.razorpay_fund_account_id = razorpaySync.razorpay_fund_account_id;
      }
    } catch (rzpErr) {
      console.warn('[Seller Billing] Non-fatal Razorpay sync warning:', rzpErr.message);
    }

    const fallbackStoreName = existing.store_name || finalBusinessName || existing.user_name || 'My Artisan Shop';

    // Atomic upsert into seller_profiles so missing profile rows never fail silently
    await query(
      `INSERT INTO seller_profiles (
         user_id, store_name, billing_address, pickup_address, bank_details, tax_details,
         pan_number, gst_number, onboarding_completed, updated_at
       )
       VALUES ($7, $8, $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, TRUE, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         billing_address = EXCLUDED.billing_address,
         pickup_address = EXCLUDED.pickup_address,
         bank_details = EXCLUDED.bank_details,
         tax_details = EXCLUDED.tax_details,
         pan_number = COALESCE(NULLIF(EXCLUDED.pan_number, ''), seller_profiles.pan_number),
         gst_number = COALESCE(NULLIF(EXCLUDED.gst_number, ''), seller_profiles.gst_number),
         onboarding_completed = TRUE,
         updated_at = NOW()`,
      [
        JSON.stringify(addressPayload),
        JSON.stringify(pickupPayload),
        JSON.stringify(bankPayload),
        JSON.stringify(taxPayload),
        finalPan || null,
        finalGst || null,
        userId,
        fallbackStoreName
      ]
    );

    // Update master sellers table
    await Promise.resolve(query(
      `UPDATE sellers
       SET billing_address = $1,
           pickup_address = $2,
           bank_details = $3,
           pan_number = COALESCE(NULLIF($4, ''), pan_number),
           gst_number = COALESCE(NULLIF($5, ''), gst_number),
           onboarding_completed = TRUE,
           updated_at = NOW()
       WHERE user_id = $6`,
      [
        JSON.stringify(addressPayload),
        JSON.stringify(pickupPayload),
        JSON.stringify(bankPayload),
        finalPan || null,
        finalGst || null,
        userId
      ]
    )).catch(() => {});

    const dbStatus = await getSellerOnboardingStatus(userId);
    const computedStatus = evaluateSellerOnboarding({
      billing_address: addressPayload,
      pickup_address: pickupPayload,
      bank_details: bankPayload,
      onboarding_tour_dismissed: dbStatus.onboardingTourDismissed
    });
    const status = {
      ...dbStatus,
      hasBillingAddress: dbStatus.hasBillingAddress || computedStatus.hasBillingAddress,
      hasPickupAddress: dbStatus.hasPickupAddress || computedStatus.hasPickupAddress,
      hasBankingDetails: dbStatus.hasBankingDetails || computedStatus.hasBankingDetails,
      isComplete: (dbStatus.hasBillingAddress || computedStatus.hasBillingAddress) &&
                  (dbStatus.hasBankingDetails || computedStatus.hasBankingDetails)
    };

    return res.json({
      success: true,
      message: 'Billing address and banking payout details saved successfully.',
      data: {
        billing_address: addressPayload,
        pickup_address: pickupPayload,
        bank_details: bankPayload,
        payout_details: bankPayload,
        tax_details: taxPayload,
        razorpay_sync: razorpaySync,
        onboardingStatus: status,
        hasBillingAddress: status.hasBillingAddress,
        hasPickupAddress: status.hasPickupAddress,
        hasBankingDetails: status.hasBankingDetails
      }
    });
  } catch (err) {
    next(err);
  }
}

const saveBillingAndBanking = updateBillingProfile;

// ---------------------------------------------------------------------------
// PUT /api/seller/profile/pickup-address
// Consolidated Operational Pickup Address Handler (for iThink Logistics)
// ---------------------------------------------------------------------------
async function updatePickupAddress(req, res, next) {
  try {
    const userId = req.user.id;
    const rawInput = (req.body.pickup_address && typeof req.body.pickup_address === 'object')
      ? { ...req.body, ...req.body.pickup_address }
      : req.body;

    // Fetch existing seller profile & billing address for fallbacks / same_as_billing
    const existingRes = await Promise.resolve(query(
      `SELECT sp.store_name, sp.pickup_address, sp.billing_address, sp.bank_details, sp.whatsapp_number,
              s.pickup_address AS s_pickup_address, s.billing_address AS s_billing_address, s.bank_details AS s_bank_details,
              u.name AS user_name, u.phone AS user_phone
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    )).catch(() => ({ rows: [] }));
    const existingRows = existingRes?.rows || [];
    const existing = existingRows[0] || {};
    const currentBilling = normalizeBillingAddress(existing.billing_address, existing.s_billing_address || {});
    const currentPickup = normalizePickupAddress(existing.pickup_address, existing.s_pickup_address || {});

    const sameAsBilling = Boolean(
      rawInput.same_as_billing === true ||
      rawInput.sameAsBilling === true ||
      rawInput.same_as_billing === 'true'
    );

    const addressFallback = sameAsBilling ? currentBilling : {};

    const normalizedPickup = normalizePickupAddress(
      {
        same_as_billing: sameAsBilling,
        contact_name: rawInput.contact_name || rawInput.contactName || rawInput.name,
        phone: rawInput.phone || rawInput.contact_phone || rawInput.contactPhone,
        facility_name: rawInput.facility_name || rawInput.warehouse_name || rawInput.studio_name,
        address_line1: rawInput.address_line1 || rawInput.addressLine1 || rawInput.line1 || rawInput.street || addressFallback.address_line1,
        address_line2: rawInput.address_line2 !== undefined ? rawInput.address_line2 : (rawInput.line2 !== undefined ? rawInput.line2 : addressFallback.address_line2),
        landmark: rawInput.landmark !== undefined ? rawInput.landmark : addressFallback.landmark,
        city: rawInput.city || addressFallback.city,
        state: rawInput.state || addressFallback.state,
        pincode: rawInput.pincode || rawInput.pinCode || rawInput.postal_code || rawInput.postalCode || addressFallback.pincode,
        country: rawInput.country || 'India',
        warehouse_id: currentPickup.warehouse_id,
      },
      {
        contact_name: currentPickup.contact_name || existing.user_name || existing.store_name || 'Artisan',
        phone: currentPickup.phone || existing.whatsapp_number || existing.user_phone || '',
        facility_name: currentPickup.facility_name || currentBilling.legal_business_name || existing.store_name || 'Artisan Studio',
      }
    );

    if (!normalizedPickup.address_line1 || !normalizedPickup.city || !normalizedPickup.state || !normalizedPickup.pincode) {
      return res.status(400).json({
        success: false,
        message: 'All operational pickup address fields (Address Line 1, City, State, 6-digit PIN Code) are required.'
      });
    }

    if (!/^\d{6}$/.test(normalizedPickup.pincode)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit Indian pickup PIN code.'
      });
    }

    if (!normalizedPickup.contact_name || normalizedPickup.contact_name.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Contact person name is required for courier pickup coordination.'
      });
    }

    if (!normalizedPickup.phone || !isValidIndianPhone(normalizedPickup.phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit Indian phone number for courier pickup coordination.'
      });
    }

    // Check PIN code serviceability via logistics service
    const serviceability = await logisticsService.checkServiceability(normalizedPickup.pincode);
    if (!serviceability.serviceable) {
      return res.status(400).json({
        success: false,
        errorCode: 'PINCODE_UNSERVICEABLE',
        message: serviceability.message || `PIN code ${normalizedPickup.pincode} is not currently serviceable by logistics partners.`,
        data: { serviceability }
      });
    }

    // Sync warehouse / pickup location with iThink Logistics
    const warehouseSync = await logisticsService.syncSellerPickupWarehouse(userId, normalizedPickup);
    normalizedPickup.serviceable = true;
    normalizedPickup.warehouse_id = warehouseSync.warehouse_id || normalizedPickup.warehouse_id || null;

    const fallbackStoreName = existing.store_name || currentBilling.legal_business_name || existing.user_name || 'My Artisan Shop';

    // Atomic upsert into seller_profiles so missing profile rows never fail silently
    await query(
      `INSERT INTO seller_profiles (user_id, store_name, pickup_address, location, updated_at)
       VALUES ($3, $4, $1::jsonb, NULLIF($2, ''), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         pickup_address = EXCLUDED.pickup_address,
         location = COALESCE(NULLIF(EXCLUDED.location, ''), seller_profiles.location),
         updated_at = NOW()`,
      [JSON.stringify(normalizedPickup), `${normalizedPickup.city}, ${normalizedPickup.state}`, userId, fallbackStoreName]
    );

    await Promise.resolve(query(
      `UPDATE sellers
       SET pickup_address = $1,
           city = COALESCE(NULLIF($2, ''), city),
           state = COALESCE(NULLIF($3, ''), state),
           updated_at = NOW()
       WHERE user_id = $4`,
      [JSON.stringify(normalizedPickup), normalizedPickup.city, normalizedPickup.state, userId]
    )).catch(() => {});

    const dbStatus = await getSellerOnboardingStatus(userId);
    const computedStatus = evaluateSellerOnboarding({
      billing_address: currentBilling,
      pickup_address: normalizedPickup,
      bank_details: existing.bank_details || existing.s_bank_details || {}
    });
    const status = {
      ...dbStatus,
      hasPickupAddress: dbStatus.hasPickupAddress || computedStatus.hasPickupAddress
    };

    return res.json({
      success: true,
      message: 'Operational pickup address saved and verified for logistics dispatch.',
      data: {
        pickup_address: normalizedPickup,
        serviceability,
        warehouse_sync: warehouseSync,
        onboardingStatus: status,
        hasBillingAddress: status.hasBillingAddress,
        hasPickupAddress: status.hasPickupAddress,
        hasBankingDetails: status.hasBankingDetails
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Profile Media & Handle Validation
// ---------------------------------------------------------------------------
async function uploadProfilePhoto(req, res, next) {
  try {
    const userId = req.user.id;
    const photoUrl = req.file?.path || req.file?.secure_url || req.file?.url;
    if (!photoUrl) {
      return res.status(400).json({ success: false, message: 'No profile photo uploaded.' });
    }

    await query(
      `UPDATE seller_profiles
       SET profile_photo = $1::varchar, avatar_url = $1::text, updated_at = NOW()
       WHERE user_id = $2`,
      [photoUrl, userId]
    );
    await query('UPDATE sellers SET photo_url = $1, updated_at = NOW() WHERE user_id = $2', [photoUrl, userId]).catch(() => {});
    await query('UPDATE users SET profile_photo_url = $1, updated_at = NOW() WHERE id = $2', [photoUrl, userId]).catch(() => {});

    return res.json({
      success: true,
      message: 'Profile photo updated',
      data: { avatar_url: photoUrl, photo_url: photoUrl, profile_photo: photoUrl }
    });
  } catch (err) {
    next(err);
  }
}

async function uploadBannerPhoto(req, res, next) {
  try {
    const userId = req.user.id;
    const bannerUrl = req.file?.path || req.file?.secure_url || req.file?.url;
    if (!bannerUrl) {
      return res.status(400).json({ success: false, message: 'No banner image uploaded.' });
    }

    await query(
      `UPDATE seller_profiles
       SET banner_url = $1, updated_at = NOW()
       WHERE user_id = $2`,
      [bannerUrl, userId]
    );
    await query('UPDATE sellers SET banner_url = $1, updated_at = NOW() WHERE user_id = $2', [bannerUrl, userId]).catch(() => {});
    await query('UPDATE users SET cover_photo_url = $1, updated_at = NOW() WHERE id = $2', [bannerUrl, userId]).catch(() => {});

    return res.json({
      success: true,
      message: 'Banner updated',
      data: { banner_url: bannerUrl, cover_photo: bannerUrl }
    });
  } catch (err) {
    next(err);
  }
}

async function uploadAboutImage(req, res, next) {
  try {
    const userId = req.user.id;
    const imageUrl = req.file?.path || req.file?.secure_url || req.file?.url;
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'No about image uploaded.' });
    }

    await query(
      `UPDATE seller_profiles
       SET about_image_url = $1, updated_at = NOW()
       WHERE user_id = $2`,
      [imageUrl, userId]
    );

    return res.json({
      success: true,
      message: 'About image updated',
      data: { about_image_url: imageUrl }
    });
  } catch (err) {
    next(err);
  }
}

async function checkHandleAvailability(req, res, next) {
  try {
    const userId = req.user.id;
    const handle = String(req.query.handle || req.query.slug || '').trim().toLowerCase();
    if (!handle) {
      return res.status(400).json({ success: false, message: 'Handle is required.' });
    }

    const { rows } = await query(
      `SELECT id FROM seller_profiles WHERE LOWER(handle) = LOWER($1) AND user_id != $2
       UNION
       SELECT id FROM sellers WHERE LOWER(handle) = LOWER($1) AND user_id != $2`,
      [handle, userId]
    );

    return res.json({
      success: true,
      available: rows.length === 0,
      handle
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// SUBSCRIPTION PLANS & BILLING HANDLERS
// ---------------------------------------------------------------------------

async function getSubscription(req, res, next) {
  try {
    const userId = req.user.id;
    const { rows: profileRows } = await query(
      `SELECT COALESCE(sp.subscription_plan, s.subscription_plan, 'basic') AS subscription_plan,
              COALESCE(sp.subscription_status, s.subscription_status, 'active') AS subscription_status,
              COALESCE(sp.subscription_renews_at, s.subscription_renews_at) AS subscription_renews_at,
              COALESCE(sp.subscription_started_at, s.subscription_started_at) AS subscription_started_at,
              COALESCE(sp.subscription_discount_used, s.subscription_discount_used, FALSE) AS subscription_discount_used
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    let currentPlanId = profileRows[0]?.subscription_plan || 'basic';
    let currentStatus = profileRows[0]?.subscription_status || 'active';

    // Auto-expire subscription if renewal date has passed
    if (profileRows[0]?.subscription_renews_at && new Date(profileRows[0].subscription_renews_at) < new Date() && currentPlanId !== 'basic') {
      await query(
        "UPDATE sellers SET subscription_plan = 'basic', subscription_status = 'expired', updated_at = NOW() WHERE user_id = $1",
        [userId]
      ).catch(() => {});
      await query(
        "UPDATE seller_profiles SET subscription_plan = 'basic', subscription_status = 'expired', updated_at = NOW() WHERE user_id = $1",
        [userId]
      ).catch(() => {});
      await query(
        "UPDATE products SET is_sponsored = FALSE, updated_at = NOW() WHERE seller_id = $1 AND is_sponsored = TRUE",
        [userId]
      ).catch(() => {});
      currentPlanId = 'basic';
      currentStatus = 'expired';
    }

    const currentPlanDef = getPlan(currentPlanId);
    const discountUsed = Boolean(profileRows[0]?.subscription_discount_used);

    // Get paid discount usage from ledger for Pro & Max
    const { rows: ledgerCounts } = await query(
      `SELECT plan, COUNT(DISTINCT user_id) AS paid_count
       FROM subscription_payments
       WHERE status = 'paid' AND discount_applied = TRUE
       GROUP BY plan`
    ).catch(() => ({ rows: [] }));

    const countsMap = { pro: 0, max: 0 };
    ledgerCounts.forEach(r => { countsMap[r.plan] = parseInt(r.paid_count, 10) || 0; });

    const pricing = {
      basic: calculateEffectivePrice('basic', 0, false),
      pro: calculateEffectivePrice('pro', countsMap.pro, discountUsed),
      max: calculateEffectivePrice('max', countsMap.max, discountUsed)
    };

    // Sponsored products usage vs cap
    const { rows: sponsoredRows } = await query(
      `SELECT COUNT(*) AS count
       FROM products
       WHERE seller_id = $1 AND is_sponsored = TRUE AND status != 'deleted'`,
      [userId]
    ).catch(() => ({ rows: [{ count: 0 }] }));
    const currentSponsoredCount = parseInt(sponsoredRows[0]?.count || 0, 10);

    return res.json({
      success: true,
      data: {
        current_plan: currentPlanDef.id,
        plan_name: currentPlanDef.name,
        studio_badge: currentPlanDef.badge,
        status: profileRows[0]?.subscription_status || 'active',
        started_at: profileRows[0]?.subscription_started_at || null,
        renews_at: profileRows[0]?.subscription_renews_at || null,
        discount_used: discountUsed,
        sponsored_info: {
          used: currentSponsoredCount,
          cap: currentPlanDef.sponsorCap,
          can_sponsor_more: currentSponsoredCount < currentPlanDef.sponsorCap
        },
        pricing,
        plans: PLANS
      }
    });
  } catch (err) {
    next(err);
  }
}

async function createSubscriptionOrder(req, res, next) {
  try {
    const userId = req.user.id;
    const { plan = 'pro' } = req.body;
    const planKey = String(plan).toLowerCase().trim();

    if (!['pro', 'max'].includes(planKey)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected. Only Pro and Max require payment.'
      });
    }

    const { rows: profileRows } = await query(
      `SELECT COALESCE(sp.subscription_discount_used, s.subscription_discount_used, FALSE) AS subscription_discount_used,
              COALESCE(s.id, sp.id) AS seller_id,
              sp.store_name, sp.billing_address, sp.gst_number, sp.pan_number, sp.tax_details,
              s.billing_address AS s_billing_address,
              u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    const prof = profileRows[0] || {};
    const discountUsed = Boolean(prof.subscription_discount_used);
    const sellerId = prof.seller_id || null;
    const billingInfo = normalizeBillingAddress(prof.billing_address, prof.s_billing_address || {});

    // Check discount slots used from subscription_payments ledger
    const { rows: discountRows } = await query(
      `SELECT COUNT(DISTINCT user_id) AS paid_count
       FROM subscription_payments
       WHERE plan = $1 AND status = 'paid' AND discount_applied = TRUE`,
      [planKey]
    ).catch(() => ({ rows: [{ paid_count: 0 }] }));
    const paidCount = parseInt(discountRows[0]?.paid_count || 0, 10);
    const pricing = calculateEffectivePrice(planKey, paidCount, discountUsed);

    const receipt = `sub_${planKey}_${String(userId).replace(/-/g, '').substring(0, 12)}_${Date.now()}`;
    const razorpayOrder = await paymentService.createRazorpayOrder(pricing.amount, receipt, 'primary');

    // Audit log order attempt in subscription_payments
    await query(
      `INSERT INTO subscription_payments (seller_id, user_id, plan, amount, currency, razorpay_order_id, status, discount_applied)
       VALUES ($1, $2, $3, $4, 'INR', $5, 'created', $6)`,
      [sellerId, userId, planKey, pricing.amount, razorpayOrder.id, pricing.isDiscountApplied]
    ).catch(err => {
      console.warn('⚠️ [Subscription Payment Log Warning]:', err.message);
    });

    return res.json({
      success: true,
      data: {
        plan: planKey,
        amount: pricing.amount,
        regular_price: pricing.regularPrice,
        is_discount: pricing.isDiscountApplied,
        currency: 'INR',
        razorpay_order: razorpayOrder,
        key_id: razorpayOrder.keyId || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_PRIMARY_KEY_ID || 'rzp_test_placeholder',
        billing_details: {
          legal_business_name: billingInfo.legal_business_name || prof.store_name || prof.user_name || '',
          gstin: prof.gst_number || billingInfo.gstin || null,
          pan: prof.pan_number || billingInfo.pan || null,
          billing_address: billingInfo,
        },
        prefill: {
          name: billingInfo.legal_business_name || prof.user_name || prof.store_name || '',
          email: prof.user_email || '',
          contact: prof.user_phone || '',
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

async function verifySubscriptionPayment(req, res, next) {
  try {
    const userId = req.user.id;
    const { plan, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const planKey = String(plan || 'pro').toLowerCase().trim();

    if (!['pro', 'max'].includes(planKey)) {
      return res.status(400).json({ success: false, message: 'Invalid subscription plan.' });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing Razorpay payment verification parameters.'
      });
    }

    // Verify HMAC signature
    const isValid = paymentService.verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      await query(
        `UPDATE subscription_payments
         SET status = 'failed', razorpay_payment_id = $1, razorpay_signature = $2, updated_at = NOW()
         WHERE razorpay_order_id = $3`,
        [razorpay_payment_id, razorpay_signature, razorpay_order_id]
      ).catch(() => {});

      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature. Verification failed.'
      });
    }

    const { rows: paymentRows } = await query(
      `SELECT amount, discount_applied FROM subscription_payments WHERE razorpay_order_id = $1`,
      [razorpay_order_id]
    ).catch(() => ({ rows: [] }));
    const pricePaid = paymentRows[0]?.amount || (planKey === 'max' ? 999 : 499);
    const discountApplied = Boolean(paymentRows[0]?.discount_applied);

    const now = new Date();
    const renewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // 1. Update subscription_payments audit log
    await query(
      `UPDATE subscription_payments
       SET status = 'paid',
           razorpay_payment_id = $1,
           razorpay_signature = $2,
           started_at = $3,
           renews_at = $4,
           updated_at = NOW()
       WHERE razorpay_order_id = $5`,
      [razorpay_payment_id, razorpay_signature, now, renewsAt, razorpay_order_id]
    ).catch(() => {});

    // 2. Persist new plan in sellers
    await query(
      `UPDATE sellers
       SET subscription_plan = $1,
           subscription_status = 'active',
           subscription_price_paid = $2,
           subscription_started_at = $3,
           subscription_renews_at = $4,
           subscription_discount_used = (subscription_discount_used OR $5),
           subscription_updated_by = 'seller_payment',
           updated_at = NOW()
       WHERE user_id = $6`,
      [planKey, pricePaid, now, renewsAt, discountApplied, userId]
    );

    // 3. Persist new plan in seller_profiles
    await query(
      `UPDATE seller_profiles
       SET subscription_plan = $1,
           subscription_status = 'active',
           subscription_price_paid = $2,
           subscription_started_at = $3,
           subscription_renews_at = $4,
           subscription_discount_used = (subscription_discount_used OR $5),
           subscription_updated_by = 'seller_payment',
           updated_at = NOW()
       WHERE user_id = $6`,
      [planKey, pricePaid, now, renewsAt, discountApplied, userId]
    );

    const planDef = getPlan(planKey);

    return res.json({
      success: true,
      message: `Successfully upgraded to ${planDef.displayName}!`,
      data: {
        plan: planDef.id,
        plan_name: planDef.name,
        studio_badge: planDef.badge,
        status: 'active',
        renews_at: renewsAt
      }
    });
  } catch (err) {
    next(err);
  }
}

async function downgradeSubscription(req, res, next) {
  try {
    const userId = req.user.id;

    await query(
      `UPDATE sellers
       SET subscription_plan = 'basic',
           subscription_status = 'active',
           subscription_updated_by = 'seller_downgrade',
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );

    await query(
      `UPDATE seller_profiles
       SET subscription_plan = 'basic',
           subscription_status = 'active',
           subscription_updated_by = 'seller_downgrade',
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );

    // On Basic, cap is 0 -> un-sponsor active sponsored products
    await query(
      `UPDATE products
       SET is_sponsored = FALSE, updated_at = NOW()
       WHERE seller_id = $1 AND is_sponsored = TRUE`,
      [userId]
    ).catch(() => {});

    return res.json({
      success: true,
      message: 'Plan downgraded to Basic.',
      data: { plan: 'basic', status: 'active', sponsor_cap: 0 }
    });
  } catch (err) {
    next(err);
  }
}

async function toggleProductSponsor(req, res, next) {
  try {
    const userId = req.user.id;
    const productId = req.params.id || req.params.productId;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required.' });
    }

    // Verify ownership and check current sponsored state
    const { rows: prodRows } = await query(
      `SELECT id, is_sponsored, seller_id FROM products WHERE id = $1 AND status != 'deleted'`,
      [productId]
    );

    if (!prodRows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    if (String(prodRows[0].seller_id) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to manage this product.' });
    }

    const currentSponsored = Boolean(prodRows[0].is_sponsored);

    // If currently sponsored -> turn off freely
    if (currentSponsored) {
      const { rows: updated } = await query(
        `UPDATE products SET is_sponsored = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, is_sponsored`,
        [productId]
      );
      const { rows: countRows } = await query(
        `SELECT COUNT(*) AS count FROM products WHERE seller_id = $1 AND is_sponsored = TRUE AND status != 'deleted'`,
        [userId]
      );
      return res.json({
        success: true,
        message: 'Product removed from sponsored showcase.',
        data: {
          id: updated[0].id,
          is_sponsored: false,
          sponsored_count: parseInt(countRows[0]?.count || 0, 10)
        }
      });
    }

    // If trying to turn ON -> check plan cap!
    const { rows: profRows } = await query(
      `SELECT COALESCE(sp.subscription_plan, s.subscription_plan, 'basic') AS subscription_plan
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    const planKey = profRows[0]?.subscription_plan || 'basic';
    const planDef = getPlan(planKey);

    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS count FROM products WHERE seller_id = $1 AND is_sponsored = TRUE AND status != 'deleted'`,
      [userId]
    );
    const activeSponsored = parseInt(countRows[0]?.count || 0, 10);

    if (activeSponsored >= planDef.sponsorCap) {
      return res.status(400).json({
        success: false,
        message: `You have reached your limit of ${planDef.sponsorCap} sponsored product(s) for the ${planDef.name} plan. Upgrade your plan to sponsor more products.`,
        data: {
          current_plan: planDef.id,
          sponsor_cap: planDef.sponsorCap,
          active_sponsored: activeSponsored
        }
      });
    }

    const { rows: updated } = await query(
      `UPDATE products SET is_sponsored = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id, is_sponsored`,
      [productId]
    );

    return res.json({
      success: true,
      message: `Product is now sponsored! (${activeSponsored + 1}/${planDef.sponsorCap} used)`,
      data: {
        id: updated[0].id,
        is_sponsored: true,
        sponsored_count: activeSponsored + 1,
        sponsor_cap: planDef.sponsorCap
      }
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/seller/customisations or /api/seller/customised (seller only)
// ---------------------------------------------------------------------------
async function getCustomisedListings(req, res, next) {
  try {
    req.query.custom = 'true';
    const productController = require('./product.controller');
    return productController.getSellerProducts(req, res, next);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCustomisedListings,
  getCustomizedListings: getCustomisedListings,
  getOwnSellerProfile,
  updateSellerProfile,
  getPublicSellerProfile,
  updateStoreConfig,
  toggleVacationMode,
  uploadProfilePhoto,
  uploadBannerPhoto,
  uploadAboutImage,
  checkHandleAvailability,
  applyAsSeller,
  getApplicationStatus,
  completeOnboarding,
  getDashboardMetrics,
  getSellerAnalytics,
  getSellerOrders,
  getSellerOrderDetail,
  updateSellerOrderStatus,
  updateOrderTracking,
  uploadCustomProof,
  getPayoutOverview,
  getSellerPayouts: getPayoutOverview,
  getSellerWallet,
  getWallet: getSellerWallet,
  getSellerEarnings,
  getSellerEarningsGraph,
  getReceivingDetails,
  saveReceivingDetails,
  getPaymentHistory,
  getTaxSettings,
  saveTaxSettings,
  getSellerInvoices,
  getSellerDisputes,
  requestPayout,
  getOrderLabel,
  generateOrderAWB,
  getCatalogSummary,
  updateListingDiscount,
  bulkDiscountListings,
  bulkDiscountAllListings,
  followSeller,
  unfollowSeller,
  // Subscription handlers
  getSubscription,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  downgradeSubscription,
  toggleProductSponsor,
  toggleZaiMode,
  getReviewSettings,
  saveReviewSettings,
  changeSellerPassword,
  getOnboardingStatus,
  dismissTour,
  saveBillingAndBanking,
  updateBillingProfile,
  updatePickupAddress,
};

