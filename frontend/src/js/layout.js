/**
 * Tohfa v3 — Shared Layout & Shell Helper
 * File: frontend/src/js/layout.js
 * Role: Mounts the responsive Desktop Navigation, Mobile Bottom Tab Bar,
 *       Footer, and Tanya AI Assistant on any page with a single function call.
 *
 * PALETTE: Warm Gold (#C8A96E) · Charcoal Navy (#1C1C2E) · Cream (#FDF8F0)
 */
'use strict';

import { getUser, isLoggedIn, clearAuth } from './auth.js';
import { api } from './api.js';
import { showToast } from './utils.js';

/**
 * Initialize all shared UI elements for a buyer page
 */
export function initBuyerShell({ activeTab = 'home' } = {}) {
  renderNavbar(activeTab);
  renderMobileTabBar(activeTab);
  renderTanya();
  renderFooter();
  setupCartBadgeListener();
}

/**
 * Render the premium desktop navigation bar
 * Dark charcoal bg · Gold italic logo · Gold active underline · Pill search bar
 */
export function renderNavbar(activeTab = 'home') {
  const navContainer = document.getElementById('navbarContainer') || document.querySelector('nav.nav-desktop');
  if (!navContainer) return;

  const user = getUser();
  const userLoggedIn = isLoggedIn();

  const authMarkup = userLoggedIn
    ? `
      <div class="user-menu-wrap" style="position: relative;">
        <button id="userMenuBtn" class="btn btn-sm" style="
          border-radius: var(--radius-pill);
          padding: 0 var(--space-4);
          height: 36px;
          gap: 6px;
          background: var(--color-pale-sage);
          color: var(--color-primary);
          border: 1px solid rgba(20,56,31,0.2);
          font-size: var(--text-xs);
          font-weight: var(--weight-semibold);
          letter-spacing: 0.03em;
        ">
          <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--color-primary);"></span>
          ${user?.name?.split(' ')[0] || 'Account'} ▾
        </button>
        <div id="userDropdown" class="card animate-fade-in" style="
          display:none;
          position:absolute;
          right:0;
          top:calc(100% + 10px);
          width:196px;
          padding:var(--space-2);
          z-index:var(--z-dropdown);
          box-shadow:var(--shadow-modal);
          background: var(--color-background);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
        ">
          <a href="/buyer/profile.html" style="display:flex; align-items:center; gap:var(--space-2); padding:var(--space-2) var(--space-3); font-size:var(--text-sm); border-radius:var(--radius-sm); color:var(--color-text);">
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
            My Profile
          </a>
          <a href="/buyer/orders.html" style="display:flex; align-items:center; gap:var(--space-2); padding:var(--space-2) var(--space-3); font-size:var(--text-sm); border-radius:var(--radius-sm); color:var(--color-text);">
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
            My Orders
          </a>
          <a href="/buyer/occasions.html" style="display:flex; align-items:center; gap:var(--space-2); padding:var(--space-2) var(--space-3); font-size:var(--text-sm); border-radius:var(--radius-sm); color:var(--color-text);">
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            Occasions 📅
          </a>
          ${user?.role === 'seller' ? `
          <a href="/seller/dashboard.html" style="display:flex; align-items:center; gap:var(--space-2); padding:var(--space-2) var(--space-3); font-size:var(--text-sm); border-radius:var(--radius-sm); font-weight:var(--weight-semibold); color:var(--color-primary);">
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
            Seller Studio
          </a>` : ''}
          <div style="height:1px; background:var(--color-border); margin:4px var(--space-2);"></div>
          <button id="logoutNavBtn" style="
            width:100%;
            text-align:left;
            display:flex;
            align-items:center;
            gap:var(--space-2);
            padding:var(--space-2) var(--space-3);
            font-size:var(--text-sm);
            color:var(--color-error);
            border-radius:var(--radius-sm);
          ">
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            Sign Out
          </button>
        </div>
      </div>
    `
    : `
      <a href="/auth/login.html" class="btn btn-sm btn-primary" style="border-radius:var(--radius-pill); height:36px; font-size:var(--text-xs); padding: 0 var(--space-4);">Sign In</a>
    `;

  navContainer.className = 'nav-desktop';
  navContainer.innerHTML = `
    <div class="nav-desktop__inner">
      <!-- Logo + Offers badge -->
      <div class="flex items-center gap-3">
        <a href="/buyer/home.html" class="nav-desktop__logo">
          Tohfa
        </a>
        <a href="/buyer/search.html?tag=offers" class="badge" style="
          font-size:11px;
          padding: 3px var(--space-3);
          letter-spacing: 0.04em;
          text-transform: uppercase;
          border-radius: var(--radius-pill);
          background: var(--color-pale-sage);
          color: var(--color-primary);
          font-weight: var(--weight-semibold);
        ">Curated Gifts</a>
      </div>

      <!-- Center nav links -->
      <nav class="nav-desktop__center">
        <a href="/buyer/home.html" class="nav-desktop__link ${activeTab === 'home' ? 'active' : ''}">Home</a>
        <a href="/buyer/categories.html" class="nav-desktop__link ${activeTab === 'categories' ? 'active' : ''}">Categories</a>
        <a href="/buyer/occasions.html" class="nav-desktop__link ${activeTab === 'occasions' ? 'active' : ''}">Occasions</a>
        <button id="navOurStoryBtn" class="nav-desktop__link" style="cursor:pointer; background:none; border:none;">Our Story</button>
      </nav>

      <!-- Right icons -->
      <div class="nav-desktop__right">
        <!-- Search pill -->
        <a href="/buyer/search.html" class="nav-search-bar" style="text-decoration:none;" title="Search gifts">
          <svg width="15" height="15" fill="none" stroke="var(--color-moss)" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <span style="font-size:var(--text-xs); color:var(--color-moss);">Search handcrafted gifts…</span>
        </a>

        <!-- Wishlist -->
        <a href="/buyer/wishlist.html" class="nav-icon-btn" title="Wishlist">
          <svg width="19" height="19" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
        </a>

        <!-- Cart with badge -->
        <a href="/buyer/cart.html" id="cartNavIcon" class="nav-icon-btn" title="Cart">
          <svg width="19" height="19" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
          <span id="navCartCount" class="nav-badge" style="display:none;">0</span>
        </a>

        <!-- Notifications -->
        <a href="/buyer/notifications.html" class="nav-icon-btn" title="Notifications">
          <svg width="19" height="19" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
        </a>

        <!-- Auth -->
        ${authMarkup}
      </div>
    </div>
  `;

  // Dropdown toggle
  const userBtn = document.getElementById('userMenuBtn');
  const userDropdown = document.getElementById('userDropdown');
  if (userBtn && userDropdown) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', () => {
      userDropdown.style.display = 'none';
    });
  }

  // Logout
  const logoutBtn = document.getElementById('logoutNavBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      window.location.href = '/auth/logout.html';
    });
  }

  // Our Story modal
  const storyBtn = document.getElementById('navOurStoryBtn');
  if (storyBtn) {
    storyBtn.addEventListener('click', () => openOurStoryModal());
  }
}

