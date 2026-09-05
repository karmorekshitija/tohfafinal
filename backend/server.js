/**
 * Tohfa v2 — Backend Entry Point
 * File: backend/server.js
 * Role: Creates and configures the Express app, mounts all middleware
 *       and routes, starts the HTTP server, initializes the cron scheduler.
 */

'use strict';

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const path         = require('path');

// Route imports
const authRoutes           = require('./src/routes/auth.routes');
const buyerRoutes          = require('./src/routes/buyer.routes');
const sellerRoutes         = require('./src/routes/seller.routes');
const adminRoutes          = require('./src/routes/admin.routes');
const productRoutes        = require('./src/routes/product.routes');
const cartRoutes           = require('./src/routes/cart.routes');
const orderRoutes          = require('./src/routes/order.routes');
const customizationRoutes  = require('./src/routes/customization.routes');
const paymentRoutes        = require('./src/routes/payment.routes');
const wishlistRoutes       = require('./src/routes/wishlist.routes');
const occasionRoutes       = require('./src/routes/occasion.routes');
const couponRoutes         = require('./src/routes/coupon.routes');
const reviewRoutes         = require('./src/routes/review.routes');
const notificationRoutes   = require('./src/routes/notification.routes');
const analyticsRoutes      = require('./src/routes/analytics.routes');
const tanyaRoutes          = require('./src/routes/tanya.routes');
const logisticsRoutes      = require('./src/routes/logistics.routes');
const webhookRoutes        = require('./src/routes/webhook.routes');
const uploadRoutes         = require('./src/routes/upload.routes');

// Middleware imports
const { rateLimiter, tanyaRateLimiter }   = require('./src/middleware/rateLimiter');
const { errorHandler }  = require('./src/middleware/errorHandler');
const { authMiddleware } = require('./src/middleware/auth');

// Controller imports for root aliases
const productController   = require('./src/controllers/product.controller');
const adminController     = require('./src/controllers/admin.controller');
const buyerController     = require('./src/controllers/buyer.controller');
const sellerController    = require('./src/controllers/seller.controller');
const cartController      = require('./src/controllers/cart.controller');
const wishlistController  = require('./src/controllers/wishlist.controller');
const occasionController  = require('./src/controllers/occasion.controller');
const couponController    = require('./src/controllers/coupon.controller');
const logisticsController = require('./src/controllers/logistics.controller');

// ---------------------------------------------------------------------------
// APP INIT
// ---------------------------------------------------------------------------
const app = express();

// Trust reverse proxy (Vercel edge -> Render proxy -> Express = 2 hops)
app.set('trust proxy', 2);

// ---------------------------------------------------------------------------
// SECURITY HEADERS
// ---------------------------------------------------------------------------
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ---------------------------------------------------------------------------
// CORS
// Allow configured frontend origin(s), Vercel deployments, production domain, and local dev
// ---------------------------------------------------------------------------
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = [
  ...configuredOrigins,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4000',
  'http://127.0.0.1:5173',
  'https://thetohfa.in',
  'https://www.thetohfa.in',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman in dev, same-origin proxy, curl)
    if (!origin) return callback(null, true);

    // Allow all local dev origins (localhost / 127.0.0.1 on any port)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // Allow all Vercel preview and production deployments (*.vercel.app)
    if (/^https:\/\/[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }

    // Allow specific configured domains
    const normalizedOrigin = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    // Custom domain suffix matching (e.g. *.thetohfa.in)
    if (/^https:\/\/[a-zA-Z0-9_-]+\.thetohfa\.in$/.test(origin)) {
      return callback(null, true);
    }

    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}));

// ---------------------------------------------------------------------------
// BODY PARSERS
// Note: webhook route needs raw body for Razorpay signature verification
// so it's mounted BEFORE json middleware below.
// ---------------------------------------------------------------------------
app.use('/api/webhook', webhookRoutes);   // raw body — must be before express.json()

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ---------------------------------------------------------------------------
// GLOBAL RATE LIMITER (applied to all routes)
// Per-route tighter limits are applied inside auth.routes.js
// ---------------------------------------------------------------------------
app.use('/api', rateLimiter);

// ---------------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' });
});

