/**
 * Tohfa v2 — Logistics Integration Service
 * File: backend/src/services/logistics.service.js
 * Role: Integrates with iThink Logistics API for automated waybill creation,
 *       multi-origin seller fulfillment, real-time pincode serviceability checks,
 *       and parcel tracking across regular and Tohfa Special / admin-managed shops.
 */
'use strict';

const { ithinkRequest, isIThinkEnabled } = require('../config/ithink');
const { query } = require('../config/db');
const { createNotification } = require('../controllers/notification.controller');
let ownerNotifyService = null;
try {
  ownerNotifyService = require('./ownerNotify.service');
} catch (_) {}

/**
 * Resolves the pickup address for a seller.
 * Uses the seller's own pickup_address if present and complete.
 * If the seller is admin-managed and has none, falls back to the Tohfa warehouse address from env vars.
 * If neither exists, throws a 400 error.
 *
 * @param {Object} seller - Seller profile record
 * @returns {Object} normalized pickup address
 */
function resolvePickupAddress(seller) {
  let pickup = null;
  if (seller && seller.pickup_address) {
    if (typeof seller.pickup_address === 'object') {
      pickup = seller.pickup_address;
    } else if (typeof seller.pickup_address === 'string') {
      try {
        pickup = JSON.parse(seller.pickup_address);
      } catch {
        pickup = null;
      }
    }
  }

  const pickupLine1 = pickup && (pickup.line1 || pickup.address || pickup.street);
  const pickupCity = pickup && pickup.city;
  const pickupPincode = pickup && (pickup.pincode || pickup.postal_code || pickup.zip);

  if (pickupLine1 && pickupCity && pickupPincode) {
    return {
      store_name: seller?.store_name || seller?.name || 'Tohfa Artisan Workshop',
      contact_name: pickup.contact_name || seller?.name || seller?.store_name || 'Tohfa Artisan',
      phone: pickup.contact_phone || seller?.whatsapp_number || seller?.store_phone || seller?.phone || '',
      line1: pickupLine1,
      line2: pickup.line2 || '',
      city: pickupCity,
      state: pickup.state || '',
      pincode: String(pickupPincode).trim(),
    };
  }

  const isAdminManaged = Boolean(
    seller && (
      seller.is_admin_managed === true ||
      seller.is_admin_managed === 'true' ||
      seller.is_admin_managed === 1 ||
      seller.is_admin_managed === '1' ||
      seller.is_admin_managed === 't'
    )
  );

  if (isAdminManaged) {
    const warehouseLine1 = process.env.TOHFA_WAREHOUSE_LINE1;
    const warehouseCity = process.env.TOHFA_WAREHOUSE_CITY;
    const warehousePincode = process.env.TOHFA_WAREHOUSE_PINCODE;

    if (warehouseLine1 && warehouseCity && warehousePincode) {
      return {
        store_name: process.env.TOHFA_WAREHOUSE_NAME || seller?.store_name || 'Tohfa Special',
        contact_name: process.env.TOHFA_WAREHOUSE_NAME || seller?.store_name || 'Tohfa Central Fulfillment',
        phone: process.env.TOHFA_WAREHOUSE_PHONE || seller?.whatsapp_number || seller?.store_phone || seller?.phone || '',
        line1: warehouseLine1,
        line2: process.env.TOHFA_WAREHOUSE_LINE2 || '',
        city: warehouseCity,
        state: process.env.TOHFA_WAREHOUSE_STATE || '',
        pincode: String(warehousePincode).trim(),
      };
    }
  }

  const err = new Error('Pickup & return address is required before generating a shipping label. Please configure your pickup address in Store Settings.');
  err.status = 400;
  throw err;
}

/**
 * Create a shipment booking via iThink Logistics (Multi-Origin Fulfillment)
 * Dynamically queries the seller's verified pickup_address from seller_profiles
 * or Tohfa central warehouse for admin-managed shops.
 * 
 * Rules:
 * 1. Both regular and Tohfa Special shops are fulfilled automatically via iThink.
 * 2. If tracking_id already exists, returns existing tracking idempotently.
 * 3. Never produces mock tracking numbers in production.
 * 4. Errors leave order status unchanged, record shipment_error, and notify admin.
 *
 * @param {Object|string} orderOrId - Full order record or order ID
 * @param {Object} [options] - Booking options (e.g. fromPayment: boolean)
 * @returns {Promise<Object>}
 */
