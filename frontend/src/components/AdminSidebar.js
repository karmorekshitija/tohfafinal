/**
 * ═══════════════════════════════════════════════════
 *  FILE: frontend/src/components/AdminSidebar.js
 *  LAYER: Frontend — Admin Panel Component
 *  ROLE: Admin only
 *  PURPOSE: Renders the left sidebar navigation for the Admin panel.
 *           Injected into any <aside> element on admin pages.
 *
 *  COLORS: Pine Shade (#14381F), Cosmic Latte (#FFF8E7), Charcoal (#1C1C1C)
 * ═══════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const NAV_ITEMS = [
    { name: 'Dashboard',      href: '/admin/dashboard.html',      icon: 'grid_view'          },
    { name: 'Special Orders', href: '/admin/special-orders.html', icon: 'stars'              },
    { name: 'Special Shops',  href: '/admin/sellers.html?tab=special-shops', icon: 'storefront' },
    { name: 'Artisans & KYC', href: '/admin/sellers.html',         icon: 'group'              },
    { name: 'All Products',   href: '/admin/products.html',        icon: 'inventory_2'        },
    { name: 'Orders',         href: '/admin/orders.html',          icon: 'shopping_bag'       },
    { name: 'Refunds',        href: '/admin/refunds.html',         icon: 'currency_exchange'  },
    { name: 'Payouts & Payments', href: '/admin/payouts.html',    icon: 'payments'           },
    { name: 'Categories',     href: '/admin/categories.html',      icon: 'category'           },
    { name: 'Reports',        href: '/admin/reports.html',         icon: 'flag'               },
    { name: 'Audit Logs',     href: '/admin/audit-logs.html',      icon: 'history_edu'        },
  ];

  function renderSidebar() {
    const aside = document.querySelector('aside[data-sidebar="admin"]') || document.querySelector('aside');
    if (!aside) return;

    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;
    const isSpecialShopsTab = currentSearch.includes('tab=special-shops') || currentSearch.includes('tab=specials');

    const navHtml = NAV_ITEMS.map(item => {
      const cleanPath = currentPath.replace(/\.html$/, '').replace(/\/$/, '');
      const [itemPath, itemQuery] = item.href.split('?');
      const cleanItemPath = itemPath.replace(/\.html$/, '');

      let isActive = false;
      if (itemQuery && (itemQuery.includes('tab=special-shops') || itemQuery.includes('tab=specials'))) {
        isActive = (cleanPath === '/admin/sellers' || currentPath === '/admin/sellers.html') && isSpecialShopsTab;
      } else if (cleanItemPath === '/admin/sellers') {
        isActive = (cleanPath === '/admin/sellers' || currentPath === '/admin/sellers.html') && !isSpecialShopsTab;
      } else {
        isActive = currentPath === item.href ||
          cleanPath === cleanItemPath ||
          (cleanItemPath === '/admin/dashboard' && (cleanPath === '/admin' || cleanPath === '/admin/index' || cleanPath === ''));
      }

      return `
        <a href="${item.href}"
           class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                  ${isActive
                    ? 'bg-pine text-latte'
                    : 'text-charcoal hover:bg-pine/8 hover:text-pine'}"
           aria-current="${isActive ? 'page' : ''}">
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">${item.icon}</span>
          <span>${item.name}</span>
        </a>
      `;
    }).join('');

    aside.className = `
      flex flex-col h-screen fixed left-0 top-0 z-40
      w-60 bg-latte border-r border-pine/10
      py-8 px-4
    `.trim().replace(/\s+/g, ' ');

    aside.innerHTML = `
      <!-- Brand -->
      <div class="px-2 mb-8">
        <h1 class="font-display text-2xl italic text-pine leading-tight">Tohfa</h1>
        <p class="text-[10px] text-charcoal/50 tracking-widest uppercase mt-0.5 font-mono">Admin Console</p>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 space-y-0.5 overflow-y-auto" aria-label="Admin navigation">
        ${navHtml}
      </nav>

      <!-- Logout -->
      <div class="mt-6 pt-5 border-t border-pine/10">
        <button
          onclick="adminLogout()"
          class="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-error hover:bg-error/8 transition-colors">
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">logout</span>
          <span>Logout</span>
        </button>
      </div>
    `;

    const header = document.querySelector('header');
    const titleEl = header && header.querySelector('h2');
    if (header && titleEl && !document.getElementById('admin-menu-btn')) {
      const btn = document.createElement('button');
      btn.id = 'admin-menu-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Open menu');
      btn.className = 'admin-mobile-only';
      btn.style.cssText = 'align-items:center;justify-content:center;padding:6px;background:none;border:0;cursor:pointer;color:#14381F;';
      btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:26px">menu</span>';

      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
      titleEl.parentNode.insertBefore(wrap, titleEl);
      wrap.appendChild(btn);
      wrap.appendChild(titleEl);

      const backdrop = document.createElement('div');
      backdrop.id = 'admin-backdrop';
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:45;display:none;';
      document.body.appendChild(backdrop);
      aside.style.zIndex = '50';

      const setOpen = (open) => {
        aside.classList.toggle('active', open);
        backdrop.style.display = open ? 'block' : 'none';
      };
      btn.addEventListener('click', () => setOpen(!aside.classList.contains('active')));
      backdrop.addEventListener('click', () => setOpen(false));
      aside.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    }

    if (!document.getElementById('admin-bottom-bar')) {
      const items = [
        ['Dashboard', '/admin/dashboard.html', 'dashboard'],
        ['Sellers',   '/admin/sellers.html',   'storefront'],
        ['Products',  '/admin/products.html',  'inventory_2'],
        ['Orders',    '/admin/orders.html',    'receipt_long'],
        ['Payouts', '/admin/payouts.html', 'payments'],
      ];
      const p = window.location.pathname.replace(/\.html$/, '');
      const bar = document.createElement('nav');
      bar.id = 'admin-bottom-bar';
      bar.className = 'admin-mobile-only';
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:64px;z-index:40;background:#FFF8E7;border-top:1px solid rgba(20,56,31,.15);justify-content:space-around;align-items:center;';
      bar.innerHTML = items.map(([n, h, i]) => {
        const on = p === h.replace(/\.html$/, '');
        return `<a href="${h}" style="display:flex;flex-direction:column;align-items:center;font-size:10px;text-decoration:none;color:${on ? '#14381F' : 'rgba(0,0,0,.55)'};font-weight:${on ? 700 : 500};">
          <span class="material-symbols-outlined" style="font-size:24px">${i}</span>${n}</a>`;
      }).join('');
      document.body.appendChild(bar);
    }
  }

  // Expose admin logout globally
  window.adminLogout = function () {
    sessionStorage.removeItem('tohfa_admin_token');
    sessionStorage.removeItem('tohfa_admin_refresh_token');
    window.location.replace('/admin/login.html');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderSidebar);
  } else {
    renderSidebar();
  }
})();
