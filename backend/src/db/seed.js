/**
 * Tohfa v2 — Master Seed Runner
 * File: backend/src/db/seed.js
 * Role: Executes catalog and shop seed data.
 */
'use strict';

require('dotenv').config();

console.log('🌱 Starting Tohfa v2 Database Seed...');

try {
  require('./seed_tofa_specials');
} catch (err) {
  console.error('❌ Error during seed:', err.message);
  process.exit(1);
}
