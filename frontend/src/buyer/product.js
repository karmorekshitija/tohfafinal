/**
 * Tohfa v2 — Product Detail Logic
 * File: frontend/src/buyer/product.js
 */
'use strict';

import { api } from '../js/api.js';
import { initBuyerShell } from '../js/layout.js';
import { formatPrice, showToast, flyToCart } from '../js/utils.js';
import { isLoggedIn } from '../js/auth.js';
import { optimizeImageUrl } from '../utils/imageHelper.js';

initBuyerShell();

const urlParams = new URLSearchParams(window.location.search);

// Bug A fix: accept any standard parameter name
const productId = urlParams.get('id') || urlParams.get('productId') || urlParams.get('slug');

const container = document.getElementById('productContent');
const stickyCta = document.getElementById('mobileStickyCta');

let currentProduct = null;
let selectedVariant = null;
let fixedCustomizationValues = {};

// Bug B fix: redirect to categories if no identifier is present
if (!productId || productId === 'null' || productId === 'undefined') {
  window.location.replace('/buyer/categories.html');
}

async function loadProduct() {
  if (!productId || productId === 'null' || productId === 'undefined') {
    return; // Guard: redirect already triggered above
  }

  try {
    // Record view
    api.post(`/api/products/${productId}/view`).catch(() => {});

    const res = await api.get(`/api/products/${productId}`);

    // Bug C fix: universal safe payload unwrap
    currentProduct = res?.data?.product || res?.data || res?.product || res;

    if (!currentProduct || (!currentProduct.id && !currentProduct.slug)) {
      container.innerHTML = '<p class="text-body">Product not found.</p>';
      return;
    }

    renderProductUI(currentProduct);
  } catch (err) {
    container.innerHTML = `<p class="text-body">Error loading product: ${err.message}</p>`;
  }
}

