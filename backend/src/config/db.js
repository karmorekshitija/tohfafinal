/**
 * Tohfa v2 — Neon PostgreSQL Connection Pool
 * File: backend/src/config/db.js
 * Role: Creates and exports a single pg Pool instance used by all queries.
 *       SSL is required for Neon. All queries must use parameterized syntax.
 */

'use strict';

const { Pool } = require('pg');

const isLocalDb = (process.env.DATABASE_URL || '').includes('localhost') || (process.env.DATABASE_URL || '').includes('127.0.0.1');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false }, // Neon requires SSL, localhost does not
  max: 20,             // max connections in pool
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

/**
 * Execute a single parameterized query.
 * Usage: const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (process.env.NODE_ENV === 'development') {
    console.log(`[DB] ${text.substring(0, 80)} — ${Date.now() - start}ms`);
  }
  return result;
}

/**
 * Get a client from the pool for transactions.
 * Usage:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     ...
 *     await client.query('COMMIT');
 *   } catch {
 *     await client.query('ROLLBACK');
 *   } finally {
 *     client.release();
 *   }
 */
async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
