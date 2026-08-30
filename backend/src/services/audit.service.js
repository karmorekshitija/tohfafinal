/**
 * Tohfa v2 — Immutable Audit Logger Service
 * File: backend/src/services/audit.service.js
 * Role: Records immutable audit logs for administrative actions across the platform.
 */
'use strict';

const db = require('../config/db');

/**
 * Log an administrative mutation to the permanent audit trail.
 *
 * @param {Object} params
 * @param {string} params.adminId
 * @param {string} params.actionType
 * @param {string} params.targetEntity
 * @param {string} params.targetId
 * @param {Object} [params.details={}]
 * @param {string} [params.ipAddress='127.0.0.1']
 */
exports.logAdminAction = async ({
  adminId,
  actionType,
  targetEntity,
  targetId,
  details = {},
  ipAddress = '127.0.0.1'
}) => {
  try {
    const detailsJson = JSON.stringify(details || {});
    const aid = adminId ? parseInt(adminId, 10) : null;
    const act = actionType || 'UNKNOWN_ACTION';
    const tgt = targetEntity || null;
    const tid = targetId ? String(targetId) : null;
    const ip = ipAddress || '127.0.0.1';

    await db.query(`
      INSERT INTO audit_logs (
        admin_id, actor_id, actor_name, action_type, action, event_type, target_entity, target_type, target_id, details, meta, ip_address, created_at
      ) VALUES (
        $1::integer, $2::integer, $3::text, $4::varchar, $5::varchar, $6::text, $7::varchar, $8::text, $9::text, $10::jsonb, $11::jsonb, $12::varchar, NOW()
      )
    `, [aid, aid, 'Admin ' + (aid || 'System'), act, act, act, tgt, tgt, tid, detailsJson, detailsJson, ip]);
  } catch (err) {
    // Non-blocking log failure
    console.error('Audit Logging Failure:', err.message);
  }
};
