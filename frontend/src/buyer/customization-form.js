/**
 * Tohfa v2 — Dynamic Customization Request Logic
 * File: frontend/src/buyer/customization-form.js
 */
'use strict';

import { api } from '../js/api.js';
import { initBuyerShell } from '../js/layout.js';
import { requireAuth } from '../js/auth.js';
import { showToast } from '../js/utils.js';
import { compressImage } from '../utils/imageCompressor.js';

if (requireAuth()) {
  initBuyerShell();
}

const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('productId') || urlParams.get('id') || urlParams.get('product_id');
const dynamicFieldsContainer = document.getElementById('dynamicFieldsContainer');
const instructionsBox = document.getElementById('sellerInstructionsBox');
const instructionsText = document.getElementById('sellerInstructionsText');
const budgetHint = document.getElementById('budgetHint');
const form = document.getElementById('customRequestForm');
const submitBtn = document.getElementById('submitRequestBtn');

let config = null;

async function loadConfig() {
  if (!productId) {
    dynamicFieldsContainer.innerHTML = '<p class="text-body">Invalid product reference.</p>';
    return;
  }

  try {
    const res = await api.get(`/api/customization/config/${productId}`);
    config = res?.data;

    renderFormFields(config);
  } catch (err) {
    dynamicFieldsContainer.innerHTML = `<p class="text-body">${err.message}</p>`;
  }
}

function renderFormFields(cfg) {
  if (!cfg) {
    dynamicFieldsContainer.innerHTML = `
      <div class="form-group">
        <label class="form-label">Custom Requirements Description *</label>
        <textarea name="general_requirements" class="form-textarea" rows="4" placeholder="Describe the customization, names, colors, or sizes you would like..." required></textarea>
      </div>
    `;
    return;
  }

  // Seller guidelines
  if (cfg.instructions) {
    instructionsBox.style.display = 'block';
    instructionsText.textContent = cfg.instructions;
  }

  if (cfg.budget_min || cfg.budget_max) {
    const min = cfg.budget_min ? `₹${cfg.budget_min}` : 'any';
    const max = cfg.budget_max ? `₹${cfg.budget_max}` : 'any';
    budgetHint.textContent = `Seller's estimated typical price range: ${min} - ${max}`;
  }

  const allowedTypes = Array.isArray(cfg.allowed_types) ? cfg.allowed_types : ['text'];
  let fieldsHtml = '';

  if (allowedTypes.includes('text') || allowedTypes.includes('engraving')) {
    fieldsHtml += `
      <div class="form-group">
        <label class="form-label">Custom Text / Engraving / Names *</label>
        <input type="text" name="req_text" class="form-input" placeholder="e.g. 'Aarav & Priya — 24.11.2024' or custom quote" required>
      </div>
    `;
  }

  if (allowedTypes.includes('color') || allowedTypes.includes('material')) {
    fieldsHtml += `
      <div class="form-group">
        <label class="form-label">Preferred Color Palette / Materials</label>
        <input type="text" name="req_color" class="form-input" placeholder="e.g. Sage Green with Gold highlights, Terracotta">
      </div>
    `;
  }

  if (allowedTypes.includes('size') || allowedTypes.includes('dimensions')) {
    fieldsHtml += `
      <div class="form-group">
        <label class="form-label">Specific Dimensions or Size Requirements</label>
        <input type="text" name="req_size" class="form-input" placeholder="e.g. 12x12 inches, Medium, custom wrist size">
      </div>
    `;
  }

  fieldsHtml += `
    <div class="form-group">
      <label class="form-label">Additional Custom Notes / Special Wishes</label>
      <textarea name="req_notes" class="form-textarea" rows="3" placeholder="Any specific details, packaging preferences, or design inspirations..."></textarea>
    </div>
  `;

  // Reference images upload
  if (cfg.ref_image_mode !== 'na') {
    const isReq = cfg.ref_image_mode === 'required';
    fieldsHtml += `
      <div class="form-group">
        <label class="form-label">Reference Image / Sketch (${isReq ? 'Required *' : 'Optional'})</label>
        <input type="file" id="refImageFile" class="form-input" accept="image/*" ${isReq ? 'required' : ''}>
        <span class="form-helper">Upload a reference photo, sketch, or color sample</span>
      </div>
    `;
  }

  dynamicFieldsContainer.innerHTML = fieldsHtml;

  // Restore draft if saved previously
  restoreDraft();

  // Attach event listeners to auto-persist inputs
  form.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', saveDraft);
    el.addEventListener('change', saveDraft);
  });

  const fileInput = document.getElementById('refImageFile');
  if (fileInput) {
    fileInput.addEventListener('change', handleImageUpload);
  }
}

