/**
 * unavailable-state.js — Shared Tohfa component
 * Renders an "unavailable" state (paused or out-of-stock) for a product,
 * including a similar-products carousel fetched from the API.
 *
 * Usage:
 *   import { renderUnavailableState } from '/src/components/unavailable-state.js';
 *   renderUnavailableState(container, { mode, message, resumeEstimate, productId });
 */

const API_BASE = window.location.origin;

/**
 * Format price in paise to INR string.
 */
function fmt(paise) {
  return '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/**
 * Fetch similar products from the API.
 * @param {string|number} productId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function fetchSimilar(productId, limit = 6) {
  try {
    const res = await fetch(`${API_BASE}/api/products/${productId}/similar?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch {
    return [];
  }
}

/**
 * Render a product card for the similar carousel.
 */
function renderSimilarCard(product) {
  const imageUrl = (product.images && product.images[0]) ? product.images[0].url : (product.image_url || '');
  const price = fmt(product.price_paise || 0);
  const name = product.name || product.title || 'Product';
  const seller = product.seller_name || '';
  const rating = product.avg_rating ? product.avg_rating.toFixed(1) : '';

  return `
    <a href="/buyer/product.html?id=${product.id}"
       class="tohfa-similar-card"
       style="flex:0 0 160px;max-width:160px;border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,0.08);background:#fff;text-decoration:none;color:inherit;display:block;transition:box-shadow 0.2s ease,transform 0.2s ease;"
       onmouseover="this.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)';this.style.transform='translateY(-2px)'"
       onmouseout="this.style.boxShadow='none';this.style.transform='none'">
      <div style="width:100%;height:140px;overflow:hidden;background:#f5f0e8;">
        ${imageUrl
          ? `<img src="${imageUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9a8f7e;font-size:28px;">🎨</div>`
        }
      </div>
      <div style="padding:10px 10px 12px;">
        <div style="font-size:12px;font-weight:600;line-height:1.35;color:#2d3748;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;margin-bottom:4px;">${name}</div>
        ${seller ? `<div style="font-size:10px;color:#6b7280;margin-bottom:4px;">${seller}</div>` : ''}
        <div style="font-size:13px;font-weight:700;color:#255338;">${price}</div>
        ${rating ? `<div style="font-size:10px;color:#d97706;margin-top:2px;">★ ${rating}</div>` : ''}
      </div>
    </a>
  `;
}

/**
 * Main exported function.
 * @param {HTMLElement} container - The DOM element to render into.
 * @param {Object} opts
 * @param {'paused'|'out_of_stock'} opts.mode
 * @param {string} opts.message
 * @param {string} [opts.resumeEstimate] - ISO date string or readable date
 * @param {string|number} opts.productId
 * @param {boolean} [opts.compact=false] - Compact inline mode (for cart rows)
 */
export async function renderUnavailableState(container, { mode, message, resumeEstimate, productId, compact = false }) {
  if (!container) return;

  const isPaused = mode === 'paused';
  const icon = isPaused ? '⏸️' : '📦';
  const accentColor = isPaused ? '#7c3aed' : '#dc2626';
  const bgColor = isPaused ? '#f5f3ff' : '#fef2f2';
  const borderColor = isPaused ? '#c4b5fd' : '#fecaca';

  // Build the estimate line
  let estimateLine = '';
  if (isPaused && resumeEstimate) {
    const dateStr = new Date(resumeEstimate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    estimateLine = `<p style="font-size:12px;color:#6b7280;margin-top:4px;">Expected back: <strong>${dateStr}</strong></p>`;
  }

  // Initial skeleton render
  container.innerHTML = `
    <div class="tohfa-unavailable-state" style="border:1.5px solid ${borderColor};background:${bgColor};border-radius:16px;padding:${compact ? '12px 14px' : '20px 24px'};margin:${compact ? '8px 0' : '16px 0'};">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:${compact ? '10px' : '16px'};">
        <span style="font-size:${compact ? '20px' : '28px'};line-height:1;">${icon}</span>
        <div>
          <p style="font-size:${compact ? '13px' : '15px'};font-weight:600;color:${accentColor};margin:0 0 2px;">${message}</p>
          ${estimateLine}
        </div>
      </div>
      <div class="tohfa-similar-section">
        <p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9a8f7e;margin-bottom:10px;">You might also like</p>
        <div class="tohfa-similar-scroll" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scrollbar-width:thin;-webkit-overflow-scrolling:touch;">
          <div style="display:flex;gap:12px;align-items:center;color:#9a8f7e;font-size:13px;padding:8px;">
            <span style="display:inline-block;width:20px;height:20px;border:2px solid #d1d5db;border-top-color:#255338;border-radius:50%;animation:tohfa-spin 0.7s linear infinite;"></span>
            Loading similar products…
          </div>
        </div>
      </div>
    </div>
    <style>
      @keyframes tohfa-spin { to { transform: rotate(360deg); } }
      .tohfa-similar-scroll::-webkit-scrollbar { height: 4px; }
      .tohfa-similar-scroll::-webkit-scrollbar-track { background: transparent; }
      .tohfa-similar-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
    </style>
  `;

  // Fetch similar products async and update scroll area
  const similar = await fetchSimilar(productId, compact ? 4 : 8);
  const scrollEl = container.querySelector('.tohfa-similar-scroll');
  if (!scrollEl) return;

  if (!similar || similar.length === 0) {
    scrollEl.innerHTML = `<p style="color:#9a8f7e;font-size:13px;padding:4px 0;">No similar products found right now.</p>`;
    return;
  }

  scrollEl.innerHTML = similar.map(renderSimilarCard).join('');
}

// Make it available globally as well for non-module pages
window.renderUnavailableState = renderUnavailableState;
