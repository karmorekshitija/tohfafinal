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
    <button type="button" data-occasion="${occ.slug}" class="occasion-chip min-h-[44px] px-3.5 py-2 rounded-full text-xs font-medium border transition-all cursor-pointer ${selectedOccasions.has(occ.slug) ? 'bg-[#14381F] text-[#FFF8E7] border-[#14381F]' : 'bg-[#FFF8E7] text-[#14381F] border-[#285C3A]/20 hover:border-[#14381F]'}">
      ${occ.label}
    </button>
  `).join('');

  container.querySelectorAll('.occasion-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const occSlug = btn.getAttribute('data-occasion');
      if (selectedOccasions.has(occSlug)) {
        selectedOccasions.delete(occSlug);
        btn.className = 'occasion-chip min-h-[44px] px-3.5 py-2 rounded-full text-xs font-medium border transition-all cursor-pointer bg-[#FFF8E7] text-[#14381F] border-[#285C3A]/20 hover:border-[#14381F]';
      } else {
        selectedOccasions.add(occSlug);
        btn.className = 'occasion-chip min-h-[44px] px-3.5 py-2 rounded-full text-xs font-medium border transition-all cursor-pointer bg-[#14381F] text-[#FFF8E7] border-[#14381F]';
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
  const variantsContainer = document.getElementById('variants-list-container');

  variantsToggle?.addEventListener('change', (e) => {
    variantsPanel?.classList.toggle('hidden', !e.target.checked);
    if (e.target.checked && variantsContainer && variantsContainer.children.length === 0) {
      addVariantRow();
    }
    triggerAutoSave();
  });

  ['add-variant-row-btn', 'add-variant-row-btn-bottom'].forEach(btnId => {
    document.getElementById(btnId)?.addEventListener('click', () => {
      addVariantRow();
      triggerAutoSave();
    });
  });

  // Save draft buttons (bottom and top)
  ['save-draft-btn', 'save-draft-btn-top'].forEach(btnId => {
    document.getElementById(btnId)?.addEventListener('click', () => {
      saveDraft();
      alert('Listing draft saved to your browser.');
    });
  });

  // Preview Modal buttons (bottom and top)
  const previewModal = document.getElementById('preview-modal');
  ['open-preview-btn', 'open-preview-btn-top'].forEach(btnId => {
    document.getElementById(btnId)?.addEventListener('click', () => {
      renderPreviewModal();
      previewModal?.classList.remove('hidden');
    });
  });

  document.getElementById('close-preview-modal-btn')?.addEventListener('click', () => {
    previewModal?.classList.add('hidden');
  });

  // Publish Submit buttons (bottom and top)
  ['publish-listing-btn', 'publish-listing-btn-top'].forEach(btnId => {
    document.getElementById(btnId)?.addEventListener('click', handleSubmit);
  });
}

function handlePhotoFiles(files) {
  const fileList = Array.from(files).filter(file => file.type.startsWith('image/'));
  if (fileList.length === 0) return;

  const progressContainer = document.getElementById('photos-upload-progress');
  const progressBar = document.getElementById('upload-progress-bar');
  const progressPercent = document.getElementById('upload-progress-percent');
  const progressText = document.getElementById('upload-progress-text');

  if (progressContainer) {
    progressContainer.classList.remove('hidden');
    if (progressBar) progressBar.style.width = '10%';
    if (progressPercent) progressPercent.textContent = '10%';
  }

  let processed = 0;
  fileList.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedPhotos.push({
        file,
        dataUrl: e.target.result
      });
      processed++;
      const pct = Math.round((processed / fileList.length) * 100);
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (progressPercent) progressPercent.textContent = `${pct}%`;
      if (progressText) {
        progressText.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span><span>Loaded ${processed} of ${fileList.length} photos</span>`;
      }

      if (processed === fileList.length) {
        setTimeout(() => {
          if (progressContainer) progressContainer.classList.add('hidden');
          if (progressBar) progressBar.style.width = '0%';
        }, 600);
      }
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
    <div class="relative group rounded-2xl overflow-hidden aspect-square border border-[#285C3A]/25 bg-[#FFF8E7] shadow-sm">
      <img src="${p.dataUrl}" alt="Photo ${idx + 1}" class="w-full h-full object-cover"/>
      
      <!-- Primary Badge / Set Primary Button -->
      ${idx === 0 ? `
        <span class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-[#14381F] text-[#FFF8E7] text-[10px] font-bold uppercase font-mono shadow-xs">
          Primary
        </span>
      ` : `
        <button type="button" onclick="setPrimaryPhoto(${idx})" class="absolute top-1.5 left-1.5 min-w-[36px] min-h-[36px] w-9 h-9 rounded-full bg-black/60 hover:bg-[#14381F] text-white flex items-center justify-center transition-all shadow-md cursor-pointer active:scale-95" title="Set as Primary Thumbnail" aria-label="Set as Primary">
          <span class="material-symbols-outlined text-sm">star</span>
        </button>
      `}

      <!-- Delete Button: Minimum 36px, always visible and directly tappable on mobile touch screens -->
      <button type="button" onclick="removePhoto(${idx})" class="absolute top-1.5 right-1.5 min-w-[36px] min-h-[36px] w-9 h-9 rounded-full bg-red-600/90 hover:bg-red-700 text-white flex items-center justify-center shadow-md transition-all active:scale-95 cursor-pointer z-10" title="Delete Photo" aria-label="Delete Photo">
        <span class="material-symbols-outlined text-base">close</span>
      </button>

      <!-- Reorder Bar (Move Left / Right) -->
      ${uploadedPhotos.length > 1 ? `
        <div class="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between px-1.5 py-1 rounded-xl bg-black/60 backdrop-blur-xs text-white">
          <button type="button" onclick="movePhoto(${idx}, -1)" ${idx === 0 ? 'disabled class="min-w-[36px] min-h-[36px] flex items-center justify-center opacity-30 text-white cursor-default"' : 'class="min-w-[36px] min-h-[36px] flex items-center justify-center text-white hover:text-amber-300 transition-colors active:scale-90 cursor-pointer"'} title="Move Left" aria-label="Move Left">
            <span class="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <span class="text-[10px] font-mono font-bold">${idx + 1}/${uploadedPhotos.length}</span>
          <button type="button" onclick="movePhoto(${idx}, 1)" ${idx === uploadedPhotos.length - 1 ? 'disabled class="min-w-[36px] min-h-[36px] flex items-center justify-center opacity-30 text-white cursor-default"' : 'class="min-w-[36px] min-h-[36px] flex items-center justify-center text-white hover:text-amber-300 transition-colors active:scale-90 cursor-pointer"'} title="Move Right" aria-label="Move Right">
            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

window.removePhoto = function(index) {
  uploadedPhotos.splice(index, 1);
  renderPhotoThumbnails();
  triggerAutoSave();
};

window.setPrimaryPhoto = function(index) {
  if (index <= 0 || index >= uploadedPhotos.length) return;
  const item = uploadedPhotos.splice(index, 1)[0];
  uploadedPhotos.unshift(item);
  renderPhotoThumbnails();
  triggerAutoSave();
};

window.movePhoto = function(index, dir) {
  const target = index + dir;
  if (target < 0 || target >= uploadedPhotos.length) return;
  const temp = uploadedPhotos[index];
  uploadedPhotos[index] = uploadedPhotos[target];
  uploadedPhotos[target] = temp;
  renderPhotoThumbnails();
  triggerAutoSave();
};

function triggerAutoSave() {
  saveDraft();
  ['draft-status-indicator', 'draft-status-indicator-top'].forEach(id => {
    const indicator = document.getElementById(id);
    if (indicator) {
      indicator.classList.remove('hidden');
      indicator.textContent = 'Draft Saved ✓';
    }
  });
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
  row.className = 'variant-card-row p-3.5 sm:p-4 bg-white rounded-2xl border border-[#285C3A]/20 shadow-xs space-y-3 relative transition-all';

  const defaultImgs = Array.isArray(data.images) ? data.images.join(', ') : (data.image_url || '');

  row.innerHTML = `
    <div class="flex items-center justify-between pb-2 border-b border-[#285C3A]/10">
      <div class="flex items-center gap-2">
        <span class="w-6 h-6 rounded-full bg-[#14381F]/10 text-[#14381F] text-[11px] font-bold font-mono flex items-center justify-center">#</span>
        <span class="text-xs font-bold text-[#14381F] uppercase font-mono">Variant Option</span>
      </div>
      <button type="button" class="min-w-[44px] min-h-[44px] p-2 rounded-full text-red-500 hover:text-red-700 hover:bg-red-50 flex items-center justify-center remove-variant-btn cursor-pointer transition-colors active:scale-95" title="Remove Variant" aria-label="Remove Variant">
        <span class="material-symbols-outlined text-[20px]">delete</span>
      </button>
    </div>
    
    <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
      <div class="sm:col-span-6">
        <label class="block text-[11px] font-bold text-[#14381F] uppercase font-mono mb-1">Variant Name / Attribute *</label>
        <input type="text" class="field-input min-h-[44px] text-base sm:text-xs variant-name-input" placeholder="e.g. Size: Large / Color: Indigo / Material: Oak" value="${data.variant_name || data.name || data.color_name || ''}" required />
      </div>
      <div class="sm:col-span-3">
        <label class="block text-[11px] font-bold text-[#14381F] uppercase font-mono mb-1">Price Adjustment (+₹)</label>
        <input type="number" class="field-input min-h-[44px] text-base sm:text-xs font-mono variant-price-input" placeholder="0" value="${data.additional_price ?? 0}" />
      </div>
      <div class="sm:col-span-3">
        <label class="block text-[11px] font-bold text-[#14381F] uppercase font-mono mb-1">Stock Qty</label>
        <input type="number" class="field-input min-h-[44px] text-base sm:text-xs font-mono variant-stock-input" placeholder="50" value="${data.stock_qty ?? 50}" />
      </div>
    </div>
    
    <div>
      <label class="block text-[11px] font-bold text-[#14381F] uppercase font-mono mb-1">Variant Photos (Comma-separated Image URLs)</label>
      <input type="text" class="field-input min-h-[44px] text-base sm:text-xs font-mono variant-images-input" placeholder="/img/products/variant1.jpg, /img/products/variant2.jpg" value="${defaultImgs}" />
      <span class="text-[11px] text-[#587A5B] block mt-1">Enter 1 or more image URLs for this variant option.</span>
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
  const publishBtns = [
    document.getElementById('publish-listing-btn'),
    document.getElementById('publish-listing-btn-top')
  ].filter(Boolean);

  const title = document.getElementById('prod-title')?.value.trim();
  const price = parseFloat(document.getElementById('prod-price')?.value || '0');
  const categoryId = document.getElementById('prod-category')?.value;

  if (!title || !price || !categoryId) {
    alert('Please complete all required fields: Title, Category, and Base Price.');
    return;
  }

  // Require at least one product image before listing
  if (uploadedPhotos.length === 0) {
    alert('Please add at least one product photo before publishing. Listings without images are not allowed.');
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
    category_id: categoryId || null,
    subcategory_id: subcategoryId || null,
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

  publishBtns.forEach(btn => {
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined text-base animate-spin">progress_activity</span><span>Publishing...</span>`;
  });

  const progressContainer = document.getElementById('photos-upload-progress');
  const progressBar = document.getElementById('upload-progress-bar');
  const progressPercent = document.getElementById('upload-progress-percent');
  const progressText = document.getElementById('upload-progress-text');

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
        if (progressContainer) {
          progressContainer.classList.remove('hidden');
          if (progressText) {
            progressText.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span><span>Uploading photos to cloud...</span>`;
          }
          if (progressBar) progressBar.style.width = '30%';
          if (progressPercent) progressPercent.textContent = '30%';
        }

        const formData = new FormData();
        let fileCount = 0;
        for (const p of uploadedPhotos) {
          let file = p.file;
          if (!file && p.dataUrl && p.dataUrl.startsWith('data:')) {
            try {
              const fetchRes = await fetch(p.dataUrl);
              const blob = await fetchRes.blob();
              file = new File([blob], 'product_image.jpg', { type: blob.type || 'image/jpeg' });
            } catch (_) { /* skip unrecoverable dataUrl */ }
          }
          if (file) {
            const compressed = await compressImage(file);
            formData.append('images', compressed);
            fileCount++;
          }
        }
        if (fileCount > 0) {
          try {
            if (progressBar) progressBar.style.width = '60%';
            if (progressPercent) progressPercent.textContent = '60%';

            const imgRes = await fetch(`/api/products/${productId}/images`, {
              method: 'POST',
              headers: {
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
              },
              body: formData
            });

            if (progressBar) progressBar.style.width = '100%';
            if (progressPercent) progressPercent.textContent = '100%';

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
        try {
          await fetch(`/api/products/${productId}/status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ status: 'paused' })
          });
        } catch (_) { /* best-effort pause */ }
        alert(
          'Your listing was saved but the photo upload failed.\n\n' +
          'It has been set to Paused so buyers cannot see it yet.\n\n' +
          'Please open this listing from your catalog, add the photos, then set it back to Active.'
        );
        publishBtns.forEach(btn => {
          btn.disabled = false;
          btn.innerHTML = `<span class="material-symbols-outlined text-base">publish</span><span>Publish Listing</span>`;
        });
        window.location.href = '/seller/catalog.html';
        return;
      }

      alert('Congratulations! Your handcrafted listing has been published to Tohfa.');
      window.location.href = '/seller/catalog.html';
    } else {
      if (res.status === 403 && (json.errorCode === 'ONBOARDING_INCOMPLETE' || json.message?.includes('Banking and billing'))) {
        sessionStorage.setItem(
          'tohfa_flash_alert',
          json.message || 'Payout banking and billing information must be completed before listing new products.'
        );
        window.location.href = '/seller/settings/billing?redirect=/seller/listings/new';
        return;
      }
      alert(json.message || 'Failed to publish listing.');
      publishBtns.forEach(btn => {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined text-base">publish</span><span>Publish Listing</span>`;
      });
    }
  } catch (err) {
    console.error('Publish error:', err);
    alert('An error occurred while publishing listing: ' + (err.message || 'Please try again.'));
    publishBtns.forEach(btn => {
      btn.disabled = false;
      btn.innerHTML = `<span class="material-symbols-outlined text-base">publish</span><span>Publish Listing</span>`;
    });
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
    },
    body: formData
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || 'Image upload failed');
  return json.url || json.data?.url;
}