let uploadedImageBase64 = null;

function handleImageUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (uploadEvent) => {
    uploadedImageBase64 = uploadEvent.target.result;
    saveDraft();

    // Render / update image preview
    let previewContainer = document.getElementById('refImagePreview');
    if (!previewContainer) {
      previewContainer = document.createElement('div');
      previewContainer.id = 'refImagePreview';
      previewContainer.style.marginTop = 'var(--space-2)';
      e.target.parentNode.appendChild(previewContainer);
    }
    previewContainer.innerHTML = `
      <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 12px; background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-sm);">
        <img src="${uploadedImageBase64}" style="width:36px; height:36px; object-fit:cover; border-radius:4px;" alt="Reference">
        <span class="text-xs" style="color:var(--color-primary); font-weight:500;">Reference attached</span>
        <button type="button" onclick="window.removeRefImage()" style="background:none; border:none; color:var(--color-error); cursor:pointer; font-size:14px;">✕</button>
      </div>
    `;
  };
  reader.readAsDataURL(file);
}

window.removeRefImage = () => {
  uploadedImageBase64 = null;
  const fileInput = document.getElementById('refImageFile');
  if (fileInput) fileInput.value = '';
  document.getElementById('refImagePreview')?.remove();
  saveDraft();
};

function saveDraft() {
  if (!productId) return;
  const draft = {
    budget: form.querySelector('[name="budget"]')?.value || '',
    deadline: form.querySelector('[name="deadline"]')?.value || '',
    req_text: form.querySelector('[name="req_text"]')?.value || '',
    req_color: form.querySelector('[name="req_color"]')?.value || '',
    req_size: form.querySelector('[name="req_size"]')?.value || '',
    req_notes: form.querySelector('[name="req_notes"]')?.value || '',
    general_requirements: form.querySelector('[name="general_requirements"]')?.value || '',
    uploadedImage: uploadedImageBase64
  };
  try {
    sessionStorage.setItem(`tohfa_custom_draft_${productId}`, JSON.stringify(draft));
  } catch (e) {
    console.error('Failed to save customization draft:', e);
  }
}

