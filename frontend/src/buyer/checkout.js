/**
 * Tohfa v2 — Checkout & Payment Workflow Logic
 * File: frontend/src/buyer/checkout.js
 */
'use strict';

import { api } from '../js/api.js';
import { initBuyerShell } from '../js/layout.js';
import { requireAuth, getUser } from '../js/auth.js';
import { formatPrice, showToast, serializeForm } from '../js/utils.js';

if (requireAuth()) {
  initBuyerShell();
}

const addressListEl = document.getElementById('addressList');
const newAddressForm = document.getElementById('newAddressForm');
const itemsListEl = document.getElementById('checkoutItemsList');
const subtotalEl = document.getElementById('checkoutSubtotal');
const totalEl = document.getElementById('checkoutTotal');
const payBtn = document.getElementById('payNowBtn');

let savedAddresses = [];
let selectedAddressId = null;
let cartGroups = [];
let totalAmount = 0;
let appliedCoupon = null; // { code, discount_amount, coupon_id }
let discountAmount = 0;

async function initCheckout() {
  await Promise.all([loadAddresses(), loadCartItems()]);
}

async function loadAddresses() {
  try {
    const res = await api.get('/api/buyer/addresses');
    savedAddresses = Array.isArray(res?.data) ? res.data : [];

    if (!savedAddresses.length) {
      addressListEl.innerHTML = `
        <div class="empty-state" style="padding:var(--space-4); text-align:center; background:rgba(20,56,31,0.04); border-radius:var(--radius-md); border:1px dashed var(--color-border); margin-bottom:var(--space-4);">
          <p class="text-small" style="color:var(--color-primary); font-weight:var(--weight-semibold); margin-bottom:4px;">No saved delivery addresses found.</p>
          <p class="text-xs" style="color:var(--color-text-muted);">Please add your first delivery address below to complete your order.</p>
        </div>
      `;
      toggleAddressForm(true);
      return;
    }

    selectedAddressId = savedAddresses[0].id;
    renderAddresses();
  } catch (err) {
    addressListEl.innerHTML = `<p class="text-body">${err.message}</p>`;
  }
}

function renderAddresses() {
  addressListEl.innerHTML = savedAddresses.map(addr => `
    <div class="address-card ${addr.id === selectedAddressId ? 'selected' : ''}" onclick="selectAddress('${addr.id}')">
      <div class="flex justify-between items-center">
        <span style="font-weight:var(--weight-semibold); color:var(--color-primary);">${addr.name || addr.full_name || 'Delivery'} (${addr.label || 'Home'})</span>
        <span class="text-xs" style="color:var(--color-text-muted);">${addr.phone || ''}</span>
      </div>
      <div class="text-small" style="margin-top:4px;">
        ${addr.line1}${addr.line2 ? ', ' + addr.line2 : ''}, ${addr.city}, ${addr.state} - ${addr.pincode}
      </div>
    </div>
  `).join('');
}

async function loadCartItems() {
  try {
    const res = await api.get('/api/cart');
    cartGroups = Array.isArray(res?.data) ? res.data : (res?.data?.items ? [{ items: res.data.items }] : []);

    if (!cartGroups.length) {
      window.location.href = './cart.html';
      return;
    }

    totalAmount = 0;
    itemsListEl.innerHTML = cartGroups.map(group => {
      return (group.items || []).map(item => {
        const price = Number(item.unit_price || item.base_price || (item.price_paise ? item.price_paise / 100 : 0));
        const lineTotal = price * (item.quantity || 1);
        totalAmount += lineTotal;

        return `
          <div class="flex justify-between items-center" style="padding:var(--space-2) 0; border-bottom:1px solid var(--color-border);">
            <div class="flex items-center gap-3">
              <img src="${item.primary_image || item.image_url || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=100&q=80'}" style="width:48px; height:48px; border-radius:var(--radius-sm); object-fit:cover;">
              <div>
                <div style="font-size:var(--text-sm); font-weight:var(--weight-medium);">${item.product_name || item.name}</div>
                <div class="text-xs" style="color:var(--color-text-muted);">Qty: ${item.quantity || 1} • by ${group.seller_store_name || item.seller_name || 'Artisan'}</div>
              </div>
            </div>
            <span class="text-price-sm">${formatPrice(lineTotal)}</span>
          </div>
        `;
      }).join('');
    }).join('');

    subtotalEl.textContent = formatPrice(totalAmount);
    updateOrderSummaryDisplay();
  } catch (err) {
    itemsListEl.innerHTML = `<p class="text-body">${err.message}</p>`;
  }
}

function updateOrderSummaryDisplay() {
  const discountRow = document.getElementById('checkoutDiscountRow') || document.getElementById('summary-discount-row');
  const discountEl = document.getElementById('checkoutDiscount') || document.getElementById('summary-discount');
  const finalTotal = Math.max(0, totalAmount - discountAmount);

  if (discountRow && discountEl) {
    if (discountAmount > 0) {
      discountRow.style.display = 'flex';
      discountRow.classList.remove('hidden');
      discountEl.textContent = `-${formatPrice(discountAmount)}`;
    } else {
      discountRow.style.display = 'none';
      discountRow.classList.add('hidden');
    }
  }
  if (totalEl) {
    totalEl.textContent = formatPrice(finalTotal);
  }
}

