/**
 * Test: Seller Account Creation Email Notifications (Regular & Special)
 */
'use strict';

const assert = require('assert');
const emailService = require('../src/services/email.service');
const ownerNotifyService = require('../src/services/ownerNotify.service');

async function runTests() {
  console.log('🧪 Starting Seller Creation Email Verification Tests...\n');

  let sentEmails = [];
  // Mock sendMail in emailService
  emailService.sendMail = async (to, subject, html, text) => {
    sentEmails.push({ to, subject, html, text });
    return { messageId: 'mock-msg-' + Date.now() };
  };

  // 1. Test Regular Seller Account Created Email
  console.log('[Test 1] Testing Normal Seller Account Created Email...');
  await emailService.sendSellerAccountCreatedEmail('artisan@example.com', {
    sellerName: 'Ramesh Sharma',
    storeName: 'Sharma Pottery Works',
    identifier: 'sharma_pottery',
    password: 'TempPassword123!',
    plan: 'pro',
    sellerType: 'regular',
    loginUrl: 'https://thetohfa.in/auth/login.html'
  });

  assert.strictEqual(sentEmails.length, 1);
  const regularEmail = sentEmails[0];
  assert.strictEqual(regularEmail.to, 'artisan@example.com');
  assert.ok(regularEmail.subject.includes('Artisan Seller Account is Active'));
  assert.ok(regularEmail.html.includes('Sharma Pottery Works'));
  assert.ok(regularEmail.html.includes('PRO'));
  assert.ok(regularEmail.html.includes('sharma_pottery'));
  assert.ok(regularEmail.html.includes('TempPassword123!'));
  assert.ok(regularEmail.html.includes('https://thetohfa.in/auth/login.html'));
  assert.ok(regularEmail.text.includes('Sharma Pottery Works'));
  console.log('  ✅ Regular seller creation email content verified.');

  // 2. Test Special Seller Account Created Email
  console.log('\n[Test 2] Testing Special Seller Account Created Email...');
  await emailService.sendSellerAccountCreatedEmail('crochet@thetohfa.in', {
    sellerName: 'Crochet Couture Studio',
    storeName: 'Crochet Couture Studio',
    identifier: 'crochet@thetohfa.in',
    password: 'TofaSpecialAdmin@2026!',
    plan: 'Special Studio',
    sellerType: 'special',
    slug: 'crochet-couture',
    loginUrl: 'https://thetohfa.in/auth/login.html'
  });

  assert.strictEqual(sentEmails.length, 2);
  const specialEmail = sentEmails[1];
  assert.strictEqual(specialEmail.to, 'crochet@thetohfa.in');
  assert.ok(specialEmail.subject.includes('Welcome to Tohfa Special'));
  assert.ok(specialEmail.subject.includes('Crochet Couture Studio'));
  assert.ok(specialEmail.html.includes('TOHFA Special shop'));
  assert.ok(specialEmail.html.includes('crochet@thetohfa.in'));
  assert.ok(specialEmail.html.includes('TofaSpecialAdmin@2026!'));
  console.log('  ✅ Special seller creation email content verified.');

  // 3. Test Backward-compatible sendSellerApprovalEmail
  console.log('\n[Test 3] Testing sendSellerApprovalEmail backwards compatibility...');
  await emailService.sendSellerApprovalEmail('seller1@example.com', 'Woodcraft Wonders');
  assert.strictEqual(sentEmails.length, 3);
  assert.ok(sentEmails[2].html.includes('Woodcraft Wonders'));
  assert.ok(!sentEmails[2].html.includes('undefined'));

  await emailService.sendSellerApprovalEmail('seller2@example.com', { sellerName: 'Anita', storeName: 'Anita Designs' });
  assert.strictEqual(sentEmails.length, 4);
  assert.ok(sentEmails[3].html.includes('Anita'));
  assert.ok(sentEmails[3].html.includes('Anita Designs'));
  assert.ok(!sentEmails[3].html.includes('undefined'));
  console.log('  ✅ sendSellerApprovalEmail works with both strings and objects with zero undefined leaks.');

  // 4. Test Owner Alert Email for seller_created
  console.log('\n[Test 4] Testing Owner Alert Email for seller_created...');
  let ownerSentEmails = [];
  ownerNotifyService.sendMail = async (to, subject, html, text) => {
    ownerSentEmails.push({ to, subject, html, text });
    return { messageId: 'owner-mock-' + Date.now() };
  };
  process.env.OWNER_NOTIFY_EMAIL = 'admin@thetohfa.in';
  process.env.EMAIL_HOST = 'smtp.test.com';
  process.env.EMAIL_PASS = 'secret';

  await ownerNotifyService.sendAdminAlertEmail('seller_created', {
    storeName: 'Jaipur Block Prints',
    artisanName: 'Vikram Singh',
    email: 'vikram@example.com',
    phone: '9876543210',
    plan: 'pro',
    sellerType: 'regular',
    city: 'Jaipur',
    state: 'Rajasthan',
    link: 'https://thetohfa.in/admin/sellers.html'
  });

  assert.strictEqual(ownerSentEmails.length, 1);
  const ownerAlert = ownerSentEmails[0];
  assert.strictEqual(ownerAlert.to, 'admin@thetohfa.in');
  assert.ok(ownerAlert.subject.includes('New Seller Created: Jaipur Block Prints (Normal Artisan Seller)'));
  assert.ok(ownerAlert.html.includes('Jaipur Block Prints'));
  assert.ok(ownerAlert.html.includes('Vikram Singh'));
  assert.ok(ownerAlert.html.includes('vikram@example.com'));
  assert.ok(ownerAlert.html.includes('PRO'));
  assert.ok(ownerAlert.html.includes('Jaipur, Rajasthan'));
  console.log('  ✅ Owner alert email verified for regular seller creation.');

  await ownerNotifyService.sendAdminAlertEmail('seller_created', {
    storeName: 'Royal Candles Studio',
    artisanName: 'Royal Candles Studio',
    email: 'candles@thetohfa.in',
    sellerType: 'special',
    link: 'https://thetohfa.in/admin/sellers.html?tab=special'
  });

  assert.strictEqual(ownerSentEmails.length, 2);
  const ownerSpecialAlert = ownerSentEmails[1];
  assert.ok(ownerSpecialAlert.subject.includes('New Seller Created: Royal Candles Studio (TOHFA Special Shop)'));
  console.log('  ✅ Owner alert email verified for special seller creation.');

  console.log('\n🎉 ALL SELLER EMAIL NOTIFICATION TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
