/**
 * Tohfa v2 — Seller Listing Prerequisite Guard & Bottom Sheet Modal
 * File: frontend/src/components/SellerListingGateModal.js
 * Role: Intercepts product creation buttons when banking or billing details are missing.
 *       Desktop: Adds tooltip / disabled state.
 *       Mobile: Opens bottom sheet modal explaining requirements with "Setup Now" button.
 *       URL Guard: Direct route protection for /seller/listings/new and /seller/add-product.html.
 */
'use strict';

import { fetchSellerOnboardingStatus } from '../utils/useSellerOnboardingStatus.js';

let modalElement = null;

/**
 * Creates and appends the bottom sheet / modal element to the DOM
 */
function getOrCreateModal() {
  if (modalElement && document.body.contains(modalElement)) {
    return modalElement;
  }

  const existing = document.getElementById('seller-listing-gate-modal');
  if (existing) {
    modalElement = existing;
    return existing;
  }

  const el = document.createElement('div');
  el.id = 'seller-listing-gate-modal';
  el.className = 'fixed inset-0 z-[200] hidden flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-900/60 backdrop-blur-xs transition-opacity duration-300';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'gate-modal-title');

  el.innerHTML = `
    <!-- Modal Card / Bottom Sheet Container -->
    <div class="w-full sm:max-w-md bg-[#FFF8E7] rounded-t-3xl sm:rounded-2xl p-6 sm:p-7 shadow-2xl border border-[#14381F]/15 transform transition-transform duration-300 translate-y-full sm:translate-y-0 text-left font-['DM_Sans']">
      
      <!-- Mobile drag pill handle -->
      <div class="w-12 h-1.5 bg-[#14381F]/20 rounded-full mx-auto mb-4 sm:hidden"></div>

      <!-- Icon & Header -->
      <div class="flex items-start gap-4 mb-4">
        <div class="w-12 h-12 rounded-2xl bg-[#C85A32]/15 text-[#C85A32] flex items-center justify-center shrink-0 shadow-inner">
          <span class="material-symbols-outlined text-2xl">account_balance</span>
        </div>
        <div class="flex-1">
          <h3 id="gate-modal-title" class="text-lg font-bold text-[#14381F] font-['Playfair_Display'] leading-snug">
            Banking & Billing Setup Required
          </h3>
          <p class="text-xs text-[#587A5B] mt-1 leading-relaxed">
            You cannot list products yet. Payout banking and billing information are required so you can receive payments.
          </p>
        </div>
      </div>

      <!-- Checklist Summary -->
      <div class="bg-white/70 rounded-xl p-3.5 border border-[#14381F]/10 space-y-2 mb-5">
        <div id="modal-check-address" class="flex items-center gap-2 text-xs font-medium text-[#14381F]">
          <span class="material-symbols-outlined text-[18px] text-[#C85A32]">error</span>
          <span>Billing & Dispatch Address</span>
        </div>
        <div id="modal-check-bank" class="flex items-center gap-2 text-xs font-medium text-[#14381F]">
          <span class="material-symbols-outlined text-[18px] text-[#C85A32]">error</span>
          <span>Bank Account & IFSC for Payouts</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex flex-col sm:flex-row items-center gap-2.5">
        <a id="gate-modal-setup-btn" href="/seller/settings/billing?redirect=/seller/listings/new" class="w-full sm:flex-1 py-3 px-5 bg-[#14381F] text-[#FFF8E7] rounded-xl text-xs font-bold uppercase tracking-wider text-center shadow hover:bg-[#285C3A] active:scale-95 transition-all text-decoration-none flex items-center justify-center gap-1.5">
          <span>Setup Now</span>
          <span class="material-symbols-outlined text-sm">arrow_forward</span>
        </a>
        <button id="gate-modal-close-btn" class="w-full sm:w-auto py-2.5 px-4 bg-transparent hover:bg-black/5 text-[#14381F]/70 text-xs font-semibold rounded-xl border border-[#14381F]/15 transition-all cursor-pointer">
          Later
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(el);

  // Close handlers
  const closeBtn = el.querySelector('#gate-modal-close-btn');
  closeBtn?.addEventListener('click', closeListingGateModal);

  el.addEventListener('click', (e) => {
    if (e.target === el) {
      closeListingGateModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.classList.contains('hidden')) {
      closeListingGateModal();
    }
  });

  modalElement = el;
  return el;
}

export function openListingGateModal(status) {
  const modal = getOrCreateModal();
  const card = modal.querySelector('div');

  // Update checklist items
  const checkAddress = modal.querySelector('#modal-check-address');
  const checkBank = modal.querySelector('#modal-check-bank');

  if (checkAddress) {
    const done = status?.hasBillingAddress;
    checkAddress.innerHTML = `
      <span class="material-symbols-outlined text-[18px] ${done ? 'text-emerald-700' : 'text-[#C85A32]'}">
        ${done ? 'check_circle' : 'error'}
      </span>
      <span class="${done ? 'line-through opacity-70' : 'font-semibold'}">Billing & Dispatch Address</span>
    `;
  }

  if (checkBank) {
    const done = status?.hasBankingDetails;
    checkBank.innerHTML = `
      <span class="material-symbols-outlined text-[18px] ${done ? 'text-emerald-700' : 'text-[#C85A32]'}">
        ${done ? 'check_circle' : 'error'}
      </span>
      <span class="${done ? 'line-through opacity-70' : 'font-semibold'}">Bank Account & IFSC for Payouts</span>
    `;
  }

  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.remove('opacity-0');
    card.classList.remove('translate-y-full');
  });
}

export function closeListingGateModal() {
  if (!modalElement) return;
  const card = modalElement.querySelector('div');
  card?.classList.add('translate-y-full');
  modalElement.classList.add('opacity-0');
  setTimeout(() => {
    modalElement.classList.add('hidden');
  }, 250);
}

/**
 * Intercepts all product listing triggers on the current page
 */
export async function initListingGating() {
  const status = await fetchSellerOnboardingStatus();
  applyGatingToElements(status);

  window.addEventListener('seller-onboarding-status-updated', (e) => {
    applyGatingToElements(e.detail);
  });
}

function applyGatingToElements(status) {
  const isComplete = Boolean(status?.isComplete);

  // Listing entrypoints to guard
  const targets = [
    document.getElementById('header-create-listing-btn'),
    document.getElementById('empty-create-btn'),
    document.getElementById('create-custom-btn'),
    ...document.querySelectorAll('a[href*="add-product"], a[href*="/seller/listings/new"], button[data-action="create-listing"]')
  ].filter(Boolean);

  targets.forEach((target) => {
    if (isComplete) {
      target.removeAttribute('data-gated');
      target.removeAttribute('title');
      if (target.dataset.originalOpacity) {
        target.style.opacity = target.dataset.originalOpacity;
      }
      return;
    }

    target.setAttribute('data-gated', 'true');
    target.setAttribute('title', 'Action Required: Complete banking and billing information to list products');
    if (!target.dataset.originalOpacity) {
      target.dataset.originalOpacity = target.style.opacity || '1';
    }

    // Intercept click / tap
    if (!target._gatedHandlerAttached) {
      target._gatedHandlerAttached = true;
      target.addEventListener('click', (e) => {
        const current = window.useSellerOnboardingStatus ? window.useSellerOnboardingStatus() : status;
        if (!current?.isComplete) {
          e.preventDefault();
          e.stopPropagation();
          openListingGateModal(current);
        }
      }, true);
    }
  });
}

/**
 * URL Guard: Protects /seller/listings/new and /seller/add-product.html direct access
 */
export async function checkDirectListingRouteGuard() {
  const pathname = window.location.pathname;
  const isListingCreationRoute =
    pathname.includes('/seller/add-product') ||
    pathname.includes('/seller/listings/new');

  if (!isListingCreationRoute) return;

  const status = await fetchSellerOnboardingStatus();
  if (!status.isComplete) {
    sessionStorage.setItem(
      'tohfa_flash_alert',
      'Action Required: Payout banking and billing information must be completed before listing new products.'
    );
    window.location.replace('/seller/settings/billing?redirect=/seller/listings/new');
  }
}

// Auto-run if in browser
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initListingGating();
      checkDirectListingRouteGuard();
    });
  } else {
    initListingGating();
    checkDirectListingRouteGuard();
  }
}
