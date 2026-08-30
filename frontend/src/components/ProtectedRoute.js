/**
 * ═══════════════════════════════════════════════════
 *  FILE: frontend/src/components/ProtectedRoute.js
 *  LAYER: Frontend — Auth Guard (Client-side)
 *  PURPOSE: Route protection, session sync across tabs,
 *           nav avatar injection, cart/wishlist badge updates.
 *
 *  STORAGE KEYS (SINGLE SOURCE OF TRUTH):
 *    tohfa_access_token  — buyer/seller JWT
 *    tohfa_refresh_token — buyer/seller refresh token
 *    tohfa_user          — JSON user object
 *    tohfa_admin_token   — admin JWT (separate auth flow)
 *
 *  NOTE: No mobile-buyer or mobile-seller directories exist.
 *        All pages are responsive under /buyer/ and /seller/.
 * ═══════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const path = window.location.pathname;

  // ── 1. Inject responsive CSS early to avoid FOUC ──────────────────────────
  (function injectResponsiveCss() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/src/responsive.css';
    document.head.appendChild(link);
  })();

  // ── 2. Cross-tab session sync via localStorage bridge ─────────────────────
  // When a new tab opens without a sessionStorage token, it asks other tabs.
  window.addEventListener('storage', function (event) {
    if (event.key === 'tohfa_request_session' && event.newValue) {
      const sessionData = {
        tohfa_access_token:       sessionStorage.getItem('tohfa_access_token'),
        tohfa_refresh_token:      sessionStorage.getItem('tohfa_refresh_token'),
        tohfa_user:               sessionStorage.getItem('tohfa_user'),
        tohfa_admin_token:        sessionStorage.getItem('tohfa_admin_token'),
        tohfa_admin_refresh_token:sessionStorage.getItem('tohfa_admin_refresh_token')
      };
      if (sessionData.tohfa_access_token || sessionData.tohfa_admin_token) {
        try {
          localStorage.setItem('tohfa_share_session', JSON.stringify(sessionData));
          localStorage.removeItem('tohfa_share_session');
        } catch (e) {}
      }
    } else if (event.key === 'tohfa_share_session' && event.newValue) {
      try {
        const data = JSON.parse(event.newValue);
        if (data.tohfa_access_token)        sessionStorage.setItem('tohfa_access_token', data.tohfa_access_token);
        if (data.tohfa_refresh_token)       sessionStorage.setItem('tohfa_refresh_token', data.tohfa_refresh_token);
        if (data.tohfa_user)                sessionStorage.setItem('tohfa_user', data.tohfa_user);
        if (data.tohfa_admin_token)         sessionStorage.setItem('tohfa_admin_token', data.tohfa_admin_token);
        if (data.tohfa_admin_refresh_token) sessionStorage.setItem('tohfa_admin_refresh_token', data.tohfa_admin_refresh_token);
        window.dispatchEvent(new Event('tohfa-session-sync'));
      } catch (e) {}
    }
  });

  // Request session data from other open tabs
  if (!sessionStorage.getItem('tohfa_access_token') && !sessionStorage.getItem('tohfa_admin_token')) {
    try {
      localStorage.setItem('tohfa_request_session', Date.now().toString());
    } catch (e) {}
  }

  // ── 3. Route guards ───────────────────────────────────────────────────────
  // Pages that are publicly accessible without login
  const PUBLIC_BUYER_PAGES = new Set([
    'home', 'categories', 'category', 'product',
    'our-story', 'seller-profile', 'search', 'zipgift', 'faq', 'bulk'
  ]);

  let guardsRun = false;
  function runGuards() {
    if (guardsRun) return;
    guardsRun = true;

    // Admin guard
    if (path.startsWith('/admin/') && !path.endsWith('/admin/login.html')) {
      if (!sessionStorage.getItem('tohfa_admin_token')) {
        window.location.replace('/admin/login.html');
        return;
      }
    }

    // Seller guard
    if (path.startsWith('/seller/') && !path.endsWith('/seller/onboarding.html')) {
      const token = sessionStorage.getItem('tohfa_access_token');
      if (!token) {
        sessionStorage.setItem('tohfa_return_to', path + window.location.search);
        window.location.replace('/auth/login.html');
        return;
      }
      try {
        const user = JSON.parse(sessionStorage.getItem('tohfa_user') || '{}');
        if (user.role !== 'seller' && user.role !== 'admin') {
          window.location.replace('/buyer/home.html');
          return;
        }
        // Unapproved sellers only get onboarding + profile-settings + profile
        const isApproved = user.is_approved === 1 || user.is_approved === true || user.is_approved === '1' || user.is_approved === 'true';
        if (user.role === 'seller' && !isApproved) {
          const allowed = path.endsWith('/onboarding.html') || path.endsWith('/onboarding') ||
                          path.endsWith('/profile-settings.html') || path.endsWith('/profile-settings') ||
                          path.endsWith('/profile.html') || path.endsWith('/profile');
          if (!allowed) {
            window.location.replace('/seller/onboarding.html');
            return;
          }
        }
      } catch (e) {
        window.location.replace('/');
      }
    }

    // Buyer guard — only protected pages require login
    if (path.startsWith('/buyer/')) {
      const page = (path.split('/').pop() || '').replace('.html', '');
      if (!PUBLIC_BUYER_PAGES.has(page)) {
        const token = sessionStorage.getItem('tohfa_access_token');
        if (!token) {
          sessionStorage.setItem('tohfa_return_to', path + window.location.search);
          window.location.replace('/auth/login.html');
          return;
        }
      }
    }

    // Run UI setups after guards pass
    setupNavUI();
    setupCartBadge();
    setupWishlistBadge();
    setupNotificationBadge();
  }

  // Run guards after potential session sync
  if (sessionStorage.getItem('tohfa_access_token') || sessionStorage.getItem('tohfa_admin_token')) {
    runGuards();
  } else {
    window.addEventListener('tohfa-session-sync', runGuards, { once: true });
    setTimeout(runGuards, 200);
  }

  // ── 4. Nav avatar injection ───────────────────────────────────────────────
  function setupNavUI() {
    const token = sessionStorage.getItem('tohfa_access_token');
    const authContainer = document.getElementById('auth-buttons-container');
    if (!authContainer || authContainer.dataset.rendered) return;
    authContainer.dataset.rendered = '1';

    if (token) {
      let userObj = {};
      try { userObj = JSON.parse(sessionStorage.getItem('tohfa_user') || '{}'); } catch (e) {}
      const avatarUrl = userObj.avatar_url || userObj.profile_photo_url || '/img/default-avatar.png';
      const profileHref = path.startsWith('/seller/') ? '/seller/profile.html' : '/buyer/profile.html';

      authContainer.innerHTML = `
        <a href="${profileHref}" class="w-10 h-10 rounded-full border border-[rgba(20,56,31,0.2)] overflow-hidden flex-shrink-0 block" aria-label="My profile">
          <img src="${avatarUrl}" alt="Profile" class="w-full h-full object-cover" loading="lazy" onerror="this.onerror=null; this.src='/img/default-avatar.png';">
        </a>
      `;
    } else {
      authContainer.innerHTML = `
        <a href="/auth/login.html" class="text-sm font-semibold text-[#FAF6EE] hover:text-white hover:underline no-underline" style="font-family: 'DM Sans', sans-serif;">Login</a>
        <a href="/auth/signup-buyer.html" class="text-[#14381F] text-sm font-semibold px-3.5 py-1.5 rounded-lg bg-[#FAF6EE] hover:bg-white transition-all no-underline shadow-sm" style="font-family: 'DM Sans', sans-serif;">Sign Up</a>
      `;
    }
  }

  // ── 5. Cart badge ─────────────────────────────────────────────────────────
  async function setupCartBadge() {
    const badge = document.getElementById('nav-cart-badge');
    if (!badge) return;
    const token = sessionStorage.getItem('tohfa_access_token');
    if (!token) { badge.classList.add('hidden'); return; }

    try {
      const res = await fetch('/api/cart', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      const count = data?.data?.item_count || 0;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch (e) {}

    // Re-update on cart change events
    window.addEventListener('tohfa-cart-updated', setupCartBadge);
  }

  // ── 6. Wishlist badge ─────────────────────────────────────────────────────
  async function setupWishlistBadge() {
    const badge = document.getElementById('nav-wishlist-badge');
    if (!badge) return;
    const token = sessionStorage.getItem('tohfa_access_token');
    if (!token) { badge.classList.add('hidden'); return; }

    try {
      const res = await fetch('/api/wishlist', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      const count = data?.data?.count || 0;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch (e) {}
  }

  // ── 7. Notification badge ─────────────────────────────────────────────────
  async function setupNotificationBadge() {
    const badge = document.getElementById('nav-notifications-badge');
    if (!badge) return;
    const token = sessionStorage.getItem('tohfa_access_token');
    if (!token) { badge.classList.add('hidden'); return; }

    try {
      const res = await fetch('/api/notifications?limit=1&unread_only=true', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const unread = data?.data?.unread_count || 0;
      if (unread > 0) {
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch (e) {}
  }

  // ── 8. Mobile Bottom Navigation for Buyer pages ──────────────────────────
  function setupBottomNav() {
    const isBuyerPage = path.includes('/buyer/') ||
      (!path.includes('/seller/') && !path.includes('/admin/') && !path.includes('/auth/') && (
        path.includes('home') || path.includes('categor') || path.includes('zip-gift') ||
        path.includes('search') || path.includes('product') || path.includes('profile') ||
        path.includes('cart') || path.includes('wishlist') || path.includes('order') ||
        path.includes('occasions') || path.includes('our-story') || path.includes('faq') ||
        path.includes('terms')
      ));

    if (!isBuyerPage) return;
    if (document.getElementById('tohfa-buyer-bottom-nav')) return;

    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.classList.add('pb-[76px]', 'md:pb-0');
    }

    const currentClean = (path.split('/').pop() || 'home').replace('.html', '').toLowerCase();

    const nav = document.createElement('nav');
    nav.id = 'tohfa-buyer-bottom-nav';
    nav.className = 'buyer-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#FAF6EE] border-t border-[#14381F]/15 flex items-center justify-around px-2 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]';
    nav.style.height = '60px';

    const items = [
      { name: 'Home', href: '/buyer/home.html', icon: 'home', key: 'home' },
      { name: 'Category', href: '/buyer/categories.html', icon: 'category', key: 'categories' },
      { name: 'ZipGift', href: '/buyer/zip-gift.html', icon: 'bolt', key: 'zip-gift' },
      { name: 'Profile', href: '/buyer/profile.html', icon: 'person', key: 'profile' }
    ];

    nav.innerHTML = items.map(item => {
      const isActive = currentClean === item.key ||
        (item.key === 'home' && (currentClean === '' || currentClean === 'index')) ||
        (item.key === 'categories' && (currentClean === 'category' || currentClean === 'categories'));
      const activeColor = isActive ? '#14381F' : 'rgba(28, 28, 28, 0.5)';
      const fontWeight = isActive ? '700' : '400';
      return `
        <a href="${item.href}" class="flex flex-col items-center justify-center gap-0.5 py-1 min-w-[60px] tap-target transition-transform active:scale-90" style="color: ${activeColor}; text-decoration: none;">
          <span class="material-symbols-outlined" style="font-size: 22px; font-variation-settings: 'FILL' ${isActive ? 1 : 0};">${item.icon}</span>
          <span style="font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: ${fontWeight};">${item.name}</span>
        </a>
      `;
    }).join('');

    document.body.appendChild(nav);
  }

  // ── 9. Re-run nav UI on session sync ──────────────────────────────────────
  window.addEventListener('tohfa-session-sync', function () {
    setupNavUI();
    setupCartBadge();
    setupBottomNav();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupBottomNav);
  } else {
    setupBottomNav();
  }

})();
