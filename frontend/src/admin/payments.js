/**
 * Admin Payments & Seller Subscriptions Management
 * File: frontend/src/admin/payments.js
 */

export async function loadSellerSubscriptions() {
  const container = document.getElementById('seller-plans-container');
  if (!container) return;

  try {
    const token = localStorage.getItem('tohfa_admin_token') ||
                  sessionStorage.getItem('tohfa_admin_token') ||
                  localStorage.getItem('adminToken') ||
                  localStorage.getItem('token');
    const res = await fetch('/api/admin/payments/seller-plans', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const json = await res.json();
    if (!res.ok || !json.success) return;

    const { stats, subscriptions } = json.data;

    container.innerHTML = `
      <div class="card p-6 mt-6 bg-[#FFF8E7] rounded-2xl border border-outline-variant/30 shadow-sm">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <div>
            <h2 class="text-xl font-bold text-primary font-serif italic">Seller Studio Plans &amp; Subscriptions</h2>
            <p class="text-xs text-text-muted mt-0.5">Track active plans, renewal dates, and seller tiers</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
              Active: ${stats.activePlans}
            </span>
            <span class="px-3 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full">
              Expired: ${stats.expiredPlans}
            </span>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-outline-variant/20 bg-surface">
          <table class="min-w-full divide-y divide-outline-variant/20 text-xs font-body">
            <thead class="bg-surface-container-low text-text-muted uppercase font-mono font-bold text-[11px]">
              <tr>
                <th class="px-4 py-3 text-left">Shop / Seller</th>
                <th class="px-4 py-3 text-left">Plan Tier</th>
                <th class="px-4 py-3 text-left">Start Date</th>
                <th class="px-4 py-3 text-left">Expiry Date</th>
                <th class="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/10 bg-surface">
              ${subscriptions.length === 0 ? `
                <tr>
                  <td colspan="5" class="px-4 py-8 text-center text-text-muted font-mono">No seller plan subscriptions found.</td>
                </tr>
              ` : subscriptions.map(sub => `
                <tr class="hover:bg-surface-container-low/40 transition-colors">
                  <td class="px-4 py-3">
                    <div class="font-bold text-primary">${sub.shop_name}</div>
                    <div class="text-[11px] text-text-muted">${sub.seller_name} (${sub.seller_email})</div>
                  </td>
                  <td class="px-4 py-3 font-semibold text-text-default capitalize">${sub.plan_name}</td>
                  <td class="px-4 py-3 text-text-muted font-mono">${new Date(sub.start_date).toLocaleDateString()}</td>
                  <td class="px-4 py-3 text-text-muted font-mono">${new Date(sub.end_date).toLocaleDateString()}</td>
                  <td class="px-4 py-3">
                    <span class="px-2.5 py-1 text-[11px] font-bold rounded-full ${
                      sub.status === 'ACTIVE' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }">
                      ${sub.status}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load seller subscriptions:', err);
  }
}

export function initPaymentsPage() {
  loadSellerSubscriptions();
}