// ---------------------------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------------------------
app.use('/api/auth',          authRoutes);
app.use('/api/buyer',         buyerRoutes);
app.use('/api/profile',       buyerRoutes);   // Alias for /api/profile/me
app.use('/api/seller',        sellerRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/products',      productRoutes);
app.use('/api/product',       productRoutes);  // Alias
app.use('/api/cart',          cartRoutes);
app.use('/api/orders',        orderRoutes);
app.use('/api/order',         orderRoutes);    // Alias
app.use('/api/customization', customizationRoutes);
app.use('/api/customizations', customizationRoutes); // Alias
app.use('/api/payments',      paymentRoutes);
app.use('/api/payment',       paymentRoutes);  // Alias
app.use('/api/wishlist',      wishlistRoutes);
app.use('/api/occasions',     occasionRoutes);
app.use('/api/occasion',      occasionRoutes);
app.use('/api/coupons',       couponRoutes);
app.use('/api/coupon',        couponRoutes);
app.use('/api/reviews',       reviewRoutes);
app.use('/api/review',        reviewRoutes);   // Alias
app.use('/api/notifications', notificationRoutes);
app.use('/api/notification',  notificationRoutes); // Alias
app.use('/api/analytics',     analyticsRoutes);
app.use('/api/tanya',         tanyaRateLimiter, tanyaRoutes); // Added rate limiter for Tanya AI
app.use('/api/chatbot',       tanyaRateLimiter, tanyaRoutes);   // Alias for Tanya AI Chatbot
app.use('/api/logistics',     logisticsRoutes);
app.use('/api/upload',        uploadRoutes);


// ---------------------------------------------------------------------------
// PLATFORM DISCOVERY & COMPATIBILITY ALIASES (Section 5 Audit Fixes)
// ---------------------------------------------------------------------------
app.get('/api/products/featured', (req, res, next) => {
  req.query.featured = 'true';
  return productController.listProducts(req, res, next);
});
app.get('/api/categories', productController.listCategories);
app.get('/api/category/all', productController.listCategories);
app.get('/api/categories/:slug/products', (req, res, next) => {
  req.query.category_id = req.params.slug;
  return productController.listProducts(req, res, next);
});
app.get('/api/logistics/check', logisticsController.checkServiceability);
app.post('/api/wishlist/add', authMiddleware, wishlistController.addToWishlist);
app.put('/api/cart/update', authMiddleware, cartController.updateCartItem);
app.post('/api/coupon/verify', couponController.applyCoupon);
app.post('/api/coupons/verify', couponController.applyCoupon);
app.get('/api/user/addresses', authMiddleware, buyerController.getAddresses);
app.post('/api/occasion/new', authMiddleware, occasionController.createOccasion);
app.post('/api/seller/follow', authMiddleware, sellerController.followSeller);
app.delete('/api/seller/follow', authMiddleware, sellerController.unfollowSeller);
app.post('/api/reports', authMiddleware, adminController.createReport);
app.post('/api/bulk-inquiries', buyerController.submitBulkInquiry);
app.post('/api/buyer/bulk-inquiries', buyerController.submitBulkInquiry);

app.get('/api/home/feed', productController.forYouFeed);
app.get('/api/ui-settings/public', adminController.listBanners);
app.get('/api/sellers/:id', sellerController.getPublicSellerProfile);
app.get('/api/sellers/:id/products', (req, res, next) => {
  req.query.seller_id = req.params.id;
  return productController.listProducts(req, res, next);
});
app.get('/api/products/seller/:id', (req, res, next) => {
  req.query.seller_id = req.params.id;
  return productController.listProducts(req, res, next);
});
app.all('/api/capacity/check', (req, res) => res.json({ success: true, data: { available: true, is_available: true, message: 'Maker is accepting orders.' } }));
app.all('/api/capacity/check-cart', (req, res) => res.json({ success: true, data: { available: true, is_available: true, items: [] } }));
// ---------------------------------------------------------------------------
// MESSAGING — Not Yet Implemented
// These routes return 501 to signal to the frontend that messaging is not
// available yet. Do NOT return fake 200 responses as they mislead the UI.
// ---------------------------------------------------------------------------
const _notImplemented = (req, res) => res.status(501).json({
  success: false,
  message: 'Messaging is not yet available. This feature is coming soon.',
  code: 'FEATURE_NOT_IMPLEMENTED',
});
app.get('/api/messages/conversations', _notImplemented);
app.post('/api/messages/conversations', _notImplemented);
app.get('/api/messages/:id', _notImplemented);
app.post('/api/messages/:id', _notImplemented);

// ---------------------------------------------------------------------------
// CRON TRIGGER ROUTE (Vercel Crons & External Schedulers)
// ---------------------------------------------------------------------------
const { startOccasionCron, processOccasionReminders } = require('./src/services/occasion.service');

app.get('/api/cron/reminders', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'] || '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.headers['x-vercel-cron'] !== '1') {
    return res.status(401).json({ success: false, message: 'Unauthorized cron request.' });
  }
  try {
    await processOccasionReminders();
    res.json({ success: true, message: 'Occasion reminder scan completed.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 404 HANDLER — for unmatched API routes
// ---------------------------------------------------------------------------
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found.' });
});

// ---------------------------------------------------------------------------
// CENTRAL ERROR HANDLER — must be last middleware
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// CRON SCHEDULER — WhatsApp occasion reminders
// Only initialize persistent node-cron in traditional server environments (not Vercel)
// ---------------------------------------------------------------------------
if (!process.env.VERCEL && process.env.ENABLE_CRON !== 'false') {
  startOccasionCron();
}

// ---------------------------------------------------------------------------
// START SERVER & DATABASE AUTO-SYNC
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 4000;
const { autoSyncDatabase } = require('./src/db/auto_sync');

// Run automatic non-destructive schema synchronization on boot
autoSyncDatabase();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🎁 Tohfa v2 Backend running on port ${PORT}`);
    console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Health check: http://localhost:${PORT}/health\n`);
  });
}

module.exports = app; // export for Jest tests
