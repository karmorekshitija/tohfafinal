/**
 * Tohfa v2 — Notification Controller
 * File: src/controllers/notification.controller.js
 * Role: HTTP handlers for notification endpoints + exported createNotification helper
 *       used by other services/controllers to insert notification rows.
 *       All SQL uses parameterized $1..$N syntax via the query() helper.
 */
'use strict';

const { query } = require('../config/db');

// ---------------------------------------------------------------------------
// Helper — used internally by order.service, order.controller, etc.
// ---------------------------------------------------------------------------

/**
 * Insert a notification row for a user.
 * @param {string} userId
 * @param {string} type   - e.g. 'new_order', 'order_status', 'seller_approved'
 * @param {string} title
 * @param {string} body
 * @param {object|null} meta - arbitrary JSON metadata
 */
async function createNotification(userId, type, title, body, meta = null) {
  const notifTitle = title || 'Notification';
  const notifBody  = body || '';
  const notifMeta  = meta ? JSON.stringify(meta) : '{}';

  await query(
    `INSERT INTO notifications (user_id, type, title, body, is_read, meta)
     VALUES ($1, $2, $3, $4, FALSE, $5)`,
    [userId, type, notifTitle, notifBody, notifMeta]
  ).catch(async () => {
    // Fallback if table has message column
    const message = [notifTitle, notifBody].filter(Boolean).join(': ') || notifTitle;
    await query(
      `INSERT INTO notifications (user_id, type, message)
       VALUES ($1, $2, $3)`,
      [userId, type, message]
    ).catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/notifications
 * Paginated, newest first.
 */
async function getNotifications(req, res, next) {
  try {
    const userId = req.user.id;
    const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));
    const offset = (page - 1) * limit;

    const { rows } = await query(
      `SELECT id, type,
              COALESCE(title, 'Notification') AS title,
              COALESCE(body, '') AS body,
              COALESCE(body, title, '') AS message,
              is_read, created_at, meta
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ).catch(async () => {
      // Fallback
      return await query(
        `SELECT id, type, message, message AS title, message AS body, is_read, created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
    });

    const { rows: countRows } = await query(
      'SELECT COUNT(*) AS total FROM notifications WHERE user_id = $1',
      [userId]
    );

    const { rows: unreadRows } = await query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = $1 AND (is_read = FALSE OR is_read::text = \'0\' OR is_read IS NULL)',
      [userId]
    );

    const mappedRows = rows.map(r => ({
      ...r,
      is_read: Boolean(r.is_read && r.is_read !== '0' && r.is_read !== 0),
      message: r.body || r.title || r.message,
    }));

    const unreadCountNum = parseInt(unreadRows[0]?.unread || 0, 10);

    return res.json({
      success: true,
      data: {
        notifications: mappedRows,
        unread_count: unreadCountNum,
        unreadCount: unreadCountNum,
        total: parseInt(countRows[0]?.total || 0, 10),
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/:id/read
 */
async function markOneRead(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { rowCount } = await query(
      `UPDATE notifications SET is_read = TRUE
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    ).catch(async () => {
      return await query(
        `UPDATE notifications SET is_read = 1
         WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
    });

    if (!rowCount) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.json({ success: true, data: { message: 'Marked as read.' } });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/read-all
 */
async function markAllRead(req, res, next) {
  try {
    const userId = req.user.id;

    await query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND (is_read = FALSE OR is_read IS NULL)',
      [userId]
    ).catch(async () => {
      await query(
        'UPDATE notifications SET is_read = 1 WHERE user_id = $1 AND (is_read = 0 OR is_read IS NULL)',
        [userId]
      );
    });

    return res.json({ success: true, data: { message: 'All notifications marked as read.' } });
  } catch (err) {
    next(err);
  }
}

module.exports = { createNotification, getNotifications, markOneRead, markAllRead };
