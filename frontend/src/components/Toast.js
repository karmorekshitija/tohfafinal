/**
 * ═══════════════════════════════════════════════════
 *  FILE: frontend/src/components/Toast.js
 *  LAYER: Frontend — Shared UI Component
 *  PURPOSE: Global toast notification system.
 *           Exported as ES module + bound to window.Toast / window.showToast.
 *
 *  USAGE:
 *    import Toast from '/src/components/Toast.js';
 *    Toast.show('Saved!', 'success');
 *    Toast.show('Something went wrong', 'error');
 *    Toast.show('Please note', 'info');
 *
 *  COLORS: Pine Shade (#14381F), Cosmic Latte (#FFF8E7), Charcoal (#1C1C1C)
 * ═══════════════════════════════════════════════════
 */
export default class Toast {
  static show(message, type = 'success') {
    const isMobile = window.innerWidth < 768;

    let container = document.getElementById('global-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'global-toast-container';
      container.style.cssText = `
        position: fixed;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }

    // Responsive positioning
    if (isMobile) {
      container.style.top = '16px';
      container.style.left = '16px';
      container.style.right = '16px';
      container.style.bottom = '';
      container.style.width = 'calc(100% - 32px)';
    } else {
      container.style.top = '24px';
      container.style.right = '24px';
      container.style.left = '';
      container.style.bottom = '';
      container.style.width = 'auto';
      container.style.maxWidth = '380px';
    }

    const configs = {
      success: { bg: '#14381F', border: 'rgba(255,248,231,0.2)', icon: 'check_circle' },
      error:   { bg: '#C0392B', border: 'rgba(255,255,255,0.2)',  icon: 'error'        },
      info:    { bg: '#1C1C1C', border: 'rgba(255,248,231,0.15)', icon: 'info'         },
    };
    const cfg = configs[type] || configs.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 13px 18px;
      border-radius: 10px;
      border: 1px solid ${cfg.border};
      background: ${cfg.bg};
      color: #FFF8E7;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.4;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
      pointer-events: all;
      transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease;
      transform: ${isMobile ? 'translateY(-80px)' : 'translateX(110%)'};
      opacity: 0;
      max-width: 100%;
      word-break: break-word;
    `;

    toast.innerHTML = `
      <span class="material-symbols-outlined" style="font-size:18px;flex-shrink:0;font-variation-settings:'FILL' 1;">${cfg.icon}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    // Slide in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translate(0, 0)';
        toast.style.opacity = '1';
      });
    });

    // Slide out and remove
    const timeout = setTimeout(() => {
      toast.style.transform = isMobile ? 'translateY(-80px)' : 'translateX(110%)';
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
        if (container.children.length === 0) container.remove();
      }, 280);
    }, 3500);

    // Tap to dismiss early
    toast.addEventListener('click', () => {
      clearTimeout(timeout);
      toast.style.transform = isMobile ? 'translateY(-80px)' : 'translateX(110%)';
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
        if (container.children.length === 0) container.remove();
      }, 280);
    }, { once: true });
  }
}

// Global access for pages that don't use ES modules
window.Toast = Toast;
window.showToast = (msg, type) => Toast.show(msg, type);
