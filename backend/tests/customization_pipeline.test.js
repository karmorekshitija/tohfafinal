'use strict';

const request = require('supertest');
const express = require('express');
const sellerRoutes = require('../src/routes/seller.routes');
const productRoutes = require('../src/routes/product.routes');
const { query } = require('../src/config/db');
const { signAccessToken } = require('../src/services/auth.service');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/seller', sellerRoutes);
app.use('/api/products', productRoutes);

// Error handling middleware for express
app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

describe('Customization Pipeline End-to-End Suite', () => {
  let sellerUser, otherSellerUser;
  let sellerToken, otherSellerToken;
  let categoryId;
  const createdProductIds = [];
  const timestamp = Date.now();

  beforeAll(async () => {
    // 1. Create a category for testing
    const { rows: catRows } = await query(
      `INSERT INTO categories (name, slug, is_active)
       VALUES ('Custom Gifts ${timestamp}', 'custom-gifts-${timestamp}', TRUE)
       RETURNING id`
    );
    categoryId = catRows[0].id;

    // 2. Create primary seller user and verified seller profile with complete onboarding
    const { rows: uRows } = await query(
      `INSERT INTO users (name, full_name, email, password_hash, role, is_active)
       VALUES ('Custom Artisan', 'Custom Artisan', 'custom_artisan_${timestamp}@test.dev', '$2b$10$abcdefghijklmnopqrstuu', 'seller', TRUE)
       RETURNING id, email, role`
    );
    sellerUser = uRows[0];
    sellerToken = signAccessToken({ id: sellerUser.id, email: sellerUser.email, role: 'seller' });

    await query(
      `INSERT INTO seller_profiles (user_id, store_name, slug, verification_status, is_active, is_approved, onboarding_completed, billing_address, bank_details)
       VALUES ($1, 'Artisan Craft Workshop', 'artisan-craft-${timestamp}', 'verified', TRUE, TRUE, TRUE, 
               '{"address_line1":"123 Studio Way","city":"Jaipur","state":"Rajasthan","pincode":"302001"}'::jsonb,
               '{"account_number":"1234567890","ifsc":"HDFC0001234","account_holder_name":"Custom Artisan"}'::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET 
         verification_status = 'verified', 
         is_approved = TRUE, 
         onboarding_completed = TRUE,
         billing_address = EXCLUDED.billing_address,
         bank_details = EXCLUDED.bank_details`,
      [sellerUser.id]
    );

    await query(
      `INSERT INTO sellers (user_id, store_name, slug, verification_status, is_active, is_approved, onboarding_completed, billing_address, bank_details)
       VALUES ($1, 'Artisan Craft Workshop', 'artisan-craft-${timestamp}', 'verified', TRUE, TRUE, TRUE, 
               '{"address_line1":"123 Studio Way","city":"Jaipur","state":"Rajasthan","pincode":"302001"}'::jsonb,
               '{"account_number":"1234567890","ifsc":"HDFC0001234","account_holder_name":"Custom Artisan"}'::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET 
         verification_status = 'verified', 
         is_approved = TRUE, 
         onboarding_completed = TRUE,
         billing_address = EXCLUDED.billing_address,
         bank_details = EXCLUDED.bank_details`,
      [sellerUser.id]
    ).catch(() => {});

    // 3. Create another seller for IDOR protection test
    const { rows: otherRows } = await query(
      `INSERT INTO users (name, full_name, email, password_hash, role, is_active)
       VALUES ('Other Artisan', 'Other Artisan', 'other_artisan_${timestamp}@test.dev', '$2b$10$abcdefghijklmnopqrstuu', 'seller', TRUE)
       RETURNING id, email, role`
    );
    otherSellerUser = otherRows[0];
    otherSellerToken = signAccessToken({ id: otherSellerUser.id, email: otherSellerUser.email, role: 'seller' });

    await query(
      `INSERT INTO seller_profiles (user_id, store_name, slug, verification_status, is_active, is_approved, onboarding_completed)
       VALUES ($1, 'Other Workshop', 'other-workshop-${timestamp}', 'verified', TRUE, TRUE, TRUE)
       ON CONFLICT (user_id) DO UPDATE SET verification_status = 'verified', is_approved = TRUE, onboarding_completed = TRUE`,
      [otherSellerUser.id]
    );
  });

  afterAll(async () => {
    try {
      if (createdProductIds.length > 0) {
        await query('DELETE FROM fixed_customization_options WHERE product_id = ANY($1)', [createdProductIds]).catch(() => {});
        await query('DELETE FROM products WHERE id = ANY($1)', [createdProductIds]).catch(() => {});
      }
      if (categoryId) {
        await query('DELETE FROM categories WHERE id = $1', [categoryId]).catch(() => {});
      }
      if (sellerUser?.id) {
        await query('DELETE FROM seller_profiles WHERE user_id = $1', [sellerUser.id]).catch(() => {});
        await query('DELETE FROM users WHERE id = $1', [sellerUser.id]).catch(() => {});
      }
      if (otherSellerUser?.id) {
        await query('DELETE FROM seller_profiles WHERE user_id = $1', [otherSellerUser.id]).catch(() => {});
        await query('DELETE FROM users WHERE id = $1', [otherSellerUser.id]).catch(() => {});
      }
    } catch (_) {}
  });

  // Step 1: Empty state test
  test('1. GET /api/seller/customisations returns empty array on clean seller without crashing', async () => {
    const res = await request(app)
      .get('/api/seller/customisations')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const listings = res.body.data?.listings || res.body.listings;
    expect(Array.isArray(listings)).toBe(true);
    expect(listings.length).toBe(0);
  });

  // Step 2: Creation with customization options
  let createdProductId;
  test('2. POST /api/seller/listings creates product with customization_schema & syncs fixed_customization_options', async () => {
    const payload = {
      name: 'Handcrafted Personalised Leather Journal',
      description: 'Handmade leather journal with custom text engraving and brass fittings.',
      category_id: categoryId,
      base_price: 1499,
      stock_quantity: 25,
      is_customizable: true,
      customization_mode: 'fixed',
      preparation_days: 5,
      customization_schema: {
        is_enabled: true,
        crafting_time: '4-6 days',
        customization_fee: 150,
        fields: [
          {
            id: 'field_text',
            type: 'text',
            label: 'Name or Initials to Emboss',
            max_length: 20,
            is_required: true
          },
          {
            id: 'field_select',
            type: 'select',
            label: 'Cover Finish',
            choices: [
              { name: 'Classic Tan', price_delta: 0 },
              { name: 'Vintage Walnut', price_delta: 100 }
            ],
            is_required: true
          }
        ]
      }
    };

    const res = await request(app)
      .post('/api/seller/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    createdProductId = res.body.data?.product?.id || res.body.data?.id || res.body.id;
    expect(createdProductId).toBeDefined();
    createdProductIds.push(createdProductId);

    // Database check: verify products table
    const { rows: prodRows } = await query('SELECT * FROM products WHERE id = $1', [createdProductId]);
    expect(prodRows.length).toBe(1);
    expect(prodRows[0].is_customizable).toBe(true);
    expect(prodRows[0].customization_mode).toBe('fixed');
    expect(prodRows[0].customization_schema).toBeDefined();
    expect(prodRows[0].customization_schema.is_enabled).toBe(true);

    // Database check: verify fixed_customization_options synced
    const { rows: optRows } = await query(
      'SELECT * FROM fixed_customization_options WHERE product_id = $1 ORDER BY sort_order ASC',
      [createdProductId]
    );
    expect(optRows.length).toBe(2);
    expect(optRows[0].label).toBe('Name or Initials to Emboss');
    expect(optRows[0].option_type).toBe('text');
    expect(optRows[0].max_length).toBe(20);
    expect(optRows[1].label).toBe('Cover Finish');
    expect(optRows[1].option_type).toBe('select');
  });

  // Step 3: Fetching customized listings
  test('3. GET /api/seller/customisations returns the created customizable product with fixed options', async () => {
    const res = await request(app)
      .get('/api/seller/customisations')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const listings = res.body.data?.listings || res.body.listings;
    expect(listings.length).toBe(1);
    const p = listings[0];
    expect(p.id).toBe(createdProductId);
    expect(p.is_customizable).toBe(true);
    expect(p.is_customized).toBe(true);
    expect(Array.isArray(p.fixed_customization_options)).toBe(true);
    expect(p.fixed_customization_options.length).toBe(2);
  });

  // Step 4: GET fixed-options endpoint
  test('4. GET /api/products/:id/fixed-options returns list of configured customization options', async () => {
    const res = await request(app)
      .get(`/api/products/${createdProductId}/fixed-options`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const options = res.body.data?.fixed_customization_options || res.body.data?.options;
    expect(Array.isArray(options)).toBe(true);
    expect(options.length).toBe(2);
  });

  // Step 5: PUT /api/products/:id/fixed-options updates options atomically
  test('5. PUT /api/products/:id/fixed-options replaces options without orphaned records', async () => {
    const newOptions = [
      {
        option_type: 'text',
        label: 'Embossed Monogram',
        is_required: true,
        max_length: 5,
        price_modifier: 50
      },
      {
        option_type: 'select',
        label: 'Thread Stitch Color',
        choices: ['Gold', 'Copper', 'Dark Brown'],
        is_required: false,
        price_modifier: 0
      },
      {
        option_type: 'image',
        label: 'Custom Logo/Sketch',
        is_required: false,
        price_modifier: 200
      }
    ];

    const res = await request(app)
      .put(`/api/products/${createdProductId}/fixed-options`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ options: newOptions });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const saved = res.body.data?.fixed_customization_options;
    expect(saved.length).toBe(3);

    // Verify DB count
    const { rows: optRows } = await query(
      'SELECT id, option_type, label, price_modifier FROM fixed_customization_options WHERE product_id = $1 ORDER BY sort_order ASC',
      [createdProductId]
    );
    expect(optRows.length).toBe(3);
    expect(optRows[0].label).toBe('Embossed Monogram');
    expect(parseFloat(optRows[0].price_modifier)).toBe(50);
    expect(optRows[1].label).toBe('Thread Stitch Color');
    expect(optRows[2].option_type).toBe('image');
  });

  // Step 6: IDOR Protection on fixed options
  test('6. IDOR protection: Another seller cannot update or delete fixed options', async () => {
    const res = await request(app)
      .put(`/api/products/${createdProductId}/fixed-options`)
      .set('Authorization', `Bearer ${otherSellerToken}`)
      .send({ options: [] });

    expect(res.status).toBe(404);
  });

  // Step 7: DELETE single option item
  test('7. DELETE /api/products/:id/fixed-options/:optionId deletes single option and syncs schema', async () => {
    const { rows: currentOpts } = await query(
      'SELECT id FROM fixed_customization_options WHERE product_id = $1 ORDER BY id DESC LIMIT 1',
      [createdProductId]
    );
    const optionToDelete = currentOpts[0].id;

    const res = await request(app)
      .delete(`/api/products/${createdProductId}/fixed-options/${optionToDelete}`)
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fixed_customization_options.length).toBe(2);

    // Verify DB
    const { rows: remaining } = await query(
      'SELECT id FROM fixed_customization_options WHERE product_id = $1',
      [createdProductId]
    );
    expect(remaining.length).toBe(2);
    expect(remaining.some(r => r.id === optionToDelete)).toBe(false);
  });

  // Step 8: PATCH /api/seller/listings/:id updates customization schema and resyncs options
  test('8. PATCH /api/seller/listings/:id modifies schema and syncs fixed options cleanly', async () => {
    const updatedSchema = {
      is_enabled: true,
      crafting_time: '3-4 days',
      customization_fee: 100,
      fields: [
        {
          id: 'field_engrave',
          type: 'text',
          label: 'Laser Inscribed Message',
          max_length: 50,
          is_required: true
        }
      ]
    };

    const res = await request(app)
      .patch(`/api/seller/listings/${createdProductId}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        is_customizable: true,
        customization_mode: 'fixed',
        customization_schema: updatedSchema
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { rows: optRows } = await query(
      'SELECT id, option_type, label, max_length FROM fixed_customization_options WHERE product_id = $1',
      [createdProductId]
    );
    expect(optRows.length).toBe(1);
    expect(optRows[0].label).toBe('Laser Inscribed Message');
    expect(optRows[0].max_length).toBe(50);
  });

  // Step 9: DELETE /api/products/:id/fixed-options clears all options and sets customizable to false
  test('9. DELETE /api/products/:id/fixed-options removes all options cleanly', async () => {
    const res = await request(app)
      .delete(`/api/products/${createdProductId}/fixed-options`)
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { rows: optRows } = await query(
      'SELECT id FROM fixed_customization_options WHERE product_id = $1',
      [createdProductId]
    );
    expect(optRows.length).toBe(0);

    const { rows: prodRows } = await query('SELECT is_customizable, customization_mode FROM products WHERE id = $1', [createdProductId]);
    expect(prodRows[0].is_customizable).toBe(false);
    expect(prodRows[0].customization_mode).toBe('none');
  });
});
