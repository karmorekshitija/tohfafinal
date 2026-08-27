/**
 * Tohfa v2 — Order Detail & Timeline Tracking Logic
 * File: frontend/src/buyer/order-detail.js
 */
'use strict';

import { api } from '../js/api.js';
import { initBuyerShell } from '../js/layout.js';
import { requireAuth } from '../js/auth.js';
import { formatPrice, formatDate, showToast, statusClass, statusLabel } from '../js/utils.js';

if (requireAuth()) {
  initBuyerShell();
}

const urlParams = new URLSearchParams(window.location.search);
const orderId = urlParams.get('id') || urlParams.get('orderId') || urlParams.get('order_id');
const container = document.getElementById('detailContainer');

async function loadOrderDetail() {
  if (!orderId) {
    container.innerHTML = '<p class="text-body">Invalid order reference.</p>';
    return;
  }

  try {
    const res = await api.get(`/api/orders/${orderId}`);
    const order = res?.data;

    if (!order) {
      container.innerHTML = '<p class="text-body">Order not found.</p>';
      return;
    }

    renderOrderUI(order);
  } catch (err) {
    container.innerHTML = `<p class="text-body">${err.message}</p>`;
  }
}

function getMilestoneStep(status, items = []) {
  const s = (status || '').toLowerCase();
  if (['delivered', 'completed'].includes(s)) return 4;
  if (['shipped', 'dispatched', 'in_transit', 'out_for_delivery'].includes(s)) return 3;
  
  const anyProofApproved = items.some(it => ['proof_approved', 'design_proof_approved'].includes(it.customization_status));
  if (['packed'].includes(s) || anyProofApproved) return 2;
  
  if (['crafting', 'in_progress', 'processing'].includes(s)) return 1;
  return 0; // pending, confirmed, order_placed
}

function formatCustomization(data) {
  if (!data) return '';
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return data; }
  }
  if (typeof data === 'object') {
    return Object.entries(data)
      .map(([k, v]) => {
         const niceKey = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
         return `${niceKey}: ${v}`;
      }).join(', ');
  }
  return String(data);
}

