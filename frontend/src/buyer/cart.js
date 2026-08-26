/**
 * Tohfa v2 — Buyer Cart Logic
 * File: frontend/src/buyer/cart.js
 * Master Reference: TOHFA_COMBINED_CODEBASE_AND_AUTH_AUDIT_MASTER.md (Section 2.1 & 5.2)
 */
'use strict';

import { api } from '../js/api.js';
import { initBuyerShell } from '../js/layout.js';
import { requireAuth } from '../js/auth.js';
import { formatPrice, showToast, renderEmptyState } from '../js/utils.js';

if (requireAuth()) {
  initBuyerShell();
}

const itemsContainer = document.getElementById('cartItemsContainer') || document.getElementById('cart-items-container');
const emptyState = document.getElementById('emptyState') || document.getElementById('empty-state');
const subtotalEl = document.getElementById('cartSubtotal') || document.getElementById('summary-subtotal');
const shippingEl = document.getElementById('cartShipping') || document.getElementById('summary-shipping');
const totalEl = document.getElementById('cartTotal') || document.getElementById('summary-total');
const checkoutBtn = document.getElementById('btn-place-order') || document.getElementById('checkoutBtn');

export async function mergeGuestCart() {
  const guestCartRaw = sessionStorage.getItem('tohfa_guest_cart') || localStorage.getItem('tohfa_guest_cart');
  if (!guestCartRaw) return;
  try {
    const guestItems = JSON.parse(guestCartRaw);
    if (Array.isArray(guestItems) && guestItems.length > 0) {
      // Call POST /api/cart/merge endpoint
      try {
        await api.post('/api/cart/merge', { items: guestItems });
      } catch (err) {
        // Fallback: merge individual items if bulk endpoint is unavailable
        for (const item of guestItems) {
          try {
            await api.post('/api/cart/items', {
              product_id: Number(item.product_id || item.productId),
              variant_id: item.variant_id || item.variantId || null,
              quantity: Number(item.quantity) || 1,
              customization_data: item.customization_data || item.customizationData || null
            });
          } catch (e) {
            console.error('Failed to merge guest cart item:', e);
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to parse guest cart:', e);
  } finally {
    sessionStorage.removeItem('tohfa_guest_cart');
    localStorage.removeItem('tohfa_guest_cart');
  }
}

export async function loadCart() {
  await mergeGuestCart();

  try {
    const res = await api.get('/api/cart');
    const data = res?.data !== undefined ? res.data : res;
    const rawItems = data?.items || (Array.isArray(data) ? data : []);
    const items = Array.isArray(rawItems) ? rawItems : [];

    if (!items.length) {
      if (emptyState) emptyState.style.display = 'flex';
      if (itemsContainer) {
        itemsContainer.innerHTML = '';
        renderEmptyState({
          containerId: itemsContainer,
          icon: '🛍️',
          title: 'Your Basket is Empty',
          description: 'Looks like you have not added any handcrafted treasures to your basket yet.',
          actionText: 'Explore Marketplace',
          actionHref: '/buyer/home.html',
          theme: 'amber'
        });
      }
      if (subtotalEl) subtotalEl.textContent = formatPrice(0);
      if (shippingEl) shippingEl.textContent = formatPrice(0);
      if (totalEl) totalEl.textContent = formatPrice(0);
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (checkoutBtn) checkoutBtn.disabled = false;

    // Safe reduce calculation for subtotal guarded against empty items
    const subtotal = (Array.isArray(items) ? items : []).reduce((sum, item) => {
      if (!item) return sum;
      const price = Number(item.price_paise !== undefined ? item.price_paise / 100 : (item.price || item.unit_price || 0));
      const qty = Number(item.quantity || 1);
      return sum + (price * qty);
    }, 0);

    const shipping = 79;
    const grandTotal = subtotal + shipping;

    if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
    if (shippingEl) shippingEl.textContent = formatPrice(shipping);
    if (totalEl) totalEl.textContent = formatPrice(grandTotal);

    if (itemsContainer) {
      itemsContainer.innerHTML = items.map(item => `
        <div class="cart-item" id="cart-item-${item.id}">
          <img src="${item.image_url || item.primary_image || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=200&q=80'}" class="cart-item__img" alt="${item.product_name || item.name}" loading="lazy">
          <div class="cart-item__info">
            <h4 class="cart-item__title">${item.product_name || item.name}</h4>
            <div class="cart-item__seller">by ${item.seller_name || 'Artisan'}</div>
            <div class="cart-item__price">${formatPrice(item.price_paise !== undefined ? item.price_paise / 100 : (item.price || item.unit_price || 0))}</div>
          </div>
          <div class="cart-item__qty">Qty: ${item.quantity || 1}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load cart:', err);
    if (emptyState) emptyState.style.display = 'flex';
    if (checkoutBtn) checkoutBtn.disabled = true;
  }
}

document.addEventListener('DOMContentLoaded', loadCart);