function getImagesForVariant(variant, p) {
  if (variant) {
    if (Array.isArray(variant.images) && variant.images.length > 0) {
      const valid = variant.images.map(img => (typeof img === 'string' ? img : (img.url || img.image_url || img))).filter(Boolean);
      if (valid.length > 0) return valid.map(url => ({ url }));
    }
    if (variant.image_url) {
      return [{ url: variant.image_url }];
    }
  }
  if (Array.isArray(p.images) && p.images.length > 0) {
    const valid = p.images.map(img => (typeof img === 'string' ? img : (img.url || img.image_url || img))).filter(Boolean);
    if (valid.length > 0) return valid.map(url => ({ url }));
  }
  return [{ url: p.image_url || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&q=80' }];
}

function renderProductUI(p) {
  document.title = `${p.name} | Tohfa`;

  const variants = Array.isArray(p.variants) ? p.variants : [];
  const fixedOptions = Array.isArray(p.fixed_customization_options) ? p.fixed_customization_options : [];

  // Set default variant
  if (variants.length) {
    selectedVariant = variants[0];
  }

  const activeImages = getImagesForVariant(selectedVariant, p);

  const tags = Array.isArray(p.tags) ? p.tags : [];
  const tagsMarkup = tags.length
    ? `<div class="product-tags-container" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: var(--space-2); margin-bottom: var(--space-2);">
        ${tags.map(t => `<span class="tag-chip" style="font-size: 11px; padding: 3px 10px; background: rgba(20,56,31,0.06); border: 1px solid rgba(20,56,31,0.15); border-radius: 9999px; color: var(--color-primary); font-weight: 500; font-family: 'DM Sans', sans-serif;">#${escapeHtml(t.replace(/-/g, ' '))}</span>`).join('')}
       </div>`
    : '';

  // Calculate current price
  const activePrice = Number(p.base_price) + (selectedVariant ? Number(selectedVariant.additional_price || 0) : 0);

  // Gallery markup
  const thumbsMarkup = activeImages.length > 1
    ? activeImages.map((img, i) => {
        const rawUrl = img.url || img;
        const thumbUrl = optimizeImageUrl(rawUrl, { width: 160 });
        return `
        <div class="gallery-thumb ${i === 0 ? 'active' : ''}" onclick="switchImage('${rawUrl}', this)">
          <img src="${thumbUrl}" alt="Thumbnail" loading="lazy" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&q=80'">
        </div>
      `;
      }).join('')
    : '';

  // Variants markup
  const variantsMarkup = variants.length > 0
    ? `
      <div class="card" style="padding: var(--space-4); margin-top: var(--space-4); background: #FAF6EE; border: 1px solid rgba(20,56,31,0.15); border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-2);">
          <label style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary);">
            Choose Option:
          </label>
          <span id="variantLabel" style="font-size: var(--text-xs); font-weight: 600; color: var(--color-moss);">
            ${selectedVariant?.variant_name || selectedVariant?.color_name || ''}
          </span>
        </div>
        <div class="flex flex-wrap gap-2.5" id="variantSwatches">
          ${variants.map((v, i) => {
            const hasHex = Boolean(v.color_hex && /^#[0-9A-F]{6}$/i.test(v.color_hex));
            const rawThumb = (Array.isArray(v.images) && v.images.length > 0) ? (v.images[0]?.url || v.images[0]) : v.image_url;
            const thumbImg = rawThumb ? optimizeImageUrl(rawThumb, { width: 64 }) : null;
            const isActive = (selectedVariant && selectedVariant.id === v.id) || (!selectedVariant && i === 0);
            return `
              <button
                type="button"
                class="variant-btn ${isActive ? 'active' : ''}"
                style="display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 9999px; border: 1.5px solid ${isActive ? 'var(--color-primary)' : 'rgba(20,56,31,0.2)'}; background: ${isActive ? 'rgba(20,56,31,0.08)' : 'white'}; cursor: pointer; transition: all 0.2s ease;"
                onclick="selectVariant(${v.id}, this)"
              >
                ${thumbImg ? `<img src="${thumbImg}" alt="${v.variant_name || v.color_name || 'Variant'}" loading="lazy" decoding="async" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(0,0,0,0.15);" onerror="this.style.display='none'">` : (hasHex ? `<span style="width: 14px; height: 14px; border-radius: 50%; background-color: ${v.color_hex}; border: 1px solid rgba(0,0,0,0.2); display: inline-block;"></span>` : '')}
                <span style="font-size: 13px; font-weight: 600; color: var(--color-primary);">${v.variant_name || v.color_name || 'Option'}</span>
                ${Number(v.additional_price) !== 0 ? `<span style="font-size: 11px; opacity: 0.7;">(${Number(v.additional_price) > 0 ? '+' : ''}${formatPrice(v.additional_price)})</span>` : ''}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `
    : '';

  // Fixed customization / options markup (single options path)
  const fixedMarkup = fixedOptions.length
    ? `
      <div class="card" style="padding: var(--space-4); margin-top: var(--space-4); background: #DCE6D8; border-color: var(--color-accent);">
        <h4 style="font-family: var(--font-display); font-size: var(--text-md); color: var(--color-primary); margin-bottom: var(--space-3);">Personalization & Options</h4>
        <div class="flex flex-col gap-3">
          ${fixedOptions.map(opt => `
            <div class="form-group">
              <label class="form-label" style="font-size: var(--text-xs);">${opt.label} ${opt.is_required ? '*' : ''}</label>
              ${opt.choices && opt.choices.length
                ? `<select class="form-select" onchange="updateFixedOption('${opt.id || opt.label}', this.value)">
                    <option value="">Choose ${opt.label}</option>
                    ${opt.choices.map(c => `<option value="${c}">${c}</option>`).join('')}
                   </select>`
                : `<input type="text" class="form-input" placeholder="Enter custom text..." maxlength="${opt.max_length || 50}" oninput="updateFixedOption('${opt.id || opt.label}', this.value)">`
              }
            </div>
          `).join('')}
        </div>
      </div>
    `
    : '';

  // Open Customization banner
  const openCustomizationMarkup = p.customization_mode === 'open'
    ? `
      <div class="card" style="padding: var(--space-4); margin-top: var(--space-4); background: var(--color-surface); border: 1.5px dashed var(--color-primary);">
        <span class="badge badge-primary" style="margin-bottom: var(--space-2);">Bespoke / Made-to-Order</span>
        <h4 style="font-family: var(--font-display); font-size: var(--text-md); color: var(--color-primary);">Have a specific custom design in mind?</h4>
        <p class="text-small" style="margin: var(--space-1) 0 var(--space-3);">This artisan accepts tailored custom requests with custom sizes, colors, and engravings.</p>
        <a href="./customization-form.html?productId=${p.id}" class="btn btn-secondary btn-full btn-sm">Request Customization Form →</a>
      </div>
    `
    : '';

  // WhatsApp chat with seller
  const whatsappNumber = p.seller_whatsapp ? p.seller_whatsapp.replace(/\D/g, '').slice(-10) : '';
  const whatsappMarkup = whatsappNumber
    ? `<a href="https://wa.me/91${whatsappNumber}?text=Hi!%20I'm%20interested%20in%20your%20product%20'${encodeURIComponent(p.name)}'%20on%20Tohfa" target="_blank" class="btn btn-ghost btn-full" style="gap:8px; border:1px solid var(--color-border); margin-top:var(--space-2);">
        <span>💬</span> Chat directly with Seller on WhatsApp
       </a>`
    : '';

  const isCustomizable = p.is_customizable || p.is_customized || (p.customization_mode && p.customization_mode !== 'none') || p.listing_type === 'custom';
  const isOutOfStock = !isCustomizable && (p.status === 'sold_out' || (p.stock_quantity !== undefined && p.stock_quantity !== null && Number(p.stock_quantity) <= 0));

  container.innerHTML = `
    <!-- Left: Gallery & Style Selector -->
    <div>
      <div class="gallery-main">
        <img id="mainImage" src="${optimizeImageUrl(activeImages[0]?.url || '', { width: 1000 })}" alt="${p.name}" decoding="async">
      </div>
      <div id="galleryThumbsContainer" class="gallery-thumbs">
        ${thumbsMarkup}
      </div>
      ${variantsMarkup}
    </div>

    <!-- Right: Product Information & Purchase -->
    <div class="flex flex-col">
      <div class="flex justify-between items-start">
        <div>
          <span class="badge badge-accent" style="margin-bottom: var(--space-2);">${p.category_name || p.category?.name || 'Handcrafted'}</span>
          ${isOutOfStock ? `<span class="badge badge-warning" style="margin-bottom: var(--space-2); margin-left: 6px;">Out of Stock</span>` : ''}
          <h1 style="font-family: var(--font-display); font-size: var(--text-3xl); color: var(--color-primary);">${p.name}</h1>
          ${tagsMarkup}
        </div>
        <button id="wishlistBtn" class="product-card__wishlist-btn" style="position:static;" onclick="toggleProductWishlist('${p.id}')">
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
        </button>
      </div>

      <div style="margin-top: var(--space-2);">
        Crafted with love by <a href="./seller-profile.html?id=${p.seller_id}" style="color: var(--color-primary); font-weight: var(--weight-semibold); text-decoration: underline;">${p.store_name || 'Artisan Seller'}</a>
      </div>

      <div style="margin-top: var(--space-2);">
        ${(Number(p.review_count) > 0 && !isNaN(Number(p.avg_rating)) && Number(p.avg_rating) > 0)
          ? `<span class="badge badge-accent" style="font-size: var(--text-xs);">★ ${Number(p.avg_rating).toFixed(1)} (${p.review_count} review${Number(p.review_count) === 1 ? '' : 's'})</span>`
          : `<span class="badge badge-primary" style="font-size: var(--text-xs); background: rgba(20,56,31,0.1); color: var(--color-primary);">✨ New Artisan Listing</span>`
        }
      </div>

      <div style="margin-top: var(--space-4);">
        <span id="productPriceDisplay" class="text-price" style="font-size: var(--text-2xl);">${formatPrice(activePrice)}</span>
        <span class="text-small" style="margin-left: var(--space-2);">(Inclusive of all artisan taxes)</span>
      </div>

      ${fixedMarkup}
      ${openCustomizationMarkup}

      <!-- Delivery Estimator (BUY-08) -->
      <div class="card" style="padding: var(--space-4); margin-top: var(--space-4); background: rgba(20,56,31,0.03); border: 1px solid var(--color-border); border-radius: var(--radius-md);">
        <div style="font-weight: 600; font-size: var(--text-sm); margin-bottom: var(--space-2); color: var(--color-primary); display: flex; align-items: center; gap: 6px;">
          <span>🚚</span> <span>Delivery & Artisan Crafting Estimator</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="pincodeInput" placeholder="Enter 6-digit Pincode" maxlength="6" class="form-input" style="max-width: 180px; height: 38px; font-size: var(--text-xs);">
          <button type="button" id="checkPincodeBtn" class="btn btn-secondary btn-sm" onclick="checkDeliveryEstimator()">Check Pincode</button>
        </div>
        <div id="pincodeResult" style="margin-top: var(--space-2); font-size: var(--text-xs); line-height: 1.4;"></div>
      </div>

      <!-- Actions -->
      <div class="flex flex-col gap-3" style="margin-top: var(--space-6);">
        <button id="addToCartBtn" class="btn btn-primary btn-full" ${isOutOfStock ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : ''} onclick="executeAddToCart()">
          ${isOutOfStock ? 'Out of Stock' : 'Add to Cart 🛍️'}
        </button>
        <button id="buyNowBtn" class="btn btn-secondary btn-full" ${isOutOfStock ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : ''} onclick="executeBuyNow()">
          ${isOutOfStock ? 'Currently Unavailable' : 'Buy Now'}
        </button>
        ${whatsappMarkup}
      </div>

      <!-- Description -->
      <div style="margin-top: var(--space-8); border-top: 1px solid var(--color-border); padding-top: var(--space-6);">
        <h3 style="font-family: var(--font-display); font-size: var(--text-lg); color: var(--color-primary); margin-bottom: var(--space-2);">About this Handcrafted Gift</h3>
        <p class="text-body" style="white-space: pre-line;">${p.description || 'Authentic artisan product handcrafted with exceptional care and quality materials.'}</p>
      </div>
    </div>
  `;

  // Show mobile bottom CTA
  if (stickyCta) {
    stickyCta.style.display = 'flex';
    document.getElementById('stickyAddToCartBtn').onclick = executeAddToCart;
    document.getElementById('stickyBuyNowBtn').onclick = executeBuyNow;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Window actions
window.switchImage = (url, thumbEl) => {
  document.getElementById('mainImage').src = optimizeImageUrl(url, { width: 1000 });
  document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
  thumbEl.classList.add('active');
};

window.selectVariant = (variantId, el) => {
  document.querySelectorAll('.variant-btn').forEach(s => {
    s.classList.remove('active');
    s.style.borderColor = 'rgba(20,56,31,0.2)';
    s.style.background = 'white';
  });
  if (el) {
    el.classList.add('active');
    el.style.borderColor = 'var(--color-primary)';
    el.style.background = 'rgba(20,56,31,0.08)';
  }

  const variants = currentProduct?.variants || [];
  selectedVariant = variants.find(v => v.id === variantId) || null;

  if (selectedVariant) {
    const labelEl = document.getElementById('variantLabel');
    if (labelEl) labelEl.textContent = selectedVariant.variant_name || selectedVariant.color_name || '';

    const newPrice = Number(currentProduct.base_price) + Number(selectedVariant.additional_price || 0);
    const priceDisplay = document.getElementById('productPriceDisplay');
    if (priceDisplay) priceDisplay.textContent = formatPrice(newPrice);

    // Swap gallery images to isolated variant images
    const variantImages = getImagesForVariant(selectedVariant, currentProduct);
    const mainImg = document.getElementById('mainImage');
    if (mainImg && variantImages.length > 0) {
      mainImg.src = optimizeImageUrl(variantImages[0].url, { width: 1000 });
    }

    const thumbsContainer = document.getElementById('galleryThumbsContainer');
    if (thumbsContainer) {
      if (variantImages.length > 1) {
        thumbsContainer.innerHTML = variantImages.map((img, i) => {
          const raw = img.url || img;
          const thumbUrl = optimizeImageUrl(raw, { width: 160 });
          return `
          <div class="gallery-thumb ${i === 0 ? 'active' : ''}" onclick="switchImage('${raw}', this)">
            <img src="${thumbUrl}" alt="Thumbnail" loading="lazy" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&q=80'">
          </div>
        `;
        }).join('');
      } else {
        thumbsContainer.innerHTML = '';
      }
    }

    const isOutOfStock = Number(selectedVariant.stock_qty) <= 0;
    const addBtn = document.getElementById('addToCartBtn');
    const buyBtn = document.getElementById('buyNowBtn');
    if (addBtn) {
      addBtn.disabled = isOutOfStock;
      addBtn.textContent = isOutOfStock ? 'Out of Stock' : 'Add to Cart 🛍️';
    }
    if (buyBtn) {
      buyBtn.disabled = isOutOfStock;
      buyBtn.textContent = isOutOfStock ? 'Currently Unavailable' : 'Buy Now';
    }
  }
};

window.updateFixedOption = (optionId, val) => {
  fixedCustomizationValues[optionId] = val;
};

window.checkDeliveryEstimator = () => {
  const pincodeInput = document.getElementById('pincodeInput');
  const resultEl = document.getElementById('pincodeResult');
  const code = pincodeInput?.value?.trim() || '';
  if (!/^\d{6}$/.test(code)) {
    if (resultEl) {
      resultEl.innerHTML = `<span style="color:var(--color-error);">Please enter a valid 6-digit Indian delivery pincode.</span>`;
    }
    return;
  }
  const prepDays = Number(currentProduct?.preparation_days || currentProduct?.crafting_days || 2);
  const transitDays = 3;
  const totalDays = prepDays + transitDays;
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + totalDays);

  const options = { weekday: 'short', month: 'short', day: 'numeric' };
  const formattedDate = deliveryDate.toLocaleDateString('en-IN', options);

  if (resultEl) {
    resultEl.innerHTML = `
      <div style="color:var(--color-primary); font-weight:500;">
        Estimated Delivery by <strong>${formattedDate}</strong> (Includes ${prepDays} days artisan crafting lead time)
      </div>
    `;
  }
};

window.executeAddToCart = async () => {
  if (!isLoggedIn()) {
    showToast('Please sign in to add items to your cart.', 'info');
    setTimeout(() => window.location.href = '/auth/login.html', 800);
    return;
  }

  const addBtn = document.getElementById('addToCartBtn');
  addBtn.disabled = true;

  try {
    const payload = {
      product_id: currentProduct.id,
      variant_id: selectedVariant?.id || null,
      quantity: 1,
      customization_data: Object.keys(fixedCustomizationValues).length ? fixedCustomizationValues : null,
    };

    await api.post('/api/cart', payload);

    // Micro-animation: Fly to cart
    const imgEl = document.getElementById('mainImage');
    const cartIconEl = document.getElementById('cartNavIcon');
    if (imgEl && cartIconEl) {
      flyToCart(imgEl, cartIconEl);
    }

    showToast('Added to cart! 🎁', 'success');

    // Increment nav cart badge
    const badge = document.getElementById('navCartCount');
    if (badge) {
      const current = parseInt(badge.textContent || '0', 10);
      badge.textContent = current + 1;
      badge.style.display = 'flex';
    }
  } catch (err) {
    showToast(err.message || 'Failed to add to cart.', 'error');
  } finally {
    addBtn.disabled = false;
  }
};

window.executeBuyNow = async () => {
  // BUY-07: Check if product is customizable and redirect to customization form before checkout
  const isCustomizable = currentProduct && (
    currentProduct.is_customizable ||
    currentProduct.is_customized ||
    (currentProduct.customization_mode && currentProduct.customization_mode !== 'none') ||
    currentProduct.listing_type === 'custom'
  );

  if (isCustomizable) {
    window.location.href = `./customization-form.html?productId=${currentProduct.id}&buyNow=true`;
    return;
  }

  await executeAddToCart();
  setTimeout(() => {
    window.location.href = './checkout.html';
  }, 400);
};

window.toggleProductWishlist = async (id) => {
  if (!isLoggedIn()) {
    showToast('Please sign in to save to wishlist.', 'info');
    return;
  }
  try {
    await api.post('/api/wishlist', { product_id: id });
    showToast('Saved to wishlist! ❤️', 'success');
  } catch (err) {
    showToast(err.message || 'Wishlist error.', 'error');
  }
};

loadProduct();
