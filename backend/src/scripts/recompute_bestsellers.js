/**
 * Tohfa v2 — Bestseller Recomputation Backfill Script
 * File: backend/src/scripts/recompute_bestsellers.js
 * Run via: node backend/src/scripts/recompute_bestsellers.js
 */
'use strict';

require('dotenv').config();
const { recomputeAll } = require('../services/bestseller.service');
const { getClient } = require('../config/db');

async function main() {
  console.log('🔄 Starting Bestseller Recomputation Backfill...\n');

  try {
    const results = await recomputeAll();

    console.log('--------------------------------------------------------------------------------');
    console.log(
      'Seller ID'.padEnd(38) +
      'Active Count'.padEnd(14) +
      'Cap'.padEnd(8) +
      'Flagged Count'
    );
    console.log('--------------------------------------------------------------------------------');

    for (const r of results) {
      console.log(
        String(r.seller_id).padEnd(38) +
        String(r.active_count).padEnd(14) +
        String(r.cap).padEnd(8) +
        String(r.flagged_count)
      );
    }

    console.log('--------------------------------------------------------------------------------');
    console.log(`✅ Completed bestseller recomputation for ${results.length} sellers.\n`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during bestseller recomputation:', err);
    process.exit(1);
  }
}

main();
