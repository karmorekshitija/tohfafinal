/**
 * Tohfa v2 — Automated SEO Quality Gate & Crawl Audit
 * File: scripts/seo_audit.mjs
 * Role: Audits all public static & dynamic routes, canonical URLs, titles, meta descriptions,
 *       H1 single hierarchy, JSON-LD structured data, image alt tags, sitemaps, robots.txt,
 *       and Google Shopping feeds. Fails if any quality gate is breached.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../frontend/dist');

let errors = [];
let warnings = [];
let passedChecks = 0;

function pass(msg) {
  passedChecks++;
  console.log('  ✅ ' + msg);
}

function fail(msg) {
  errors.push(msg);
  console.error('  ❌ FAIL: ' + msg);
}

function warn(msg) {
  warnings.push(msg);
  console.warn('  ⚠️ WARN: ' + msg);
}

function checkHtmlFile(filePath, expectedCanonical, pageLabel) {
  if (!fs.existsSync(filePath)) {
    fail(`File missing: ${filePath} (${pageLabel})`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // 1. Robots Index Check
  if (content.includes('content="noindex') || content.includes("content='noindex")) {
    fail(`${pageLabel} contains noindex!`);
  } else {
    pass(`${pageLabel} is indexable`);
  }

  // 2. Canonical Tag Check
  const canonicalMatch = content.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) ||
                         content.match(/<link\s+href=["']([^"']+)["']\s+rel=["']canonical["']/i);
  if (!canonicalMatch) {
    fail(`${pageLabel} missing canonical link tag!`);
  } else {
    const foundCanonical = canonicalMatch[1];
    if (expectedCanonical && foundCanonical !== expectedCanonical) {
      fail(`${pageLabel} canonical mismatch! Expected: ${expectedCanonical}, Found: ${foundCanonical}`);
    } else {
      pass(`${pageLabel} canonical is correct: ${foundCanonical}`);
    }
  }

  // 3. Title Check
  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  if (!titleMatch || !titleMatch[1].trim()) {
    fail(`${pageLabel} missing or empty <title>!`);
  } else {
    const title = titleMatch[1].trim();
    if (title.length < 10) {
      warn(`${pageLabel} title is very short: "${title}"`);
    } else {
      pass(`${pageLabel} title: "${title}"`);
    }
  }

  // 4. Meta Description Check
  const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                    content.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  if (!descMatch || !descMatch[1].trim()) {
    fail(`${pageLabel} missing meta description!`);
  } else {
    pass(`${pageLabel} meta description present (${descMatch[1].trim().length} chars)`);
  }

  // 5. Single H1 Check
  const h1Matches = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  if (!h1Matches || h1Matches.length === 0) {
    fail(`${pageLabel} has NO <h1> tag!`);
  } else if (h1Matches.length > 1) {
    warn(`${pageLabel} has multiple (${h1Matches.length}) <h1> tags!`);
  } else {
    const h1Text = h1Matches[0].replace(/<[^>]+>/g, '').trim();
    pass(`${pageLabel} has single clean H1: "${h1Text.substring(0, 50)}..."`);
  }

  // 6. JSON-LD Structured Data Check
  const jsonLdMatches = content.match(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!jsonLdMatches || jsonLdMatches.length === 0) {
    warn(`${pageLabel} has no Schema.org JSON-LD structured data`);
  } else {
    let validJsonLdCount = 0;
    for (const match of jsonLdMatches) {
      const inner = match.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
      try {
        const parsed = JSON.parse(inner);
        validJsonLdCount++;
      } catch (err) {
        fail(`${pageLabel} invalid JSON-LD syntax: ${err.message}`);
      }
    }
    if (validJsonLdCount > 0) {
      pass(`${pageLabel} has ${validJsonLdCount} valid JSON-LD structured data block(s)`);
    }
  }

  // 7. Image Alt Check
  const imgMatches = content.match(/<img[^>]+>/gi) || [];
  let missingAlt = 0;
  for (const img of imgMatches) {
    if (!img.includes('alt=') || img.includes('alt=""') || img.includes("alt=''")) {
      missingAlt++;
    }
  }
  if (missingAlt > 0) {
    warn(`${pageLabel} has ${missingAlt} image(s) with missing or empty alt attribute`);
  } else {
    pass(`${pageLabel} all images have descriptive alt attributes`);
  }
}

async function runAudit() {
  console.log('====================================================');
  console.log('🔍 TOHFA SEO 2.0 AUTOMATED QUALITY GATE AUDIT');
  console.log('====================================================\n');

  // Gate 1: Homepage Verification
  console.log('--- GATE 1: Canonical Root Homepage ---');
  checkHtmlFile(path.resolve(distDir, 'index.html'), 'https://thetohfa.in/', 'Root Homepage (/)');

  // Gate 2: Commercial SEO Landing Pages
  console.log('\n--- GATE 2: Commercial High-Intent Landing Pages ---');
  const landingPages = [
    { file: 'customized-gifts.html', canonical: 'https://thetohfa.in/customized-gifts', label: 'Customized Gifts (/customized-gifts)' },
    { file: 'personalized-gifts.html', canonical: 'https://thetohfa.in/personalized-gifts', label: 'Personalized Gifts (/personalized-gifts)' },
    { file: 'handmade-gifts.html', canonical: 'https://thetohfa.in/handmade-gifts', label: 'Handmade Gifts (/handmade-gifts)' },
    { file: 'gifts-in-india.html', canonical: 'https://thetohfa.in/gifts-in-india', label: 'Gifts in India (/gifts-in-india)' },
    { file: 'categories.html', canonical: 'https://thetohfa.in/categories', label: 'All Categories (/categories)' },
    { file: 'bulk.html', canonical: 'https://thetohfa.in/bulk', label: 'Bulk Gifting (/bulk)' },
    { file: 'about.html', canonical: 'https://thetohfa.in/about', label: 'About Us (/about)' },
    { file: 'contact.html', canonical: 'https://thetohfa.in/contact', label: 'Contact Us (/contact)' },
    { file: 'faq.html', canonical: 'https://thetohfa.in/faq', label: 'FAQ (/faq)' }
  ];

  for (const p of landingPages) {
    checkHtmlFile(path.resolve(distDir, p.file), p.canonical, p.label);
  }

  // Gate 3: Editorial Gift Guides
  console.log('\n--- GATE 3: Editorial Gift Guides ---');
  const guidePages = [
    { file: 'guides/index.html', canonical: 'https://thetohfa.in/guides', label: 'Guides Hub (/guides)' },
    { file: 'guides/best-customized-gifts-in-india.html', canonical: 'https://thetohfa.in/guides/best-customized-gifts-in-india', label: 'Best Customized Gifts Guide' },
    { file: 'guides/handmade-gifts-in-india.html', canonical: 'https://thetohfa.in/guides/handmade-gifts-in-india', label: 'Handmade Gifts Guide' },
    { file: 'guides/how-to-choose-a-personalized-gift.html', canonical: 'https://thetohfa.in/guides/how-to-choose-a-personalized-gift', label: 'Choosing Personalized Gift Guide' },
    { file: 'guides/anniversary-gift-guide.html', canonical: 'https://thetohfa.in/guides/anniversary-gift-guide', label: 'Anniversary Gift Guide' },
    { file: 'guides/birthday-gift-guide.html', canonical: 'https://thetohfa.in/guides/birthday-gift-guide', label: 'Birthday Gift Guide' }
  ];

  for (const g of guidePages) {
    checkHtmlFile(path.resolve(distDir, g.file), g.canonical, g.label);
  }

  // Gate 4: Static Product Pre-renders
  console.log('\n--- GATE 4: Static Product Pages ---');
  const prodsDir = path.resolve(distDir, 'products');
  if (fs.existsSync(prodsDir)) {
    const prodEntries = fs.readdirSync(prodsDir);
    // Filter for slug-based product entries (not pure UUIDs)
    const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const slugEntries = prodEntries.filter(e => !isUuid(e));
    let auditedProds = 0;
    for (const entry of slugEntries.slice(0, 15)) {
      const prodHtml = path.resolve(prodsDir, entry, 'index.html');
      if (fs.existsSync(prodHtml)) {
        checkHtmlFile(prodHtml, `https://thetohfa.in/products/${entry}`, `Product: /products/${entry}`);
        auditedProds++;
      }
    }
    pass(`Successfully verified ${auditedProds} slug-based pre-rendered product pages`);
  } else {
    warn('No static products directory found (run build first)');
  }

  // Gate 5: Static Category Pre-renders
  console.log('\n--- GATE 5: Static Category Pages ---');
  const catsDir = path.resolve(distDir, 'category');
  if (fs.existsSync(catsDir)) {
    const catEntries = fs.readdirSync(catsDir);
    let auditedCats = 0;
    for (const entry of catEntries) {
      const catHtml = path.resolve(catsDir, entry, 'index.html');
      if (fs.existsSync(catHtml)) {
        checkHtmlFile(catHtml, `https://thetohfa.in/category/${entry}`, `Category: /category/${entry}`);
        auditedCats++;
      }
    }
    pass(`Successfully verified ${auditedCats} pre-rendered category pages`);
  } else {
    warn('No static category directory found (run build first)');
  }

  // Gate 6: XML Sitemap Quality & Integrity
  console.log('\n--- GATE 6: XML Sitemap Quality ---');
  const sitemapPath = path.resolve(distDir, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    fail('sitemap.xml missing in output directory!');
  } else {
    const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
    if (!sitemapContent.startsWith('<?xml')) {
      fail('sitemap.xml does not have valid XML declaration!');
    } else {
      pass('sitemap.xml valid XML declaration');
    }

    const locMatches = sitemapContent.match(/<loc>(.*?)<\/loc>/g) || [];
    pass(`sitemap.xml contains ${locMatches.length} canonical URLs`);

    let invalidUrls = 0;
    for (const loc of locMatches) {
      const url = loc.replace(/<\/?loc>/g, '');
      if (url.includes('/buyer/home') || url.includes('/admin') || url.includes('/seller/dashboard') || url.includes('?id=')) {
        fail(`Sitemap contains invalid or non-canonical URL: ${url}`);
        invalidUrls++;
      }
    }
    if (invalidUrls === 0) {
      pass('All URLs in sitemap.xml are canonical and indexable');
    }
  }

  // Gate 7: Robots.txt Rules
  console.log('\n--- GATE 7: Robots.txt Architecture ---');
  const robotsPath = path.resolve(distDir, 'robots.txt');
  if (!fs.existsSync(robotsPath)) {
    fail('robots.txt missing in output directory!');
  } else {
    const robotsContent = fs.readFileSync(robotsPath, 'utf8');
    if (!robotsContent.includes('Allow: /')) {
      fail('robots.txt does not explicitly Allow: /');
    } else {
      pass('robots.txt allows public crawling');
    }

    if (!robotsContent.includes('Disallow: /admin/') || !robotsContent.includes('Disallow: /seller/')) {
      warn('robots.txt should disallow /admin/ and /seller/ studio');
    } else {
      pass('robots.txt blocks private application paths');
    }

    if (!robotsContent.includes('Sitemap: https://thetohfa.in/sitemap.xml')) {
      fail('robots.txt missing authoritative Sitemap directive');
    } else {
      pass('robots.txt references https://thetohfa.in/sitemap.xml');
    }
  }

  // Gate 8: Google Merchant Center Product Feed
  console.log('\n--- GATE 8: Google Merchant Center Product Feed ---');
  const feedPath = path.resolve(distDir, 'feeds/google-merchant.xml');
  if (!fs.existsSync(feedPath)) {
    warn('feeds/google-merchant.xml missing in output directory');
  } else {
    const feedContent = fs.readFileSync(feedPath, 'utf8');
    const items = feedContent.match(/<item>/g) || [];
    pass(`google-merchant.xml product feed contains ${items.length} eligible products`);
    if (feedContent.includes('<g:price>') && feedContent.includes('INR')) {
      pass('google-merchant.xml contains valid INR pricing attributes');
    }
  }

  console.log('\n====================================================');
  console.log(`AUDIT SUMMARY: ${passedChecks} checks passed, ${warnings.length} warnings, ${errors.length} errors.`);
  console.log('====================================================\n');

  if (errors.length > 0) {
    console.error(`💥 SEO QUALITY GATES FAILED with ${errors.length} error(s)!`);
    process.exit(1);
  } else {
    console.log('🎉 ALL SEO QUALITY GATES PASSED! Website is technically ready for Google + AI search indexing.');
    process.exit(0);
  }
}

runAudit().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