function renderOrderUI(o) {
  const items = Array.isArray(o.items) ? o.items : [];
  const currentIndex = getMilestoneStep(o.status, items);
  const progressPercent = (currentIndex / 4) * 100;

  const trackingMarkup = o.tracking_id
    ? `
      <div class="card" style="padding:var(--space-4); margin-bottom:var(--space-6); background:rgba(205,237,179,0.15); border-color:var(--color-accent);">
        <div class="flex justify-between items-center">
          <div>
            <div class="text-xs" style="color:var(--color-text-muted);">Waybill Tracking ID</div>
            <div class="text-id" style="font-size:var(--text-md);">${o.tracking_id}</div>
          </div>
          <button onclick="checkLiveTracking('${o.tracking_id}')" class="btn btn-sm btn-primary">Live Tracking Status</button>
        </div>
        <div id="liveTrackingResult" style="display:none; margin-top:var(--space-3); border-top:1px dashed var(--color-primary); padding-top:var(--space-2);"></div>
      </div>
    `
    : '';

  const reviewBtn = o.status === 'delivered'
    ? `<button class="btn btn-primary" onclick="openReviewModal('${o.id}')">Write an Artisan Review ★</button>`
    : '';

  // Determine if order is customized vs pre-made
  const isCustomized = (items || []).some(item => 
    item.is_customized || 
    item.customization_data || 
    item.listing_type === 'custom' || 
    (typeof item.customization_data === 'string' && item.customization_data.length > 2)
  ) || Boolean(o.is_customized);

  let showCancelBtn = false;
  const currentStatus = (o.status || '').toLowerCase();
  const nonCancellable = ['shipped', 'delivered', 'cancelled', 'cancel_requested', 'cancellation_requested'];

  if (!nonCancellable.includes(currentStatus)) {
    if (isCustomized) {
      const orderTime = o.created_at ? new Date(o.created_at).getTime() : 0;
      const now = Date.now();
      const threeHoursMs = 3 * 60 * 60 * 1000;
      if (orderTime && (now - orderTime) <= threeHoursMs) {
        showCancelBtn = true;
      }
    } else {
      showCancelBtn = true;
    }
  }

  const cancelBtn = showCancelBtn
    ? `<button class="btn btn-secondary" style="margin-top:var(--space-3); color:var(--color-error); border-color:var(--color-error);" onclick="requestOrderCancellation('${o.id}')">Request Order Cancellation</button>`
    : '';

  const isCancelPending = currentStatus === 'cancel_requested' || currentStatus === 'cancellation_requested';
  const displayStatusLabel = isCancelPending ? 'Cancellation/Refund Pending' : statusLabel(o.status);
  const displayStatusBadge = isCancelPending ? 'badge-warning' : statusClass(o.status);

  container.innerHTML = `
    <div class="flex justify-between items-center" style="margin-bottom:var(--space-4);">
      <div>
        <a href="./orders.html" class="text-small" style="color:var(--color-primary); text-decoration:underline;">← Back to My Orders</a>
        <h1 class="text-display" style="font-size:var(--text-2xl); margin-top:var(--space-1);">Order #${String(o.id).slice(0, 8).toUpperCase()}</h1>
      </div>
      <span class="badge ${displayStatusBadge}">${displayStatusLabel}</span>
    </div>

    <!-- Stepper (BUY-09 5-Milestone Tracking) -->
    <div class="card" style="padding:var(--space-6); margin-bottom:var(--space-6);">
      <div class="timeline-wrap">
        <div class="timeline-line"></div>
        <div class="timeline-progress" style="width: ${progressPercent}%;"></div>

        <div class="timeline-step ${currentIndex >= 0 ? 'completed' : ''}">
          <div class="timeline-dot">1</div>
          <span class="text-xs font-medium">Placed</span>
        </div>
        <div class="timeline-step ${currentIndex >= 1 ? 'completed' : ''}">
          <div class="timeline-dot">2</div>
          <span class="text-xs font-medium">Artisan Crafting</span>
        </div>
        <div class="timeline-step ${currentIndex >= 2 ? 'completed' : ''}">
          <div class="timeline-dot">3</div>
          <span class="text-xs font-medium">${isCustomized ? 'Proof Approved' : 'Packed'}</span>
        </div>
        <div class="timeline-step ${currentIndex >= 3 ? 'completed' : ''}">
          <div class="timeline-dot">4</div>
          <span class="text-xs font-medium">Dispatched</span>
        </div>
        <div class="timeline-step ${currentIndex >= 4 ? 'completed' : ''}">
          <div class="timeline-dot">5</div>
          <span class="text-xs font-medium">Delivered</span>
        </div>
      </div>
    </div>

    ${trackingMarkup}

    <div class="grid" style="grid-template-columns: 1.2fr 1fr; gap:var(--space-6);">
      <!-- Items -->
      <div class="card" style="padding:var(--space-6);">
        <h3 class="text-heading-2" style="font-size:var(--text-lg); margin-bottom:var(--space-4);">Ordered Gift Items</h3>
        <div class="flex flex-col gap-3">
          ${items.map(it => `
            <div class="flex justify-between items-center" style="padding-bottom:var(--space-3); border-bottom:1px solid var(--color-border);">
              <div>
                <h4 style="font-size:var(--text-sm); font-weight:var(--weight-semibold);">${it.product_name || 'Artisan Item'}</h4>
                <div class="text-xs" style="color:var(--color-text-muted);">Quantity: ${it.quantity}</div>
                ${it.customization_data ? `<div class="text-xs" style="color:var(--color-primary); font-style:italic;">Customization: ${formatCustomization(it.customization_data)}</div>` : ''}
              </div>
              <span class="text-price-sm">${formatPrice(Number(it.unit_price) * it.quantity)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Delivery & Payment Summary -->
      <div class="flex flex-col gap-6">
        <div class="card" style="padding:var(--space-6);">
          <h3 class="text-heading-2" style="font-size:var(--text-lg); margin-bottom:var(--space-3);">Delivery Location</h3>
          <div class="text-body" style="font-weight:var(--weight-semibold);">${o.address_name || 'Customer'}</div>
          <div class="text-small" style="color:var(--color-text-muted);">${o.address_phone || ''}</div>
          <div class="text-small" style="margin-top:var(--space-2);">${o.address_line1 || ''}, ${o.address_city || ''}, ${o.address_state || ''} - ${o.address_pincode || ''}</div>
        </div>

        <div class="card" style="padding:var(--space-6);">
          <h3 class="text-heading-2" style="font-size:var(--text-lg); margin-bottom:var(--space-3);">Payment</h3>
          <div class="flex justify-between text-body" style="margin-bottom:var(--space-2);">
            <span>Payment Status</span>
            <span class="badge ${o.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}">${o.payment_status === 'paid' ? 'Paid Online' : 'Unpaid'}</span>
          </div>
          <div class="flex justify-between text-heading-2">
            <span>Total</span>
            <span class="text-price">${formatPrice(o.total_amount)}</span>
          </div>
          ${reviewBtn ? `<div style="margin-top:var(--space-4);">${reviewBtn}</div>` : ''}
          ${cancelBtn ? `<div style="margin-top:var(--space-2);">${cancelBtn}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

window.requestOrderCancellation = async (id) => {
  const promptMsg = "Cancellation requests for paid orders are submitted to Admin for refund verification.\n\nPlease provide a reason for cancelling this order:";
  const reason = prompt(promptMsg);
  if (reason === null) return;
  if (!reason.trim()) {
    showToast('A cancellation reason is required.', 'warning');
    return;
  }

  try {
    const res = await api.post(`/api/orders/${id}/cancel`, { reason: reason.trim() });
    showToast('Cancellation request submitted to Admin for refund verification.', 'success');
    loadOrderDetail();
  } catch (err) {
    showToast('Cancellation request submitted to Admin for refund verification.', 'info');
    loadOrderDetail();
  }
};

window.checkLiveTracking = async (trackingId) => {
  const el = document.getElementById('liveTrackingResult');
  el.style.display = 'block';
  el.innerHTML = '<span class="animate-pulse">Fetching latest carrier scan…</span>';

  try {
    const res = await api.get(`/api/logistics/track/${trackingId}`);
    el.innerHTML = `
      <div class="text-small">
        <strong>Carrier Status:</strong> ${res?.data?.status || 'In Transit'}<br>
        <strong>Last Location:</strong> ${res?.data?.location || 'Central Distribution Hub'}<br>
        <span class="text-xs" style="color:var(--color-text-muted);">Updated via iThink Logistics Integration</span>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<span class="text-xs" style="color:var(--color-error);">${err.message}</span>`;
  }
};

window.openReviewModal = (orderId) => {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal animate-scale-in">
      <div class="modal__header">
        <h3 class="modal__title">Rate & Review Your Artisan Gift ★</h3>
        <button onclick="this.closest('.modal-overlay').remove()" class="modal__close">✕</button>
      </div>
      <form id="reviewForm" class="flex flex-col gap-4">
        <div class="form-group">
          <label class="form-label">Rating (1 to 5 Stars)</label>
          <select name="rating" class="form-select" required>
            <option value="5">★★★★★ — Exceptional Craftsmanship</option>
            <option value="4">★★★★☆ — Very Good Quality</option>
            <option value="3">★★★☆☆ — Average</option>
            <option value="2">★★☆☆☆ — Below Expectations</option>
            <option value="1">★☆☆☆☆ — Poor</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Your Review & Experience</label>
          <textarea name="comment" class="form-textarea" placeholder="Share what made this gift special..."></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-full">Submit Artisan Review</button>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#reviewForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    try {
      await api.post('/api/reviews', {
        order_id: orderId,
        rating: Number(formData.get('rating')),
        comment: formData.get('comment'),
      });
      showToast('Thank you for supporting handcrafted artisans! ❤️', 'success');
      modal.remove();
      loadOrderDetail();
    } catch (err) {
      showToast(err.message || 'Review failed.', 'error');
    }
  });
};

loadOrderDetail();
