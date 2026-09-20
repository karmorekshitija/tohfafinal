/**
 * Tohfa v2 — End-to-End Browser Category Routing Verification
 * File: backend/tests/e2e_category_routing.js
 */
'use strict';

require('dotenv').config();
const puppeteer = require('puppeteer-core');
const { query } = require('../src/config/db');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE_URL = 'http://localhost:5173';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, name, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${name} ${detail ? '— ' + detail : ''}`);
  }
}

async function runE2E() {
  console.log('====================================================');
  console.log('🌐 BROWSER E2E CATEGORY ROUTING & RESOLUTION TEST');
  console.log('====================================================\n');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // -------------------------------------------------------------
    // TEST 1: Nails & Beauty page
    // -------------------------------------------------------------
    console.log('--- Test 1: Nails & Beauty Category Page ---');
    await page.goto(`${BASE_URL}/buyer/category.html?slug=nails-beauty`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#category-title', { timeout: 10000 });
    // Small delay for fetch completion
    await new Promise(r => setTimeout(r, 1200));

    const titleText = await page.$eval('#category-title', el => el.innerText);
    const docTitle = await page.title();
    assert(titleText.toLowerCase().includes('nails & beauty'), 'Category header says "Nails & Beauty"', `Got: "${titleText}"`);
    assert(docTitle.toLowerCase().includes('nails & beauty'), 'Document title includes "Nails & Beauty"', `Got: "${docTitle}"`);
    assert(!titleText.toLowerCase().includes('candles'), 'Does NOT show Candles & Aromatherapy');

    // -------------------------------------------------------------
    // TEST 2: Unknown Collection Slug (Must show 404, never candles)
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Unknown Collection (404 Page) ---');
    await page.goto(`${BASE_URL}/buyer/category.html?slug=totally-unknown-nonexistent-category`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1200));

    const notFoundHeader = await page.$eval('main', el => el.innerText);
    const notFoundTitle = await page.title();
    assert(notFoundHeader.includes("We couldn't find that collection"), 'Shows "We couldn\'t find that collection" heading');
    assert(notFoundTitle.includes('Collection not found'), 'Title is "Collection not found | Tohfa"', `Got: "${notFoundTitle}"`);
    assert(!notFoundHeader.includes('Candles & Aromatherapy'), 'Never displays Candles & Aromatherapy');

    const heroHeaderHidden = await page.$eval('#category-hero-header', el => el.classList.contains('hidden'));
    assert(heroHeaderHidden === true, 'Hero header is hidden on 404');

    const filterBarHidden = await page.$eval('#category-filter-bar', el => el.classList.contains('hidden'));
    assert(filterBarHidden === true, 'Filter bar is hidden on 404');

    // -------------------------------------------------------------
    // TEST 3: Dead / Retired Slug (candles-fragrance must 404)
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Dead Slug "candles-fragrance" (Must 404) ---');
    await page.goto(`${BASE_URL}/buyer/category.html?slug=candles-fragrance`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1200));

    const deadSlugContent = await page.$eval('main', el => el.innerText);
    assert(deadSlugContent.includes("We couldn't find that collection"), 'Retired slug displays 404 Not Found');
    assert(!deadSlugContent.includes('active creations'), 'Does not render product grid or active creations');

    // -------------------------------------------------------------
    // TEST 4: Empty Slug (/buyer/category.html) -> Redirects to /buyer/categories.html
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Empty Slug (/buyer/category.html) ---');
    await page.goto(`${BASE_URL}/buyer/category.html`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1200));
    const currentUrl = page.url();
    assert(currentUrl.includes('/buyer/categories.html'), 'Bare category.html redirects to /buyer/categories.html', `Got: ${currentUrl}`);

    // -------------------------------------------------------------
    // TEST 5: Cart Empty Popular Category Bubbles
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Cart Empty Popular Category Bubbles ---');
    await page.goto(`${BASE_URL}/buyer/cart-empty.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#popular-categories-container a', { timeout: 10000 });

    const bubbleLinks = await page.$$eval('#popular-categories-container a', els =>
      els.map(a => ({ text: a.innerText, href: a.getAttribute('href') }))
    );
    assert(bubbleLinks.length > 0, `Popular category bubbles loaded dynamically (count: ${bubbleLinks.length})`);
    for (const b of bubbleLinks) {
      assert(!b.href.includes('jewellery') || b.href.includes('jewellery-wearables'), `Bubble href is not dead slug: ${b.href}`);
      assert(!b.href.includes('candles-fragrance'), `Bubble href does not use candles-fragrance: ${b.href}`);
      assert(!b.href.includes('art-portraits'), `Bubble href does not use art-portraits: ${b.href}`);
      assert(!b.href.includes('hampers'), `Bubble href does not use hampers: ${b.href}`);
    }

    // -------------------------------------------------------------
    // TEST 6: Brand New QA Category Lifecycle
    // -------------------------------------------------------------
    console.log('\n--- Test 6: QA New Category Lifecycle & Deactivation ---');
    const testSlug = 'woodcraft-and-carvings';
    const testName = 'Woodcraft & Carvings';

    // 1. Clean up prior test data if any
    await query('DELETE FROM categories WHERE slug = $1', [testSlug]);

    // 2. Insert new category
    const { rows: insertedCat } = await query(
      `INSERT INTO categories (name, display_name, slug, emoji_icon, icon_emoji, is_active, sort_order)
       VALUES ($1, $1, $2, '🪵', '🪵', TRUE, 99)
       RETURNING id`,
      [testName, testSlug]
    );
    const newCatId = insertedCat[0].id;
    console.log(`  [Setup] Created QA test category with ID: ${newCatId}`);

    // 3. Navigate to new category in browser
    await page.goto(`${BASE_URL}/buyer/category.html?slug=${testSlug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#category-title', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1200));

    const newCatHeader = await page.$eval('#category-title', el => el.innerText);
    const newCatEmoji = await page.$eval('#category-emoji', el => el.innerText);
    assert(newCatHeader === testName, `New category renders correctly in browser: "${newCatHeader}"`);
    assert(newCatEmoji === '🪵', `New category renders correct emoji: "${newCatEmoji}"`);

    // 4. Deactivate the new category
    await query('UPDATE categories SET is_active = FALSE WHERE id = $1', [newCatId]);
    console.log(`  [Action] Deactivated QA test category ID: ${newCatId}`);

    // 5. Reload the page
    await page.goto(`${BASE_URL}/buyer/category.html?slug=${testSlug}`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1200));

    const deactivatedMain = await page.$eval('main', el => el.innerText);
    assert(deactivatedMain.includes("We couldn't find that collection"), 'Deactivated category immediately renders 404');
    assert(!deactivatedMain.includes('Candles & Aromatherapy'), 'Deactivated category NEVER falls back to candles');

    // 6. Clean up QA category
    await query('DELETE FROM categories WHERE id = $1', [newCatId]);
    console.log(`  [Cleanup] Deleted QA test category.`);

  } finally {
    await browser.close();
  }

  console.log('\n====================================================');
  console.log(`TOTAL E2E TESTS: ${totalTests}`);
  console.log(`PASSED:          ${passedTests}`);
  console.log(`FAILED:          ${failedTests}`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL BROWSER E2E TESTS PASSED!\n');
    process.exit(0);
  }
}

runE2E().catch(err => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
