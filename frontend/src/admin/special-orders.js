/**
 * Tohfa v2 — Special Orders Admin Panel Module
 * File: frontend/src/admin/special-orders.js
 */
import adminApiClient from '/src/utils/adminApiClient.js';
import { isTokenExpired } from '/src/utils/auth.js';

let currentPage = 1;
let allOrders = [];

export function formatAddress(addr) {
  if (!addr) return '<span class="text-gray-400 font-normal">No address provided</span>';
  if (typeof addr === 'string') {
    try { addr = JSON.parse(addr); } catch { return `<div class="text-xs text-gray-700">${addr}</div>`; }
  }
  const line1 = addr.street || addr.address_line1 || addr.line1 || '';
  const line2 = addr.address_line2 || addr.line2 || '';
  const city = addr.city || '';
  const state = addr.state || '';
  const pincode = addr.pincode || addr.zip || addr.postal_code || '';
  const landmark = addr.landmark || '';

  return `
    <div class="text-xs text-gray-800 font-medium">${line1}${line2 ? ', ' + line2 : ''}</div>
    <div class="text-[11px] text-gray-500">${city}${city && state ? ', ' : ''}${state}${pincode ? ' - ' + pincode : ''}</div>
    ${landmark ? `<div class="text-[10px] text-gray-400 italic">Landmark: ${landmark}</div>` : ''}
  `;
}