/**
 * Render mobile bottom tab bar
 * Charcoal bg · Gold active indicator line at top · Gold badge color
 */
export function renderMobileTabBar(activeTab = 'home') {
  let tabBar = document.getElementById('mobileTabBar');
  if (!tabBar) {
    tabBar = document.createElement('nav');
    tabBar.id = 'mobileTabBar';
    document.body.appendChild(tabBar);
  }
  tabBar.className = 'bottom-tab-bar mobile-only';
  tabBar.innerHTML = `
    <a href="/buyer/home.html" class="tab-item ${activeTab === 'home' ? 'active' : ''}">
      <svg class="tab-item__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
      <span class="tab-item__label">Home</span>
    </a>
    <a href="/buyer/categories.html" class="tab-item ${activeTab === 'categories' ? 'active' : ''}">
      <svg class="tab-item__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
      <span class="tab-item__label">Explore</span>
    </a>
    <a href="/buyer/search.html" class="tab-item ${activeTab === 'search' ? 'active' : ''}">
      <svg class="tab-item__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
      <span class="tab-item__label">Search</span>
    </a>
    <a href="/buyer/cart.html" class="tab-item ${activeTab === 'cart' ? 'active' : ''}" style="position:relative;">
      <svg class="tab-item__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
      <span class="tab-item__label">Cart</span>
      <span id="mobileCartBadge" class="tab-item__badge" style="display:none;">0</span>
    </a>
    <a href="/buyer/profile.html" class="tab-item ${activeTab === 'profile' ? 'active' : ''}">
      <svg class="tab-item__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
      <span class="tab-item__label">Profile</span>
    </a>
  `;
}

