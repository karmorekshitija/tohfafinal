/**
 * ═══════════════════════════════════════════════════
 *  FILE: frontend/components/seller-components.js
 *  LAYER: Frontend — Seller Studio Shared Components
 *  PURPOSE: Responsive custom elements (<seller-layout>, <seller-sidebar>, <seller-topbar>)
 *           with Pine #14381F theme and mobile navigation.
 *  LAST_POLISHED: 2026-08-23
 * ═══════════════════════════════════════════════════
 */

// Inject global styles and CSS overrides for Seller Studio
(function injectGlobalStyles() {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --color-pine: #14381F;
      --color-ivory: #FFF8E7;
      --color-terracotta: #C85A32;
    }

    body, html {
      background-color: #FFF8E7 !important;
      font-family: 'DM Sans', sans-serif !important;
      color: #1C1C1A !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    
    h1, h2, h3, h4, h5, h6, .font-headline, .font-headline-lg, .font-headline-md, .font-headline-sm {
      font-family: 'Playfair Display', serif !important;
    }

    /* Scrollbar customization */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(20, 56, 31, 0.15);
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #14381F;
    }

    /* Component specific classes */
    .sidebar-link {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 10px;
      padding-bottom: 10px;
      color: #FFF8E7 !important;
      opacity: 0.75;
      font-weight: 500;
      transition: all 0.2s ease;
      text-decoration: none;
      outline: none;
    }
    .sidebar-link:hover {
      background-color: rgba(255, 248, 231, 0.1) !important;
      opacity: 1 !important;
    }
    .sidebar-link-active {
      background-color: rgba(255, 248, 231, 0.18) !important;
      color: #FFF8E7 !important;
      font-weight: 700 !important;
      opacity: 1 !important;
    }

    seller-layout {
      display: block !important;
      width: 100% !important;
      min-height: 100vh !important;
      background-color: #FFF8E7 !important;
    }

    .seller-layout-container {
      display: flex !important;
      min-height: 100vh !important;
      width: 100% !important;
      background-color: #FFF8E7 !important;
    }

    seller-sidebar {
      display: block !important;
      width: 130px !important;
      flex-shrink: 0 !important;
      z-index: 50 !important;
      transition: transform 0.3s ease-in-out !important;
    }

    .seller-main-panel {
      flex: 1 !important;
      display: flex !important;
      flex-direction: column !important;
      min-width: 0 !important;
      position: relative !important;
      background-color: #FFF8E7 !important;
      padding: 24px 40px 64px 40px !important;
      height: 100vh !important;
      max-height: 100vh !important;
      overflow-y: auto !important;
    }

    seller-topbar {
      display: block !important;
      height: 60px !important;
      width: 100% !important;
      flex-shrink: 0 !important;
      z-index: 40 !important;
    }

    .seller-topbar-header {
      position: fixed !important;
      top: 0 !important;
      right: 0 !important;
      left: 130px !important;
      height: 60px !important;
      background-color: #FFF8E7 !important;
      border-bottom: 1px solid rgba(20, 56, 31, 0.10) !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding-left: 40px !important;
      padding-right: 40px !important;
      z-index: 40 !important;
      backdrop-filter: blur(8px) !important;
    }

    @media (max-width: 1023px) {
      seller-sidebar {
        position: fixed !important;
        left: 0 !important;
        top: 0 !important;
        height: 100vh !important;
        transform: translateX(-100%) !important;
      }
      
      seller-sidebar.active {
        transform: translateX(0) !important;
      }

      .seller-main-panel {
        margin-left: 0 !important;
        padding: 68px 16px 80px 16px !important;
        height: auto !important;
        max-height: none !important;
        overflow-y: visible !important;
      }

      .seller-topbar-header {
        left: 0 !important;
        padding-left: 16px !important;
        padding-right: 16px !important;
      }
    }
  `;
  document.head.appendChild(style);
})();

class SellerSidebar extends HTMLElement {
  connectedCallback() {
    const activeTab = this.getAttribute('active-tab') || '';
    const isAdminSwitched = Boolean(sessionStorage.getItem('tohfa_admin_switch_context'));
    
    this.innerHTML = `
      <aside class="w-[130px] h-screen fixed left-0 top-0 bg-[#14381F] border-r border-white/10 shadow-lg flex flex-col py-5 z-50 overflow-y-auto font-['DM_Sans'] text-[#FFF8E7]">
        <!-- Artisan Studio Emblem -->
        <div class="px-3 mb-5 flex flex-col items-center">
          <a href="/seller/dashboard.html" class="flex flex-col items-center text-decoration-none group" title="Seller Studio">
            <div class="w-10 h-10 rounded-full bg-white/10 group-hover:bg-white/20 transition-all flex items-center justify-center text-[#FFF8E7] shadow-inner mb-1">
              <span class="material-symbols-outlined text-[20px]">storefront</span>
            </div>
            <span class="text-[8px] uppercase tracking-widest text-[#FFF8E7]/60 font-mono font-bold">Studio</span>
          </a>
        </div>
        
        <!-- Navigation Links -->
        <nav class="flex-1 space-y-0.5">
          <!-- Dashboard -->
          <a class="sidebar-link ${activeTab === 'home' || activeTab === 'dashboard' ? 'sidebar-link-active' : ''}" href="/seller/dashboard.html" title="Dashboard">
            <span class="material-symbols-outlined mb-1 text-2xl">home</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Dashboard</span>
          </a>
          <!-- Catalog -->
          <a class="sidebar-link ${activeTab === 'catalog' ? 'sidebar-link-active' : ''}" href="/seller/catalog.html" title="Catalog">
            <span class="material-symbols-outlined mb-1 text-2xl">inventory_2</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Catalog</span>
          </a>
          ${!isAdminSwitched ? `
          <!-- Orders -->
          <a class="sidebar-link ${activeTab === 'orders' ? 'sidebar-link-active' : ''}" href="/seller/orders.html" title="Orders">
            <span class="material-symbols-outlined mb-1 text-2xl">shopping_bag</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Orders</span>
          </a>
          ` : ''}
          <!-- Customized Products -->
          <a class="sidebar-link ${activeTab === 'customized' ? 'sidebar-link-active' : ''} relative" href="/seller/customized-products.html" title="Customized Products">
            <span class="material-symbols-outlined mb-1 text-2xl">auto_fix_high</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Customized</span>
            <span id="sidebar-customized-badge" class="hidden absolute top-1 right-3 bg-[#14381F] text-white font-bold text-[8px] w-4 h-4 rounded-full flex items-center justify-center">0</span>
          </a>
          ${!isAdminSwitched ? `
          <!-- Payouts -->
          <a class="sidebar-link ${activeTab === 'payments' || activeTab === 'payouts' ? 'sidebar-link-active' : ''}" href="/seller/payouts.html" title="Payouts">
            <span class="material-symbols-outlined mb-1 text-2xl">payments</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Payouts</span>
          </a>
          ` : ''}
          <!-- Analytics -->
          <a class="sidebar-link ${activeTab === 'analytics' ? 'sidebar-link-active' : ''}" href="/seller/analytics.html" title="Analytics">
            <span class="material-symbols-outlined mb-1 text-2xl">insights</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Analytics</span>
          </a>
          <!-- Reviews -->
          <a class="sidebar-link ${activeTab === 'reviews' ? 'sidebar-link-active' : ''}" href="/seller/reviews.html" title="Reviews">
            <span class="material-symbols-outlined mb-1 text-2xl">rate_review</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Reviews</span>
          </a>
          <!-- Profile & Settings -->
          <a class="sidebar-link ${activeTab === 'profile' || activeTab === 'settings' ? 'sidebar-link-active' : ''}" href="/seller/profile-settings.html" title="Settings">
            <span class="material-symbols-outlined mb-1 text-2xl">settings</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Settings</span>
          </a>
          ${!isAdminSwitched ? `
          <!-- Studio Plans -->
          <a class="sidebar-link ${activeTab === 'plans' ? 'sidebar-link-active' : ''}" href="/seller/plans.html" title="Studio Plans">
            <span class="material-symbols-outlined mb-1 text-2xl">workspace_premium</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Plans</span>
          </a>
          ` : ''}
        </nav>
        
        <!-- Footer actions -->
        <div class="px-3 mt-auto pt-3 space-y-2 w-full">
          <button id="view-store-btn" class="w-full py-2 bg-[#FFF8E7] text-[#14381F] rounded-lg font-['DM_Sans'] font-semibold text-[10px] uppercase tracking-wider hover:bg-[#DCE6D8] active:scale-95 transition-all shadow-sm cursor-pointer border-none flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-[13px]">visibility</span>
            <span>View Store</span>
          </button>
          <button id="logout-btn" class="w-full py-2 bg-white/10 text-[#FFF8E7] rounded-lg font-['DM_Sans'] font-medium text-[10px] uppercase tracking-wider hover:bg-white/20 active:scale-95 transition-all cursor-pointer border-none">
            Logout
          </button>
        </div>
      </aside>
    `;

    const viewStoreBtn = this.querySelector('#view-store-btn');
    if (viewStoreBtn) {
      viewStoreBtn.addEventListener('click', () => {
        const token = (typeof window !== 'undefined' && window.authStorage?.getItem('tohfa_access_token')) ||
                      sessionStorage.getItem('tohfa_access_token') ||
                      sessionStorage.getItem('tohfa_auth_token') ||
                      localStorage.getItem('tohfa_access_token') ||
                      localStorage.getItem('tohfa_auth_token') ||
                      localStorage.getItem('token') ||
                      localStorage.getItem('accessToken') || '';
        const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};
        fetch(`/api/seller/profile`, {
          headers: authHeaders
        })
        .then(res => res.json())
        .then(data => {
          const profile = data.data?.profile || data.profile || data.data || data;
          const sellerId = profile?.user_id || profile?.seller_id || profile?.id;
          if (sellerId) {
            window.location.href = `/buyer/seller-profile.html?id=${sellerId}`;
          } else {
            window.location.href = '/seller/dashboard.html';
          }
        })
        .catch(() => {
          window.location.href = '/seller/dashboard.html';
        });
      });
    }

    const logoutBtn = this.querySelector('#logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        const token = sessionStorage.getItem('tohfa_access_token');
        const refresh = sessionStorage.getItem('tohfa_refresh_token');
        if (token && refresh) {
          fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ refresh_token: refresh })
          }).catch(() => {});
        }
        sessionStorage.clear();
        window.location.replace('/auth/login.html');
      });
    }
  }
}

class SellerTopBar extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <header class="seller-topbar-header font-['DM_Sans'] flex items-center justify-between">
        <!-- Left Side: Tohfa Studio Primary Branding & Mobile Hamburger -->
        <div class="flex items-center gap-3">
          <!-- Mobile Hamburger -->
          <button id="seller-hamburger-btn" class="lg:hidden text-[#14381F] flex items-center justify-center p-1.5 rounded-lg hover:bg-[#14381F]/10 focus:outline-none border-none bg-transparent cursor-pointer" aria-label="Toggle menu">
            <span class="material-symbols-outlined text-[24px]">menu</span>
          </button>
          <a href="/seller/dashboard.html" class="flex items-center text-decoration-none group">
            <span class="font-['Playfair_Display'] text-[20px] font-bold italic text-[#14381F]">Tohfa</span>
            <span class="font-['DM_Sans'] text-xs font-semibold uppercase tracking-widest text-[#14381F]/70 border-l border-[#14381F]/20 pl-2.5 py-0.5 ml-2.5">Studio</span>
          </a>
        </div>
        
        <!-- Right Side: Clean Seller Profile Pill -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2.5 bg-[#FFF8E7] hover:bg-[#DCE6D8]/40 transition-all border border-[#14381F]/15 rounded-full py-1 pl-3 pr-1.5 shadow-sm">
            <span class="text-xs font-semibold text-[#1C1C1A] line-clamp-1 max-w-[160px] sm:max-w-[200px]" id="topbar-seller-name">Artisan Studio</span>
            <div class="w-7 h-7 rounded-full overflow-hidden border border-[#14381F]/15 flex-shrink-0 bg-[#14381F]/5">
              <img loading="lazy" id="sidebar-avatar" class="w-full h-full object-cover" src="/img/default-avatar.png" alt="Avatar"/>
            </div>
          </div>
        </div>
      </header>
    `;

    // Populate seller info in topbar automatically
    const token = (typeof window !== 'undefined' && window.authStorage?.getItem('tohfa_access_token')) ||
                  sessionStorage.getItem('tohfa_access_token') ||
                  sessionStorage.getItem('tohfa_auth_token') ||
                  localStorage.getItem('tohfa_access_token') ||
                  localStorage.getItem('tohfa_auth_token') ||
                  localStorage.getItem('token') ||
                  localStorage.getItem('accessToken') || '';
    if (token) {
      fetch('/api/seller/profile', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(res => {
          const p = res.data?.profile || res.data || res.profile;
          if (p) {
            const nameEl = this.querySelector('#topbar-seller-name');
            if (nameEl) nameEl.textContent = p.store_name || p.display_name || p.name || 'Artisan Studio';
            const avatarEl = this.querySelector('#sidebar-avatar');
            if (avatarEl && (p.profile_photo || p.avatar_url || p.logo_url)) {
              avatarEl.src = p.profile_photo || p.avatar_url || p.logo_url;
            }
          }
        })
        .catch(() => {});
    }

    const hamburgerBtn = this.querySelector('#seller-hamburger-btn');
    if (hamburgerBtn) {
      hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sidebar = document.querySelector('seller-sidebar');
        if (sidebar) {
          sidebar.classList.toggle('active');
        }
      });
      
      document.addEventListener('click', (e) => {
        const sidebar = document.querySelector('seller-sidebar');
        if (sidebar && sidebar.classList.contains('active') && !sidebar.contains(e.target) && !hamburgerBtn.contains(e.target)) {
          sidebar.classList.remove('active');
        }
      });
    }

    // Check if admin is currently acting as a TOFA Special shop
    const switchContextRaw = sessionStorage.getItem('tohfa_admin_switch_context');
    if (switchContextRaw) {
      try {
        const ctx = JSON.parse(switchContextRaw);
        const banner = document.createElement('div');
        banner.className = 'w-full bg-[#14381F] text-[#FFF8E7] px-4 py-2 flex items-center justify-between text-xs font-medium z-50 fixed top-0 left-0 right-0 border-b border-amber-400/40 shadow-sm';
        banner.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-amber-400 text-stone-950 font-bold text-[10px] uppercase rounded tracking-wider">Admin Mode</span>
            <span>Operating Studio as <strong>${ctx.actingAs || 'Special Shop'}</strong> (TOFA Special Shop)</span>
          </div>
          <button id="return-to-admin-btn" class="px-3 py-1 bg-white/15 hover:bg-white/25 text-[#FFF8E7] rounded font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer border-none">
            <span>Exit to Admin Panel</span>
            <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
          </button>
        `;
        document.body.prepend(banner);
        
        // Push topbar down slightly
        const header = this.querySelector('.seller-topbar-header');
        if (header) header.style.top = '36px';
        const sidebar = document.querySelector('seller-sidebar aside');
        if (sidebar) sidebar.style.top = '36px';

        const returnBtn = banner.querySelector('#return-to-admin-btn');
        if (returnBtn) {
          returnBtn.addEventListener('click', () => {
            sessionStorage.removeItem('tohfa_admin_switch_context');
            window.location.href = ctx.returnUrl || '/admin/sellers.html';
          });
        }
      } catch (e) {}
    }
  }
}

class SellerLayout extends HTMLElement {
  connectedCallback() {
    const activeTab = this.getAttribute('active-tab') || '';

    const render = () => {
      const children = Array.from(this.childNodes);
      const container = document.createElement('div');
      container.className = "seller-layout-container font-body-md text-[#1C1C1C]";

      const sidebar = document.createElement('seller-sidebar');
      sidebar.setAttribute('active-tab', activeTab);

      const mainPanel = document.createElement('div');
      mainPanel.className = "seller-main-panel";

      const topbar = document.createElement('seller-topbar');

      mainPanel.appendChild(topbar);
      children.forEach(child => {
        mainPanel.appendChild(child);
      });

      container.appendChild(sidebar);
      container.appendChild(mainPanel);

      this.innerHTML = '';
      this.appendChild(container);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', render, { once: true });
    } else {
      render();
    }
  }
}

customElements.define('seller-sidebar', SellerSidebar);
customElements.define('seller-topbar', SellerTopBar);
customElements.define('seller-layout', SellerLayout);
