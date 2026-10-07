/**
 * Tohfa v2 — Webhook Controller
 * File: backend/src/controllers/webhook.controller.js
 * Role: Receives and cryptographically verifies Razorpay webhook events.
 */
'use strict';

const crypto = require('crypto');
const { query, getClient } = require('../config/db');
const paymentService = require('../services/payment.service');
const logisticsService = require('../services/logistics.service');
const whatsappService = require('../services/whatsapp.service');
const bestsellerService = require('../services/bestseller.service');
const whatsappCloudService = require('../services/whatsappCloud.service');
const whatsappConfig = require('../config/whatsapp');
const whatsappOutboxService = require('../services/whatsappOutbox.service');
const emailService = require('../services/email.service');
const ownerNotifyService = require('../services/ownerNotify.service');
const razorpay = require('../config/razorpay');

function getPhone10(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return null;
}

function maskPhone(phone) {
  if (!phone) return '***';
  const str = String(phone);
  if (str.length <= 4) return '***';
  return '***' + str.slice(-4);
}

async function handleRazorpayWebhook(req, res) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const primarySecret = process.env.RAZORPAY_PRIMARY_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;
    const secondarySecret = process.env.RAZORPAY_SECONDARY_WEBHOOK_SECRET;

    if (!signature || (!primarySecret && !secondarySecret)) {
      return res.status(400).json({ status: 'error', message: 'Webhook secret or signature missing' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    
    let isValid = false;
    let matchedAccount = 'primary';

    if (primarySecret && paymentService.verifyHmacSignature(rawBody, signature, primarySecret)) {
      isValid = true;
      matchedAccount = 'primary';
    } else if (secondarySecret && paymentService.verifyHmacSignature(rawBody, signature, secondarySecret)) {
      isValid = true;
      matchedAccount = 'secondary';
    }

    if (!isValid) {
      console.error('[Webhook] Invalid Razorpay webhook signature across all configured accounts');
      return res.status(400).json({ status: 'error', message: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody);

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const paymentEntity = event.payload?.payment?.entity || {};
      const razorpayOrderId = paymentEntity.order_id;
      const razorpayPaymentId = paymentEntity.id;

      if (razorpayOrderId) {
        const client = await getClient();
        try {
          await client.query('BEGIN');

          // Find payment record
          const { rows: payRows } = await client.query(
            `SELECT order_id, status FROM payments WHERE razorpay_order_id = $1`,
            [razorpayOrderId]
          );

          let orderId = payRows[0]?.order_id;
          if (!orderId && paymentEntity.notes?.order_id) {
            orderId = paymentEntity.notes.order_id;
          }

          if (orderId) {
            const result = await paymentService.markOrderPaid(
              orderId,
              { razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId, gateway_account: matchedAccount },
              client
            );

            await client.query('COMMIT');

            if (result.alreadyProcessed) {
              return res.status(200).json({ status: 'ok', alreadyProcessed: true });
            }

            const confirmedOrder = result.order;

            // Async post-commit triggers
            logisticsService.createShipment(confirmedOrder, { fromPayment: true }).catch(e => console.error('[Webhook Logistics]:', e.message));
            bestsellerService.recomputeForOrder(confirmedOrder.id).catch(e => console.error('[Webhook Bestseller Error]:', e.message));

            // Send Order Confirmation Email to Buyer (awaited inside try/catch so webhook execution never crashes)
            (async () => {
              try {
                const [buyerRes, itemsRes] = await Promise.all([
                  query('SELECT email, name FROM users WHERE id = $1', [confirmedOrder.buyer_id]),
                  query(
                    `SELECT COALESCE(p.name, 'Handcrafted Gift') AS name, oi.quantity
                     FROM order_items oi
                     LEFT JOIN products p ON p.id = oi.product_id
                     WHERE oi.order_id = $1`,
                    [confirmedOrder.id]
                  ),
                ]);
                const buyer = buyerRes.rows[0] || {};
                const recipientEmail = buyer.email;
                if (recipientEmail) {
                  await emailService.sendOrderConfirmationEmail(recipientEmail, {
                    orderId: String(confirmedOrder.id).slice(0, 8),
                    buyerName: buyer.name || 'Customer',
                    totalAmount: confirmedOrder.total_amount,
                    items: itemsRes.rows || [],
                  });
                }
              } catch (emailErr) {
                console.error('[Webhook] Order confirmation email error:', emailErr.message);
              }
            })();

            // Notify seller(s) via WhatsApp and trigger admin alert if special order
            (async () => {
              try {
                let buyerName = 'Customer';
                if (confirmedOrder.buyer_id) {
                  const { rows: bRows } = await query('SELECT name FROM users WHERE id = $1', [confirmedOrder.buyer_id]);
                  if (bRows.length && bRows[0].name) {
                    buyerName = bRows[0].name;
                  }
                }

                const { rows: sellerOrderRows } = await query(
                  `SELECT so.id AS seller_order_id,
                          so.seller_id,
                          so.subtotal,
                          u.name,
                          COALESCE(sp.whatsapp_number, s.whatsapp_number, u.phone) AS whatsapp_number,
                          (COALESCE(sp.is_admin_managed::text, s.is_admin_managed::text, 'false') IN ('true', 't', '1')) AS is_admin_managed,
                          COALESCE(sp.store_name, s.store_name, u.name) AS store_name
                   FROM seller_orders so
                   JOIN users u ON u.id = so.seller_id
                   LEFT JOIN seller_profiles sp ON sp.user_id = u.id
                   LEFT JOIN sellers s ON s.user_id = u.id
                   WHERE so.order_id = $1`,
                  [confirmedOrder.id]
                );

                let sellersToNotify = sellerOrderRows;

                if (!sellersToNotify.length && confirmedOrder.seller_id) {
                  const { rows: fallbackRows } = await query(
                    `SELECT NULL AS seller_order_id,
                            u.id AS seller_id,
                            $2::numeric AS subtotal,
                            u.name,
                            COALESCE(sp.whatsapp_number, s.whatsapp_number, u.phone) AS whatsapp_number,
                            (COALESCE(sp.is_admin_managed::text, s.is_admin_managed::text, 'false') IN ('true', 't', '1')) AS is_admin_managed,
                            COALESCE(sp.store_name, s.store_name, u.name) AS store_name
                     FROM users u
                     LEFT JOIN seller_profiles sp ON sp.user_id = u.id
                     LEFT JOIN sellers s ON s.user_id = u.id
                     WHERE u.id = $1`,
                    [confirmedOrder.seller_id, confirmedOrder.total_amount]
                  );
                  sellersToNotify = fallbackRows;
                }

                for (const seller of sellersToNotify) {
                  if (seller.whatsapp_number) {
                    whatsappService.sendSellerOrderNotification(seller.whatsapp_number, {
                      orderId: confirmedOrder.id,
                      sellerOrderId: seller.seller_order_id || null,
                      sellerId: seller.seller_id,
                      recipientUserId: seller.seller_id,
                      buyerName,
                      amount: seller.subtotal || confirmedOrder.total_amount,
                    }).catch(e => console.error('[Webhook WhatsApp]:', e.message));
                  }

                  if (seller.is_admin_managed) {
                    await ownerNotifyService.sendAdminAlertEmail('special_order', {
                      id: confirmedOrder.id,
                      orderId: String(confirmedOrder.id).slice(0, 8),
                      shopName: seller.store_name || seller.name || 'Special Shop',
                      buyerName,
                      amount: seller.subtotal || confirmedOrder.total_amount,
                      link: 'https://thetohfa.in/admin/special-orders.html',
                    }).catch(() => {});
                  }
                }
              } catch (err) {
                console.error('[Webhook Seller Lookup Error]:', err.message);
              }
            })();

            // In-app notification for buyer
            query(
              `INSERT INTO notifications (user_id, type, title, body, meta)
               VALUES ($1, 'order_confirmed', 'Order Confirmed!', $2, $3)`,
              [
                confirmedOrder.buyer_id,
                `Your payment for Order #${String(confirmedOrder.id).slice(0, 8)} was successful. The artisan has started preparing it.`,
                JSON.stringify({ orderId: confirmedOrder.id }),
              ]
            ).catch(() => {});

            // In-app notification for seller(s)
            query(
              `SELECT seller_id, id AS seller_order_id FROM seller_orders WHERE order_id = $1`,
              [confirmedOrder.id]
            ).then(({ rows: sOrders }) => {
              sOrders.forEach(so => {
                query(
                  `INSERT INTO notifications (user_id, type, title, body, meta)
                   VALUES ($1, 'new_order', 'New Order Received! 🎁', $2, $3)`,
                  [
                    so.seller_id,
                    `You have a confirmed sub-order #${String(so.seller_order_id).slice(0, 8)} in Order #${String(confirmedOrder.id).slice(0, 8)}.`,
                    JSON.stringify({ order_id: confirmedOrder.id, seller_order_id: so.seller_order_id })
                  ]
                ).catch(() => {});
              });
            }).catch(() => {});
          } else {
            await client.query('COMMIT');
          }
        } catch (dbErr) {
          try {
            await client.query('ROLLBACK');
          } catch (_) {}
          throw dbErr;
        } finally {
          client.release();
        }
      }
    }

    // Handle Razorpay Linked Account / Fund Account verification events asynchronously
    // CRITICAL: Strictly isolated — NEVER overwrites or clears billing_address or pickup_address.
    if (typeof event.event === 'string' && (event.event.startsWith('account.') || event.event.startsWith('fund_account.'))) {
      const accountEntity = event.payload?.account?.entity || event.payload?.fund_account?.entity || {};
      const refSellerId = accountEntity.reference_id || accountEntity.notes?.seller_id;
      const razorpayAccountId = accountEntity.id || null;
      const verificationStatus = accountEntity.status || event.event;

      if (refSellerId) {
        query(
          `UPDATE seller_profiles
           SET bank_details = COALESCE(bank_details, '{}'::jsonb) || jsonb_build_object(
                 'razorpay_account_id', COALESCE($1::text, bank_details->>'razorpay_account_id'),
                 'razorpay_verification_status', $2::text,
                 'razorpay_verified_at', NOW()::text
               ),
               updated_at = NOW()
           WHERE user_id::text = $3::text`,
          [razorpayAccountId, verificationStatus, String(refSellerId)]
        ).catch(e => console.warn('[Webhook Account Sync Notice]:', e.message));
      }
    }

    // Handle Razorpay Payout settlement events asynchronously
    if (typeof event.event === 'string' && event.event.startsWith('payout.')) {
      const payoutEntity = event.payload?.payout?.entity || {};
      const payoutRef = payoutEntity.reference_id || payoutEntity.id;
      const utr = payoutEntity.utr || null;
      const mappedStatus = event.event === 'payout.processed'
        ? 'settled'
        : (event.event === 'payout.failed' || event.event === 'payout.reversed' ? 'failed' : 'processing');

      if (payoutRef) {
        query(
          `UPDATE seller_payouts
           SET status = $1,
               utr_number = COALESCE($2, utr_number),
               disbursed_at = CASE WHEN $1 = 'settled' THEN COALESCE(disbursed_at, NOW()) ELSE disbursed_at END,
               updated_at = NOW()
           WHERE reference = $3 OR id::text = $3::text`,
          [mappedStatus, utr, String(payoutRef)]
        ).catch(e => console.warn('[Webhook Payout Sync Notice]:', e.message));
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[Webhook Error]:', err.message);
    return res.status(500).send('Internal Server Error');
  }
}


function verifyWhatsAppWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = whatsappConfig.VERIFY_TOKEN;

  if (mode === 'subscribe' && token && expectedToken) {
    const bufA = Buffer.from(String(token));
    const bufB = Buffer.from(String(expectedToken));
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      return res.status(200).send(challenge);
    }
  }
  return res.sendStatus(403);
}

function receiveWhatsAppEvent(req, res) {
  const signatureHeader = req.headers['x-hub-signature-256'];
  const appSecret = whatsappConfig.APP_SECRET;

  if (!appSecret || !signatureHeader || typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) {
    return res.status(401).send('Unauthorized: Missing or invalid signature');
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

  const expectedHmac = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  const bufSig = Buffer.from(signatureHeader);
  const bufExpected = Buffer.from(expectedHmac);

  if (bufSig.length !== bufExpected.length || !crypto.timingSafeEqual(bufSig, bufExpected)) {
    return res.status(401).send('Unauthorized: Signature mismatch');
  }

  // Signature is valid: acknowledge with 200 immediately
  res.status(200).send('EVENT_RECEIVED');

  // If master flag is OFF, acknowledge and stop
  if (!whatsappConfig.isEnabled()) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('[WhatsApp Webhook] Invalid JSON payload received:', err.message);
    return;
  }

  try {
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const val = change.value;
        if (!val) continue;

        // 1. Status updates
        const statuses = Array.isArray(val.statuses) ? val.statuses : [];
        for (const st of statuses) {
          console.log(`[WhatsApp Webhook] Status update: ${st.status} for msg ${maskPhone(st.id)}`);
          whatsappOutboxService.applyStatusUpdate({
            providerMessageId: st.id,
            status: st.status,
            errorCode: st.errors?.[0]?.code,
            errorMessage: st.errors?.[0]?.message || st.errors?.[0]?.title,
            timestamp: st.timestamp,
          });
        }

        // 2. Inbound messages
        const messages = Array.isArray(val.messages) ? val.messages : [];
        const metadata = val.metadata;
        const selfPhone = metadata?.display_phone_number;

        for (const msg of messages) {
          // Ignore messages sent by own number
          if (selfPhone && msg.from === selfPhone) continue;

          if (msg.type === 'text') {
            const rawText = msg.text?.body?.trim() || '';
            const cleaned = rawText.toUpperCase();

            console.log(`[WhatsApp Webhook] Inbound text from ${maskPhone(msg.from)}`);

            if (cleaned === 'STOP' || cleaned === 'UNSUBSCRIBE') {
              whatsappOutboxService.addOptOut(msg.from);
            } else if (cleaned === 'START') {
              whatsappOutboxService.removeOptOut(msg.from);
            } else if (whatsappConfig.AUTOREPLY_ENABLED) {
              const phone10 = getPhone10(msg.from);
              if (phone10) {
                // Today's date in IST
                const nowIST = new Date(Date.now() + 5.5 * 3600 * 1000);
                const dateKey = nowIST.toISOString().slice(0, 10);
                const idempotencyKey = `autoreply:${phone10}:${dateKey}`;
                const autoReplyText = "Thanks for messaging Tohfa! We've received your message and will get back to you soon.";

                whatsappOutboxService.enqueue({
                  kind: 'autoreply',
                  idempotencyKey,
                  rawPhone: msg.from,
                  variables: { text: autoReplyText },
                  requiresMarketingOptIn: false,
                }).catch((e) => console.error('[WhatsApp Autoreply Error]:', e.message));
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp Webhook Event Error]:', err.message);
  }
}

module.exports = {
  handleRazorpayWebhook,
  verifyWhatsAppWebhook,
  receiveWhatsAppEvent,
};

