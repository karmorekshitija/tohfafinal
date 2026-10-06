/**
 * Tohfa v2 — Mobile-First Seller Studio Introductory Walkthrough
 * File: frontend/src/components/SellerIntroTour.js
 * Role: Provides a lightweight, accessible 4-slide onboarding tour on first dashboard arrival.
 *       Slide 1: Welcome to Seller Studio
 *       Slide 2: Setup Banking & Billing (prerequisite highlight)
 *       Slide 3: Listing & Customization
 *       Slide 4: Order Fulfillment
 *       Persists dismissal via POST /api/seller/onboarding/dismiss-tour
 */
'use strict';

import { fetchSellerOnboardingStatus } from '../utils/useSellerOnboardingStatus.js';

const SLIDES = [
  {
    step: 1,
    title: 'Welcome to Seller Studio',
    tagline: 'Your Artisan Command Center',
    icon: 'storefront',
    iconBg: 'bg-[#14381F]/10 text-[#14381F]',
    description: 'Track daily sales, monitor customer orders, review store analytics, and celebrate your artisan journey all in one curated dashboard.'
  },
  {
    step: 2,
    title: 'Setup Banking & Billing',
    tagline: 'Prerequisite for Product Listings',
    icon: 'account_balance',
    iconBg: 'bg-[#C85A32]/15 text-[#C85A32]',
    description: 'Accurate billing address and bank payout details are required to list items. Your earnings are disbursed directly into your bank via automated settlements.'
  },
  {
    step: 3,
    title: 'Listing & Customization',
    tagline: 'Showcase Handcrafted Creations',
    icon: 'auto_fix_high',
    iconBg: 'bg-[#14381F]/10 text-[#14381F]',
    description: 'Publish standard handcrafted catalog items or enable personalized options for bespoke patron engravings, colorways, and gift notes.'
  },
  {
    step: 4,
    title: 'Order Fulfillment',
    tagline: 'From Studio to Patron Doorstep',
    icon: 'local_shipping',
    iconBg: 'bg-[#14381F]/10 text-[#14381F]',
    description: 'Manage incoming orders, upload custom design proofs for buyer approval, print shipping labels, and track door-to-door courier dispatch.'
  }
];

class SellerIntroTour {
  constructor() {
    this.currentSlide = 0;
    this.container = null;
    this.isDismissing = false;
  }

  async init() {
    // Only run on the dashboard page
    const pathname = window.location.pathname;
    const isDashboard = pathname.includes('dashboard') ||
                        pathname === '/seller' ||
                        pathname === '/seller/' ||
                        pathname === '/src/seller' ||
                        pathname === '/src/seller/';
    if (!isDashboard) {
      return;
    }

    try {
      const status = await fetchSellerOnboardingStatus();
      if (!status.onboardingTourDismissed) {
        this.render();
      }
    } catch (e) {
      console.warn('[SellerIntroTour] Init check skipped:', e.message);
    }
  }

