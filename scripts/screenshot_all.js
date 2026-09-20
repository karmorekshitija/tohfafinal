/**
 * Tohfa E-Commerce Screenshot Automation Script
 * Uses Puppeteer + Microsoft Edge (pre-installed)
 * Output: C:\Users\ACER\Downloads\ecom-screenshots\
 */

const puppeteer = require('c:/Users/ACER/OneDrive/Desktop/antigravity_workspace/tohfanew/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://www.thetohfa.in';
const OUT_DIR  = 'C:\\Users\\ACER\\Downloads\\ecom-screenshots';
const EDGE_EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PRODUCT_ID = 'f93b7477-205c-4109-b7ad-050a2dfb3bd0';
const CATEGORY_SLUG = 'candles';

// ── Auth token (fake non-expired JWT for visual purposes) ────────────────────
function makeFakeToken() {
  const h = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + 86400 * 30;
  const p = btoa(JSON.stringify({ id: 123, role: 'buyer', email: 'priya@example.com', exp }));
  return `${h}.${p}.mockSignature`;
}

// ── Mock API interceptor (for auth-gated pages) ───────────────────────────────
function setupInterceptor(page) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
  };

  page.on('request', req => {
    const url = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });

    const isXhr = req.resourceType() === 'xhr' || req.resourceType() === 'fetch';
    if (!isXhr) return req.continue();

    if (url.includes('/api/cart') && !url.includes('/cart/items') && !url.includes('/cart/merge')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: cors,
        body: JSON.stringify({
          success: true,
          data: {
            items: [
              { id: 'i1', product_id: PRODUCT_ID, name: 'Crochet Evil Eye Keychain',      seller_name: 'Crochet Lady',    seller_id: 's1', price_paise: 14900, quantity: 1, image_url: BASE_URL + '/img/categories/art_prints.jpg', available: true },
              { id: 'i2', product_id: 'c647b23c-eab3-4b50-9c9a-5700f2982bd9', name: 'Blue Daisy Scented Jar Candle', seller_name: 'The Candle Story', seller_id: 's2', price_paise: 29900, quantity: 2, image_url: BASE_URL + '/img/categories/candles.jpg', available: true },
            ],
            subtotal_paise: 74700, shipping_paise: 7900, total_paise: 82600, item_count: 3
          }
        })
      });
    }
    if (url.includes('/api/addresses') || url.includes('/addresses')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: cors,
        body: JSON.stringify({
          success: true,
          data: {
            addresses: [{
              id: 'a1', full_name: 'Priya Sharma',
              line1: 'Flat 402, Green Glen Layout', line2: 'Outer Ring Road, Bellandur',
              city: 'Bengaluru', state: 'Karnataka', pincode: '560103',
              phone: '+91 9876543210', is_default: true
            }]
          }
        })
      });
    }
    if (url.includes('/api/profile') || url.includes('/api/auth') || url.includes('/api/notifications') || url.includes('/api/wishlist') || url.includes('/api/cart/count')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: cors,
        body: JSON.stringify({
          success: true,
          data: { id: 123, name: 'Priya Sharma', email: 'priya@example.com', role: 'buyer', avatar_url: null, count: 0, items: [] }
        })
      });
    }
    return req.continue();
  });
}

// ── Inject auth tokens into page storage ─────────────────────────────────────
function injectAuth(token) {
  const user = JSON.stringify({ id: 123, name: 'Priya Sharma', email: 'priya@example.com', role: 'buyer' });
  sessionStorage.setItem('tohfa_access_token', token);
  localStorage.setItem('tohfa_access_token', token);
  sessionStorage.setItem('tohfa_auth_token', token);
  localStorage.setItem('tohfa_auth_token', token);
  sessionStorage.setItem('tohfa_user', user);
  localStorage.setItem('tohfa_user', user);
  sessionStorage.setItem('tohfa_user_data', user);
  localStorage.setItem('tohfa_user_data', user);
}

