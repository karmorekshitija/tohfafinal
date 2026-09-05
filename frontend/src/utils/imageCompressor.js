/**
 * Tohfa v2 — Client-Side Image Compressor
 * File: frontend/src/utils/imageCompressor.js
 * Role: Pre-compresses image files before uploading.
 *       Preserves visual quality while reducing upload payload size by up to 80-90%.
 */

/**
 * Compresses an image file before upload.
 * @param {File|Blob} file - The file to compress.
 * @param {Object} [options]
 * @param {number} [options.maxWidth=1920] - Maximum width constraint.
 * @param {number} [options.maxHeight=1920] - Maximum height constraint.
 * @param {number} [options.quality=0.88] - Quality factor (0.88 gives visually lossless result).
 * @param {number} [options.maxSizeMB=1.5] - Only compress if file size exceeds this, unless dimensions are oversized.
 * @returns {Promise<File|Blob>} The compressed File or original if not eligible.
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.88,
    maxSizeMB = 1.0,
  } = options;

  // Non-image or unsupported formats are bypassed
  if (!file || !file.type || !file.type.startsWith('image/')) {
    return file;
  }

  // Animated gifs or SVGs should not be canvas-rasterized
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  const isOversized = file.size > maxSizeMB * 1024 * 1024;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // If file is already small and dimensions are within bounds, skip compression
        if (!isOversized && width <= maxWidth && height <= maxHeight) {
          return resolve(file);
        }

        // Calculate aspect-ratio preserved dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(file);

        // High quality canvas scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(img, 0, 0, width, height);

        // Choose optimal output format: JPEG or WebP
        const targetType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              // Return original if compressed blob is somehow not smaller
              return resolve(file);
            }

            const fileName = file.name || 'uploaded_image.jpg';
            const compressedFile = new File([blob], fileName, {
              type: targetType,
              lastModified: Date.now(),
            });

            resolve(compressedFile);
          },
          targetType,
          quality
        );
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an array or FileList of image files in parallel.
 * @param {FileList|Array<File>} files
 * @param {Object} [options]
 * @returns {Promise<Array<File>>}
 */
export async function compressImageFiles(files, options = {}) {
  if (!files || !files.length) return [];
  const fileArray = Array.from(files);
  return Promise.all(fileArray.map((f) => compressImage(f, options)));
}

// Global browser window attachment for non-module scripts
if (typeof window !== 'undefined') {
  window.compressImage = compressImage;
  window.compressImageFiles = compressImageFiles;
}
