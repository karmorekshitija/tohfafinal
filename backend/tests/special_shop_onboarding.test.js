'use strict';

const assert = require('assert');
const { evaluateSellerOnboarding } = require('../src/utils/sellerOnboarding');

describe('Seller Onboarding: Normal Seller vs Special Shop Gating', () => {
  test('Null seller evaluates to incomplete with missing requirements', () => {
    const res = evaluateSellerOnboarding(null);
    expect(res.isComplete).toBe(false);
    expect(res.hasBillingAddress).toBe(false);
    expect(res.hasBankingDetails).toBe(false);
    expect(res.missing).toContain('billing_address');
    expect(res.missing).toContain('banking_details');
  });

  test('Normal seller with empty fields evaluates to incomplete', () => {
    const normalSeller = {
      user_id: 101,
      store_name: 'Artisan Studio',
      billing_address: '{}',
      pickup_address: '{}',
      bank_details: '{}',
      is_admin_managed: false
    };
    const res = evaluateSellerOnboarding(normalSeller);
    expect(res.isComplete).toBe(false);
    expect(res.hasBillingAddress).toBe(false);
    expect(res.hasBankingDetails).toBe(false);
    expect(res.missing).toEqual(['billing_address', 'banking_details']);
  });

  test('Normal seller with valid address but missing bank details is blocked', () => {
    const normalSellerWithAddress = {
      user_id: 102,
      store_name: 'Jaipur Crafts',
      billing_address: JSON.stringify({
        address_line1: '12 Johari Bazaar',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302003'
      }),
      bank_details: '{}',
      is_admin_managed: false
    };
    const res = evaluateSellerOnboarding(normalSellerWithAddress);
    expect(res.hasBillingAddress).toBe(true);
    expect(res.hasBankingDetails).toBe(false);
    expect(res.isComplete).toBe(false);
    expect(res.missing).toEqual(['banking_details']);
  });

  test('Normal seller with full valid billing and banking details completes onboarding', () => {
    const completeSeller = {
      user_id: 103,
      store_name: 'Heritage Textiles',
      billing_address: JSON.stringify({
        address_line1: '45 Artisan Way',
        city: 'Udaipur',
        state: 'Rajasthan',
        pincode: '313001'
      }),
      bank_details: JSON.stringify({
        account_holder_name: 'Kshitija Karmore',
        account_number: '123456789012',
        ifsc_code: 'HDFC0001234'
      }),
      is_admin_managed: false
    };
    const res = evaluateSellerOnboarding(completeSeller);
    expect(res.hasBillingAddress).toBe(true);
    expect(res.hasBankingDetails).toBe(true);
    expect(res.isComplete).toBe(true);
    expect(res.missing).toEqual([]);
  });

  test('Tohfa Special shop with is_admin_managed: true is exempt from artisan bank requirements', () => {
    const specialShop = {
      user_id: 201,
      store_name: 'Crochet Lady',
      slug: 'crochet-lady',
      pickup_address: JSON.stringify({
        address_line1: 'Studio 101, Artisan Textile Hub',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302001'
      }),
      billing_address: null,
      bank_details: null,
      is_admin_managed: true
    };
    const res = evaluateSellerOnboarding(specialShop);
    expect(res.isComplete).toBe(true);
    expect(res.hasBillingAddress).toBe(true);
    expect(res.hasBankingDetails).toBe(true);
    expect(res.onboardingTourDismissed).toBe(true);
    expect(res.isAdminManaged).toBe(true);
    expect(res.missing).toEqual([]);
    expect(res.details.bank.account_holder).toBe('Platform Managed');
    expect(res.details.bank.ifsc_code).toBe('PLATFORM');
  });

  test('Tohfa Special shop with seller_type: "special" is recognized as complete', () => {
    const specialShopByType = {
      user_id: 202,
      store_name: 'The Candle Story',
      slug: 'the-candle-story',
      seller_type: 'special',
      pickup_address: '{}',
      bank_details: '{}'
    };
    const res = evaluateSellerOnboarding(specialShopByType);
    expect(res.isComplete).toBe(true);
    expect(res.hasBillingAddress).toBe(true);
    expect(res.hasBankingDetails).toBe(true);
    expect(res.isAdminManaged).toBe(true);
    expect(res.missing).toEqual([]);
  });

  test('Tohfa Special shop with string / integer is_admin_managed variations is recognized as complete', () => {
    ['true', 1, '1', 't'].forEach(val => {
      const shop = {
        user_id: 203,
        store_name: 'Nails Diva',
        is_admin_managed: val,
        bank_details: null
      };
      const res = evaluateSellerOnboarding(shop);
      expect(res.isComplete).toBe(true);
      expect(res.hasBankingDetails).toBe(true);
      expect(res.isAdminManaged).toBe(true);
    });
  });
});
