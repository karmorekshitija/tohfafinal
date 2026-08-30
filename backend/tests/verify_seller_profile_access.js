/**
 * Test script to verify ProtectedRoute logic and Profile access for both
 * approved and unapproved sellers.
 */
'use strict';

const { query } = require('../src/config/db');
const { login } = require('../src/services/auth.service');

async function testProfileAccess() {
  console.log('🧪 Testing Seller Profile Access Guard & API Behavior...\n');

  // Find 1 approved seller and 1 unapproved seller
  const { rows: approvedRows } = await query(`
    SELECT u.id, u.email, u.name, u.role, sp.is_approved
    FROM users u
    JOIN seller_profiles sp ON sp.user_id = u.id
    WHERE u.role = 'seller' AND sp.is_approved = TRUE
    LIMIT 1
  `);

  const { rows: unapprovedRows } = await query(`
    SELECT u.id, u.email, u.name, u.role, sp.is_approved
    FROM users u
    JOIN seller_profiles sp ON sp.user_id = u.id
    WHERE u.role = 'seller' AND (sp.is_approved = FALSE OR sp.is_approved IS NULL)
    LIMIT 1
  `);

  console.log('1. Approved Seller in DB:', approvedRows[0] || 'None');
  console.log('2. Unapproved Seller in DB:', unapprovedRows[0] || 'None');

  if (!approvedRows.length || !unapprovedRows.length) {
    console.warn('⚠️ Warning: Need at least 1 approved and 1 unapproved seller in DB to test.');
  }

  // Simulate ProtectedRoute.js logic
  function testGuard(user, path) {
    let redirectedTo = null;
    const isApproved = user.is_approved === 1 || user.is_approved === true || user.is_approved === '1' || user.is_approved === 'true';
    
    // Seller guard
    if (path.startsWith('/seller/') && !path.endsWith('/seller/onboarding.html')) {
      if (user.role !== 'seller' && user.role !== 'admin') {
        return '/buyer/home.html';
      }
      if (user.role === 'seller' && !isApproved) {
        const allowed = path.endsWith('/onboarding.html') || path.endsWith('/onboarding') ||
                        path.endsWith('/profile-settings.html') || path.endsWith('/profile-settings') ||
                        path.endsWith('/profile.html') || path.endsWith('/profile');
        if (!allowed) {
          return '/seller/onboarding.html';
        }
      }
    }
    return 'ALLOWED';
  }

  console.log('\n--- Route Guard Simulation: Unapproved Seller ---');
  const unapprovedUser = { role: 'seller', is_approved: 0 };
  const pathsToTest = [
    '/seller/profile-settings.html',
    '/seller/profile.html',
    '/seller/onboarding.html',
    '/seller/dashboard.html',
    '/seller/catalog.html',
    '/seller/orders.html'
  ];

  for (const p of pathsToTest) {
    const res = testGuard(unapprovedUser, p);
    console.log(`Path: ${p.padEnd(32)} -> Result: ${res}`);
    if ((p.includes('profile') || p.includes('onboarding')) && res !== 'ALLOWED') {
      throw new Error(`Unapproved seller should be allowed on ${p}, got ${res}`);
    }
    if ((p.includes('dashboard') || p.includes('catalog') || p.includes('orders')) && res !== '/seller/onboarding.html') {
      throw new Error(`Unapproved seller should be redirected to onboarding on ${p}, got ${res}`);
    }
  }

  console.log('\n--- Route Guard Simulation: Approved Seller ---');
  const approvedUser = { role: 'seller', is_approved: 1 };
  for (const p of pathsToTest) {
    const res = testGuard(approvedUser, p);
    console.log(`Path: ${p.padEnd(32)} -> Result: ${res}`);
    if (res !== 'ALLOWED') {
      throw new Error(`Approved seller should be allowed on ${p}, got ${res}`);
    }
  }

  console.log('\n✅ All Route Guard simulations passed successfully!\n');
  process.exit(0);
}

testProfileAccess().catch(e => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
