/**
 * Tohfa v2 — Buyer Homepage Logic
 * File: frontend/src/buyer/home.js
 */
'use strict';

import { api } from '../js/api.js';
import { initBuyerShell, openOurStoryModal } from '../js/layout.js';
import { formatPrice, showToast, showSkeletons, PRODUCT_CARD_SKELETON } from '../js/utils.js';
import { isLoggedIn } from '../js/auth.js';

// Init nav, tabs, tanya bubble, footer
initBuyerShell({ activeTab: 'home' });

const forYouGrid = document.getElementById('forYouGrid');
const newArrivalsGrid = document.getElementById('newArrivalsGrid');
const bestSellersGrid = document.getElementById('bestSellersGrid');
const categoryTabs = document.getElementById('categoryTabs');
const categoryStripsContainer = document.getElementById('categoryStripsContainer');
const openStoryHeroBtn = document.getElementById('openStoryHeroBtn');

if (openStoryHeroBtn) {
  openStoryHeroBtn.addEventListener('click', openOurStoryModal);
}

// Initial skeleton load
if (forYouGrid) showSkeletons(forYouGrid, PRODUCT_CARD_SKELETON, 8);
if (newArrivalsGrid) showSkeletons(newArrivalsGrid, PRODUCT_CARD_SKELETON, 4);
if (bestSellersGrid) showSkeletons(bestSellersGrid, PRODUCT_CARD_SKELETON, 4);

