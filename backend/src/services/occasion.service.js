/**
 * Tohfa v2 — Occasion & WhatsApp Reminder Service
 * File: backend/src/services/occasion.service.js
 * Role: Automates Tohfa's hallmark WhatsApp & in-app reminder checkpoints:
 *       1 month before, 2 weeks before, and 1 week before saved occasions.
 *       Includes daily cron schedule execution with IST timezone awareness.
 */
'use strict';

const cron = require('node-cron');
const { query, getClient } = require('../config/db');
const whatsappService = require('./whatsapp.service');
const customizationService = require('./customization.service');
const ownerNotifyService = require('./ownerNotify.service');
const whatsappConfig = require('../config/whatsapp');

/**
 * Scan database and trigger upcoming occasion reminders
 */
async function processOccasionReminders() {
  console.log('[Occasions] Running daily reminder scan (Asia/Kolkata)...');

  try {
    const runStartTime = new Date();
    const manualPendingRows = [];

    // -------------------------------------------------------------------------
    // 1. 30 Days Check (1 Month): Catch-up window 28..30 days
    // -------------------------------------------------------------------------
    const { rows: monthRows } = await query(
      `SELECT o.*,
              (o.occasion_date - (NOW() AT TIME ZONE 'Asia/Kolkata')::date) AS days_left,
              u.phone, u.name AS user_name
       FROM occasions o
       JOIN users u ON u.id = o.user_id
       WHERE (o.occasion_date - (NOW() AT TIME ZONE 'Asia/Kolkata')::date) BETWEEN 28 AND 30
         AND o.reminder_sent_1m = FALSE`
    );

    for (const item of monthRows) {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        // Atomic claim: only one worker instance can claim this checkpoint
        const { rows: claimed } = await client.query(
          `UPDATE occasions
           SET reminder_sent_1m = TRUE
           WHERE id = $1 AND reminder_sent_1m = FALSE
           RETURNING id`,
          [item.id]
        );

        if (!claimed.length) {
          await client.query('ROLLBACK');
          continue; // Already processed by concurrent instance
        }

        const daysLeft = item.days_left;

        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, meta)
           VALUES ($1, 'occasion_reminder', 'Occasion in 1 Month', $2, $3)`,
          [
            item.user_id,
            `"${item.label}" is coming up in ${daysLeft} days. Start browsing early to get thoughtful artisan gifts crafted in time!`,
            JSON.stringify({ occasionId: item.id }),
          ]
        );

        await client.query('COMMIT');

        // Enqueue WhatsApp reminder (marketing consent checked by outbox service)
        if (item.phone) {
          const waResult = await whatsappService.sendOccasionReminder(item.phone, {
            occasionLabel: item.label,
            personName: item.person_name,
            daysUntil: daysLeft,
            occasionId: item.id,
            checkpoint: '30d',
            recipientUserId: item.user_id,
          }).catch((e) => { console.error(`[Occasion WhatsApp Error ${item.id}]:`, e.message); return null; });
          if (waResult && waResult.status === 'manual_pending' && waResult.id) {
            manualPendingRows.push({
              id: waResult.id,
              kind: 'occasion_reminder',
              intended_to: item.phone,
              recipient_user_id: item.user_id,
              variables: {
                occasionLabel: item.label,
                personName: item.person_name,
                daysUntil: String(daysLeft),
                userName: item.user_name || '',
              },
              created_at: new Date(),
            });
          }
        }
      } catch (itemErr) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error(`[Occasion Reminder Item Error ${item.id}]:`, itemErr.message);
      } finally {
        client.release();
      }
    }

    // -------------------------------------------------------------------------
    // 2. 14 Days Check (2 Weeks): Catch-up window 12..14 days
    // -------------------------------------------------------------------------
    const { rows: twoWeekRows } = await query(
      `SELECT o.*,
              (o.occasion_date - (NOW() AT TIME ZONE 'Asia/Kolkata')::date) AS days_left,
              u.phone, u.name AS user_name
       FROM occasions o
       JOIN users u ON u.id = o.user_id
       WHERE (o.occasion_date - (NOW() AT TIME ZONE 'Asia/Kolkata')::date) BETWEEN 12 AND 14
         AND o.reminder_sent_2w = FALSE`
    );

    for (const item of twoWeekRows) {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        const { rows: claimed } = await client.query(
          `UPDATE occasions
           SET reminder_sent_2w = TRUE
           WHERE id = $1 AND reminder_sent_2w = FALSE
           RETURNING id`,
          [item.id]
        );

        if (!claimed.length) {
          await client.query('ROLLBACK');
          continue;
        }

        const daysLeft = item.days_left;

        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, meta)
           VALUES ($1, 'occasion_reminder', 'Occasion in 2 Weeks', $2, $3)`,
          [
            item.user_id,
            `"${item.label}" is just ${daysLeft} days away. Explore trending gifts on Tohfa!`,
            JSON.stringify({ occasionId: item.id }),
          ]
        );

        await client.query('COMMIT');

        if (item.phone) {
          const waResult = await whatsappService.sendOccasionReminder(item.phone, {
            occasionLabel: item.label,
            personName: item.person_name,
            daysUntil: daysLeft,
            occasionId: item.id,
            checkpoint: '14d',
            recipientUserId: item.user_id,
          }).catch((e) => { console.error(`[Occasion WhatsApp Error ${item.id}]:`, e.message); return null; });
          if (waResult && waResult.status === 'manual_pending' && waResult.id) {
            manualPendingRows.push({
              id: waResult.id,
              kind: 'occasion_reminder',
              intended_to: item.phone,
              recipient_user_id: item.user_id,
              variables: {
                occasionLabel: item.label,
                personName: item.person_name,
                daysUntil: String(daysLeft),
                userName: item.user_name || '',
              },
              created_at: new Date(),
            });
          }
        }
      } catch (itemErr) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error(`[Occasion Reminder Item Error ${item.id}]:`, itemErr.message);
      } finally {
        client.release();
      }
    }

    // -------------------------------------------------------------------------
    // 3. 7 Days Check (1 Week): Catch-up window 5..7 days
    // -------------------------------------------------------------------------
    const { rows: weekRows } = await query(
      `SELECT o.*,
              (o.occasion_date - (NOW() AT TIME ZONE 'Asia/Kolkata')::date) AS days_left,
              u.phone, u.name AS user_name
       FROM occasions o
       JOIN users u ON u.id = o.user_id
       WHERE (o.occasion_date - (NOW() AT TIME ZONE 'Asia/Kolkata')::date) BETWEEN 5 AND 7
         AND o.reminder_sent_1w = FALSE`
    );

    for (const item of weekRows) {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        const { rows: claimed } = await client.query(
          `UPDATE occasions
           SET reminder_sent_1w = TRUE
           WHERE id = $1 AND reminder_sent_1w = FALSE
           RETURNING id`,
          [item.id]
        );

        if (!claimed.length) {
          await client.query('ROLLBACK');
          continue;
        }

        const daysLeft = item.days_left;

        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, meta)
           VALUES ($1, 'occasion_reminder', 'Occasion in 1 Week', $2, $3)`,
          [
            item.user_id,
            `Only ${daysLeft} days left until "${item.label}"! Order now to guarantee on-time delivery.`,
            JSON.stringify({ occasionId: item.id }),
          ]
        );

        await client.query('COMMIT');

        if (item.phone) {
          const waResult = await whatsappService.sendOccasionReminder(item.phone, {
            occasionLabel: item.label,
            personName: item.person_name,
            daysUntil: daysLeft,
            occasionId: item.id,
            checkpoint: '7d',
            recipientUserId: item.user_id,
          }).catch((e) => { console.error(`[Occasion WhatsApp Error ${item.id}]:`, e.message); return null; });
          if (waResult && waResult.status === 'manual_pending' && waResult.id) {
            manualPendingRows.push({
              id: waResult.id,
              kind: 'occasion_reminder',
              intended_to: item.phone,
              recipient_user_id: item.user_id,
              variables: {
                occasionLabel: item.label,
                personName: item.person_name,
                daysUntil: String(daysLeft),
                userName: item.user_name || '',
              },
              created_at: new Date(),
            });
          }
        }
      } catch (itemErr) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error(`[Occasion Reminder Item Error ${item.id}]:`, itemErr.message);
      } finally {
        client.release();
      }
    }

    // Also expire stale customization quotes
    await customizationService.expireStaleQuotes();

    // Send digest email to owner for manual-mode occasion rows
    if (whatsappConfig.getMode() === 'manual') {
      let rowsToDigest = manualPendingRows;
      if (rowsToDigest.length === 0) {
        try {
          const { rows: dbRows } = await query(
            `SELECT * FROM whatsapp_outbox
             WHERE kind = 'occasion_reminder'
               AND status = 'manual_pending'
               AND owner_email_status = 'pending'
               AND created_at >= $1
             ORDER BY created_at ASC`,
            [runStartTime]
          );
          rowsToDigest = dbRows;
        } catch (_) {}
      }
      if (rowsToDigest && rowsToDigest.length > 0) {
        await ownerNotifyService.sendOccasionDigest(rowsToDigest).catch((e) =>
          console.error('[Occasion] Digest email error:', e.message)
        );
      }
    }

    console.log('[Occasions] Daily reminder scan complete.');
  } catch (err) {
    console.error('[Occasions] Cron routine error:', err.message);
  }
}

/**
 * Schedule daily cron job at 9:00 AM (Asia/Kolkata timezone)
 */
function startOccasionCron() {
  cron.schedule('0 9 * * *', () => {
    processOccasionReminders();
  }, { timezone: 'Asia/Kolkata' });
  console.log('📅 Tohfa Occasions WhatsApp Cron Scheduler initialized (09:00 AM daily Asia/Kolkata).');
}

module.exports = {
  processOccasionReminders,
  startOccasionCron,
};
