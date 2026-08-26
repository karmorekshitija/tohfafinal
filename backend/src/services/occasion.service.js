/**
 * Tohfa v2 — Occasion & WhatsApp Reminder Service
 * File: backend/src/services/occasion.service.js
 * Role: Automates Tohfa's hallmark WhatsApp & in-app reminder checkpoints:
 *       1 month before, 2 weeks before, and 1 week before saved occasions.
 *       Includes daily cron schedule execution.
 */
'use strict';

const cron = require('node-cron');
const { query } = require('../config/db');
const whatsappService = require('./whatsapp.service');
const customizationService = require('./customization.service');

/**
 * Scan database and trigger upcoming occasion reminders
 */
async function processOccasionReminders() {
  console.log('[Occasions] Running daily reminder scan...');

  try {
    // 1. 30 Days Check (1 Month)
    const { rows: monthRows } = await query(
      `SELECT o.*, u.phone, u.name AS user_name
       FROM occasions o
       JOIN users u ON u.id = o.user_id
       WHERE o.occasion_date = (CURRENT_DATE + INTERVAL '30 days')
         AND o.reminder_sent_1m = FALSE`
    );

    for (const item of monthRows) {
      if (item.phone) {
        await whatsappService.sendOccasionReminder(item.phone, {
          occasionLabel: item.label,
          personName: item.person_name,
          daysUntil: 30,
        });
      }
      await query(
        `INSERT INTO notifications (user_id, type, title, body, meta)
         VALUES ($1, 'occasion_reminder', 'Occasion in 1 Month', $2, $3)`,
        [
          item.user_id,
          `"${item.label}" is coming up in 30 days. Start browsing early to get thoughtful artisan gifts crafted in time!`,
          JSON.stringify({ occasionId: item.id }),
        ]
      );
      await query('UPDATE occasions SET reminder_sent_1m = TRUE WHERE id = $1', [item.id]);
    }

    // 2. 14 Days Check (2 Weeks)
    const { rows: twoWeekRows } = await query(
      `SELECT o.*, u.phone, u.name AS user_name
       FROM occasions o
       JOIN users u ON u.id = o.user_id
       WHERE o.occasion_date = (CURRENT_DATE + INTERVAL '14 days')
         AND o.reminder_sent_2w = FALSE`
    );

    for (const item of twoWeekRows) {
      if (item.phone) {
        await whatsappService.sendOccasionReminder(item.phone, {
          occasionLabel: item.label,
          personName: item.person_name,
          daysUntil: 14,
        });
      }
      await query(
        `INSERT INTO notifications (user_id, type, title, body, meta)
         VALUES ($1, 'occasion_reminder', 'Occasion in 2 Weeks', $2, $3)`,
        [
          item.user_id,
          `"${item.label}" is just 2 weeks away. Explore trending gifts on Tohfa!`,
          JSON.stringify({ occasionId: item.id }),
        ]
      );
      await query('UPDATE occasions SET reminder_sent_2w = TRUE WHERE id = $1', [item.id]);
    }

    // 3. 7 Days Check (1 Week)
    const { rows: weekRows } = await query(
      `SELECT o.*, u.phone, u.name AS user_name
       FROM occasions o
       JOIN users u ON u.id = o.user_id
       WHERE o.occasion_date = (CURRENT_DATE + INTERVAL '7 days')
         AND o.reminder_sent_1w = FALSE`
    );

    for (const item of weekRows) {
      if (item.phone) {
        await whatsappService.sendOccasionReminder(item.phone, {
          occasionLabel: item.label,
          personName: item.person_name,
          daysUntil: 7,
        });
      }
      await query(
        `INSERT INTO notifications (user_id, type, title, body, meta)
         VALUES ($1, 'occasion_reminder', 'Occasion in 1 Week', $2, $3)`,
        [
          item.user_id,
          `Only 7 days left until "${item.label}"! Order now to guarantee on-time delivery.`,
          JSON.stringify({ occasionId: item.id }),
        ]
      );
      await query('UPDATE occasions SET reminder_sent_1w = TRUE WHERE id = $1', [item.id]);
    }

    // Also expire stale customization quotes
    await customizationService.expireStaleQuotes();

    console.log('[Occasions] Daily reminder scan complete.');
  } catch (err) {
    console.error('[Occasions] Cron routine error:', err.message);
  }
}

/**
 * Schedule daily cron job at 9:00 AM
 */
function startOccasionCron() {
  // Runs every day at 09:00 AM
  cron.schedule('0 9 * * *', () => {
    processOccasionReminders();
  });
  console.log('📅 Tohfa Occasions WhatsApp Cron Scheduler initialized (09:00 AM daily).');
}

module.exports = {
  processOccasionReminders,
  startOccasionCron,
};
