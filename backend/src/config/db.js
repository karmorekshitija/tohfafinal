/**
 * Tohfa v2 — Neon PostgreSQL Connection Pool
 * File: backend/src/config/db.js
 * Role: Creates and exports a single pg Pool instance used by all queries.
 *       SSL is configured for Neon PostgreSQL. All queries must use parameterized syntax.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL || '';
const isLocalDb = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');

if (!databaseUrl) {
  console.warn('⚠️ [Database] DATABASE_URL environment variable is missing! Database queries will fail.');
}

const poolConfig = {
  connectionString: databaseUrl || 'postgresql://postgres:postgres@localhost:5432/tohfa',
  ssl: isLocalDb || !databaseUrl ? false : { rejectUnauthorized: false },
  max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : (process.env.VERCEL ? 5 : 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[Database Pool Error]:', err.message);
});

/**
 * Execute a single parameterized query.
 * Usage: const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DB] ${text.substring(0, 80).replace(/\s+/g, ' ')} — ${Date.now() - start}ms`);
    }
    return result;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[DB Error on query: ${text.substring(0, 80)}]`, err.message);
    }
    throw err;
  }
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
