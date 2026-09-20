/**
 * Tohfa Admin Panel, Seller Studio, and TOHFA Special Shops Automation Script
 * Uses Puppeteer-core + Microsoft Edge
 * Output: C:\Users\ACER\Downloads\tohfa-portals-screenshots\
 *   ├── admin\
 *   ├── seller\
 *   └── special-shops\
 */

const puppeteer = require('c:/Users/ACER/OneDrive/Desktop/antigravity_workspace/tohfanew/node_modules/puppeteer-core');
const path = require('path');
const fs   = require('fs');

const BASE_URL  = 'https://www.thetohfa.in';
const ROOT_OUT  = 'C:\\Users\\ACER\\Downloads\\tohfa-portals-screenshots';
const ADMIN_OUT = path.join(ROOT_OUT, 'admin');
const SELLER_OUT= path.join(ROOT_OUT, 'seller');
const SPEC_OUT  = path.join(ROOT_OUT, 'special-shops');
const EDGE_EXE  = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

[ROOT_OUT, ADMIN_OUT, SELLER_OUT, SPEC_OUT].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Token Generators ─────────────────────────────────────────────────────────
function makeToken(role = 'admin') {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const exp = Math.floor(Date.now() / 1000) + 86400 * 30;
  const p = Buffer.from(JSON.stringify({
    id: role === 'admin' ? 1 : 99,
    role: role,
    email: role === 'admin' ? 'admin@thetohfa.in' : 'artisan@tohfa.in',
    is_approved: 1,
    exp: exp
  })).toString('base64');
  return `${h}.${p}.mockSignature`;
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
};

