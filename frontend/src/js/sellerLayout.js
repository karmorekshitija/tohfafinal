/**
 * Tohfa v2 — Shared Seller Studio Layout Shell
 * File: frontend/src/js/sellerLayout.js
 * Role: Mounts the responsive Seller Sidebar (desktop) and Drawer Topbar (mobile).
 */
'use strict';

import { getUser, clearAuth } from './auth.js';

export function initSellerShell({ activeTab = 'dashboard' } = {}) {
  renderSellerSidebar(activeTab);
  renderMobileSellerBar(activeTab);
}

export function renderSellerSidebar(activeTab = 'dashboard') {
  const sidebar = document.getElementById('sellerSidebar') || document.querySelector('aside.seller-sidebar');
  if (!sidebar) return;

  const user = getUser();

  sidebar.className = 'seller-sidebar';
  sidebar.innerHTML = `
    <div style="padding-bottom:var(--space-6); border-bottom:1px solid rgba(255,248,231,0.15); margin-bottom:var(--space-6);">
      <a href="/buyer/home.html" class="brand" style="font-family:var(--font-display); font-size:var(--text-xl); font-style:italic; color:var(--color-background); text-decoration:none; display:block;">
        Tohfa<span>.</span> Studio
      </a>
      <div style="font-size:var(--text-xs); color:var(--color-accent); margin-top:2px;">Artisan Creator Portal</div>
    </div>

    <nav class="flex flex-col gap-1" style="flex:1;">
      <a href="./dashboard.html" class="seller-nav-link ${activeTab === 'dashboard' ? 'active' : ''}">📊 Dashboard</a>
      <a href="./orders.html" class="seller-nav-link ${activeTab === 'orders' ? 'active' : ''}">📦 Orders</a>
      <a href="./overflow.html" class="seller-nav-link ${activeTab === 'overflow' ? 'active' : ''}">⏳ Capacity Queue</a>
      <a href="./catalog.html" class="seller-nav-link ${activeTab === 'catalog' ? 'active' : ''}">🎨 Product Catalog</a>
      <a href="./add-product.html" class="seller-nav-link ${activeTab === 'add-product' ? 'active' : ''}">+ Add Product</a>
      <a href="./messages.html" class="seller-nav-link ${activeTab === 'messages' ? 'active' : ''}">💬 Quotes & Inquiries</a>
      <a href="./analytics.html" class="seller-nav-link ${activeTab === 'analytics' ? 'active' : ''}">📈 Analytics</a>
      <a href="./reviews.html" class="seller-nav-link ${activeTab === 'reviews' ? 'active' : ''}">★ Reviews</a>
      <a href="./payouts.html" class="seller-nav-link ${activeTab === 'payouts' ? 'active' : ''}">💳 Payouts</a>
      <a href="./store-config.html" class="seller-nav-link ${activeTab === 'store-config' ? 'active' : ''}">⚙️ Store Settings</a>
      <a href="./profile.html" class="seller-nav-link ${activeTab === 'profile' ? 'active' : ''}">🏪 Storefront Profile</a>
    </nav>

    <div style="padding-top:var(--space-4); border-top:1px solid rgba(255,248,231,0.15);">
      <div class="flex items-center gap-3" style="margin-bottom:var(--space-3);">
        <div class="avatar avatar-sm" style="background:var(--color-accent); color:var(--color-primary); font-weight:bold;">
          ${(user?.store_name || user?.name || 'A')[0].toUpperCase()}
        </div>
        <div style="overflow:hidden;">
          <div style="font-size:var(--text-xs); font-weight:var(--weight-semibold); color:var(--color-background); white-space:nowrap; text-overflow:ellipsis;">${user?.store_name || user?.name || 'Artisan'}</div>
          <div style="font-size:10px; color:rgba(255,248,231,0.6);">Verified Creator</div>
        </div>
      </div>
      <a href="/auth/logout.html" class="text-xs" style="color:rgba(255,248,231,0.7); text-decoration:underline;">Sign Out</a>
    </div>
  `;
}

export function renderMobileSellerBar(activeTab = 'dashboard') {
  let topBar = document.getElementById('mobileSellerTopBar');
  if (!topBar) {
    topBar = document.createElement('div');
    topBar.id = 'mobileSellerTopBar';
    topBar.className = 'mobile-top-bar mobile-only';
    document.body.prepend(topBar);
  }

  topBar.innerHTML = `
    <div class="flex items-center gap-3">
      <button id="mSellerMenuBtn" style="color:var(--color-background); font-size:22px;">☰</button>
      <span style="font-family:var(--font-display); font-size:var(--text-md); color:var(--color-background);">Tohfa Studio</span>
    </div>
    <a href="./orders.html" style="color:var(--color-background); font-size:18px;">📦</a>
  `;

  // Slide-out drawer
  let drawer = document.getElementById('mSellerDrawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'mSellerDrawer';
    drawer.className = 'mobile-drawer';
    drawer.innerHTML = `
      <div style="padding:var(--space-6);">
        <div class="flex justify-between items-center" style="margin-bottom:var(--space-6);">
          <div style="font-family:var(--font-display); font-size:var(--text-xl); color:var(--color-background);">Tohfa Studio</div>
          <button id="closeDrawerBtn" style="color:var(--color-background); font-size:20px;">✕</button>
        </div>
        <nav class="flex flex-col gap-2">
          <a href="./dashboard.html" class="seller-nav-link ${activeTab === 'dashboard' ? 'active' : ''}">📊 Dashboard</a>
          <a href="./orders.html" class="seller-nav-link ${activeTab === 'orders' ? 'active' : ''}">📦 Orders</a>
          <a href="./overflow.html" class="seller-nav-link ${activeTab === 'overflow' ? 'active' : ''}">⏳ Capacity Queue</a>
          <a href="./catalog.html" class="seller-nav-link ${activeTab === 'catalog' ? 'active' : ''}">🎨 Product Catalog</a>
          <a href="./add-product.html" class="seller-nav-link ${activeTab === 'add-product' ? 'active' : ''}">+ Add Product</a>
          <a href="./messages.html" class="seller-nav-link ${activeTab === 'messages' ? 'active' : ''}">💬 Quotes & Inquiries</a>
          <a href="./analytics.html" class="seller-nav-link ${activeTab === 'analytics' ? 'active' : ''}">📈 Analytics</a>
          <a href="./reviews.html" class="seller-nav-link ${activeTab === 'reviews' ? 'active' : ''}">★ Reviews</a>
          <a href="./payouts.html" class="seller-nav-link ${activeTab === 'payouts' ? 'active' : ''}">💳 Payouts</a>
          <a href="./store-config.html" class="seller-nav-link ${activeTab === 'store-config' ? 'active' : ''}">⚙️ Store Settings</a>
          <a href="./profile.html" class="seller-nav-link ${activeTab === 'profile' ? 'active' : ''}">🏪 Store Profile</a>
          <a href="/auth/logout.html" class="seller-nav-link" style="color:var(--color-error); margin-top:var(--space-4);">Sign Out</a>
        </nav>
      </div>
    `;
    document.body.appendChild(drawer);

    const overlay = document.createElement('div');
    overlay.id = 'mDrawerOverlay';
    overlay.className = 'mobile-overlay';
    document.body.appendChild(overlay);

    const toggle = (open) => {
      drawer.classList.toggle('open', open);
      overlay.classList.toggle('open', open);
    };

    document.getElementById('mSellerMenuBtn')?.addEventListener('click', () => toggle(true));
    document.getElementById('closeDrawerBtn')?.addEventListener('click', () => toggle(false));
    overlay.addEventListener('click', () => toggle(false));
  }
}
