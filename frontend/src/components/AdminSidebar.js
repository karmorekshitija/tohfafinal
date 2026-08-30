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
    { name: 'Artisans & KYC', href: '/admin/sellers.html',         icon: 'group'              },
    { name: 'All Products',   href: '/admin/products.html',        icon: 'inventory_2'        },
    { name: 'Orders',         href: '/admin/orders.html',          icon: 'shopping_bag'       },
    { name: 'Refunds',        href: '/admin/refunds.html',         icon: 'currency_exchange'  },
    { name: 'Categories',     href: '/admin/categories.html',      icon: 'category'           },
    { name: 'Our Story',      href: '/admin/our-story.html',       icon: 'auto_stories'       },
    { name: 'Reports',        href: '/admin/reports.html',         icon: 'flag'               },
    { name: 'Audit Logs',     href: '/admin/audit-logs.html',      icon: 'history_edu'        },
  ];

  function renderSidebar() {
    const aside = document.querySelector('aside[data-sidebar="admin"]') || document.querySelector('aside');
    if (!aside) return;

    const currentPath = window.location.pathname;

    const navHtml = NAV_ITEMS.map(item => {
      const isActive = currentPath === item.href ||
        (item.href === '/admin/dashboard.html' && (currentPath === '/admin/' || currentPath === '/admin/index.html'));

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
