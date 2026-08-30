/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FILE: frontend/src/components/DetailModal.js
 *  LAYER: Frontend — Admin Component
 *  ROLE: Global unified detail modal for Products, Sellers, and Orders.
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  function getAuthToken() {
    return sessionStorage.getItem('tohfa_admin_token') ||
           localStorage.getItem('tohfa_admin_token') ||
           sessionStorage.getItem('token') ||
           localStorage.getItem('token') || '';
  }

  function getHeaders() {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  function formatCurrency(num) {
    const val = Number(num) || 0;
    return '₹' + val.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function ensureContainer() {
    let container = document.getElementById('detail-modal-root');
    if (!container) {
      container = document.createElement('div');
      container.id = 'detail-modal-root';
      container.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm hidden opacity-0 transition-opacity duration-200';
      container.setAttribute('role', 'dialog');
      container.setAttribute('aria-modal', 'true');
      document.body.appendChild(container);

      // Close on backdrop click
      container.addEventListener('click', (e) => {
        if (e.target === container) {
          DetailModal.close();
        }
      });

      // Close on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !container.classList.contains('hidden')) {
          DetailModal.close();
        }
      });
    }
    return container;
  }

  function openModal(htmlContent) {
    const container = ensureContainer();
    container.innerHTML = `
      <div class="relative w-full max-w-4xl max-h-[90vh] bg-[#FFF8E7] rounded-2xl shadow-2xl border border-[#14381F]/15 flex flex-col overflow-hidden transform scale-95 transition-transform duration-200" onclick="event.stopPropagation()">
        ${htmlContent}
      </div>
    `;
    container.classList.remove('hidden');
    // Animate in
    setTimeout(() => {
      container.classList.remove('opacity-0');
      const inner = container.firstElementChild;
      if (inner) {
        inner.classList.remove('scale-95');
        inner.classList.add('scale-100');
      }
    }, 10);
  }

  const DetailModal = {
    close() {
      const container = document.getElementById('detail-modal-root');
      if (container) {
        container.classList.add('opacity-0');
        const inner = container.firstElementChild;
        if (inner) {
          inner.classList.remove('scale-100');
          inner.classList.add('scale-95');
        }
        setTimeout(() => {
          container.classList.add('hidden');
          container.innerHTML = '';
        }, 200);
      }
    },

    // ──────────────────────────────────────────────────────────────────────────
    // 1. PRODUCT DETAIL MODAL
    // ──────────────────────────────────────────────────────────────────────────
    async showProduct(productIdOrData) {
      let product = typeof productIdOrData === 'object' ? productIdOrData : null;
      const productId = typeof productIdOrData === 'object' ? productIdOrData.id : productIdOrData;

      openModal(`
        <div class="p-8 flex items-center justify-center min-h-[300px]">
          <div class="flex flex-col items-center gap-3">
            <span class="material-symbols-outlined text-4xl text-[#14381F] animate-spin">progress_activity</span>
            <p class="text-sm font-medium text-[#14381F]/70">Loading product details...</p>
          </div>
        </div>
      `);

      try {
        if (!product || !product.description) {
          const res = await fetch(`/api/products/${productId}`, { headers: getHeaders() });
          const json = await res.json();
          if (json.success && json.data) {
            product = json.data.product || json.data;
          }
        }

        if (!product) {
          throw new Error('Product not found.');
        }

        const images = Array.isArray(product.product_images) && product.product_images.length
          ? product.product_images.map(img => typeof img === 'string' ? img : img.url)
          : (Array.isArray(product.images) && product.images.length
              ? product.images.map(img => typeof img === 'string' ? img : img.url)
              : [product.primary_image || product.image_url || '/img/placeholder-product.png']);

        const variants = Array.isArray(product.variants) ? product.variants : [];
        const isSponsored = Boolean(product.is_sponsored);
        const status = product.status || 'active';

        const html = `
          <!-- Header -->
          <div class="px-6 py-4 bg-[#14381F] text-[#FFF8E7] flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-2xl text-[#C5A059]">inventory_2</span>
              <div>
                <h2 class="text-lg font-bold font-['Playfair_Display',serif] tracking-wide">${escapeHtml(product.name)}</h2>
                <p class="text-xs text-[#FFF8E7]/70 font-mono">ID: ${escapeHtml(String(product.id))} • Slug: ${escapeHtml(product.slug || 'n/a')}</p>
              </div>
            </div>
            <button onclick="DetailModal.close()" class="p-1.5 rounded-full hover:bg-white/10 text-[#FFF8E7]/80 hover:text-[#FFF8E7] transition-colors" title="Close (Esc)">
              <span class="material-symbols-outlined text-2xl">close</span>
            </button>
          </div>

          <!-- Body Scrollable -->
          <div class="p-6 overflow-y-auto space-y-6 flex-1 text-[#1C1C1C]">
            <!-- Top Grid: Visuals & Core Specs -->
            <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
              <!-- Left: Gallery Preview -->
              <div class="md:col-span-5 space-y-3">
                <div class="aspect-square w-full rounded-xl overflow-hidden bg-white border border-[#14381F]/10 shadow-sm flex items-center justify-center">
                  <img id="detail-product-main-img" src="${images[0] || '/img/placeholder-product.png'}" alt="${escapeHtml(product.name)}" class="w-full h-full object-cover">
                </div>
                ${images.length > 1 ? `
                  <div class="flex gap-2 overflow-x-auto pb-1">
                    ${images.map((url, idx) => `
                      <button onclick="document.getElementById('detail-product-main-img').src = '${escapeHtml(url)}'" class="w-14 h-14 rounded-lg overflow-hidden border-2 border-transparent hover:border-[#14381F] focus:border-[#14381F] flex-shrink-0 bg-white">
                        <img src="${escapeHtml(url)}" class="w-full h-full object-cover">
                      </button>
                    `).join('')}
                  </div>
                ` : ''}
              </div>

              <!-- Right: Attributes -->
              <div class="md:col-span-7 space-y-4">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    status === 'active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                    status === 'inactive' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                    'bg-rose-100 text-rose-800 border border-rose-300'
                  }">${status}</span>
                  
                  <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#14381F]/10 text-[#14381F]">
                    ${escapeHtml(product.category_name || product.category?.name || 'General')}
                  </span>

                  ${isSponsored ? `
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500 text-white shadow-sm flex items-center gap-1">
                      <span class="material-symbols-outlined text-xs">bolt</span> Sponsored
                    </span>
                  ` : ''}
                </div>

                <div class="grid grid-cols-2 gap-3 pt-2">
                  <div class="p-3 bg-white rounded-xl border border-[#14381F]/10">
                    <p class="text-xs text-gray-500 font-medium">Base Price</p>
                    <p class="text-xl font-bold text-[#14381F] font-mono">${formatCurrency(product.base_price || product.price)}</p>
                  </div>
                  <div class="p-3 bg-white rounded-xl border border-[#14381F]/10">
                    <p class="text-xs text-gray-500 font-medium">Stock Quantity</p>
                    <p class="text-xl font-bold text-[#14381F] font-mono">${product.stock_quantity ?? product.stock_qty ?? 0}</p>
                  </div>
                  <div class="p-3 bg-white rounded-xl border border-[#14381F]/10">
                    <p class="text-xs text-gray-500 font-medium">Artisan / Store</p>
                    <p class="text-sm font-bold text-[#14381F] truncate">${escapeHtml(product.store_name || product.seller_name || 'Artisan Studio')}</p>
                  </div>
                  <div class="p-3 bg-white rounded-xl border border-[#14381F]/10">
                    <p class="text-xs text-gray-500 font-medium">Lead Time / Weight</p>
                    <p class="text-sm font-bold text-[#14381F]">${product.preparation_days || 2} days • ${product.weight_grams || 500}g</p>
                  </div>
                </div>

                <!-- Description -->
                <div class="pt-1">
                  <p class="text-xs font-bold text-[#14381F] uppercase tracking-wider mb-1">Description</p>
                  <div class="text-sm text-gray-700 bg-white p-3.5 rounded-xl border border-[#14381F]/10 max-h-32 overflow-y-auto leading-relaxed">
                    ${escapeHtml(product.description || 'No description provided for this listing.')}
                  </div>
                </div>
              </div>
            </div>

            <!-- Variants Table (if any) -->
            ${variants.length ? `
              <div class="space-y-2 pt-2">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-bold text-[#14381F] uppercase tracking-wider flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-base">style</span> Variants (${variants.length})
                  </h3>
                </div>
                <div class="overflow-x-auto bg-white rounded-xl border border-[#14381F]/10">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-[#14381F]/5 text-[#14381F] font-bold border-b border-[#14381F]/10">
                      <tr>
                        <th class="p-3">Variant</th>
                        <th class="p-3">Color / Size</th>
                        <th class="p-3">Price Adj.</th>
                        <th class="p-3">Stock</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                      ${variants.map(v => `
                        <tr>
                          <td class="p-3 font-medium">${escapeHtml(v.variant_name || v.name || 'Standard')}</td>
                          <td class="p-3">
                            <span class="inline-flex items-center gap-1.5">
                              ${v.color_hex ? `<span class="w-3 h-3 rounded-full border border-gray-300" style="background-color:${escapeHtml(v.color_hex)}"></span>` : ''}
                              ${(v.color_name || v.size) ? `${escapeHtml(v.color_name || '')} ${v.size ? `(${escapeHtml(v.size)})` : ''}`.trim() : '<span class="text-gray-400">—</span>'}
                            </span>
                          </td>
                          <td class="p-3 font-mono">${v.additional_price ? `+${formatCurrency(v.additional_price)}` : '₹0'}</td>
                          <td class="p-3 font-mono">${v.stock_qty ?? v.stock ?? 0}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Footer Actions -->
          <div class="px-6 py-4 bg-white border-t border-[#14381F]/10 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <button onclick="DetailModal.toggleSponsor('${escapeHtml(String(product.id))}')" class="px-4 py-2 rounded-xl text-xs font-bold ${isSponsored ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-base">${isSponsored ? 'star_half' : 'star'}</span>
                ${isSponsored ? 'Remove Sponsor' : 'Set as Sponsored'}
              </button>
              
              <button onclick="DetailModal.toggleStatus('${escapeHtml(String(product.id))}', '${status === 'active' ? 'inactive' : 'active'}')" class="px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-base">power_settings_new</span>
                ${status === 'active' ? 'Deactivate Listing' : 'Activate Listing'}
              </button>
            </div>

            <button onclick="DetailModal.close()" class="px-5 py-2 rounded-xl text-xs font-bold bg-[#14381F] text-[#FFF8E7] hover:bg-[#14381F]/90 transition-all shadow-sm">
              Done
            </button>
          </div>
        `;
        openModal(html);
      } catch (err) {
        openModal(`
          <div class="p-8 text-center space-y-4">
            <span class="material-symbols-outlined text-4xl text-rose-600">error</span>
            <p class="text-base font-bold text-rose-900">Failed to load product details</p>
            <p class="text-xs text-gray-600">${escapeHtml(err.message)}</p>
            <button onclick="DetailModal.close()" class="px-4 py-2 rounded-xl text-xs font-bold bg-[#14381F] text-[#FFF8E7]">Close</button>
          </div>
        `);
      }
    },

    // ──────────────────────────────────────────────────────────────────────────
    // 2. SELLER / ARTISAN DETAIL MODAL
    // ──────────────────────────────────────────────────────────────────────────
    async showSeller(sellerIdOrData) {
      let seller = typeof sellerIdOrData === 'object' ? sellerIdOrData : null;
      const sellerId = typeof sellerIdOrData === 'object' ? (sellerIdOrData.user_id || sellerIdOrData.id) : sellerIdOrData;

      openModal(`
        <div class="p-8 flex items-center justify-center min-h-[300px]">
          <div class="flex flex-col items-center gap-3">
            <span class="material-symbols-outlined text-4xl text-[#14381F] animate-spin">progress_activity</span>
            <p class="text-sm font-medium text-[#14381F]/70">Loading artisan profile & KYC...</p>
          </div>
        </div>
      `);

      try {
        if (!seller || !seller.bank_details) {
          const res = await fetch(`/api/admin/sellers/${sellerId}`, { headers: getHeaders() });
          const json = await res.json();
          if (json.success && json.data) {
            seller = json.data.seller || json.data;
          }
        }

        if (!seller) {
          throw new Error('Artisan profile not found.');
        }

        let pickup = {};
        if (seller.pickup_address) {
          try {
            pickup = typeof seller.pickup_address === 'string' ? JSON.parse(seller.pickup_address) : seller.pickup_address;
          } catch {
            pickup = {};
          }
        }

        let bank = {};
        if (seller.bank_details) {
          try {
            bank = typeof seller.bank_details === 'string' ? JSON.parse(seller.bank_details) : seller.bank_details;
          } catch {
            bank = {};
          }
        }

        const isAdminManaged = Boolean(seller.is_admin_managed);
        const verificationStatus = seller.verification_status || (seller.is_approved ? 'verified' : 'pending');

        const html = `
          <!-- Header -->
          <div class="px-6 py-4 bg-[#14381F] text-[#FFF8E7] flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-2xl text-[#C5A059]">storefront</span>
              <div>
                <h2 class="text-lg font-bold font-['Playfair_Display',serif] tracking-wide">${escapeHtml(seller.store_name || seller.name || 'Artisan Store')}</h2>
                <p class="text-xs text-[#FFF8E7]/70 font-mono">User ID: ${escapeHtml(String(seller.user_id || seller.id))} • Owner: ${escapeHtml(seller.name || 'n/a')}</p>
              </div>
            </div>
            <button onclick="DetailModal.close()" class="p-1.5 rounded-full hover:bg-white/10 text-[#FFF8E7]/80 hover:text-[#FFF8E7] transition-colors" title="Close (Esc)">
              <span class="material-symbols-outlined text-2xl">close</span>
            </button>
          </div>

          <!-- Body Scrollable -->
          <div class="p-6 overflow-y-auto space-y-6 flex-1 text-[#1C1C1C]">
            <!-- Status Badges Bar -->
            <div class="flex flex-wrap items-center justify-between gap-2 p-3.5 bg-white rounded-xl border border-[#14381F]/10">
              <div class="flex items-center gap-2">
                <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  verificationStatus === 'verified' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                  verificationStatus === 'suspended' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                  verificationStatus === 'banned' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                  'bg-blue-100 text-blue-800 border border-blue-300'
                }">
                  KYC: ${verificationStatus}
                </span>

                ${isAdminManaged ? `
                  <span class="px-3 py-1 rounded-full text-xs font-bold bg-[#14381F] text-[#FFF8E7] border border-[#C5A059]/40 shadow-sm flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs text-[#C5A059]">stars</span> Tohfa Special (Admin Owned)
                  </span>
                ` : `
                  <span class="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                    Independent Marketplace Artisan
                  </span>
                `}
              </div>

              <div class="text-xs text-gray-500 font-mono">
                Joined: ${seller.created_at ? new Date(seller.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'n/a'}
              </div>
            </div>

            <!-- Contact & Bio -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div class="p-3 bg-white rounded-xl border border-[#14381F]/10">
                <p class="text-xs text-gray-500 font-medium">Email Address</p>
                <p class="text-sm font-bold text-[#14381F] truncate">${escapeHtml(seller.email || 'n/a')}</p>
              </div>
              <div class="p-3 bg-white rounded-xl border border-[#14381F]/10">
                <p class="text-xs text-gray-500 font-medium">Phone Number</p>
                <p class="text-sm font-bold text-[#14381F] font-mono">${escapeHtml(seller.phone || 'n/a')}</p>
              </div>
              <div class="p-3 bg-white rounded-xl border border-[#14381F]/10">
                <p class="text-xs text-gray-500 font-medium">Commission Rate</p>
                <p class="text-sm font-bold text-[#14381F] font-mono">${seller.commission_rate !== undefined ? `${seller.commission_rate}%` : '10%'}</p>
              </div>
            </div>

            <!-- 2-Column Cards: Pickup Address & Bank Details -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Pickup Address Card -->
              <div class="p-4 bg-white rounded-xl border border-[#14381F]/10 space-y-2.5">
                <div class="flex items-center gap-2 text-xs font-bold text-[#14381F] uppercase tracking-wider border-b border-gray-100 pb-2">
                  <span class="material-symbols-outlined text-base">location_on</span> Pickup / Warehouse Address
                </div>
                <div class="text-xs space-y-1 text-gray-700 leading-relaxed">
                  <p><span class="font-semibold text-gray-900">Address:</span> ${escapeHtml(pickup.line1 || pickup.address || pickup.street || 'Not provided')}</p>
                  ${pickup.line2 ? `<p><span class="font-semibold text-gray-900">Line 2:</span> ${escapeHtml(pickup.line2)}</p>` : ''}
                  <p><span class="font-semibold text-gray-900">City / State:</span> ${escapeHtml(pickup.city || 'n/a')}, ${escapeHtml(pickup.state || 'n/a')}</p>
                  <p><span class="font-semibold text-gray-900">Pincode:</span> <span class="font-mono">${escapeHtml(pickup.pincode || pickup.postal_code || 'n/a')}</span></p>
                  <p><span class="font-semibold text-gray-900">Contact:</span> ${escapeHtml(pickup.contact_name || seller.name || 'n/a')} (${escapeHtml(pickup.contact_phone || seller.phone || 'n/a')})</p>
                </div>
              </div>

              <!-- Bank & Tax Info Card -->
              <div class="p-4 bg-white rounded-xl border border-[#14381F]/10 space-y-2.5">
                <div class="flex items-center gap-2 text-xs font-bold text-[#14381F] uppercase tracking-wider border-b border-gray-100 pb-2">
                  <span class="material-symbols-outlined text-base">account_balance</span> Bank & Tax Compliance
                </div>
                <div class="text-xs space-y-1 text-gray-700 leading-relaxed">
                  <p><span class="font-semibold text-gray-900">Account Holder:</span> ${escapeHtml(bank.account_holder_name || bank.holder_name || seller.name || 'n/a')}</p>
                  <p><span class="font-semibold text-gray-900">Bank Name:</span> ${escapeHtml(bank.bank_name || 'n/a')}</p>
                  <p><span class="font-semibold text-gray-900">Account No:</span> <span class="font-mono">${escapeHtml(bank.account_number || bank.account_no || 'n/a')}</span></p>
                  <p><span class="font-semibold text-gray-900">IFSC Code:</span> <span class="font-mono uppercase">${escapeHtml(bank.ifsc_code || bank.ifsc || 'n/a')}</span></p>
                  <p><span class="font-semibold text-gray-900">PAN:</span> <span class="font-mono uppercase">${escapeHtml(seller.pan_number || 'n/a')}</span> • <span class="font-semibold text-gray-900">GSTIN:</span> <span class="font-mono uppercase">${escapeHtml(seller.gst_number || 'n/a')}</span></p>
                </div>
              </div>
            </div>

            <!-- Bio -->
            ${seller.bio ? `
              <div class="space-y-1">
                <p class="text-xs font-bold text-[#14381F] uppercase tracking-wider">Artisan Bio / Story</p>
                <div class="text-xs text-gray-700 bg-white p-3 rounded-xl border border-[#14381F]/10 leading-relaxed">
                  ${escapeHtml(seller.bio)}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Footer Actions -->
          <div class="px-6 py-4 bg-white border-t border-[#14381F]/10 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              ${verificationStatus !== 'verified' ? `
                <button onclick="DetailModal.verifySeller('${escapeHtml(String(seller.user_id || seller.id))}')" class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-base">verified</span> Approve KYC
                </button>
              ` : ''}

              ${verificationStatus !== 'suspended' && verificationStatus !== 'banned' ? `
                <button onclick="DetailModal.suspendSeller('${escapeHtml(String(seller.user_id || seller.id))}')" class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-base">pause_circle</span> Suspend
                </button>
              ` : ''}

              ${isAdminManaged ? `
                <button onclick="DetailModal.impersonateSpecialShop('${escapeHtml(String(seller.user_id || seller.id))}')" class="px-4 py-2 rounded-xl text-xs font-bold bg-[#14381F] hover:bg-[#14381F]/90 text-[#FFF8E7] transition-all flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-base">login</span> Switch to Studio
                </button>
              ` : ''}
            </div>

            <button onclick="DetailModal.close()" class="px-5 py-2 rounded-xl text-xs font-bold bg-[#14381F] text-[#FFF8E7] hover:bg-[#14381F]/90 transition-all shadow-sm">
              Done
            </button>
          </div>
        `;
        openModal(html);
      } catch (err) {
        openModal(`
          <div class="p-8 text-center space-y-4">
            <span class="material-symbols-outlined text-4xl text-rose-600">error</span>
            <p class="text-base font-bold text-rose-900">Failed to load artisan profile</p>
            <p class="text-xs text-gray-600">${escapeHtml(err.message)}</p>
            <button onclick="DetailModal.close()" class="px-4 py-2 rounded-xl text-xs font-bold bg-[#14381F] text-[#FFF8E7]">Close</button>
          </div>
        `);
      }
    },

    // ──────────────────────────────────────────────────────────────────────────
    // 3. ORDER DETAIL MODAL
    // ──────────────────────────────────────────────────────────────────────────
    async showOrder(orderIdOrData) {
      let order = typeof orderIdOrData === 'object' ? orderIdOrData : null;
      const orderId = typeof orderIdOrData === 'object' ? orderIdOrData.id : orderIdOrData;

      openModal(`
        <div class="p-8 flex items-center justify-center min-h-[300px]">
          <div class="flex flex-col items-center gap-3">
            <span class="material-symbols-outlined text-4xl text-[#14381F] animate-spin">progress_activity</span>
            <p class="text-sm font-medium text-[#14381F]/70">Loading order details...</p>
          </div>
        </div>
      `);

      try {
        if (!order || !order.items) {
          const res = await fetch(`/api/orders/${orderId}`, { headers: getHeaders() });
          const json = await res.json();
          if (json.success && json.data) {
            order = json.data.order || json.data;
          }
        }

        if (!order) {
          throw new Error('Order details not found.');
        }

        const items = Array.isArray(order.items) ? order.items : (Array.isArray(order.order_items) ? order.order_items : []);
        const status = order.status || 'pending';
        const paymentStatus = order.payment_status || 'pending';
        const isAdminManaged = Boolean(order.is_admin_managed);

        const html = `
          <!-- Header -->
          <div class="px-6 py-4 bg-[#14381F] text-[#FFF8E7] flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-2xl text-[#C5A059]">shopping_bag</span>
              <div>
                <h2 class="text-lg font-bold font-['Playfair_Display',serif] tracking-wide">Order #${escapeHtml(String(order.id).substring(0, 8).toUpperCase())}</h2>
                <p class="text-xs text-[#FFF8E7]/70 font-mono">Ref: ${escapeHtml(order.order_ref || order.id)} • Placed: ${order.created_at ? new Date(order.created_at).toLocaleString('en-IN') : 'n/a'}</p>
              </div>
            </div>
            <button onclick="DetailModal.close()" class="p-1.5 rounded-full hover:bg-white/10 text-[#FFF8E7]/80 hover:text-[#FFF8E7] transition-colors" title="Close (Esc)">
              <span class="material-symbols-outlined text-2xl">close</span>
            </button>
          </div>

          <!-- Body Scrollable -->
          <div class="p-6 overflow-y-auto space-y-6 flex-1 text-[#1C1C1C]">
            <!-- Status Overview Bar -->
            <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white rounded-xl border border-[#14381F]/10">
              <div class="flex items-center gap-2">
                <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  status === 'delivered' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                  status === 'shipped' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                  status === 'cancelled' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                  'bg-amber-100 text-amber-800 border border-amber-300'
                }">
                  Status: ${status}
                </span>

                <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                  paymentStatus === 'refunded' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                  'bg-amber-100 text-amber-800 border border-amber-300'
                }">
                  Payment: ${paymentStatus}
                </span>

                ${isAdminManaged ? `
                  <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-[#14381F] text-[#FFF8E7] flex items-center gap-1">
                    <span class="material-symbols-outlined text-xs text-[#C5A059]">stars</span> Special Order
                  </span>
                ` : ''}
              </div>

              <div class="text-right">
                <span class="text-xs text-gray-500 font-medium">Grand Total: </span>
                <span class="text-lg font-bold text-[#14381F] font-mono">${formatCurrency(order.total_amount || order.amount_paid)}</span>
              </div>
            </div>

            <!-- 3-Column Info: Customer, Seller & Shipping Address -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- Customer Info -->
              <div class="p-4 bg-white rounded-xl border border-[#14381F]/10 space-y-2">
                <div class="flex items-center gap-2 text-xs font-bold text-[#14381F] uppercase tracking-wider border-b border-gray-100 pb-2">
                  <span class="material-symbols-outlined text-base">person</span> Customer Info
                </div>
                <div class="text-xs space-y-1 text-gray-700">
                  <p><span class="font-semibold text-gray-900">Name:</span> ${escapeHtml(order.buyer_name || order.user?.name || 'n/a')}</p>
                  <p><span class="font-semibold text-gray-900">Email:</span> ${escapeHtml(order.buyer_email || order.user?.email || 'n/a')}</p>
                  <p><span class="font-semibold text-gray-900">Phone:</span> ${escapeHtml(order.buyer_phone || order.address_phone || 'n/a')}</p>
                </div>
              </div>

              <!-- Seller / Store Info -->
              <div class="p-4 bg-white rounded-xl border border-[#14381F]/10 space-y-2">
                <div class="flex items-center gap-2 text-xs font-bold text-[#14381F] uppercase tracking-wider border-b border-gray-100 pb-2">
                  <span class="material-symbols-outlined text-base">storefront</span> Seller Store
                </div>
                <div class="text-xs space-y-1 text-gray-700">
                  <p><span class="font-semibold text-gray-900">Store:</span> ${escapeHtml(order.store_name || 'Artisan Studio')}</p>
                  <p><span class="font-semibold text-gray-900">Store ID:</span> <span class="font-mono">${escapeHtml(String(order.seller_id || 'n/a'))}</span></p>
                  <p><span class="font-semibold text-gray-900">Type:</span> ${isAdminManaged ? 'Tohfa Special (Admin-Managed)' : 'Artisan Partner'}</p>
                </div>
              </div>

              <!-- Shipping Address -->
              <div class="p-4 bg-white rounded-xl border border-[#14381F]/10 space-y-2">
                <div class="flex items-center gap-2 text-xs font-bold text-[#14381F] uppercase tracking-wider border-b border-gray-100 pb-2">
                  <span class="material-symbols-outlined text-base">local_shipping</span> Delivery Address
                </div>
                <div class="text-xs space-y-1 text-gray-700 leading-relaxed">
                  ${(() => {
                    if (order.line1 || order.city || order.state) {
                      return `
                        <p class="font-semibold text-gray-900">${escapeHtml(order.address_name || order.buyer_name || 'Customer')}</p>
                        <p>${escapeHtml(order.line1 || '')}${order.line2 ? ', ' + escapeHtml(order.line2) : ''}</p>
                        <p>${escapeHtml(order.city || '')}, ${escapeHtml(order.state || '')} - ${escapeHtml(order.pincode || '')}</p>
                        ${order.address_phone ? `<p class="mt-1 font-mono text-gray-600">📞 ${escapeHtml(order.address_phone)}</p>` : ''}
                      `;
                    } else if (order.shipping_address && typeof order.shipping_address === 'object') {
                      const sa = order.shipping_address;
                      return `
                        <p class="font-semibold text-gray-900">${escapeHtml(sa.name || order.buyer_name || 'Customer')}</p>
                        <p>${escapeHtml(sa.line1 || sa.street || '')}${sa.line2 ? ', ' + escapeHtml(sa.line2) : ''}</p>
                        <p>${escapeHtml(sa.city || '')}, ${escapeHtml(sa.state || '')} - ${escapeHtml(sa.pincode || sa.zip || '')}</p>
                        ${sa.phone ? `<p class="mt-1 font-mono text-gray-600">📞 ${escapeHtml(sa.phone)}</p>` : ''}
                      `;
                    }
                    return '<p class="text-gray-400 italic">No detailed address on file</p>';
                  })()}
                </div>
              </div>
            </div>

            <!-- Notes / Buyer-facing Delivery Message if available -->
            ${order.notes ? `
              <div class="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-950 space-y-1">
                <p class="font-bold flex items-center gap-1.5 text-amber-900">
                  <span class="material-symbols-outlined text-[16px]">campaign</span> Fulfillment / Buyer Message:
                </p>
                <p class="text-xs leading-relaxed text-amber-900/90 pl-5">${escapeHtml(order.notes)}</p>
              </div>
            ` : ''}

            <!-- Line Items Table -->
            <div class="space-y-2">
              <h3 class="text-xs font-bold text-[#14381F] uppercase tracking-wider flex items-center gap-1.5">
                <span class="material-symbols-outlined text-base">list_alt</span> Order Items (${items.length})
              </h3>
              <div class="overflow-x-auto bg-white rounded-xl border border-[#14381F]/10">
                <table class="w-full text-left text-xs">
                  <thead class="bg-[#14381F]/5 text-[#14381F] font-bold border-b border-[#14381F]/10">
                    <tr>
                      <th class="p-3">Product</th>
                      <th class="p-3">Qty</th>
                      <th class="p-3">Unit Price</th>
                      <th class="p-3">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    ${items.map(item => {
                      const img = item.image_url || item.primary_image || item.images?.[0] || '/img/placeholder-product.png';
                      const name = item.product_name || item.name || 'Handcrafted Item';
                      const qty = item.quantity || 1;
                      const price = item.unit_price || item.price || 0;
                      const subtotal = qty * price;
                      return `
                        <tr>
                          <td class="p-3">
                            <div class="flex items-center gap-3">
                              <img src="${escapeHtml(img)}" class="w-10 h-10 rounded-lg object-cover bg-gray-50 border border-gray-200">
                              <div>
                                <p class="font-bold text-gray-900">${escapeHtml(name)}</p>
                                ${item.variant_name ? `<p class="text-[11px] text-gray-500">Variant: ${escapeHtml(item.variant_name)}</p>` : ''}
                                ${item.customization_text ? `<p class="text-[11px] text-amber-700">Customized: "${escapeHtml(item.customization_text)}"</p>` : ''}
                              </div>
                            </div>
                          </td>
                          <td class="p-3 font-mono font-semibold">${qty}</td>
                          <td class="p-3 font-mono">${formatCurrency(price)}</td>
                          <td class="p-3 font-mono font-bold text-[#14381F]">${formatCurrency(subtotal)}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="px-6 py-4 bg-white border-t border-[#14381F]/10 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              ${isAdminManaged ? `
                <button onclick="DetailModal.showStatusModal('${escapeHtml(String(order.id))}', '${escapeHtml(String(order.status || 'pending'))}', '${escapeHtml(String(order.notes || order.studio_notes || ''))}')" class="px-4 py-2 rounded-xl text-xs font-bold bg-[#14381F] hover:bg-stone-800 text-[#FFF8E7] transition-all flex items-center gap-1.5 shadow-sm">
                  <span class="material-symbols-outlined text-base">edit_note</span> Update Status & Buyer Note
                </button>
              ` : ''}

              ${paymentStatus === 'paid' ? `
                <button onclick="DetailModal.promptForceRefund('${escapeHtml(String(order.id))}')" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-base">currency_exchange</span> Emergency Refund
                </button>
              ` : ''}
            </div>

            <button onclick="DetailModal.close()" class="px-5 py-2 rounded-xl text-xs font-bold bg-gray-100 hover:bg-gray-200 text-[#14381F] transition-all">
              Done
            </button>
          </div>
        `;
        openModal(html);
      } catch (err) {
        openModal(`
          <div class="p-8 text-center space-y-4">
            <span class="material-symbols-outlined text-4xl text-rose-600">error</span>
            <p class="text-base font-bold text-rose-900">Failed to load order details</p>
            <p class="text-xs text-gray-600">${escapeHtml(err.message)}</p>
            <button onclick="DetailModal.close()" class="px-4 py-2 rounded-xl text-xs font-bold bg-[#14381F] text-[#FFF8E7]">Close</button>
          </div>
        `);
      }
    },

    // ──────────────────────────────────────────────────────────────────────────
    // ACTIONS & CONTROLS
    // ──────────────────────────────────────────────────────────────────────────
    async toggleSponsor(productId) {
      try {
        const res = await fetch(`/api/admin/products/${productId}/sponsor`, {
          method: 'PATCH',
          headers: getHeaders()
        });
        const json = await res.json();
        if (json.success) {
          alert('Product sponsor status updated!');
          DetailModal.showProduct(productId);
          if (typeof window.fetchProducts === 'function') window.fetchProducts();
        } else {
          alert('Failed to update sponsor status: ' + (json.message || 'Unknown error'));
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      }
    },

    async toggleStatus(productId, newStatus) {
      try {
        const res = await fetch(`/api/admin/products/${productId}/status`, {
          method: 'PATCH',
          headers: getHeaders(),
          body: JSON.stringify({ status: newStatus })
        });
        const json = await res.json();
        if (json.success) {
          alert(`Product status changed to "${newStatus}"`);
          DetailModal.showProduct(productId);
          if (typeof window.fetchProducts === 'function') window.fetchProducts();
        } else {
          alert('Failed to change status: ' + (json.message || 'Unknown error'));
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      }
    },

    async verifySeller(sellerId) {
      if (!confirm('Are you sure you want to approve this artisan KYC?')) return;
      try {
        const res = await fetch(`/api/admin/sellers/${sellerId}/verify`, {
          method: 'PATCH',
          headers: getHeaders()
        });
        const json = await res.json();
        if (json.success) {
          alert('Artisan KYC successfully approved!');
          DetailModal.showSeller(sellerId);
          if (typeof window.fetchSellers === 'function') window.fetchSellers();
        } else {
          alert('Failed to approve KYC: ' + (json.message || 'Unknown error'));
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      }
    },

    async suspendSeller(sellerId) {
      if (!confirm('Suspend this artisan store?')) return;
      try {
        const res = await fetch(`/api/admin/sellers/${sellerId}/suspend`, {
          method: 'PATCH',
          headers: getHeaders()
        });
        const json = await res.json();
        if (json.success) {
          alert('Artisan store suspended.');
          DetailModal.showSeller(sellerId);
          if (typeof window.fetchSellers === 'function') window.fetchSellers();
        } else {
          alert('Failed: ' + (json.message || 'Unknown error'));
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      }
    },

    async impersonateSpecialShop(sellerId) {
      try {
        const res = await fetch(`/api/admin/special-shops/${sellerId}/switch-session`, {
          method: 'POST',
          headers: getHeaders()
        });
        const json = await res.json();
        if (json.success && json.data) {
          sessionStorage.setItem('seller_token', json.data.accessToken || json.data.token);
          sessionStorage.setItem('seller_profile', JSON.stringify(json.data.user || json.data.seller));
          window.location.href = '/seller/dashboard.html';
        } else {
          alert('Failed to switch session: ' + (json.message || 'Unknown error'));
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      }
    },

    showStatusModal(orderId, currentStatus = 'pending', currentNotes = '') {
      openModal(`
        <div class="px-6 py-4 bg-[#14381F] text-[#FFF8E7] flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-outlined text-2xl text-[#C5A059]">local_shipping</span>
            <h2 class="text-base font-bold font-['Playfair_Display',serif]">Update Order Status & Delivery Progress</h2>
          </div>
          <button onclick="DetailModal.showOrder('${escapeHtml(orderId)}')" class="p-1 rounded-full hover:bg-white/10 text-[#FFF8E7]/80 hover:text-[#FFF8E7]">
            <span class="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        <form id="dm-status-form" class="p-6 space-y-4 text-xs" onsubmit="event.preventDefault(); DetailModal.submitStatusUpdate('${escapeHtml(orderId)}');">
          <div>
            <label class="block font-bold text-[#14381F] uppercase tracking-wider mb-1.5">Select Current Stage / Status:</label>
            <select id="dm-status-select" class="w-full bg-white border border-[#14381F]/20 rounded-xl p-2.5 text-xs text-gray-900 font-medium focus:outline-none focus:border-[#14381F]">
              <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>Pending (Order Placed)</option>
              <option value="confirmed" ${currentStatus === 'confirmed' ? 'selected' : ''}>Confirmed</option>
              <option value="processing" ${currentStatus === 'processing' ? 'selected' : ''}>Crafting / Preparing</option>
              <option value="shipped" ${currentStatus === 'shipped' ? 'selected' : ''}>Dispatched / In Transit</option>
              <option value="delivered" ${currentStatus === 'delivered' ? 'selected' : ''}>Delivered</option>
              <option value="cancelled" ${currentStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          </div>

          <div>
            <label class="block font-bold text-[#14381F] uppercase tracking-wider mb-1.5">
              Buyer-Facing Status Message / Delivery Note:
            </label>
            <textarea id="dm-status-notes" rows="3" placeholder="e.g. Handcrafting in progress. Custom packaging ready. Dispatched in 2 days via studio express."
                      class="w-full bg-white border border-[#14381F]/20 rounded-xl p-3 text-xs text-gray-900 focus:outline-none focus:border-[#14381F] leading-relaxed">${escapeHtml(currentNotes)}</textarea>
            <p class="text-[11px] text-gray-500 mt-1">This message is immediately visible to the customer on their order details & tracking page.</p>
          </div>

          <div class="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" onclick="DetailModal.showOrder('${escapeHtml(orderId)}')" class="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-50">
              Back to Details
            </button>
            <button type="submit" id="dm-status-submit-btn" class="px-5 py-2 rounded-xl bg-[#14381F] hover:bg-stone-800 text-[#FFF8E7] font-bold shadow transition-all">
              Save & Notify Buyer
            </button>
          </div>
        </form>
      `);
    },

    async submitStatusUpdate(orderId) {
      const select = document.getElementById('dm-status-select');
      const notesEl = document.getElementById('dm-status-notes');
      const submitBtn = document.getElementById('dm-status-submit-btn');

      if (!select) return;
      const status = select.value;
      const notes = notesEl ? notesEl.value.trim() : '';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      try {
        const res = await fetch(`/api/admin/orders/${orderId}/force-status`, {
          method: 'PATCH',
          headers: getHeaders(),
          body: JSON.stringify({ status, notes, buyer_message: notes, delivery_notes: notes })
        });
        const json = await res.json();
        if (json.success) {
          DetailModal.showOrder(orderId);
          if (typeof window.fetchSpecialOrders === 'function') window.fetchSpecialOrders();
          if (typeof window.fetchOrders === 'function') window.fetchOrders();
        } else {
          alert('Failed to update status: ' + (json.message || 'Unknown error'));
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save & Notify Buyer';
          }
        }
      } catch (e) {
        alert('Network error: ' + e.message);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save & Notify Buyer';
        }
      }
    },

    async promptForceStatus(orderId) {
      this.showStatusModal(orderId);
    },

    async promptForceRefund(orderId) {
      const reason = prompt('Enter reason for issuing emergency refund:');
      if (reason === null) return;
      if (!confirm('Are you sure you want to issue a full emergency refund for this order?')) return;
      try {
        const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ reason: reason || 'Admin override emergency refund' })
        });
        const json = await res.json();
        if (json.success) {
          alert('Emergency refund processed successfully!');
          DetailModal.showOrder(orderId);
          if (typeof window.fetchOrders === 'function') window.fetchOrders();
          if (typeof window.fetchSpecialOrders === 'function') window.fetchSpecialOrders();
        } else {
          alert('Failed to process refund: ' + (json.message || 'Unknown error'));
        }
      } catch (e) {
        alert('Network error: ' + e.message);
      }
    }
  };

  global.DetailModal = DetailModal;
})(typeof window !== 'undefined' ? window : this);