function restoreDraft() {
  if (!productId) return;
  try {
    const raw = sessionStorage.getItem(`tohfa_custom_draft_${productId}`);
    if (!raw) return;
    const draft = JSON.parse(raw);

    Object.keys(draft).forEach(key => {
      if (key === 'uploadedImage' && draft.uploadedImage) {
        uploadedImageBase64 = draft.uploadedImage;
        const fileInput = document.getElementById('refImageFile');
        if (fileInput) {
          let previewContainer = document.getElementById('refImagePreview');
          if (!previewContainer) {
            previewContainer = document.createElement('div');
            previewContainer.id = 'refImagePreview';
            previewContainer.style.marginTop = 'var(--space-2)';
            fileInput.parentNode.appendChild(previewContainer);
          }
          previewContainer.innerHTML = `
            <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 12px; background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-sm);">
              <img src="${uploadedImageBase64}" style="width:36px; height:36px; object-fit:cover; border-radius:4px;" alt="Reference">
              <span class="text-xs" style="color:var(--color-primary); font-weight:500;">Reference attached</span>
              <button type="button" onclick="window.removeRefImage()" style="background:none; border:none; color:var(--color-error); cursor:pointer; font-size:14px;">✕</button>
            </div>
          `;
        }
      } else {
        const input = form.querySelector(`[name="${key}"]`);
        if (input && draft[key]) {
          input.value = draft[key];
        }
      }
    });
  } catch (e) {
    console.error('Failed to restore customization draft:', e);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.classList.add('btn-loading');
  submitBtn.disabled = true;

  try {
    const formData = new FormData(form);
    const requirements = {};

    formData.forEach((val, key) => {
      if (key.startsWith('req_') && val) {
        requirements[key.replace('req_', '')] = val;
      }
    });

    const payload = {
      product_id: productId,
      requirements: Object.keys(requirements).length ? requirements : { description: formData.get('general_requirements') },
      budget: formData.get('budget') ? Number(formData.get('budget')) : null,
      deadline: formData.get('deadline') || null,
      ref_images: uploadedImageBase64 ? [uploadedImageBase64] : [],
    };

    const refFileEl = document.getElementById('refImageFile');
    if (refFileEl && refFileEl.files && refFileEl.files.length > 0) {
      const token = sessionStorage.getItem('tohfa_access_token') || localStorage.getItem('tohfa_access_token') || localStorage.getItem('auth_token');
      const uploadData = new FormData();
      for (const file of refFileEl.files) {
        uploadData.append('images', file);
      }
      try {
        const uploadRes = await fetch('/api/customization/ref-images', {
          method: 'POST',
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: uploadData
        });
        const uploadJson = await uploadRes.json().catch(() => ({}));
        if (uploadJson.data?.images) {
          payload.ref_images = uploadJson.data.images.map(img => img.url || img);
        } else if (uploadJson.url) {
          payload.ref_images = [uploadJson.url];
        }
      } catch (uploadErr) {
        console.warn('Ref image upload note:', uploadErr);
      }
    }

    // Persist cart customization metadata per product
    const cartCustomizationMeta = {
      ...payload.requirements,
      budget: payload.budget,
      deadline: payload.deadline,
      ref_images: payload.ref_images
    };
    sessionStorage.setItem(`tohfa_cart_customization_${productId}`, JSON.stringify(cartCustomizationMeta));


    // Also add customized item to cart
    try {
      await handleAddToCartWithCustomization(productId, payload);
    } catch (_) {}

    // Clear draft on successful submission
    sessionStorage.removeItem(`tohfa_custom_draft_${productId}`);

    const isBuyNow = urlParams.get('buyNow') === 'true' || urlParams.get('buynow') === 'true';

    showToast('Customization details saved! 🎨', 'success');
    setTimeout(() => {
      if (isBuyNow) {
        window.location.href = './checkout.html';
      } else {
        window.location.href = './profile.html?tab=customizations';
      }
    }, 1000);
  } catch (err) {
    showToast(err.message || 'Submission failed.', 'error');
    submitBtn.classList.remove('btn-loading');
    submitBtn.disabled = false;
  }
});

export async function handleAddToCartWithCustomization(prodId, payload) {
  const targetId = prodId || productId;
  const isBuyNow = urlParams.get('buyNow') === 'true' || urlParams.get('buynow') === 'true';
  const cartCustomizationMeta = {
    ...(payload?.requirements || payload || {}),
    budget: payload?.budget,
    deadline: payload?.deadline,
    ref_images: payload?.ref_images || []
  };
  
  if (targetId) {
    sessionStorage.setItem(`tohfa_cart_customization_${targetId}`, JSON.stringify(cartCustomizationMeta));
  }

  const cartPayload = {
    product_id: Number(targetId),
    quantity: 1,
    customization_data: cartCustomizationMeta
  };

  let res;
  try {
    res = await api.post('/api/cart', cartPayload);
  } catch (err) {
    res = await api.post('/api/cart/items', cartPayload).catch(() => null);
  }

  if (isBuyNow) {
    window.location.href = './checkout.html';
  }
  return res;
}
window.handleAddToCartWithCustomization = handleAddToCartWithCustomization;

export async function uploadMedia(file, folder = 'tohfa_customization') {
  const token = sessionStorage.getItem('tohfa_access_token') || localStorage.getItem('tohfa_access_token') || localStorage.getItem('auth_token');
  const compressed = await compressImage(file);
  const formData = new FormData();
  formData.append('file', compressed);
  formData.append('folder', folder);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      // Do NOT set Content-Type header manually
    },
    body: formData
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || 'Image upload failed');
  return json.url || json.data?.url;
}

loadConfig();
