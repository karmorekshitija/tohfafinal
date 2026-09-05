/**
 * Tohfa v2 — Image Helper & Delivery Optimizer
 * File: frontend/src/utils/imageHelper.js
 * Role: Formats and optimizes image URLs for high-performance responsive delivery.
 */

/**
 * Optimizes an image URL for modern delivery.
 * Automatically injects Cloudinary auto-format (f_auto) and auto-quality (q_auto),
 * plus optional responsive size constraints.
 * 
 * @param {string} url - The raw image URL.
 * @param {Object} [options]
 * @param {number} [options.width] - Optional maximum display width.
 * @param {number} [options.height] - Optional maximum display height.
 * @param {string} [options.crop='limit'] - Cloudinary crop mode ('limit', 'fill', 'thumb').
 * @param {string} [options.fallback='/img/placeholder-product.png'] - Fallback URL.
 * @returns {string} The optimized image URL.
 */
export function optimizeImageUrl(url, options = {}) {
  const {
    width,
    height,
    crop = 'limit',
    fallback = '/img/placeholder-product.png',
  } = options;

  if (!url || typeof url !== 'string') {
    return fallback;
  }

  // Cloudinary URL optimization
  if (url.includes('res.cloudinary.com')) {
    // Check if transformations already exist
    const parts = url.split('/image/upload/');
    if (parts.length === 2) {
      const prefix = parts[0] + '/image/upload/';
      const rest = parts[1];

      // Build transformation string
      const transforms = ['f_auto', 'q_auto'];
      if (width) transforms.push(`w_${width}`);
      if (height) transforms.push(`h_${height}`);
      if (width || height) transforms.push(`c_${crop}`);

      const transformStr = transforms.join(',');

      // If the URL already has transformations in path
      if (/^(?:[a-z]_[a-z0-9_]+,?)+\//.test(rest)) {
        // Already transformed, replace or return
        return url;
      }

      return `${prefix}${transformStr}/${rest}`;
    }
  }

  return url;
}

// Global browser window attachment for non-module scripts
if (typeof window !== 'undefined') {
  window.optimizeImageUrl = optimizeImageUrl;
}
