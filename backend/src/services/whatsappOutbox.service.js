/**
 * Tohfa v2 — WhatsApp Outbox & Queue Service
 * File: backend/src/services/whatsappOutbox.service.js
 * Role: Manages persistent outbox storage, atomic dispatch, backoff retries,
 *       status updates, opt-outs, and email fallback.
 *
 * Guarantees:
 * - Every outbound message is recorded in whatsapp_outbox.
 * - If WHATSAPP_ENABLED is false, rows are saved with status 'suppressed' (never sent).
 * - Master test redirect swaps sent_to while preserving intended_to.
 * - Idempotency via UNIQUE(idempotency_key).
 * - Atomic worker claiming using FOR UPDATE SKIP LOCKED.
 * - Never throws exceptions to callers.
 */
'use strict';

const { query } = require('../config/db');
const whatsappConfig = require('../config/whatsapp');
const whatsappCloudService = require('./whatsappCloud.service');
const emailService = require('./email.service');
const { normalizeIndianMobile, getPhone10, maskPhone } = require('../utils/phone');
const ownerNotifyService = require('./ownerNotify.service');

/**
 * Enqueue a message into the WhatsApp outbox
 *
 * @param {object} params
 * @param {'seller_new_order'|'buyer_quote'|'buyer_proof'|'occasion_reminder'|'autoreply'} params.kind
 * @param {string} params.idempotencyKey - Unique key for deduplication
 * @param {string} [params.recipientUserId] - User ID if known
 * @param {string} params.rawPhone - Destination phone number
 * @param {string} [params.templateKey] - Key matching templates in config (e.g. 'new_order')
 * @param {object} [params.variables={}] - Key-value map of template or message variables
 * @param {boolean} [params.requiresMarketingOptIn=false] - Whether explicit consent is required
 * @returns {Promise<{ ok: boolean, duplicate?: boolean, id?: string, status?: string, error?: string }>}
 */
