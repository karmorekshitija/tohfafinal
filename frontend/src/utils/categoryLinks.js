/**
 * Tohfa v2 — Unified Category Link Helper
 * File: frontend/src/utils/categoryLinks.js
 */

export const ALL_CATEGORIES_URL = '/buyer/categories.html';

// Independent top-level collection slugs that must NEVER be routed as subcategories
const INDEPENDENT_TOP_LEVEL_SLUGS = new Set([
  'anniversary-gifts',
  'candles',
  'candles-aromatherapy',
  'candles-fragrance',
  'customized-gifts',
  'flowers',
  'floral-bouquets',
  'floral-botanicals',
  'hampers',
  'home-decor',
  'ceramics',
  'ceramics-pottery',
  'woodcraft',
  'jewellery',
  'jewellery-wearables',
  'skincare',
  'art-prints',
  'couples',
  'paintings',
  'textile-arts',
  'hair-accessories',
  'gifts-keepsakes',
  'handcrafted-figurines',
  'frames'
]);

/**
 * Builds canonical category URL.
 * Top-level category cards link directly to /buyer/category.html?slug=${category.slug}.
 * Subcategories should only link to ?slug=${parent_slug}&sub=${sub_slug} when a genuine top-level parent exists.
 *
 * @param {Object|string} cat - Category object or slug string
 * @param {string} [subSlugOrId] - Optional subcategory slug or ID
 * @returns {string} URL to category page
 */
export function categoryUrl(cat, subSlugOrId) {
  let slug = '';
  let parentSlug = null;

  if (typeof cat === 'string') {
    slug = cat.trim();
  } else if (cat && typeof cat === 'object') {
    slug = typeof cat.slug === 'string' ? cat.slug.trim() : '';
    if (typeof cat.parent_slug === 'string' && cat.parent_slug.trim()) {
      parentSlug = cat.parent_slug.trim();
    }
  }

  if (!slug) {
    console.error('[categoryUrl] category without slug', cat);
    return ALL_CATEGORIES_URL;
  }

  // If subSlugOrId is explicitly provided, cat is the top-level parent and subSlugOrId is the subcategory
  if (subSlugOrId) {
    const sub = typeof subSlugOrId === 'string' ? subSlugOrId.trim() : String(subSlugOrId);
    return `/buyer/category.html?slug=${encodeURIComponent(slug)}&sub=${encodeURIComponent(sub)}`;
  }

  // Top-level category cards link directly to /buyer/category.html?slug=${category.slug}
  if (INDEPENDENT_TOP_LEVEL_SLUGS.has(slug) || !parentSlug || parentSlug === slug) {
    return `/buyer/category.html?slug=${encodeURIComponent(slug)}`;
  }

  // Subcategories should only link to ?slug=${parent_slug}&sub=${sub_slug} when a genuine top-level parent exists
  return `/buyer/category.html?slug=${encodeURIComponent(parentSlug)}&sub=${encodeURIComponent(slug)}`;
}
