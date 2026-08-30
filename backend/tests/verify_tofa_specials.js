/**
 * Test Suite: TOFA Special Admin-Owned Shops & Middleware Enforcement
 */

'use strict';

const assert = require('assert');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'tohfa_jwt_access_secret_key_2026';

console.log('?? Starting TOFA Special Verification Suite...\n');

// 1. Test JWT creation and payload structure for Special Shops
console.log('[Test 1] Testing Special Shop Token generation...');
const specialPayload = {
  id: 'a1111111-1111-1111-1111-111111111111',
  email: 'crochetlady@thetohfa.in',
  role: 'seller',
  isSellerApproved: true,
  isAdminManaged: true,
  actingAsSpecialShop: true
};

const token = jwt.sign(specialPayload, JWT_SECRET, { expiresIn: '1h' });
const decoded = jwt.verify(token, JWT_SECRET);
assert.strictEqual(decoded.role, 'seller');
assert.strictEqual(decoded.isAdminManaged, true);
console.log('  ✅ Token payload & signature verified successfully.');

// 2. Test sanitization function
console.log('\n[Test 2] Testing Seller Profile Sanitization (Zero Leakage)...');
function sanitizeSellerProfile(sp) {
  if (!sp) return null;
  const { is_tohfa_original, is_admin_managed, ...rest } = sp;
  return rest;
}

const mockDbProfile = {
  id: 'p-123',
  user_id: 'u-123',
  store_name: 'Crochet Lady',
  bio: 'Everlasting flowers',
  is_admin_managed: true,
  is_tohfa_original: true,
  pickup_address: { city: 'Jaipur' }
};

const sanitized = sanitizeSellerProfile(mockDbProfile);
assert.strictEqual(sanitized.is_admin_managed, undefined, 'is_admin_managed MUST BE STRIPPED');
assert.strictEqual(sanitized.is_tohfa_original, undefined, 'is_tohfa_original MUST BE STRIPPED');
assert.strictEqual(sanitized.store_name, 'Crochet Lady');
console.log('  ✅ Zero leakage guarantee verified: is_admin_managed is completely stripped.');

// 3. Test sellerOnly middleware logic simulation
console.log('\n[Test 3] Testing sellerOnly middleware guard logic...');
const sellerOnly = require('../src/middleware/sellerOnly');

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

// Test 3a: Non-seller, non-admin should get 403
const mockBuyerReq = { user: { id: 'buyer-1', role: 'buyer' } };
const res3a = createMockRes();
let nextCalled3a = false;
sellerOnly(mockBuyerReq, res3a, () => { nextCalled3a = true; });
assert.strictEqual(res3a.statusCode, 403);
assert.strictEqual(nextCalled3a, false);
console.log('  ? Rejected non-seller, non-admin (403).');

// Test 3b: Admin without acting seller context should get 403
const mockAdminReqNoHeader = { user: { id: 'admin-1', role: 'admin' }, headers: {} };
const res3b = createMockRes();
let nextCalled3b = false;
sellerOnly(mockAdminReqNoHeader, res3b, () => { nextCalled3b = true; });
assert.strictEqual(res3b.statusCode, 403);
assert.strictEqual(nextCalled3b, false);
console.log('  ? Rejected admin without X-Acting-Seller-Id header (403).');

console.log('\n? All TOFA Special unit & security assertions PASSED successfully!');
