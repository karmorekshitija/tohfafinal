'use strict';

/**
 * Tohfa v2 — Canonical Slug Utility
 * File: backend/src/utils/slug.js
 */

const RESERVED_SLUGS = new Set([
  'best-sellers',
  'bestsellers',
  'all',
  'new',
  'sale',
  'undefined',
  'null',
  'categories',
  'category',
  'search',
  'products',
  'product',
  'cart',
  'checkout',
  'orders',
  'order'
]);

function slugify(input) {
  if (!input || typeof input !== 'string') return '';
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug;
}

function isReservedSlug(slug) {
  if (!slug) return true;
  return RESERVED_SLUGS.has(slug.toLowerCase().trim());
}

module.exports = {
  slugify,
  isReservedSlug,
  RESERVED_SLUGS
};
