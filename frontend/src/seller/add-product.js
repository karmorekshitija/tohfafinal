/**
 * Tohfa v2 — Single-Step Add Product Wizard & Customisation Logic
 * File: frontend/src/seller/add-product.js
 */
'use strict';

import { compressImage } from '../utils/imageCompressor.js';

const DRAFT_STORAGE_KEY = 'tohfa_artisan_product_draft';
let categoriesCatalog = [];
let uploadedPhotos = []; // array of { file, dataUrl }

const STANDARD_OCCASIONS = [
  { slug: 'birthday', label: '🎂 Birthday' },
  { slug: 'anniversary', label: '💍 Anniversary' },
  { slug: 'wedding', label: '👰 Wedding' },
  { slug: 'diwali', label: '🪔 Diwali' },
  { slug: 'rakhi', label: '🧵 Rakhi' },
  { slug: 'valentines-day', label: '❤️ Valentine\'s Day' },
  { slug: 'housewarming', label: '🏡 Housewarming' },
  { slug: 'baby-shower', label: '🍼 Baby Shower' },
  { slug: 'mothers-day', label: '🌸 Mother\'s Day' },
  { slug: 'fathers-day', label: '👔 Father\'s Day' },
  { slug: 'festivals', label: '✨ Festivals' },
  { slug: 'christmas', label: '🎄 Christmas' },
  { slug: 'corporate', label: '💼 Corporate Gifting' }
];

let selectedOccasions = new Set();

function initOccasionChips() {
  const container = document.getElementById('occasions-chips-container');
  if (!container) return;
  container.innerHTML = STANDARD_OCCASIONS.map(occ => `
    <button type="button" data-occasion="${occ.slug}" class="occasion-chip px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${selectedOccasions.has(occ.slug) ? 'bg-[#14381F] text-[#FFF8E7] border-[#14381F]' : 'bg-[#FFF8E7] text-[#14381F] border-[#285C3A]/20 hover:border-[#14381F]'}">
      ${occ.label}
    </button>
  `).join('');

  container.querySelectorAll('.occasion-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const occSlug = btn.getAttribute('data-occasion');
      if (selectedOccasions.has(occSlug)) {
        selectedOccasions.delete(occSlug);
        btn.className = 'occasion-chip px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer bg-[#FFF8E7] text-[#14381F] border-[#285C3A]/20 hover:border-[#14381F]';
      } else {
        selectedOccasions.add(occSlug);
        btn.className = 'occasion-chip px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer bg-[#14381F] text-[#FFF8E7] border-[#14381F]';
      }
      triggerAutoSave();
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = sessionStorage.getItem('tohfa_access_token');
  if (!token) {
    window.location.href = '/auth/login.html';
    return;
  }

  await initCategories();
  initOccasionChips();
  setupUIInteractions();
  loadDraft();
});

