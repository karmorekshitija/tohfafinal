/**
 * Tohfa v2 — Seed Meesho Tohfa (RETIRED / DEPRECATED)
 * File: backend/src/db/seed_meesho_tohfa.js
 * 
 * NOTE: Retired in favor of seed_tofa_specials.js (3-shop model).
 */

'use strict';

const { seedTofaSpecials } = require('./seed_tofa_specials');

console.warn('⚠️ seed_meesho_tohfa.js has been retired in favor of the 3-shop TOFA Special seeder.');
console.log('🔄 Redirecting execution to seed_tofa_specials.js...\n');

if (require.main === module) {
  seedTofaSpecials()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Failed:', err);
      process.exit(1);
    });
}

module.exports = { seedTofaSpecials };