// ── Shared API Request Interceptor ───────────────────────────────────────────
function setupComprehensiveInterceptor(page) {
  page.on('request', req => {
    const url = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS_HEADERS });
    const isApi = req.resourceType() === 'xhr' || req.resourceType() === 'fetch';
    if (!isApi) return req.continue();

    // ── Admin Endpoints ──
    if (url.includes('/admin/dashboard/stats') || url.includes('/dashboard/stats')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: { gmv: 428500, orders_count: 142, active_sellers: 38, conversion_rate: 3.8 }
        })
      });
    }

    if (url.includes('/admin/dashboard/charts') || url.includes('/dashboard/charts')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            gmv_trend: [
              { date: '01 Sep', gmv: 34000 }, { date: '05 Sep', gmv: 48000 },
              { date: '10 Sep', gmv: 62000 }, { date: '15 Sep', gmv: 59000 }, { date: '19 Sep', gmv: 78000 }
            ],
            footfall: [
              { date: '01 Sep', unique_visitors: 450, new_signups: 32 },
              { date: '05 Sep', unique_visitors: 580, new_signups: 45 },
              { date: '10 Sep', unique_visitors: 720, new_signups: 68 },
              { date: '15 Sep', unique_visitors: 690, new_signups: 54 },
              { date: '19 Sep', unique_visitors: 890, new_signups: 82 }
            ]
          }
        })
      });
    }

    if (url.includes('/admin/dashboard/top-products')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: [
            { id: '1', name: 'Crochet Evil Eye Keychain', views: 1240, clicks: 380, viral_score: 9.4 },
            { id: '2', name: 'Rose Favor Candles (Set of 6)', views: 980, clicks: 270, viral_score: 8.7 },
            { id: '3', name: 'Blue Daisy Scented Jar Candle', views: 820, clicks: 215, viral_score: 8.1 },
            { id: '4', name: 'Handcrafted Ceramic Planter', views: 640, clicks: 175, viral_score: 7.6 },
            { id: '5', name: 'Embroidered Silk Bookmark', views: 510, clicks: 130, viral_score: 7.2 }
          ]
        })
      });
    }

    if (url.includes('/admin/dashboard/seller-activity')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: [
            { store_name: 'Crochet Lady', action: 'Listed 3 new crafts', time_ago: '12m ago' },
            { store_name: 'The Candle Story', action: 'Fulfilled 4 orders', time_ago: '35m ago' },
            { store_name: 'Clay & Co', action: 'Updated store theme', time_ago: '1h ago' }
          ]
        })
      });
    }

    if (url.includes('/admin/special-shops')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'spec_1', user_id: 'spec_1', store_name: 'Tohfa Heritage Studio', slug: 'tohfa-heritage',
              email: 'heritage@thetohfa.in', is_active: true, commission_rate: 0,
              product_count: 18, total_revenue: 145000,
              bio: 'Official platform-curated heritage crafts directly from master weavers & sculptors.'
            },
            {
              id: 'spec_2', user_id: 'spec_2', store_name: 'Tohfa Festive Crafts', slug: 'tohfa-festive',
              email: 'festive@thetohfa.in', is_active: true, commission_rate: 0,
              product_count: 12, total_revenue: 92400,
              bio: 'Seasonal and festival gifting collections managed by Tohfa Studio.'
            }
          ]
        })
      });
    }

    if (url.includes('/admin/orders')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            orders: [
              { id: 'ord_1', order_ref: 'TOHFA-78A92B', buyer_name: 'Priya Sharma', store_name: 'The Candle Story', created_at: '2026-09-18T10:30:00Z', total_amount: 82600, amount_paid: 82600, status: 'shipped', payment_status: 'paid' },
              { id: 'ord_2', order_ref: 'TOHFA-51C34E', buyer_name: 'Rahul Mehta', store_name: 'Crochet Lady', created_at: '2026-09-18T14:15:00Z', total_amount: 29900, amount_paid: 29900, status: 'processing', payment_status: 'paid' },
              { id: 'ord_3', order_ref: 'TOHFA-99D81A', buyer_name: 'Ananya Roy', store_name: 'Tohfa Heritage Studio', created_at: '2026-09-19T09:00:00Z', total_amount: 145000, amount_paid: 145000, status: 'pending', payment_status: 'paid' }
            ],
            total: 3, page: 1, limit: 30
          }
        })
      });
    }

    if (url.includes('/admin/products')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            products: [
              { id: 'p1', name: 'Crochet Evil Eye Keychain', price: 149, category: 'Crochet', seller_name: 'Crochet Lady', status: 'approved', is_sponsored: true, stock: 45 },
              { id: 'p2', name: 'Rose Favor Candles (Set of 6)', price: 499, category: 'Candles', seller_name: 'The Candle Story', status: 'approved', is_sponsored: false, stock: 20 },
              { id: 'p3', name: 'Handcrafted Wooden Music Box', price: 1250, category: 'Woodcraft', seller_name: 'Tohfa Heritage Studio', status: 'approved', is_sponsored: true, stock: 12 }
            ],
            total: 3
          }
        })
      });
    }

    if (url.includes('/admin/sellers')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            sellers: [
              { id: 's1', store_name: 'The Candle Story', email: 'hello@candlestory.in', kyc_status: 'verified', status: 'active', products_count: 19, total_sales: 84500 },
              { id: 's2', store_name: 'Crochet Lady', email: 'artisan@crochetlady.com', kyc_status: 'verified', status: 'active', products_count: 24, total_sales: 112000 }
            ],
            total: 2
          }
        })
      });
    }

    if (url.includes('/admin/categories')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: [
            { id: 'cat_1', name: 'Candles & Aromas', slug: 'candles', is_active: true, subcategories: [{ id: 'sub_1', name: 'Jar Candles' }, { id: 'sub_2', name: 'Stick Candles' }] },
            { id: 'cat_2', name: 'Crochet & Fibers', slug: 'crochet', is_active: true, subcategories: [{ id: 'sub_3', name: 'Keychains' }, { id: 'sub_4', name: 'Flower Bouquets' }] },
            { id: 'cat_3', name: 'Pottery & Ceramics', slug: 'ceramics', is_active: true, subcategories: [{ id: 'sub_5', name: 'Planters' }, { id: 'sub_6', name: 'Mugs' }] }
          ]
        })
      });
    }

    if (url.includes('/admin/payouts')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            payouts: [
              { id: 'pay_1', seller_name: 'The Candle Story', amount: 34500, status: 'processed', created_at: '2026-09-15' },
              { id: 'pay_2', seller_name: 'Crochet Lady', amount: 48900, status: 'pending', created_at: '2026-09-18' }
            ]
          }
        })
      });
    }

    if (url.includes('/admin/refunds')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            refunds: [
              { id: 'ref_1', order_ref: 'TOHFA-23B11', reason: 'Damaged in transit', amount: 499, status: 'approved' },
              { id: 'ref_2', order_ref: 'TOHFA-89F42', reason: 'Delayed delivery', amount: 149, status: 'pending' }
            ]
          }
        })
      });
    }

    if (url.includes('/admin/audit-logs')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            logs: [
              { id: 'log_1', action: 'SPECIAL_SHOP_CREATED', actor: 'Admin Super', target: 'Tohfa Festive Crafts', created_at: '2026-09-18 11:20:00' },
              { id: 'log_2', action: 'SELLER_APPROVED', actor: 'Admin Super', target: 'The Candle Story', created_at: '2026-09-17 15:45:00' }
            ]
          }
        })
      });
    }

    // ── Seller Endpoints ──
    if (url.includes('/seller/dashboard-metrics') || url.includes('/seller/dashboard')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            seller: { display_name: 'Aarav Handcrafts', store_name: 'Aarav Handcrafts' },
            date_label: 'Sep 19, 2026, Friday',
            kpis: {
              order_value_paise: 8450000,
              order_value_change_pct: 18.5,
              total_orders: 48,
              pending_orders: 3,
              conversion_rate: 4.2,
              new_orders_since_last_period: 6
            },
            salesChart: {
              labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              revenue: [8200, 11400, 9500, 14200, 18900, 22400, 16800],
              visits: [120, 160, 140, 210, 290, 340, 250]
            },
            low_stock_alerts: [
              { name: 'Hand-poured Soy Wax Candle', stock: 2, threshold: 5 }
            ],
            recentOrders: [
              { id: 'so_1', item_title: 'Crochet Evil Eye Keychain', buyer_name: 'Priya Sharma', city: 'Bengaluru', amount_paise: 14900, status: 'shipped', item_image: 'https://www.thetohfa.in/img/categories/art_prints.jpg' },
              { id: 'so_2', item_title: 'Rose Favor Candles (Set of 6)', buyer_name: 'Vikram Singh', city: 'Mumbai', amount_paise: 49900, status: 'processing', item_image: 'https://www.thetohfa.in/img/categories/candles.jpg' }
            ]
          }
        })
      });
    }

    if (url.includes('/seller/analytics')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: { total_views: 4200, total_clicks: 890, conversion_rate: 4.2 }
        })
      });
    }

    if (url.includes('/seller/catalog') || url.includes('/seller/products')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            products: [
              { id: 'sp_1', name: 'Blue Daisy Scented Jar Candle', price_paise: 29900, stock: 18, is_active: true, image_url: 'https://www.thetohfa.in/img/categories/candles.jpg' },
              { id: 'sp_2', name: 'Pink Daisy Stick Candle', price_paise: 12900, stock: 35, is_active: true, image_url: 'https://www.thetohfa.in/img/categories/candles.jpg' }
            ]
          }
        })
      });
    }

    if (url.includes('/seller/orders')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            orders: [
              { id: 'so_1', order_ref: 'TOHFA-ORD-101', item_title: 'Crochet Evil Eye Keychain', buyer_name: 'Priya Sharma', status: 'shipped', total_amount: 149, created_at: '2026-09-18' }
            ]
          }
        })
      });
    }

    if (url.includes('/seller/payouts') || url.includes('/seller/payment-history')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            available_balance_paise: 4200000,
            pending_balance_paise: 1250000,
            history: [{ id: 'tx_1', amount_paise: 2500000, status: 'settled', date: '2026-09-12' }]
          }
        })
      });
    }

    if (url.includes('/seller/reviews')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            reviews: [
              { rating: 5, buyer_name: 'Kavita R.', comment: 'Exquisite craftsmanship! Arrived beautifully packed with a handwritten card.', created_at: '2026-09-17' }
            ]
          }
        })
      });
    }

    // Default fallback for any other unhandled APIs
    if (url.includes('/api/')) {
      return req.respond({
        status: 200, contentType: 'application/json', headers: CORS_HEADERS,
        body: JSON.stringify({ success: true, data: {} })
      });
    }

    return req.continue();
  });
}

