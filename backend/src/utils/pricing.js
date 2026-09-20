'use strict';

const SHIPPING_PER_SELLER_PAISE = 7900;
const SHIPPING_CAP_PAISE = 25000;

/**
 * Calculate shipping in integer paise based on distinct seller count.
 * ₹79 per distinct seller, capped at ₹250.
 * @param {number} sellerCount
 * @returns {number} shipping in paise
 */
function calcShippingPaise(sellerCount) {
  const count = Number(sellerCount) || 0;
  if (count <= 0) return 0;
  return Math.min(count * SHIPPING_PER_SELLER_PAISE, SHIPPING_CAP_PAISE);
}

/**
 * Compute order totals in integer paise.
 * Total = Math.max(0, subtotal - discount + shipping)
 * @param {object} params
 * @param {number} params.subtotalPaise
 * @param {number} [params.discountPaise=0]
 * @param {number} [params.sellerCount=0]
 * @returns {{ subtotal_paise: number, shipping_paise: number, discount_paise: number, total_paise: number }}
 */
function computeOrderTotals({ subtotalPaise = 0, discountPaise = 0, sellerCount = 0 } = {}) {
  const subtotal_paise = Math.round(Number(subtotalPaise) || 0);
  const discount_paise = Math.round(Number(discountPaise) || 0);
  const shipping_paise = calcShippingPaise(sellerCount);
  const total_paise = Math.max(0, subtotal_paise - discount_paise + shipping_paise);

  return {
    subtotal_paise,
    shipping_paise,
    discount_paise,
    total_paise,
  };
}

module.exports = {
  SHIPPING_PER_SELLER_PAISE,
  SHIPPING_CAP_PAISE,
  calcShippingPaise,
  computeOrderTotals,
};