  render() {
    if (document.getElementById('seller-intro-tour-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'seller-intro-tour-overlay';
    overlay.className = 'fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-950/70 backdrop-blur-xs font-[\'DM_Sans\'] transition-opacity duration-300';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Seller Studio Intro Tour');

    overlay.innerHTML = `
      <div id="tour-card" class="w-full sm:max-w-lg bg-[#FFF8E7] rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#14381F]/15 relative overflow-hidden transition-all duration-300">
        
        <!-- Mobile pull pill -->
        <div class="w-12 h-1 bg-[#14381F]/20 rounded-full mx-auto mb-4 sm:hidden"></div>

        <!-- Top row: Badge and Skip button -->
        <div class="flex items-center justify-between mb-6">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest font-mono bg-[#14381F]/10 text-[#14381F]" id="tour-step-badge">
            Step 1 of 4
          </span>
          <button id="tour-skip-btn" class="text-xs font-semibold text-[#14381F]/70 hover:text-[#14381F] underline cursor-pointer bg-transparent border-none p-1">
            Skip Tour
          </button>
        </div>

        <!-- Slide Content Container -->
        <div id="tour-slide-container" class="min-h-[220px] flex flex-col justify-center transition-all duration-300">
          <!-- Dynamic Content rendered by updateSlide() -->
        </div>

        <!-- Bottom Controls: Dots & Navigation Button -->
        <div class="mt-8 pt-4 border-t border-[#14381F]/10 flex items-center justify-between gap-4">
          <!-- Dots -->
          <div class="flex items-center gap-2" id="tour-dots-container">
            ${SLIDES.map((_, idx) => `
              <button data-slide="${idx}" class="tour-dot w-2.5 h-2.5 rounded-full transition-all cursor-pointer border-none ${idx === 0 ? 'w-6 bg-[#14381F]' : 'bg-[#14381F]/25'}" aria-label="Slide ${idx + 1}"></button>
            `).join('')}
          </div>

          <!-- Next / Get Started Button -->
          <button id="tour-next-btn" class="px-6 py-2.5 bg-[#14381F] text-[#FFF8E7] rounded-full text-xs font-bold uppercase tracking-wider shadow-md hover:bg-[#285C3A] active:scale-95 transition-all flex items-center gap-2 cursor-pointer border-none">
            <span id="tour-btn-label">Next</span>
            <span class="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);
    this.container = overlay;

    // Attach listeners
    const nextBtn = overlay.querySelector('#tour-next-btn');
    const skipBtn = overlay.querySelector('#tour-skip-btn');
    const dots = overlay.querySelectorAll('.tour-dot');

    nextBtn?.addEventListener('click', () => this.handleNext());
    skipBtn?.addEventListener('click', () => this.dismiss());

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const targetIdx = parseInt(dot.getAttribute('data-slide'), 10);
        this.goToSlide(targetIdx);
      });
    });

    // Touch swipe support for mobile
    let touchStartX = 0;
    let touchEndX = 0;
    const card = overlay.querySelector('#tour-card');

    card?.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    card?.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 40) {
        if (diff > 0) this.handleNext();
        else if (this.currentSlide > 0) this.goToSlide(this.currentSlide - 1);
      }
    }, { passive: true });

    // Keyboard support
    document.addEventListener('keydown', (e) => {
      if (!this.container || this.container.classList.contains('hidden')) return;
      if (e.key === 'ArrowRight') this.handleNext();
      if (e.key === 'ArrowLeft' && this.currentSlide > 0) this.goToSlide(this.currentSlide - 1);
      if (e.key === 'Escape') this.dismiss();
    });

    this.updateSlide();
  }

  updateSlide() {
    const slide = SLIDES[this.currentSlide];
    const slideContainer = this.container.querySelector('#tour-slide-container');
    const stepBadge = this.container.querySelector('#tour-step-badge');
    const btnLabel = this.container.querySelector('#tour-btn-label');
    const dots = this.container.querySelectorAll('.tour-dot');

    if (!slideContainer) return;

    if (stepBadge) stepBadge.textContent = `Step ${slide.step} of 4`;
    if (btnLabel) btnLabel.textContent = this.currentSlide === SLIDES.length - 1 ? 'Get Started' : 'Next';

    // Update dots
    dots.forEach((dot, idx) => {
      if (idx === this.currentSlide) {
        dot.className = 'tour-dot w-6 h-2.5 rounded-full bg-[#14381F] transition-all cursor-pointer border-none';
      } else {
        dot.className = 'tour-dot w-2.5 h-2.5 rounded-full bg-[#14381F]/25 transition-all cursor-pointer border-none';
      }
    });

    // Content animation
    slideContainer.style.opacity = '0';
    slideContainer.style.transform = 'translateY(8px)';

    setTimeout(() => {
      slideContainer.innerHTML = `
        <div class="flex items-center gap-4 mb-4">
          <div class="w-14 h-14 rounded-2xl ${slide.iconBg} flex items-center justify-center shrink-0 shadow-sm">
            <span class="material-symbols-outlined text-3xl">${slide.icon}</span>
          </div>
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#587A5B] font-mono block">
              ${slide.tagline}
            </span>
            <h2 class="text-xl sm:text-2xl font-bold text-[#14381F] font-['Playfair_Display'] leading-tight">
              ${slide.title}
            </h2>
          </div>
        </div>
        <p class="text-xs sm:text-sm text-stone-700 leading-relaxed mt-2 bg-white/60 p-4 rounded-2xl border border-[#14381F]/10">
          ${slide.description}
        </p>
      `;
      slideContainer.style.opacity = '1';
      slideContainer.style.transform = 'translateY(0)';
    }, 120);
  }

  handleNext() {
    if (this.currentSlide < SLIDES.length - 1) {
      this.goToSlide(this.currentSlide + 1);
    } else {
      this.dismiss();
    }
  }

  goToSlide(idx) {
    if (idx >= 0 && idx < SLIDES.length) {
      this.currentSlide = idx;
      this.updateSlide();
    }
  }

  async dismiss() {
    if (this.isDismissing) return;
    this.isDismissing = true;

    try {
      const token = (typeof window !== 'undefined' && window.authStorage?.getToken?.()) ||
                    sessionStorage.getItem('tohfa_access_token') ||
                    localStorage.getItem('tohfa_access_token') || '';

      if (token) {
        await fetch('/api/seller/onboarding/dismiss-tour', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }).catch(() => {});
      }

      // Update cached status
      if (typeof window !== 'undefined' && window.fetchSellerOnboardingStatus) {
        window.fetchSellerOnboardingStatus(true).catch(() => {});
      }
    } catch (err) {
      console.warn('[SellerIntroTour] Dismiss error:', err);
    } finally {
      if (this.container) {
        this.container.classList.add('opacity-0');
        setTimeout(() => {
          this.container.remove();
          this.container = null;
        }, 300);
      }
    }
  }
}

export const sellerIntroTour = new SellerIntroTour();

// Auto-run if on dashboard page
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => sellerIntroTour.init());
  } else {
    sellerIntroTour.init();
  }
}