async function createShipment(orderOrId, options = {}) {
  let order = orderOrId;
  if (!order || typeof order === 'string' || typeof order === 'number') {
    const { rows: orderRows } = await query('SELECT * FROM orders WHERE id = $1', [orderOrId]);
    if (!orderRows.length) {
      const err = new Error('Invalid order provided for shipment.');
      err.status = 404;
      throw err;
    }
    order = orderRows[0];
  }

  if (!order || !order.seller_id) {
    const err = new Error('Invalid order: missing seller identifier.');
    err.status = 400;
    throw err;
  }

  // 1. IDEMPOTENCY: If order already has a tracking ID from iThink, return it immediately
  if (order.tracking_id) {
    console.log(`[iThink] Order ${order.id} already has tracking ID ${order.tracking_id}. Returning existing shipment.`);
    return {
      success: true,
      idempotent: true,
      waybill: order.tracking_id,
      tracking_id: order.tracking_id,
      tracking_url: order.tracking_url || `https://ithinklogistics.com/track/${encodeURIComponent(order.tracking_id)}`,
      courier: order.courier || 'iThink Logistics',
      order,
    };
  }

  // 2. BOOKING TIMING CHECK: If invoked from payment verification and auto-book on payment is disabled
  if (options.fromPayment && process.env.ITHINK_AUTO_BOOK_ON_PAYMENT !== 'true') {
    console.log(`[iThink] Order ${order.id} payment confirmed. Courier booking deferred until artisan packs the order in Seller Studio.`);
    return {
      success: true,
      deferred: true,
      message: 'Courier booking deferred until order is packed.',
      order,
    };
  }

  // 3. FEATURE FLAG CHECK
  const isEnabled = isIThinkEnabled();
  const isDevMock = (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) && process.env.MOCK_LOGISTICS === 'true';

  if (!isEnabled && !isDevMock) {
    const err = new Error('iThink Logistics integration is currently disabled (ITHINK_ENABLED=false). Manual tracking entry is required.');
    err.status = 503;
    err.code = 'ITHINK_DISABLED';
    throw err;
  }

  // Fetch delivery address
  const { rows: addrRows } = await query(
    'SELECT * FROM addresses WHERE id = $1',
    [order.address_id]
  );
  const address = addrRows[0] || {};

  // Fetch seller store details & multi-origin pickup address
  const { rows: sellerRows } = await query(
    `SELECT u.name, u.phone,
            COALESCE(sp.store_name, sel.store_name, u.name) AS store_name,
            COALESCE(sp.whatsapp_number, sel.whatsapp_number, u.phone) AS whatsapp_number,
            COALESCE(sp.pickup_address, sel.pickup_address) AS pickup_address,
            COALESCE(sp.seller_type, sel.seller_type) AS seller_type,
            (COALESCE(sp.is_admin_managed::text, sel.is_admin_managed::text, 'false') IN ('true', 't', '1')) AS is_admin_managed
     FROM users u 
     LEFT JOIN seller_profiles sp ON sp.user_id = u.id 
     LEFT JOIN sellers sel ON (sel.user_id = u.id OR sel.id = u.id)
     WHERE u.id = $1`,
    [order.seller_id]
  );

  if (!sellerRows.length) {
    const err = new Error('Seller profile not found.');
    err.status = 404;
    throw err;
  }

  const seller = sellerRows[0];
  const pickup = resolvePickupAddress(seller);

  let trackingId = null;
  let courierName = 'iThink Logistics';
  let logisticsResponse = null;

  // 4. CALL ITHINK API (Or DEV MOCK IF EXPLICITLY ENABLED IN DEV)
  if (isEnabled) {
    try {
      // TODO(verify against iThink docs): Confirm exact payload parameter names & warehouse address handling
      const payload = {
        order_id: String(order.order_ref || order.id),
        order_reference_id: String(order.id),
        payment_method: order.payment_status === 'paid' ? 'prepaid' : 'cod',
        total_amount: Number(order.total_amount) || 0,
        customer_name: address.name || address.full_name || 'Customer',
        customer_phone: address.phone || '',
        customer_address: `${address.line1 || ''} ${address.line2 || ''}`.trim(),
        customer_city: address.city || '',
        customer_state: address.state || '',
        customer_pincode: address.pincode || '',
        pickup_store_name: pickup.store_name || seller.store_name || seller.name || 'Tohfa Artisan Workshop',
        pickup_name: pickup.contact_name,
        pickup_phone: pickup.phone,
        pickup_address: `${pickup.line1} ${pickup.line2 || ''}`.trim(),
        pickup_city: pickup.city,
        pickup_state: pickup.state || '',
        pickup_pincode: pickup.pincode,
        weight_in_grams: 500,
      };

      // TODO(verify against iThink docs): Check endpoint path /order/add.json vs /order/add
      logisticsResponse = await ithinkRequest('/order/add.json', 'POST', payload)
        .catch(() => ithinkRequest('/order/add', 'POST', payload));

      trackingId = logisticsResponse.waybill || 
                   logisticsResponse.tracking_id || 
                   logisticsResponse.awb_number || 
                   logisticsResponse.data?.awb_number ||
                   logisticsResponse.data?.[0]?.awb_number;

      courierName = logisticsResponse.courier_name || 
                    logisticsResponse.data?.courier_name || 
                    logisticsResponse.data?.[0]?.courier_name || 
                    'iThink Logistics';

      if (!trackingId) {
        const errorMsg = logisticsResponse.message || logisticsResponse.html_message || 'iThink Logistics did not return an AWB / waybill identifier.';
        throw new Error(errorMsg);
      }
    } catch (apiErr) {
      console.error(`[iThink] Shipment booking failed for order ${order.id}:`, apiErr.message);

      // Record error on the order, leave status unchanged
      await query(
        `UPDATE orders
         SET shipment_status = 'failed',
             shipment_error = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [apiErr.message.substring(0, 500), order.id]
      ).catch(() => {});

      // Alert admin via email
      if (ownerNotifyService && typeof ownerNotifyService.sendMail === 'function' && process.env.OWNER_NOTIFY_EMAIL) {
        ownerNotifyService.sendMail(
          process.env.OWNER_NOTIFY_EMAIL,
          `[Tohfa Logistics Alert] iThink Booking Failed for Order #${String(order.id).slice(0, 8)}`,
          `<h3>Logistics Booking Failure</h3>
           <p><strong>Order ID:</strong> ${order.id}</p>
           <p><strong>Seller Store:</strong> ${seller.store_name}</p>
           <p><strong>Error:</strong> ${apiErr.message}</p>
           <p>The order status has NOT been modified. Please review the iThink dashboard or contact the artisan.</p>`
        ).catch(e => console.warn('[iThink] Failed to send admin alert email:', e.message));
      }

      throw apiErr;
    }
  } else if (isDevMock) {
    // DEV-ONLY mock behind explicit MOCK_LOGISTICS=true
    console.warn(`[iThink DEV MOCK] Simulating booking for order ${order.id} in development.`);
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    trackingId = `DEV-ITL-${randomHex}${Date.now().toString().slice(-4)}`;
    courierName = 'iThink Sandbox Logistics';
  }

  const trackingUrl = `https://ithinklogistics.com/track/${encodeURIComponent(trackingId)}`;

  // 6. ATOMIC IDEMPOTENT UPDATE: Set status = 'shipped' only if tracking_id IS NULL
  const { rows: updatedOrders } = await query(
    `UPDATE orders 
     SET status = 'shipped',
         tracking_id = $1,
         tracking_url = $2,
         courier = $3,
         shipment_status = 'booked',
         shipment_error = NULL,
         dispatched_at = COALESCE(dispatched_at, NOW()),
         updated_at = NOW() 
     WHERE id = $4 AND tracking_id IS NULL
     RETURNING *`,
    [trackingId, trackingUrl, courierName, order.id]
  );

  const finalOrder = updatedOrders[0] || order;

  // 7. Update seller_orders tracking details
  await query(
    `UPDATE seller_orders
     SET awb_number = $1,
         courier_name = $2,
         tracking_url = $3,
         status = 'shipped',
         updated_at = NOW()
     WHERE (order_id = $4 OR id = $4) AND (awb_number IS NULL OR awb_number = '')`,
    [trackingId, courierName, trackingUrl, order.id]
  ).catch(e => console.warn('[iThink] Non-fatal seller_orders update notice:', e.message));

  // 8. Notify buyer of real dispatch
  if (order.buyer_id) {
    await createNotification(
      order.buyer_id,
      'order_shipped',
      'Order Shipped! 🚀',
      `Your handcrafted gift has been dispatched with ${courierName} tracking #${trackingId}.`,
      { order_id: order.id, tracking_id: trackingId, tracking_url: trackingUrl, courier: courierName }
    ).catch(e => console.warn('[iThink] Buyer notification trigger failed:', e.message));
  }

  return {
    success: true,
    waybill: trackingId,
    tracking_id: trackingId,
    tracking_url: trackingUrl,
    courier: courierName,
    order: finalOrder,
    details: logisticsResponse,
  };
}

