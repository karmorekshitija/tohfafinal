/**
 * Tohfa v2 — Static SEO Prerender & Schema Generator
 * File: frontend/scripts/prerender_seo.mjs
 * Role: Generates static crawlable HTML pages for all products, categories, sellers,
 *       and landing pages at build time, complete with structured data JSON-LD,
 *       pre-hydrated HTML, XML Sitemaps, and Google Merchant Center product feed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const BASE_URL = 'https://thetohfa.in';
const API_URL = process.env.API_URL || 'https://tohfafinal.onrender.com';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchFromApi(endpoint) {
  try {
    const res = await fetch(API_URL + endpoint);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.warn('[Prerender Warning] Could not fetch ' + endpoint + ' from ' + API_URL + ': ' + err.message);
    return null;
  }
}

async function main() {
  console.log('🚀 [SEO Prerender] Starting build-time static HTML & schema generation...');

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 1. Fetch live categories, products, sellers
  const [catData, prodData, sellerData] = await Promise.all([
    fetchFromApi('/api/categories'),
    fetchFromApi('/api/products?limit=500'),
    fetchFromApi('/api/sellers/featured') || fetchFromApi('/api/sellers')
  ]);

  const categories = catData?.data?.categories || catData?.categories || [];
  const products = prodData?.data?.products || prodData?.products || [];
  let sellers = sellerData?.data?.sellers || sellerData?.sellers || [];

  // Extract sellers from products if seller endpoint returned empty
  const sellerMap = new Map();
  for (const s of sellers) {
    if (s.id) sellerMap.set(String(s.id), s);
  }
  for (const p of products) {
    if (p.seller_id && !sellerMap.has(String(p.seller_id))) {
      sellerMap.set(String(p.seller_id), {
        id: p.seller_id,
        name: p.seller_name || p.store_name || 'Artisan Studio',
        store_name: p.seller_name || p.store_name || 'Artisan Studio',
        slug: (p.seller_name || p.store_name || 'artisan-studio').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        bio: 'Independent Indian creator specializing in ' + (p.category_name || 'handcrafted gifts') + ' on Tohfa.'
      });
    }
  }
  sellers = Array.from(sellerMap.values());

  console.log('📦 Loaded ' + categories.length + ' categories, ' + products.length + ' products, ' + sellers.length + ' sellers');

  // Locate template files
  const productTplPath = path.resolve(distDir, 'buyer/product.html');
  const categoryTplPath = path.resolve(distDir, 'buyer/category.html');
  const sellerTplPath = path.resolve(distDir, 'buyer/seller-profile.html');

  const hasProductTpl = fs.existsSync(productTplPath);
  const hasCategoryTpl = fs.existsSync(categoryTplPath);
  const hasSellerTpl = fs.existsSync(sellerTplPath);

  const productTpl = hasProductTpl ? fs.readFileSync(productTplPath, 'utf8') : '';
  const categoryTpl = hasCategoryTpl ? fs.readFileSync(categoryTplPath, 'utf8') : '';
  const sellerTpl = hasSellerTpl ? fs.readFileSync(sellerTplPath, 'utf8') : '';

  // 2. Generate Product Pages
  const canonicalProductUrls = [];
  if (hasProductTpl && products.length > 0) {
    for (const p of products) {
      const slug = p.slug || p.id;
      const canonicalUrl = BASE_URL + '/products/' + slug;
      canonicalProductUrls.push({ url: canonicalUrl, product: p });

      const price = parseFloat(p.price || p.base_price || 0);
      const imgUrl = (p.images && p.images[0] && (p.images[0].url || p.images[0])) || p.image_url || p.primary_image || 'https://thetohfa.in/img/botanical-hero.png';
      const absImgUrl = imgUrl.startsWith('http') ? imgUrl : (BASE_URL + imgUrl);
      const catName = p.category_name || (p.category && p.category.name) || 'Handcrafted Gifts';
      const catSlug = p.category_slug || (p.category && p.category.slug) || 'gifts-keepsakes';
      const sellerName = p.seller_name || p.store_name || (p.seller && p.seller.seller_name) || 'Independent Maker';
      const desc = p.description || ('Discover ' + p.name + ', handcrafted with care by ' + sellerName + ' on Tohfa. Authentic Indian gifting with pan-India delivery.');
      const cleanDesc = desc.replace(/\s+/g, ' ').substring(0, 160);

      // JSON-LD Schema
      const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": BASE_URL + "/" },
              { "@type": "ListItem", "position": 2, "name": catName, "item": BASE_URL + "/category/" + catSlug },
              { "@type": "ListItem", "position": 3, "name": p.name, "item": canonicalUrl }
            ]
          },
          {
            "@type": "Product",
            "name": p.name,
            "description": desc,
            "image": [absImgUrl],
            "brand": {
              "@type": "Brand",
              "name": "Tohfa"
            },
            "offers": {
              "@type": "Offer",
              "url": canonicalUrl,
              "priceCurrency": "INR",
              "price": price.toFixed(2),
              "availability": (p.stock_quantity > 0 || p.stock_count > 0 || p.stock_qty > 0) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              "seller": {
                "@type": "Organization",
                "name": sellerName
              }
            }
          }
        ]
      };

      let html = productTpl;
      html = html.replace(/<title>.*?<\/title>/, '<title>' + escapeHtml(p.name) + ' | ' + escapeHtml(catName) + ' | Tohfa</title>');
      html = html.replace(/<link rel="canonical" href="[^"]*"\/>/, '<link rel="canonical" href="' + canonicalUrl + '"/>');
      html = html.replace(/<meta name="description" content="[^"]*"\/>/, '<meta name="description" content="' + escapeHtml(cleanDesc) + '"/>');
      html = html.replace(/<meta property="og:title" content="[^"]*"\/>/, '<meta property="og:title" content="' + escapeHtml(p.name) + ' | Tohfa"/>');
      html = html.replace(/<meta property="og:description" content="[^"]*"\/>/, '<meta property="og:description" content="' + escapeHtml(cleanDesc) + '"/>');
      html = html.replace(/<meta property="og:image" content="[^"]*"\/>/, '<meta property="og:image" content="' + absImgUrl + '"/>');
      html = html.replace(/<meta property="og:url" content="[^"]*"\/>/, '<meta property="og:url" content="' + canonicalUrl + '"/>');
      html = html.replace(/<meta name="twitter:image" content="[^"]*"\/>/, '<meta name="twitter:image" content="' + absImgUrl + '"/>');

      // Inject structured data
      html = html.replace(/<script type="application\/ld\+json" id="product-jsonld">[\s\S]*?<\/script>/, '<script type="application/ld+json" id="product-jsonld">\n' + JSON.stringify(jsonLd, null, 2) + '\n</script>');

      // Pre-inject visible product content into container
      const prefilledHtml = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 pt-4">
          <!-- Gallery -->
          <div class="lg:col-span-7 flex flex-col gap-4">
            <div class="w-full aspect-square rounded-3xl overflow-hidden bg-white border border-[#14381F]/10 shadow-sm relative">
              <img src="${absImgUrl}" alt="${escapeHtml(p.name)}" class="w-full h-full object-cover" loading="eager" />
            </div>
          </div>
          <!-- Product Details -->
          <div class="lg:col-span-5 flex flex-col">
            <nav class="text-xs text-[#7a7a6e] mb-3 flex items-center gap-2">
              <a href="/" class="hover:text-[#14381F]">Home</a>
              <span>&rsaquo;</span>
              <a href="/category/${catSlug}" class="hover:text-[#14381F]">${escapeHtml(catName)}</a>
              <span>&rsaquo;</span>
              <span class="text-[#14381F] font-semibold truncate max-w-[180px]">${escapeHtml(p.name)}</span>
            </nav>
            <h1 class="text-2xl sm:text-3xl font-semibold text-[#14381F] font-['Playfair_Display'] mb-2">${escapeHtml(p.name)}</h1>
            <p class="text-xs text-[#7a7a6e] mb-4">Crafted by <span class="font-medium text-[#14381F]">${escapeHtml(sellerName)}</span></p>
            <div class="text-2xl sm:text-3xl font-bold text-[#14381F] font-['Playfair_Display'] mb-4">₹${price.toLocaleString('en-IN')}</div>
            <div class="text-sm text-[#4a4a4a] leading-relaxed mb-6 border-t border-b border-[#14381F]/10 py-4">${escapeHtml(desc)}</div>
          </div>
        </div>
      `;

      html = html.replace('<div id="productContent"></div>', '<div id="productContent">' + prefilledHtml + '</div>');

      // Write to dist/products/{slug}/index.html
      const prodDir = path.resolve(distDir, 'products', slug);
      if (!fs.existsSync(prodDir)) fs.mkdirSync(prodDir, { recursive: true });
      fs.writeFileSync(path.resolve(prodDir, 'index.html'), html, 'utf8');

      // Also if slug is not ID, write alias for ID
      if (p.id && p.id !== slug) {
        const idDir = path.resolve(distDir, 'products', p.id);
        if (!fs.existsSync(idDir)) fs.mkdirSync(idDir, { recursive: true });
        fs.writeFileSync(path.resolve(idDir, 'index.html'), html, 'utf8');
      }
    }
    console.log('✅ Generated ' + canonicalProductUrls.length + ' static product pages under /products/');
  }

  // 3. Generate Category Pages
  const canonicalCatUrls = [];
  if (hasCategoryTpl && categories.length > 0) {
    for (const cat of categories) {
      const slug = cat.slug;
      if (!slug) continue;
      const canonicalUrl = BASE_URL + '/category/' + slug;
      canonicalCatUrls.push({ url: canonicalUrl, category: cat });

      const catName = cat.name || cat.display_name || 'Handcrafted Collection';
      const desc = cat.description || ('Discover handcrafted ' + catName + ' on Tohfa. Explore unique creations directly from independent Indian artisans with fast delivery across India.');
      const cleanDesc = desc.replace(/\s+/g, ' ').substring(0, 160);

      const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": BASE_URL + "/" },
              { "@type": "ListItem", "position": 2, "name": "Categories", "item": BASE_URL + "/categories" },
              { "@type": "ListItem", "position": 3, "name": catName, "item": canonicalUrl }
            ]
          },
          {
            "@type": "CollectionPage",
            "name": catName + ' | Handmade & Personalized Gifts',
            "description": desc,
            "url": canonicalUrl
          }
        ]
      };

      let html = categoryTpl;
      html = html.replace(/<title>.*?<\/title>/, '<title>' + escapeHtml(catName) + ' | Handmade &amp; Personalized Gifts | Tohfa</title>');
      html = html.replace(/<link rel="canonical" href="[^"]*"\/>/, '<link rel="canonical" href="' + canonicalUrl + '"/>');
      html = html.replace(/<meta name="description" content="[^"]*"\/>/, '<meta name="description" content="' + escapeHtml(cleanDesc) + '"/>');
      html = html.replace(/<meta property="og:title" content="[^"]*"\/>/, '<meta property="og:title" content="' + escapeHtml(catName) + ' | Tohfa"/>');
      html = html.replace(/<meta property="og:description" content="[^"]*"\/>/, '<meta property="og:description" content="' + escapeHtml(cleanDesc) + '"/>');
      html = html.replace(/<meta property="og:url" content="[^"]*"\/>/, '<meta property="og:url" content="' + canonicalUrl + '"/>');
      html = html.replace(/<h1 id="category-title"[^>]*>[\s\S]*?<\/h1>/i, '<h1 id="category-title" class="font-[\'Playfair_Display\',serif] italic font-bold text-2xl sm:text-3xl md:text-4xl text-[#14381F] tracking-tight group-hover:underline">' + escapeHtml(catName) + '</h1>');
      html = html.replace(/<p id="category-description"[^>]*>[\s\S]*?<\/p>/i, '<p id="category-description" class="text-xs sm:text-sm text-[#4a4a4a] leading-relaxed">' + escapeHtml(desc) + '</p>');

      const catDir = path.resolve(distDir, 'category', slug);
      if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
      fs.writeFileSync(path.resolve(catDir, 'index.html'), html, 'utf8');
    }
    console.log('✅ Generated ' + canonicalCatUrls.length + ' static category pages under /category/');
  }

  // 4. Generate Seller Profile Pages
  const canonicalSellerUrls = [];
  if (hasSellerTpl && sellers.length > 0) {
    for (const s of sellers) {
      const slug = s.slug || s.store_slug || s.id;
      if (!slug) continue;
      const canonicalUrl = BASE_URL + '/seller/' + slug;
      canonicalSellerUrls.push({ url: canonicalUrl, seller: s });

      const storeName = s.store_name || s.name || 'Artisan Studio';
      const desc = s.bio || s.story || ('Explore authentic handmade creations by ' + storeName + ' on Tohfa. Handcrafted in India.');
      const cleanDesc = desc.replace(/\s+/g, ' ').substring(0, 160);

      let html = sellerTpl;
      html = html.replace(/<title>.*?<\/title>/, '<title>' + escapeHtml(storeName) + ' | Handmade Gifts from Indian Creators | Tohfa</title>');
      html = html.replace(/<link rel="canonical" href="[^"]*"\/>/, '<link rel="canonical" href="' + canonicalUrl + '"/>');
      html = html.replace(/<meta name="description" content="[^"]*"\/>/, '<meta name="description" content="' + escapeHtml(cleanDesc) + '"/>');
      html = html.replace(/<meta property="og:url" content="[^"]*"\/>/, '<meta property="og:url" content="' + canonicalUrl + '"/>');

      const sellerDir = path.resolve(distDir, 'seller', slug);
      if (!fs.existsSync(sellerDir)) fs.mkdirSync(sellerDir, { recursive: true });
      fs.writeFileSync(path.resolve(sellerDir, 'index.html'), html, 'utf8');

      if (s.id && s.id !== slug) {
        const sIdDir = path.resolve(distDir, 'seller', String(s.id));
        if (!fs.existsSync(sIdDir)) fs.mkdirSync(sIdDir, { recursive: true });
        fs.writeFileSync(path.resolve(sIdDir, 'index.html'), html, 'utf8');
      }
    }
    console.log('✅ Generated ' + canonicalSellerUrls.length + ' static seller pages under /seller/');
  }

  // 5. Generate Directory Indexes for Clean URLs
  const cleanPages = [
    'customized-gifts',
    'personalized-gifts',
    'handmade-gifts',
    'gifts-in-india',
    'about',
    'contact',
    'bulk',
    'faq',
    'categories'
  ];

  for (const cp of cleanPages) {
    const srcHtml = path.resolve(distDir, cp + '.html');
    if (fs.existsSync(srcHtml)) {
      const targetDir = path.resolve(distDir, cp);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(srcHtml, path.resolve(targetDir, 'index.html'));
    }
  }

  const guideSubs = [
    'best-customized-gifts-in-india',
    'handmade-gifts-in-india',
    'how-to-choose-a-personalized-gift',
    'anniversary-gift-guide',
    'birthday-gift-guide'
  ];

  for (const gs of guideSubs) {
    const srcHtml = path.resolve(distDir, 'guides/' + gs + '.html');
    if (fs.existsSync(srcHtml)) {
      const targetDir = path.resolve(distDir, 'guides/' + gs);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(srcHtml, path.resolve(targetDir, 'index.html'));
    }
  }

  // 6. Generate Authoritative XML Sitemap
  const nowIso = new Date().toISOString().split('T')[0];
  let sitemapXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  sitemapXml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

  const staticUrls = [
    { loc: BASE_URL + '/', priority: '1.0', changefreq: 'daily' },
    { loc: BASE_URL + '/customized-gifts', priority: '0.95', changefreq: 'daily' },
    { loc: BASE_URL + '/personalized-gifts', priority: '0.95', changefreq: 'daily' },
    { loc: BASE_URL + '/handmade-gifts', priority: '0.95', changefreq: 'daily' },
    { loc: BASE_URL + '/gifts-in-india', priority: '0.95', changefreq: 'daily' },
    { loc: BASE_URL + '/categories', priority: '0.90', changefreq: 'weekly' },
    { loc: BASE_URL + '/bulk', priority: '0.85', changefreq: 'weekly' },
    { loc: BASE_URL + '/guides', priority: '0.85', changefreq: 'weekly' },
    { loc: BASE_URL + '/guides/best-customized-gifts-in-india', priority: '0.80', changefreq: 'weekly' },
    { loc: BASE_URL + '/guides/handmade-gifts-in-india', priority: '0.80', changefreq: 'weekly' },
    { loc: BASE_URL + '/guides/how-to-choose-a-personalized-gift', priority: '0.80', changefreq: 'weekly' },
    { loc: BASE_URL + '/guides/anniversary-gift-guide', priority: '0.80', changefreq: 'weekly' },
    { loc: BASE_URL + '/guides/birthday-gift-guide', priority: '0.80', changefreq: 'weekly' },
    { loc: BASE_URL + '/about', priority: '0.70', changefreq: 'monthly' },
    { loc: BASE_URL + '/contact', priority: '0.70', changefreq: 'monthly' },
    { loc: BASE_URL + '/faq', priority: '0.70', changefreq: 'monthly' },
    { loc: BASE_URL + '/returns', priority: '0.60', changefreq: 'monthly' },
    { loc: BASE_URL + '/privacy', priority: '0.50', changefreq: 'monthly' },
    { loc: BASE_URL + '/terms-conditions', priority: '0.50', changefreq: 'monthly' }
  ];

  for (const s of staticUrls) {
    sitemapXml += '  <url>\n    <loc>' + escapeXml(s.loc) + '</loc>\n    <lastmod>' + nowIso + '</lastmod>\n    <changefreq>' + s.changefreq + '</changefreq>\n    <priority>' + s.priority + '</priority>\n  </url>\n';
  }

  for (const c of canonicalCatUrls) {
    sitemapXml += '  <url>\n    <loc>' + escapeXml(c.url) + '</loc>\n    <lastmod>' + nowIso + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.85</priority>\n  </url>\n';
  }

  for (const p of canonicalProductUrls) {
    const prod = p.product;
    const imgUrl = (prod.images && prod.images[0] && (prod.images[0].url || prod.images[0])) || prod.image_url || prod.primary_image;
    const absImgUrl = imgUrl ? (imgUrl.startsWith('http') ? imgUrl : (BASE_URL + imgUrl)) : null;

    sitemapXml += '  <url>\n    <loc>' + escapeXml(p.url) + '</loc>\n    <lastmod>' + nowIso + '</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.80</priority>\n';
    if (absImgUrl) {
      sitemapXml += '    <image:image>\n      <image:loc>' + escapeXml(absImgUrl) + '</image:loc>\n      <image:title>' + escapeXml(prod.name) + '</image:title>\n    </image:image>\n';
    }
    sitemapXml += '  </url>\n';
  }

  for (const s of canonicalSellerUrls) {
    sitemapXml += '  <url>\n    <loc>' + escapeXml(s.url) + '</loc>\n    <lastmod>' + nowIso + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.70</priority>\n  </url>\n';
  }

  sitemapXml += '</urlset>';

  fs.writeFileSync(path.resolve(distDir, 'sitemap.xml'), sitemapXml, 'utf8');
  fs.writeFileSync(path.resolve(__dirname, '../public/sitemap.xml'), sitemapXml, 'utf8');
  console.log('✅ Generated authoritative /sitemap.xml');

  // 7. Generate Google Merchant Center Product Feed
  const feedsDir = path.resolve(distDir, 'feeds');
  const publicFeedsDir = path.resolve(__dirname, '../public/feeds');
  if (!fs.existsSync(feedsDir)) fs.mkdirSync(feedsDir, { recursive: true });
  if (!fs.existsSync(publicFeedsDir)) fs.mkdirSync(publicFeedsDir, { recursive: true });

  let merchantXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  merchantXml += '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n';
  merchantXml += '  <channel>\n';
  merchantXml += '    <title>Tohfa Marketplace Product Feed</title>\n';
  merchantXml += '    <link>' + BASE_URL + '</link>\n';
  merchantXml += '    <description>Handcrafted, personalized and customized gifts from Indian creators.</description>\n';

  for (const p of products) {
    const slug = p.slug || p.id;
    const link = BASE_URL + '/products/' + slug;
    const price = parseFloat(p.price || p.base_price || 0).toFixed(2);
    const imgUrl = (p.images && p.images[0] && (p.images[0].url || p.images[0])) || p.image_url || p.primary_image || 'https://thetohfa.in/img/botanical-hero.png';
    const absImgUrl = imgUrl.startsWith('http') ? imgUrl : (BASE_URL + imgUrl);
    const availability = (p.stock_quantity > 0 || p.stock_count > 0 || p.stock_qty > 0) ? 'in_stock' : 'out_of_stock';
    const catName = p.category_name || (p.category && p.category.name) || 'Gifts';

    merchantXml += '    <item>\n';
    merchantXml += '      <g:id>' + escapeXml(p.id) + '</g:id>\n';
    merchantXml += '      <g:title>' + escapeXml(p.name) + '</g:title>\n';
    merchantXml += '      <g:description>' + escapeXml((p.description || p.name).substring(0, 5000)) + '</g:description>\n';
    merchantXml += '      <g:link>' + escapeXml(link) + '</g:link>\n';
    merchantXml += '      <g:image_link>' + escapeXml(absImgUrl) + '</g:image_link>\n';
    merchantXml += '      <g:condition>new</g:condition>\n';
    merchantXml += '      <g:availability>' + availability + '</g:availability>\n';
    merchantXml += '      <g:price>' + price + ' INR</g:price>\n';
    merchantXml += '      <g:brand>Tohfa</g:brand>\n';
    merchantXml += '      <g:product_type>' + escapeXml(catName) + '</g:product_type>\n';
    merchantXml += '    </item>\n';
  }

  merchantXml += '  </channel>\n</rss>';

  fs.writeFileSync(path.resolve(feedsDir, 'google-merchant.xml'), merchantXml, 'utf8');
  fs.writeFileSync(path.resolve(publicFeedsDir, 'google-merchant.xml'), merchantXml, 'utf8');
  console.log('✅ Generated Google Merchant Center product feed at /feeds/google-merchant.xml');

  console.log('🎉 [SEO Prerender] Successfully finished all tasks!');
}

main().catch(err => {
  console.error('❌ [SEO Prerender Error]:', err);
  process.exit(1);
});

