/**
 * Tohfa Seller Studio — Orders Filtering & Helpers (BUG-22 fix)
 * File: frontend/src/seller/js/orders.js
 */

export function matchStatus(order, targetStatus) {
  if (!targetStatus || targetStatus === 'all') return true;
  const s = ((order?.fulfillment_status || order?.status || '') + '').toLowerCase().trim();
  const target = (targetStatus + '').toLowerCase().trim();

  if (target === 'crafting' || target === 'in_production') {
    return s === 'crafting' || s === 'in_production' || s === 'processing' || s === 'confirmed';
  }
  if (target === 'packed') {
    return s === 'packed';
  }
  if (target === 'shipped' || target === 'dispatched') {
    return s === 'shipped' || s === 'dispatched';
  }
  if (target === 'delivered') {
    return s === 'delivered';
  }
  if (target === 'cancelled') {
    return s === 'cancelled';
  }
  if (target === 'pending') {
    return s === 'pending';
  }
  return s === target;
}

export function filterOrders(orders, status, search) {
  const list = Array.isArray(orders) ? orders : [];
  let filtered = list;

  if (status && status !== 'all') {
    filtered = filtered.filter(o => matchStatus(o, status));
  }

  if (search) {
    const q = (search + '').toLowerCase().trim();
    filtered = filtered.filter(o => {
      const idStr = String(o.order_id || o.order_ref || o.id || o.internal_id || '').toLowerCase();
      const buyerStr = String(o.buyer_name || '').toLowerCase();
      const itemStr = String(o.item_title || o.product_name || '').toLowerCase();
      return idStr.includes(q) || buyerStr.includes(q) || itemStr.includes(q);
    });
  }

  return filtered;
}

export function getLabelUrl(orderId) {
  return `/api/seller/orders/${orderId}/label`;
}
