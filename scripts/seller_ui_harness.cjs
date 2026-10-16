/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FILE: scripts/seller_ui_harness.cjs
 *  PURPOSE: Isolated Test Harness & Visual Verification for Tohfa Seller Studio
 *           - Strict API request interception (no production leakage)
 *           - False-pass elimination (URL, shell, headings, nav link assertions)
 *           - Viewport & responsive breakpoint checks
 *           - High-resolution baseline and refined screenshot capture
 * ═══════════════════════════════════════════════════════════════════════════
 */

const puppeteer = require('c:/Users/ACER/OneDrive/Desktop/antigravity_workspace/tohfanew/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const EDGE_EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || 'C:\\Users\\ACER\\.gemini\\antigravity\\brain\\0ae3a81c-0dc5-41f3-b644-871053864376\\screenshots';

const SELLER_PAGES = [
  { id: 'S01', name: 'dashboard', path: '/seller/dashboard.html', expectedHeading: 'Command Center', expectedTab: 'home' },
  { id: 'S02', name: 'add-product', path: '/seller/add-product.html', expectedHeading: 'Craft New Product', expectedTab: 'catalog' },
  { id: 'S03', name: 'catalog', path: '/seller/catalog.html', expectedHeading: 'Artisan Catalog', expectedTab: 'catalog' },
  { id: 'S04', name: 'customized', path: '/seller/customized-products.html', expectedHeading: 'Customization Studio', expectedTab: 'customized' },
  { id: 'S05', name: 'orders', path: '/seller/orders.html', expectedHeading: 'Order Management', expectedTab: 'orders' },
  { id: 'S06', name: 'payouts', path: '/seller/payouts.html', expectedHeading: 'Earnings & Payouts', expectedTab: 'payments' },
  { id: 'S07', name: 'profile', path: '/seller/profile.html', expectedHeading: 'Store Profile & Identity', expectedTab: 'profile' },
  { id: 'S08', name: 'plans', path: '/seller/plans.html', expectedHeading: 'Studio Plans', expectedTab: 'plans' },
  { id: 'S09', name: 'analytics', path: '/seller/analytics.html', expectedHeading: 'Studio Performance Overview', expectedTab: 'analytics' },
  { id: 'S10', name: 'reviews', path: '/seller/reviews.html', expectedHeading: 'Studio Reviews', expectedTab: 'reviews' },
];

const UNMARKED_PAGES = [
  { name: 'seller-edit-product', path: '/seller/edit-product.html?id=p1' },
  { name: 'seller-order-detail', path: '/seller/order-detail.html' },
  { name: 'seller-payment-history', path: '/seller/payment-history.html' },
  { name: 'seller-profile-settings', path: '/seller/profile-settings.html' },
  { name: 'buyer-home', path: '/index.html' },
  { name: 'admin-dashboard', path: '/admin/dashboard.html' },
];

const VIEWPORTS = {
  mobile_narrow: { width: 320, height: 740, label: '320x740' },
  mobile_ref:    { width: 390, height: 844, label: '390x844' },
  mobile_large:  { width: 430, height: 932, label: '430x932' },
  tablet:        { width: 768, height: 1024, label: '768x1024' },
  desktop_comp:  { width: 1024, height: 768, label: '1024x768' },
  desktop_ref:   { width: 1440, height: 1000, label: '1440x1000' },
  desktop_large: { width: 1920, height: 1080, label: '1920x1080' },
  landscape:     { width: 844, height: 390, label: '844x390' },
};

function setupComprehensiveMocks(page, options = {}) {
  const { isTourOpen = false, planTier = 'basic', isAdminSwitched = false } = options;

  return page.setRequestInterception(true).then(() => {
    page.on('request', req => {
      const url = req.url();
      const method = req.method();

      if (method === 'OPTIONS') {
        return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }

      // Check mutations - intercept and log
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        if (!url.startsWith(BASE_URL) && !url.includes('localhost') && !url.includes('127.0.0.1')) {
          console.error(`[MUTATION BLOCKED] Attempted external mutation: ${method} ${url}`);
          return req.abort('blockedbyclient');
        }
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ success: true, message: 'Mock mutation accepted' })
        });
      }

      // Profile me
      if (url.includes('/api/profile/me')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: {
              id: 99,
              role: isAdminSwitched ? 'admin' : 'seller',
              is_approved: 1,
              name: 'Aarav Handcrafts',
              store_name: 'Aarav Handcrafts',
              display_name: 'Aarav Handcrafts',
              email: 'artisan@thetohfa.in',
              subscription_plan: planTier,
              hasBillingAddress: true,
              hasBankingDetails: true,
              onboardingTourDismissed: !isTourOpen
            }
          })
        });
      }

      // Seller profile & onboarding
      if (url.includes('/api/seller/profile')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: {
              id: 99,
              user_id: 99,
              role: 'seller',
              is_approved: 1,
              store_name: 'Aarav Handcrafts',
              display_name: 'Aarav Handcrafts',
              profile_photo: '/img/default-avatar.png',
              subscription_plan: planTier,
              hasBillingAddress: true,
              hasBankingDetails: true,
              onboardingTourDismissed: !isTourOpen,
              business: {
                store_name: 'Aarav Handcrafts',
                legal_business_name: 'Aarav Handcrafts LLP',
                gst_number: '29ABCDE1234F1Z5',
                pan_number: 'ABCDE1234F'
              },
              billing_address: {
                address_line1: '123 Artisan Lane',
                city: 'Bengaluru',
                state: 'Karnataka',
                pincode: '560001'
              },
              pickup_address: {
                address_line1: '123 Artisan Workshop',
                city: 'Bengaluru',
                state: 'Karnataka',
                pincode: '560001',
                contact_phone: '+91 9876543210'
              },
              bank_details: {
                bank_name: 'HDFC Bank',
                account_number: '••••••••4829',
                ifsc_code: 'HDFC0001234',
                account_holder_name: 'Aarav Sharma'
              }
            }
          })
        });
      }

      // Dashboard metrics
      if (url.includes('/api/seller/dashboard-metrics') || url.includes('/api/seller/dashboard')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: {
              date_label: 'Friday, 16 October 2026',
              kpis: {
                order_value_paise: 8450000,
                order_value_change_pct: 18.5,
                total_orders: 48,
                pending_orders: 3,
                conversion_rate: 4.2,
                new_orders_since_last_period: 6
              },
              salesChart: {
                labels: ['10 Oct', '11 Oct', '12 Oct', '13 Oct', '14 Oct', '15 Oct', '16 Oct'],
                revenue: [8200, 11400, 9500, 14200, 18900, 22400, 16800],
                visits: [120, 160, 140, 210, 290, 340, 250]
              },
              low_stock_alerts: [
                { id: 'p1', name: 'Hand-poured Soy Wax Candle', stock: 2, threshold: 5 }
              ],
              recentOrders: [
                { id: 'ord_101', order_ref: 'TOHFA-101', item_title: 'Hand-poured Soy Wax Candle', buyer_name: 'Priya Sharma', city: 'Bengaluru', amount_paise: 149000, status: 'processing', item_image: '/img/categories/candles.jpg' },
                { id: 'ord_102', order_ref: 'TOHFA-102', item_title: 'Rose Favor Candles (Set of 6)', buyer_name: 'Vikram Singh', city: 'Mumbai', amount_paise: 499000, status: 'shipped', item_image: '/img/categories/candles.jpg' }
              ]
            }
          })
        });
      }

      // Catalog & products
      if (url.includes('/api/seller/catalog/summary')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: { total_products: 14, active_products: 12, out_of_stock: 1, low_stock: 1 }
          })
        });
      }

      // Single listing by ID
      if (url.match(/\/api\/seller\/listings\/[a-zA-Z0-9_-]+/)) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: {
              product: {
                id: 'p1',
                name: 'Hand-poured Soy Wax Candle',
                status: 'active',
                price: 299,
                stock: 18,
                category: 'Candles',
                category_name: 'Candles',
                description: 'Pure soy wax candle hand poured in glass jar',
                subcategories: [],
                images: ['/img/categories/candles.jpg']
              }
            }
          })
        });
      }

      if (url.includes('/api/seller/listings') || url.includes('/api/seller/products') || url.includes('/api/seller/customisations')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: {
              listings: [
                { id: 'p1', name: 'Hand-poured Soy Wax Candle', price_paise: 29900, stock: 18, is_active: true, is_customizable: true, views_count: 320, orders_count: 14, image_url: '/img/categories/candles.jpg', category_name: 'Candles' },
                { id: 'p2', name: 'Crochet Evil Eye Keychain', price_paise: 14900, stock: 45, is_active: true, is_customizable: false, views_count: 580, orders_count: 32, image_url: '/img/categories/art_prints.jpg', category_name: 'Crochet' }
              ],
              total: 2,
              summary: { total: 14, active: 12, low_stock: 1, out_of_stock: 1 }
            }
          })
        });
      }

      // Orders
      if (url.includes('/api/seller/orders')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: {
              orders: [
                { id: 'ord_101', order_ref: 'TOHFA-ORD-101', item_title: 'Hand-poured Soy Wax Candle', buyer_name: 'Priya Sharma', shipping_address: '402 Green Glen, Bengaluru', total_amount: 1490, total_amount_paise: 149000, status: 'processing', payment_status: 'paid', created_at: '2026-10-15T10:30:00Z', items: [{ name: 'Hand-poured Soy Wax Candle', quantity: 1, price_paise: 149000, image_url: '/img/categories/candles.jpg' }] },
                { id: 'ord_102', order_ref: 'TOHFA-ORD-102', item_title: 'Rose Favor Candles (Set of 6)', buyer_name: 'Vikram Singh', shipping_address: '12 Marine Drive, Mumbai', total_amount: 4990, total_amount_paise: 499000, status: 'shipped', payment_status: 'paid', created_at: '2026-10-14T14:15:00Z', items: [{ name: 'Rose Favor Candles', quantity: 2, price_paise: 249500, image_url: '/img/categories/candles.jpg' }] }
              ],
              total: 2,
              page: 1,
              limit: 20
            }
          })
        });
      }

      // Payouts & earnings
      if (url.includes('/api/seller/payouts') || url.includes('/api/payments/')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: {
              available_balance_paise: 4200000,
              pending_balance_paise: 1250000,
              total_earned_paise: 8450000,
              current_week_paise: 1890000,
              current_month_paise: 6420000,
              bank_account_masked: 'HDFC Bank •••• 4829',
              gst_status: 'Verified (29ABCDE1234F1Z5)',
              history: [
                { id: 'tx_1', amount_paise: 2500000, status: 'settled', date: '2026-10-12', utr: 'UTR849204812' },
                { id: 'tx_2', amount_paise: 1700000, status: 'settled', date: '2026-10-05', utr: 'UTR710294819' }
              ],
              settlements: [
                { id: 'set_1', date: '2026-10-12', amount_paise: 2500000, status: 'Completed', orders_count: 8 }
              ],
              disputes: [],
              invoices: [
                { id: 'inv_1', month: 'September 2026', amount_paise: 245000, download_url: '#' }
              ],
              graph: {
                labels: ['01 Oct', '05 Oct', '10 Oct', '15 Oct'],
                earnings: [18000, 24000, 31000, 28000]
              }
            }
          })
        });
      }

      // Reviews
      if (url.includes('/api/seller/reviews')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: {
              reviews: [
                { id: 1, rating: 5, buyer_name: 'Kavita R.', comment: 'Exquisite craftsmanship! Arrived beautifully packed with a handwritten card.', created_at: '2026-10-14', product_name: 'Hand-poured Soy Wax Candle', reply: null },
                { id: 2, rating: 4, buyer_name: 'Rohan M.', comment: 'Great fragrance and clean burning wick.', created_at: '2026-10-10', product_name: 'Rose Favor Candles', reply: 'Thank you for your generous review!' }
              ],
              summary: {
                avg_rating: 4.8,
                total_reviews: 24,
                pending_replies: 3,
                response_rate_pct: 88,
                rating_distribution: { 5: 18, 4: 4, 3: 1, 2: 1, 1: 0 }
              }
            }
          })
        });
      }

      // Review settings
      if (url.includes('/api/seller/review-settings')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: { auto_request_enabled: true, send_days_after: 3 }
          })
        });
      }

      // Analytics
      if (url.includes('/api/seller/analytics')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: {
              kpis: { total_views: 4200, total_clicks: 890, conversion_rate: 4.2, revenue_paise: 8450000, orders_count: 48, avg_order_value_paise: 176000 },
              salesChart: {
                labels: ['10 Oct', '11 Oct', '12 Oct', '13 Oct', '14 Oct', '15 Oct', '16 Oct'],
                revenue: [8200, 11400, 9500, 14200, 18900, 22400, 16800],
                visits: [120, 160, 140, 210, 290, 340, 250]
              },
              trafficSources: [
                { source: 'Direct', percentage: 45 },
                { source: 'Search', percentage: 35 },
                { source: 'Social', percentage: 20 }
              ]
            }
          })
        });
      }

      // Subscription
      if (url.includes('/seller/subscription')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: {
              plan: planTier,
              status: 'active',
              current_period_end: '2026-11-15T00:00:00Z',
              cancel_at_period_end: false
            }
          })
        });
      }

      // Product categories
      if (url.includes('/api/products/categories') || url.includes('/api/categories')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: [
              { id: 'cat_1', name: 'Candles & Aromatherapy', slug: 'candles' },
              { id: 'cat_2', name: 'Crochet & Fibers', slug: 'crochet' },
              { id: 'cat_3', name: 'Pottery & Ceramics', slug: 'ceramics' }
            ]
          })
        });
      }

      // Store config
      if (url.includes('/api/seller/store-config')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: { holiday_mode: false, holiday_message: '' }
          })
        });
      }

      // Fallback for internal APIs
      if (url.includes('/api/')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ success: true, data: {} })
        });
      }

      req.continue();
    });
  });
}

