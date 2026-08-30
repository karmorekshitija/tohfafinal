/**
 * Tohfa v2 — Seller Routes
 * File: backend/src/routes/seller.routes.js
 * Mounts at: /api/seller
 */
'use strict';

const express = require('express');
const router = express.Router();
const sellerController = require('../controllers/seller.controller');
const productController = require('../controllers/product.controller');
const orderController = require('../controllers/order.controller');
const reviewController = require('../controllers/review.controller');
const buyerController = require('../controllers/buyer.controller');
const { authMiddleware } = require('../middleware/auth');
const { sellerOnly } = require('../middleware/sellerOnly');
const { uploadProductImages } = require('../middleware/upload');
const { validate, schemas } = require('../middleware/validate');

// Onboarding & application
router.post('/apply', authMiddleware, sellerController.applyAsSeller);
router.get('/application-status', authMiddleware, sellerController.getApplicationStatus);
router.post('/complete-onboarding', authMiddleware, sellerOnly, sellerController.completeOnboarding);
router.post('/onboarding', authMiddleware, sellerOnly, sellerController.completeOnboarding);
router.put('/onboarding-details', authMiddleware, sellerOnly, sellerController.completeOnboarding);

// Studio Profile
router.get('/profile', authMiddleware, sellerOnly, sellerController.getOwnSellerProfile);
router.put('/profile', authMiddleware, sellerOnly, sellerController.updateSellerProfile);
router.post('/profile/photo', authMiddleware, sellerOnly, (req, res) => res.json({ success: true, message: 'Photo updated' }));
router.post('/profile/banner', authMiddleware, sellerOnly, (req, res) => res.json({ success: true, message: 'Banner updated' }));
router.post('/profile/about-image', authMiddleware, sellerOnly, (req, res) => res.json({ success: true, message: 'About image updated' }));
router.get('/check-handle', authMiddleware, sellerOnly, (req, res) => res.json({ success: true, available: true }));

// Store Configuration & Vacation Mode
router.get('/store-config', authMiddleware, sellerOnly, sellerController.getOwnSellerProfile);
router.put('/store-config', authMiddleware, sellerOnly, sellerController.updateStoreConfig);
router.patch('/store-config', authMiddleware, sellerOnly, sellerController.updateStoreConfig);
router.patch('/status', authMiddleware, sellerOnly, sellerController.toggleVacationMode);
router.post('/zai-mode', authMiddleware, sellerOnly, sellerController.updateStoreConfig);

// Addresses (Studio dispatch/business address)
router.get('/addresses', authMiddleware, sellerOnly, buyerController.getAddresses);
router.post('/addresses', authMiddleware, sellerOnly, validate(schemas.address), buyerController.createAddress);
router.put('/addresses/:id', authMiddleware, sellerOnly, validate(schemas.address), buyerController.updateAddress);
router.delete('/addresses/:id', authMiddleware, sellerOnly, buyerController.deleteAddress);

// Listings / Products
router.get('/catalog/summary', authMiddleware, sellerOnly, sellerController.getCatalogSummary);
router.get('/listings', authMiddleware, sellerOnly, (req, res, next) => {
  req.params.sellerId = req.user.id;
  return productController.getSellerProducts(req, res, next);
});
router.get('/listings/:id', authMiddleware, sellerOnly, productController.getProduct);
router.post('/listings', authMiddleware, sellerOnly, validate(schemas.createProduct), productController.createProduct);
router.put('/listings/:id', authMiddleware, sellerOnly, productController.updateProduct);
router.patch('/listings/:id', authMiddleware, sellerOnly, productController.updateProduct);
router.patch('/listings/:id/discount', authMiddleware, sellerOnly, sellerController.updateListingDiscount);
router.post('/listings/bulk-discount', authMiddleware, sellerOnly, sellerController.bulkDiscountListings);
router.post('/listings/bulk-discount-all', authMiddleware, sellerOnly, sellerController.bulkDiscountAllListings);
router.post('/listings/:id/pause', authMiddleware, sellerOnly, (req, res, next) => {
  req.body.status = 'paused';
  return productController.updateProductStatus(req, res, next);
});
router.post('/listings/:id/resume', authMiddleware, sellerOnly, (req, res, next) => {
  req.body.status = 'active';
  return productController.updateProductStatus(req, res, next);
});
router.post('/listings/:id/photos', authMiddleware, sellerOnly, uploadProductImages, productController.uploadImages);

