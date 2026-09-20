'use strict';

const {
  SHIPPING_PER_SELLER_PAISE,
  SHIPPING_CAP_PAISE,
  calcShippingPaise,
  computeOrderTotals,
} = require('../src/utils/pricing');

describe('Pricing Utilities', () => {
  describe('Constants', () => {
    test('exports expected constants', () => {
      expect(SHIPPING_PER_SELLER_PAISE).toBe(7900);
      expect(SHIPPING_CAP_PAISE).toBe(25000);
    });
  });

  describe('calcShippingPaise', () => {
    test('calculates correct shipping in paise across seller counts', () => {
      expect(calcShippingPaise(0)).toBe(0);
      expect(calcShippingPaise(1)).toBe(7900);
      expect(calcShippingPaise(3)).toBe(23700);
      expect(calcShippingPaise(4)).toBe(25000);
      expect(calcShippingPaise(10)).toBe(25000);
    });

    test('handles zero and negative counts gracefully', () => {
      expect(calcShippingPaise(-1)).toBe(0);
      expect(calcShippingPaise(null)).toBe(0);
      expect(calcShippingPaise(undefined)).toBe(0);
    });
  });

  describe('computeOrderTotals', () => {
    test('single seller without discount', () => {
      const totals = computeOrderTotals({ subtotalPaise: 49900, sellerCount: 1 });
      expect(totals.shipping_paise).toBe(7900);
      expect(totals.subtotal_paise).toBe(49900);
      expect(totals.discount_paise).toBe(0);
      expect(totals.total_paise).toBe(57800);
    });

    test('single seller with discount', () => {
      const totals = computeOrderTotals({ subtotalPaise: 49900, discountPaise: 5000, sellerCount: 1 });
      expect(totals.shipping_paise).toBe(7900);
      expect(totals.subtotal_paise).toBe(49900);
      expect(totals.discount_paise).toBe(5000);
      expect(totals.total_paise).toBe(52800);
    });

    test('empty cart with zero sellers', () => {
      const totals = computeOrderTotals({ subtotalPaise: 0, sellerCount: 0 });
      expect(totals.shipping_paise).toBe(0);
      expect(totals.subtotal_paise).toBe(0);
      expect(totals.discount_paise).toBe(0);
      expect(totals.total_paise).toBe(0);
    });
  });
});
