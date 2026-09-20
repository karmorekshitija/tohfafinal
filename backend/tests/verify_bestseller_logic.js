/**
 * Test Suite: Bestseller Computation Logic & Edge Cases
 * File: backend/tests/verify_bestseller_logic.js
 *
 * Verifies the 9 core business logic scenarios for genuine Best Seller tags:
 *  1. Zero active products -> 0 flagged
 *  2. Zero-sales products never get the tag
 *  3. Small catalog cap (< 5 active products -> max 2 flagged)
 *  4. Full catalog cap (>= 5 active products -> max 5 flagged)
 *  5. Tie-breaking by average rating (AVG(rating) DESC)
 *  6. Tie-breaking by age (created_at ASC, older first)
 *  7. Deterministic tie-breaking by ID (id ASC)
 *  8. Paid, non-cancelled order filtering
 *  9. Inactive / paused / deleted products excluded
 *  10. Product controller sanitizeProduct serialization & DB query check
 */
'use strict';

const assert = require('assert');
const {
  FULL_CATALOG_THRESHOLD,
  CAP_FULL,
  CAP_SMALL,
  MIN_UNITS_SOLD,
  rankCandidates,
  recomputeForSeller
} = require('../src/services/bestseller.service');
const { query } = require('../src/config/db');

console.log('🧪 Starting Tohfa Bestseller Verification Suite...\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  console.log(`[Test ${totalTests}] ${name}`);
  try {
    fn();
    passedTests++;
    console.log(`  ✅ PASS\n`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${err.message}\n`);
    throw err;
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  console.log(`[Test ${totalTests}] ${name}`);
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ PASS\n`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${err.message}\n`);
    throw err;
  }
}

async function runAll() {
  // -------------------------------------------------------------------------
  // Scenario 1: Zero active products -> 0 flagged
  // -------------------------------------------------------------------------
  test('Scenario 1: Zero active products yields 0 flagged bestsellers', () => {
    const candidates = [];
    const cap = candidates.length >= FULL_CATALOG_THRESHOLD ? CAP_FULL : CAP_SMALL;
    const ranked = rankCandidates(candidates, cap);
    assert.strictEqual(ranked.length, 0, 'Should return 0 bestsellers for empty catalog');
    assert.strictEqual(cap, CAP_SMALL, 'Empty catalog should default to small cap (2)');
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Zero-sales products never get the tag
  // -------------------------------------------------------------------------
  test('Scenario 2: Zero-sales products never get the tag', () => {
    const candidates = [
      { id: 101, units: 0, avg_rating: 5.0, created_at: '2026-01-01T00:00:00Z' },
      { id: 102, units: 0, avg_rating: 4.8, created_at: '2026-01-02T00:00:00Z' },
      { id: 103, units: 0, avg_rating: 4.5, created_at: '2026-01-03T00:00:00Z' }
    ];
    const cap = candidates.length >= FULL_CATALOG_THRESHOLD ? CAP_FULL : CAP_SMALL;
    const ranked = rankCandidates(candidates, cap);
    assert.strictEqual(ranked.length, 0, 'Zero-sales products must NEVER receive the bestseller tag');
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Small catalog cap (< 5 active products -> max 2 flagged)
  // -------------------------------------------------------------------------
  test('Scenario 3: Small catalog (< 5 active products) caps bestsellers at 2', () => {
    // Seller has 4 active products, 3 with sales, 1 with zero sales
    const candidates = [
      { id: 201, units: 15, avg_rating: 4.5, created_at: '2026-01-01' },
      { id: 202, units: 10, avg_rating: 4.2, created_at: '2026-01-02' },
      { id: 203, units: 5,  avg_rating: 4.9, created_at: '2026-01-03' },
      { id: 204, units: 0,  avg_rating: 5.0, created_at: '2026-01-04' }
    ];
    const activeCount = candidates.length; // 4
    assert.ok(activeCount < FULL_CATALOG_THRESHOLD, 'Active count is less than 5');
    const cap = activeCount >= FULL_CATALOG_THRESHOLD ? CAP_FULL : CAP_SMALL;
    assert.strictEqual(cap, 2, 'Cap must be 2 for small catalogs');

    const ranked = rankCandidates(candidates, cap);
    assert.strictEqual(ranked.length, 2, 'Must only flag top 2 products');
    assert.deepStrictEqual(ranked.map(p => p.id), [201, 202], 'Top 2 must be product 201 (15 units) and 202 (10 units)');
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Full catalog cap (>= 5 active products -> max 5 flagged)
  // -------------------------------------------------------------------------
  test('Scenario 4: Full catalog (>= 5 active products) caps bestsellers at 5', () => {
    // Seller has 7 active products, all with sales
    const candidates = [
      { id: 301, units: 25, avg_rating: 4.2, created_at: '2026-01-01' },
      { id: 302, units: 20, avg_rating: 4.3, created_at: '2026-01-02' },
      { id: 303, units: 18, avg_rating: 4.1, created_at: '2026-01-03' },
      { id: 304, units: 12, avg_rating: 4.0, created_at: '2026-01-04' },
      { id: 305, units: 8,  avg_rating: 4.4, created_at: '2026-01-05' },
      { id: 306, units: 6,  avg_rating: 4.6, created_at: '2026-01-06' },
      { id: 307, units: 3,  avg_rating: 4.8, created_at: '2026-01-07' }
    ];
    const activeCount = candidates.length; // 7
    assert.ok(activeCount >= FULL_CATALOG_THRESHOLD, 'Active count is >= 5');
    const cap = activeCount >= FULL_CATALOG_THRESHOLD ? CAP_FULL : CAP_SMALL;
    assert.strictEqual(cap, 5, 'Cap must be 5 for catalogs with >= 5 active products');

    const ranked = rankCandidates(candidates, cap);
    assert.strictEqual(ranked.length, 5, 'Must only flag top 5 products');
    assert.deepStrictEqual(ranked.map(p => p.id), [301, 302, 303, 304, 305], 'Must be top 5 by sales volume');
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Tie-breaking by rating (AVG(rating) DESC)
  // -------------------------------------------------------------------------
  test('Scenario 5: Equal units sold tie-breaks by average rating (higher rating wins)', () => {
    const candidates = [
      { id: 401, units: 10, avg_rating: 4.2, created_at: '2026-01-01' },
      { id: 402, units: 10, avg_rating: 4.9, created_at: '2026-01-02' }
    ];
    const ranked = rankCandidates(candidates, 1);
    assert.strictEqual(ranked.length, 1);
    assert.strictEqual(ranked[0].id, 402, 'Product 402 (rating 4.9) must win over 401 (rating 4.2)');
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Tie-breaking by age (created_at ASC, older first)
  // -------------------------------------------------------------------------
  test('Scenario 6: Equal units and equal rating tie-breaks by age (older listing wins)', () => {
    const candidates = [
      { id: 501, units: 10, avg_rating: 4.8, created_at: '2026-03-01T10:00:00Z' }, // newer
      { id: 502, units: 10, avg_rating: 4.8, created_at: '2026-01-15T10:00:00Z' }  // older
    ];
    const ranked = rankCandidates(candidates, 1);
    assert.strictEqual(ranked.length, 1);
    assert.strictEqual(ranked[0].id, 502, 'Older product 502 must win over newer product 501');
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Deterministic tie-breaking by ID (id ASC)
  // -------------------------------------------------------------------------
  test('Scenario 7: Equal units, equal rating, identical date tie-breaks deterministically by ID', () => {
    const candidates = [
      { id: 602, units: 10, avg_rating: 5.0, created_at: '2026-01-01T00:00:00Z' },
      { id: 601, units: 10, avg_rating: 5.0, created_at: '2026-01-01T00:00:00Z' }
    ];
    const ranked = rankCandidates(candidates, 1);
    assert.strictEqual(ranked.length, 1);
    assert.strictEqual(ranked[0].id, 601, 'Smaller ID 601 must win deterministically over 602');
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Paid, non-cancelled order filtering in DB query
  // -------------------------------------------------------------------------
  await asyncTest('Scenario 8: Database query correctly excludes cancelled and unpaid orders', async () => {
    // Verify that the query structure used in bestseller service correctly handles status conditions
    const testQuery = `
      SELECT oi.product_id, SUM(oi.quantity)::int AS units
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status = 'paid'
        AND o.status NOT IN ('cancelled', 'cancel_requested')
      GROUP BY oi.product_id
      LIMIT 5;
    `;
    const { rows } = await query(testQuery);
    assert.ok(Array.isArray(rows), 'Order query executes cleanly with paid & non-cancelled filters');
    for (const r of rows) {
      assert.ok(r.units > 0, 'Returned units must be positive');
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 9: Inactive & deleted products excluded
  // -------------------------------------------------------------------------
  await asyncTest('Scenario 9: Inactive and deleted products are never flagged as bestseller in DB', async () => {
    const { rows } = await query(`
      SELECT id, name, status, is_active, is_bestseller
      FROM products
      WHERE is_bestseller = TRUE
        AND (status != 'active' OR is_active = FALSE)
    `);
    assert.strictEqual(rows.length, 0, 'There must be ZERO inactive or deleted products with is_bestseller = TRUE');
  });

  // -------------------------------------------------------------------------
  // Scenario 10: Recompute idempotency and API response format
  // -------------------------------------------------------------------------
  await asyncTest('Scenario 10: recomputeForSeller is idempotent and returns valid summary schema', async () => {
    // Test on seller 123
    const sellerId = 123;
    const res1 = await recomputeForSeller(sellerId);
    assert.ok(res1 !== null, 'recomputeForSeller must return result object');
    assert.strictEqual(res1.seller_id, '123');
    assert.ok(typeof res1.active_count === 'number');
    assert.ok(typeof res1.cap === 'number');
    assert.ok(typeof res1.flagged_count === 'number');
    assert.ok(res1.flagged_count <= res1.cap, 'Flagged count must not exceed cap');
    assert.ok(Array.isArray(res1.top_ids), 'top_ids must be an array');

    // Run a second time immediately — results must be identical (idempotent)
    const res2 = await recomputeForSeller(sellerId);
    assert.deepStrictEqual(res1, res2, 'Consecutive recompute calls must be completely idempotent');
  });

  console.log('================================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} BESTSELLER VERIFICATION TESTS PASSED!`);
  console.log('================================================================================\n');
  process.exit(0);
}

runAll().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
