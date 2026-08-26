/**
 * Tohfa v2 — Shared Utilities
 * File: frontend/src/js/utils.js
 * Role: Shared helpers used across all pages.
 *       Currency formatting, date formatting, skeleton loaders,
 *       toast notifications, debounce, image lazy-loading,
 *       cart fly animation, and event helpers.
 */

// ---------------------------------------------------------------------------
// CURRENCY
// ---------------------------------------------------------------------------
/**
 * Format a number as Indian Rupees
 * @param {number} amount
 * @returns {string} e.g. "₹1,299"
 */
export function formatPrice(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// DATES
// ---------------------------------------------------------------------------
/**
 * Format a date string to readable Indian format
 * @param {string|Date} date
 * @returns {string} e.g. "23 Aug 2026"
 */
export function formatDate(date) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

/**
 * Format a datetime string to short readable format
 * @param {string|Date} date
 * @returns {string} e.g. "23 Aug, 2:30 PM"
 */
export function formatDateTime(date) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));
}

/**
 * Returns relative time string
 * @param {string|Date} date
 * @returns {string} e.g. "2 hours ago", "3 days ago"
 */
export function timeAgo(date) {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = then - now; // negative = past

  const abs = Math.abs(diff);
  if (abs < 60_000)     return rtf.format(-Math.round(abs / 1000), 'second');
  if (abs < 3_600_000)  return rtf.format(-Math.round(abs / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(-Math.round(abs / 3_600_000), 'hour');
  if (abs < 2_592_000_000) return rtf.format(-Math.round(abs / 86_400_000), 'day');
  return formatDate(date);
}

// ---------------------------------------------------------------------------
// DEBOUNCE
// ---------------------------------------------------------------------------
/**
 * Returns a debounced version of fn
 * @param {Function} fn
 * @param {number} wait - milliseconds
 */
export function debounce(fn, wait = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

// ---------------------------------------------------------------------------
// TOAST NOTIFICATIONS
// ---------------------------------------------------------------------------
let _toastContainer = null;

function _getToastContainer() {
  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.className = 'toast-container';
    document.body.appendChild(_toastContainer);
  }
  return _toastContainer;
}

/**
 * Show a toast notification
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration - ms (default 3500)
 */
export function showToast(message, type = 'info', duration = 3500) {
  const container = _getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 250ms ease forwards';
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

// ---------------------------------------------------------------------------
// UNIVERSAL EMPTY STATE (Section 5.1 Specification)
// ---------------------------------------------------------------------------
export function renderEmptyState({
  containerId,
  icon = '🎁',
  title = 'Nothing Found Here',
  description = 'There are no items to display at this moment.',
  actionText = 'Explore Marketplace',
  actionHref = '/buyer/home.html',
  theme = 'amber'
}) {
  const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!container) return;

  const bgColors = {
    amber: 'bg-amber-50 text-amber-900',
    rose: 'bg-rose-50 text-rose-600',
    stone: 'bg-stone-100 text-stone-700'
  };

  container.innerHTML = `
    <div class="col-span-full w-full flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <div class="w-20 h-20 ${bgColors[theme] || bgColors.amber} rounded-full flex items-center justify-center mb-4 text-3xl shadow-inner">
        ${icon}
      </div>
      <h3 class="text-xl md:text-2xl font-serif font-semibold text-stone-800 mb-2">${title}</h3>
      <p class="text-stone-500 max-w-md text-sm mb-6 leading-relaxed">${description}</p>
      ${actionText && actionHref ? `
        <a href="${actionHref}" class="inline-flex items-center gap-2 px-6 py-2.5 bg-stone-900 text-amber-50 rounded-full font-medium text-sm hover:bg-stone-800 transition shadow-sm hover:shadow">
          ${actionText} &rarr;
        </a>
      ` : ''}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// SKELETON LOADERS
// ---------------------------------------------------------------------------
/**
 * Replace a container's children with skeleton placeholders
 * @param {HTMLElement} container
 * @param {string} skeletonHTML - HTML string for one skeleton item
 * @param {number} count - how many skeletons to show
 */
export function showSkeletons(container, skeletonHTML, count = 4) {
  container.innerHTML = Array(count).fill(skeletonHTML).join('');
}

/**
 * Standard product card skeleton
 */
export const PRODUCT_CARD_SKELETON = `
  <div class="skeleton skeleton--card" style="aspect-ratio:1;border-radius:var(--radius-lg)"></div>
`;

/**
 * Standard list item skeleton
 */
export const LIST_ITEM_SKELETON = `
  <div style="display:flex;gap:12px;align-items:center;padding:12px 0">
    <div class="skeleton skeleton--avatar"></div>
    <div style="flex:1">
      <div class="skeleton skeleton--text" style="width:60%"></div>
      <div class="skeleton skeleton--text" style="width:40%"></div>
    </div>
  </div>
`;

// ---------------------------------------------------------------------------
// ADD TO CART ANIMATION
// "Fly to cart" — product thumbnail flies to the cart icon
// ---------------------------------------------------------------------------
/**
 * Trigger the fly-to-cart micro-animation
 * @param {HTMLElement} productImgEl - the product image element clicked
 * @param {HTMLElement} cartIconEl - the cart icon in the nav
 */
export function flyToCart(productImgEl, cartIconEl) {
  if (!productImgEl || !cartIconEl) return;

  const imgRect  = productImgEl.getBoundingClientRect();
  const cartRect = cartIconEl.getBoundingClientRect();

  const clone = productImgEl.cloneNode(false);
  clone.style.cssText = `
    position: fixed;
    top: ${imgRect.top}px;
    left: ${imgRect.left}px;
    width: ${imgRect.width}px;
    height: ${imgRect.height}px;
    border-radius: var(--radius-md);
    object-fit: cover;
    z-index: 9999;
    pointer-events: none;
    will-change: transform, opacity;
  `;

  // Compute translation to cart icon center
  const dx = cartRect.left + cartRect.width / 2 - (imgRect.left + imgRect.width / 2);
  const dy = cartRect.top + cartRect.height / 2 - (imgRect.top + imgRect.height / 2);
  clone.style.setProperty('--fly-x', `${dx}px`);
  clone.style.setProperty('--fly-y', `${dy}px`);

  document.body.appendChild(clone);
  clone.style.animation = 'flyToCart 600ms cubic-bezier(0.4,0,0.2,1) forwards';

  clone.addEventListener('animationend', () => {
    clone.remove();
    // Bounce the cart icon
    cartIconEl.style.animation = 'cartBounce 400ms ease';
    cartIconEl.addEventListener('animationend', () => {
      cartIconEl.style.animation = '';
    }, { once: true });
  }, { once: true });
}

// ---------------------------------------------------------------------------
// LAZY IMAGE LOADING
// Use on product feeds — attach IntersectionObserver to images with data-src
// ---------------------------------------------------------------------------
export function initLazyImages(root = document) {
  const imgs = root.querySelectorAll('img[data-src]');
  if (!imgs.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        observer.unobserve(img);
      }
    });
  }, { rootMargin: '200px' });

  imgs.forEach(img => observer.observe(img));
}

// ---------------------------------------------------------------------------
// PAGINATION HELPER
// ---------------------------------------------------------------------------
/**
 * Build page query string for paginated API calls
 * @param {number} page
 * @param {number} limit
 * @returns {string} e.g. "?page=2&limit=12"
 */
export function pageQuery(page = 1, limit = 12) {
  return `?page=${page}&limit=${limit}`;
}

// ---------------------------------------------------------------------------
// FORM HELPERS
// ---------------------------------------------------------------------------
/**
 * Collect all form values into a plain object
 * @param {HTMLFormElement} form
 * @returns {Object}
 */
export function serializeForm(form) {
  const data = {};
  new FormData(form).forEach((value, key) => {
    if (data[key] !== undefined) {
      // Multiple values (checkboxes) → array
      data[key] = [].concat(data[key], value);
    } else {
      data[key] = value;
    }
  });
  return data;
}

/**
 * Show validation error on a form field
 * @param {HTMLElement} inputEl
 * @param {string} message
 */
export function showFieldError(inputEl, message) {
  inputEl.classList.add('error');
  let errEl = inputEl.parentElement.querySelector('.form-error');
  if (!errEl) {
    errEl = document.createElement('span');
    errEl.className = 'form-error';
    inputEl.parentElement.appendChild(errEl);
  }
  errEl.textContent = message;
}

/**
 * Clear validation error on a form field
 * @param {HTMLElement} inputEl
 */
export function clearFieldError(inputEl) {
  inputEl.classList.remove('error');
  const errEl = inputEl.parentElement.querySelector('.form-error');
  if (errEl) errEl.remove();
}

// ---------------------------------------------------------------------------
// ORDER STATUS HELPERS
// ---------------------------------------------------------------------------
const STATUS_LABELS = {
  pending:     'Pending',
  confirmed:   'Confirmed',
  shipped:     'Shipped',
  delivered:   'Delivered',
  cancelled:   'Cancelled',
  requested:   'Requested',
  quoted:      'Quoted',
  paid:        'Paid',
  in_progress: 'In Progress',
  expired:     'Expired',
};

/**
 * Get human-readable label for an order/request status
 * @param {string} status
 * @returns {string}
 */
export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

/**
 * Get the badge CSS class for a status
 * @param {string} status
 * @returns {string}
 */
export function statusClass(status) {
  return `status-${status.replace('_', '-')}`;
}

// ---------------------------------------------------------------------------
// MISC
// ---------------------------------------------------------------------------
/**
 * Truncate a string to maxLen chars with ellipsis
 */
export function truncate(str, maxLen = 60) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen).trim() + '…';
}

/**
 * Generate a simple client-side UUID for temporary IDs
 */
export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
}
