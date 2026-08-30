/**
 * Tohfa v2 — Logistics Controller
 * File: backend/src/controllers/logistics.controller.js
 * Role: Tracking order dispatches, checking delivery pincode serviceability,
 *       and manually initiating shipment creation.
 */
'use strict';

const logisticsService = require('../services/logistics.service');
const { query } = require('../config/db');

/**
 * GET /api/logistics/serviceability?pincode=XXXXXX
 * Public endpoint to verify courier delivery availability and estimated days
 */
async function checkServiceability(req, res, next) {
  try {
    const pincode = req.query.pincode || req.query.pin;

    if (!pincode || typeof pincode !== 'string' || !pincode.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Pincode query parameter is required (e.g. /api/logistics/serviceability?pincode=302001).',
      });
    }

    const cleanPin = pincode.trim();
    if (!/^\d{6}$/.test(cleanPin)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pincode format. Indian postal codes must be 6 digits.',
      });
    }

    const weight = req.query.weight ? Number(req.query.weight) : 500;
    const pickupPincode = req.query.pickup_pincode || req.query.origin;
    const productId = req.query.product_id || req.query.productId;
    let prepDays = req.query.preparation_days !== undefined ? Number(req.query.preparation_days) : null;

    if (prepDays === null && productId) {
      try {
        const { rows } = await query(
          'SELECT preparation_days, weight_grams FROM products WHERE id = $1',
          [productId]
        );
        if (rows.length > 0 && rows[0].preparation_days !== null && rows[0].preparation_days !== undefined) {
          prepDays = Number(rows[0].preparation_days);
        }
      } catch (dbErr) {
        // Table fallback
      }
    }

    if (prepDays === null || isNaN(prepDays)) {
      prepDays = 2; // Default 2 artisan preparation days
    }

    const result = await logisticsService.checkServiceability(cleanPin, {
      weight,
      pickup_pincode: pickupPincode,
      preparation_days: prepDays,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/logistics/track/:trackingId
 */
async function trackShipment(req, res, next) {
  try {
    const { trackingId } = req.params;
    const result = await logisticsService.trackShipment(trackingId);
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/logistics/ship/:orderId
 * Seller/Admin manually triggers shipment dispatch
 */
async function shipOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const sellerId = req.user.id;

    const { rows } = await query(
      `SELECT * FROM orders WHERE id = $1 AND (seller_id = $2 OR $3 = 'admin')`,
      [orderId, sellerId, req.user.role]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = rows[0];

    const eligible = await logisticsService.isEligibleForIThink(order.seller_id);
    if (!eligible) {
      await query(
        `UPDATE orders SET notes = CASE WHEN notes ILIKE '%Manual/Admin Fulfillment%' THEN notes ELSE COALESCE(notes, '') || ' [Manual/Admin Fulfillment Required]' END, updated_at = NOW() WHERE id = $1`,
        [order.id]
      ).catch(() => {});

      return res.json({
        success: true,
        data: {
          manual_fulfillment_required: true,
          message: 'Order belongs to a Tohfa Special / Admin-managed shop. Manual or admin fulfillment is required; automated courier waybill is skipped.',
          order,
        },
      });
    }

    const dispatchResult = await logisticsService.createShipment(order);

    return res.json({
      success: true,
      data: {
        message: 'Shipment processed.',
        details: dispatchResult,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/logistics/generate-awb
 * or POST /api/logistics/orders/:id/awb
 */
async function generateAWB(req, res, next) {
  try {
    const orderId = req.params.id || req.params.orderId || req.body.orderId || req.body.sellerOrderId || req.body.order_id;
    const sellerId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required to generate an AWB.' });
    }

    const { rows } = await query(
      'SELECT * FROM orders WHERE id = $1' + (isAdmin ? '' : ' AND seller_id = $2'),
      isAdmin ? [orderId] : [orderId, sellerId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
    }

    const order = rows[0];
    const eligible = await logisticsService.isEligibleForIThink(order.seller_id);
    if (!eligible) {
      await query(
        `UPDATE orders SET notes = CASE WHEN notes ILIKE '%Manual/Admin Fulfillment%' THEN notes ELSE COALESCE(notes, '') || ' [Manual/Admin Fulfillment Required]' END, updated_at = NOW() WHERE id = $1`,
        [order.id]
      ).catch(() => {});

      return res.json({
        success: true,
        message: 'Order belongs to a Tohfa Special / Admin-managed shop. Manual courier dispatch is required.',
        data: {
          manual_fulfillment_required: true,
          order,
          label_url: `/api/logistics/label/${order.id}`,
        }
      });
    }

    const result = await logisticsService.generateSellerAWB(orderId, isAdmin ? null : sellerId);

    return res.json({
      success: true,
      message: 'AWB and dispatch manifest generated successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/logistics/label/:sellerOrderId
 * or GET /api/logistics/orders/:id/label
 */
async function getShippingLabel(req, res, next) {
  try {
    const orderId = req.params.sellerOrderId || req.params.id || req.params.orderId;
    const sellerId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required.' });
    }

    const labelData = await logisticsService.getShippingLabel(orderId, isAdmin ? null : sellerId);

    // If query requests HTML preview
    if (req.query.format === 'html') {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Shipping Label - ${labelData.order_ref}</title>
          <style>
            body { font-family: monospace, sans-serif; padding: 24px; max-width: 500px; margin: auto; border: 2px dashed #333; }
            h2 { margin: 0 0 10px 0; }
            .section { margin-bottom: 16px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
            .barcode { font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; margin: 16px 0; }
          </style>
        </head>
        <body>
          <h2>TOHFA ARTISAN LOGISTICS</h2>
          <div class="barcode">|||| |||||| |||| |||||</div>
          <div class="section">
            <strong>AWB / Tracking:</strong> ${labelData.tracking_id}<br/>
            <strong>Order Ref:</strong> ${labelData.order_ref}
          </div>
          <div class="section">
            <strong>Deliver To:</strong><br/>
            ${labelData.delivery_address.recipient_name}<br/>
            ${labelData.delivery_address.line1} ${labelData.delivery_address.line2}<br/>
            ${labelData.delivery_address.city}, ${labelData.delivery_address.state} - ${labelData.delivery_address.pincode}<br/>
            Phone: ${labelData.delivery_address.phone}
          </div>
          <div class="section">
            <strong>From (Artisan Workshop):</strong><br/>
            ${labelData.pickup_address.store_name} (${labelData.pickup_address.contact_name})<br/>
            ${labelData.pickup_address.line1} ${labelData.pickup_address.line2}<br/>
            ${labelData.pickup_address.city}, ${labelData.pickup_address.state} - ${labelData.pickup_address.pincode}<br/>
            Phone: ${labelData.pickup_address.phone}
          </div>
        </body>
        </html>
      `;
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }

    return res.json({
      success: true,
      data: {
        label: labelData,
        label_url: `/api/logistics/label/${orderId}`,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  checkServiceability,
  trackShipment,
  shipOrder,
  generateAWB,
  getShippingLabel,
};


