/**
 * Tohfa v2 — Admin Panel Layout Shell
 * File: frontend/src/js/adminLayout.js
 * Role: Mounts the Admin Sidebar navigation with security guards.
 */
'use strict';

import { getUser, clearAuth } from './auth.js';

export function initAdminShell({ activeTab = 'dashboard' } = {}) {
  const sidebar = document.getElementById('adminSidebar') || document.querySelector('aside.admin-sidebar');
  if (!sidebar) return;

  const user = getUser();

  sidebar.className = 'admin-sidebar';
  sidebar.innerHTML = `
    <div style="padding-bottom:var(--space-6); border-bottom:1px solid rgba(255,248,231,0.15); margin-bottom:var(--space-6);">
      <a href="/admin/dashboard.html" class="brand" style="font-family:var(--font-display); font-size:var(--text-xl); font-style:italic; color:var(--color-background); text-decoration:none; display:block;">
        Tohfa<span>.</span> Admin
      </a>
      <div style="font-size:var(--text-xs); color:var(--color-accent); margin-top:2px;">Master Control Plane</div>
    </div>

    <nav class="flex flex-col gap-1" style="flex:1;">
      <a href="./dashboard.html" class="admin-nav-link ${activeTab === 'dashboard' ? 'active' : ''}">📊 Dashboard</a>
      <a href="./special-orders.html" class="admin-nav-link ${activeTab === 'special-orders' ? 'active' : ''}" style="color:var(--color-accent);">📦 Special Orders</a>
      <a href="./sellers.html" class="admin-nav-link ${activeTab === 'sellers' ? 'active' : ''}">🧑‍🎨 Artisans & KYC</a>
      <a href="./products.html" class="admin-nav-link ${activeTab === 'products' ? 'active' : ''}">🎁 All Products</a>
      <a href="./orders.html" class="admin-nav-link ${activeTab === 'orders' ? 'active' : ''}">📦 Orders & Disputes</a>
      <a href="./categories.html" class="admin-nav-link ${activeTab === 'categories' ? 'active' : ''}">🏷️ Categories</a>
      <a href="./reports.html" class="admin-nav-link ${activeTab === 'reports' ? 'active' : ''}">🚨 Reports</a>
      <a href="./audit-logs.html" class="admin-nav-link ${activeTab === 'audit-logs' ? 'active' : ''}">🛡️ Audit Logs</a>
    </nav>

    <div style="padding-top:var(--space-4); border-top:1px solid rgba(255,248,231,0.15);">
      <div class="text-xs" style="color:rgba(255,248,231,0.8); margin-bottom:var(--space-2); font-weight:bold;">${user?.email || 'admin@thetohfa.in'}</div>
      <a href="/admin/login.html" onclick="sessionStorage.clear();" class="text-xs" style="color:var(--color-error); text-decoration:underline;">Sign Out</a>
    </div>
  `;
}
