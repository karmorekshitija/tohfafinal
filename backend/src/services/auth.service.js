/**
 * Tohfa v2 — Auth Service
 * File: src/services/auth.service.js
 * Role: Business logic for authentication — hashing, JWT signing/verification,
 *       refresh token management, user creation, seller profile bootstrapping,
 *       and admin login authentication.
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, getClient } = require('../config/db');

const SALT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Sanitization & Normalization Helpers (AUTH-04)
// ---------------------------------------------------------------------------

/**
 * Normalizes email by trimming and converting to lowercase.
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.toLowerCase().trim();
}

/**
 * Validates and sanitizes standard Indian 10-digit mobile numbers (6-9 followed by 9 digits).
 * Handles inputs with +91, 91, 0 prefixes and spaces/hyphens.
 * @param {string} phone
 * @returns {string|null} 10-digit phone string or null if empty
 */
function sanitizeIndianPhone(phone) {
  if (!phone) return null;
  const cleaned = String(phone).replace(/[\s\-\+\(\)\.]/g, '');
  let digits = cleaned;
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  } else if (digits.length === 13 && digits.startsWith('910')) {
    digits = digits.slice(3);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    const err = new Error('Invalid Indian mobile phone number. Must be a valid 10-digit number starting with 6-9.');
    err.status = 400;
    throw err;
  }
  return digits;
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

/**
 * Sign an access token (short-lived).
 * @param {{ id, email, role, isSellerApproved }} payload
 * @returns {string}
 */
function signAccessToken(payload) {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET environment variable is missing.');
  }
  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  });
}

/**
 * Sign a refresh token (long-lived).
 * @param {{ id, email, role, isSellerApproved }} payload
 * @returns {string}
 */
function signRefreshToken(payload) {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is missing.');
  }
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, secret, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
}

/**
 * Verify a refresh token's signature.
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyRefreshToken(token) {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is missing.');
  }
  return jwt.verify(token, secret);
}

/**
 * Hash a refresh token with SHA-256 for safe DB storage.
 * @param {string} token
 * @returns {string}
 */
function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Issue both tokens, store hashed refresh token in DB, return the pair.
 * @param {{ id, email, role, isSellerApproved }} payload
 * @returns {{ accessToken: string, refreshToken: string, token: string }}
 */
async function issueTokenPair(payload) {
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const hashedRT = hashRefreshToken(refreshToken);

  // Store hashed refresh token
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')
     ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [payload.id, hashedRT]
  );

  return { accessToken, refreshToken, token: accessToken };
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

/**
 * Build the JWT payload for a user row, optionally enriched with seller data.
 * @param {object} user - DB user row
 * @returns {{ id, email, role, isSellerApproved }}
 */
async function buildTokenPayload(user) {
  let isSellerApproved = false;
  if (user.role === 'seller') {
    const { rows } = await query(
      'SELECT is_approved, verification_status FROM seller_profiles WHERE user_id = $1',
      [user.id]
    ).catch(async () => {
      return await query(
        'SELECT is_approved, verification_status FROM sellers WHERE user_id = $1',
        [user.id]
      );
    });
    isSellerApproved = rows[0]?.is_approved || rows[0]?.verification_status === 'verified' || false;
  }
  return { id: user.id, email: user.email, role: user.role, isSellerApproved };
}

// ---------------------------------------------------------------------------
// Auth operations
// ---------------------------------------------------------------------------

/**
 * Register a new user (buyer or seller).
 * Creates user row, seller profile if seller, returns token pair.
 * @param {{ name, email, password, phone, role }} data
 * @returns {{ user: object, accessToken: string, refreshToken: string, token: string }}
 */
