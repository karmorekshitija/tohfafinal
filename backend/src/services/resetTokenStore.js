/**
 * Tohfa v2 — In-Memory Password Reset Token Store
 * File: src/services/resetTokenStore.js
 * Role: Dev-safe Map-based TTL store for password reset tokens.
 *       Each entry maps hashed_token -> { userId, expiresAt }.
 *       A background sweep runs every 5 minutes to evict expired entries.
 *       In production this should be replaced with a Redis-backed store.
 */
'use strict';

const crypto = require('crypto');

// Map<hashedToken, { userId: string, expiresAt: number }>
const store = new Map();

const TTL_MS = 60 * 60 * 1000; // 1 hour

// Background sweep — evict expired tokens every 5 minutes
const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (val.expiresAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);
sweepInterval.unref(); // don't keep the process alive

/**
 * Hash a raw token with SHA-256 (non-secret digest, just for storage safety).
 * @param {string} rawToken
 * @returns {string}
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Create and store a reset token for a user.
 * @param {string} userId
 * @returns {{ rawToken: string, expiresAt: Date }}
 */
function createResetToken(userId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + TTL_MS;
  store.set(hashToken(rawToken), { userId, expiresAt });
  return { rawToken, expiresAt: new Date(expiresAt) };
}

/**
 * Validate a raw token. Returns userId if valid, null otherwise.
 * Consumes (deletes) the token on success.
 * @param {string} rawToken
 * @returns {string|null}
 */
function consumeResetToken(rawToken) {
  const key = hashToken(rawToken);
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  store.delete(key);
  return entry.userId;
}

/**
 * Revoke all reset tokens for a user (called after password change).
 * @param {string} userId
 */
function revokeAllForUser(userId) {
  for (const [key, val] of store) {
    if (val.userId === userId) store.delete(key);
  }
}

module.exports = { createResetToken, consumeResetToken, revokeAllForUser };
