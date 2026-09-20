/**
 * Tohfa v2 — Bestseller Service
 * File: backend/src/services/bestseller.service.js
 * Role: Computes genuine Best Seller flags based on paid sales volume,
 *       rating tie-breaks, and per-seller caps.
 */
'use strict';

const { query } = require('../config/db');
const cron = require('node-cron');

const FULL_CATALOG_THRESHOLD = 5; // active products needed for the big cap
const CAP_FULL  = 5;              // seller has >= 5 active products
const CAP_SMALL = 2;              // seller has  < 5 active products
const MIN_UNITS_SOLD = 1;

/**
 * Recompute best seller flags for a single seller.
 * Updates is_bestseller in DB atomically.
 *
 * @param {string} sellerId - UUID of the seller (user_id)
 * @returns {Promise<{seller_id: string, active_count: number, cap: number, flagged_count: number, top_ids: string[]}>}
 */
async function recomputeForSeller(sellerId) {
  if (!sellerId) return null;

  // 1) Active products of this seller
  const { rows: activeProducts } = await query(
    `SELECT p.id, p.created_at
     FROM products p
     WHERE p.seller_id = $1
       AND p.status = 'active'
       AND (p.is_active IS NULL OR p.is_active = TRUE)
     ORDER BY p.created_at ASC, p.id ASC`,
    [sellerId]
  );

  const activeCount = activeProducts.length;
  const cap = activeCount >= FULL_CATALOG_THRESHOLD ? CAP_FULL : CAP_SMALL;

  let topIds = [];

  if (activeCount > 0) {
    const productIds = activeProducts.map(p => p.id);

    // 2) Units sold for active products in paid, non-cancelled orders
    const { rows: unitRows } = await query(
      `SELECT oi.product_id, SUM(oi.quantity)::int AS units
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.product_id = ANY($1::int[])
         AND o.payment_status = 'paid'
         AND o.status NOT IN ('cancelled', 'cancel_requested')
       GROUP BY oi.product_id`,
      [productIds]
    );

    const unitsMap = new Map();
    for (const row of unitRows) {
      unitsMap.set(String(row.product_id), parseInt(row.units, 10) || 0);
    }

    // 3) Average rating for active products
    const { rows: ratingRows } = await query(
      `SELECT product_id, AVG(rating)::numeric AS avg_rating
       FROM reviews
       WHERE product_id = ANY($1::int[])
       GROUP BY product_id`,
      [productIds]
    );

    const ratingMap = new Map();
    for (const row of ratingRows) {
      ratingMap.set(String(row.product_id), parseFloat(row.avg_rating) || 0);
    }

    // Combine data and filter by MIN_UNITS_SOLD
    const candidates = activeProducts.map(p => {
      const pidStr = String(p.id);
      return {
        id: p.id,
        created_at: p.created_at,
        units: unitsMap.get(pidStr) || 0,
        avg_rating: ratingMap.get(pidStr) || 0
      };
    });

    const ranked = rankCandidates(candidates, cap);
    topIds = ranked.map(p => p.id);
  }

  // Atomically update seller's products without updating updated_at timestamp
  await query(
    `UPDATE products
     SET is_bestseller = (id = ANY($2::int[]))
     WHERE seller_id = $1
       AND is_bestseller IS DISTINCT FROM (id = ANY($2::int[]))`,
    [sellerId, topIds]
  );

  return {
    seller_id: String(sellerId),
    active_count: activeCount,
    cap,
    flagged_count: topIds.length,
    top_ids: topIds
  };
}

/**
 * Recompute best sellers for all sellers involved in a given order.
 *
 * @param {string} orderId - UUID of the order
 */
async function recomputeForOrder(orderId) {
  if (!orderId) return;

  const { rows } = await query(
    `SELECT DISTINCT p.seller_id
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1`,
    [orderId]
  );

  for (const row of rows) {
    if (row.seller_id) {
      await recomputeForSeller(row.seller_id);
    }
  }
}

/**
 * Recompute best sellers for every seller that has at least one active product
 * or currently flagged product.
 *
 * @returns {Promise<Array<{seller_id: string, active_count: number, cap: number, flagged_count: number}>>}
 */
async function recomputeAll() {
  const { rows } = await query(
    `SELECT DISTINCT seller_id
     FROM products
     WHERE (status = 'active' AND (is_active IS NULL OR is_active = TRUE))
        OR is_bestseller = TRUE`
  );

  const results = [];
  for (const row of rows) {
    if (row.seller_id) {
      const res = await recomputeForSeller(row.seller_id);
      if (res) results.push(res);
    }
  }

  return results;
}

/**
 * Rank candidates according to business rules:
 * 1) units sold >= MIN_UNITS_SOLD (zero-sales never qualify)
 * 2) units DESC
 * 3) avg_rating DESC
 * 4) created_at ASC (older first)
 * 5) id ASC (deterministic fallback)
 * Top `cap` elements are returned.
 */
function rankCandidates(candidates, cap, minUnits = MIN_UNITS_SOLD) {
  const eligible = (candidates || []).filter(p => (p.units || 0) >= minUnits);
  eligible.sort((a, b) => {
    const aUnits = a.units || 0;
    const bUnits = b.units || 0;
    if (bUnits !== aUnits) return bUnits - aUnits;

    const aRating = a.avg_rating || 0;
    const bRating = b.avg_rating || 0;
    if (bRating !== aRating) return bRating - aRating;

    const aDate = new Date(a.created_at).getTime();
    const bDate = new Date(b.created_at).getTime();
    if (aDate !== bDate) return aDate - bDate;

    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });

  return eligible.slice(0, cap);
}

/**
 * Schedule daily cron job at 03:00 AM IST
 */
function startBestsellerCron() {
  cron.schedule('0 3 * * *', () => {
    console.log('[Bestseller] Starting daily scheduled recompute (03:00 IST)...');
    recomputeAll().then(res => {
      console.log(`[Bestseller] Scheduled recompute complete for ${res.length} sellers.`);
    }).catch(err => {
      console.error('[Bestseller] Scheduled recompute error:', err.message);
    });
  }, {
    timezone: 'Asia/Kolkata'
  });
  console.log('⭐ Tohfa Bestsellers Daily Cron Scheduler initialized (03:00 AM IST).');
}

module.exports = {
  FULL_CATALOG_THRESHOLD,
  CAP_FULL,
  CAP_SMALL,
  MIN_UNITS_SOLD,
  rankCandidates,
  recomputeForSeller,
  recomputeForOrder,
  recomputeAll,
  startBestsellerCron
};