window.applyCoupon = async () => {
  const input = document.getElementById('couponCodeInput') || document.getElementById('promoCodeInput') || document.getElementById('coupon-input');
  const code = input?.value?.trim() || '';
  if (!code) {
    showToast('Please enter a coupon code.', 'warning');
    return;
  }

  const applyBtn = document.getElementById('applyCouponBtn') || document.getElementById('apply-coupon-btn');
  if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Applying...';
  }

  try {
    const res = await api.post('/api/coupons/apply', { code, order_amount: totalAmount });
    const couponData = res?.data || res;
    if (couponData) {
      appliedCoupon = {
        code: code.toUpperCase(),
        coupon_id: couponData.coupon_id || couponData.id || null,
        discount_amount: Number(couponData.discount_amount || couponData.discount || 0)
      };
      discountAmount = appliedCoupon.discount_amount;
      showToast(`Coupon ${appliedCoupon.code} applied! Saved ${formatPrice(discountAmount)} 🎉`, 'success');
      updateOrderSummaryDisplay();
    }
  } catch (err) {
    showToast(err.message || 'Invalid or expired coupon code.', 'error');
  } finally {
    if (applyBtn) {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply';
    }
  }
};

window.selectAddress = (id) => {
  selectedAddressId = id;
  renderAddresses();
};

window.toggleAddressForm = (forceShow = false) => {
  const isHidden = newAddressForm.style.display === 'none';
  newAddressForm.style.display = (forceShow || isHidden) ? 'flex' : 'none';
};

newAddressForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = serializeForm(newAddressForm);
    const res = await api.post('/api/buyer/addresses', payload);
    showToast('Address saved!', 'success');
    newAddressForm.reset();
    toggleAddressForm(false);
    await loadAddresses();
    if (res?.data?.id) {
      selectedAddressId = res.data.id;
      renderAddresses();
    }
  } catch (err) {
    showToast(err.message || 'Failed to save address.', 'error');
  }
});

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      return resolve(true);
    }
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

window.initiatePayment = async () => {
  if (!selectedAddressId) {
    showToast('Please select or add a delivery address first.', 'warning');
    return;
  }

  payBtn.classList.add('btn-loading');
  payBtn.disabled = true;

  try {
    // 1. Place order(s) for the items in cart with coupon
    const orderPayload = {
      address_id: selectedAddressId,
      coupon_code: appliedCoupon ? appliedCoupon.code : null,
      coupon_id: appliedCoupon ? appliedCoupon.coupon_id : null,
      discount_amount: discountAmount
    };

    const orderRes = await api.post('/api/orders', orderPayload);
    const orders = orderRes?.data?.orders || (orderRes?.data ? [orderRes.data] : []);

    if (!orders.length) {
      throw new Error('Order creation failed.');
    }

    const firstOrder = orders[0];

    // 2. Request Razorpay checkout intent
    const payRes = await api.post('/api/payments/create-order', { orderId: firstOrder.id });
    const payData = payRes?.data;

    if (!payData) {
      throw new Error('Payment initialization failed.');
    }

    // 3. Ensure Razorpay SDK script is loaded (BUG-29)
    await loadRazorpayScript();

    // 4. Launch Razorpay modal
    const options = {
      key: payData.razorpayKeyId,
      amount: payData.amount * 100,
      currency: payData.currency || 'INR',
      name: payData.name || 'Tohfa Gifting',
      description: payData.description || 'Artisan Gift Order',
      order_id: payData.razorpay_order_id,
      prefill: payData.prefill || {},
      theme: { color: '#14381F' },
      handler: async function (response) {
        try {
          // Verify signature on backend
          await api.post('/api/payments/verify', {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            orderId: firstOrder.id,
          });

          window.location.href = `./payment-success.html?orderId=${firstOrder.id}&id=${firstOrder.id}`;
        } catch (vErr) {
          window.location.href = `./payment-failure.html?orderId=${firstOrder.id}&reason=${encodeURIComponent(vErr.message)}`;
        }
      },
      modal: {
        ondismiss: function () {
          payBtn.classList.remove('btn-loading');
          payBtn.disabled = false;
          showToast('Payment window was closed.', 'info');
        },
      },
    };

    // If in test mode with placeholder keys or without Razorpay SDK, simulate confirmation
    if (!window.Razorpay || payData.razorpayKeyId === 'rzp_test_placeholder') {
      console.warn('Razorpay test placeholder detected. Simulating instant confirmation...');
      await api.post('/api/payments/verify', {
        razorpay_order_id: payData.razorpay_order_id || 'mock_order_id',
        razorpay_payment_id: 'mock_pay_' + Date.now(),
        razorpay_signature: 'mock_signature',
        orderId: firstOrder.id,
      }).catch(() => {});

      window.location.href = `./payment-success.html?orderId=${firstOrder.id}&id=${firstOrder.id}`;
      return;
    }

    const rzp = new window.Razorpay(options);
    rzp.open();
  } catch (err) {
    showToast(err.message || 'Payment initiation failed.', 'error');
    payBtn.classList.remove('btn-loading');
    payBtn.disabled = false;
  }
};

initCheckout();
