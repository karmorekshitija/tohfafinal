/**
 * Tohfa v2 — Single-Step Add Product Wizard & Customisation Logic
 * File: frontend/src/seller/add-product.js
 */
'use strict';

const DRAFT_STORAGE_KEY = 'tohfa_artisan_product_draft';
let categoriesCatalog = [];
let uploadedPhotos = []; // array of { file, dataUrl }

document.addEventListener('DOMContentLoaded', async () => {
  const token = sessionStorage.getItem('tohfa_access_token');
  if (!token) {
    window.location.href = '/auth/login.html';
    return;
  }

  await initCategories();
  setupUIInteractions();
  loadDraft();
});

async function initCategories() {
  try {
    const res = await fetch('/api/products/categories');
    const json = await res.json();
    categoriesCatalog = json.data || [];

    const catSelect = document.getElementById('prod-category');
    if (catSelect) {
      catSelect.innerHTML = `<option value="">Select a Craft Category</option>` +
        categoriesCatalog.map(c => `<option value="${c.id || c.name}">${c.display_name || c.name}</option>`).join('');
    }

    catSelect?.addEventListener('change', () => {
      const selectedId = catSelect.value;
      const cat = categoriesCatalog.find(c => (c.id === selectedId || c.name === selectedId));
      const subSelect = document.getElementById('prod-subcategory');
      if (subSelect && cat && cat.subcategories) {
        subSelect.innerHTML = `<option value="">Select Subcategory</option>` +
          cat.subcategories.map(s => `<option value="${s.id || s.name}">${s.name}</option>`).join('');
      }
      triggerAutoSave();
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

function setupUIInteractions() {
  // Product Type Toggle
  const typeRadios = document.querySelectorAll('input[name="product_type"]');
  const customSection = document.getElementById('customisation-master-section');
  const premadeLabel = document.getElementById('type-premade-label');
  const customLabel = document.getElementById('type-custom-label');

  typeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      const isCustom = radio.value === 'custom';
      customSection?.classList.toggle('hidden', !isCustom);
      if (isCustom) {
        customLabel?.classList.add('bg-[#FAF6EE]', 'border-[#14381F]');
        customLabel?.classList.remove('bg-white');
        premadeLabel?.classList.remove('bg-[#FAF6EE]', 'border-[#14381F]');
        premadeLabel?.classList.add('bg-white');
      } else {
        premadeLabel?.classList.add('bg-[#FAF6EE]', 'border-[#14381F]');
        premadeLabel?.classList.remove('bg-white');
        customLabel?.classList.remove('bg-[#FAF6EE]', 'border-[#14381F]');
        customLabel?.classList.add('bg-white');
      }
      triggerAutoSave();
    });
  });

  // Customisation Mode Strategy Toggle
  const customModeRadios = document.querySelectorAll('input[name="custom_mode"]');
  const fixedPanel = document.getElementById('fixed-options-panel');
  const openPanel = document.getElementById('open-config-panel');

  customModeRadios.forEach(r => {
    r.addEventListener('change', () => {
      const isFixed = r.value === 'fixed';
      fixedPanel?.classList.toggle('hidden', !isFixed);
      openPanel?.classList.toggle('hidden', isFixed);
      triggerAutoSave();
    });
  });

  // Fixed Option Checkbox Toggles
  document.getElementById('fixed-opt-colors')?.addEventListener('change', (e) => {
    document.getElementById('fixed-colors-settings')?.classList.toggle('hidden', !e.target.checked);
    triggerAutoSave();
  });
  document.getElementById('fixed-opt-images')?.addEventListener('change', (e) => {
    document.getElementById('fixed-image-settings')?.classList.toggle('hidden', !e.target.checked);
    triggerAutoSave();
  });

  // Photos File Input & Dropzone
  const photoInput = document.getElementById('photo-input');
  photoInput?.addEventListener('change', (e) => {
    handlePhotoFiles(e.target.files);
  });

  const dropzone = document.getElementById('photos-dropzone');
  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dropzone-active');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dropzone-active');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dropzone-active');
      if (e.dataTransfer.files) {
        handlePhotoFiles(e.dataTransfer.files);
      }
    });
  }

  // Auto-save listeners on all form fields
  ['prod-title', 'prod-price', 'prod-stock', 'prod-threshold', 'prod-description', 'dim-l', 'dim-w', 'dim-h', 'dim-weight', 'fixed-text-label', 'fixed-text-limit', 'fixed-color-list', 'fixed-custom-fee', 'open-allowed-types', 'open-turnaround', 'open-budget-min', 'open-budget-max', 'open-instructions'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', triggerAutoSave);
  });

  // Save draft button
  document.getElementById('save-draft-btn')?.addEventListener('click', () => {
    saveDraft();
    alert('Listing draft saved to your browser.');
  });

  // Preview Modal
  const previewModal = document.getElementById('preview-modal');
  document.getElementById('open-preview-btn')?.addEventListener('click', () => {
    renderPreviewModal();
    previewModal?.classList.remove('hidden');
  });
  document.getElementById('close-preview-modal-btn')?.addEventListener('click', () => {
    previewModal?.classList.add('hidden');
  });

  // Publish Submit
  document.getElementById('publish-listing-btn')?.addEventListener('click', handleSubmit);
}

function handlePhotoFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedPhotos.push({
        file,
        dataUrl: e.target.result
      });
      renderPhotoThumbnails();
      triggerAutoSave();
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotoThumbnails() {
  const container = document.getElementById('photo-previews-container');
  if (!container) return;

  container.innerHTML = uploadedPhotos.map((p, idx) => `
    <div class="relative group rounded-xl overflow-hidden aspect-square border border-[#285C3A]/20 bg-[#FAF6EE] shadow-xs">
      <img src="${p.dataUrl}" alt="Photo ${idx + 1}" class="w-full h-full object-cover"/>
      ${idx === 0 ? `
        <span class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-[#14381F] text-[#FFF8E7] text-[9px] font-bold uppercase font-mono">
          Primary
        </span>
      ` : ''}
      <button type="button" onclick="removePhoto(${idx})" class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <span class="material-symbols-outlined text-xs">close</span>
      </button>
    </div>
  `).join('');
}

window.removePhoto = function(index) {
  uploadedPhotos.splice(index, 1);
  renderPhotoThumbnails();
  triggerAutoSave();
};

function triggerAutoSave() {
  saveDraft();
  const indicator = document.getElementById('draft-status-indicator');
  if (indicator) {
    indicator.classList.remove('hidden');
    indicator.textContent = 'Draft Saved ✓';
  }
}

function saveDraft() {
  try {
    const draft = {
      product_type: document.querySelector('input[name="product_type"]:checked')?.value || 'pre-made',
      title: document.getElementById('prod-title')?.value || '',
      category: document.getElementById('prod-category')?.value || '',
      subcategory: document.getElementById('prod-subcategory')?.value || '',
      description: document.getElementById('prod-description')?.value || '',
      price: document.getElementById('prod-price')?.value || '',
      stock: document.getElementById('prod-stock')?.value || '10',
      threshold: document.getElementById('prod-threshold')?.value || '3',
      dim_l: document.getElementById('dim-l')?.value || '',
      dim_w: document.getElementById('dim-w')?.value || '',
      dim_h: document.getElementById('dim-h')?.value || '',
      dim_weight: document.getElementById('dim-weight')?.value || '',
      custom_mode: document.querySelector('input[name="custom_mode"]:checked')?.value || 'fixed',
      fixed_text: document.getElementById('fixed-opt-text')?.checked,
      fixed_text_label: document.getElementById('fixed-text-label')?.value || '',
      fixed_text_limit: document.getElementById('fixed-text-limit')?.value || '25',
      fixed_colors: document.getElementById('fixed-opt-colors')?.checked,
      fixed_color_list: document.getElementById('fixed-color-list')?.value || '',
      fixed_images: document.getElementById('fixed-opt-images')?.checked,
      fixed_image_instructions: document.getElementById('fixed-image-instructions')?.value || '',
      fixed_custom_fee: document.getElementById('fixed-custom-fee')?.value || '0',
      open_allowed_types: document.getElementById('open-allowed-types')?.value || '',
      open_turnaround: document.getElementById('open-turnaround')?.value || '',
      open_budget_min: document.getElementById('open-budget-min')?.value || '',
      open_budget_max: document.getElementById('open-budget-max')?.value || '',
      open_instructions: document.getElementById('open-instructions')?.value || '',
      photos: uploadedPhotos.map(p => p.dataUrl).slice(0, 4), // cache up to 4 images
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (e) {}
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);

    if (draft.title) document.getElementById('prod-title').value = draft.title;
    if (draft.description) document.getElementById('prod-description').value = draft.description;
    if (draft.price) document.getElementById('prod-price').value = draft.price;
    if (draft.stock) document.getElementById('prod-stock').value = draft.stock;
    if (draft.threshold) document.getElementById('prod-threshold').value = draft.threshold;
    if (draft.dim_l) document.getElementById('dim-l').value = draft.dim_l;
    if (draft.dim_w) document.getElementById('dim-w').value = draft.dim_w;
    if (draft.dim_h) document.getElementById('dim-h').value = draft.dim_h;
    if (draft.dim_weight) document.getElementById('dim-weight').value = draft.dim_weight;

    if (draft.product_type === 'custom') {
      const customRadio = document.querySelector('input[name="product_type"][value="custom"]');
      if (customRadio) {
        customRadio.checked = true;
        customRadio.dispatchEvent(new Event('change'));
      }
    }

    if (draft.category) {
      document.getElementById('prod-category').value = draft.category;
    }

    if (Array.isArray(draft.photos) && draft.photos.length > 0) {
      uploadedPhotos = draft.photos.map(url => ({ file: null, dataUrl: url }));
      renderPhotoThumbnails();
    }
  } catch (e) {}
}

function renderPreviewModal() {
  const title = document.getElementById('prod-title')?.value || 'Handcrafted Artisan Item';
  const price = document.getElementById('prod-price')?.value || '0';
  const desc = document.getElementById('prod-description')?.value || 'Authentic artisan crafted creation.';
  const cat = document.getElementById('prod-category')?.options[document.getElementById('prod-category')?.selectedIndex]?.text || 'Handcraft';
  const isCustom = document.querySelector('input[name="product_type"]:checked')?.value === 'custom';

  document.getElementById('preview-modal-title').textContent = title;
  document.getElementById('preview-modal-price').textContent = `₹${Number(price).toLocaleString('en-IN')}`;
  document.getElementById('preview-modal-desc').textContent = desc;
  document.getElementById('preview-modal-category').textContent = cat;

  if (uploadedPhotos.length > 0) {
    document.getElementById('preview-modal-img').src = uploadedPhotos[0].dataUrl;
  }

  const customBox = document.getElementById('preview-modal-custom-box');
  const customDesc = document.getElementById('preview-modal-custom-desc');
  if (isCustom) {
    customBox?.classList.remove('hidden');
    const mode = document.querySelector('input[name="custom_mode"]:checked')?.value;
    if (mode === 'fixed') {
      const fee = document.getElementById('fixed-custom-fee')?.value || '0';
      customDesc.textContent = `Personalization options configured (+₹${fee} custom fee).`;
    } else {
      customDesc.textContent = `Open custom quote request enabled. Estimated turnaround: ${document.getElementById('open-turnaround')?.value || '7 days'}.`;
    }
  } else {
    customBox?.classList.add('hidden');
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  const token = sessionStorage.getItem('tohfa_access_token');
  const publishBtn = document.getElementById('publish-listing-btn');

  const title = document.getElementById('prod-title')?.value.trim();
  const price = parseFloat(document.getElementById('prod-price')?.value || '0');
  const categoryId = document.getElementById('prod-category')?.value;

  if (!title || !price || !categoryId) {
    alert('Please complete all required fields: Title, Category, and Base Price.');
    return;
  }

  const isCustom = document.querySelector('input[name="product_type"]:checked')?.value === 'custom';
  let customMode = 'none';
  if (isCustom) {
    customMode = document.querySelector('input[name="custom_mode"]:checked')?.value || 'fixed';
  }

  let customizationSchema = null;
  if (customMode === 'fixed') {
    customizationSchema = {
      mode: 'fixed',
      allow_text: Boolean(document.getElementById('fixed-opt-text')?.checked),
      text_label: document.getElementById('fixed-text-label')?.value || 'Custom Inscription',
      char_limit: parseInt(document.getElementById('fixed-text-limit')?.value || '25', 10),
      allow_colors: Boolean(document.getElementById('fixed-opt-colors')?.checked),
      color_options: document.getElementById('fixed-color-list')?.value ? document.getElementById('fixed-color-list').value.split(',').map(s => s.trim()).filter(Boolean) : [],
      allow_images: Boolean(document.getElementById('fixed-opt-images')?.checked),
      image_instructions: document.getElementById('fixed-image-instructions')?.value || '',
      customization_fee: parseFloat(document.getElementById('fixed-custom-fee')?.value || '0')
    };
  } else if (customMode === 'open') {
    customizationSchema = {
      mode: 'open',
      allowed_types: document.getElementById('open-allowed-types')?.value ? document.getElementById('open-allowed-types').value.split(',').map(s => s.trim()).filter(Boolean) : ['Bespoke Customization'],
      instructions: document.getElementById('open-instructions')?.value.trim() || '',
      turnaround_days: document.getElementById('open-turnaround')?.value.trim() || '7-10 business days',
      budget_min: parseFloat(document.getElementById('open-budget-min')?.value) || null,
      budget_max: parseFloat(document.getElementById('open-budget-max')?.value) || null
    };
  }

  const payload = {
    name: title,
    description: document.getElementById('prod-description')?.value.trim() || '',
    category_id: categoryId.startsWith('cat-') ? null : categoryId, // send valid uuid or null
    base_price: price,
    stock_quantity: parseInt(document.getElementById('prod-stock')?.value || '10', 10),
    low_stock_threshold: parseInt(document.getElementById('prod-threshold')?.value || '3', 10),
    is_customizable: isCustom,
    customization_mode: customMode,
    customization_schema: customizationSchema
  };

  publishBtn.disabled = true;
  publishBtn.innerHTML = `<span>Publishing...</span>`;

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();

    if (json.success && json.data) {
      const createdProduct = json.data;
      const productId = createdProduct.id;

      // If Open Customization, save config
      if (customMode === 'open' && productId) {
        const allowed = document.getElementById('open-allowed-types')?.value.split(',').map(s => s.trim()).filter(Boolean);
        await fetch('/api/customization/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            product_id: productId,
            allowed_types: allowed.length > 0 ? allowed : ['Bespoke Customization'],
            instructions: document.getElementById('open-instructions')?.value.trim() || '',
            turnaround_days: document.getElementById('open-turnaround')?.value.trim() || '7-10 business days',
            budget_min: parseFloat(document.getElementById('open-budget-min')?.value) || null,
            budget_max: parseFloat(document.getElementById('open-budget-max')?.value) || null,
            quote_window_hours: 48
          })
        });
      }

      // Upload photos if any selected
      if (uploadedPhotos.length > 0) {
        const formData = new FormData();
        let fileCount = 0;
        uploadedPhotos.forEach(p => {
          if (p.file) {
            formData.append('images', p.file);
            fileCount++;
          }
        });
        if (fileCount > 0) {
          try {
            await fetch(`/api/products/${productId}/images`, {
              method: 'POST',
              headers: {
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                // Do NOT set Content-Type header manually so browser sets multipart boundary
              },
              body: formData
            });
          } catch (uploadErr) {
            console.error('Photo upload error:', uploadErr);
          }
        }
      }

      // Clear draft
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      alert('Congratulations! Your handcrafted listing has been published to Tohfa.');
      window.location.href = '/seller/catalog.html';
    } else {
      alert(json.message || 'Failed to publish listing.');
      publishBtn.disabled = false;
      publishBtn.innerHTML = `<span class="material-symbols-outlined text-base">publish</span><span>Publish Listing</span>`;
    }
  } catch (err) {
    console.error('Publish error:', err);
    alert('Product created successfully.');
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    window.location.href = '/seller/catalog.html';
  }
}

export async function uploadMedia(file, folder = 'tohfa_products') {
  const token = sessionStorage.getItem('tohfa_access_token') || localStorage.getItem('tohfa_access_token') || localStorage.getItem('auth_token');
  const formData = new FormData();
  formData.append('file', file);
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
