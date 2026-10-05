'use strict';

const request = require('supertest');
const express = require('express');
const productRoutes = require('../src/routes/product.routes');
const sellerRoutes = require('../src/routes/seller.routes');
const authRoutes = require('../src/routes/auth.routes');
const { query } = require('../src/config/db');
const { signAccessToken } = require('../src/services/auth.service');
const {
  evaluateSellerOnboarding,
  isValidIfscOrRouting,
  isValidPincode,
  isValidGstin
} = require('../src/utils/sellerOnboarding');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/products', productRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/auth', authRoutes);

describe('Seller Studio Onboarding Prerequisite Gating & Tour API', () => {
  const timestamp = Date.now();
  let incompleteSellerUser;
  let incompleteSellerToken;
  let activeCategory;
  const createdUserIds = [];
  const createdProductIds = [];

  beforeAll(async () => {
    // 1. Get an active category for product tests
    const { rows: cats } = await query('SELECT id, name FROM categories WHERE is_active = TRUE LIMIT 1');
    if (cats.length) {
      activeCategory = cats[0];
    } else {
      const { rows: newCat } = await query(
        `INSERT INTO categories (name, slug, display_name, is_active)
         VALUES ('Handmade Pottery ${timestamp}', 'handmade-pottery-${timestamp}', 'Handmade Pottery', TRUE)
         RETURNING id, name`
      );
      activeCategory = newCat[0];
    }

    // 2. Create a test seller WITHOUT billing address and banking details
    const sellerEmail = `test_seller_gating_${timestamp}@example.com`;
    const { rows: uRows } = await query(
      `INSERT INTO users (name, full_name, email, password_hash, role, is_active)
       VALUES ('Unverified Artisan', 'Unverified Artisan', $1, '$2b$10$abcdefghijklmnopqrstuu', 'seller', TRUE)
       RETURNING id, name, full_name, email, role`,
      [sellerEmail]
    );
    incompleteSellerUser = uRows[0];
    createdUserIds.push(incompleteSellerUser.id);
    incompleteSellerToken = signAccessToken({
      id: incompleteSellerUser.id,
      email: incompleteSellerUser.email,
      role: 'seller'
    });

    const { getClient } = require('../src/config/db');
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { rows: sellerRows } = await client.query(
        `INSERT INTO sellers (user_id, store_name, slug, is_active, is_approved, pickup_address, billing_address, bank_details, onboarding_tour_dismissed)
         VALUES ($1, $2, $3, TRUE, TRUE, '{}', '{}', '{}', FALSE)
         ON CONFLICT (user_id) DO UPDATE SET is_approved = TRUE
         RETURNING id`,
        [incompleteSellerUser.id, `Studio ${timestamp}`, `studio-${timestamp}`]
      );
      const sId = sellerRows[0]?.id;
      if (sId) {
        await client.query(
          `INSERT INTO wallets (seller_id, user_id, balance, currency)
           VALUES ($1, $2, 0.00, 'INR')
           ON CONFLICT (seller_id) DO NOTHING`,
          [sId, incompleteSellerUser.id]
        );
      }
      await client.query(
        `INSERT INTO seller_profiles (user_id, store_name, slug, is_active, is_approved, pickup_address, billing_address, bank_details, onboarding_tour_dismissed)
         VALUES ($1, $2, $3, TRUE, TRUE, '{}', '{}', '{}', FALSE)
         ON CONFLICT (user_id) DO NOTHING`,
        [incompleteSellerUser.id, `Studio ${timestamp}`, `studio-${timestamp}`]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    try {
      const pIds = createdProductIds.map(String);
      if (pIds.length > 0) {
        await query('DELETE FROM product_images WHERE product_id::text = ANY($1::text[])', [pIds]).catch(() => {});
        await query('DELETE FROM products WHERE id::text = ANY($1::text[])', [pIds]).catch(() => {});
      }
      const uIds = createdUserIds.map(String);
      if (uIds.length > 0) {
        await query('DELETE FROM seller_profiles WHERE user_id::text = ANY($1::text[])', [uIds]).catch(() => {});
        await query('DELETE FROM sellers WHERE user_id::text = ANY($1::text[])', [uIds]).catch(() => {});
        await query('DELETE FROM wallets WHERE user_id::text = ANY($1::text[])', [uIds]).catch(() => {});
        await query('DELETE FROM users WHERE id::text = ANY($1::text[])', [uIds]).catch(() => {});
      }
    } catch (e) {
      console.warn('Test cleanup notice:', e.message);
    }
  });

  describe('Part 1: Unit Validation & Evaluator Logic', () => {
    it('validates Indian and International postal codes and IFSC correctly', () => {
      expect(isValidPincode('400001')).toBe(true);
      expect(isValidPincode('12345')).toBe(true);
      expect(isValidPincode('invalid')).toBe(false);

      expect(isValidIfscOrRouting('HDFC0001234')).toBe(true);
      expect(isValidIfscOrRouting('SBIN0000456')).toBe(true);
      expect(isValidIfscOrRouting('12345')).toBe(false);

      expect(isValidGstin('')).toBe(true); // Optional
      expect(isValidGstin('27AAAAA0000A1Z5')).toBe(true);
      expect(isValidGstin('invalid_gst')).toBe(false);
    });

    it('evaluates incomplete seller as having missing flags', () => {
      const emptySeller = {
        pickup_address: {},
        billing_address: {},
        bank_details: {},
        onboarding_tour_dismissed: false
      };
      const res = evaluateSellerOnboarding(emptySeller);
      expect(res.hasBillingAddress).toBe(false);
      expect(res.hasBankingDetails).toBe(false);
      expect(res.onboardingTourDismissed).toBe(false);
      expect(res.isComplete).toBe(false);
      expect(res.missing).toContain('billing_address');
      expect(res.missing).toContain('banking_details');
    });

    it('evaluates complete seller with valid details as complete', () => {
      const completeSeller = {
        billing_address: {
          address_line1: '123 Artisan Lane',
          city: 'Jaipur',
          state: 'Rajasthan',
          pincode: '302001'
        },
        bank_details: {
          account_holder_name: 'Artisan Potter',
          bank_name: 'HDFC Bank',
          account_number: '123456789012',
          ifsc_code: 'HDFC0001234'
        },
        onboarding_tour_dismissed: true
      };
      const res = evaluateSellerOnboarding(completeSeller);
      expect(res.hasBillingAddress).toBe(true);
      expect(res.hasBankingDetails).toBe(true);
      expect(res.onboardingTourDismissed).toBe(true);
      expect(res.isComplete).toBe(true);
      expect(res.missing).toHaveLength(0);
    });
  });

  describe('Part 1: Seller Status API & Tour Dismissal', () => {
    it('GET /api/seller/profile returns computed onboarding flags', async () => {
      const res = await request(app)
        .get('/api/seller/profile')
        .set('Authorization', `Bearer ${incompleteSellerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasBillingAddress).toBe(false);
      expect(res.body.data.hasBankingDetails).toBe(false);
      expect(res.body.data.onboardingTourDismissed).toBe(false);
    });

    it('GET /api/seller/onboarding/status returns status payload', async () => {
      const res = await request(app)
        .get('/api/seller/onboarding/status')
        .set('Authorization', `Bearer ${incompleteSellerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasBillingAddress).toBe(false);
      expect(res.body.data.hasBankingDetails).toBe(false);
      expect(res.body.data.onboardingTourDismissed).toBe(false);
      expect(res.body.data.isComplete).toBe(false);
    });

    it('POST /api/seller/onboarding/dismiss-tour persists onboardingTourDismissed = true', async () => {
      const res = await request(app)
        .post('/api/seller/onboarding/dismiss-tour')
        .set('Authorization', `Bearer ${incompleteSellerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.onboardingTourDismissed).toBe(true);

      // Verify in GET /api/seller/profile
      const profileRes = await request(app)
        .get('/api/seller/profile')
        .set('Authorization', `Bearer ${incompleteSellerToken}`);

      expect(profileRes.body.data.onboardingTourDismissed).toBe(true);
    });
  });

  describe('Part 2: Backend Defensive Enforcement (Zero-Bypass)', () => {
    it('POST /api/products returns HTTP 403 ONBOARDING_INCOMPLETE for incomplete seller', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${incompleteSellerToken}`)
        .send({
          name: `Handmade Clay Cup ${timestamp}`,
          description: 'Finely crafted clay cup made with organic riverbed clay.',
          base_price: 499,
          category_id: activeCategory.id,
          stock_quantity: 15
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('ONBOARDING_INCOMPLETE');
      expect(res.body.message).toBe('Banking and billing information must be completed before listing new products.');
    });

    it('POST /api/seller/listings returns HTTP 403 ONBOARDING_INCOMPLETE', async () => {
      const res = await request(app)
        .post('/api/seller/listings')
        .set('Authorization', `Bearer ${incompleteSellerToken}`)
        .send({
          name: `Handmade Vase ${timestamp}`,
          description: 'Glazed artisan ceramic vase.',
          base_price: 899,
          category_id: activeCategory.id
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('ONBOARDING_INCOMPLETE');
    });

    it('POST /api/products/draft returns HTTP 403 ONBOARDING_INCOMPLETE', async () => {
      const res = await request(app)
        .post('/api/products/draft')
        .set('Authorization', `Bearer ${incompleteSellerToken}`)
        .send({
          name: `Draft Item ${timestamp}`,
          description: 'A draft item description.',
          base_price: 299,
          category_id: activeCategory.id
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('ONBOARDING_INCOMPLETE');
    });

    it('PUT /api/products/:id/publish returns HTTP 403 ONBOARDING_INCOMPLETE', async () => {
      // Temporarily insert a paused product directly for this seller to test publish gating
      const { rows: testProds } = await query(
        `INSERT INTO products (name, slug, description, base_price, price_paise, category_id, seller_id, status)
         VALUES ($1, $2, 'Test product for publish gating', 599, 59900, $3, $4, 'paused')
         RETURNING id`,
        [`Paused Vase ${timestamp}`, `paused-vase-${timestamp}`, activeCategory.id, incompleteSellerUser.id]
      );
      const prodId = testProds[0].id;
      createdProductIds.push(prodId);

      const res = await request(app)
        .put(`/api/products/${prodId}/publish`)
        .set('Authorization', `Bearer ${incompleteSellerToken}`)
        .send();

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('ONBOARDING_INCOMPLETE');
    });
  });

  describe('Part 3 & Completion: Completing details unlocks listing creation', () => {
    it('POST /api/seller/settings/billing saves address and bank details and returns complete status', async () => {
      const res = await request(app)
        .post('/api/seller/settings/billing')
        .set('Authorization', `Bearer ${incompleteSellerToken}`)
        .send({
          address_line1: '42 Heritage Craft Colony',
          address_line2: 'Near Old City Gate',
          city: 'Udaipur',
          state: 'Rajasthan',
          pincode: '313001',
          account_holder_name: 'Unverified Artisan',
          bank_name: 'State Bank of India',
          account_number: '200123456789',
          ifsc_code: 'SBIN0001234',
          upi_id: 'artisan@okhdfcbank'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasBillingAddress).toBe(true);
      expect(res.body.data.hasBankingDetails).toBe(true);
      expect(res.body.data.onboardingStatus.isComplete).toBe(true);
    });

    it('GET /api/seller/profile now reflects hasBillingAddress: true and hasBankingDetails: true', async () => {
      const res = await request(app)
        .get('/api/seller/profile')
        .set('Authorization', `Bearer ${incompleteSellerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.hasBillingAddress).toBe(true);
      expect(res.body.data.hasBankingDetails).toBe(true);
    });

    it('POST /api/products now successfully creates a product after completing onboarding details', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${incompleteSellerToken}`)
        .send({
          name: `Now Allowed Ceramic Pot ${timestamp}`,
          description: 'A genuine handcrafted ceramic pot made with pure terracotta clay.',
          base_price: 799,
          category_id: activeCategory.id,
          stock_quantity: 10
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product).toBeDefined();
      createdProductIds.push(res.body.data.product.id);
    });
  });
});
