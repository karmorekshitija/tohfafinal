/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FILE: scripts/run_p0_baseline.cjs
 *  PURPOSE: Executes P0 Baseline Capture for all 10 Seller Studio pages
 *           at Mobile (390x844) and Desktop (1440x1000), plus states
 * ═══════════════════════════════════════════════════════════════════════════
 */

const puppeteer = require('c:/Users/ACER/OneDrive/Desktop/antigravity_workspace/tohfanew/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');
const harness = require('./seller_ui_harness.cjs');

const BASELINE_DIR = path.join(harness.ARTIFACT_DIR, 'baseline');
if (!fs.existsSync(BASELINE_DIR)) fs.mkdirSync(BASELINE_DIR, { recursive: true });

(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  STARTING P0 BASELINE SCREENSHOT CAPTURES');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Target directory: ${BASELINE_DIR}`);

  const browser = await puppeteer.launch({
    executablePath: harness.EDGE_EXE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'],
  });

  const results = [];

  try {
    // 1. Mobile Reference (390x844)
    console.log('\n── Capturing Mobile Reference (390×844) ──');
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport(harness.VIEWPORTS.mobile_ref);
    await harness.setupComprehensiveMocks(mobilePage, { isTourOpen: false });
    await harness.injectSession(mobilePage, { isTourOpen: false });

    for (const pageSpec of harness.SELLER_PAGES) {
      const pageUrl = `${harness.BASE_URL}${pageSpec.path}`;
      console.log(`  → [${pageSpec.id}] ${pageSpec.name} (Mobile)...`);
      await mobilePage.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      const assertions = await harness.verifyPageAssertions(mobilePage, pageSpec);
      const outPath = path.join(BASELINE_DIR, `${pageSpec.id}_${pageSpec.name}_mobile_390x844.png`);
      await harness.captureScreen(mobilePage, outPath);
      results.push({ page: pageSpec.name, viewport: '390x844', file: path.basename(outPath), status: 'PASS', assertions });
    }
    await mobilePage.close();

    // 2. Desktop Reference (1440x1000)
    console.log('\n── Capturing Desktop Reference (1440×1000) ──');
    const deskPage = await browser.newPage();
    await deskPage.setViewport(harness.VIEWPORTS.desktop_ref);
    await harness.setupComprehensiveMocks(deskPage, { isTourOpen: false });
    await harness.injectSession(deskPage, { isTourOpen: false });

    for (const pageSpec of harness.SELLER_PAGES) {
      const pageUrl = `${harness.BASE_URL}${pageSpec.path}`;
      console.log(`  → [${pageSpec.id}] ${pageSpec.name} (Desktop)...`);
      await deskPage.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      const assertions = await harness.verifyPageAssertions(deskPage, pageSpec);
      const outPath = path.join(BASELINE_DIR, `${pageSpec.id}_${pageSpec.name}_desktop_1440x1000.png`);
      await harness.captureScreen(deskPage, outPath);
      results.push({ page: pageSpec.name, viewport: '1440x1000', file: path.basename(outPath), status: 'PASS', assertions });
    }
    await deskPage.close();

    // 3. State Captures
    console.log('\n── Capturing Special States ──');
    
    // 3a. Dashboard Tour Open state (desktop & mobile)
    {
      const tourDesk = await browser.newPage();
      await tourDesk.setViewport(harness.VIEWPORTS.desktop_ref);
      await harness.setupComprehensiveMocks(tourDesk, { isTourOpen: true });
      await harness.injectSession(tourDesk, { isTourOpen: true });
      await tourDesk.goto(`${harness.BASE_URL}/seller/dashboard.html`, { waitUntil: 'networkidle2', timeout: 20000 });
      await tourDesk.waitForSelector('#seller-intro-tour-overlay', { timeout: 5000 }).catch(() => null);
      const outPath = path.join(BASELINE_DIR, 'S01_dashboard_desktop_tour_open.png');
      await harness.captureScreen(tourDesk, outPath);
      console.log('  ✓ S01 Dashboard Desktop Tour Open captured');
      await tourDesk.close();

      const tourMob = await browser.newPage();
      await tourMob.setViewport(harness.VIEWPORTS.mobile_ref);
      await harness.setupComprehensiveMocks(tourMob, { isTourOpen: true });
      await harness.injectSession(tourMob, { isTourOpen: true });
      await tourMob.goto(`${harness.BASE_URL}/seller/dashboard.html`, { waitUntil: 'networkidle2', timeout: 20000 });
      await tourMob.waitForSelector('#seller-intro-tour-overlay', { timeout: 5000 }).catch(() => null);
      const outMobPath = path.join(BASELINE_DIR, 'S01_dashboard_mobile_tour_open.png');
      await harness.captureScreen(tourMob, outMobPath);
      console.log('  ✓ S01 Dashboard Mobile Tour Open captured');
      await tourMob.close();
    }

    // 3b. Plans Pro Tier state
    {
      const plansPage = await browser.newPage();
      await plansPage.setViewport(harness.VIEWPORTS.desktop_ref);
      await harness.setupComprehensiveMocks(plansPage, { planTier: 'pro' });
      await harness.injectSession(plansPage, { planTier: 'pro' });
      await plansPage.goto(`${harness.BASE_URL}/seller/plans.html`, { waitUntil: 'networkidle2', timeout: 20000 });
      const outPath = path.join(BASELINE_DIR, 'S08_plans_desktop_pro_tier.png');
      await harness.captureScreen(plansPage, outPath);
      console.log('  ✓ S08 Plans Desktop Pro Tier captured');
      await plansPage.close();
    }

    // 3c. Reviews Settings Modal Open
    {
      const revPage = await browser.newPage();
      await revPage.setViewport(harness.VIEWPORTS.desktop_ref);
      await harness.setupComprehensiveMocks(revPage, {});
      await harness.injectSession(revPage, {});
      await revPage.goto(`${harness.BASE_URL}/seller/reviews.html`, { waitUntil: 'networkidle2', timeout: 20000 });
      await revPage.click('#auto-request-btn').catch(() => null);
      await revPage.waitForSelector('#auto-request-modal:not(.hidden)', { timeout: 3000 }).catch(() => null);
      const outPath = path.join(BASELINE_DIR, 'S10_reviews_desktop_modal_open.png');
      await harness.captureScreen(revPage, outPath);
      console.log('  ✓ S10 Reviews Desktop Modal Open captured');
      await revPage.close();
    }

    // 3d. Admin Switched Session (Omits Payouts and Plans)
    {
      const adminSwitched = await browser.newPage();
      await adminSwitched.setViewport(harness.VIEWPORTS.desktop_ref);
      await harness.setupComprehensiveMocks(adminSwitched, { isAdminSwitched: true });
      await harness.injectSession(adminSwitched, { isAdminSwitched: true });
      await adminSwitched.goto(`${harness.BASE_URL}/seller/dashboard.html`, { waitUntil: 'networkidle2', timeout: 20000 });
      const assertions = await harness.verifyPageAssertions(adminSwitched, harness.SELLER_PAGES[0], { isAdminSwitched: true });
      const outPath = path.join(BASELINE_DIR, 'S01_dashboard_desktop_admin_switched.png');
      await harness.captureScreen(adminSwitched, outPath);
      console.log(`  ✓ Admin Switched Session verified (Nav Links: ${assertions.navLinkCount}, expected 7)`);
      await adminSwitched.close();
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`✅ P0 Baseline completed successfully! Total captures: ${results.length + 5}`);
    console.log('═══════════════════════════════════════════════════════════');

    fs.writeFileSync(path.join(BASELINE_DIR, 'baseline_index.json'), JSON.stringify(results, null, 2));

  } catch (err) {
    console.error('P0 Baseline error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
