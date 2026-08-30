/**
 * Tohfa v2 — Neon PostgreSQL Connection Pool
 * File: backend/src/config/db.js
 * Role: Creates and exports a single pg Pool instance used by all queries.
 *       SSL is required for Neon. All queries must use parameterized syntax.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const { Pool: PgPool } = require('pg');
let NeonPool, neonConfig;
try {
  const neon = require('@neondatabase/serverless');
  NeonPool = neon.Pool;
  neonConfig = neon.neonConfig;
  const ws = require('ws');
  neonConfig.webSocketConstructor = ws;
} catch (e) {
  // Fallback if @neondatabase/serverless is unavailable
}

const isLocalDb = (process.env.DATABASE_URL || '').includes('localhost') || (process.env.DATABASE_URL || '').includes('127.0.0.1');

const pool = isLocalDb || !NeonPool
  ? new PgPool({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
  : new NeonPool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 30_000,
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