/**
 * Render Tanya AI Assistant floating widget — gold trigger button
 */
export function renderTanya() {
  if (typeof document === 'undefined') return;
  if (!document.body) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => renderTanya(), { once: true });
    }
    return;
  }
  if (document.getElementById('tanyaWidget')) return;

  const tanyaWrap = document.createElement('div');
  tanyaWrap.id = 'tanyaWidget';
  tanyaWrap.className = 'tanya-bubble';
  tanyaWrap.innerHTML = `
    <div id="tanyaWindow" class="tanya-window" style="display:none;">
      <div class="tanya-header">
        <div class="tanya-avatar">✨</div>
        <div style="flex:1;">
          <div class="tanya-title">Tanya</div>
          <div class="tanya-subtitle">Your AI Gift Concierge</div>
        </div>
        <button id="closeTanyaBtn" style="color:rgba(253,248,240,0.7); font-size:18px; line-height:1; transition:color 0.15s;" onmouseover="this.style.color='var(--color-gold-light)'" onmouseout="this.style.color='rgba(253,248,240,0.7)'">✕</button>
      </div>

      <div id="tanyaMessages" class="tanya-messages">
        <div class="tanya-msg tanya-msg--bot">
          Namaste! ✨ I'm Tanya, your Tohfa gift concierge. Tell me about the person or occasion — I'll find the perfect handmade gift for you.
        </div>
      </div>

      <form id="tanyaForm" class="tanya-input-wrap">
        <input
          type="text"
          id="tanyaInput"
          class="tanya-input"
          placeholder="e.g. Birthday gift for my sister, under ₹1500…"
          autocomplete="off"
        >
        <button type="submit" class="btn btn-sm btn-gold" style="border-radius:var(--radius-md); padding:0 var(--space-4); height:40px; flex-shrink:0;">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
        </button>
      </form>
    </div>

    <button id="tanyaTriggerBtn" class="tanya-trigger" title="Ask Tanya — AI Gift Concierge">
      <svg width="24" height="24" fill="none" stroke="var(--color-primary)" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
    </button>
  `;

  document.body.appendChild(tanyaWrap);

  const triggerBtn  = document.getElementById('tanyaTriggerBtn');
  const tanyaWindow = document.getElementById('tanyaWindow');
  const closeBtn    = document.getElementById('closeTanyaBtn');
  const form        = document.getElementById('tanyaForm');
  const input       = document.getElementById('tanyaInput');
  const messages    = document.getElementById('tanyaMessages');

  let history = [];

  const toggleTanya = () => {
    if (!tanyaWindow) return;
    const isShown = tanyaWindow.style.display === 'flex';
    tanyaWindow.style.display = isShown ? 'none' : 'flex';
    if (!isShown && input) { setTimeout(() => input.focus(), 100); }
  };

  if (triggerBtn) triggerBtn.addEventListener('click', toggleTanya);
  if (closeBtn) closeBtn.addEventListener('click', toggleTanya);

  if (form && input && messages) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      const userMsg = document.createElement('div');
      userMsg.className = 'tanya-msg tanya-msg--user';
      userMsg.textContent = text;
      messages.appendChild(userMsg);
      input.value = '';
      messages.scrollTop = messages.scrollHeight;

      const loadingMsg = document.createElement('div');
      loadingMsg.className = 'tanya-msg tanya-msg--bot';
      loadingMsg.innerHTML = '<span class="animate-pulse">Finding the perfect gift for you…</span>';
      messages.appendChild(loadingMsg);
      messages.scrollTop = messages.scrollHeight;

      try {
        const res   = await api.post('/api/tanya/chat', { message: text, history });
        const reply = res?.data?.reply || 'Please explore our curated artisan collections!';
        loadingMsg.innerHTML = reply.replace(/\n/g, '<br>');
        history.push({ role: 'user',  parts: [{ text }] });
        history.push({ role: 'model', parts: [{ text: reply }] });
      } catch {
        loadingMsg.textContent = "I'm taking a brief pause — please browse our collections or try again!";
      }
      messages.scrollTop = messages.scrollHeight;
    });
  }
}