async function register(data) {
  const role = data.role === 'seller' ? 'seller' : 'buyer';
  if (role === 'seller') {
    return signupSeller(data);
  }

  const name = (data.name || data.full_name || '').trim();
  const rawEmail = data.email || '';
  const email = normalizeEmail(rawEmail);
  const phone = data.phone ? sanitizeIndianPhone(data.phone) : null;
  const password = data.password;

  if (!email || !password || !name) {
    const err = new Error('Name, email, and password are required.');
    err.status = 400;
    throw err;
  }

  // Check duplicate email
  const { rows: existing } = await query(
    'SELECT id FROM users WHERE LOWER(TRIM(email)) = $1',
    [email]
  );
  if (existing.length) {
    const err = new Error('An account with this email already exists.');
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const userName = name || data.full_name || '';
    const { rows: userRows } = await client.query(
      `INSERT INTO users (full_name, name, display_name, email, password_hash, phone, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, 'buyer', TRUE)
       RETURNING id, full_name, name, email, role, phone, created_at`,
      [userName, userName, userName, email, passwordHash, phone]
    );
    const user = userRows[0];

    // Note: cart is created lazily when first item is added (cart_items table)

    await client.query('COMMIT');

    const payload = await buildTokenPayload(user);
    const tokens = await issueTokenPair(payload);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
      ...tokens,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * AUTH-03: Atomic Seller Registration & Profile Initialization
 * Uses a single DB transaction to create user row with role='seller' and initialize seller profile.
 * Bank details are no longer collected at signup — collected post-approval in Seller Studio.
 * @param {{ name, email, phone, password, storeName, craftSpecialty, bio, daily_capacity_min, daily_capacity_max, instagram_handle, instagram_followers }} data
 * @returns {{ user: object, accessToken: string, refreshToken: string, token: string }}
 */
async function signupSeller(data) {
  const name = (data.name || data.full_name || '').trim();
  const rawEmail = data.email || '';
  const email = normalizeEmail(rawEmail);
  const phone = data.phone ? sanitizeIndianPhone(data.phone) : null;
  const password = data.password;
  const storeName = (data.storeName || data.store_name || data.shop_name || name || 'Artisan Studio').trim();
  const craftSpecialty = data.craftSpecialty || data.craft_specialty || data.specialty || '';
  const bio = data.bio || (craftSpecialty ? `Artisan specializing in ${craftSpecialty}` : 'Artisan specializing in handcrafted gifts');

  // New fields: capacity & social (no bank details at signup)
  const dailyCapacityMin = parseInt(data.daily_capacity_min || data.capacity_min || 0, 10) || null;
  const dailyCapacityMax = parseInt(data.daily_capacity_max || data.capacity_max || 0, 10) || null;
  const instagramHandle = (data.instagram_handle || data.instagram || '').trim().replace(/^@/, '') || null;
  const instagramFollowers = data.instagram_followers || null;

  if (!email || !password || !name) {
    const err = new Error('Name, email, and password are required.');
    err.status = 400;
    throw err;
  }

  // Check duplicate email
  const { rows: existing } = await query(
    'SELECT id FROM users WHERE LOWER(TRIM(email)) = $1',
    [email]
  );
  if (existing.length) {
    const err = new Error('An account with this email already exists.');
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const baseSlug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'artisan';
  const storeSlug = `${baseSlug}-${Date.now()}`;

  const pickupAddress = (typeof data.pickup_address === 'object' && data.pickup_address !== null && Object.keys(data.pickup_address).length > 0)
    ? data.pickup_address
    : (data.address_line1 || data.city ? {
        address_line1: data.address_line1 || data.street || '',
        address_line2: data.address_line2 || '',
        city: data.city || '',
        state: data.state || '',
        pincode: data.pincode || data.postal_code || ''
      } : {});

  const panNumber = data.pan_number || data.pan || null;
  const gstNumber = data.gst_number || data.gst || null;
  const portfolioImages = Array.isArray(data.portfolio_images)
    ? data.portfolio_images
    : (data.portfolio_url ? [data.portfolio_url] : []);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Create User Row (role = 'seller')
    const sellerUserName = name || data.full_name || '';
    const userRes = await client.query(
      `INSERT INTO users (full_name, name, display_name, email, phone, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, 'seller', TRUE)
       RETURNING id, full_name, name, email, role, phone, created_at`,
      [sellerUserName, sellerUserName, sellerUserName, email, phone, passwordHash]
    );
    const user = userRes.rows[0];

    // 2. Initialize Master sellers row
    await client.query(
      `INSERT INTO sellers (user_id, store_name, slug, bio, verification_status, is_active, is_approved, pickup_address, bank_details, onboarding_completed)
       VALUES ($1, $2, $3, $4, 'pending_verification', TRUE, FALSE, $5, '{}', FALSE)
       ON CONFLICT (user_id) DO UPDATE SET
         store_name = EXCLUDED.store_name,
         slug = EXCLUDED.slug,
         bio = EXCLUDED.bio,
         pickup_address = EXCLUDED.pickup_address,
         verification_status = 'pending_verification'`,
      [user.id, storeName, storeSlug, bio, JSON.stringify(pickupAddress)]
    );

    // Apply optional migration-added columns separately
    await client.query(
      `UPDATE sellers SET
         pan_number = $2,
         gst_number = $3,
         portfolio_images = $4::text[],
         applied_at = NOW(),
         onboarding_completed = FALSE
       WHERE user_id = $1`,
      [user.id, panNumber, gstNumber, portfolioImages]
    ).catch(() => {});

    // 3. Initialize seller_profiles row
    try {
      await client.query(
        `INSERT INTO seller_profiles (user_id, store_name, slug, bio, seller_type, verification_status, is_approved, is_active, pickup_address, bank_details, pan_number, gst_number, portfolio_images, applied_at, onboarding_completed)
         VALUES ($1, $2, $3, $4, 'regular', 'pending_verification', FALSE, TRUE, $5, '{}', $6, $7, $8::text[], NOW(), FALSE)
         ON CONFLICT (user_id) DO UPDATE SET
           store_name = EXCLUDED.store_name,
           slug = EXCLUDED.slug,
           bio = EXCLUDED.bio,
           pickup_address = EXCLUDED.pickup_address,
           pan_number = EXCLUDED.pan_number,
           gst_number = EXCLUDED.gst_number,
           portfolio_images = EXCLUDED.portfolio_images,
           verification_status = 'pending_verification'`,
        [user.id, storeName, storeSlug, bio, JSON.stringify(pickupAddress), panNumber, gstNumber, portfolioImages]
      );
    } catch (insertErr) {
      if (insertErr.code === '42703') { // undefined_column — schema hasn't been migrated yet
        console.error('[signupSeller] seller_profiles missing expected columns — falling back to minimal insert. Run db:migrate against production.', insertErr.message);
        await client.query(
          `INSERT INTO seller_profiles (user_id, store_name, slug, bio, seller_type, verification_status, is_approved, is_active, pickup_address, bank_details)
           VALUES ($1, $2, $3, $4, 'regular', 'pending_verification', FALSE, TRUE, $5, '{}')
           ON CONFLICT (user_id) DO UPDATE SET
             store_name = EXCLUDED.store_name,
             slug = EXCLUDED.slug,
             bio = EXCLUDED.bio,
             pickup_address = EXCLUDED.pickup_address,
             verification_status = 'pending_verification'`,
          [user.id, storeName, storeSlug, bio, JSON.stringify(pickupAddress)]
        );
      } else {
        throw insertErr;
      }
    }

    // 4. Apply new capacity & social fields to seller_profiles
    await client.query(
      `UPDATE seller_profiles SET
         daily_capacity_min = $2,
         daily_capacity_max = $3,
         instagram_handle = $4,
         instagram_followers = $5,
         onboarding_completed = FALSE
       WHERE user_id = $1`,
      [user.id, dailyCapacityMin, dailyCapacityMax, instagramHandle, instagramFollowers]
    ).catch(() => {});

    await client.query('COMMIT');

    const payload = await buildTokenPayload(user);
    const tokens = await issueTokenPair(payload);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        is_approved: 0,
        verification_status: 'pending_verification',
        store_name: storeName,
        store_slug: storeSlug,
        seller_type: 'Artisan',
      },
      ...tokens,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


/**
 * Login with email/phone + password.
 * Enforces email normalization and phone matching (AUTH-04).
 * @param {{ email, password }} data
 * @returns {{ user: object, accessToken: string, refreshToken: string, token: string }}
 */
async function login(data) {
  const { email, username, identifier, password, phone } = data;
  const rawIdentifier = (email || identifier || username || phone || '').toString().trim();

  // Detect if rawIdentifier or phone looks like a phone number
  let detectedPhone = null;
  if (phone) {
    detectedPhone = String(phone).replace(/[\s\-\+\(\)]/g, '').slice(-10);
  } else if (rawIdentifier) {
    const cleaned = rawIdentifier.replace(/[\s\-\+\(\)]/g, '');
    if (/^\d{10,13}$/.test(cleaned) && !rawIdentifier.includes('@')) {
      detectedPhone = cleaned.slice(-10);
    }
  }

  const loginEmail = normalizeEmail(email || identifier || (username && username.includes('@') ? username : (username ? `${username}@thetohfa.in` : '')));
  const loginPhone = detectedPhone;

  // ---------------------------------------------------------------------------
  // Demo-login backdoor — STRICTLY gated.
  // Requires BOTH: NODE_ENV=development AND ALLOW_DEMO_LOGIN=true
  // This block is NEVER reachable in production regardless of credentials.
  // ---------------------------------------------------------------------------
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.ALLOW_DEMO_LOGIN === 'true'
  ) {
    const DEMO_USERS = {
      'buyer@thetohfa.in': {
        id: 'd0000000-0000-0000-0000-000000000001',
        name: 'Aarav Sharma',
        email: 'buyer@thetohfa.in',
        role: 'buyer',
        phone: '9876543210',
        is_active: true,
      },
      'seller@thetohfa.in': {
        id: 'd0000000-0000-0000-0000-000000000002',
        name: 'Priya Studio',
        email: 'seller@thetohfa.in',
        role: 'seller',
        phone: '9876543211',
        is_active: true,
        store_name: 'Mitti Clay Studio',
      },
      'admin@thetohfa.in': {
        id: 'd0000000-0000-0000-0000-000000000003',
        name: 'Platform Founder',
        email: 'admin@thetohfa.in',
        role: 'admin',
        phone: '9876543212',
        is_active: true,
      },
    };
    const DEMO_PASSWORDS = ['Password@123', 'admin123', 'demo123', 'admin', 'password'];
    const demoUser = DEMO_USERS[loginEmail] ||
                     (loginPhone ? Object.values(DEMO_USERS).find(u => u.phone === loginPhone) : null) ||
                     (username === 'admin' ? DEMO_USERS['admin@thetohfa.in'] : null);
    if (demoUser && DEMO_PASSWORDS.includes(password)) {
      const accessToken = signAccessToken({ id: demoUser.id, email: demoUser.email, role: demoUser.role, isSellerApproved: true });
      const refreshToken = signRefreshToken({ id: demoUser.id, email: demoUser.email, role: demoUser.role, isSellerApproved: true });
      
      // FIX BUG-07: Persist refresh tokens for demo users so they can be refreshed.
      // Silently catch errors if demo user doesn't exist in DB to prevent FK violation.
      const hashedRT = hashRefreshToken(refreshToken);
      await query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '7 days')
         ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
        [demoUser.id, hashedRT]
      ).catch(() => {});

      return {
        user: { id: demoUser.id, name: demoUser.name, email: demoUser.email, role: demoUser.role, phone: demoUser.phone, store_name: demoUser.store_name },
        admin: demoUser.role === 'admin' ? demoUser : undefined,
        accessToken,
        refreshToken,
        token: accessToken,
      };
    }
  }

  let rows = [];
  try {
    const res = await query(
      `SELECT id, name, email, password_hash, role, is_active, phone
       FROM users WHERE LOWER(TRIM(email)) = $1 OR phone = $1 OR ($2::text IS NOT NULL AND phone = $2)`,
      [loginEmail, loginPhone]
    );
    rows = res.rows;
  } catch (dbErr) {
    console.warn('[Auth] Database lookup error:', dbErr.message);
  }

  if (!rows.length) {
    const err = new Error('Invalid email or password.');
    err.status = 401;
    throw err;
  }

  const user = rows[0];

  if (user.is_active === 0 || user.is_active === false) {
    const err = new Error('Your account has been deactivated. Please contact support.');
    err.status = 403;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid email or password.');
    err.status = 401;
    throw err;
  }

  const payload = await buildTokenPayload(user);
  const tokens = await issueTokenPair(payload);

  let sellerProfile = null;
  if (user.role === 'seller') {
    const { rows: spRows } = await query(
      'SELECT store_name, seller_type, is_approved, verification_status FROM seller_profiles WHERE user_id = $1',
      [user.id]
    ).catch(async () => {
      return await query(
        'SELECT store_name, verification_status, is_approved FROM sellers WHERE user_id = $1',
        [user.id]
      );
    });
    if (spRows.length) sellerProfile = spRows[0];
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      is_approved: sellerProfile ? (sellerProfile.is_approved || sellerProfile.verification_status === 'verified' ? 1 : 0) : 0,
      verification_status: sellerProfile?.verification_status || 'pending_verification',
      store_name: sellerProfile?.store_name || user.name,
      seller_type: sellerProfile?.seller_type || 'Artisan',
    },
    ...tokens,
  };
}