export function formatCurrency(val) {
  return '₹' + (Number(val) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export async function fetchSpecialOrders() {
  const tbody = document.getElementById('orders-table-body');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="p-8 text-center text-gray-400">
          <span class="material-symbols-outlined text-3xl animate-spin text-[#14381F]">progress_activity</span>
          <p class="text-xs mt-2 font-medium">Loading Tohfa Special orders...</p>
        </td>
      </tr>
    `;
  }

  try {
    const statusFilter = document.getElementById('status-filter')?.value || '';
    let url = `/admin/special-orders`;
    
    let res;
    try {
      res = await adminApiClient.get(url);
    } catch (e) {
      // Fallback to legacy orders query if needed
      let fallbackUrl = `/admin/orders?special_only=true&page=${currentPage}&limit=30`;
      if (statusFilter) fallbackUrl += `&status=${encodeURIComponent(statusFilter)}`;
      res = await adminApiClient.get(fallbackUrl);
    }

    const json = res.data;
    if (json.success && json.data) {
      allOrders = json.data.orders || [];
      if (statusFilter) {
        allOrders = allOrders.filter(o => (o.status || '').toLowerCase() === statusFilter.toLowerCase());
      }
      renderOrders(allOrders);
      updateKPIs(allOrders, json.data.total || allOrders.length);
    } else {
      showTableError(json.message || 'Could not load special orders.');
    }
  } catch (err) {
    console.error('[SpecialOrders] Fetch error:', err);
    showTableError(err?.response?.data?.message || 'Failed to retrieve special orders.');
  }
}

export function renderOrders(orders) {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;

  if (!orders || !orders.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="p-12 text-center text-gray-500">
          <span class="material-symbols-outlined text-4xl text-gray-300 mb-2">shopping_bag</span>
          <p class="text-sm font-bold text-gray-700">No Tohfa Special orders found</p>
          <p class="text-xs text-gray-400 mt-1">Orders placed for admin-managed special shops will appear here.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const orderRef = o.order_number || o.order_ref || `TOHFA-${String(o.id).substring(0, 8).toUpperCase()}`;
    const buyerName = o.buyer_name || o.buyer?.name || 'Guest Customer';
    const buyerPhone = o.buyer_phone || o.buyer?.phone || o.phone || '';
    const buyerEmail = o.buyer_email || o.buyer?.email || '';
    const store = o.shop_name || o.store_name || 'Tohfa Special Store';
    const date = o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'n/a';
    const amount = formatCurrency(o.total_amount || o.amount_paid);
    const status = (o.status || 'pending').toLowerCase();
    const payment = (o.payment_status || 'pending').toLowerCase();

    return `
      <tr class="hover:bg-gray-50/80 cursor-pointer transition-colors" onclick="window.DetailModal && DetailModal.showOrder('${o.id}')">
        <td class="p-4 font-mono font-bold text-[#14381F]">${orderRef}</td>
        <td class="p-4">
          <div class="font-medium text-gray-900">${buyerName}</div>
          ${buyerPhone ? `<div class="text-xs text-gray-500 font-mono">${buyerPhone}</div>` : ''}
          ${buyerEmail ? `<div class="text-[10px] text-gray-400">${buyerEmail}</div>` : ''}
        </td>
        <td class="p-4 max-w-xs">
          ${formatAddress(o.shipping_address)}
        </td>
        <td class="p-4">
          <span class="inline-flex items-center gap-1 font-semibold text-[#14381F]">
            <span class="material-symbols-outlined text-xs text-[#C5A059]">stars</span> ${store}
          </span>
        </td>
        <td class="p-4 text-gray-500 font-mono">${date}</td>
        <td class="p-4 font-mono font-bold text-gray-900">${amount}</td>
        <td class="p-4" onclick="event.stopPropagation()">
          <button onclick="openStatusModal('${o.id}', '${status}', '${(o.special_instructions || o.notes || '').replace(/'/g, "\\'")}')" 
                  class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-transform active:scale-95 hover:opacity-90 flex items-center gap-1 ${
            status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
            status === 'shipped' ? 'bg-blue-100 text-blue-800' :
            status === 'cancelled' ? 'bg-rose-100 text-rose-800' :
            'bg-amber-100 text-amber-800'
          }" title="Click to update status & notes">
            <span>${status}</span>
            <span class="material-symbols-outlined text-[12px]">edit</span>
          </button>
        </td>
        <td class="p-4">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            payment === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            payment === 'refunded' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
            'bg-amber-50 text-amber-700 border border-amber-200'
          }">${payment}</span>
        </td>
        <td class="p-4 text-right" onclick="event.stopPropagation()">
          <div class="flex items-center justify-end gap-2">
            <button onclick="openStatusModal('${o.id}', '${status}', '${(o.special_instructions || o.notes || '').replace(/'/g, "\\'")}')" class="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-[#14381F]/20 text-[#14381F] hover:bg-gray-50 transition-all shadow-xs flex items-center gap-1" title="Update status">
              <span class="material-symbols-outlined text-sm">local_shipping</span> Status
            </button>
            <button onclick="window.DetailModal && DetailModal.showOrder('${o.id}')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#14381F] text-[#FFF8E7] hover:bg-[#14381F]/90 transition-all shadow-sm">
              Details
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

export function updateKPIs(orders, totalCount) {
  const totalEl = document.getElementById('kpi-total-orders');
  if (totalEl) totalEl.textContent = totalCount || orders.length;
  
  const totalRev = orders.reduce((acc, o) => acc + (parseFloat(o.total_amount) || 0), 0);
  const revEl = document.getElementById('kpi-total-revenue');
  if (revEl) revEl.textContent = formatCurrency(totalRev);

  const pending = orders.filter(o => (o.status || '').toLowerCase() === 'pending' || (o.status || '').toLowerCase() === 'processing').length;
  const pendingEl = document.getElementById('kpi-pending-orders');
  if (pendingEl) pendingEl.textContent = pending;

  const delivered = orders.filter(o => (o.status || '').toLowerCase() === 'delivered').length;
  const delEl = document.getElementById('kpi-delivered-orders');
  if (delEl) delEl.textContent = delivered;
}

export function showTableError(message) {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td colspan="9" class="p-10 text-center">
        <span class="material-symbols-outlined text-4xl text-rose-300 mb-2">error_outline</span>
        <p class="text-sm font-semibold text-rose-600 mt-2">${message}</p>
      </td>
    </tr>`;
}

export async function handleStatusUpdateSubmit(orderId, newStatus, remarks = '') {
  if (!orderId || !newStatus) return;

  try {
    const token = sessionStorage.getItem('tohfa_admin_token') || localStorage.getItem('tohfa_admin_token') || localStorage.getItem('token') || '';
    const res = await fetch(`/api/admin/special-orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: newStatus.toUpperCase(), remarks })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      alert(data.message || 'Error updating order status');
      return;
    }

    alert('Order status updated successfully');
    closeStatusModal();
    fetchSpecialOrders();
  } catch (err) {
    console.error('Status update failed:', err);
    alert('Network error while updating status.');
  }
}

