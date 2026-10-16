const puppeteer = require('c:/Users/ACER/OneDrive/Desktop/antigravity_workspace/tohfanew/node_modules/puppeteer-core');
const EDGE_EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_EXE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setRequestInterception(true);

    page.on('request', req => {
      const url = req.url();
      if (req.method() === 'OPTIONS') {
        return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }

      if (url.includes('/api/profile/me')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: { id: 99, role: 'seller', is_approved: 1, name: 'Aarav Handcrafts', store_name: 'Aarav Handcrafts' }
          })
        });
      }

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
              hasBillingAddress: true,
              hasBankingDetails: true,
              onboardingTourDismissed: true
            }
          })
        });
      }

      if (url.includes('/api/seller/reviews')) {
        return req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            success: true,
            data: {
              reviews: [
                { id: 1, rating: 5, buyer_name: 'Priya S.', comment: 'Exquisite craftsmanship! Arrived beautifully packed.', created_at: '2026-10-10' }
              ],
              summary: {
                avg_rating: 4.9,
                total_reviews: 1,
                pending_replies: 0,
                response_rate_pct: 100,
                rating_distribution: { 5: 1, 4: 0, 3: 0, 2: 0, 1: 0 }
              }
            }
          })
        });
      }

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

    await page.evaluateOnNewDocument(() => {
      const token = 'fake-test-seller-jwt';
      const user = JSON.stringify({ id: 99, name: 'Aarav Handcrafts', role: 'seller', is_approved: 1 });
      sessionStorage.setItem('tohfa_access_token', token);
      localStorage.setItem('tohfa_access_token', token);
      sessionStorage.setItem('tohfa_user', user);
      localStorage.setItem('tohfa_user', user);
      sessionStorage.removeItem('tohfa_admin_switch_context');
    });

    console.log('Navigating to http://localhost:5173/seller/reviews.html...');
    await page.goto('http://localhost:5173/seller/reviews.html', { waitUntil: 'networkidle2', timeout: 15000 });

    const finalUrl = page.url();
    console.log('Final URL:', finalUrl);

    const heading = await page.$eval('h1', el => el.textContent.trim()).catch(() => null);
    console.log('H1 Heading:', heading);

    const navLinksCount = await page.$$eval('seller-sidebar nav a.sidebar-link', els => els.length);
    console.log('Sidebar nav links count:', navLinksCount);

    if (finalUrl.includes('login') || navLinksCount !== 9) {
      console.error('FAILURE: Redirected or invalid link count!');
      process.exit(1);
    } else {
      console.log('SUCCESS: Navigation and assertions verified!');
    }
  } finally {
    await browser.close();
  }
})();