/**
 * AUTH-06: Dedicated Admin Login Endpoint
 * Verifies that the authenticated user possesses admin or master_admin role.
 * Returns 403 Forbidden for non-admin accounts.
 * @param {{ email, password }} data
 * @returns {{ user: object, admin: object, accessToken: string, refreshToken: string, token: string }}
 */
async function adminLogin(data) {
  const { email, username, identifier, password, phone } = data;
  const rawIdentifier = (email || identifier || username || phone || '').toString().trim();

  let detectedPhone = null;
  if (phone) {
    detectedPhone = String(phone).replace(/[\s\-\+\(\)]/g, '').slice(-10);
  } else if (rawIdentifier) {
    const cleaned = rawIdentifier.replace(/[\s\-\+\(\)]/g, '');
    if (/^\d{10,13}$/.test(cleaned) && !rawIdentifier.includes('@')) {
      detectedPhone = cleaned.slice(-10);
    }
  }

  const rawInput = (email || identifier || username || '').toString().trim();
  const loginEmail = normalizeEmail(
    rawInput.includes('@') ? rawInput : (rawInput ? `${rawInput}@thetohfa.in` : '')
  );
  const loginPhone = detectedPhone;

  if ((!loginEmail && !loginPhone) || !password) {
    const err = new Error('Email/username and password are required.');
    err.status = 400;
    throw err;
  }

  // Development demo admin login support
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.ALLOW_DEMO_LOGIN === 'true'
  ) {
    if (loginEmail === 'admin@thetohfa.in' || loginEmail === 'admin@tohfa.in' || username === 'admin' || loginPhone === '9876543212') {
      const DEMO_PASSWORDS = ['AdminPassword123!', 'Password@123', 'admin123', 'demo123', 'admin', 'password'];
      if (DEMO_PASSWORDS.includes(password)) {
        const demoUser = {
          id: 'd0000000-0000-0000-0000-000000000003',
          name: 'Platform Founder',
          email: 'admin@thetohfa.in',
          role: 'admin',
          phone: '9876543212',
          is_active: true,
        };
        const accessToken = signAccessToken({ id: demoUser.id, email: demoUser.email, role: demoUser.role, isSellerApproved: true });
        const refreshToken = signRefreshToken({ id: demoUser.id, email: demoUser.email, role: demoUser.role, isSellerApproved: true });
        
        // FIX BUG-07: Persist refresh tokens for demo users so they can be refreshed.
        // Silently catch errors if demo user doesn't exist in DB to prevent FK violation.
        const hashedRT = hashRefreshToken(refreshToken);
        await query(
          `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '7 days')
           ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
          [demoUser.id, hashedRT]
        ).catch(() => {});

        return {
          user: { id: demoUser.id, name: demoUser.name, email: demoUser.email, role: demoUser.role, phone: demoUser.phone },
          admin: demoUser,
          accessToken,
          refreshToken,
          token: accessToken,
        };
      }
    }
  }

  let rows = [];
  try {
    const res = await query(
      `SELECT id, name, email, password_hash, role, is_active, phone
       FROM users WHERE LOWER(TRIM(email)) = $1 OR phone = $1 OR ($2::text IS NOT NULL AND phone = $2)`,
      [loginEmail, loginPhone]
    );
    rows = res.rows;
  } catch (dbErr) {
    console.warn('[AdminAuth] Database lookup error:', dbErr.message);
  }

  if (!rows.length) {
    const err = new Error('Invalid email or password.');
    err.status = 401;
    throw err;
  }

  const user = rows[0];

  // AUTH-06: Strict Role Verification for Admin Access
  if (user.role !== 'admin' && user.role !== 'master_admin') {
    const err = new Error('Access denied. Administrator privileges required.');
    err.status = 403;
    throw err;
  }

  if (user.is_active === 0 || user.is_active === false) {
    const err = new Error('Your admin account has been deactivated. Please contact support.');
    err.status = 403;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid email or password.');
    err.status = 401;
    throw err;
  }

  const payload = await buildTokenPayload(user);
  const tokens = await issueTokenPair(payload);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
    },
    admin: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    ...tokens,
  };
}

/**
 * Rotate refresh token — revoke old, issue new pair.
 * @param {string} rawRefreshToken
 * @returns {{ accessToken: string, refreshToken: string, token: string }}
 */
async function refreshTokens(rawRefreshToken) {
  let decoded;
  try {
    decoded = verifyRefreshToken(rawRefreshToken);
  } catch {
    const err = new Error('Invalid or expired refresh token.');
    err.status = 401;
    throw err;
  }

  const hashedRT = hashRefreshToken(rawRefreshToken);

  const { rows } = await query(
    `SELECT id FROM refresh_tokens
     WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
    [decoded.id, hashedRT]
  );

  if (!rows.length) {
    const err = new Error('Refresh token has been revoked or expired.');
    err.status = 401;
    throw err;
  }

  // Revoke old token
  await query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
    [hashedRT]
  );

  const { rows: userRows } = await query(
    `SELECT id, email, role FROM users WHERE id = $1 AND (is_active = TRUE OR is_active IS NULL)`,
    [decoded.id]
  );
  if (!userRows.length) {
    const err = new Error('User not found or deactivated.');
    err.status = 401;
    throw err;
  }

  const payload = await buildTokenPayload(userRows[0]);
  return issueTokenPair(payload);
}

/**
 * Revoke a refresh token (logout).
 * @param {string} rawRefreshToken
 */
async function revokeRefreshToken(rawRefreshToken) {
  const hashedRT = hashRefreshToken(rawRefreshToken);
  await query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashedRT]
  );
}

