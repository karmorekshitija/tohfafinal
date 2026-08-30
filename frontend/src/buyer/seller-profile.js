/**
 * Tohfa v2 — Public Seller Profile Logic
 * File: frontend/src/buyer/seller-profile.js
 */
'use strict';

import { api } from '../js/api.js';
import { initBuyerShell } from '../js/layout.js';
import { formatPrice, showToast } from '../js/utils.js';
import { isLoggedIn } from '../js/auth.js';

initBuyerShell();

const sellerId = new URLSearchParams(window.location.search).get('id');
const heroEl = document.getElementById('sellerHero');
const gridEl = document.getElementById('sellerProductsGrid');
const countBadge = document.getElementById('productCountBadge');


async function loadSellerProfile() {
  if (!sellerId) {
    heroEl.innerHTML = '<p class="text-body" style="padding:var(--space-6);">Seller not found.</p>';
    return;
  }

  try {
    const res = await api.get(`/api/seller/public/${sellerId}`);
    const seller = res?.data?.profile || res?.data;

    if (!seller) {
      heroEl.innerHTML = '<p class="text-body" style="padding:var(--space-6);">Seller not found.</p>';
      return;
    }

    renderHero(seller);
    loadSellerProducts();
  } catch (err) {
    heroEl.innerHTML = `<p class="text-body" style="padding:var(--space-6);">${err.message}</p>`;
  }
}

function renderHero(s) {
  document.title = `${s.store_name || s.name} | Tohfa Studio`;

  const cleanPhone = s.whatsapp_number ? s.whatsapp_number.replace(/\D/g, '').slice(-10) : '';
  const waBtn = cleanPhone
    ? `<a href="https://wa.me/91${cleanPhone}?text=Hi!%20I'm%20visiting%20your%20Tohfa%20Studio" target="_blank" class="btn btn-sm btn-ghost" style="border:1px solid var(--color-border); gap:4px;">
        <span>💬</span> Chat on WhatsApp
       </a>`
    : '';

  const isLegacyBanner = (url) => !url || url.includes('default-banner.png') || url.includes('artisan_showcase.jpg');
  const coverUrl = (!isLegacyBanner(s.cover_photo_url))
    ? s.cover_photo_url
    : (!isLegacyBanner(s.banner_url))
      ? s.banner_url
      : '/img/default-seller-banner.png';

  heroEl.innerHTML = `
    <div class="seller-cover" style="background-image: url('${coverUrl}');"></div>
    <div class="seller-details">
      <div class="flex items-end gap-4">
        <div class="avatar avatar-xl" style="border:4px solid var(--color-surface); box-shadow:var(--shadow-md);">
          <img src="${s.profile_photo_url || s.avatar_url || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80'}" alt="${s.store_name}">
        </div>
        <div>
          <span class="badge badge-accent" style="margin-bottom:var(--space-1);">Verified Artisan Maker</span>
          <h1 style="font-family:var(--font-display); font-size:var(--text-2xl); color:var(--color-primary);">${s.store_name || s.name}</h1>
          <p class="text-body" style="margin-top:var(--space-1); max-width:600px;">${s.bio || 'Independent handmade creator crafting thoughtful artisan gifts.'}</p>
        </div>
      </div>

      <div class="flex gap-2 items-center">
        ${waBtn}
      </div>
    </div>
  `;
}

async function loadSellerProducts() {
  try {
    const res = await api.get(`/api/products/seller/${sellerId}`);
    const raw = res?.data;
    const products = Array.isArray(raw?.products) ? raw.products : (Array.isArray(raw) ? raw : []);

    countBadge.textContent = `${products.length} Products`;

    if (!products.length) {
      gridEl.innerHTML = `<p class="text-body" style="grid-column:1/-1;">This artisan has not published active listings yet.</p>`;
      return;
    }

    gridEl.innerHTML = products.map(p => `
      <div class="product-card" onclick="window.location.href='./product.html?id=${p.id}'">
        <div class="product-card__image-wrap">
          <img src="${p.primary_image || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&q=80'}" class="product-card__image" alt="${p.name}">
        </div>
        <div class="product-card__body">
          <h3 class="product-card__name">${p.name}</h3>
          <div class="product-card__footer">
            <span class="text-price">${formatPrice(p.base_price)}</span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    gridEl.innerHTML = `<p class="text-body" style="grid-column:1/-1;">${err.message}</p>`;
  }
}


loadSellerProfile();
