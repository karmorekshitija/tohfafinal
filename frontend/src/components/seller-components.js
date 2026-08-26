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
    body, html {
      background-color: #FFF8E7 !important;
      font-family: 'DM Sans', sans-serif !important;
      color: #1C1C1C !important;
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
      padding: 32px 48px 64px 48px !important;
      height: 100vh !important;
      max-height: 100vh !important;
      overflow-y: auto !important;
    }

    seller-topbar {
      display: block !important;
      height: 64px !important;
      width: 100% !important;
      flex-shrink: 0 !important;
      z-index: 40 !important;
    }

    .seller-topbar-header {
      position: fixed !important;
      top: 0 !important;
      right: 0 !important;
      left: 130px !important;
      height: 64px !important;
      background-color: #FFF8E7 !important;
      border-bottom: 1px solid rgba(20, 56, 31, 0.12) !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding-left: 48px !important;
      padding-right: 48px !important;
      z-index: 40 !important;
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
        padding: 72px 16px 80px 16px !important;
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
    
    this.innerHTML = `
      <aside class="w-[130px] h-screen fixed left-0 top-0 bg-[#14381F] border-r border-white/10 shadow-lg flex flex-col py-6 z-50 overflow-y-auto font-['DM_Sans'] text-[#FFF8E7]">
        <!-- Brand Logo Header -->
        <div class="px-3 mb-6 flex flex-col items-center">
          <a href="/seller/dashboard.html" class="flex flex-col items-center text-decoration-none">
            <span class="font-['Playfair_Display'] font-bold text-[18px] text-center leading-tight text-[#FFF8E7] italic">Tohfa</span>
            <span class="text-[9px] uppercase tracking-widest text-[#FFF8E7]/60 font-mono mt-0.5">Studio</span>
          </a>
        </div>
        
        <!-- Navigation Links -->
        <nav class="flex-1 space-y-1">
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
          <!-- Orders -->
          <a class="sidebar-link ${activeTab === 'orders' ? 'sidebar-link-active' : ''}" href="/seller/orders.html" title="Orders">
            <span class="material-symbols-outlined mb-1 text-2xl">shopping_bag</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Orders</span>
          </a>
          <!-- Overflow Requests -->
          <a class="sidebar-link ${activeTab === 'overflow' ? 'sidebar-link-active' : ''} relative" href="/seller/overflow.html" title="Overflow Requests">
            <span class="material-symbols-outlined mb-1 text-2xl">event_busy</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Overflow</span>
            <span id="sidebar-overflow-badge" class="hidden absolute top-1 right-3 bg-[#C0392B] text-white font-bold text-[8px] w-4 h-4 rounded-full flex items-center justify-center">0</span>
          </a>
          <!-- Payouts -->
          <a class="sidebar-link ${activeTab === 'payments' || activeTab === 'payouts' ? 'sidebar-link-active' : ''}" href="/seller/payouts.html" title="Payouts">
            <span class="material-symbols-outlined mb-1 text-2xl">payments</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Payouts</span>
          </a>
          <!-- Analytics -->
          <a class="sidebar-link ${activeTab === 'analytics' ? 'sidebar-link-active' : ''}" href="/seller/analytics.html" title="Analytics">
            <span class="material-symbols-outlined mb-1 text-2xl">insights</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Analytics</span>
          </a>
          <!-- Messages -->
          <a class="sidebar-link ${activeTab === 'messages' ? 'sidebar-link-active' : ''}" href="/seller/messages.html" title="Messages">
            <span class="material-symbols-outlined mb-1 text-2xl">chat</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Messages</span>
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
          <!-- Studio Plans -->
          <a class="sidebar-link ${activeTab === 'plans' ? 'sidebar-link-active' : ''}" href="/seller/plans.html" title="Studio Plans">
            <span class="material-symbols-outlined mb-1 text-2xl">workspace_premium</span>
            <span class="text-[9px] uppercase tracking-widest text-center">Plans</span>
          </a>
        </nav>
        
        <!-- Footer actions -->
        <div class="px-3 mt-auto pt-4 space-y-2 w-full">
          <button id="view-store-btn" class="w-full py-2 bg-[#FFF8E7] text-[#14381F] rounded-lg font-['DM_Sans'] font-semibold text-[10px] uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all shadow-sm">
            View Store
          </button>
          <button id="logout-btn" class="w-full py-2 bg-white/10 text-[#FFF8E7] rounded-lg font-['DM_Sans'] font-medium text-[10px] uppercase tracking-wider hover:bg-white/20 active:scale-95 transition-all">
            Logout
          </button>
        </div>
      </aside>
    `;

    const viewStoreBtn = this.querySelector('#view-store-btn');
    if (viewStoreBtn) {
      viewStoreBtn.addEventListener('click', () => {
        const token = sessionStorage.getItem('tohfa_access_token');
        fetch(`/api/seller/profile`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
          const profileData = data.data || data;
          if (profileData && (profileData.user_id || profileData.seller_id || profileData.id)) {
            window.location.href = `/buyer/seller-profile.html?id=${profileData.user_id || profileData.seller_id || profileData.id}`;
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
        <!-- Left Side: Tohfa branding -->
        <div class="flex items-center gap-3">
          <a href="/seller/dashboard.html" class="flex items-center gap-2 text-decoration-none">
            <span class="font-['Playfair_Display'] text-[22px] font-bold italic text-[#14381F]">Tohfa</span>
            <span class="font-['DM_Sans'] text-xs uppercase tracking-widest text-[#1C1C1C]/60 border-l border-[#14381F]/20 pl-3 py-1 hidden lg:inline-block">Seller Studio</span>
          </a>
        </div>
        
        <!-- Right Side: User Info & Hamburger -->
        <div class="flex items-center gap-4">
          <div class="hidden lg:flex items-center gap-3">
            <div class="text-right">
              <p class="text-xs font-bold text-[#1C1C1C] line-clamp-1" id="topbar-seller-name">Artisan Partner</p>
              <p class="text-[9px] text-[#1C1C1C]/50 uppercase tracking-wider font-mono">Verified Studio</p>
            </div>
            <div class="w-9 h-9 rounded-full overflow-hidden border border-[#14381F]/20 flex-shrink-0 bg-[#14381F]/5">
              <img loading="lazy" id="sidebar-avatar" class="w-full h-full object-cover" src="/img/default-avatar.png" alt="Avatar"/>
            </div>
          </div>
          <!-- Hamburger Button: mobile/tablet -->
          <button id="seller-hamburger-btn" class="lg:hidden text-[#14381F] flex items-center justify-center p-2 rounded-full hover:bg-[#14381F]/10 focus:outline-none border-none bg-transparent" aria-label="Toggle menu">
            <span class="material-symbols-outlined text-[24px]">menu</span>
          </button>
        </div>
      </header>
    `;

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
