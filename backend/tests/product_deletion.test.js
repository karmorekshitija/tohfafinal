'use strict';

const request = require('supertest');
const express = require('express');
const productRoutes = require('../src/routes/product.routes');
const sellerRoutes = require('../src/routes/seller.routes');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/products', productRoutes);
app.use('/api/seller', sellerRoutes);

const { query } = require('../src/config/db');
const { signAccessToken } = require('../src/services/auth.service');
const { verifySellerOwnership } = require('../src/middleware/ownership');

describe('Product Deletion — Seller Studio & Tohfa Special Studio', () => {
  let adminToken;
  let sellerToken;
  let otherSellerToken;
  let buyerToken;
  let adminUser;
  let sellerUser;
  let otherSellerUser;
  let specialShopId;
  let activeCategory;
  const createdProductIds = [];

  const TEST_NAMES = [
    'Test Delete Product',
    'Special Tohfa Delete Item'
  ];

  async function cleanupTestProducts() {
    try {
      const pIds = createdProductIds.map(String);
      if (pIds.length > 0) {
        await query('DELETE FROM product_images WHERE product_id::text = ANY($1::text[])', [pIds]).catch(() => {});
        await query('DELETE FROM product_occasion_tags WHERE product_id::text = ANY($1::text[])', [pIds]).catch(() => {});
        await query('DELETE FROM products WHERE id::text = ANY($1::text[])', [pIds]).catch(() => {});
      }
      await query('DELETE FROM products WHERE name = ANY($1::text[])', [TEST_NAMES]).catch(() => {});
    } catch (_) {}
  }

  beforeAll(async () => {
    // 0. Pre-cleanup
    await cleanupTestProducts();

    // 1. Fetch fixture users and shop
    const { rows: adminRows } = await query(
      "SELECT id, email FROM users WHERE role IN ('admin', 'master_admin') LIMIT 1"
    );
    adminUser = adminRows[0] || { id: 93, email: 'admin@tohfa.in' };

    const { rows: sellerRows } = await query(
      "SELECT u.id, u.email FROM users u JOIN sellers s ON s.user_id = u.id WHERE u.role = 'seller' LIMIT 2"
    );
    sellerUser = sellerRows[0] || { id: 128, email: 'seller@test.dev' };
    otherSellerUser = sellerRows[1] || { id: 9999, email: 'other_seller@test.dev' };

    const { rows: buyerRows } = await query(
      "SELECT id, email FROM users WHERE role = 'buyer' LIMIT 1"
    );
    const buyerUser = buyerRows[0] || { id: 27, email: 'buyer@test.dev' };

    const { rows: specialRows } = await query(
      "SELECT id, user_id, store_name FROM sellers WHERE is_admin_managed::text IN ('1', 'true') LIMIT 1"
    );
    let specialShop = specialRows[0];
    if (!specialShop) {
      const { rows: anySeller } = await query("SELECT id, user_id FROM sellers LIMIT 1");
      specialShop = anySeller[0];
    }
    specialShopId = specialShop ? (specialShop.user_id || specialShop.id) : sellerUser.id;

    const { rows: catRows } = await query(
      'SELECT id, slug, name FROM categories WHERE is_active = TRUE LIMIT 1'
    );
    activeCategory = catRows[0];

    // Issue tokens
    adminToken = signAccessToken({ id: adminUser.id, email: adminUser.email, role: 'ADMIN' });
    sellerToken = signAccessToken({ id: sellerUser.id, email: sellerUser.email, role: 'SELLER' });
    otherSellerToken = signAccessToken({ id: otherSellerUser.id, email: otherSellerUser.email, role: 'SELLER' });
    buyerToken = signAccessToken({ id: buyerUser.id, email: buyerUser.email, role: 'BUYER' });
  });

  afterAll(async () => {
    await cleanupTestProducts();
  });

  describe('verifySellerOwnership Middleware Unit Tests', () => {
    it('should bypass ownership check for ADMIN role (uppercase)', async () => {
      const mw = verifySellerOwnership('product');
      const req = {
        user: { id: adminUser.id, role: 'ADMIN' },
        params: { id: 999999 }
      };
      let nextCalled = false;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      await mw(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    it('should bypass ownership check for MASTER_ADMIN role', async () => {
      const mw = verifySellerOwnership('product');
      const req = {
        user: { id: adminUser.id, role: 'MASTER_ADMIN' },
        params: { id: 999999 }
      };
      let nextCalled = false;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      await mw(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });
  });

  describe('Seller Studio Product Soft Deletion', () => {
    let testProductId;

    beforeEach(async () => {
      // Create a test product owned by sellerUser
      let insertedRow;
      try {
        const { rows } = await query(
          `INSERT INTO products (seller_id, name, description, category_id, base_price, price_paise, stock_quantity, status, is_active)
           VALUES ($1, 'Test Delete Product', 'Description', $2, 500, 50000, 10, 'active', 1)
           RETURNING id`,
          [sellerUser.id, activeCategory.id]
        );
        insertedRow = rows[0];
      } catch (_) {
        const { rows } = await query(
          `INSERT INTO products (seller_id, name, description, category_id, base_price, price_paise, stock_quantity, status, is_active)
           VALUES ($1, 'Test Delete Product', 'Description', $2, 500, 50000, 10, 'active', true)
           RETURNING id`,
          [sellerUser.id, activeCategory.id]
        );
        insertedRow = rows[0];
      }
      testProductId = insertedRow.id;
      createdProductIds.push(testProductId);
    });

    it('should allow seller to soft-delete their own listing via DELETE /api/seller/listings/:id', async () => {
      const res = await request(app)
        .delete(`/api/seller/listings/${testProductId}`)
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify DB state: soft deleted
      const { rows } = await query('SELECT status, is_active FROM products WHERE id::text = $1', [testProductId]);
      expect(rows.length).toBe(1);
      expect(rows[0].status).toBe('deleted');
      expect(String(rows[0].is_active)).toMatch(/^(0|false)$/);

      // Verify that getSellerProducts hides this soft-deleted product
      const listRes = await request(app)
        .get('/api/seller/listings')
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(listRes.status).toBe(200);
      const listings = listRes.body.data.products || listRes.body.data.listings || [];
      const found = listings.find(p => String(p.id) === String(testProductId));
      expect(found).toBeUndefined();
    });

    it('should allow seller to delete product via alias DELETE /api/seller/products/:id', async () => {
      const res = await request(app)
        .delete(`/api/seller/products/${testProductId}`)
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { rows } = await query('SELECT status, is_active FROM products WHERE id::text = $1', [testProductId]);
      expect(rows[0].status).toBe('deleted');
    });

    it('should reject deletion attempt by another seller with 403 Forbidden', async () => {
      const res = await request(app)
        .delete(`/api/seller/listings/${testProductId}`)
        .set('Authorization', `Bearer ${otherSellerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);

      // Verify product is still active
      const { rows } = await query('SELECT status FROM products WHERE id::text = $1', [testProductId]);
      expect(rows[0].status).toBe('active');
    });
  });

  describe('Tohfa Special Studio Admin Product Soft Deletion', () => {
    let specialProductId;

    beforeEach(async () => {
      // Create a test product for Tohfa Special shop
      let insertedRow;
      try {
        const { rows } = await query(
          `INSERT INTO products (seller_id, name, description, category_id, base_price, price_paise, stock_quantity, status, is_active)
           VALUES ($1, 'Special Tohfa Delete Item', 'Special Description', $2, 1200, 120000, 5, 'active', 1)
           RETURNING id`,
          [specialShopId, activeCategory.id]
        );
        insertedRow = rows[0];
      } catch (_) {
        const { rows } = await query(
          `INSERT INTO products (seller_id, name, description, category_id, base_price, price_paise, stock_quantity, status, is_active)
           VALUES ($1, 'Special Tohfa Delete Item', 'Special Description', $2, 1200, 120000, 5, 'active', true)
           RETURNING id`,
          [specialShopId, activeCategory.id]
        );
        insertedRow = rows[0];
      }
      specialProductId = insertedRow.id;
      createdProductIds.push(specialProductId);
    });

    it('should allow Admin (role: ADMIN) to soft-delete Tohfa Special product without ownership error', async () => {
      const res = await request(app)
        .delete(`/api/seller/listings/${specialProductId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-seller-id', String(specialShopId));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { rows } = await query('SELECT status, is_active FROM products WHERE id::text = $1', [specialProductId]);
      expect(rows.length).toBe(1);
      expect(rows[0].status).toBe('deleted');
      expect(String(rows[0].is_active)).toMatch(/^(0|false)$/);

      // Verify getSellerProducts with admin token and x-seller-id excludes the deleted item
      const listRes = await request(app)
        .get('/api/seller/listings')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-seller-id', String(specialShopId));

      expect(listRes.status).toBe(200);
      const listings = listRes.body.data.products || listRes.body.data.listings || [];
      const found = listings.find(p => String(p.id) === String(specialProductId));
      expect(found).toBeUndefined();
    });

    it('should allow Admin to delete via DELETE /api/products/:id', async () => {
      const res = await request(app)
        .delete(`/api/products/${specialProductId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { rows } = await query('SELECT status FROM products WHERE id::text = $1', [specialProductId]);
      expect(rows[0].status).toBe('deleted');
    });
  });

  describe('Non-existent and Edge Cases', () => {
    it('should return 404 when product does not exist', async () => {
      const res = await request(app)
        .delete('/api/seller/listings/9999999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .delete('/api/seller/listings/1');

      expect(res.status).toBe(401);
    });

    it('should reject buyer token with 403', async () => {
      const res = await request(app)
        .delete('/api/seller/listings/1')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.status).toBe(403);
    });
  });
});
