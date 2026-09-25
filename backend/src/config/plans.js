/**
 * Tohfa v2 — Seller Subscription Plans Configuration
 * File: backend/src/config/plans.js
 * Role: Single source of truth for seller tier pricing, sponsorship caps,
 *       bulk priority, badges, and launch discount rules.
 */
'use strict';

const PLANS = {
  basic: {
    id: 'basic',
    name: 'Basic',
    displayName: 'Basic Studio',
    price: 0,
    launchPrice: 0,
    launchSlots: 0,
    sponsorCap: 0,
    bulkPriority: 3,
    metaAds: false,
    badge: null,
    tagline: 'Start your artisan journey',
    features: [
      'List handcrafted products',
      'Accept orders & secure payments',
      'Basic seller dashboard & analytics',
      'Direct customer reviews & ratings',
      'Customization order management',
      'WhatsApp order notifications',
      'Bulk order eligibility (Standard priority)'
    ]
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    displayName: 'Pro Studio',
    price: 499,
    launchPrice: 299,
    launchSlots: 20,
    sponsorCap: 3,
    bulkPriority: 2,
    metaAds: true,
    badge: 'Pro Studio',
    tagline: 'Accelerate your studio reach',
    features: [
      'Everything in Basic',
      'Up to 3 Sponsored Products (Sitewide feature)',
      'Priority placement in category pages',
      '"Pro Studio" trust badge on public profile',
      'Meta & Instagram promotion eligibility',
      'Advanced analytics & revenue insights',
      'Priority bulk & corporate orders routing'
    ]
  },
  max: {
    id: 'max',
    name: 'Max',
    displayName: 'Max Studio',
    price: 999,
    launchPrice: 799,
    launchSlots: 20,
    sponsorCap: 5,
    bulkPriority: 1,
    metaAds: true,
    badge: 'Max Studio',
    tagline: 'The complete enterprise growth engine',
    features: [
      'Everything in Pro',
      'Up to 5 Sponsored Products (Top sitewide carousel)',
      '"Max Studio" premium badge — top trust signal',
      'Highest priority for Bulk & Corporate orders',
      'Featured placement in Meta Ads campaigns',
      'Dedicated seller support & faster resolution',
      'Early access to new Tohfa promotional drops'
    ]
  }
};

/**
 * Returns plan definition or basic fallback
 */
function getPlan(planId) {
  const normalized = (planId || 'basic').toLowerCase().trim();
  return PLANS[normalized] || PLANS.basic;
}

/**
 * Resolves effective price based on active discount slots from database ledger
 * @param {string} planId
 * @param {number} paidSellersCount - Total sellers who have historically used launch discount for this plan
 * @param {boolean} [alreadyUsedBySeller=false] - If this specific seller already used their launch discount
 */
function calculateEffectivePrice(planId, paidSellersCount = 0, alreadyUsedBySeller = false) {
  const plan = getPlan(planId);
  if (plan.price === 0) {
    return {
      planId: plan.id,
      name: plan.name,
      amount: 0,
      regularPrice: 0,
      isDiscountApplied: false,
      slotsLeft: 0,
      badge: plan.badge
    };
  }

  const launchLimit = plan.launchSlots || 20;
  const slotsLeft = Math.max(0, launchLimit - paidSellersCount);
  const eligible = slotsLeft > 0 && !alreadyUsedBySeller;

  return {
    planId: plan.id,
    name: plan.name,
    amount: eligible ? plan.launchPrice : plan.price,
    regularPrice: plan.price,
    launchPrice: plan.launchPrice,
    isDiscountApplied: eligible,
    slotsLeft,
    badge: plan.badge,
    sponsorCap: plan.sponsorCap,
    bulkPriority: plan.bulkPriority,
    metaAds: plan.metaAds
  };
}

module.exports = {
  PLANS,
  getPlan,
  calculateEffectivePrice
};
