/**
 * Tohfa v2 — Admin Routes
 * File: backend/src/routes/admin.routes.js
 * Mounts at: /api/admin
 */
'use strict';

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authController = require('../controllers/auth.controller');
const orderController = require('../controllers/order.controller');
const analyticsController = require('../controllers/analytics.controller');
const { authMiddleware } = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { uploadBannerImage, uploadCategoryImage } = require('../middleware/upload');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { validate, schemas } = require('../middleware/validate');

// Public / Auth endpoints
router.post('/auth/login', authRateLimiter, validate(schemas.login), authController.login);
router.post('/auth/refresh', authController.refresh);

// Public read endpoints for platform discovery
router.get('/categories', adminController.listCategories);
router.get('/banners', adminController.listBanners);

// User report creation
router.post('/reports', authMiddleware, adminController.createReport);

// All other endpoints require Admin privilege
router.use(authMiddleware, adminOnly);

// 1. Dashboard & Reports
router.get('/stats', adminController.getPlatformStats);
router.get('/dashboard/summary', analyticsController.getAdminStats || adminController.getPlatformStats);
router.get('/dashboard/revenue-chart', analyticsController.getRevenueChart);
router.get('/dashboard/footfall', analyticsController.getFootfall);
router.get('/dashboard/top-products', analyticsController.getPlatformTopProducts);
router.get('/dashboard/seller-activity', adminController.listSellers);
router.get('/audit-logs', adminController.listAuditLogs);
router.get('/audit-logs/:id/diff', adminController.getAuditLogDiff);

// 2. Sellers & KYC Authority
router.get('/sellers', adminController.listSellers);
router.get('/sellers/:sellerId', adminController.getSellerDetail);
router.get('/sellers/:id', adminController.getSellerDetail);
router.post('/sellers/:id/kyc', adminController.verifySellerKYC);
router.patch('/sellers/:id/kyc', adminController.verifySellerKYC);
router.post('/sellers/:sellerId/kyc', adminController.verifySellerKYC);
router.patch('/sellers/:sellerId/kyc', adminController.verifySellerKYC);
router.patch('/sellers/:id/suspend', adminController.suspendSeller);
router.post('/sellers/:id/suspend', adminController.suspendSeller);
router.patch('/sellers/:sellerId/suspend', adminController.suspendSeller);
router.post('/sellers/:sellerId/suspend', adminController.suspendSeller);
router.post('/sellers/:id/approve', adminController.approveSeller);
router.patch('/sellers/:id/approve', adminController.approveSeller);
router.post('/sellers/:id/reject', adminController.rejectSeller);
router.patch('/sellers/:id/reject', adminController.rejectSeller);
router.post('/sellers/:id/ban', adminController.banSeller);
router.delete('/sellers/:id', adminController.banSeller);

router.get('/seller-applications', (req, res, next) => {
  req.query.status = req.query.status || 'pending';
  return adminController.listSellers(req, res, next);
});
router.post('/seller-applications/:id/approve', adminController.approveSeller);
router.post('/seller-applications/:id/reject', adminController.rejectSeller);

// 2.1 TOFA Special Admin-Owned Shops
router.get('/special-shops', adminController.listSpecialShops);
router.post('/special-shops', adminController.createSpecialShop);
router.put('/special-shops/:id', adminController.updateSpecialShop);
router.patch('/special-shops/:id', adminController.updateSpecialShop);
router.post('/special-shops/:id/switch-session', adminController.switchSessionToSpecialShop);
router.post('/special-shops/:id/impersonate', adminController.switchSessionToSpecialShop);
router.get('/special-shops/:sellerId/switch-session', adminController.switchSessionToSpecialShop);
router.get('/dashboard/revenue-breakdown', adminController.getRevenueBreakdown);

// 3. Products & Tohfa Specials
router.get('/products', adminController.listAllProducts);
router.post('/products', adminController.createProduct);
router.put('/products/:id', adminController.updateProduct);
router.patch('/products/:id', adminController.updateProduct);
router.patch('/products/:productId/status', adminController.toggleProductStatus);
router.patch('/products/:id/status', adminController.toggleProductStatus);
router.patch('/products/:id/sponsor', adminController.toggleSponsor);
router.delete('/products/:id', adminController.deleteProduct);

// 4. Orders & Emergency Dispute Resolution
router.get('/orders', orderController.getAdminOrders);
router.get('/orders/:orderId', orderController.getOrderById);
router.get('/orders/:id', orderController.getOrderById);
router.patch('/orders/:id/force-status', adminController.forceUpdateOrderStatus);
router.post('/orders/:id/force-status', adminController.forceUpdateOrderStatus);
router.patch('/orders/:orderId/force-status', adminController.forceUpdateOrderStatus);
router.post('/orders/:orderId/force-status', adminController.forceUpdateOrderStatus);
router.post('/orders/:id/refund', adminController.forceRefundOrder);
router.patch('/orders/:id/refund', adminController.forceRefundOrder);
router.post('/orders/:orderId/refund', adminController.forceRefundOrder);
router.patch('/orders/:orderId/refund', adminController.forceRefundOrder);

router.get('/refunds', orderController.listRefundRequests);
router.post('/refunds/:id/approve', orderController.approveRefund);
router.patch('/refunds/:id/approve', orderController.approveRefund);
router.post('/refunds/:id/reject', orderController.rejectRefund);
router.patch('/refunds/:id/reject', orderController.rejectRefund);

// 5. Payouts & Platform Financials
router.get('/payouts/pending', adminController.getPendingPayouts);
router.post('/payouts/:id/disburse', adminController.disburseSellerPayout);
router.patch('/payouts/:id/disburse', adminController.disburseSellerPayout);
router.post('/payouts/:payoutId/disburse', adminController.disburseSellerPayout);
router.patch('/payouts/:payoutId/disburse', adminController.disburseSellerPayout);

// 6. User Management
router.get('/users', adminController.getAllUsers);
router.patch('/users/:id/status', adminController.toggleUserStatus);
router.post('/users/:id/status', adminController.toggleUserStatus);
router.patch('/users/:userId/status', adminController.toggleUserStatus);
router.post('/users/:userId/status', adminController.toggleUserStatus);


// 7. Categories & Subcategories
router.post('/categories', uploadCategoryImage, adminController.createCategory);
router.put('/categories/:id', uploadCategoryImage, adminController.updateCategory);
router.patch('/categories/:id', uploadCategoryImage, adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);
router.post('/subcategories', adminController.createSubcategory);
router.patch('/subcategories/:id', adminController.updateSubcategory);
router.delete('/subcategories/:id', adminController.deleteSubcategory);

// 8. Coupons & Promotions
router.get('/coupons', adminController.getAllCoupons);
router.post('/coupons', adminController.createCoupon);
router.delete('/coupons/:id', adminController.deleteCoupon);

// 9. Banners & Our Story Curation
router.post('/banners', uploadBannerImage, adminController.createBanner);
router.patch('/banners/:id/toggle', adminController.toggleBanner);
router.delete('/banners/:id', adminController.deleteBanner);

// 10. Reports
router.get('/reports', adminController.listReports);
router.patch('/reports/:id', adminController.updateReport);

module.exports = router;