// ── Scroll to load lazy images, then scroll back to top ──────────────────────
async function scrollAndWait(page) {
  try {
    await page.evaluate(async () => {
      await document.fonts.ready;
      const maxScroll = document.body.scrollHeight;
      for (let y = 0; y <= maxScroll; y += 700) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 80));
      }
      await new Promise(r => setTimeout(r, 600));
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 400));
    });
  } catch (e) {
    // page may have navigated mid-scroll — wait for it to settle then continue
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 800));
  }
}

// ── Capture helper ────────────────────────────────────────────────────────────
async function capture(page, filename, fullPage = true) {
  const file = path.join(OUT_DIR, filename);
  await page.screenshot({ path: file, fullPage });
  const size = fs.statSync(file).size;
  console.log(`  ✓ ${filename} (${(size/1024).toFixed(0)} KB)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const token = makeFakeToken();

  const browser = await puppeteer.launch({
    executablePath: EDGE_EXE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'],
  });

  try {
    // ── DESKTOP (1440 x 900) ─────────────────────────────────────────────────
    console.log('\n── DESKTOP 1440×900 ─────────────────────────────────────');
    const desk = await browser.newPage();
    await desk.setViewport({ width: 1440, height: 900 });
    await desk.setRequestInterception(true);
    setupInterceptor(desk);

    // 01 Homepage
    console.log('01 Homepage...');
    await desk.evaluateOnNewDocument(injectAuth, token);
    await desk.goto(`${BASE_URL}/buyer/home`, { waitUntil: 'networkidle2', timeout: 30000 });
    await scrollAndWait(desk);
    await capture(desk, '01_homepage_desktop.png');

    // 02 PLP – Category
    console.log('02 PLP...');
    await desk.goto(`${BASE_URL}/buyer/category?slug=${CATEGORY_SLUG}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await scrollAndWait(desk);
    await capture(desk, '02_plp_desktop.png');

    // 03 PDP – Product
    console.log('03 PDP...');
    await desk.goto(`${BASE_URL}/buyer/product?id=${PRODUCT_ID}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await scrollAndWait(desk);
    await capture(desk, '03_pdp_desktop.png');

    // 04 Cart
    console.log('04 Cart...');
    await desk.goto(`${BASE_URL}/buyer/cart`, { waitUntil: 'networkidle2', timeout: 30000 });
    await scrollAndWait(desk);
    await capture(desk, '04_cart_desktop.png');

    // 05 Checkout
    console.log('05 Checkout...');
    await desk.goto(`${BASE_URL}/buyer/checkout`, { waitUntil: 'networkidle2', timeout: 30000 });
    await scrollAndWait(desk);
    await capture(desk, '05_checkout_desktop.png');

    // Extra buyer pages
    const extras = [
      ['buyer/categories',   '06_categories_desktop.png'],
      ['buyer/search',       '07_search_desktop.png'],
      ['buyer/wishlist',     '08_wishlist_desktop.png'],
      ['buyer/orders',       '09_orders_desktop.png'],
      ['buyer/profile',      '10_profile_desktop.png'],
      ['buyer/zip-gift',     '11_zipgift_desktop.png'],
      ['buyer/notifications','12_notifications_desktop.png'],
      ['buyer/about',        '13_about_desktop.png'],
      ['buyer/contact',      '14_contact_desktop.png'],
      ['buyer/faq',          '15_faq_desktop.png'],
      ['buyer/bulk',         '16_bulk_gifting_desktop.png'],
      ['buyer/occasions',    '17_occasions_desktop.png'],
      ['auth/login',         '18_login_desktop.png'],
      ['auth/signup-buyer',  '19_signup_buyer_desktop.png'],
      ['buyer/payment-success', '20_payment_success_desktop.png'],
      ['buyer/payment-failure', '21_payment_failure_desktop.png'],
    ];

    for (const [pagePath, filename] of extras) {
      console.log(`   ${filename}...`);
      try {
        await desk.goto(`${BASE_URL}/${pagePath}`, { waitUntil: 'networkidle2', timeout: 30000 });
        await scrollAndWait(desk);
        await capture(desk, filename);
      } catch (e) {
        console.log(`   ⚠ Skipped ${filename}: ${e.message.slice(0,80)}`);
      }
    }

    await desk.close();

    // ── MOBILE (375 x 812) ──────────────────────────────────────────────────
    console.log('\n── MOBILE 375×812 ───────────────────────────────────────');
    const mob = await browser.newPage();
    await mob.setViewport({ width: 375, height: 812 });
    await mob.setRequestInterception(true);
    setupInterceptor(mob);

    // 01 Homepage
    console.log('01 Homepage mobile...');
    await mob.evaluateOnNewDocument(injectAuth, token);
    await mob.goto(`${BASE_URL}/buyer/home`, { waitUntil: 'networkidle2', timeout: 30000 });
    await scrollAndWait(mob);
    await capture(mob, '01_homepage_mobile.png');

    // 02 PLP mobile
    console.log('02 PLP mobile...');
    await mob.goto(`${BASE_URL}/buyer/category?slug=${CATEGORY_SLUG}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await scrollAndWait(mob);
    await capture(mob, '02_plp_mobile.png');

    // 02b PLP with filter drawer open
    console.log('02b PLP filter drawer mobile...');
    await mob.goto(`${BASE_URL}/buyer/category?slug=${CATEGORY_SLUG}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await mob.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 800));
      const btn = document.getElementById('filter-btn');
      if (btn) { btn.click(); await new Promise(r => setTimeout(r, 600)); }
    });
    await capture(mob, '02b_plp_filter_drawer_mobile.png', false);

    // 03 PDP mobile
    console.log('03 PDP mobile...');
    await mob.goto(`${BASE_URL}/buyer/product?id=${PRODUCT_ID}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await scrollAndWait(mob);
    await capture(mob, '03_pdp_mobile.png');

    // 04 Cart mobile
    console.log('04 Cart mobile...');
    await mob.goto(`${BASE_URL}/buyer/cart`, { waitUntil: 'networkidle2', timeout: 30000 });
    await scrollAndWait(mob);
    await capture(mob, '04_cart_mobile.png');

    // 05 Checkout mobile
    console.log('05 Checkout mobile...');
    await mob.goto(`${BASE_URL}/buyer/checkout`, { waitUntil: 'networkidle2', timeout: 30000 });
    await scrollAndWait(mob);
    await capture(mob, '05_checkout_mobile.png');

    // Extra mobile pages
    const mobileExtras = [
      ['buyer/categories',   '06_categories_mobile.png'],
      ['buyer/search',       '07_search_mobile.png'],
      ['buyer/wishlist',     '08_wishlist_mobile.png'],
      ['buyer/orders',       '09_orders_mobile.png'],
      ['buyer/profile',      '10_profile_mobile.png'],
      ['buyer/zip-gift',     '11_zipgift_mobile.png'],
      ['buyer/notifications','12_notifications_mobile.png'],
      ['buyer/about',        '13_about_mobile.png'],
      ['buyer/contact',      '14_contact_mobile.png'],
      ['buyer/faq',          '15_faq_mobile.png'],
      ['buyer/bulk',         '16_bulk_gifting_mobile.png'],
      ['buyer/occasions',    '17_occasions_mobile.png'],
      ['auth/login',         '18_login_mobile.png'],
      ['auth/signup-buyer',  '19_signup_buyer_mobile.png'],
      ['buyer/payment-success', '20_payment_success_mobile.png'],
      ['buyer/payment-failure', '21_payment_failure_mobile.png'],
    ];

    for (const [pagePath, filename] of mobileExtras) {
      console.log(`   ${filename}...`);
      try {
        await mob.goto(`${BASE_URL}/${pagePath}`, { waitUntil: 'networkidle2', timeout: 30000 });
        await scrollAndWait(mob);
        await capture(mob, filename);
      } catch (e) {
        console.log(`   ⚠ Skipped ${filename}: ${e.message.slice(0,80)}`);
      }
    }

    await mob.close();

  } finally {
    await browser.close();
  }

  const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.png'));
  console.log(`\n✅ Done! ${files.length} screenshots saved to:\n   ${OUT_DIR}\n`);
  files.forEach(f => console.log(`   • ${f}`));
})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
