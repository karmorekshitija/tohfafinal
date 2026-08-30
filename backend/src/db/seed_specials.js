/**
 * Tohfa v2 — Seed Specials (RETIRED / DEPRECATED)
 * File: backend/src/db/seed_specials.js
 * 
 * NOTE: The single-shop "Tohfa Official Store" model has been permanently retired.
 * All TOFA Special seeding is now handled by seed_tofa_specials.js (3-shop model).
 */

'use strict';

const { seedTofaSpecials } = require('./seed_tofa_specials');

console.warn('⚠️ seed_specials.js (single-seller Tohfa Official Store) has been retired.');
console.log('🔄 Redirecting execution to seed_tofa_specials.js (3-shop model)...\n');

if (require.main === module) {
  seedTofaSpecials()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Failed:', err);
      process.exit(1);
    });
}

module.exports = { seedTofaSpecials };