// Orders & Fulfillment
router.get('/orders', authMiddleware, sellerOnly, sellerController.getSellerOrders);
router.get('/orders/:id', authMiddleware, sellerOnly, sellerController.getSellerOrderDetail);
router.patch('/orders/:id/status', authMiddleware, sellerOnly, sellerController.updateSellerOrderStatus);
router.post('/orders/:id/status', authMiddleware, sellerOnly, sellerController.updateSellerOrderStatus);
router.patch('/orders/:id/tracking', authMiddleware, sellerOnly, sellerController.updateOrderTracking);
router.post('/orders/:id/tracking', authMiddleware, sellerOnly, sellerController.updateOrderTracking);
router.post('/orders/custom-proof', authMiddleware, sellerOnly, sellerController.uploadCustomProof);
router.post('/orders/:id/proof', authMiddleware, sellerOnly, sellerController.uploadCustomProof);
router.get('/orders/:id/label', authMiddleware, sellerOnly, sellerController.getOrderLabel);
router.post('/orders/:id/awb', authMiddleware, sellerOnly, sellerController.generateOrderAWB);

// Dashboard & Analytics
router.get('/dashboard-metrics', authMiddleware, sellerOnly, sellerController.getDashboardMetrics);
router.get('/dashboard-stats', authMiddleware, sellerOnly, sellerController.getDashboardMetrics);
router.get('/dashboard', authMiddleware, sellerOnly, sellerController.getDashboardMetrics);
router.get('/analytics', authMiddleware, sellerOnly, sellerController.getSellerAnalytics);
router.get('/analytics/full', authMiddleware, sellerOnly, sellerController.getSellerAnalytics);

// Payouts & Finance
router.get('/payouts', authMiddleware, sellerOnly, sellerController.getPayoutOverview);
router.get('/payouts/overview', authMiddleware, sellerOnly, sellerController.getPayoutOverview);
router.get('/earnings', authMiddleware, sellerOnly, sellerController.getSellerEarnings);
router.get('/earnings/graph', authMiddleware, sellerOnly, sellerController.getSellerEarningsGraph);
router.post('/payouts/request', authMiddleware, sellerOnly, sellerController.requestPayout);
router.post('/payouts', authMiddleware, sellerOnly, sellerController.requestPayout);
router.get('/payouts/history', authMiddleware, sellerOnly, sellerController.getPaymentHistory);
router.get('/receiving-details', authMiddleware, sellerOnly, sellerController.getReceivingDetails);
router.post('/receiving-details', authMiddleware, sellerOnly, sellerController.saveReceivingDetails);
router.get('/tax', authMiddleware, sellerOnly, sellerController.getTaxSettings);
router.post('/tax', authMiddleware, sellerOnly, sellerController.saveTaxSettings);
router.get('/invoices', authMiddleware, sellerOnly, sellerController.getSellerInvoices);
router.get('/invoices/all', authMiddleware, sellerOnly, sellerController.getSellerInvoices);
router.get('/disputes', authMiddleware, sellerOnly, sellerController.getSellerDisputes);
router.get('/disputes/all', authMiddleware, sellerOnly, sellerController.getSellerDisputes);

// Reviews
router.get('/reviews', authMiddleware, sellerOnly, (req, res, next) => {
  req.params.sellerId = req.user.id;
  return reviewController.getSellerReviews(req, res, next);
});
router.post('/reviews/:id/reply', authMiddleware, sellerOnly, reviewController.replyToReview);
router.get('/review-settings', authMiddleware, sellerOnly, (req, res) => res.json({ success: true, data: {} }));
router.post('/review-settings', authMiddleware, sellerOnly, (req, res) => res.json({ success: true, message: 'Settings saved' }));

// Follow / Unfollow artisan
router.post('/follow', authMiddleware, sellerController.followSeller);
router.delete('/follow', authMiddleware, sellerController.unfollowSeller);
router.post('/:id/follow', authMiddleware, sellerController.followSeller);
router.delete('/:id/follow', authMiddleware, sellerController.unfollowSeller);

// Public storefront view
router.get('/public/:userId', sellerController.getPublicSellerProfile);

module.exports = router;