/**
 * Revoke all refresh tokens for a user (e.g., after password reset).
 * @param {string} userId
 */
async function revokeAllUserTokens(userId) {
  await query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

/**
 * Store a hashed password reset token and expiry in users table.
 * @param {string} userId
 * @param {string} rawToken
 * @returns {Promise<{ expiresAt: Date }>}
 */
async function setPasswordResetToken(userId, rawToken) {
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour TTL
  await query(
    'UPDATE users SET reset_password_token = $1, reset_password_expires = $2, updated_at = NOW() WHERE id = $3',
    [hashedToken, expiresAt, userId]
  );
  return { expiresAt };
}

/**
 * Verify a reset token against the database and return user if valid and unexpired.
 * @param {string} rawToken
 * @returns {Promise<object|null>}
 */
async function verifyAndConsumeResetToken(rawToken) {
  if (!rawToken) return null;
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const { rows } = await query(
    `SELECT id, email FROM users 
     WHERE reset_password_token = $1 
       AND reset_password_expires > NOW() 
       AND (is_active = TRUE OR is_active IS NULL)`,
    [hashedToken]
  );
  if (!rows.length) return null;
  return rows[0];
}

/**
 * Update a user's password hash and clear any reset tokens.
 * @param {string} userId
 * @param {string} newPassword
 */
async function updatePassword(userId, newPassword) {
  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query(
    'UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL, updated_at = NOW() WHERE id = $2',
    [hash, userId]
  );
}

module.exports = {
  register,
  signupBuyer: register,
  signupSeller,
  registerSeller: signupSeller,
  login,
  adminLogin,
  refreshTokens,
  revokeRefreshToken,
  revokeAllUserTokens,
  setPasswordResetToken,
  verifyAndConsumeResetToken,
  updatePassword,
  buildTokenPayload,
  normalizeEmail,
  sanitizeIndianPhone,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  issueTokenPair,
};
