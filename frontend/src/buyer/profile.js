/**
 * Tohfa v2 — Buyer Profile & Activity Hub Logic
 * File: frontend/src/buyer/profile.js
 */
'use strict';

import { api } from '../js/api.js';
import { initBuyerShell } from '../js/layout.js';
import { requireAuth, getUser } from '../js/auth.js';
import { formatPrice, formatDate, showToast, statusClass, statusLabel } from '../js/utils.js';

if (requireAuth()) {
  initBuyerShell({ activeTab: 'profile' });
}

const tabContent = document.getElementById('tabContent');
let currentTab = 'orders';

async function initProfile() {
  const user = getUser();
  if (user) {
    document.getElementById('userName').textContent = user.name || 'Member';
    document.getElementById('userEmail').textContent = user.email || '';
    if (user.profile_photo_url) {
      document.getElementById('profilePhotoImg').src = user.profile_photo_url;
    }
  }

  // Check URL query for default tab
  const urlTab = new URLSearchParams(window.location.search).get('tab');
  if (urlTab) {
    const targetBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(urlTab));
    if (targetBtn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      targetBtn.classList.add('active');
      currentTab = urlTab;
    }
  }

  loadTab(currentTab);
}

window.switchTab = (tabName, btn) => {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentTab = tabName;
  loadTab(tabName);
};

async function loadTab(tab) {
  tabContent.innerHTML = `<div class="skeleton skeleton--card" style="height:160px;"></div>`;

  switch (tab) {
    case 'orders':
      return renderOrdersTab();
    case 'addresses':
      return renderAddressesTab();
    case 'occasions':
      return renderOccasionsTab();
    case 'customizations':
      return renderCustomizationsTab();
    case 'wishlist':
      return renderWishlistTab();
    case 'support':
      return renderSupportTab();
    case 'studio':
      return renderStudioTab();
  }
}