// ── Inject Admin Credentials ────────────────────────────────────────────────
function injectAdminSession(token) {
  const adminUser = JSON.stringify({ id: 1, name: 'Admin Tohfa', email: 'admin@thetohfa.in', role: 'admin' });
  sessionStorage.setItem('tohfa_admin_token', token);
  localStorage.setItem('tohfa_admin_token', token);
  sessionStorage.setItem('tohfa_access_token', token);
  localStorage.setItem('tohfa_access_token', token);
  sessionStorage.setItem('tohfa_user', adminUser);
  localStorage.setItem('tohfa_user', adminUser);
  sessionStorage.removeItem('tohfa_admin_switch_context');
}

// ── Inject Standard Seller Credentials ──────────────────────────────────────
function injectSellerSession(token) {
  const sellerUser = JSON.stringify({ id: 99, name: 'Aarav Handcrafts', store_name: 'Aarav Handcrafts', email: 'artisan@tohfa.in', role: 'seller', is_approved: 1 });
  sessionStorage.setItem('tohfa_access_token', token);
  localStorage.setItem('tohfa_access_token', token);
  sessionStorage.setItem('tohfa_user', sellerUser);
  localStorage.setItem('tohfa_user', sellerUser);
  sessionStorage.removeItem('tohfa_admin_switch_context');
}