/**
 * Calculate estimated delivery date string in 'en-IN' format
 * @param {number} preparationDays
 * @param {number} courierTransitDays
 * @returns {string} e.g. "Thu, Aug 28"
 */
function calculateEstimatedDelivery(preparationDays = 2, courierTransitDays = 3) {
  const totalDays = Number(preparationDays || 2) + Number(courierTransitDays || 3);
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + totalDays);
  return deliveryDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Check delivery serviceability for a given destination pincode
 * Maintains 100% backward compatibility with existing public contract.
 *
 * @param {string} pincode - 6 digit destination pincode
 * @param {Object} [options] - Optional params like pickup_pincode, weight, preparation_days
 * @returns {Promise<Object>}
 */
async function checkServiceability(pincode, options = {}) {
  const cleanPin = String(pincode || '').trim();
  if (!/^\d{6}$/.test(cleanPin)) {
    return {
      serviceable: false,
      pincode: cleanPin,
      message: 'Invalid 6-digit Indian pincode format.',
    };
  }

  let pickupPincode = options.pickup_pincode;
  if (!pickupPincode && options.seller) {
    try {
      const resolved = resolvePickupAddress(options.seller);
      if (resolved && resolved.pincode) {
        pickupPincode = resolved.pincode;
      }
    } catch (_) {
      // Suppress address resolution errors and fall back to default
    }
  }

  if (!pickupPincode) {
    console.warn('[iThink] checkServiceability: Origin pincode not provided; defaulting to 302001.');
    pickupPincode = '302001';
  }
  const weight = options.weight || 500;
  const prepDays = Number(options.preparation_days !== undefined ? options.preparation_days : 2);

  // If live iThink is enabled, query their rate/serviceability endpoint
  if (isIThinkEnabled()) {
    try {
      // TODO(verify against iThink docs): Endpoint name /rate/serviceability.json vs /rate/serviceability
      const response = await ithinkRequest('/rate/serviceability.json', 'POST', {
        pickup_pincode: pickupPincode,
        delivery_pincode: cleanPin,
        weight_in_grams: weight,
      }).catch(() => ithinkRequest('/rate/serviceability', 'POST', {
        pickup_pincode: pickupPincode,
        delivery_pincode: cleanPin,
        weight_in_grams: weight,
      }));

      if (response && (response.status === 'success' || response.serviceable)) {
        const transitDays = Number(response.estimated_days || 3);
        return {
          serviceable: true,
          pincode: cleanPin,
          source: 'ithink',
          couriers: response.data || [
            { name: 'Delhivery Surface', type: 'Standard', estimated_days: 4, cod_available: true },
            { name: 'BlueDart Express', type: 'Express', estimated_days: 2, cod_available: true },
          ],
          estimated_delivery_days: transitDays,
          estimated_delivery_date: calculateEstimatedDelivery(prepDays, transitDays),
          preparation_days: prepDays,
          cod_available: response.cod_available !== undefined ? response.cod_available : true,
          message: 'Delivery is available to your location.',
        };
      }
    } catch (err) {
      console.warn('[iThink] Serviceability API offline or error:', err.message);
    }
  }

  // Reliable offline validator for standard Indian postal codes (PINs starting 1-8)
  const firstDigit = parseInt(cleanPin.charAt(0), 10);
  const isValidIndianPin = firstDigit >= 1 && firstDigit <= 8;

  if (isValidIndianPin) {
    const transitDays = 3;
    return {
      serviceable: true,
      pincode: cleanPin,
      source: 'estimated',
      couriers: [
        { name: 'Delhivery Surface', type: 'Standard', estimated_days: 4, cod_available: true },
        { name: 'BlueDart Express', type: 'Express', estimated_days: 2, cod_available: true },
        { name: 'Shadowfax', type: 'Standard', estimated_days: 5, cod_available: true },
      ],
      estimated_delivery_days: transitDays,
      estimated_delivery_date: calculateEstimatedDelivery(prepDays, transitDays),
      preparation_days: prepDays,
      cod_available: true,
      message: 'Delivery available to this pincode (Standard & Express options available).',
    };
  }

  return {
    serviceable: false,
    pincode: cleanPin,
    source: 'estimated',
    message: 'Delivery is currently not available for this postal code.',
  };
}