// Tab 1: Orders
async function renderOrdersTab() {
  try {
    const res = await api.get('/api/orders');
    const orders = Array.isArray(res?.data) ? res.data : [];

    if (!orders.length) {
      tabContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">📦</div>
          <h3 class="empty-state__title">No orders yet</h3>
          <p class="empty-state__body">You haven't placed any gift orders. Discover authentic handmade artisan collections today!</p>
          <a href="./home.html" class="btn btn-primary btn-sm" style="margin-top:var(--space-3);">Explore Gifts</a>
        </div>
      `;
      return;
    }

    tabContent.innerHTML = `
      <div class="card" style="padding:var(--space-4);">
        <table class="data-table" style="width:100%;">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Date</th>
              <th>Artisan Seller</th>
              <th>Total Amount</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td class="text-id">${String(o.id).slice(0, 8).toUpperCase()}</td>
                <td>${formatDate(o.created_at)}</td>
                <td>${o.seller_store_name || o.seller_name || 'Artisan Seller'}</td>
                <td class="text-price-sm">${formatPrice(o.total_amount)}</td>
                <td><span class="badge ${statusClass(o.status)}">${statusLabel(o.status)}</span></td>
                <td><a href="./order-detail.html?id=${o.id}" class="btn btn-xs btn-secondary">View Details →</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    tabContent.innerHTML = `<p class="text-body">${err.message}</p>`;
  }
}

// Tab 2: Addresses
async function renderAddressesTab() {
  try {
    const res = await api.get('/api/buyer/addresses');
    const addresses = Array.isArray(res?.data) ? res.data : [];

    tabContent.innerHTML = `
      <div class="flex justify-between items-center" style="margin-bottom:var(--space-4);">
        <h3 class="text-heading-2">Saved Delivery Locations</h3>
        <a href="./checkout.html" class="btn btn-sm btn-primary">+ Add New Address</a>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:var(--space-4);">
        ${addresses.map(a => `
          <div class="card" style="padding:var(--space-4);">
            <div class="flex justify-between items-center" style="margin-bottom:var(--space-2);">
              <span class="badge badge-accent">${a.label || 'Home'}</span>
              <button onclick="deleteAddress('${a.id}')" class="text-xs" style="color:var(--color-error);">Delete</button>
            </div>
            <div style="font-weight:var(--weight-semibold); color:var(--color-primary);">${a.name}</div>
            <div class="text-small" style="color:var(--color-text-muted);">${a.phone}</div>
            <div class="text-small" style="margin-top:var(--space-2);">${a.line1}, ${a.city}, ${a.state} - ${a.pincode}</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    tabContent.innerHTML = `<p class="text-body">${err.message}</p>`;
  }
}

// Tab 3: Occasions & WhatsApp Reminders
async function renderOccasionsTab() {
  try {
    const res = await api.get('/api/occasions');
    const list = Array.isArray(res?.data) ? res.data : [];

    tabContent.innerHTML = `
      <div class="flex justify-between items-center" style="margin-bottom:var(--space-4);">
        <div>
          <h3 class="text-heading-2">Occasion Calendar & WhatsApp Alerts 📅</h3>
          <p class="text-small" style="color:var(--color-text-muted);">Tohfa sends automated WhatsApp reminders at 1 month, 2 weeks, and 1 week before every saved date.</p>
        </div>
        <a href="./occasions.html" class="btn btn-sm btn-primary">+ Add Occasion</a>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:var(--space-4);">
        ${list.map(occ => `
          <div class="card" style="padding:var(--space-4);">
            <div class="flex justify-between items-center">
              <span style="font-size:24px;">🎁</span>
              <span class="badge badge-primary">${formatDate(occ.occasion_date)}</span>
            </div>
            <h4 style="font-family:var(--font-display); font-size:var(--text-md); color:var(--color-primary); margin-top:var(--space-2);">${occ.label}</h4>
            <p class="text-small" style="color:var(--color-text-muted);">For ${occ.person_name || 'Loved One'}</p>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    tabContent.innerHTML = `<p class="text-body">${err.message}</p>`;
  }
}

// Tab 4: Customizations (Open customization quote tracker)
async function renderCustomizationsTab() {
  try {
    const res = await api.get('/api/customization/buyer');
    const list = Array.isArray(res?.data) ? res.data : [];

    if (!list.length) {
      tabContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">🎨</div>
          <h3 class="empty-state__title">No bespoke requests</h3>
          <p class="empty-state__body">When you request custom engravings or tailored designs on customizable items, quotes and proofs appear here.</p>
        </div>
      `;
      return;
    }

    tabContent.innerHTML = `
      <div class="flex flex-col gap-4">
        ${list.map(req => `
          <div class="card flex justify-between items-center" style="padding:var(--space-4);">
            <div>
              <span class="badge ${statusClass(req.status)}">${statusLabel(req.status)}</span>
              <h4 style="font-family:var(--font-display); font-size:var(--text-md); color:var(--color-primary); margin-top:var(--space-1);">${req.product_name || 'Custom Artisan Request'}</h4>
              <p class="text-small" style="color:var(--color-text-muted);">By ${req.store_name || 'Artisan Seller'}</p>
              ${req.quote_amount ? `<div class="text-price-sm" style="margin-top:4px;">Quote: ${formatPrice(req.quote_amount)} (${req.quote_turnaround || 'Standard'})</div>` : ''}
            </div>
            ${req.status === 'quoted' ? `<button class="btn btn-sm btn-primary" onclick="payCustomQuote('${req.id}')">Accept & Pay Quote →</button>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    tabContent.innerHTML = `<p class="text-body">${err.message}</p>`;
  }
}

// Tab 5: Wishlist
async function renderWishlistTab() {
  try {
    const res = await api.get('/api/wishlist');
    const items = Array.isArray(res?.data) ? res.data : [];

    if (!items.length) {
      tabContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">❤️</div>
          <h3 class="empty-state__title">Your wishlist is empty</h3>
          <p class="empty-state__body">Tap the heart icon on any handcrafted product to save it here for future gifting.</p>
        </div>
      `;
      return;
    }

    tabContent.innerHTML = `
      <div class="product-grid">
        ${items.map(item => `
          <div class="product-card" onclick="window.location.href='./product.html?id=${item.product_id}'">
            <div class="product-card__image-wrap">
              <img src="${item.primary_image || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&q=80'}" class="product-card__image">
            </div>
            <div class="product-card__body">
              <h3 class="product-card__name">${item.name}</h3>
              <div class="product-card__footer">
                <span class="text-price">${formatPrice(item.base_price)}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    tabContent.innerHTML = `<p class="text-body">${err.message}</p>`;
  }
}


// Tab 7: Support
function renderSupportTab() {
  tabContent.innerHTML = `
    <div class="card" style="padding:var(--space-6); max-width:600px;">
      <h3 style="font-family:var(--font-display); font-size:var(--text-lg); color:var(--color-primary); margin-bottom:var(--space-2);">Need help with an artisan order?</h3>
      <p class="text-body" style="margin-bottom:var(--space-4);">Our support team is happy to assist with delivery questions, custom designs, or feedback.</p>
      <div class="flex flex-col gap-3">
        <a href="mailto:support@thetohfa.in" class="btn btn-secondary btn-full">Email Support: support@thetohfa.in</a>
        <button onclick="openTanyaModal()" class="btn btn-primary btn-full">Ask Tanya — AI Gift Guide 🎁</button>
      </div>
    </div>
  `;
}

// Tab 8: Join Studio
function renderStudioTab() {
  const user = getUser();
  if (user?.role === 'seller') {
    tabContent.innerHTML = `
      <div class="card" style="padding:var(--space-6); text-align:center;">
        <h3 style="font-family:var(--font-display); font-size:var(--text-xl); color:var(--color-primary); margin-bottom:var(--space-2);">You are a Registered Tohfa Artisan! 🎨</h3>
        <p class="text-body" style="margin-bottom:var(--space-6);">Manage your orders, capacity, and catalog listings directly in Seller Studio.</p>
        <a href="/seller/dashboard.html" class="btn btn-primary">Open Seller Studio →</a>
      </div>
    `;
  } else {
    tabContent.innerHTML = `
      <div class="card" style="padding:var(--space-6); text-align:center;">
        <h3 style="font-family:var(--font-display); font-size:var(--text-xl); color:var(--color-primary); margin-bottom:var(--space-2);">Sell Your Handcrafted Gifts on Tohfa 🌟</h3>
        <p class="text-body" style="margin-bottom:var(--space-6);">Join India's curated marketplace for independent handmade makers discovered on Instagram.</p>
        <a href="/auth/signup-seller.html" class="btn btn-primary">Apply to Join Tohfa Studio</a>
      </div>
    `;
  }
}

window.deleteAddress = async (id) => {
  try {
    await api.delete(`/api/buyer/addresses/${id}`);
    showToast('Address removed.', 'info');
    renderAddressesTab();
  } catch (err) {
    showToast(err.message || 'Could not delete.', 'error');
  }
};

window.payCustomQuote = async (requestId) => {
  try {
    const res = await api.post(`/api/customization/request/${requestId}/pay`);
    showToast('Redirecting to checkout for custom quote...', 'success');
  } catch (err) {
    showToast(err.message || 'Payment setup failed.', 'error');
  }
};

initProfile();
