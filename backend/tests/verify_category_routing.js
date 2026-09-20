/**
 * Tohfa v2 — Category Routing & Strict Resolution Verification Test
 * File: backend/tests/verify_category_routing.js
 */
'use strict';

require('dotenv').config();
const { query } = require('../src/config/db');
const { resolveCategoryId } = require('../src/controllers/product.controller');
const { slugify, isReservedSlug } = require('../src/utils/slug');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:4000/api';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${testName} ${details ? '— ' + details : ''}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 VERIFY CATEGORY ROUTING & STRICT RESOLUTION SUITE');
  console.log('====================================================\n');

  // ---------------------------------------------------------
  // TEST SUITE 1: Slug Utility Unit Tests
  // ---------------------------------------------------------
  console.log('--- Suite 1: Canonical Slug Utility Tests ---');
  assert(slugify('Nails & Beauty') === 'nails-and-beauty', 'slugify replaces & with and');
  assert(slugify('Café & Crème Décor') === 'cafe-and-creme-decor', 'slugify strips accents (NFKD)');
  assert(slugify('   Home   Decor---Living   ') === 'home-decor-living', 'slugify collapses hyphens and whitespace');
  assert(slugify('Candles-Aromatherapy!') === 'candles-aromatherapy', 'slugify strips special chars and punctuation');
  assert(isReservedSlug('best-sellers') === true, 'isReservedSlug recognizes best-sellers');
  assert(isReservedSlug('all') === true, 'isReservedSlug recognizes all');
  assert(isReservedSlug('undefined') === true, 'isReservedSlug recognizes undefined');
  assert(isReservedSlug('candles-aromatherapy') === false, 'isReservedSlug passes valid collection slug');

  // ---------------------------------------------------------
  // TEST SUITE 2: Public Category Listing (GET /api/products/categories)
  // ---------------------------------------------------------
  console.log('\n--- Suite 2: Public Category Listing API ---');
  let activeCategories = [];
  try {
    const res = await fetch(`${API_BASE}/products/categories`);
    const json = await res.json();
    assert(res.status === 200 && json.success === true, 'GET /api/products/categories returns 200');
    activeCategories = json.data?.categories || [];
    assert(activeCategories.length >= 8, `Categories list has at least 8 active categories (found ${activeCategories.length})`);
    
    // Verify each returned category uses DB fields without guessing
    for (const cat of activeCategories) {
      assert(cat.id && cat.slug && cat.name, `Category has id, slug, and name: ${cat.slug}`);
      assert(cat.emoji_icon || cat.icon_emoji, `Category has DB emoji: ${cat.slug} -> ${cat.emoji_icon || cat.icon_emoji}`);
      assert(typeof cat.product_count === 'number', `Category has numeric product_count: ${cat.slug} -> ${cat.product_count}`);
    }
  } catch (err) {
    assert(false, 'Fetch /api/products/categories failed', err.message);
  }

  // ---------------------------------------------------------
  // TEST SUITE 3: Strict Slug Resolution (GET /api/products/categories/:slug)
  // ---------------------------------------------------------
  console.log('\n--- Suite 3: Strict Slug Resolver (GET /api/products/categories/:slug) ---');
  for (const cat of activeCategories) {
    try {
      const res = await fetch(`${API_BASE}/products/categories/${encodeURIComponent(cat.slug)}`);
      const json = await res.json();
      assert(res.status === 200 && json.success === true, `Active category resolves: ${cat.slug}`);
      assert(json.data?.category?.slug === cat.slug, `Resolved slug matches requested: ${cat.slug}`);
      assert(String(json.data?.category?.id) === String(cat.id), `Resolved ID matches: ${cat.id}`);

      // If category has subcategories, verify direct subcategory slug resolution
      if (Array.isArray(cat.subcategories) && cat.subcategories.length > 0) {
        for (const sub of cat.subcategories) {
          if (sub.slug) {
            const subRes = await fetch(`${API_BASE}/products/categories/${encodeURIComponent(sub.slug)}`);
            const subJson = await subRes.json();
            assert(subRes.status === 200 && subJson.success === true, `Subcategory resolves directly by slug: ${sub.slug}`);
            assert(subJson.data?.category?.id === cat.id, `Subcategory resolver returns parent root category`);
            assert(subJson.data?.selected_subcategory?.id === sub.id, `Subcategory selected_subcategory populated: ${sub.slug}`);
          }
        }
      }
    } catch (err) {
      assert(false, `Failed resolving category ${cat.slug}`, err.message);
    }
  }

  // ---------------------------------------------------------
  // TEST SUITE 4: Non-Existent, Inactive, and Retired Slugs (Must 404, never fallback)
  // ---------------------------------------------------------
  console.log('\n--- Suite 4: Unknown / Inactive / Dead Slugs (Must 404) ---');
  const deadSlugs = [
    'non-existent-craft-slug-999',
    'candles-fragrance',
    'art-portraits',
    'hampers',
    'home-decor-non-existent-sub',
    'nails', // Inactive category id: 65
    'jewellery',
    'invalid-category-xyz'
  ];

  for (const deadSlug of deadSlugs) {
    try {
      const res = await fetch(`${API_BASE}/products/categories/${encodeURIComponent(deadSlug)}`);
      const json = await res.json();
      assert(res.status === 404, `Dead/unknown slug "${deadSlug}" returns HTTP 404 (status: ${res.status})`);
      assert(json.code === 'CATEGORY_NOT_FOUND', `Dead/unknown slug returns CATEGORY_NOT_FOUND code`);
      assert(json.data === undefined, `Dead/unknown slug returns no category data`);
    } catch (err) {
      assert(false, `Request for dead slug "${deadSlug}" failed`, err.message);
    }
  }

  // ---------------------------------------------------------
  // TEST SUITE 5: resolveCategoryId Strictness
  // ---------------------------------------------------------
  console.log('\n--- Suite 5: resolveCategoryId Exact Matching ---');
  try {
    // 1. Exact ID
    const cat66 = await resolveCategoryId(66);
    assert(cat66 === 66, 'resolveCategoryId resolves exact integer ID 66');

    const cat66Str = await resolveCategoryId('66');
    assert(cat66Str === 66, 'resolveCategoryId resolves exact string ID "66"');

    // 2. Exact slug
    const catSlug = await resolveCategoryId('candles-aromatherapy');
    assert(catSlug === 66, 'resolveCategoryId resolves exact active slug "candles-aromatherapy"');

    // 3. Exact name
    const catName = await resolveCategoryId('Candles & Aromatherapy');
    assert(catName === 66, 'resolveCategoryId resolves exact name "Candles & Aromatherapy"');

    // 4. Inactive category must NOT resolve
    const catInactiveId = await resolveCategoryId(65);
    assert(catInactiveId === null, 'resolveCategoryId rejects inactive category id 65');

    const catInactiveSlug = await resolveCategoryId('nails');
    assert(catInactiveSlug === null, 'resolveCategoryId rejects inactive slug "nails"');

    // 5. Partial / fuzzy strings must NOT resolve
    const fuzzyNail = await resolveCategoryId('nail');
    assert(fuzzyNail === null, 'resolveCategoryId rejects partial fuzzy string "nail"');

    const fuzzyCandle = await resolveCategoryId('candle');
    assert(fuzzyCandle === null, 'resolveCategoryId rejects partial fuzzy string "candle"');

    const fuzzyFragrance = await resolveCategoryId('fragrance');
    assert(fuzzyFragrance === null, 'resolveCategoryId rejects partial fuzzy string "fragrance"');

    const empty = await resolveCategoryId('');
    assert(empty === null, 'resolveCategoryId returns null for empty string');

    const notFound = await resolveCategoryId('completely-bogus-category');
    assert(notFound === null, 'resolveCategoryId returns null for unknown category');
  } catch (err) {
    assert(false, 'resolveCategoryId test error', err.message);
  }

  // ---------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------
  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${totalTests}`);
  console.log(`PASSED:      ${passedTests}`);
  console.log(`FAILED:      ${failedTests}`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
