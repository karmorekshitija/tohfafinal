/**
 * Tohfa v2 — Category Page Logic
 * File: frontend/src/buyer/category.js
 * Role: Category query parameter parsing, category link routing, and view controller.
 */
'use strict';

import apiClient from '../utils/apiClient.js';
import Toast from '../components/Toast.js';
import { logout } from '../utils/auth.js';
import { initSearchOverlay } from './searchOverlay.js';
import { categoryUrl, ALL_CATEGORIES_URL } from '../utils/categoryLinks.js';

// Parameter resolution: check slug then category parameter, parse sub
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const slug = urlParams.get('slug') || urlParams.get('category');
const sub = urlParams.get('sub');

let activeSlug = slug ? slug.trim().toLowerCase() : '';
let subParam = (sub || urlParams.get('subcategory') || urlParams.get('subcategory_ids') || urlParams.get('subcategory_id') || '').trim().toLowerCase();

// Pathname fallback if direct path /category/:slug is accessed
if (!activeSlug && typeof window !== 'undefined' && window.location.pathname) {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const catIdx = pathParts.indexOf('category');
  if (catIdx !== -1 && pathParts[catIdx + 1]) {
    activeSlug = pathParts[catIdx + 1].replace(/\.html$/, '').trim().toLowerCase();
  }
}

/**
 * Safely parse category URL parameters without defaulting to 'couples'
 * @param {string} [search] 
 * @param {string} [pathname] 
 * @returns {{ slug: string|null, sub: string|null, urlParams: URLSearchParams }}
 */
export function parseCategoryParams(search = typeof window !== 'undefined' ? window.location.search : '', pathname = typeof window !== 'undefined' ? window.location.pathname : '') {
  const params = new URLSearchParams(search);
  const rawSlug = params.get('slug') || params.get('category');
  const rawSub = params.get('sub') || params.get('subcategory') || params.get('subcategory_ids') || params.get('subcategory_id');

  let parsedSlug = rawSlug ? rawSlug.trim().toLowerCase() : '';
  const parsedSub = rawSub ? rawSub.trim().toLowerCase() : null;

  if (!parsedSlug && pathname) {
    const parts = pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('category');
    if (idx !== -1 && parts[idx + 1]) {
      parsedSlug = parts[idx + 1].replace(/\.html$/, '').trim().toLowerCase();
    }
  }

  return {
    slug: parsedSlug || null,
    sub: parsedSub,
    urlParams: params
  };
}

/**
 * Handle initial category resolution:
 * Never default unconditionally to 'couples'.
 * If no slug is present, gracefully pick the first active category from the fetched categories list or display category overview.
 */
export async function resolveOrOverview() {
  if (activeSlug) return activeSlug;

  try {
    const res = await apiClient.get('/products/categories');
    const categories = res.data?.data?.categories || [];
    if (categories.length > 0 && categories[0].slug) {
      activeSlug = categories[0].slug;
      return activeSlug;
    }
  } catch (err) {
    console.warn('[category.js] Could not load categories for fallback:', err);
  }

  if (typeof window !== 'undefined') {
    window.location.replace(ALL_CATEGORIES_URL);
  }
  return null;
}

/**
 * Resolves the cover image for a category.
 * Precedence: category.image_url > category.banner_url > category.banner_image_url > fallback static asset.
 * A static asset path NEVER overrides a valid category.image_url returned from the API.
 * @param {Object} category
 * @returns {string}
 */
export function getCategoryCoverImage(category) {
  if (!category) return '/img/categories/artisan_showcase.jpg';
  const slug = category.slug || 'collection';
  return category.image_url || category.banner_url || category.banner_image_url || `/img/categories/${slug}.jpg`;
}

export { activeSlug, subParam, urlParams };

