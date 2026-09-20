/**
 * Tohfa v2 — Database Schema Audit Script
 * File: scripts/audit_schema.js
 * Role: Read-only diagnostic script to inspect live PostgreSQL (Neon) schema
 *       against backend codebase expectations before query/controller changes.
 *
 * Usage:
 *   node scripts/audit_schema.js
 *   node scripts/audit_schema.js --json
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Load environment variables from possible locations
const rootEnv = path.resolve(__dirname, '../.env');
const backendEnv = path.resolve(__dirname, '../backend/.env');

if (fs.existsSync(rootEnv)) {
  require('dotenv').config({ path: rootEnv });
}
if (fs.existsSync(backendEnv)) {
  require('dotenv').config({ path: backendEnv });
}
require('dotenv').config();

const { Pool } = require('pg');

// Resolve database connection
let pool;
try {
  // Try using the existing pool from backend/src/config/db if possible
  const dbModulePath = path.resolve(__dirname, '../backend/src/config/db');
  if (fs.existsSync(`${dbModulePath}.js`)) {
    const db = require(dbModulePath);
    pool = db.pool;
  }
} catch (err) {
  // Fall back to direct pool creation
}

if (!pool) {
  const databaseUrl = process.env.DATABASE_URL || '';
  const isLocalDb = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');

  pool = new Pool({
    connectionString: databaseUrl || 'postgresql://postgres:postgres@localhost:5432/tohfa',
    ssl: isLocalDb || !databaseUrl ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
}

// Disputed columns definition to audit
const DISPUTED_ITEMS = [
  {
    table: 'order_items',
    targetColumn: 'unit_price_paise',
    alternatives: ['unit_price'],
    note: 'Check if stored in paise (BIGINT) vs rupees (NUMERIC)',
  },
  {
    table: 'order_items',
    targetColumn: 'image_url',
    alternatives: ['proof_image_url'],
    note: 'Check whether image_url or proof_image_url is used for item snaps',
  },
  {
    table: 'products',
    targetColumn: 'id',
    alternatives: [],
    note: 'Verify type: uuid vs integer/serial',
  },
  {
    table: 'products',
    targetColumn: 'price_paise',
    alternatives: ['base_price'],
    note: 'Check if price_paise exists alongside base_price',
  },
  {
    table: 'orders',
    targetColumn: 'is_admin_managed',
    alternatives: [],
    note: 'Check if is_admin_managed exists on orders (or only on sellers/seller_profiles)',
  },
  {
    table: 'orders',
    targetColumn: 'status',
    alternatives: [],
    note: 'Verify data type & allowable values',
  },
  {
    table: 'orders',
    targetColumn: 'shipping_address',
    alternatives: ['address_id'],
    note: 'Verify data type (JSONB vs TEXT vs UUID foreign key)',
  },
  {
    table: 'seller_profiles',
    targetColumn: 'story_headline',
    alternatives: ['bio'],
    note: 'Check for custom artisan story headline field',
  },
  {
    table: 'seller_profiles',
    targetColumn: 'vacation_mode_active',
    alternatives: ['vacation_mode'],
    note: 'Check exact column name for vacation mode toggle',
  },
  {
    table: 'seller_profiles',
    targetColumn: 'zai_mode_enabled',
    alternatives: [],
    note: 'Check for AI/ZAI mode flag',
  },
  {
    table: 'seller_profiles',
    targetColumn: 'daily_order_limit',
    alternatives: ['capacity_limit', 'daily_capacity_max', 'daily_capacity_min'],
    note: 'Check exact name for daily order limit / capacity',
  },
  {
    table: 'seller_profiles',
    targetColumn: 'is_accepting_orders',
    alternatives: ['store_visibility', 'is_active'],
    note: 'Check order acceptance status field',
  },
  {
    table: 'cart_items',
    targetColumn: 'user_id',
    alternatives: ['buyer_id'],
    note: 'Check user reference: user_id vs buyer_id',
  },
  {
    table: 'cart_items',
    targetColumn: 'added_at',
    alternatives: ['created_at'],
    note: 'Check timestamp column: added_at vs created_at',
  },
  {
    table: 'cart_items',
    targetColumn: 'cart_id',
    alternatives: [],
    note: 'Check if cart_id foreign key exists',
  },
  {
    table: 'wishlist',
    targetColumn: 'added_at',
    alternatives: ['created_at'],
    note: 'Check timestamp column: added_at vs created_at',
  },
  {
    table: 'wishlist',
    targetColumn: 'user_id',
    alternatives: ['buyer_id'],
    note: 'Check buyer/user reference column',
  },
  {
    table: 'wishlists',
    targetColumn: 'added_at',
    alternatives: ['created_at'],
    note: 'Check plural table (wishlists) timestamp column',
  },
  {
    table: 'wishlists',
    targetColumn: 'user_id',
    alternatives: ['buyer_id'],
    note: 'Check plural table (wishlists) user reference',
  },
];

async function runAudit() {
  const isJsonMode = process.argv.includes('--json');
  const auditResults = {
    timestamp: new Date().toISOString(),
    databaseHost: 'unknown',
    databaseName: 'unknown',
    existingTables: [],
    missingTables: [],
    disputedColumnsAudit: [],
    allColumnsByTable: {},
    constraints: [],
    uniqueIndexes: [],
  };

  const client = await pool.connect();
  try {
    // 1. Connection info check
    const dbInfoRes = await client.query('SELECT current_database() AS db_name, inet_server_addr() AS host');
    auditResults.databaseName = dbInfoRes.rows[0]?.db_name || 'unknown';
    auditResults.databaseHost = dbInfoRes.rows[0]?.host || 'remote (Neon)';

    if (!isJsonMode) {
      console.log('======================================================================');
      console.log('🔍 TOHFA v2 — LIVE DATABASE SCHEMA AUDIT');
      console.log(`📡 Connected to DB: ${auditResults.databaseName}`);
      console.log(`⏱️ Audit Timestamp: ${auditResults.timestamp}`);
      console.log('======================================================================\n');
    }

    // Target tables
    const targetTables = [
      'order_items',
      'products',
      'orders',
      'seller_profiles',
      'cart_items',
      'wishlist',
      'wishlists',
    ];

    // 2. Inspect table existence
    const tablesRes = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1)
       ORDER BY table_name`,
      [targetTables]
    );
    const existingTableNames = new Set(tablesRes.rows.map((r) => r.table_name));
    auditResults.existingTables = Array.from(existingTableNames);
    auditResults.missingTables = targetTables.filter((t) => !existingTableNames.has(t));

    // 3. Inspect all columns for target tables
    const columnsRes = await client.query(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ANY($1)
       ORDER BY table_name, ordinal_position`,
      [targetTables]
    );

    const columnsMap = new Map();
    for (const col of columnsRes.rows) {
      if (!columnsMap.has(col.table_name)) {
        columnsMap.set(col.table_name, new Map());
      }
      columnsMap.get(col.table_name).set(col.column_name, col);

      if (!auditResults.allColumnsByTable[col.table_name]) {
        auditResults.allColumnsByTable[col.table_name] = [];
      }
      auditResults.allColumnsByTable[col.table_name].push({
        column: col.column_name,
        type: col.udt_name || col.data_type,
        nullable: col.is_nullable,
        default: col.column_default,
      });
    }

    // 4. Audit disputed items
    for (const item of DISPUTED_ITEMS) {
      const tableExists = existingTableNames.has(item.table);
      if (!tableExists) {
        auditResults.disputedColumnsAudit.push({
          Table: item.table,
          Target: item.targetColumn,
          Status: '❌ TABLE NOT FOUND',
          ActualType: 'N/A',
          Nullable: 'N/A',
          Notes: `Table '${item.table}' does not exist in public schema`,
        });
        continue;
      }

      const tableCols = columnsMap.get(item.table) || new Map();
      const colData = tableCols.get(item.targetColumn);

      if (colData) {
        let typeStr = colData.udt_name;
        if (colData.data_type && colData.data_type !== 'USER-DEFINED' && colData.data_type !== colData.udt_name) {
          typeStr += ` (${colData.data_type})`;
        }
        auditResults.disputedColumnsAudit.push({
          Table: item.table,
          Target: item.targetColumn,
          Status: '✅ FOUND',
          ActualType: typeStr,
          Nullable: colData.is_nullable,
          Notes: item.note,
        });
      } else {
        // Check if any alternatives exist
        const foundAlts = item.alternatives.filter((alt) => tableCols.has(alt));
        const altNote = foundAlts.length > 0
          ? `Missing '${item.targetColumn}', but found: [${foundAlts.map((a) => `${a}:${tableCols.get(a).udt_name}`).join(', ')}]`
          : `Missing '${item.targetColumn}'. ${item.note}`;

        auditResults.disputedColumnsAudit.push({
          Table: item.table,
          Target: item.targetColumn,
          Status: '⚠️ MISSING',
          ActualType: 'N/A',
          Nullable: 'N/A',
          Notes: altNote,
        });
      }
    }

    // 5. Inspect constraints (information_schema.table_constraints)
    const constraintsRes = await client.query(
      `SELECT tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
       FROM information_schema.table_constraints tc
       LEFT JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = 'public'
         AND tc.table_name = ANY($1)
       ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position`,
      [['wishlist', 'wishlists', 'cart_items', 'orders', 'products', 'order_items', 'seller_profiles']]
    );

    auditResults.constraints = constraintsRes.rows.map((r) => ({
      table: r.table_name,
      constraintName: r.constraint_name,
      type: r.constraint_type,
      column: r.column_name || 'N/A',
    }));

    // 6. Inspect pg_indexes (including partial unique indexes)
    const indexesRes = await client.query(
      `SELECT tablename, indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = ANY($1)
       ORDER BY tablename, indexname`,
      [['wishlist', 'wishlists', 'cart_items', 'orders', 'products', 'order_items', 'seller_profiles']]
    );

    auditResults.uniqueIndexes = indexesRes.rows.map((r) => ({
      table: r.tablename,
      indexName: r.indexname,
      isUnique: r.indexdef.includes('UNIQUE'),
      definition: r.indexdef,
    }));

    // Output formatting
    if (isJsonMode) {
      console.log(JSON.stringify(auditResults, null, 2));
    } else {
      console.log('### 1. TABLE EXISTENCE SUMMARY');
      console.log(`Existing tables (${auditResults.existingTables.length}):`, auditResults.existingTables.join(', '));
      if (auditResults.missingTables.length > 0) {
        console.log(`⚠️ Missing tables (${auditResults.missingTables.length}):`, auditResults.missingTables.join(', '));
      }
      console.log('\n');

      console.log('### 2. DISPUTED COLUMNS & TYPES VERIFICATION');
      console.table(auditResults.disputedColumnsAudit);
      console.log('\n');

      console.log('### 3. WISHLIST & CART_ITEMS CONSTRAINTS & UNIQUE INDEXES');
      const targetConstraints = auditResults.constraints.filter((c) =>
        ['wishlist', 'wishlists', 'cart_items'].includes(c.table)
      );
      if (targetConstraints.length > 0) {
        console.table(targetConstraints);
      } else {
        console.log('No standard table constraints found for wishlist/cart_items.');
      }
      console.log('\n');

      console.log('### 4. UNIQUE & PARTIAL INDEXES (pg_indexes)');
      const targetIndexes = auditResults.uniqueIndexes.filter(
        (idx) => idx.isUnique && ['wishlist', 'wishlists', 'cart_items'].includes(idx.table)
      );
      if (targetIndexes.length > 0) {
        console.table(
          targetIndexes.map((idx) => ({
            Table: idx.table,
            IndexName: idx.indexName,
            Definition: idx.definition.replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+\S+\s+ON\s+\S+\s+USING\s+\S+\s+/, ''),
          }))
        );
      } else {
        console.log('No unique indexes found for wishlist/cart_items.');
      }
      console.log('\n');

      console.log('### 5. FULL COLUMN BREAKDOWN BY TABLE');
      for (const [tableName, cols] of Object.entries(auditResults.allColumnsByTable)) {
        console.log(`\n--- Table: ${tableName} (${cols.length} columns) ---`);
        console.table(cols);
      }

      console.log('\n======================================================================');
      console.log('✅ AUDIT COMPLETE — Strictly read-only query finished successfully.');
      console.log('======================================================================\n');
    }
  } catch (error) {
    console.error('❌ [Audit Error]:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runAudit();