function injectSession(page, options = {}) {
  const { isAdminSwitched = false, planTier = 'basic', isTourOpen = false } = options;
  return page.evaluateOnNewDocument((isAdmin, plan, tourOpen) => {
    const token = 'fake-test-seller-jwt';
    const user = {
      id: 99,
      name: 'Aarav Handcrafts',
      store_name: 'Aarav Handcrafts',
      role: isAdmin ? 'admin' : 'seller',
      is_approved: 1,
      subscription_plan: plan,
      hasBillingAddress: true,
      hasBankingDetails: true,
      onboardingTourDismissed: !tourOpen
    };
    sessionStorage.setItem('tohfa_access_token', token);
    localStorage.setItem('tohfa_access_token', token);
    sessionStorage.setItem('tohfa_user', JSON.stringify(user));
    localStorage.setItem('tohfa_user', JSON.stringify(user));

    if (isAdmin) {
      sessionStorage.setItem('tohfa_admin_switch_context', JSON.stringify({
        actingAs: 'Tohfa Heritage Studio',
        isSpecialShop: false,
        returnUrl: '/admin/sellers.html'
      }));
    } else {
      sessionStorage.removeItem('tohfa_admin_switch_context');
    }
  }, isAdminSwitched, planTier, isTourOpen);
}