// ── Inject TOHFA Special Shop Admin Mode Context ────────────────────────────
function injectSpecialShopContext(token) {
  const adminUser = JSON.stringify({ id: 1, name: 'Tohfa Heritage Studio', store_name: 'Tohfa Heritage Studio', role: 'seller', is_approved: 1 });
  sessionStorage.setItem('tohfa_admin_token', token);
  sessionStorage.setItem('tohfa_access_token', token);
  localStorage.setItem('tohfa_access_token', token);
  sessionStorage.setItem('tohfa_user', adminUser);
  localStorage.setItem('tohfa_user', adminUser);
  sessionStorage.setItem('tohfa_admin_switch_context', JSON.stringify({
    actingAs: 'Tohfa Heritage Studio',
    shopId: 'spec_1',
    returnUrl: '/admin/sellers.html?tab=special-shops'
  }));
}

// ── Resilient scroll to bottom & back ───────────────────────────────────────
async function scrollAndWait(page) {
  try {
    await page.evaluate(async () => {
      await document.fonts.ready;
      const max = document.body.scrollHeight;
      for (let y = 0; y <= max; y += 700) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 60));
      }
      await new Promise(r => setTimeout(r, 400));
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 200));
    });
  } catch (_) {
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── Safe browse with timeout fallback ───────────────────────────────────────
async function safeBrowse(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1500));
    } catch (_) {}
  }
}