async function loadHomepageData() {
  try {
    // 1. Fetch Categories
    const catRes = await api.get('/api/products/categories');
    const categories = Array.isArray(catRes?.data?.categories) ? catRes.data.categories : (Array.isArray(catRes?.data) ? catRes.data : []);
    renderCategoryTabs(categories);

    // 2. Fetch Hero Banners
    loadBanners();

    // 3. Fetch For You Feed
    const forYouRes = await api.get('/api/products/for-you');
    const products = Array.isArray(forYouRes?.data?.products) ? forYouRes.data.products : (Array.isArray(forYouRes?.data) ? forYouRes.data : []);
    if (forYouGrid) renderProducts(forYouGrid, products.slice(0, 8));

    // 4. Fetch New Arrivals
    try {
      const newRes = await api.get('/api/products?limit=4');
      const newProds = Array.isArray(newRes?.data?.products) ? newRes.data.products : (Array.isArray(newRes?.data) ? newRes.data : []);
      if (newArrivalsGrid) renderProducts(newArrivalsGrid, newProds.slice(0, 4));
    } catch { /* empty */ }

    // 5. Fetch Best Sellers
    try {
      const bestRes = await api.get('/api/products?limit=4');
      const bestProds = Array.isArray(bestRes?.data?.products) ? bestRes.data.products : (Array.isArray(bestRes?.data) ? bestRes.data : []);
      if (bestSellersGrid) renderProducts(bestSellersGrid, bestProds.slice(0, 4));
    } catch { /* empty */ }

    // 6. Render Category-specific strips
    renderCategoryStrips(categories.slice(0, 4));
  } catch (err) {
    console.error('Homepage load error:', err);
    if (forYouGrid) {
      forYouGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state__icon">🎁</div>
          <h3 class="empty-state__title">Curating gifts for you</h3>
          <p class="empty-state__body">Explore our categories or search for specific handmade treasures.</p>
        </div>
      `;
    }
  }
}

async function loadBanners() {
  try {
    const res = await api.get('/api/admin/banners');
    const banners = res?.data || [];
    if (!banners.length) return;

    const slider = document.getElementById('heroSlider');
    if (!slider) return;
    slider.innerHTML = banners.map((b, index) => `
      <div class="hero__slide ${index === 0 ? 'active' : ''}" style="background-image: url('${b.image_url}');">
        <div class="hero-visual-card__overlay"></div>
      </div>
    `).join('') + `
      <div class="hero__dots" id="heroDots">
        ${banners.map((_, i) => `<div class="hero__dot ${i === 0 ? 'active' : ''}" data-slide="${i}"></div>`).join('')}
      </div>
    `;

    // Auto-rotate
    let current = 0;
    const slides = slider.querySelectorAll('.hero__slide');
    const dots = slider.querySelectorAll('.hero__dot');
    if (slides.length > 1) {
      setInterval(() => {
        slides[current]?.classList.remove('active');
        dots[current]?.classList.remove('active');
        current = (current + 1) % slides.length;
        slides[current]?.classList.add('active');
        dots[current]?.classList.add('active');
      }, 5000);
    }
  } catch { /* empty */ }
}

function renderCategoryTabs(categories) {
  if (!categoryTabs || !categories.length) return;

  categoryTabs.innerHTML = `
    <a href="./search.html" class="filter-pill active">All Gifts</a>
    ${categories.map(cat => `
      <a href="./search.html?category_id=${cat.id}&name=${encodeURIComponent(cat.name)}" class="filter-pill">
        ${cat.name}
      </a>
    `).join('')}
  `;
}

function renderProducts(container, products) {
  if (!products.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p class="text-body">New artisan products are currently being curated.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = products.map(p => {
    const imgUrl = (Array.isArray(p.images) && p.images.length && p.images[0]?.url)
      ? p.images[0].url
      : (p.primary_image || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&q=80');

    const customBadge = p.customization_mode === 'fixed'
      ? `<span class="badge" style="position:absolute; bottom:8px; left:8px; background:var(--color-pale-sage); color:var(--color-primary); font-size:10px; font-weight:600;">Customizable</span>`
      : (p.customization_mode === 'open' ? `<span class="badge" style="position:absolute; bottom:8px; left:8px; background:var(--color-primary); color:var(--color-background); font-size:10px; font-weight:600;">Bespoke</span>` : '');

    return `
      <div class="product-card" onclick="window.location.href='./product.html?id=${p.id}'">
        <div class="product-card__image-wrap">
          <img src="${imgUrl}" class="product-card__image" alt="${p.name}" loading="lazy">
          <button class="product-card__wishlist-btn" onclick="event.stopPropagation(); toggleWishlist('${p.id}', this)" title="Save to Wishlist">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          </button>
          ${customBadge}
        </div>
        <div class="product-card__body" style="padding: var(--space-4);">
          <h3 class="product-card__name" style="font-size: var(--text-base); margin-bottom: 2px;">${p.name}</h3>
          <div class="product-card__seller" style="font-size: var(--text-xs); color: var(--color-moss); margin-bottom: var(--space-3);">by ${p.store_name || 'Artisan Seller'}</div>
          <div class="product-card__footer" style="display: flex; align-items: center; justify-content: space-between;">
            <span class="text-price" style="font-size: var(--text-xl); font-weight: var(--weight-bold);">${formatPrice(p.base_price)}</span>
            <button class="product-card__quick-add-btn" title="Add to Cart" onclick="event.stopPropagation(); quickAddToCart('${p.id}', this)">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function renderCategoryStrips(categories) {
  if (!categories.length) return;

  const html = [];
  for (const cat of categories) {
    try {
      const res = await api.get(`/api/products?category_id=${cat.id}&limit=6`);
      const list = res?.data?.products || [];
      if (!list.length) continue;

      html.push(`
        <section class="section" style="padding-top: var(--space-4);">
          <div class="section-header">
            <h2 class="section-header__title">${cat.name}</h2>
            <a href="./search.html?category_id=${cat.id}&name=${encodeURIComponent(cat.name)}" class="section-header__link">Explore All →</a>
          </div>
          <div class="scroll-strip">
          ${list.map(p => {
            const imgUrl = (Array.isArray(p.images) && p.images.length && p.images[0]?.url)
              ? p.images[0].url
              : (p.primary_image || 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=500&q=80');
            return `
              <div class="product-card" style="width: 220px;" onclick="window.location.href='./product.html?id=${p.id}'">
                <div class="product-card__image-wrap">
                  <img src="${imgUrl}" class="product-card__image" alt="${p.name}" loading="lazy">
                </div>
                <div class="product-card__body">
                  <h3 class="product-card__name">${p.name}</h3>
                  <div class="product-card__seller">by ${p.store_name || 'Artisan'}</div>
                  <div class="product-card__footer">
                    <span class="text-price-sm">${formatPrice(p.base_price)}</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
          </div>
        </section>
      `);
    } catch { /* empty */ }
  }

  categoryStripsContainer.innerHTML = html.join('');
}

// Global window actions
window.toggleWishlist = async (productId, btn) => {
  if (!isLoggedIn()) {
    showToast('Please sign in to save items to your wishlist', 'info');
    return;
  }
  try {
    await api.post('/api/wishlist', { product_id: productId });
    showToast('Saved to wishlist! ❤️', 'success');
    btn.style.color = 'var(--color-error)';
  } catch (err) {
    showToast(err.message || 'Wishlist update failed.', 'error');
  }
};

window.quickAddToCart = async (productId, btn) => {
  if (!isLoggedIn()) {
    window.location.href = '/auth/login.html';
    return;
  }
  try {
    btn.disabled = true;
    await api.post('/api/cart', { product_id: productId, quantity: 1 });
    showToast('Added to cart! 🛍️', 'success');
    // Update badge
    const badge = document.getElementById('navCartCount');
    if (badge) {
      const current = parseInt(badge.textContent || '0', 10);
      badge.textContent = current + 1;
      badge.style.display = 'flex';
    }
  } catch (err) {
    showToast(err.message || 'Could not add to cart.', 'error');
  } finally {
    btn.disabled = false;
  }
};

loadHomepageData();
