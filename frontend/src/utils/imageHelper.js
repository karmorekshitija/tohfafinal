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
    const parts = url.split('/image/upload/');
    if (parts.length === 2) {
      const prefix = parts[0] + '/image/upload/';
      const rest = parts[1];

      // Check if existing transformation segment exists (e.g. f_auto,q_auto/ or w_1000,c_limit/)
      const match = rest.match(/^((?:[a-z]_[a-z0-9_.-]+,?)+)\/(.*)$/);
      let existingTransforms = [];
      let assetPath = rest;

      if (match) {
        existingTransforms = match[1].split(',').filter(Boolean);
        assetPath = match[2];
      }

      // Build dictionary of transformations
      const transformMap = new Map();
      existingTransforms.forEach(t => {
        const idx = t.indexOf('_');
        if (idx !== -1) {
          transformMap.set(t.substring(0, idx), t.substring(idx + 1));
        } else {
          transformMap.set(t, true);
        }
      });

      // Ensure modern format and quality
      if (!transformMap.has('f')) transformMap.set('f', 'auto');
      if (!transformMap.has('q')) transformMap.set('q', 'auto');

      // Set width/height/crop if requested
      if (width) transformMap.set('w', String(width));
      if (height) transformMap.set('h', String(height));
      if (options.crop) {
        transformMap.set('c', options.crop);
      } else if ((width || height) && !transformMap.has('c')) {
        transformMap.set('c', crop);
      }

      // Reconstruct transformation string
      const transforms = [];
      if (transformMap.has('f')) transforms.push(`f_${transformMap.get('f')}`);
      if (transformMap.has('q')) transforms.push(`q_${transformMap.get('q')}`);
      if (transformMap.has('c')) transforms.push(`c_${transformMap.get('c')}`);
      if (transformMap.has('w')) transforms.push(`w_${transformMap.get('w')}`);
      if (transformMap.has('h')) transforms.push(`h_${transformMap.get('h')}`);

      for (const [k, v] of transformMap.entries()) {
        if (!['f', 'q', 'c', 'w', 'h'].includes(k)) {
          transforms.push(v === true ? k : `${k}_${v}`);
        }
      }

      return `${prefix}${transforms.join(',')}/${assetPath}`;
    }
  }

  return url;
}

// Global browser window attachment for non-module scripts
if (typeof window !== 'undefined') {
  window.optimizeImageUrl = optimizeImageUrl;
}