export function openStatusModal(orderId, currentStatus = 'pending', currentNotes = '') {
  if (window.DetailModal && typeof window.DetailModal.showStatusModal === 'function') {
    window.DetailModal.showStatusModal(orderId, currentStatus, currentNotes);
    return;
  }
  let modal = document.getElementById('special-status-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'special-status-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs';
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div class="bg-[#FFF8E7] border border-[#14381F]/20 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
      <div class="flex items-center justify-between border-b border-[#14381F]/10 pb-3">
        <h3 class="text-base font-bold text-[#14381F]">Update Special Order Status</h3>
        <button onclick="closeStatusModal()" class="text-gray-400 hover:text-gray-600">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div>
        <label class="block text-xs font-bold text-[#14381F] mb-1">New Status:</label>
        <select id="modal-status-select" class="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs text-gray-800">
          <option value="PENDING" ${currentStatus.toUpperCase() === 'PENDING' ? 'selected' : ''}>Pending</option>
          <option value="CONFIRMED" ${currentStatus.toUpperCase() === 'CONFIRMED' ? 'selected' : ''}>Confirmed</option>
          <option value="PROCESSING" ${currentStatus.toUpperCase() === 'PROCESSING' ? 'selected' : ''}>Processing</option>
          <option value="SHIPPED" ${currentStatus.toUpperCase() === 'SHIPPED' ? 'selected' : ''}>Shipped</option>
          <option value="DELIVERED" ${currentStatus.toUpperCase() === 'DELIVERED' ? 'selected' : ''}>Delivered</option>
          <option value="CANCELLED" ${currentStatus.toUpperCase() === 'CANCELLED' ? 'selected' : ''}>Cancelled</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-[#14381F] mb-1">Remarks / Note:</label>
        <textarea id="modal-status-remarks" rows="3" class="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs text-gray-800" placeholder="Optional notes...">${currentNotes}</textarea>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button onclick="closeStatusModal()" class="px-4 py-2 text-xs font-bold rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
        <button onclick="submitModalStatusUpdate('${orderId}')" class="px-5 py-2 text-xs font-bold rounded-xl bg-[#14381F] text-[#FFF8E7] hover:bg-[#14381F]/90">Update Status</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

export function closeStatusModal() {
  const modal = document.getElementById('special-status-modal');
  if (modal) modal.classList.add('hidden');
  if (window.DetailModal && typeof window.DetailModal.close === 'function') window.DetailModal.close();
}

export function submitModalStatusUpdate(orderId) {
  const sel = document.getElementById('modal-status-select');
  const rem = document.getElementById('modal-status-remarks');
  if (!sel) return;
  handleStatusUpdateSubmit(orderId, sel.value, rem ? rem.value : '');
}

// Global exposure for HTML inline event handlers
if (typeof window !== 'undefined') {
  window.fetchSpecialOrders = fetchSpecialOrders;
  window.loadSpecialOrders = fetchSpecialOrders;
  window.handleStatusUpdateSubmit = handleStatusUpdateSubmit;
  window.openStatusModal = openStatusModal;
  window.closeStatusModal = closeStatusModal;
  window.submitModalStatusUpdate = submitModalStatusUpdate;
  window.formatAddress = formatAddress;
}