/**
 * Query current shipment tracking state
 * @param {string} trackingId
 */
async function trackShipment(trackingId) {
  if (!trackingId) {
    const err = new Error('Tracking ID is required');
    err.status = 400;
    throw err;
  }

  if (isIThinkEnabled()) {
    try {
      // TODO(verify against iThink docs): Endpoint /tracking/track.json or /tracking/:id
      const result = await ithinkRequest(`/tracking/${encodeURIComponent(trackingId)}`, 'GET');
      return {
        tracking_id: trackingId,
        source: 'ithink',
        ...result,
      };
    } catch (err) {
      console.warn(`[iThink] Live tracking error for ${trackingId}:`, err.message);
    }
  }

  return {
    tracking_id: trackingId,
    status: 'In Transit',
    source: 'estimated',
    message: 'Tracking details will refresh once scanned by courier at nearest hub.',
  };
}

/**
 * Generate AWB for a seller's order
 * @param {string} orderId
 * @param {string} sellerId
 */
async function generateSellerAWB(orderId, sellerId) {
  const { rows } = await query(
    'SELECT * FROM orders WHERE id = $1' + (sellerId ? ' AND seller_id = $2' : ''),
    sellerId ? [orderId, sellerId] : [orderId]
  );

  if (!rows.length) {
    const err = new Error('Order not found or unauthorized.');
    err.status = 404;
    throw err;
  }

  const order = rows[0];

  // Book shipment (fromPayment: false allows explicit seller booking)
  const shipment = await createShipment(order, { fromPayment: false });

  return {
    success: true,
    awb: shipment.waybill || shipment.tracking_id,
    tracking_id: shipment.tracking_id,
    tracking_url: shipment.tracking_url,
    courier: shipment.courier || 'iThink Logistics',
    label_url: `/api/logistics/label/${order.id}?format=html`,
    order: shipment.order,
  };
}

