/**
 * Tohfa v2 — Catalog Search Logic
 * File: frontend/src/buyer/search.js
 */
'use strict';

import { api } from '../js/api.js';
import { initBuyerShell } from '../js/layout.js';
import { formatPrice, showSkeletons, PRODUCT_CARD_SKELETON, renderEmptyState } from '../js/utils.js';

initBuyerShell();

const searchInput = document.getElementById('searchInput');
const searchForm = document.getElementById('searchForm');
const categoryFilter = document.getElementById('categoryFilter');
const maxPriceFilter = document.getElementById('maxPriceFilter');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const resultsGrid = document.getElementById('searchResultsGrid');
const searchTitle = document.getElementById('searchTitle');
const resultsCount = document.getElementById('resultsCount');

// Parse initial URL query params
const params = new URLSearchParams(window.location.search);
const queryParam = params.get('q') || params.get('search') || params.get('query') || '';
const initialCategory = params.get('category_id') || params.get('category') || '';
const initialCategoryName = params.get('name') || '';

if (queryParam && searchInput) searchInput.value = queryParam;

async function init() {
  await loadCategories();
  if (initialCategory && categoryFilter) categoryFilter.value = initialCategory;
  executeSearch();
}

async function loadCategories() {
  try {
    const res = await api.get('/api/products/categories');
    const categories = Array.isArray(res?.data?.categories) ? res.data.categories : (Array.isArray(res?.data) ? res.data : []);
    categoryFilter.innerHTML = `<option value="">All Categories</option>` +
      categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  } catch { /* empty */ }
}

async function executeSearch() {
  showSkeletons(resultsGrid, PRODUCT_CARD_SKELETON, 6);

  const q = searchInput.value.trim();
  const catId = categoryFilter.value;
  const maxPrice = maxPriceFilter.value;

  searchTitle.textContent = q ? `Results for "${q}"` : (initialCategoryName ? `Category: ${initialCategoryName}` : 'All Artisan Gifts');

  try {
    let url = `/api/products?limit=24`;
    if (q) url += `&search=${encodeURIComponent(q)}`;
    if (catId) url += `&category_id=${catId}`;
    if (maxPrice) url += `&max_price=${maxPrice}`;

    const res = await api.get(url);
    const products = res?.data?.products || (Array.isArray(res?.data) ? res.data : []);

    resultsCount.textContent = `${products.length} artisan items found`;

    if (!products.length) {
      const queryDesc = q ? ` matching "${q}"` : '';
      renderEmptyState({
        containerId: resultsGrid,
        icon: '🔍',
        title: `No handcrafted treasures found${queryDesc}`,
        description: 'Try adjusting your keywords, exploring different artisan categories, or ask our AI gift concierge for recommendations.',
        actionText: 'Browse All Categories',
        actionHref: './categories.html',
        theme: 'amber'
      });
      return;
    }

    resultsGrid.innerHTML = products.map(p => {
      const imgUrl = (Array.isArray(p.images) && p.images.length && p.images[0]?.url)
        ? p.images[0].url
        : (p.primary_image || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&q=80');
      return `
        <div class="product-card animate-slide-up" onclick="window.location.href='./product.html?id=${p.id}'">
          <div class="product-card__image-wrap">
            <img src="${imgUrl}" class="product-card__image" alt="${p.name}" loading="lazy">
          </div>
          <div class="product-card__body">
            <h3 class="product-card__name">${p.name}</h3>
            <div class="product-card__seller">by ${p.store_name || 'Artisan Maker'}</div>
            <div class="product-card__footer">
              <span class="text-price">${formatPrice(p.base_price)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    resultsGrid.innerHTML = `<p class="text-body" style="grid-column:1/-1;">Error: ${err.message}</p>`;
  }
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  executeSearch();
});

applyFiltersBtn.addEventListener('click', executeSearch);

init();
