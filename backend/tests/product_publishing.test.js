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
const { sellerOnly } = require('../src/middleware/sellerOnly');

describe('Product Publishing — Seller Studio & Tohfa Special Studio', () => {
  let adminToken;
  let sellerToken;
  let buyerToken;
  let specialShopId;
  let activeCategory;
  const createdProductIds = [];

  beforeAll(async () => {
    // 1. Fetch fixture users and shop
    const { rows: adminRows } = await query(
      "SELECT id, email FROM users WHERE role IN ('admin', 'master_admin') LIMIT 1"
    );
    const adminUser = adminRows[0] || { id: 93, email: 'admin@tohfa.in' };

    const { rows: sellerRows } = await query(
      "SELECT u.id, u.email FROM users u JOIN sellers s ON s.user_id = u.id WHERE u.role = 'seller' LIMIT 1"
    );
    const sellerUser = sellerRows[0] || { id: 128, email: 'seller@test.dev' };

    const { rows: buyerRows } = await query(
      "SELECT id, email FROM users WHERE role = 'buyer' LIMIT 1"
    );
    const buyerUser = buyerRows[0] || { id: 27, email: 'buyer@test.dev' };

    const { rows: specialRows } = await query(
      "SELECT id, user_id, store_name FROM sellers WHERE is_admin_managed::text IN ('1', 'true') LIMIT 1"
    );
    specialShopId = specialRows[0]?.id || specialRows[0]?.user_id || 28;

    const { rows: catRows } = await query(
      'SELECT id, slug, name FROM categories WHERE is_active = TRUE LIMIT 1'
    );
    activeCategory = catRows[0];

    // Issue test tokens with uppercase and lowercase roles to test authorization
    adminToken = signAccessToken({ id: adminUser.id, email: adminUser.email, role: 'ADMIN' });
    sellerToken = signAccessToken({ id: sellerUser.id, email: sellerUser.email, role: 'SELLER' });
    buyerToken = signAccessToken({ id: buyerUser.id, email: buyerUser.email, role: 'BUYER' });
  });

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await query('DELETE FROM product_images WHERE product_id = ANY($1::int[])', [createdProductIds]);
      await query('DELETE FROM product_occasion_tags WHERE product_id = ANY($1::int[])', [createdProductIds]);
      await query('DELETE FROM products WHERE id = ANY($1::int[])', [createdProductIds]);
    }
  });

  describe('sellerOnly Middleware Unit Tests', () => {
    it('should allow user with role SELLER', () => {
      const req = { user: { role: 'SELLER' } };
      const res = {};
      let called = false;
      const next = () => { called = true; };
      sellerOnly(req, res, next);
      expect(called).toBe(true);
    });

    it('should allow user with role ADMIN', () => {
      const req = { user: { role: 'ADMIN' } };
      const res = {};
      let called = false;
      const next = () => { called = true; };
      sellerOnly(req, res, next);
      expect(called).toBe(true);
    });

    it('should allow user with lowercase role seller or admin', () => {
      let calledSeller = false;
      sellerOnly({ user: { role: 'seller' } }, {}, () => { calledSeller = true; });
      expect(calledSeller).toBe(true);

      let calledAdmin = false;
      sellerOnly({ user: { role: 'admin' } }, {}, () => { calledAdmin = true; });
      expect(calledAdmin).toBe(true);
    });

    it('should reject non-seller and non-admin with 403 Forbidden', () => {
      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      const res = { status: statusMock };
      let called = false;
      const next = () => { called = true; };

      sellerOnly({ user: { role: 'BUYER' } }, res, next);
      expect(called).toBe(false);
      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Seller or Admin access required'
      }));
    });
  });

  describe('Admin in Tohfa Special Studio (POST /api/products)', () => {
    it('should successfully publish a product for Tohfa Special shop with X-Seller-Id header', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Seller-Id', String(specialShopId))
        .send({
          name: 'Special Studio Handcrafted Lamp',
          description: 'Beautiful artisanal wooden lamp',
          base_price: 1299,
          category_id: activeCategory.id,
          stock_quantity: 15,
          images: ['https://res.cloudinary.com/tohfa/image/upload/sample_lamp.jpg']
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product).toBeDefined();
      expect(res.body.data.product.name).toBe('Special Studio Handcrafted Lamp');
      expect(res.body.data.product.category_id).toBe(activeCategory.id);
      expect(res.body.data.product.images.length).toBeGreaterThanOrEqual(1);

      if (res.body.data.product.id) {
        createdProductIds.push(res.body.data.product.id);
      }
    });

    it('should successfully publish a product when seller_id is passed in request body', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          seller_id: specialShopId,
          name: 'Special Studio Scented Candle',
          description: 'Lavender infused soy wax candle',
          base_price: 499,
          category: activeCategory.slug,
          stock_quantity: 25,
          images: ['https://res.cloudinary.com/tohfa/image/upload/sample_candle.jpg']
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.name).toBe('Special Studio Scented Candle');

      if (res.body.data.product.id) {
        createdProductIds.push(res.body.data.product.id);
      }
    });

    it('should fail with 400 if Admin does not supply a seller/shop identifier', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Unassigned Product',
          base_price: 350,
          category_id: activeCategory.id
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/seller\/shop identifier required/i);
    });
  });

  describe('Regular Seller Studio (POST /api/products & POST /api/seller/products)', () => {
    it('should allow regular seller to publish product via POST /api/products', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Artisan Ceramic Vase',
          description: 'Hand-thrown terracotta vase',
          base_price: 850,
          category_id: activeCategory.id,
          stock_quantity: 8,
          images: ['https://res.cloudinary.com/tohfa/image/upload/sample_vase.jpg']
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.name).toBe('Artisan Ceramic Vase');

      if (res.body.data.product.id) {
        createdProductIds.push(res.body.data.product.id);
      }
    });

    it('should allow regular seller to publish product via alias POST /api/seller/products', async () => {
      const res = await request(app)
        .post('/api/seller/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Handwoven Macrame Wall Hanging',
          description: 'Boho decor piece',
          base_price: 650,
          category_id: activeCategory.id,
          stock_quantity: 5
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      if (res.body.data.product.id) {
        createdProductIds.push(res.body.data.product.id);
      }
    });

    it('should reject buyer token with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          name: 'Unauthorized Product',
          base_price: 100,
          category_id: activeCategory.id
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Category Resolution Flexibility (resolveCategoryId)', () => {
    it('should resolve category using categoryId field name', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Product with categoryId key',
          base_price: 399,
          categoryId: activeCategory.id
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.category_id).toBe(activeCategory.id);

      if (res.body.data.product.id) {
        createdProductIds.push(res.body.data.product.id);
      }
    });

    it('should resolve category using category name string', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Product with category name string',
          base_price: 450,
          category: activeCategory.name
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.category_id).toBe(activeCategory.id);

      if (res.body.data.product.id) {
        createdProductIds.push(res.body.data.product.id);
      }
    });

    it('should resolve category using category slug string', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Product with category slug string',
          base_price: 550,
          category: activeCategory.slug
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.category_id).toBe(activeCategory.id);

      if (res.body.data.product.id) {
        createdProductIds.push(res.body.data.product.id);
      }
    });

    it('should return 400 when category does not exist', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Product with fake category',
          base_price: 299,
          category: 'non-existent-category-xyz-999'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/valid category required/i);
    });

    it('should return 400 when category is missing entirely', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Product without category',
          base_price: 299
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/valid category required/i);
    });
  });

  describe('Multipart/Form-Data File Upload Handling', () => {
    it('should accept multipart/form-data with image attachment', async () => {
      const fakeImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .field('name', 'Multipart Upload Product')
        .field('base_price', '799')
        .field('category_id', String(activeCategory.id))
        .field('description', 'Created via multipart/form-data')
        .attach('images', fakeImageBuffer, { filename: 'test_product.png', contentType: 'image/png' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.name).toBe('Multipart Upload Product');
      expect(res.body.data.product.images.length).toBeGreaterThanOrEqual(1);

      if (res.body.data.product.id) {
        createdProductIds.push(res.body.data.product.id);
      }
    });
  });
});