/**
 * Get shipping label data for an order
 * @param {string} orderId
 * @param {string} sellerId
 */
async function getShippingLabel(orderId, sellerId) {
  const { rows } = await query(
    `SELECT o.id, o.status, o.tracking_id, o.tracking_url, o.courier, o.total_amount, o.created_at,
            u.name AS buyer_name, u.email AS buyer_email, u.phone AS buyer_phone,
            a.name AS recipient_name, a.phone AS recipient_phone,
            a.line1 AS delivery_line1, a.line2 AS delivery_line2, a.city AS delivery_city,
            a.state AS delivery_state, a.pincode AS delivery_pincode,
            COALESCE(sp.store_name, sel.store_name, s.name) AS store_name, 
            COALESCE(sp.whatsapp_number, s.phone) AS store_phone, 
            COALESCE(sp.pickup_address, sel.pickup_address) AS pickup_address,
            (COALESCE(sp.is_admin_managed::text, sel.is_admin_managed::text, 'false') IN ('true', 't', '1')) AS is_admin_managed,
            COALESCE(
              (SELECT json_agg(json_build_object(
                'name', p.name,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'customization_data', oi.customization_data
              ))
              FROM order_items oi
              JOIN products p ON p.id = oi.product_id
              WHERE oi.order_id = o.id),
              '[]'
            ) AS items
     FROM orders o
     JOIN users u ON u.id = o.buyer_id
     LEFT JOIN users s ON s.id = o.seller_id
     LEFT JOIN addresses a ON a.id = o.address_id
     LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
     LEFT JOIN sellers sel ON (sel.user_id = o.seller_id OR sel.id = o.seller_id)
     WHERE o.id = $1 ${sellerId ? 'AND o.seller_id = $2' : ''}`,
    sellerId ? [orderId, sellerId] : [orderId]
  );

  if (!rows.length) {
    const err = new Error('Order not found or unauthorized.');
    err.status = 404;
    throw err;
  }

  const orderData = rows[0];
  const pickup = resolvePickupAddress(orderData);

  return {
    order_id: orderData.id,
    order_ref: `TOHFA-${String(orderData.id).substring(0, 8).toUpperCase()}`,
    tracking_id: orderData.tracking_id || 'PENDING',
    tracking_url: orderData.tracking_url || '',
    courier: orderData.courier || 'iThink Logistics',
    status: orderData.status,
    total_amount: orderData.total_amount,
    created_at: orderData.created_at,
    pickup_address: {
      store_name: pickup.store_name || orderData.store_name,
      contact_name: pickup.contact_name,
      phone: pickup.phone,
      line1: pickup.line1,
      line2: pickup.line2,
      city: pickup.city,
      state: pickup.state,
      pincode: pickup.pincode,
    },
    delivery_address: {
      recipient_name: orderData.recipient_name || orderData.buyer_name,
      phone: orderData.recipient_phone || orderData.buyer_phone || '',
      line1: orderData.delivery_line1 || '',
      line2: orderData.delivery_line2 || '',
      city: orderData.delivery_city || '',
      state: orderData.delivery_state || '',
      pincode: orderData.delivery_pincode || '',
    },
    items: orderData.items,
  };
}

module.exports = {
  createShipment,
  resolvePickupAddress,
  checkServiceability,
  calculateEstimatedDelivery,
  trackShipment,
  generateSellerAWB,
  getShippingLabel,
};
