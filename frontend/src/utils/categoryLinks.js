/**
 * Tohfa v2 — Unified Category Link Helper
 * File: frontend/src/utils/categoryLinks.js
 */

export const ALL_CATEGORIES_URL = '/buyer/categories.html';

export function categoryUrl(cat, subSlugOrId) {
  const slug = cat && typeof cat.slug === 'string' ? cat.slug.trim() : '';
  if (!slug) {
    console.error('[categoryUrl] category without slug', cat);
    return ALL_CATEGORIES_URL;
  }
  const u = `/buyer/category.html?slug=${encodeURIComponent(slug)}`;
  return subSlugOrId ? `${u}&sub=${encodeURIComponent(subSlugOrId)}` : u;
}
