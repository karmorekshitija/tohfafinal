/**
 * File: frontend/src/buyer/payment-success.js
 */
'use strict';
const params = new URLSearchParams(window.location.search);
const orderId = params.get('orderId') || params.get('order_id') || params.get('id') || 'TOH-' + Math.floor(10000 + Math.random() * 90000);
const orderIdEl = document.getElementById('orderIdDisplay');
if (orderIdEl) {
  orderIdEl.textContent = '#' + orderId;
}
const trackBtn = document.getElementById('trackOrderBtn');
if (trackBtn) {
  trackBtn.href = `./orders.html?highlight=${orderId}`;
}