/**
 * Open Tanya from external triggers (homepage banner, footer link)
 */
export function openTanya() {
  let tanyaWindow = document.getElementById('tanyaWindow');
  if (!tanyaWindow) {
    renderTanya();
    tanyaWindow = document.getElementById('tanyaWindow');
  }
  if (tanyaWindow) {
    tanyaWindow.style.display = 'flex';
    setTimeout(() => document.getElementById('tanyaInput')?.focus(), 100);
  }
}

/**
 * Render premium footer
 * Dark charcoal bg · Gold italic logo · Gold section headings
 */
export function renderFooter() {
  let footer = document.querySelector('footer.footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.className = 'footer';
    document.body.appendChild(footer);
  }

  footer.innerHTML = `
    <div class="footer__grid">
      <!-- Brand Column -->
      <div>
        <div class="footer__brand"><em>Tohfa</em></div>
        <p class="footer__tagline">
          India's curated marketplace for authentic handmade gifts, crafted by independent artisans with love and intention.
        </p>
        <div class="flex gap-3" style="margin-top: var(--space-5);">
          <a href="#" class="nav-icon-btn" style="width:36px; height:36px; color:rgba(253,248,240,0.5); border:1px solid rgba(200,169,110,0.2); border-radius:var(--radius-md);" title="Instagram">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke-width="1.75"/><path stroke-linecap="round" stroke-width="1.75" d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zM17.5 6.5h.01"/></svg>
          </a>
          <a href="#" class="nav-icon-btn" style="width:36px; height:36px; color:rgba(253,248,240,0.5); border:1px solid rgba(200,169,110,0.2); border-radius:var(--radius-md);" title="WhatsApp">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          </a>
        </div>
      </div>

      <!-- Discover -->
      <div>
        <div class="footer__heading">Discover</div>
        <a href="/buyer/home.html"       class="footer__link">Home</a>
        <a href="/buyer/categories.html" class="footer__link">All Categories</a>
        <a href="/buyer/occasions.html"  class="footer__link">Occasions Calendar</a>
        <a href="/buyer/our-story.html" id="footerStoryLink" class="footer__link">Our Story</a>
        <a href="javascript:void(0)" id="footerTanyaLink" class="footer__link">AI Gift Guide (Tanya)</a>
      </div>

      <!-- Artisans -->
      <div>
        <div class="footer__heading">Artisans</div>
        <a href="/buyer/become-seller.html"   class="footer__link">Sell on Tohfa</a>
        <a href="/seller/dashboard.html"      class="footer__link">Seller Studio</a>
        <a href="/buyer/zip-gift.html"        class="footer__link">Zip Gift ✨</a>
        <a href="/buyer/customization-form.html" class="footer__link">Request Custom Gift</a>
      </div>

      <!-- Support -->
      <div>
        <div class="footer__heading">Support</div>
        <a href="mailto:support@thetohfa.in"    class="footer__link">Contact Us</a>
        <a href="/buyer/faq.html"               class="footer__link">FAQs & Help</a>
        <a href="/buyer/terms-conditions.html"  class="footer__link">Privacy Policy</a>
        <a href="/buyer/terms-conditions.html"  class="footer__link">Terms of Service</a>
        <a href="/admin/login.html"             class="footer__link" style="opacity:0.35;">Partner Portal</a>
      </div>
    </div>

    <div class="footer__divider"></div>

    <div class="footer__bottom">
      <div class="footer__copyright">
        © ${new Date().getFullYear()} Tohfa Platform. All handcrafted rights reserved.
      </div>
      <div class="flex items-center gap-3">
        <span style="font-size:var(--text-xs); color:rgba(200,169,110,0.5);">
          Made with ♥ for Indian artisans
        </span>
        <span style="width:3px; height:3px; background:rgba(200,169,110,0.35); border-radius:50%;"></span>
        <span style="font-size:var(--text-xs); color:rgba(253,248,240,0.3);">Pure Artisan · Mobile First</span>
      </div>
    </div>
  `;

  document.getElementById('footerStoryLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    openOurStoryModal();
  });
  document.getElementById('footerTanyaLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    openTanya();
  });
}

