/**
 * Tohfa v2 — Seller Studio Onboarding Warning Card Component
 * File: frontend/src/components/SellerOnboardingWarningCard.js
 * Role: Prominent, non-intrusive banner card for Seller Dashboard & Studio.
 *       Displays checklist for Billing & Pickup Address and Bank & Payout Details.
 *       Directs sellers to /seller/settings/billing to unlock product listing.
 */
'use strict';

import { fetchSellerOnboardingStatus } from '../utils/useSellerOnboardingStatus.js';

export function createOnboardingWarningCard(status) {
  const card = document.createElement('div');
  card.id = 'seller-onboarding-warning-card';
  card.className = 'w-full mb-6 bg-[#FFF8E7] border-2 border-[#C85A32]/40 rounded-2xl p-4 sm:p-6 shadow-sm relative overflow-hidden transition-all';

  const hasAddress = Boolean(status?.hasBillingAddress);
  const hasBank = Boolean(status?.hasBankingDetails);

  if (hasAddress && hasBank) {
    card.classList.add('hidden');
    return card;
  }

  card.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="space-y-3 flex-1">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-[#C85A32]/15 text-[#C85A32] flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[20px]">priority_high</span>
          </div>
          <div>
            <h3 class="text-base sm:text-lg font-bold text-[#14381F] font-['Playfair_Display']">
              Action Required: Complete Setup to Start Selling
            </h3>
            <p class="text-xs text-[#587A5B] mt-0.5">
              Payout banking and billing address details must be completed before you can create listings and receive customer payouts.
            </p>
          </div>
        </div>

        <!-- Checklist -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <div class="flex items-center gap-2 text-xs font-medium ${hasAddress ? 'text-[#14381F]' : 'text-[#C85A32]'} bg-white/60 px-3 py-2 rounded-xl border ${hasAddress ? 'border-[#14381F]/20' : 'border-[#C85A32]/30'}">
            <span class="material-symbols-outlined text-[18px]">
              ${hasAddress ? 'check_circle' : 'error'}
            </span>
            <span class="${hasAddress ? 'line-through opacity-70' : 'font-semibold'}">
              Billing & Pickup Address
            </span>
            <span class="ml-auto text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded ${hasAddress ? 'bg-[#14381F]/10 text-[#14381F]' : 'bg-[#C85A32]/15 text-[#C85A32] font-bold'}">
              ${hasAddress ? 'Completed' : 'Required'}
            </span>
          </div>

          <div class="flex items-center gap-2 text-xs font-medium ${hasBank ? 'text-[#14381F]' : 'text-[#C85A32]'} bg-white/60 px-3 py-2 rounded-xl border ${hasBank ? 'border-[#14381F]/20' : 'border-[#C85A32]/30'}">
            <span class="material-symbols-outlined text-[18px]">
              ${hasBank ? 'check_circle' : 'error'}
            </span>
            <span class="${hasBank ? 'line-through opacity-70' : 'font-semibold'}">
              Bank & Payout Details
            </span>
            <span class="ml-auto text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded ${hasBank ? 'bg-[#14381F]/10 text-[#14381F]' : 'bg-[#C85A32]/15 text-[#C85A32] font-bold'}">
              ${hasBank ? 'Completed' : 'Required'}
            </span>
          </div>
        </div>
      </div>

      <!-- Action Button -->
      <div class="flex items-center justify-end sm:justify-start md:justify-end shrink-0 pt-2 sm:pt-0">
        <a href="/seller/profile.html#billing-section" class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#14381F] text-[#FFF8E7] text-xs font-bold uppercase tracking-wider rounded-full shadow-md hover:bg-[#285C3A] active:scale-95 transition-all text-decoration-none">
          <span>Complete Details</span>
          <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
        </a>
      </div>
    </div>
  `;

  return card;
}

/**
 * Mounts the warning card inside a given target element or prepends to main content
 */
export async function mountOnboardingWarningCard(containerSelector = '#onboarding-card-container') {
  let container = typeof containerSelector === 'string'
    ? document.querySelector(containerSelector)
    : containerSelector;

  if (!container) {
    const main = document.querySelector('.seller-main-panel') || document.querySelector('main') || document.body;
    container = document.createElement('div');
    container.id = 'onboarding-card-container';
    if (main.firstChild) {
      main.insertBefore(container, main.firstChild);
    } else {
      main.appendChild(container);
    }
  }

  const status = await fetchSellerOnboardingStatus();
  updateCardUI(container, status);

  // Subscribe to live status updates (e.g. when user saves in another tab or form)
  window.addEventListener('seller-onboarding-status-updated', (e) => {
    updateCardUI(container, e.detail);
  });
}

function updateCardUI(container, status) {
  if (!container) return;
  const existing = document.getElementById('seller-onboarding-warning-card');
  if (existing) existing.remove();

  if (!status.isComplete) {
    const newCard = createOnboardingWarningCard(status);
    container.prepend(newCard);
  }
}

// Auto mount if container exists on load
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const target = document.getElementById('onboarding-card-container');
    if (target) {
      mountOnboardingWarningCard(target);
    }
  });
}