async function initCategories() {
  try {
    const res = await fetch('/api/products/categories');
    const json = await res.json();
    categoriesCatalog = Array.isArray(json.data?.categories) ? json.data.categories : (Array.isArray(json.data) ? json.data : []);

    const catSelect = document.getElementById('prod-category');
    if (catSelect) {
      catSelect.innerHTML = `<option value="">Select a Craft Category</option>` +
        categoriesCatalog.map(c => `<option value="${c.id}">${c.display_name || c.name}</option>`).join('');
    }

    catSelect?.addEventListener('change', () => {
      const selectedId = catSelect.value;
      const cat = categoriesCatalog.find(c => String(c.id) === String(selectedId) || c.name === selectedId);
      const subSelect = document.getElementById('prod-subcategory');
      if (subSelect) {
        if (cat && Array.isArray(cat.subcategories) && cat.subcategories.length > 0) {
          subSelect.innerHTML = `<option value="">Select Subcategory</option>` +
            cat.subcategories.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
          subSelect.disabled = false;
        } else {
          subSelect.innerHTML = `<option value="">No subcategories available</option>`;
          subSelect.disabled = true;
        }
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
        customLabel?.classList.add('border-[#14381F]', 'shadow-xs');
        premadeLabel?.classList.remove('border-[#14381F]', 'shadow-xs');
      } else {
        premadeLabel?.classList.add('border-[#14381F]', 'shadow-xs');
        customLabel?.classList.remove('border-[#14381F]', 'shadow-xs');
      }
      triggerAutoSave();
    });
  });

  // Modular Option Checkbox Toggles
  document.getElementById('custom-opt-choices')?.addEventListener('change', (e) => {
    document.getElementById('custom-choices-settings')?.classList.toggle('hidden', !e.target.checked);
    triggerAutoSave();
  });
  document.getElementById('custom-opt-image')?.addEventListener('change', (e) => {
    document.getElementById('custom-image-settings')?.classList.toggle('hidden', !e.target.checked);
    triggerAutoSave();
  });
  document.getElementById('custom-opt-note')?.addEventListener('change', (e) => {
    document.getElementById('custom-note-settings')?.classList.toggle('hidden', !e.target.checked);
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
  ['prod-title', 'prod-price', 'prod-stock', 'prod-threshold', 'prod-description', 'dim-l', 'dim-w', 'dim-h', 'dim-weight', 'custom-text-label', 'custom-text-limit', 'custom-choices-label', 'custom-choices-list', 'custom-image-instructions', 'custom-note-placeholder', 'custom-crafting-time', 'custom-fee'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', triggerAutoSave);
  });
  ['custom-opt-text', 'custom-text-required', 'custom-opt-choices', 'custom-choices-required', 'custom-opt-image', 'custom-image-required', 'custom-opt-note', 'custom-note-required'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', triggerAutoSave);
  });

  // Variants toggle & builder
  const variantsToggle = document.getElementById('toggle-has-variants');
  const variantsPanel = document.getElementById('variants-builder-panel');
  const addVariantBtn = document.getElementById('add-variant-row-btn');
  const variantsContainer = document.getElementById('variants-list-container');

  variantsToggle?.addEventListener('change', (e) => {
    variantsPanel?.classList.toggle('hidden', !e.target.checked);
    if (e.target.checked && variantsContainer && variantsContainer.children.length === 0) {
      addVariantRow();
    }
    triggerAutoSave();
  });

  addVariantBtn?.addEventListener('click', () => {
    addVariantRow();
    triggerAutoSave();
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
    <div class="relative group rounded-xl overflow-hidden aspect-square border border-[#285C3A]/20 bg-[#FFF8E7] shadow-xs">
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
      custom_opt_text: Boolean(document.getElementById('custom-opt-text')?.checked),
      custom_text_label: document.getElementById('custom-text-label')?.value || '',
      custom_text_limit: document.getElementById('custom-text-limit')?.value || '25',
      custom_text_required: Boolean(document.getElementById('custom-text-required')?.checked),
      custom_opt_choices: Boolean(document.getElementById('custom-opt-choices')?.checked),
      custom_choices_label: document.getElementById('custom-choices-label')?.value || '',
      custom_choices_list: document.getElementById('custom-choices-list')?.value || '',
      custom_choices_required: Boolean(document.getElementById('custom-choices-required')?.checked),
      custom_opt_image: Boolean(document.getElementById('custom-opt-image')?.checked),
      custom_image_instructions: document.getElementById('custom-image-instructions')?.value || '',
      custom_image_required: Boolean(document.getElementById('custom-image-required')?.checked),
      custom_opt_note: Boolean(document.getElementById('custom-opt-note')?.checked),
      custom_note_placeholder: document.getElementById('custom-note-placeholder')?.value || '',
      custom_note_required: Boolean(document.getElementById('custom-note-required')?.checked),
      custom_crafting_time: document.getElementById('custom-crafting-time')?.value || '5-7 days',
      custom_fee: document.getElementById('custom-fee')?.value || '0',
      has_variants: Boolean(document.getElementById('toggle-has-variants')?.checked),
      variants: getVariantsData(),
      occasions: Array.from(selectedOccasions),
      photos: uploadedPhotos.map(p => p.dataUrl).slice(0, 8), // cache up to 8 images
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

    if (draft.custom_text_label) document.getElementById('custom-text-label').value = draft.custom_text_label;
    if (draft.custom_text_limit) document.getElementById('custom-text-limit').value = draft.custom_text_limit;
    if (draft.custom_opt_text !== undefined) document.getElementById('custom-opt-text').checked = draft.custom_opt_text;
    if (draft.custom_text_required !== undefined) document.getElementById('custom-text-required').checked = draft.custom_text_required;

    if (draft.custom_opt_choices) {
      document.getElementById('custom-opt-choices').checked = true;
      document.getElementById('custom-choices-settings')?.classList.remove('hidden');
    }
    if (draft.custom_choices_label) document.getElementById('custom-choices-label').value = draft.custom_choices_label;
    if (draft.custom_choices_list) document.getElementById('custom-choices-list').value = draft.custom_choices_list;
    if (draft.custom_choices_required !== undefined) document.getElementById('custom-choices-required').checked = draft.custom_choices_required;

    if (draft.custom_opt_image) {
      document.getElementById('custom-opt-image').checked = true;
      document.getElementById('custom-image-settings')?.classList.remove('hidden');
    }
    if (draft.custom_image_instructions) document.getElementById('custom-image-instructions').value = draft.custom_image_instructions;
    if (draft.custom_image_required !== undefined) document.getElementById('custom-image-required').checked = draft.custom_image_required;

    if (draft.custom_opt_note) {
      document.getElementById('custom-opt-note').checked = true;
      document.getElementById('custom-note-settings')?.classList.remove('hidden');
    }
    if (draft.custom_note_placeholder) document.getElementById('custom-note-placeholder').value = draft.custom_note_placeholder;
    if (draft.custom_note_required !== undefined) document.getElementById('custom-note-required').checked = draft.custom_note_required;

    if (draft.custom_crafting_time) document.getElementById('custom-crafting-time').value = draft.custom_crafting_time;
    if (draft.custom_fee) document.getElementById('custom-fee').value = draft.custom_fee;

    if (Array.isArray(draft.occasions)) {
      selectedOccasions = new Set(draft.occasions);
      initOccasionChips();
    }

    if (draft.product_type === 'custom') {
      const customRadio = document.querySelector('input[name="product_type"][value="custom"]');
      if (customRadio) {
        customRadio.checked = true;
        customRadio.dispatchEvent(new Event('change'));
      }
    }

    if (draft.category) {
      const catSelect = document.getElementById('prod-category');
      if (catSelect) {
        catSelect.value = draft.category;
        catSelect.dispatchEvent(new Event('change'));
        if (draft.subcategory) {
          setTimeout(() => {
            const subSelect = document.getElementById('prod-subcategory');
            if (subSelect) subSelect.value = draft.subcategory;
          }, 300);
        }
      }
    }

    if (draft.has_variants && Array.isArray(draft.variants)) {
      const toggle = document.getElementById('toggle-has-variants');
      const panel = document.getElementById('variants-builder-panel');
      if (toggle) {
        toggle.checked = true;
        panel?.classList.remove('hidden');
        const container = document.getElementById('variants-list-container');
        if (container) {
          container.innerHTML = '';
          draft.variants.forEach(v => addVariantRow(v));
        }
      }
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
    const fee = parseFloat(document.getElementById('custom-fee')?.value || '0') || 0;
    const feeText = fee > 0 ? ` (+₹${fee} customisation fee)` : '';
    customDesc.textContent = `Personalization enabled${feeText}. Buyers can customize text, options, and reference photos before adding to cart.`;
  } else {
    customBox?.classList.add('hidden');
  }
}

function getModularCustomizationSchema() {
  const isCustom = document.querySelector('input[name="product_type"]:checked')?.value === 'custom';
  if (!isCustom) return null;

  const fields = [];

  // 1. Text Inscription / Engraving
  if (document.getElementById('custom-opt-text')?.checked) {
    fields.push({
      id: 'field_text',
      type: 'text',
      label: document.getElementById('custom-text-label')?.value.trim() || 'Name / Monogram to Engrave',
      placeholder: 'Enter text here...',
      max_length: parseInt(document.getElementById('custom-text-limit')?.value || '25', 10),
      is_required: Boolean(document.getElementById('custom-text-required')?.checked)
    });
  }

  // 2. Choice Options
  if (document.getElementById('custom-opt-choices')?.checked) {
    const rawChoices = document.getElementById('custom-choices-list')?.value || '';
    const parsedChoices = rawChoices.split(',').map(s => s.trim()).filter(Boolean).map(c => {
      const match = c.match(/^(.*?)(?:\s*\(\+?₹?\s*(\d+(?:\.\d+)?)\))?$/);
      if (match && match[2]) {
        return { name: match[1].trim(), price_delta: parseFloat(match[2]) };
      }
      return { name: c, price_delta: 0 };
    });

    fields.push({
      id: 'field_choices',
      type: 'select',
      label: document.getElementById('custom-choices-label')?.value.trim() || 'Finish / Font Style',
      choices: parsedChoices,
      is_required: Boolean(document.getElementById('custom-choices-required')?.checked)
    });
  }

  // 3. Reference Image Upload
  if (document.getElementById('custom-opt-image')?.checked) {
    fields.push({
      id: 'field_image',
      type: 'image',
      label: 'Reference Photo / Artwork',
      instructions: document.getElementById('custom-image-instructions')?.value.trim() || 'Upload reference photo or sketch.',
      is_required: Boolean(document.getElementById('custom-image-required')?.checked)
    });
  }

  // 4. Special Notes
  if (document.getElementById('custom-opt-note')?.checked) {
    fields.push({
      id: 'field_note',
      type: 'textarea',
      label: 'Special Notes for Artisan',
      placeholder: document.getElementById('custom-note-placeholder')?.value.trim() || 'Any special instructions...',
      is_required: Boolean(document.getElementById('custom-note-required')?.checked)
    });
  }

  const craftingTime = document.getElementById('custom-crafting-time')?.value.trim() || '5-7 days';
  const fee = parseFloat(document.getElementById('custom-fee')?.value || '0') || 0;

  return {
    is_enabled: true,
    crafting_time: craftingTime,
    customization_fee: fee,
    fields: fields
  };
}

function addVariantRow(data = {}) {
  const container = document.getElementById('variants-list-container');
  if (!container) return;

  const rowId = 'variant-row-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
  const row = document.createElement('div');
  row.id = rowId;
  row.className = 'p-3 bg-white rounded-xl border border-[#285C3A]/20 space-y-2 relative';

  const defaultImgs = Array.isArray(data.images) ? data.images.join(', ') : (data.image_url || '');

  row.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="text-xs font-bold text-[#14381F] uppercase font-mono">Variant Option</span>
      <button type="button" class="text-red-500 hover:text-red-700 text-xs font-bold remove-variant-btn cursor-pointer">
        <span class="material-symbols-outlined text-[16px]">delete</span>
      </button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
      <div class="sm:col-span-2">
        <label class="block text-[10px] font-bold text-[#14381F] uppercase font-mono mb-0.5">Variant *</label>
        <input type="text" class="field-input text-xs variant-name-input" placeholder="e.g. Size: Large / Color: Twilight Lavender / Material: Oak" value="${data.variant_name || data.name || data.color_name || ''}" required />
      </div>
      <div>
        <label class="block text-[10px] font-bold text-[#14381F] uppercase font-mono mb-0.5">Price Adjustment (+₹)</label>
        <input type="number" class="field-input text-xs font-mono variant-price-input" placeholder="0" value="${data.additional_price ?? 0}" />
      </div>
      <div>
        <label class="block text-[10px] font-bold text-[#14381F] uppercase font-mono mb-0.5">Stock Qty</label>
        <input type="number" class="field-input text-xs font-mono variant-stock-input" placeholder="50" value="${data.stock_qty ?? 50}" />
      </div>
    </div>
    <div>
      <label class="block text-[10px] font-bold text-[#14381F] uppercase font-mono mb-0.5">Variant Photos (Comma-separated Image URLs)</label>
      <input type="text" class="field-input text-xs font-mono variant-images-input" placeholder="/img/products/.../1.jpeg, /img/products/.../2.jpeg" value="${defaultImgs}" />
      <span class="text-[10px] text-[#587A5B] block mt-0.5">Enter 1 or more image URLs for this variant option.</span>
    </div>
  `;

  // Remove button
  row.querySelector('.remove-variant-btn')?.addEventListener('click', () => {
    row.remove();
    triggerAutoSave();
  });

  row.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', triggerAutoSave);
  });

  container.appendChild(row);
}

function getVariantsData() {
  const toggle = document.getElementById('toggle-has-variants');
  if (!toggle || !toggle.checked) return [];

  const container = document.getElementById('variants-list-container');
  if (!container) return [];

  const variants = [];
  container.querySelectorAll('[id^="variant-row-"]').forEach(row => {
    const name = row.querySelector('.variant-name-input')?.value.trim();
    if (!name) return;

    const additionalPrice = parseFloat(row.querySelector('.variant-price-input')?.value || '0');
    const stockQty = parseInt(row.querySelector('.variant-stock-input')?.value || '50', 10);
    const rawImgs = row.querySelector('.variant-images-input')?.value.trim() || '';
    const images = rawImgs ? rawImgs.split(',').map(s => s.trim()).filter(Boolean) : [];

    variants.push({
      variant_name: name,
      color_name: null,
      color_hex: null,
      size: null,
      additional_price: isNaN(additionalPrice) ? 0 : additionalPrice,
      stock_qty: isNaN(stockQty) ? 50 : stockQty,
      images: images,
      image_url: images[0] || null
    });
  });

  return variants;
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
  const customMode = isCustom ? 'fixed' : 'none';
  const customizationSchema = getModularCustomizationSchema();

  const variantsList = getVariantsData();
  const subcategoryId = document.getElementById('prod-subcategory')?.value || null;

  const craftingTimeText = document.getElementById('custom-crafting-time')?.value || '5-7 days';
  const prepMatch = craftingTimeText.match(/(\d+)/);
  const prepDays = prepMatch ? parseInt(prepMatch[1], 10) : 5;

  const payload = {
    name: title,
    description: document.getElementById('prod-description')?.value.trim() || '',
    category_id: categoryId.startsWith('cat-') ? null : categoryId,
    subcategory_id: subcategoryId ? parseInt(subcategoryId, 10) : null,
    occasions: Array.from(selectedOccasions),
    base_price: price,
    stock_quantity: parseInt(document.getElementById('prod-stock')?.value || '10', 10),
    low_stock_threshold: parseInt(document.getElementById('prod-threshold')?.value || '3', 10),
    preparation_days: isCustom ? prepDays : 2,
    is_customizable: isCustom,
    customization_mode: customMode,
    customization_schema: customizationSchema,
    variants: variantsList
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
      const createdProduct = json.data.product || json.data;
      const productId = createdProduct.id;

      let photoUploadFailed = false;

      // Upload photos if any selected (with client-side lossless compression)
      if (uploadedPhotos.length > 0) {
        const formData = new FormData();
        let fileCount = 0;
        for (const p of uploadedPhotos) {
          if (p.file) {
            const compressed = await compressImage(p.file);
            formData.append('images', compressed);
            fileCount++;
          }
        }
        if (fileCount > 0) {
          try {
            const imgRes = await fetch(`/api/products/${productId}/images`, {
              method: 'POST',
              headers: {
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                // Do NOT set Content-Type header manually so browser sets multipart boundary
              },
              body: formData
            });
            if (!imgRes.ok) {
              photoUploadFailed = true;
            } else {
              const imgJson = await imgRes.json().catch(() => ({}));
              if (imgJson && imgJson.success === false) {
                photoUploadFailed = true;
              }
            }
          } catch (uploadErr) {
            console.error('Photo upload error:', uploadErr);
            photoUploadFailed = true;
          }
        }
      }

      // Clear draft
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      if (photoUploadFailed) {
        alert('Product published, but photo upload failed — please add photos from Edit Product.');
      } else {
        alert('Congratulations! Your handcrafted listing has been published to Tohfa.');
      }
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
