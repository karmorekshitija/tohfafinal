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
    await db.query(`
      INSERT INTO audit_logs (
        admin_id, actor_id, action_type, action, target_entity, target_type, target_id, details, meta, ip_address, created_at
      ) VALUES ($1, $1, $2, $2, $3, $3, $4, $5, $5, $6, NOW())
    `, [adminId || null, actionType || 'UNKNOWN_ACTION', targetEntity || null, targetId || null, detailsJson, ipAddress || '127.0.0.1']);
  } catch (err) {
    // Non-blocking log failure
    console.error('Audit Logging Failure:', err.message);
  }
};
