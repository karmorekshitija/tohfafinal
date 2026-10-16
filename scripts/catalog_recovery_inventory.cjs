'use strict';

// Read-only evidence collection. Never import the application or run migrations/seeds.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000
  });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");
    const queries = {
      sellers: 'SELECT id, user_id, store_name, slug, is_admin_managed, is_active, created_at FROM sellers ORDER BY id',
      profiles: 'SELECT id, user_id, store_name, slug, is_admin_managed, is_active, created_at FROM seller_profiles ORDER BY id',
      products: 'SELECT id, seller_id, name, slug, base_price, images, is_active, status, created_at, updated_at FROM products ORDER BY seller_id, created_at',
      images: 'SELECT id, product_id, url, sort_order FROM product_images ORDER BY product_id, sort_order',
      variants: 'SELECT product_id, variant_name, additional_price, images FROM product_variants ORDER BY product_id'
    };
    const evidence = { capturedAt: new Date().toISOString(), source: 'configured database; read-only snapshot, NOT a historical baseline' };
    for (const [key, sql] of Object.entries(queries)) evidence[key] = (await client.query(sql)).rows;
    await client.query('ROLLBACK');
    const output = path.resolve(__dirname, '../docs/catalog-recovery-current-inventory.json');
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ output, counts: Object.fromEntries(Object.keys(queries).map(key => [key, evidence[key].length])) }));
  } finally {
    if (client) client.release();
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only inventory failed:', error.code || error.name); process.exitCode = 1; });