async function enqueue({
  kind,
  idempotencyKey,
  recipientUserId,
  rawPhone,
  templateKey,
  variables = {},
  requiresMarketingOptIn = false,
}) {
  try {
    if (!idempotencyKey) {
      throw new Error('idempotencyKey is required');
    }

    // 1. Phone normalization
    const normalized = normalizeIndianMobile(rawPhone);
    const phone10 = getPhone10(rawPhone);
    const intended_to = normalized || (rawPhone ? String(rawPhone).trim() : null);

    // 2. Redirect check: sent_to is replaced with test redirect if active
    const redirectNumber = whatsappConfig.redirectTo();
    const sent_to = redirectNumber ? redirectNumber : intended_to;

    // 3. Status determination in required order:
    //    invalid_number -> opted_out -> no_consent -> suppressed -> pending
    let status = 'pending';

    if (!normalized) {
      status = 'invalid_number';
    } else {
      // Check opt-out table by 10-digit number
      const { rows: optOutRows } = await query(
        'SELECT 1 FROM whatsapp_opt_outs WHERE phone10 = $1 LIMIT 1',
        [phone10]
      );
      if (optOutRows.length > 0) {
        status = 'opted_out';
      } else if (requiresMarketingOptIn) {
        // Marketing messages require opt-in consent
        let hasConsent = false;
        if (recipientUserId) {
          const { rows: userRows } = await query(
            'SELECT whatsapp_marketing_opt_in FROM users WHERE id = $1',
            [recipientUserId]
          );
          hasConsent = !!userRows[0]?.whatsapp_marketing_opt_in;
        } else {
          const { rows: userRows } = await query(
            'SELECT whatsapp_marketing_opt_in FROM users WHERE phone = $1 OR phone = $2',
            [normalized, phone10]
          );
          hasConsent = !!userRows[0]?.whatsapp_marketing_opt_in;
        }

        if (!hasConsent) {
          status = 'no_consent';
        }
      }
    }

    // If still eligible to send, check mode
    if (status === 'pending') {
      const waMode = whatsappConfig.getMode();
      if (waMode === 'api') {
        status = 'pending';
      } else if (waMode === 'manual') {
        status = 'manual_pending';
      } else {
        status = 'suppressed';
      }
    }

    // 4. Template lookup
    const templateDef = templateKey ? whatsappConfig.templates[templateKey] : null;
    const templateName = templateDef ? templateDef.name : (templateKey || null);

    // 5. Insert into outbox with idempotency conflict handling
    const { rows: insertedRows } = await query(
      `INSERT INTO whatsapp_outbox (
        kind, idempotency_key, recipient_user_id, intended_to, sent_to,
        template_name, variables, status, attempts, next_attempt_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 0, NOW(), NOW(), NOW()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING *`,
      [
        kind,
        idempotencyKey,
        recipientUserId || null,
        intended_to,
        sent_to,
        templateName,
        JSON.stringify(variables || {}),
        status,
      ]
    );

    if (insertedRows.length === 0) {
      // Duplicate conflict — already enqueued
      return { ok: true, duplicate: true };
    }

    const row = insertedRows[0];

    // 6. Best-effort immediate dispatch if pending (non-blocking)
    if (row.status === 'pending') {
      dispatchById(row.id).catch((e) => console.error('[WhatsApp Outbox] Background dispatch error:', e.message));
    } else if (row.status === 'manual_pending') {
      ownerNotifyService.queueTaskEmail(row).catch((e) => console.error('[WhatsApp Outbox] Owner email error:', e.message));
    } else if (row.status === 'invalid_number' && whatsappConfig.getMode() === 'manual') {
      ownerNotifyService.queueInvalidNumberAlert(row).catch((e) => console.error('[WhatsApp Outbox] Invalid number alert error:', e.message));
    }

    return {
      ok: true,
      duplicate: false,
      id: row.id,
      status: row.status,
    };
  } catch (err) {
    console.error(`[WhatsApp Outbox] Enqueue failed for ${maskPhone(rawPhone)} (${kind}):`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Sends a single claimed outbox row
 * @private
 */
async function dispatchClaimedRow(row) {
  try {
    if (!whatsappConfig.isEnabled()) {
      await query(
        `UPDATE whatsapp_outbox SET status = 'suppressed', updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      return { ok: false, suppressed: true };
    }

    let sendResult;

    if (row.kind === 'autoreply') {
      const text = row.variables?.text || '';
      sendResult = await whatsappCloudService.sendText({
        to: row.sent_to,
        text,
      });
    } else {
      // Determine template key from template_name or kind
      const templateKey = Object.keys(whatsappConfig.templates).find(
        (k) => whatsappConfig.templates[k].name === row.template_name
      ) || (row.kind === 'seller_new_order' ? 'new_order' :
            row.kind === 'buyer_quote' ? 'quote' :
            row.kind === 'buyer_proof' ? 'proof' :
            row.kind === 'occasion_reminder' ? 'occasion' : null);

      const templateDef = templateKey ? whatsappConfig.templates[templateKey] : null;
      const bodyParams = templateDef ? templateDef.buildParams(row.variables || {}) : Object.values(row.variables || {});
      const templateName = row.template_name || templateDef?.name;

      sendResult = await whatsappCloudService.sendTemplate({
        to: row.sent_to,
        name: templateName,
        language: whatsappConfig.TEMPLATE_LANG,
        bodyParams,
      });
    }

    if (sendResult.ok) {
      await query(
        `UPDATE whatsapp_outbox
         SET status = 'sent',
             provider_message_id = $1,
             sent_at = NOW(),
             updated_at = NOW(),
             error_code = NULL,
             error_message = NULL
         WHERE id = $2`,
        [sendResult.messageId, row.id]
      );
      return { ok: true, sent: true };
    }

    // Failed send handling
    const maxAttempts = whatsappConfig.MAX_ATTEMPTS;
    if (sendResult.retryable && row.attempts < maxAttempts) {
      // Backoff intervals: attempts 1 -> 1 min, attempts 2 -> 5 min, attempts 3+ -> 30 min
      let backoffInterval = '1 minute';
      if (row.attempts === 2) {
        backoffInterval = '5 minutes';
      } else if (row.attempts >= 3) {
        backoffInterval = '30 minutes';
      }

      await query(
        `UPDATE whatsapp_outbox
         SET status = 'pending',
             next_attempt_at = NOW() + $1::interval,
             error_code = $2,
             error_message = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [backoffInterval, sendResult.errorCode, sendResult.errorMessage, row.id]
      );
      return { ok: false, retried: true };
    }

    // Final failure
    await query(
      `UPDATE whatsapp_outbox
       SET status = 'failed',
           error_code = $1,
           error_message = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [sendResult.errorCode, sendResult.errorMessage, row.id]
    );

    // Email fallback if seller new order notification fails
    if (row.kind === 'seller_new_order' && whatsappConfig.EMAIL_FALLBACK_ENABLED) {
      sendSellerOrderEmailFallback(row).catch((e) => {
        console.error('[WhatsApp Outbox] Email fallback error:', e.message);
      });
    }

    return { ok: false, failed: true };
  } catch (err) {
    console.error(`[WhatsApp Outbox] Error dispatching row ${row.id}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Dispatch a single row by ID
 * @param {string} id - Outbox row UUID
 */
async function dispatchById(id) {
  try {
    const { rows } = await query(
      `UPDATE whatsapp_outbox
       SET status = 'sending', attempts = attempts + 1, updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id]
    );

    if (!rows.length) {
      return { ok: false, reason: 'not_pending_or_already_claimed' };
    }

    return await dispatchClaimedRow(rows[0]);
  } catch (err) {
    console.error(`[WhatsApp Outbox] dispatchById error for ${id}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Process pending outbox messages in batches
 *
 * @param {object} [options]
 * @param {number} [options.limit=25]
 * @returns {Promise<{ processed: number, sent: number, failed: number, retried: number }>}
 */
async function processOutbox({ limit = 25 } = {}) {
  if (whatsappConfig.getMode() !== 'api') {
    return { processed: 0, sent: 0, failed: 0, retried: 0 };
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  try {
    // 1. Reset any rows stuck in 'sending' for more than 10 minutes
    await query(
      `UPDATE whatsapp_outbox
       SET status = 'pending', updated_at = NOW()
       WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '10 minutes'`
    );

    // 2. Claim pending rows atomically using SKIP LOCKED
    const { rows: claimed } = await query(
      `UPDATE whatsapp_outbox
       SET status = 'sending', attempts = attempts + 1, updated_at = NOW()
       WHERE id IN (
         SELECT id FROM whatsapp_outbox
         WHERE status = 'pending' AND next_attempt_at <= NOW()
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [safeLimit]
    );

    let sent = 0;
    let failed = 0;
    let retried = 0;

    for (const row of claimed) {
      const res = await dispatchClaimedRow(row);
      if (res.sent) sent++;
      else if (res.retried) retried++;
      else if (res.failed) failed++;
    }

    return {
      processed: claimed.length,
      sent,
      failed,
      retried,
    };
  } catch (err) {
    console.error('[WhatsApp Outbox] processOutbox error:', err.message);
    return { processed: 0, sent: 0, failed: 0, retried: 0, error: err.message };
  }
}

/**
 * Apply status update from Meta webhook (sent, delivered, read, failed).
 * Guarantees status never moves backwards: read > delivered > sent.
 *
 * @param {object} update
 * @param {string} update.providerMessageId - Meta wamid
 * @param {string} update.status - 'sent'|'delivered'|'read'|'failed'
 * @param {string} [update.errorCode]
 * @param {string} [update.errorMessage]
 * @param {string|number} [update.timestamp]
 */
async function applyStatusUpdate({ providerMessageId, status, errorCode, errorMessage, timestamp }) {
  try {
    if (!providerMessageId) return;

    const { rows } = await query(
      'SELECT id, status, kind, recipient_user_id FROM whatsapp_outbox WHERE provider_message_id = $1',
      [providerMessageId]
    );

    if (!rows.length) return;
    const row = rows[0];

    const precedence = {
      pending: 1,
      sending: 2,
      sent: 3,
      delivered: 4,
      read: 5,
    };

    const currentRank = precedence[row.status] || 0;
    const targetRank = precedence[status] || 0;

    const eventDate = timestamp ? new Date(Number(timestamp) * 1000) : new Date();

    if (status === 'read') {
      await query(
        `UPDATE whatsapp_outbox
         SET status = 'read',
             delivered_at = COALESCE(delivered_at, $1),
             updated_at = NOW()
         WHERE id = $2`,
        [eventDate, row.id]
      );
    } else if (status === 'delivered') {
      if (currentRank < precedence.delivered) {
        await query(
          `UPDATE whatsapp_outbox
           SET status = 'delivered',
               delivered_at = COALESCE(delivered_at, $1),
               updated_at = NOW()
           WHERE id = $2`,
          [eventDate, row.id]
        );
      } else {
        await query(
          `UPDATE whatsapp_outbox
           SET delivered_at = COALESCE(delivered_at, $1),
               updated_at = NOW()
           WHERE id = $2`,
          [eventDate, row.id]
        );
      }
    } else if (status === 'sent') {
      if (currentRank < precedence.sent) {
        await query(
          `UPDATE whatsapp_outbox
           SET status = 'sent',
               sent_at = COALESCE(sent_at, $1),
               updated_at = NOW()
           WHERE id = $2`,
          [eventDate, row.id]
        );
      }
    } else if (status === 'failed') {
      await query(
        `UPDATE whatsapp_outbox
         SET status = 'failed',
             error_code = COALESCE($1, error_code),
             error_message = COALESCE($2, error_message),
             updated_at = NOW()
         WHERE id = $3`,
        [errorCode ? String(errorCode) : null, errorMessage ? String(errorMessage).slice(0, 500) : null, row.id]
      );

      if (row.kind === 'seller_new_order' && whatsappConfig.EMAIL_FALLBACK_ENABLED) {
        sendSellerOrderEmailFallback(row).catch((e) => {
          console.error('[WhatsApp Outbox] Email fallback on status failure error:', e.message);
        });
      }
    }
  } catch (err) {
    console.error(`[WhatsApp Outbox] applyStatusUpdate error for ${providerMessageId}:`, err.message);
  }
}

/**
 * Add phone number to opt-out registry
 * @param {string|number} rawPhone
 */
async function addOptOut(rawPhone) {
  try {
    const phone10 = getPhone10(rawPhone);
    if (!phone10) return false;
    await query(
      `INSERT INTO whatsapp_opt_outs (phone10, opted_out_at)
       VALUES ($1, NOW())
       ON CONFLICT (phone10) DO UPDATE SET opted_out_at = NOW()`,
      [phone10]
    );
    console.log(`[WhatsApp Outbox] Opted out: ***${phone10.slice(-4)}`);
    return true;
  } catch (err) {
    console.error('[WhatsApp Outbox] addOptOut error:', err.message);
    return false;
  }
}

/**
 * Remove phone number from opt-out registry
 * @param {string|number} rawPhone
 */
async function removeOptOut(rawPhone) {
  try {
    const phone10 = getPhone10(rawPhone);
    if (!phone10) return false;
    await query('DELETE FROM whatsapp_opt_outs WHERE phone10 = $1', [phone10]);
    console.log(`[WhatsApp Outbox] Opted in: ***${phone10.slice(-4)}`);
    return true;
  } catch (err) {
    console.error('[WhatsApp Outbox] removeOptOut error:', err.message);
    return false;
  }
}

/**
 * Send fallback email to seller when WhatsApp notification fails
 * @private
 */
async function sendSellerOrderEmailFallback(outboxRow) {
  try {
    if (!outboxRow.recipient_user_id) return;
    const { rows } = await query('SELECT email, name FROM users WHERE id = $1', [outboxRow.recipient_user_id]);
    if (!rows.length || !rows[0].email) return;

    const sellerEmail = rows[0].email;
    const orderId = outboxRow.variables?.orderId || 'Order';
    const shortId = String(orderId).slice(0, 8);

    const subject = `[Tohfa Studio] New Order #${shortId} Received!`;
    const text = `New order on Tohfa!\n\nOrder #${shortId} has been confirmed.\nPlease view details and update fulfillment status here: https://thetohfa.in/seller/orders.html\n\n— Team Tohfa`;
    const html = `<p>New order on Tohfa!</p><p>Order <strong>#${shortId}</strong> has been confirmed.</p><p><a href="https://thetohfa.in/seller/orders.html">View and update it here</a></p><p>— Team Tohfa</p>`;

    await emailService.sendMail(sellerEmail, subject, html, text);
    console.log(`[WhatsApp Outbox] Seller fallback email sent to ${sellerEmail} for order ${shortId}`);
  } catch (err) {
    console.error('[WhatsApp Outbox] Seller fallback email error:', err.message);
  }
}

module.exports = {
  enqueue,
  dispatchById,
  processOutbox,
  applyStatusUpdate,
  addOptOut,
  removeOptOut,
  processManualQueue: ownerNotifyService.processManualQueue,
};