// ── Capture helper ──────────────────────────────────────────────────────────
async function capture(page, fullPath, fullPage = true) {
  try {
    await page.screenshot({ path: fullPath, fullPage });
    const kb = (fs.statSync(fullPath).size / 1024).toFixed(0);
    console.log(`  ✓ ${path.basename(fullPath)} (${kb} KB)`);
  } catch (e) {
    console.log(`  ✗ ${path.basename(fullPath)}: ${e.message.slice(0, 80)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  const adminToken  = makeToken('admin');
  const sellerToken = makeToken('seller');

  const browser = await puppeteer.launch({
    executablePath: EDGE_EXE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'],
  });

  try {
    // =========================================================================
    // 1. ADMIN PANEL (Desktop & Mobile)
    // =========================================================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  1. ADMIN PANEL CAPTURES');
    console.log('═══════════════════════════════════════════════════════════');

    const adminPages = [
      ['admin/dashboard.html',                'admin_01_dashboard'],
      ['admin/orders.html',                   'admin_02_orders'],
      ['admin/products.html',                 'admin_03_products'],
      ['admin/sellers.html',                  'admin_04_sellers'],
      ['admin/sellers.html?tab=special-shops','admin_05_special_shops_registry'],
      ['admin/special-orders.html',           'admin_06_special_orders'],
      ['admin/categories.html',               'admin_07_categories'],
      ['admin/payouts.html',                  'admin_08_payouts'],
      ['admin/refunds.html',                  'admin_09_refunds'],
      ['admin/reports.html',                  'admin_10_reports'],
      ['admin/audit-logs.html',               'admin_11_audit_logs'],
      ['admin/master-admin.html',             'admin_12_master_admin'],
      ['admin/login.html',                    'admin_13_login'],
    ];

    // Admin Desktop
    console.log('\n── Admin Desktop (1440×900) ──');
    const adminDesk = await browser.newPage();
    await adminDesk.setViewport({ width: 1440, height: 900 });
    await adminDesk.setRequestInterception(true);
    setupComprehensiveInterceptor(adminDesk);
    await adminDesk.evaluateOnNewDocument(injectAdminSession, adminToken);

    for (const [subUrl, fileBase] of adminPages) {
      console.log(`  → ${fileBase}_desktop.png`);
      await safeBrowse(adminDesk, `${BASE_URL}/${subUrl}`);
      await scrollAndWait(adminDesk);
      await capture(adminDesk, path.join(ADMIN_OUT, `${fileBase}_desktop.png`));
    }
    await adminDesk.close();

    // Admin Mobile
    console.log('\n── Admin Mobile (375×812) ──');
    const adminMob = await browser.newPage();
    await adminMob.setViewport({ width: 375, height: 812 });
    await adminMob.setRequestInterception(true);
    setupComprehensiveInterceptor(adminMob);
    await adminMob.evaluateOnNewDocument(injectAdminSession, adminToken);

    for (const [subUrl, fileBase] of adminPages) {
      console.log(`  → ${fileBase}_mobile.png`);
      await safeBrowse(adminMob, `${BASE_URL}/${subUrl}`);
      await scrollAndWait(adminMob);
      await capture(adminMob, path.join(ADMIN_OUT, `${fileBase}_mobile.png`));
    }
    await adminMob.close();

    // =========================================================================
    // 2. SELLER STUDIO (Desktop & Mobile)
    // =========================================================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  2. SELLER STUDIO CAPTURES');
    console.log('═══════════════════════════════════════════════════════════');

    const sellerPages = [
      ['seller/dashboard.html',           'seller_01_dashboard'],
      ['seller/catalog.html',             'seller_02_catalog'],
      ['seller/add-product.html',         'seller_03_add_product'],
      ['seller/orders.html',              'seller_04_orders'],
      ['seller/order-detail.html',        'seller_05_order_detail'],
      ['seller/analytics.html',           'seller_06_analytics'],
      ['seller/payouts.html',             'seller_07_payouts'],
      ['seller/payment-history.html',     'seller_08_payment_history'],
      ['seller/reviews.html',             'seller_09_reviews'],
      ['seller/profile.html',             'seller_10_profile'],
      ['seller/profile-settings.html',    'seller_11_profile_settings'],
      ['seller/store-config.html',        'seller_12_store_config'],
      ['seller/plans.html',               'seller_13_plans'],
      ['seller/onboarding.html',          'seller_14_onboarding'],
      ['seller/customized-products.html', 'seller_15_customized_products'],
    ];

    // Seller Desktop
    console.log('\n── Seller Studio Desktop (1440×900) ──');
    const sellerDesk = await browser.newPage();
    await sellerDesk.setViewport({ width: 1440, height: 900 });
    await sellerDesk.setRequestInterception(true);
    setupComprehensiveInterceptor(sellerDesk);
    await sellerDesk.evaluateOnNewDocument(injectSellerSession, sellerToken);

    for (const [subUrl, fileBase] of sellerPages) {
      console.log(`  → ${fileBase}_desktop.png`);
      await safeBrowse(sellerDesk, `${BASE_URL}/${subUrl}`);
      await scrollAndWait(sellerDesk);
      await capture(sellerDesk, path.join(SELLER_OUT, `${fileBase}_desktop.png`));
    }
    await sellerDesk.close();

    // Seller Mobile
    console.log('\n── Seller Studio Mobile (375×812) ──');
    const sellerMob = await browser.newPage();
    await sellerMob.setViewport({ width: 375, height: 812 });
    await sellerMob.setRequestInterception(true);
    setupComprehensiveInterceptor(sellerMob);
    await sellerMob.evaluateOnNewDocument(injectSellerSession, sellerToken);

    for (const [subUrl, fileBase] of sellerPages) {
      console.log(`  → ${fileBase}_mobile.png`);
      await safeBrowse(sellerMob, `${BASE_URL}/${subUrl}`);
      await scrollAndWait(sellerMob);
      await capture(sellerMob, path.join(SELLER_OUT, `${fileBase}_mobile.png`));
    }
    await sellerMob.close();

    // =========================================================================
    // 3. TOHFA SPECIAL SHOPS (Admin Mode in Seller Studio)
    // =========================================================================
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  3. TOHFA SPECIAL SHOPS STUDIO & ADMIN HUB');
    console.log('═══════════════════════════════════════════════════════════');

    const specialPages = [
      ['admin/sellers.html?tab=special-shops', 'special_01_admin_special_shops_registry'],
      ['admin/special-orders.html',            'special_02_admin_special_orders'],
      ['seller/dashboard.html',                'special_03_studio_dashboard_admin_mode'],
      ['seller/catalog.html',                  'special_04_studio_catalog_admin_mode'],
      ['seller/orders.html',                   'special_05_studio_orders_admin_mode'],
      ['seller/store-config.html',             'special_06_studio_store_config_admin_mode'],
    ];

    // Special Shops Desktop
    console.log('\n── Special Shops Desktop (1440×900) ──');
    const specDesk = await browser.newPage();
    await specDesk.setViewport({ width: 1440, height: 900 });
    await specDesk.setRequestInterception(true);
    setupComprehensiveInterceptor(specDesk);
    await specDesk.evaluateOnNewDocument(injectSpecialShopContext, adminToken);

    for (const [subUrl, fileBase] of specialPages) {
      console.log(`  → ${fileBase}_desktop.png`);
      await safeBrowse(specDesk, `${BASE_URL}/${subUrl}`);
      await scrollAndWait(specDesk);
      await capture(specDesk, path.join(SPEC_OUT, `${fileBase}_desktop.png`));
    }
    await specDesk.close();

    // Special Shops Mobile
    console.log('\n── Special Shops Mobile (375×812) ──');
    const specMob = await browser.newPage();
    await specMob.setViewport({ width: 375, height: 812 });
    await specMob.setRequestInterception(true);
    setupComprehensiveInterceptor(specMob);
    await specMob.evaluateOnNewDocument(injectSpecialShopContext, adminToken);

    for (const [subUrl, fileBase] of specialPages) {
      console.log(`  → ${fileBase}_mobile.png`);
      await safeBrowse(specMob, `${BASE_URL}/${subUrl}`);
      await scrollAndWait(specMob);
      await capture(specMob, path.join(SPEC_OUT, `${fileBase}_mobile.png`));
    }
    await specMob.close();

  } finally {
    await browser.close();
  }

  console.log('\n🎉 ALL PORTAL SCREENSHOTS COMPLETED!');
})().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
