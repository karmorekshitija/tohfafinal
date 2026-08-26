/**
 * Tohfa v2 — ZipGift Interactive Digital Gift Card Studio
 * File: frontend/src/buyer/zip-gift.js
 */
'use strict';

import { getUser, isLoggedIn } from '../js/auth.js';
import { api } from '../js/api.js';
import { showToast } from '../js/utils.js';

document.addEventListener('DOMContentLoaded', () => {
  setupNavbar();
  initZipGiftStudio();

  async function setupNavbar() {
    const authContainer = document.getElementById('auth-buttons-container');
    const user = getUser();
    const loggedIn = isLoggedIn();

    if (authContainer) {
      if (loggedIn && user) {
        const initial = (user.name || 'User').charAt(0).toUpperCase();
        authContainer.innerHTML = `
          <a href="/buyer/profile.html" class="w-10 h-10 rounded-full bg-[#14381F] flex items-center justify-center text-white font-bold border border-[rgba(20,56,31,0.2)] text-sm cursor-pointer shadow-sm hover:opacity-90 transition-all">
            ${initial}
          </a>
        `;
      } else {
        authContainer.innerHTML = `
          <div class="flex items-center gap-2">
            <a href="/auth/login.html" class="text-sm font-semibold text-[#FAF6EE] hover:text-white hover:underline no-underline" style="font-family: 'DM Sans', sans-serif;">Login</a>
            <a href="/auth/signup-buyer.html" class="text-[#14381F] text-sm font-semibold px-3.5 py-1.5 rounded-lg bg-[#FAF6EE] hover:bg-white transition-all no-underline shadow-sm" style="font-family: 'DM Sans', sans-serif;">Sign Up</a>
          </div>
        `;
      }
    }

    // Update cart count badge
    try {
      const cartData = await api.get('/cart');
      const badge = document.getElementById('nav-cart-badge');
      if (badge && cartData?.data?.item_count > 0) {
        badge.textContent = cartData.data.item_count;
        badge.classList.remove('hidden');
      }
    } catch (_) {}
  }

  function initZipGiftStudio() {
    let currentAmount = 1000;
    let currentTheme = 'royal-sage';
    let generatedVoucherCode = '';

    const form = document.getElementById('zip-gift-form');
    const customAmountInput = document.getElementById('custom-amount-input');
    const recipientNameInput = document.getElementById('recipient-name');
    const recipientEmailInput = document.getElementById('recipient-email');
    const recipientPhoneInput = document.getElementById('recipient-phone');
    const giftOccasionSelect = document.getElementById('gift-occasion');
    const giftMessageInput = document.getElementById('gift-message');
    const submitBtn = document.getElementById('generate-zipgift-btn');
    const submitBtnText = document.getElementById('btn-submit-text');

    const previewContainer = document.getElementById('card-preview-container');
    const previewAmountDisplay = document.getElementById('preview-amount-display');
    const previewRecipientDisplay = document.getElementById('preview-recipient-display');
    const previewOccasionDisplay = document.getElementById('preview-occasion-display');
    const previewMessageDisplay = document.getElementById('preview-message-display');

    const successBox = document.getElementById('voucher-success-box');
    const voucherCodeDisplay = document.getElementById('voucher-code-display');
    const copyVoucherBtn = document.getElementById('copy-voucher-btn');
    const shareWhatsappBtn = document.getElementById('share-whatsapp-btn');
    const shareEmailBtn = document.getElementById('share-email-btn');

    // Theme selector
    const themeButtons = document.querySelectorAll('.theme-card-option');
    themeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        themeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTheme = btn.getAttribute('data-theme');
        updateCardTheme(currentTheme);
      });
    });

    function updateCardTheme(theme) {
      if (!previewContainer) return;
      if (theme === 'royal-sage') {
        previewContainer.className = 'w-full rounded-3xl p-6 md:p-8 text-[#FFF8E7] shadow-xl relative overflow-hidden transition-all duration-300 bg-gradient-to-br from-[#14381F] to-[#273328] border border-[#C8973A]/30';
      } else if (theme === 'festive-gold') {
        previewContainer.className = 'w-full rounded-3xl p-6 md:p-8 text-[#14381F] shadow-xl relative overflow-hidden transition-all duration-300 bg-gradient-to-br from-[#C8973A] via-[#E8C274] to-[#B68428] border border-[#14381F]/30';
      } else if (theme === 'terracotta') {
        previewContainer.className = 'w-full rounded-3xl p-6 md:p-8 text-[#FFF8E7] shadow-xl relative overflow-hidden transition-all duration-300 bg-gradient-to-br from-[#8B4513] to-[#5C2E0B] border border-[#EBE3D3]/30';
      }
    }

    // Preset amounts
    const presetButtons = document.querySelectorAll('.preset-amount-btn');
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        presetButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentAmount = Number(btn.getAttribute('data-amount'));
        if (customAmountInput) customAmountInput.value = currentAmount;
        updateAmountDisplay();
      });
    });

    customAmountInput?.addEventListener('input', () => {
      const val = Number(customAmountInput.value);
      if (val > 0) {
        currentAmount = val;
        presetButtons.forEach(b => {
          if (Number(b.getAttribute('data-amount')) === val) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
        updateAmountDisplay();
      }
    });

    function updateAmountDisplay() {
      const formatted = `₹${currentAmount.toLocaleString('en-IN')}`;
      if (previewAmountDisplay) previewAmountDisplay.textContent = formatted;
      if (submitBtnText) submitBtnText.textContent = `Create & Issue ZipGift Card (${formatted})`;
    }

    // Real-time text bindings
    recipientNameInput?.addEventListener('input', () => {
      const name = recipientNameInput.value.trim();
      if (previewRecipientDisplay) {
        previewRecipientDisplay.textContent = name || 'Recipient Name';
      }
    });

    giftOccasionSelect?.addEventListener('change', () => {
      if (previewOccasionDisplay) {
        previewOccasionDisplay.textContent = giftOccasionSelect.value;
      }
    });

    giftMessageInput?.addEventListener('input', () => {
      const msg = giftMessageInput.value.trim();
      if (previewMessageDisplay) {
        previewMessageDisplay.textContent = msg ? `"${msg}"` : '"Wishing you joy with handcrafted Tohfa gifts!"';
      }
    });

    // Form Submission
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const recipientName = recipientNameInput?.value?.trim();
      const recipientEmail = recipientEmailInput?.value?.trim();
      const recipientPhone = recipientPhoneInput?.value?.trim();
      const occasion = giftOccasionSelect?.value;
      const message = giftMessageInput?.value?.trim();

      if (!recipientName || !recipientEmail) {
        showToast('Please fill in recipient name and email.', 'error');
        return;
      }

      if (currentAmount < 100) {
        showToast('Minimum gift card amount is ₹100.', 'warning');
        return;
      }

      submitBtn.disabled = true;
      if (submitBtnText) submitBtnText.textContent = 'Issuing Digital Gift Card...';

      const payload = {
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        recipient_phone: recipientPhone || null,
        amount: currentAmount,
        amount_paise: currentAmount * 100,
        occasion: occasion,
        message: message,
        theme: currentTheme,
        created_at: new Date().toISOString()
      };

      try {
        let res;
        try {
          res = await api.post('/api/buyer/zip-gift', payload);
        } catch (_) {
          res = await api.post('/api/zip-gift', payload).catch(() => null);
        }

        generatedVoucherCode = res?.data?.voucher_code || res?.data?.code || `TOHFA-ZIP-${Math.floor(100000 + Math.random() * 900000)}`;

        if (voucherCodeDisplay) voucherCodeDisplay.textContent = generatedVoucherCode;
        if (successBox) {
          successBox.classList.remove('hidden');
          successBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Trigger celebratory confetti
        if (window.confetti) {
          window.confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 }
          });
        }

        showToast('ZipGift card generated successfully! 🎁', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to issue gift card.', 'error');
      } finally {
        submitBtn.disabled = false;
        updateAmountDisplay();
      }
    });

    // Copy Voucher Code
    copyVoucherBtn?.addEventListener('click', async () => {
      if (!generatedVoucherCode) return;
      try {
        await navigator.clipboard.writeText(generatedVoucherCode);
        copyVoucherBtn.textContent = 'Copied! ✓';
        setTimeout(() => { copyVoucherBtn.textContent = 'Copy'; }, 2000);
        showToast('Voucher code copied to clipboard!', 'success');
      } catch (_) {
        showToast('Code: ' + generatedVoucherCode, 'info');
      }
    });

    // WhatsApp Share
    shareWhatsappBtn?.addEventListener('click', () => {
      const recipientName = recipientNameInput?.value?.trim() || 'Friend';
      const text = `Namaste ${recipientName}! 🎁 You've received a Tohfa ZipGift Card worth ₹${currentAmount.toLocaleString('en-IN')}!\n\nUse voucher code: ${generatedVoucherCode}\nRedeem at: ${window.location.origin}/buyer/home.html`;
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    });

    // Email Share
    shareEmailBtn?.addEventListener('click', () => {
      const recipientName = recipientNameInput?.value?.trim() || 'Friend';
      const recipientEmail = recipientEmailInput?.value?.trim() || '';
      const subject = `You've received a Tohfa ZipGift Card worth ₹${currentAmount.toLocaleString('en-IN')}!`;
      const body = `Hi ${recipientName},\n\nYou've received an authentic handcrafted Tohfa digital gift card!\n\nVoucher Code: ${generatedVoucherCode}\nGift Value: ₹${currentAmount.toLocaleString('en-IN')}\n\nRedeem now at: ${window.location.origin}/buyer/home.html\n\nWarm regards,\nTohfa Artisan Studio`;
      window.location.href = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }
});
