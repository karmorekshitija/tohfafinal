/**
 * Tohfa v2 — ZipGift Coming Soon Page
 * File: frontend/src/buyer/zip-gift.js
 */
'use strict';

import { getUser, isLoggedIn } from '../js/auth.js';
import { api } from '../js/api.js';

document.addEventListener('DOMContentLoaded', () => {
  setupNavbar();

  async function setupNavbar() {
    const authContainer = document.getElementById('auth-buttons-container');
    const user = getUser();
    const loggedIn = isLoggedIn();

    if (authContainer) {
      if (loggedIn && user) {
        const avatarUrl = user.avatar_url || user.profile_photo_url || '/img/default-avatar.png';
        authContainer.innerHTML = `
          <a href="/buyer/profile.html" class="w-10 h-10 rounded-full border border-[rgba(20,56,31,0.2)] overflow-hidden flex-shrink-0 cursor-pointer shadow-sm hover:opacity-90 transition-all block">
            <img src="${avatarUrl}" alt="Profile" class="w-full h-full object-cover" loading="lazy" onerror="this.onerror=null; this.src='/img/default-avatar.png';" />
          </a>
        `;
      } else {
        authContainer.innerHTML = `
          <div class="flex items-center gap-2">
            <a href="/auth/login.html" class="text-sm font-semibold text-[#FAF6EE] hover:text-white hover:underline no-underline" style="font-family: 'DM Sans', sans-serif;">Login</a>
            <a href="/auth/signup-buyer.html" class="text-[#14381F] text-sm font-semibold px-3.5 py-1.5 rounded-lg bg-[#FAF6EE] hover:bg-white transition-all no-underline shadow-sm" style="font-family: 'DM Sans', sans-serif;">Sign Up</a>
          </div>
        `;
      }
    }

    // Update cart count badge
    try {
      const cartData = await api.get('/cart');
      const badge = document.getElementById('nav-cart-badge');
      if (badge && cartData?.data?.item_count > 0) {
        badge.textContent = cartData.data.item_count;
        badge.classList.remove('hidden');
      }
    } catch (_) {}

    // Update wishlist count badge
    try {
      const wishData = await api.get('/wishlist');
      const wishBadge = document.getElementById('nav-wishlist-badge');
      const items = wishData?.data?.items || wishData?.data || [];
      if (wishBadge && items.length > 0) {
        wishBadge.textContent = items.length;
        wishBadge.classList.remove('hidden');
      }
    } catch (_) {}
  }
});

