/**
 * Tohfa v2 — Database Migration Runner
 * File: backend/src/db/migrate.js
 * Role: Executes database schema and sequential migration files in exact order:
 *       schema.sql -> 002_audit_fixes.sql -> 003_seller_studio_fixes.sql ->
 *       004_buyer_platform_fixes.sql -> 005_tohfa_specials_and_admin_authority.sql ->
 *       006_master_audit_schema_sync.sql (CHK-61)
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getClient } = require('../config/db');

const MIGRATION_FILES = [
  path.join(__dirname, 'schema.sql'),
  path.join(__dirname, 'migrations', '002_audit_fixes.sql'),
  path.join(__dirname, 'migrations', '003_seller_studio_fixes.sql'),
  path.join(__dirname, 'migrations', '004_buyer_platform_fixes.sql'),
  path.join(__dirname, 'migrations', '005_tohfa_specials_and_admin_authority.sql'),
  path.join(__dirname, 'migrations', '006_master_audit_schema_sync.sql'),
];

async function runMigrations() {
  console.log('🚀 Starting Tohfa v2 database migration pipeline...\n');
  let client;
  try {
    client = await getClient();
  } catch (dbErr) {
    console.error('⚠️ Could not connect to database:', dbErr.message);
    return;
  }

  try {
    for (let i = 0; i < MIGRATION_FILES.length; i++) {
      const filePath = MIGRATION_FILES[i];
      const filename = path.basename(filePath);
      console.log(`[Step ${i + 1}/${MIGRATION_FILES.length}] Executing ${filename}...`);

      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ Warning: Migration file not found at ${filePath}, skipping.`);
        continue;
      }

      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      console.log(`✅ Completed ${filename}`);
    }

    console.log('\n🎉 All Tohfa database migrations applied successfully!');
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
  } finally {
    if (client) client.release();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations, MIGRATION_FILES };
