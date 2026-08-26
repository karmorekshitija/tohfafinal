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

async function handleRazorpayWebhook(req, res) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret || !signature) {
      return res.status(400).send('Webhook secret or signature missing');
    }

    const rawBody = req.body.toString('utf8');
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.error('[Webhook] Invalid Razorpay webhook signature');
      return res.status(400).send('Invalid signature');
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
              { razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId },
              client
            );

            await client.query('COMMIT');

            if (result.alreadyProcessed) {
              return res.status(200).json({ status: 'ok', alreadyProcessed: true });
            }

            const confirmedOrder = result.order;

            // Async post-commit triggers
            logisticsService.createShipment(confirmedOrder).catch(e => console.error('[Webhook Logistics]:', e.message));

            query(
              'SELECT whatsapp_number FROM seller_profiles WHERE user_id = $1',
              [confirmedOrder.seller_id]
            ).then(({ rows: sRows }) => {
              if (sRows.length && sRows[0].whatsapp_number) {
                whatsappService.sendSellerOrderNotification(sRows[0].whatsapp_number, {
                  orderId: confirmedOrder.id,
                  buyerName: 'Customer',
                  amount: confirmedOrder.total_amount,
                }).catch(e => console.error('[Webhook WhatsApp]:', e.message));
              }
            }).catch(e => console.error('[Webhook Seller Lookup Error]:', e.message));
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


    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[Webhook Error]:', err.message);
    return res.status(500).send('Internal Server Error');
  }
}

module.exports = {
  handleRazorpayWebhook,
};