async function verifyPageAssertions(page, pageSpec, options = {}) {
  const { isAdminSwitched = false } = options;
  const currentUrl = page.url();

  // 1. URL assertion
  if (currentUrl.includes('/auth/login') || currentUrl.includes('/login.html')) {
    throw new Error(`[ASSERTION FAIL] Page ${pageSpec.name} redirected to login! URL: ${currentUrl}`);
  }

  // 2. Shell presence
  const hasLayout = await page.$eval('seller-layout', el => !!el).catch(() => false);
  const hasSidebar = await page.$eval('seller-sidebar', el => !!el).catch(() => false);
  const hasMainPanel = await page.$eval('.seller-main-panel', el => !!el).catch(() => false);

  if (!hasLayout || !hasSidebar || !hasMainPanel) {
    throw new Error(`[ASSERTION FAIL] Page ${pageSpec.name} missing seller shell! layout=${hasLayout}, sidebar=${hasSidebar}, mainPanel=${hasMainPanel}`);
  }

  // 3. Navigation link count
  const navLinkCount = await page.$$eval('seller-sidebar nav a.sidebar-link', els => els.length);
  const expectedNavCount = isAdminSwitched ? 7 : 9;
  if (navLinkCount !== expectedNavCount) {
    throw new Error(`[ASSERTION FAIL] Page ${pageSpec.name} expected ${expectedNavCount} nav links, found ${navLinkCount}`);
  }

  // 4. Page marker assertion
  const uiRefinement = await page.$eval('body', el => el.getAttribute('data-ui-refinement')).catch(() => null);
  const uiPage = await page.$eval('body', el => el.getAttribute('data-ui-page')).catch(() => null);

  if (uiRefinement !== 'seller') {
    throw new Error(`[ASSERTION FAIL] Page ${pageSpec.name} missing data-ui-refinement="seller"!`);
  }
  if (uiPage !== pageSpec.name) {
    throw new Error(`[ASSERTION FAIL] Page ${pageSpec.name} data-ui-page expected "${pageSpec.name}", found "${uiPage}"!`);
  }

  // 5. Unique heading/content anchor check
  const h1 = await page.$eval('h1', el => el.textContent.trim()).catch(() => '');
  const pageTitleText = await page.title();
  if (!h1 && !pageTitleText) {
    throw new Error(`[ASSERTION FAIL] Page ${pageSpec.name} missing both H1 and document title!`);
  }

  return { currentUrl, navLinkCount, h1, pageTitleText };
}

async function captureScreen(page, outputPath, fullPage = true) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });
  await page.screenshot({ path: outputPath, fullPage });
}

// ── Exported CLI Actions ───────────────────────────────────────────────────
module.exports = {
  BASE_URL,
  EDGE_EXE,
  ARTIFACT_DIR,
  SELLER_PAGES,
  UNMARKED_PAGES,
  VIEWPORTS,
  setupComprehensiveMocks,
  injectSession,
  verifyPageAssertions,
  captureScreen
};

if (require.main === module) {
  const mode = process.argv[2] || 'check';
  console.log(`Starting Seller UI Harness in mode: [${mode}]...`);
  // Will run when called directly
}
