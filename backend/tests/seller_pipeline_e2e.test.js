'use strict';

const request = require('supertest');
const express = require('express');
const adminRoutes = require('../src/routes/admin.routes');
const sellerRoutes = require('../src/routes/seller.routes');
const authRoutes = require('../src/routes/auth.routes');
const { query } = require('../src/config/db');
const { signAccessToken } = require('../src/services/auth.service');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/auth', authRoutes);

describe('Seller Pipeline End-to-End Test Suite (Tohfa Special & Normal Sellers)', () => {
  let adminToken;
  let adminUserId;
  const createdUserIds = [];
  const createdSellerIds = [];

  const timestamp = Date.now();
  const specialShopEmail = `e2e_special_${timestamp}@test.dev`;
  const normalSellerEmail = `e2e_normal_${timestamp}@test.dev`;
  const publicSellerEmail = `e2e_public_${timestamp}@test.dev`;

  beforeAll(async () => {
    // Find or create admin user for testing
    let { rows: admins } = await query(
      "SELECT id, email, role FROM users WHERE role IN ('admin', 'master_admin') LIMIT 1"
    );
    if (!admins.length) {
      const { rows: newAdmin } = await query(
        `INSERT INTO users (name, email, password_hash, role, is_active)
         VALUES ('E2E Test Admin', 'e2e_admin_${timestamp}@test.dev', '$2b$10$abcdefghijklmnopqrstuu', 'admin', TRUE)
         RETURNING id, email, role`
      );
      admins = newAdmin;
      createdUserIds.push(newAdmin[0].id);
    }
    adminUserId = admins[0].id;
    adminToken = signAccessToken({ id: adminUserId, email: admins[0].email, role: 'admin' });
  });

  afterAll(async () => {
    // Cleanup any created entities
    try {
      const userStrList = createdUserIds.map(String);
      const sellerStrList = createdSellerIds.map(String);
      if (userStrList.length > 0) {
        await query('DELETE FROM seller_profiles WHERE user_id::text = ANY($1::text[])', [userStrList]).catch(() => {});
        await query('DELETE FROM wallets WHERE user_id::text = ANY($1::text[])', [userStrList]).catch(() => {});
        await query('DELETE FROM sellers WHERE user_id::text = ANY($1::text[])', [userStrList]).catch(() => {});
        await query('DELETE FROM audit_logs WHERE target_id::text = ANY($1::text[])', [userStrList]).catch(() => {});
        await query('DELETE FROM users WHERE id::text = ANY($1::text[])', [userStrList]).catch(() => {});
      }
      if (sellerStrList.length > 0) {
        await query('DELETE FROM wallets WHERE seller_id::text = ANY($1::text[])', [sellerStrList]).catch(() => {});
        await query('DELETE FROM sellers WHERE id::text = ANY($1::text[])', [sellerStrList]).catch(() => {});
      }
    } catch (e) {
      console.warn('Cleanup notice:', e.message);
    }
  });

  describe('1. Tohfa Special Shop Pipeline', () => {
    let specialShopProfileId;
    let specialShopUserId;
    let specialShopSellerId;

    it('should successfully create a new Tohfa Special Shop without type mismatch errors', async () => {
      const res = await request(app)
        .post('/api/admin/special-shops')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          store_name: `Tohfa Special Pottery ${timestamp}`,
          email: specialShopEmail,
          phone: `9198${String(timestamp).slice(-6)}`,
          password: 'Password123!',
          bio: 'Handcrafted premium studio pottery',
          pickup_address: {
            address_line1: 'Studio 101, Art District',
            city: 'Jaipur',
            state: 'Rajasthan',
            pincode: '302001'
          },
          curator_note: 'Curated artisanal brand'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      specialShopProfileId = res.body.data.id;
      specialShopUserId = res.body.data.user_id;

      if (specialShopUserId) createdUserIds.push(specialShopUserId);

      // Verify directly in PostgreSQL database that boolean columns are TRUE
      const { rows: sellerRows } = await query(
        'SELECT id, is_active, is_approved, is_admin_managed FROM sellers WHERE user_id::text = $1',
        [String(specialShopUserId)]
      );
      expect(sellerRows.length).toBe(1);
      expect(sellerRows[0].is_active).toBe(true);
      expect(sellerRows[0].is_approved).toBe(true);
      expect(sellerRows[0].is_admin_managed).toBe(true);

      specialShopSellerId = sellerRows[0].id;
      createdSellerIds.push(specialShopSellerId);

      const { rows: profileRows } = await query(
        'SELECT is_active, is_approved, is_admin_managed, seller_type FROM seller_profiles WHERE user_id::text = $1',
        [String(specialShopUserId)]
      );
      expect(profileRows.length).toBe(1);
      expect(profileRows[0].is_active).toBe(true);
      expect(profileRows[0].is_approved).toBe(true);
      expect(profileRows[0].is_admin_managed).toBe(true);
      expect(profileRows[0].seller_type).toBe('special');
    });

    it('should successfully update a Tohfa Special Shop', async () => {
      const res = await request(app)
        .put(`/api/admin/special-shops/${specialShopSellerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          store_name: `Tohfa Special Pottery Renamed ${timestamp}`,
          bio: 'Updated bio for pottery shop',
          is_active: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('2. Normal Seller Pipeline (Admin Created)', () => {
    let normalSellerId;
    let normalUserId;

    it('should successfully create a new Normal Seller without type mismatch errors', async () => {
      const res = await request(app)
        .post('/api/admin/sellers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Priya Sharma Artisan',
          email: normalSellerEmail,
          phone: `9197${String(timestamp).slice(-6)}`,
          password: 'Password123!',
          store_name: `Priya Crafts ${timestamp}`,
          bio: 'Handmade textile crafts and embroidery',
          commission_rate: 12.5,
          pickup_address: {
            address_line1: 'Plot 45, Crafts Enclave',
            city: 'Varanasi',
            state: 'Uttar Pradesh',
            pincode: '221001'
          },
          bank_details: {
            account_number: '123456789012',
            ifsc_code: 'HDFC0001234',
            account_holder_name: 'Priya Sharma'
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      normalSellerId = res.body.data.seller_id;
      normalUserId = res.body.data.user_id;

      if (normalSellerId) createdSellerIds.push(normalSellerId);
      if (normalUserId) createdUserIds.push(normalUserId);

      // Verify directly in PostgreSQL database that boolean columns are TRUE
      const { rows: sellerRows } = await query(
        'SELECT is_active, is_approved, is_admin_managed FROM sellers WHERE user_id::text = $1',
        [String(normalUserId)]
      );
      expect(sellerRows.length).toBe(1);
      expect(sellerRows[0].is_active).toBe(true);
      expect(sellerRows[0].is_approved).toBe(true);
      expect(sellerRows[0].is_admin_managed).toBe(false);

      const { rows: profileRows } = await query(
        'SELECT is_active, is_approved, is_admin_managed, seller_type FROM seller_profiles WHERE user_id::text = $1',
        [String(normalUserId)]
      );
      expect(profileRows.length).toBe(1);
      expect(profileRows[0].is_active).toBe(true);
      expect(profileRows[0].is_approved).toBe(true);
      expect(profileRows[0].is_admin_managed).toBe(false);
      expect(profileRows[0].seller_type).toBe('regular');
    });

    it('should successfully verify KYC status of seller', async () => {
      const res = await request(app)
        .post(`/api/admin/sellers/${normalSellerId}/verify-kyc`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'verified',
          remarks: 'All documents verified'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { rows } = await query('SELECT verification_status, is_approved FROM sellers WHERE id::text = $1', [String(normalSellerId)]);
      expect(rows[0].verification_status).toBe('verified');
      expect(rows[0].is_approved).toBe(true);
    });

    it('should successfully suspend and reactivate seller', async () => {
      // Suspend
      const suspendRes = await request(app)
        .post(`/api/admin/sellers/${normalSellerId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Policy audit' });

      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.success).toBe(true);

      const { rows: suspendedRows } = await query(
        'SELECT is_active, is_approved, verification_status FROM sellers WHERE id::text = $1',
        [String(normalSellerId)]
      );
      expect(suspendedRows[0].is_active).toBe(false);
      expect(suspendedRows[0].is_approved).toBe(false);
      expect(suspendedRows[0].verification_status).toBe('suspended');

      // Re-verify KYC
      const reactivateRes = await request(app)
        .post(`/api/admin/sellers/${normalSellerId}/verify-kyc`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'verified',
          remarks: 'Reinstated after review'
        });

      expect(reactivateRes.status).toBe(200);
      const { rows: activeRows } = await query(
        'SELECT is_active, is_approved FROM sellers WHERE id::text = $1',
        [String(normalSellerId)]
      );
      expect(activeRows[0].is_active).toBe(true);
      expect(activeRows[0].is_approved).toBe(true);
    });

    it('should toggle user status using boolean values', async () => {
      const toggleRes = await request(app)
        .patch(`/api/admin/users/${normalUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_active: false });

      expect(toggleRes.status).toBe(200);
      expect(toggleRes.body.success).toBe(true);

      const { rows } = await query('SELECT is_active FROM users WHERE id::text = $1', [String(normalUserId)]);
      expect(rows[0].is_active).toBe(false);

      // Restore
      await request(app)
        .patch(`/api/admin/users/${normalUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_active: true });
    });
  });

  describe('3. Public Seller Registration (Self-onboarding)', () => {
    let publicUserId;
    let publicSellerId;

    it('should successfully register a seller publicly via auth service', async () => {
      const res = await request(app)
        .post('/api/auth/register/seller')
        .send({
          name: 'Aarav Woodworks',
          email: publicSellerEmail,
          phone: `9196${String(timestamp).slice(-6)}`,
          password: 'Password123!',
          store_name: `Aarav Woodworks ${timestamp}`,
          bio: 'Handcarved wooden decor'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const user = res.body.data.user;
      publicUserId = user.id;
      createdUserIds.push(publicUserId);

      const { rows: sellerRows } = await query('SELECT id, is_active, is_approved FROM sellers WHERE user_id::text = $1', [String(publicUserId)]);
      expect(sellerRows.length).toBe(1);
      expect(sellerRows[0].is_active).toBe(true);
      expect(sellerRows[0].is_approved).toBe(false);

      publicSellerId = sellerRows[0].id;
      createdSellerIds.push(publicSellerId);
    });
  });
});
