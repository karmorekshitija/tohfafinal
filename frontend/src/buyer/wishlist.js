/**
 * Tohfa v2 — Buyer Wishlist Logic
 * File: frontend/src/buyer/wishlist.js
 */
'use strict';

import { api } from '../js/api.js';
import { initBuyerShell } from '../js/layout.js';
import { requireAuth } from '../js/auth.js';
import { formatPrice, showToast, renderEmptyState } from '../js/utils.js';

if (requireAuth()) {
  initBuyerShell();
}

const grid = document.getElementById('wishlistGrid') || document.getElementById('makes-grid');
const emptyState = document.getElementById('emptyState') || document.getElementById('empty-state');
const loadingEl = document.getElementById('wishlistLoading') || document.getElementById('wishlist-loading');
const countBadge = document.getElementById('saved-makes-count');

export async function loadWishlist() {
  try {
    const res = await api.get('/api/wishlist');
    const data = res?.data !== undefined ? res.data : res;
    const rawItems = data?.wishlist || data?.items || data;
    const items = Array.isArray(rawItems) ? rawItems : [];

    if (loadingEl) loadingEl.style.display = 'none';
    if (countBadge) countBadge.innerText = `(${items.length} saved)`;

    if (!items.length) {
      if (emptyState) {
        emptyState.style.display = 'flex';
        emptyState.classList.remove('hidden');
      }
      if (grid) {
        grid.innerHTML = '';
        renderEmptyState({
          containerId: grid,
          icon: '❤️',
          title: 'Your Wishlist is Empty',
          description: 'Explore authentic handcrafted gifts from master artisans across India and save your favorites here.',
          actionText: 'Browse Categories',
          actionHref: '/buyer/categories.html',
          theme: 'amber'
        });
      }
      return;
    }

    if (emptyState) {
      emptyState.style.display = 'none';
      emptyState.classList.add('hidden');
    }

    if (grid) {
      grid.innerHTML = items.map(item => `
        <div class="product-card" id="wishlist-item-${item.id || item.product_id}">
          <img src="${item.product_image || item.image_url || 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?w=500&auto=format&fit=crop&q=60'}" alt="${item.product_name || item.name}" class="product-card__image" loading="lazy">
          <div class="product-card__body">
            <h4 class="product-card__title">${item.product_name || item.name}</h4>
            <div class="product-card__price">${formatPrice((item.price_paise !== undefined ? item.price_paise / 100 : (item.price || item.unit_price || item.base_price || 0)))}</div>
            <div class="flex gap-2" style="margin-top:var(--space-3);">
              <a href="./product.html?id=${item.product_id || item.id}" class="btn btn-sm btn-primary">View Make</a>
              <button onclick="removeWishlistItem('${item.product_id || item.id}')" class="btn btn-sm btn-secondary" style="color:var(--color-error); border-color:var(--color-error);">Remove</button>
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load wishlist:', err);
    if (loadingEl) loadingEl.style.display = 'none';
    if (emptyState) {
      emptyState.style.display = 'flex';
      emptyState.classList.remove('hidden');
    }
    if (grid) {
      renderEmptyState({
        containerId: grid,
        icon: '❤️',
        title: 'Your Wishlist is Empty',
        description: 'Explore authentic handcrafted gifts from master artisans across India and save your favorites here.',
        actionText: 'Browse Categories',
        actionHref: '/buyer/categories.html',
        theme: 'amber'
      });
    }
  }
}

window.removeWishlistItem = async (id) => {
  try {
    await api.delete(`/api/wishlist/${id}`);
    showToast('Removed from wishlist', 'info');
    await loadWishlist();
  } catch (err) {
    showToast(err.message || 'Failed to remove item', 'error');
  }
};

document.addEventListener('DOMContentLoaded', loadWishlist);
