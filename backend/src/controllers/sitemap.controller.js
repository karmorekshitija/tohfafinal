/**
 * Tohfa v2 — Dynamic XML Sitemap Controller
 * File: backend/src/controllers/sitemap.controller.js
 * Role: Generates dynamic, real-time XML Sitemaps conforming to standard sitemap protocol.
 *       Includes core static pages, active categories, published products, and verified seller studios.
 */
'use strict';

const { query } = require('../config/db');

const BASE_URL = process.env.SITE_URL || 'https://thetohfa.in';

function formatIsoDate(dateVal) {
  try {
    if (!dateVal) return new Date().toISOString().split('T')[0];
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
  } catch (_) {
    return new Date().toISOString().split('T')[0];
  }
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

async function generateSitemap(req, res) {
  try {
    const nowIso = new Date().toISOString().split('T')[0];

    // 1. Static Core Pages & High-Intent Landing Pages
    const staticUrls = [
      { loc: `${BASE_URL}/`, lastmod: nowIso, changefreq: 'daily', priority: '1.0' },
      { loc: `${BASE_URL}/customized-gifts`, lastmod: nowIso, changefreq: 'daily', priority: '0.95' },
      { loc: `${BASE_URL}/personalized-gifts`, lastmod: nowIso, changefreq: 'daily', priority: '0.95' },
      { loc: `${BASE_URL}/handmade-gifts`, lastmod: nowIso, changefreq: 'daily', priority: '0.95' },
      { loc: `${BASE_URL}/gifts-in-india`, lastmod: nowIso, changefreq: 'daily', priority: '0.95' },
      { loc: `${BASE_URL}/categories`, lastmod: nowIso, changefreq: 'weekly', priority: '0.90' },
      { loc: `${BASE_URL}/bulk`, lastmod: nowIso, changefreq: 'weekly', priority: '0.85' },
      { loc: `${BASE_URL}/guides`, lastmod: nowIso, changefreq: 'weekly', priority: '0.85' },
      { loc: `${BASE_URL}/guides/best-customized-gifts-in-india`, lastmod: nowIso, changefreq: 'weekly', priority: '0.80' },
      { loc: `${BASE_URL}/guides/handmade-gifts-in-india`, lastmod: nowIso, changefreq: 'weekly', priority: '0.80' },
      { loc: `${BASE_URL}/guides/how-to-choose-a-personalized-gift`, lastmod: nowIso, changefreq: 'weekly', priority: '0.80' },
      { loc: `${BASE_URL}/guides/anniversary-gift-guide`, lastmod: nowIso, changefreq: 'weekly', priority: '0.80' },
      { loc: `${BASE_URL}/guides/birthday-gift-guide`, lastmod: nowIso, changefreq: 'weekly', priority: '0.80' },
      { loc: `${BASE_URL}/about`, lastmod: nowIso, changefreq: 'monthly', priority: '0.70' },
      { loc: `${BASE_URL}/contact`, lastmod: nowIso, changefreq: 'monthly', priority: '0.70' },
      { loc: `${BASE_URL}/faq`, lastmod: nowIso, changefreq: 'monthly', priority: '0.70' },
      { loc: `${BASE_URL}/returns`, lastmod: nowIso, changefreq: 'monthly', priority: '0.60' },
      { loc: `${BASE_URL}/privacy`, lastmod: nowIso, changefreq: 'monthly', priority: '0.50' },
      { loc: `${BASE_URL}/terms-conditions`, lastmod: nowIso, changefreq: 'monthly', priority: '0.50' },
    ];

    // 2. Fetch Active Categories, Products, and Sellers in Parallel
    const [catResult, prodResult, sellerResult] = await Promise.allSettled([
      query(
        `SELECT slug, COALESCE(updated_at, created_at, NOW()) AS last_modified 
         FROM categories 
         WHERE is_active IS NOT FALSE AND slug IS NOT NULL AND slug != '' 
         ORDER BY id ASC`
      ),
      query(
        `SELECT id, slug, COALESCE(updated_at, created_at, NOW()) AS last_modified 
         FROM products 
         WHERE (status = 'active' OR is_active IS NOT FALSE)
         ORDER BY updated_at DESC NULLS LAST, id DESC 
         LIMIT 5000`
      ),
      query(
        `SELECT u.id, COALESCE(sp.slug, s.slug, sp.store_slug) AS slug, COALESCE(sp.updated_at, u.created_at, NOW()) AS last_modified 
         FROM users u
         LEFT JOIN seller_profiles sp ON sp.user_id = u.id
         LEFT JOIN sellers s ON s.user_id = u.id
         WHERE (u.role IN ('seller', 'maker') OR sp.id IS NOT NULL OR s.id IS NOT NULL)
         LIMIT 1000`
      )
    ]);

    const categories = catResult.status === 'fulfilled' ? (catResult.value.rows || []) : [];
    const products = prodResult.status === 'fulfilled' ? (prodResult.value.rows || []) : [];
    const sellers = sellerResult.status === 'fulfilled' ? (sellerResult.value.rows || []) : [];

    // Assemble XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Add static URLs
    for (const url of staticUrls) {
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(url.loc)}</loc>\n`;
      xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
      xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
      xml += `    <priority>${url.priority}</priority>\n`;
      xml += `  </url>\n`;
    }

    // Add category URLs
    for (const cat of categories) {
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${BASE_URL}/category/${cat.slug}`)}</loc>\n`;
      xml += `    <lastmod>${formatIsoDate(cat.last_modified)}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.85</priority>\n`;
      xml += `  </url>\n`;
    }

    // Add product URLs
    for (const p of products) {
      const prodSlug = p.slug || p.id;
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${BASE_URL}/products/${prodSlug}`)}</loc>\n`;
      xml += `    <lastmod>${formatIsoDate(p.last_modified)}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.80</priority>\n`;
      xml += `  </url>\n`;
    }

    // Add seller profile URLs
    for (const s of sellers) {
      const sellerSlug = s.slug || s.id;
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${BASE_URL}/seller/${sellerSlug}`)}</loc>\n`;
      xml += `    <lastmod>${formatIsoDate(s.last_modified)}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.70</priority>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;

    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.header('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return res.status(200).send(xml);
  } catch (err) {
    console.error('[Sitemap Error]:', err);
    res.status(500).header('Content-Type', 'text/plain').send('Error generating sitemap');
  }
}

module.exports = { generateSitemap };
