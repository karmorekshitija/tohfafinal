/**
 * Tohfa v2 — Apply Migration 022: Fix missing orders/order_items columns
 * File: backend/src/db/apply_022_migration.js
 * Role: One-off script that runs ONLY migration 022 against the live database
 *       and then verifies all 5 expected columns are present.
 */
'use strict';

const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { pool } = require('../config/db');

const MIGRATION_FILE = path.join(__dirname, 'migrations', '022_fix_missing_order_columns.sql');

async function run() {
  console.log('🚀 Applying migration 022_fix_missing_order_columns.sql …\n');

  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await client.query(sql);
    console.log('✅ Migration 022 applied successfully.\n');
  } catch (err) {
    console.error('❌ Migration 022 failed:', err.message);
    await client.release();
    process.exit(1);
  }

  // ── Verification ─────────────────────────────────────────────────────────
  console.log('🔍 Verifying columns now exist in the live database …\n');

  const checks = [
    { table: 'orders',      column: 'order_ref'        },
    { table: 'orders',      column: 'studio_notes'     },
    { table: 'orders',      column: 'total_paise'      },
    { table: 'order_items', column: 'unit_price_paise' },
    { table: 'order_items', column: 'variant_name'     },
  ];

  let allOk = true;
  for (const { table, column } of checks) {
    const { rows } = await client.query(
      `SELECT data_type
         FROM information_schema.columns
        WHERE table_name = $1
          AND column_name = $2`,
      [table, column]
    );
    if (rows.length > 0) {
      console.log(`  ✅  ${table}.${column}  (${rows[0].data_type})`);
    } else {
      console.error(`  ❌  ${table}.${column}  — NOT FOUND`);
      allOk = false;
    }
  }

  // ── Verify unique index on orders.order_ref ───────────────────────────────
  const { rows: idxRows } = await client.query(
    `SELECT indexname FROM pg_indexes
      WHERE tablename = 'orders'
        AND indexname = 'idx_orders_order_ref'`
  );
  if (idxRows.length > 0) {
    console.log('\n  ✅  UNIQUE INDEX idx_orders_order_ref exists on orders(order_ref)');
  } else {
    console.error('\n  ❌  UNIQUE INDEX idx_orders_order_ref — NOT FOUND');
    allOk = false;
  }

  // ── Sample backfill check ─────────────────────────────────────────────────
  const { rows: sampleRows } = await client.query(
    `SELECT COUNT(*) AS total,
            COUNT(order_ref)   AS with_ref,
            COUNT(total_paise) AS with_paise
       FROM orders`
  );
  if (sampleRows.length > 0) {
    const { total, with_ref, with_paise } = sampleRows[0];
    console.log(`\n  📊  orders: ${total} rows — ${with_ref} have order_ref, ${with_paise} have total_paise`);
  }

  client.release();
  await pool.end();

  if (allOk) {
    console.log('\n🎉 All 5 columns verified. Migration 022 complete.');
  } else {
    console.error('\n⚠️  One or more columns are missing — review errors above.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
