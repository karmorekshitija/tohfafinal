/**
 * File: frontend/src/buyer/payment-success.js
 * U-02 fix: Clear cart after successful payment.
 */
'use strict';
import { api } from '../js/api.js';

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

// U-02 fix: Clear the cart so items don't linger after a successful payment
api.delete('/api/cart').catch(() => {
  // Non-critical — cart will sync on next visit
});
