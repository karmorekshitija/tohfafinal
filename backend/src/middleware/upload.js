/**
 * Tohfa v2 — File Upload Middleware
 * File: backend/src/middleware/upload.js
 * Role: Multer + Cloudinary storage. Handles multipart image uploads.
 *       Max 10MB per file. Images stored in organized Cloudinary folders.
 */
'use strict';

const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

function imageFileFilter(req, file, cb) {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  const ext = (file.originalname || '').toLowerCase().split('.').pop();
  const dangerousExts = ['php', 'js', 'html', 'htm', 'exe', 'sh', 'py', 'svg', 'cgi', 'bat', 'cmd', 'pl', 'phtml', 'jar'];

  if (dangerousExts.includes(ext)) {
    return cb(new Error('Security violation: Dangerous file extension not permitted.'), false);
  }

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed.'), false);
  }
}

function createUploader(folder, maxCount = 10) {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `tohfa/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 1920, height: 1920, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }
      ],
    },
  });

  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: imageFileFilter,
  }).array('images', maxCount);
}

// Product images uploader (up to 8 images)
const uploadProductImages = createUploader('products', 8);

// Profile photo uploader (1 file)
const uploadProfilePhoto = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'tohfa/profiles',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 400, height: 400, crop: 'fill', quality: 'auto:good', fetch_format: 'auto' }
      ],
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
}).single('photo');

// Cover/banner photo uploader (1 file)
const uploadCoverPhoto = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'tohfa/covers',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 1200, height: 400, crop: 'fill', quality: 'auto:good', fetch_format: 'auto' }
      ],
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
}).single('cover');

// Customization reference images (up to 5)
const uploadRefImages = createUploader('customization-refs', 5);


// Resilient single image uploader that tries Cloudinary first, and seamlessly falls back
// to an optimized base64 Data URI if Cloudinary credentials or signatures fail.
function createResilientSingleUploader(fieldName, defaultFolder, options = {}) {
  const memUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: imageFileFilter,
  }).single(fieldName);

  return (req, res, next) => {
    memUpload(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
      }
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }

      if (!req.file) {
        return next();
      }

      const folder = options.getFolder ? options.getFolder(req) : (defaultFolder || 'general');
      const cfg = cloudinary.config();
      const isCloudinaryReady = Boolean(
        cfg.cloud_name && !cfg.cloud_name.startsWith('YOUR_') &&
        cfg.api_key && !cfg.api_key.startsWith('YOUR_') &&
        cfg.api_secret && !cfg.api_secret.startsWith('YOUR_')
      );

      if (isCloudinaryReady) {
        try {
          const uploadOptions = {
            folder: `tohfa/${folder}`,
            resource_type: 'image',
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
            transformation: options.transformation || [
              { width: options.maxWidth || 1200, height: options.maxHeight || 1200, crop: 'limit' }
            ],
          };

          const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(uploadOptions, (cErr, result) => {
              if (cErr) return reject(cErr);
              resolve(result);
            });
            stream.end(req.file.buffer);
          });

          req.file.path = optimizeCloudinaryUrl(uploadResult.secure_url);
          req.file.filename = uploadResult.public_id;
          return next();
        } catch (cErr) {
          console.warn(`[Upload] Cloudinary upload for '${folder}' failed (${cErr.message}). Using resilient fallback.`);
        }
      }

      // Safe resilient fallback: store as optimized data URI
      const mime = req.file.mimetype || 'image/jpeg';
      const base64Data = req.file.buffer.toString('base64');
      req.file.path = `data:${mime};base64,${base64Data}`;
      req.file.filename = `local_${Date.now()}`;
      next();
    });
  };
}

// Category image (admin) - resilient
const uploadCategoryImage = createResilientSingleUploader('image', 'categories', {
  maxWidth: 800,
  maxHeight: 800,
});

// Banner/hero image (admin) - resilient
const uploadBannerImage = createResilientSingleUploader('banner', 'banners', {
  maxWidth: 1400,
  maxHeight: 560,
});

// Generic single media uploader (used by /api/upload) - resilient
const uploadSingleMedia = createResilientSingleUploader('file', 'general', {
  getFolder: (req) => ((req.body && req.body.folder) ? req.body.folder : 'general'),
  maxWidth: 1920,
  maxHeight: 1920,
});

// Proof-of-work image uploader (1 file)
const uploadProofImage = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'tohfa/customization-proofs',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 1920, height: 1920, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }
      ],
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
}).single('proof');

/**
 * Ensures a Cloudinary URL has f_auto,q_auto transformations applied for optimal delivery
 */
function optimizeCloudinaryUrl(url) {
  if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return url;
  if (url.includes('/f_auto') || url.includes('q_auto')) return url;
  return url.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
}

/**
 * Wrap multer middleware to propagate errors to Express error handler
 */
function handleUpload(uploadFn) {
  return (req, res, next) => {
    uploadFn(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
      }
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  };
}

module.exports = {
  imageFileFilter,
  uploadProductImages: handleUpload(uploadProductImages),
  uploadProfilePhoto:  handleUpload(uploadProfilePhoto),
  uploadCoverPhoto:    handleUpload(uploadCoverPhoto),
  uploadRefImages:     handleUpload(uploadRefImages),
  uploadBannerImage,
  uploadCategoryImage,
  uploadProofImage:    handleUpload(uploadProofImage),
  uploadSingleMedia,
  optimizeCloudinaryUrl,
};

