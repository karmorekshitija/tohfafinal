/**
 * Tohfa Seller Studio — Dashboard Utilities & Chart Guards (BUG-20 fix)
 * File: frontend/src/seller/js/dashboard.js
 */

export function renderGuardedChart(canvasId, emptyPlaceholderId, chartConfig, currentInstance) {
  const canvas = document.getElementById(canvasId);
  const emptyPlaceholder = document.getElementById(emptyPlaceholderId);

  if (currentInstance) {
    currentInstance.destroy();
    currentInstance = null;
  }

  if (!canvas) return null;

  const datasets = chartConfig?.data?.datasets || [];
  const labels = chartConfig?.data?.labels || [];

  const hasData = labels.length > 0 && datasets.some(ds => 
    Array.isArray(ds.data) && ds.data.some(val => val !== 0 && val != null)
  );

  if (!hasData) {
    canvas.classList.add('hidden');
    if (emptyPlaceholder) emptyPlaceholder.classList.remove('hidden');
    return null;
  }

  canvas.classList.remove('hidden');
  if (emptyPlaceholder) emptyPlaceholder.classList.add('hidden');

  const ctx = canvas.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return null;

  return new Chart(ctx, chartConfig);
}

export function formatINR(paiseOrRupees, isPaise = true) {
  if (paiseOrRupees == null) return '₹0';
  const rupees = isPaise ? Math.round(paiseOrRupees / 100) : Math.round(paiseOrRupees);
  return '₹' + rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function getStatusBadge(status) {
  const map = {
    pending: { cls: 'bg-amber-100 text-amber-800', label: 'Pending' },
    order_placed: { cls: 'bg-amber-100 text-amber-800', label: 'Pending' },
    processing: { cls: 'bg-blue-100 text-blue-800', label: 'Processing' },
    in_production: { cls: 'bg-blue-100 text-blue-800', label: 'In Production' },
    crafting: { cls: 'bg-blue-100 text-blue-800', label: 'Crafting' },
    packed: { cls: 'bg-purple-100 text-purple-800', label: 'Packed' },
    shipped: { cls: 'bg-indigo-100 text-indigo-800', label: 'Shipped' },
    delivered: { cls: 'bg-emerald-100 text-emerald-800', label: 'Delivered' },
    cancelled: { cls: 'bg-rose-100 text-rose-800', label: 'Cancelled' },
    refunded: { cls: 'bg-stone-100 text-stone-800', label: 'Refunded' }
  };
  const s = map[status] || { cls: 'bg-stone-100 text-stone-800', label: status || 'Unknown' };
  return `<span class="px-2.5 py-1 rounded-full text-[10px] font-mono font-medium ${s.cls}">${s.label}</span>`;
}