/**
 * Our Story featured artisans modal
 */
export async function openOurStoryModal() {
  const modalId = 'ourStoryModal';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal animate-scale-in">
        <div class="modal__header">
          <div>
            <div class="text-eyebrow" style="margin-bottom:var(--space-1);">THE PEOPLE BEHIND THE GIFTS</div>
            <h2 class="modal__title">Our Story & Featured Artisans</h2>
          </div>
          <button id="closeStoryModal" class="modal__close">✕</button>
        </div>
        <div id="storyContent" class="flex flex-col gap-4">
          <div class="skeleton skeleton--card" style="height:120px;"></div>
          <div class="skeleton skeleton--card" style="height:120px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('closeStoryModal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  try {
    const res     = await api.get('/api/admin/our-story');
    const stories = res?.data || [];
    const container = document.getElementById('storyContent');
    if (!stories.length) {
      container.innerHTML = `
        <p class="text-body">Tohfa is dedicated to connecting independent Indian artisan creators with thoughtful gift seekers across the country.</p>
        <p class="text-small" style="margin-top:var(--space-2);">Every gift on Tohfa is made by hand, with care, and shipped directly from the maker to you.</p>
      `;
      return;
    }

    container.innerHTML = stories.map(s => `
      <div class="card flex gap-4 items-center" style="padding:var(--space-4);">
        <img src="${s.profile_photo_url || '/placeholder.png'}" class="avatar avatar-lg avatar--gold" alt="${s.store_name}">
        <div style="flex:1;">
          <div class="text-eyebrow" style="margin-bottom:var(--space-1);">${s.craft_category || 'Artisan'}</div>
          <h3 style="font-family:var(--font-display); font-size:var(--text-lg); color:var(--color-primary); letter-spacing:var(--tracking-tight);">${s.store_name}</h3>
          <p class="text-small" style="margin-top:4px;">${s.blurb || s.bio || 'Handmade artisan creator on Tohfa.'}</p>
        </div>
      </div>
    `).join('');
  } catch {
    document.getElementById('storyContent').innerHTML = '<p class="text-body">Welcome to Tohfa — empowering handcrafted creators across India.</p>';
  }
}

/**
 * Keep cart badge count synced across desktop & mobile nav
 */
async function setupCartBadgeListener() {
  if (!isLoggedIn()) return;
  try {
    const cart = await api.get('/api/cart');
    let totalItems = 0;
    if (Array.isArray(cart?.data)) {
      cart.data.forEach(sellerGroup => {
        if (Array.isArray(sellerGroup.items)) {
          totalItems += sellerGroup.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
        }
      });
    }

    const desktopBadge = document.getElementById('navCartCount');
    const mobileBadge  = document.getElementById('mobileCartBadge');
    if (desktopBadge) {
      desktopBadge.textContent = totalItems;
      desktopBadge.style.display = totalItems > 0 ? 'flex' : 'none';
    }
    if (mobileBadge) {
      mobileBadge.textContent = totalItems;
      mobileBadge.style.display = totalItems > 0 ? 'flex' : 'none';
    }
  } catch { /* silent */ }
}
