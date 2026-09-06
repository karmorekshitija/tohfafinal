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

    // 1. Static Core Pages
    const staticUrls = [
      { loc: `${BASE_URL}/buyer/home`, lastmod: nowIso, changefreq: 'daily', priority: '1.0' },
      { loc: `${BASE_URL}/buyer/categories`, lastmod: nowIso, changefreq: 'weekly', priority: '0.9' },
      { loc: `${BASE_URL}/buyer/bulk`, lastmod: nowIso, changefreq: 'weekly', priority: '0.8' },
      { loc: `${BASE_URL}/buyer/about`, lastmod: nowIso, changefreq: 'monthly', priority: '0.7' },
      { loc: `${BASE_URL}/buyer/contact`, lastmod: nowIso, changefreq: 'monthly', priority: '0.7' },
      { loc: `${BASE_URL}/buyer/faq`, lastmod: nowIso, changefreq: 'monthly', priority: '0.7' },
      { loc: `${BASE_URL}/buyer/returns`, lastmod: nowIso, changefreq: 'monthly', priority: '0.6' },
      { loc: `${BASE_URL}/buyer/privacy`, lastmod: nowIso, changefreq: 'monthly', priority: '0.6' },
      { loc: `${BASE_URL}/buyer/terms-conditions`, lastmod: nowIso, changefreq: 'monthly', priority: '0.6' },
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
        `SELECT u.id, sp.slug, COALESCE(sp.updated_at, u.created_at, NOW()) AS last_modified 
         FROM users u
         LEFT JOIN seller_profiles sp ON sp.user_id = u.id
         WHERE (u.role IN ('seller', 'maker') OR sp.id IS NOT NULL)
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
      xml += `    <loc>${escapeXml(`${BASE_URL}/buyer/category?slug=${cat.slug}`)}</loc>\n`;
      xml += `    <lastmod>${formatIsoDate(cat.last_modified)}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.85</priority>\n`;
      xml += `  </url>\n`;
    }

    // Add product URLs
    for (const p of products) {
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${BASE_URL}/buyer/product?id=${p.id}`)}</loc>\n`;
      xml += `    <lastmod>${formatIsoDate(p.last_modified)}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.80</priority>\n`;
      xml += `  </url>\n`;
    }

    // Add seller profile URLs
    for (const s of sellers) {
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${BASE_URL}/buyer/seller-profile?id=${s.id}`)}</loc>\n`;
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
