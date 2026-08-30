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

function createUploader(folder, maxCount = 10) {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `tohfa/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    },
  });

  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only JPEG, PNG, and WebP images are allowed.'));
      }
    },
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
      transformation: [{ width: 400, height: 400, crop: 'fill', quality: 'auto' }],
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('photo');

// Cover/banner photo uploader (1 file)
const uploadCoverPhoto = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'tohfa/covers',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ width: 1200, height: 400, crop: 'fill', quality: 'auto' }],
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
}).single('cover');

// Customization reference images (up to 5)
const uploadRefImages = createUploader('customization-refs', 5);

// Banner/hero image (admin)
const uploadBannerImage = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'tohfa/banners',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ width: 1400, height: 560, crop: 'fill', quality: 'auto' }],
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('banner');

// Proof-of-work image uploader (1 file)
const uploadProofImage = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'tohfa/customization-proofs',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('proof');

// Category image (admin)
const uploadCategoryImage = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'tohfa/categories',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ width: 800, height: 800, crop: 'fill', quality: 'auto' }],
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('image');

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
  uploadProductImages: handleUpload(uploadProductImages),
  uploadProfilePhoto:  handleUpload(uploadProfilePhoto),
  uploadCoverPhoto:    handleUpload(uploadCoverPhoto),
  uploadRefImages:     handleUpload(uploadRefImages),
  uploadBannerImage:   handleUpload(uploadBannerImage),
  uploadCategoryImage:  handleUpload(uploadCategoryImage),
  uploadProofImage:    handleUpload(uploadProofImage),
};

