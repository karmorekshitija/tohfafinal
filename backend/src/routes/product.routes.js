/**
 * Tohfa v2 — Product Routes
 * File: backend/src/routes/product.routes.js
 * Mounts at: /api/products
 */
'use strict';

const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const { authMiddleware } = require('../middleware/auth');
const { sellerOnly } = require('../middleware/sellerOnly');
const { uploadProductImages } = require('../middleware/upload');
const { validate, schemas } = require('../middleware/validate');

// Public catalog & discovery
router.get('/', productController.listProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/categories', productController.listCategories); // Public — used by buyer home/search
router.get('/feed', (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authMiddleware(req, res, next);
  }
  next();
}, productController.forYouFeed);
router.get('/for-you', (req, res, next) => {
  // Optional auth: parse token if available
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authMiddleware(req, res, next);
  }
  next();
}, productController.forYouFeed);
router.get('/sponsored', productController.getSponsoredProducts);
router.get('/trending', productController.getTrendingProducts);
router.get('/search', productController.searchProducts);
router.get('/search-suggestions', async (req, res) => {
  const { q = '' } = req.query;
  return res.json({ success: true, data: { suggestions: [q, `${q} gifts`, `${q} handmade`].filter(Boolean) } });
});
router.get('/trending-searches', async (req, res) => {
  return res.json({ success: true, data: { searches: ['Ceramic Mug', 'Resin Art', 'Embroidered Tote', 'Scented Candles', 'Handmade Journal'] } });
});
router.get('/seller/:sellerId', productController.getSellerProducts);
router.get('/:id', productController.getProduct);
router.post('/:id/event', (req, res) => {
  return res.json({ success: true, message: 'Event logged.' });
});
router.get('/:id/recommendations', productController.getRecommendations);
router.get('/:id/more-like-this', productController.getRecommendations);
router.post('/:id/view', (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authMiddleware(req, res, next);
  }
  next();
}, productController.recordView);

// Seller Product Management
router.get('/seller-alerts/low-stock', authMiddleware, sellerOnly, productController.getLowStockProducts);
router.post('/', authMiddleware, sellerOnly, validate(schemas.createProduct), productController.createProduct);
router.put('/:id', authMiddleware, sellerOnly, productController.updateProduct);
router.patch('/:id/status', authMiddleware, sellerOnly, productController.updateProductStatus);
router.post('/:id/images', authMiddleware, sellerOnly, uploadProductImages, productController.uploadImages);
router.post('/:id/variants', authMiddleware, sellerOnly, productController.upsertVariants);
router.post('/:id/fixed-options', authMiddleware, sellerOnly, productController.saveFixedOptions);

module.exports = router;
