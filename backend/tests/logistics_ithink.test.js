/**
 * Tohfa v2 — iThink Logistics Service Tests
 * File: backend/tests/logistics_ithink.test.js
 */
'use strict';

// Mock dependencies before requiring logistics.service
jest.mock('../src/config/db', () => ({
  query: jest.fn(),
}));

jest.mock('../src/config/ithink', () => ({
  ithinkRequest: jest.fn(),
  isIThinkEnabled: jest.fn(),
}));

jest.mock('../src/controllers/notification.controller', () => ({
  createNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
}));

jest.mock('../src/services/ownerNotify.service', () => ({
  sendMail: jest.fn().mockResolvedValue(true),
  sendAdminAlertEmail: jest.fn().mockResolvedValue(true),
}));

const { query } = require('../src/config/db');
const { ithinkRequest, isIThinkEnabled } = require('../src/config/ithink');
const { createNotification } = require('../src/controllers/notification.controller');
const logisticsService = require('../src/services/logistics.service');

describe('iThink Logistics Integration Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ITHINK_AUTO_BOOK_ON_PAYMENT;
    delete process.env.MOCK_LOGISTICS;
    delete process.env.TOHFA_WAREHOUSE_NAME;
    delete process.env.TOHFA_WAREHOUSE_PHONE;
    delete process.env.TOHFA_WAREHOUSE_LINE1;
    delete process.env.TOHFA_WAREHOUSE_LINE2;
    delete process.env.TOHFA_WAREHOUSE_CITY;
    delete process.env.TOHFA_WAREHOUSE_STATE;
    delete process.env.TOHFA_WAREHOUSE_PINCODE;
    isIThinkEnabled.mockReturnValue(true);
  });

  describe('createShipment - Eligibility & Safety Gates', () => {
    test('Idempotency: Order with existing tracking_id returns existing shipment without calling iThink', async () => {
      const order = {
        id: 'order-already-booked',
        seller_id: 'normal-seller-1',
        tracking_id: 'AWB-EXISTING-999',
        tracking_url: 'https://ithinklogistics.com/track/AWB-EXISTING-999',
        courier: 'Delhivery Surface',
        status: 'shipped',
      };

      const result = await logisticsService.createShipment(order);

      expect(result.idempotent).toBe(true);
      expect(result.tracking_id).toBe('AWB-EXISTING-999');
      expect(ithinkRequest).not.toHaveBeenCalled();
    });

    test('Feature flag OFF: throws 503 error when ITHINK_ENABLED is false in production', async () => {
      isIThinkEnabled.mockReturnValue(false);

      const order = {
        id: 'order-flag-off',
        seller_id: 'normal-seller-1',
        address_id: 'addr-1',
        total_amount: 1000,
        payment_status: 'paid',
      };

      await expect(logisticsService.createShipment(order)).rejects.toThrow(/ITHINK_ENABLED=false/);
      expect(ithinkRequest).not.toHaveBeenCalled();
    });

    test('Missing seller pickup address throws 400 with helpful instruction', async () => {
      const order = {
        id: 'order-no-pickup',
        seller_id: 'seller-no-pickup',
        address_id: 'addr-1',
        total_amount: 1000,
        payment_status: 'paid',
      };

      query.mockResolvedValueOnce({ rows: [{ id: 'addr-1', name: 'Buyer', line1: 'B-12' }] }); // address
      query.mockResolvedValueOnce({
        rows: [{ store_name: 'Artisan Workshop', pickup_address: null, is_admin_managed: false }],
      }); // seller without pickup address

      await expect(logisticsService.createShipment(order)).rejects.toThrow(
        /Pickup & return address is required before generating a shipping label/
      );
      expect(ithinkRequest).not.toHaveBeenCalled();
    });

    test('Special shop with warehouse env vars books successfully via iThink', async () => {
      process.env.TOHFA_WAREHOUSE_NAME = 'Tohfa Central Warehouse';
      process.env.TOHFA_WAREHOUSE_PHONE = '9876500000';
      process.env.TOHFA_WAREHOUSE_LINE1 = 'Warehouse 42, Logistics Park';
      process.env.TOHFA_WAREHOUSE_LINE2 = 'Phase 2';
      process.env.TOHFA_WAREHOUSE_CITY = 'Jaipur';
      process.env.TOHFA_WAREHOUSE_STATE = 'Rajasthan';
      process.env.TOHFA_WAREHOUSE_PINCODE = '302001';

      const order = {
        id: 'order-special-success-1',
        seller_id: 'special-seller-1',
        buyer_id: 'buyer-user-1',
        address_id: 'addr-buyer-1',
        total_amount: 1999,
        payment_status: 'paid',
        status: 'packed',
      };

      // 1. Delivery address
      query.mockResolvedValueOnce({
        rows: [{ id: 'addr-buyer-1', name: 'Rohan Sharma', phone: '9876543210', line1: 'Flat 401', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }],
      });
      // 2. Special seller with no personal pickup address, but is_admin_managed = true
      query.mockResolvedValueOnce({
        rows: [{
          store_name: 'Tohfa Special Curated',
          name: 'Tohfa Special',
          phone: '9123456780',
          pickup_address: null,
          is_admin_managed: true,
        }],
      });
      // 3. iThink API returns AWB response
      ithinkRequest.mockResolvedValueOnce({
        status: 'success',
        waybill: 'ITL-SPECIAL-123456',
        courier_name: 'Delhivery Surface',
      });
      // 4. Update orders
      query.mockResolvedValueOnce({
        rows: [{ ...order, status: 'shipped', tracking_id: 'ITL-SPECIAL-123456', courier: 'Delhivery Surface' }],
      });
      // 5. Update seller_orders
      query.mockResolvedValueOnce({ rows: [] });

      const result = await logisticsService.createShipment(order);

      expect(result.success).toBe(true);
      expect(result.waybill).toBe('ITL-SPECIAL-123456');
      expect(result.tracking_id).toBe('ITL-SPECIAL-123456');
      expect(result.courier).toBe('Delhivery Surface');
      expect(result.tracking_url).toContain('ITL-SPECIAL-123456');
      // REGRESSION GUARD: Never short-circuits to manual fulfillment
      expect(result.manual_fulfillment_required).toBeUndefined();

      // Verifies warehouse details were passed in booking payload
      expect(ithinkRequest).toHaveBeenCalledWith(
        '/order/add.json',
        'POST',
        expect.objectContaining({
          pickup_address: expect.stringContaining('Warehouse 42, Logistics Park'),
          pickup_city: 'Jaipur',
          pickup_pincode: '302001',
          pickup_phone: '9876500000',
        })
      );
    });

    test('Special shop with no seller address and no env warehouse gets the pickup-address error', async () => {
      const order = {
        id: 'order-special-no-warehouse',
        seller_id: 'special-seller-no-env',
        address_id: 'addr-1',
        total_amount: 1500,
        payment_status: 'paid',
        status: 'confirmed',
      };

      query.mockResolvedValueOnce({ rows: [{ id: 'addr-1', name: 'Buyer', line1: 'B-12' }] }); // address
      query.mockResolvedValueOnce({
        rows: [{ store_name: 'Special Shop', pickup_address: null, is_admin_managed: true }],
      }); // special seller with no pickup address

      await expect(logisticsService.createShipment(order)).rejects.toThrow(
        /Pickup & return address is required before generating a shipping label/
      );
      expect(ithinkRequest).not.toHaveBeenCalled();
    });

    test('Regression guard: createShipment() for an admin-managed seller never returns manual_fulfillment_required', async () => {
      process.env.TOHFA_WAREHOUSE_NAME = 'Tohfa Central';
      process.env.TOHFA_WAREHOUSE_PHONE = '9876543210';
      process.env.TOHFA_WAREHOUSE_LINE1 = 'Warehouse Hub';
      process.env.TOHFA_WAREHOUSE_CITY = 'Jaipur';
      process.env.TOHFA_WAREHOUSE_PINCODE = '302001';

      const order = {
        id: 'order-guard-check',
        seller_id: 'admin-managed-guard',
        buyer_id: 'buyer-1',
        address_id: 'addr-1',
        total_amount: 1000,
        payment_status: 'paid',
        status: 'packed',
      };

      query.mockResolvedValueOnce({ rows: [{ id: 'addr-1', name: 'Buyer', line1: 'Street 1', city: 'Delhi', pincode: '110001' }] });
      query.mockResolvedValueOnce({ rows: [{ store_name: 'Admin Shop', pickup_address: null, is_admin_managed: true }] });
      ithinkRequest.mockResolvedValueOnce({ status: 'success', waybill: 'ITL-GUARD-AWB', courier_name: 'BlueDart Express' });
      query.mockResolvedValueOnce({ rows: [{ ...order, status: 'shipped', tracking_id: 'ITL-GUARD-AWB' }] });
      query.mockResolvedValueOnce({ rows: [] });

      const result = await logisticsService.createShipment(order);

      expect(result).not.toHaveProperty('manual_fulfillment_required');
      expect(result.manual_fulfillment_required).toBeUndefined();
      expect(result.success).toBe(true);
      expect(result.tracking_id).toBe('ITL-GUARD-AWB');
    });
  });

  describe('createShipment - Successful Booking vs API Error Handling', () => {
    test('Normal seller booking success: parses real AWB, updates orders & seller_orders, notifies buyer', async () => {
      const order = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        seller_id: 'seller-normal-1',
        buyer_id: 'buyer-user-1',
        address_id: 'addr-buyer-1',
        total_amount: 2500,
        payment_status: 'paid',
        status: 'packed',
      };

      // 1. address
      query.mockResolvedValueOnce({
        rows: [{ id: 'addr-buyer-1', name: 'Rohan Sharma', phone: '9876543210', line1: 'Flat 401', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }],
      });
      // 2. seller
      query.mockResolvedValueOnce({
        rows: [{
          store_name: 'Clay Arts Studio',
          name: 'Arun Kumar',
          phone: '9123456780',
          pickup_address: JSON.stringify({
            line1: 'Workshop 5, Industrial Area',
            city: 'Jaipur',
            state: 'Rajasthan',
            pincode: '302015',
            contact_name: 'Arun Kumar',
            contact_phone: '9123456780',
          }),
          is_admin_managed: false,
        }],
      });

      // 3. iThink API returns real AWB response
      ithinkRequest.mockResolvedValueOnce({
        status: 'success',
        waybill: 'ITL-REAL-987654',
        courier_name: 'Delhivery Surface',
      });

      // 4. Atomic update orders
      query.mockResolvedValueOnce({
        rows: [{ ...order, status: 'shipped', tracking_id: 'ITL-REAL-987654', courier: 'Delhivery Surface' }],
      });

      // 5. Update seller_orders
      query.mockResolvedValueOnce({ rows: [] });

      const result = await logisticsService.createShipment(order);

      expect(result.success).toBe(true);
      expect(result.waybill).toBe('ITL-REAL-987654');
      expect(result.courier).toBe('Delhivery Surface');
      expect(result.tracking_url).toContain('ITL-REAL-987654');
      expect(result.manual_fulfillment_required).toBeUndefined();

      // Verifies buyer notification was sent with real details
      expect(createNotification).toHaveBeenCalledWith(
        'buyer-user-1',
        'order_shipped',
        expect.stringContaining('Order Shipped'),
        expect.stringContaining('ITL-REAL-987654'),
        expect.objectContaining({ tracking_id: 'ITL-REAL-987654' })
      );
    });

    test('No fake success: when iThink API throws, order status remains unchanged and buyer is NOT notified', async () => {
      const order = {
        id: 'order-api-fail',
        seller_id: 'seller-normal-1',
        buyer_id: 'buyer-user-1',
        address_id: 'addr-buyer-1',
        total_amount: 1200,
        payment_status: 'paid',
        status: 'packed',
      };

      query.mockResolvedValueOnce({
        rows: [{ id: 'addr-buyer-1', name: 'Buyer', line1: 'Street 1', city: 'Delhi', pincode: '110001' }],
      });
      query.mockResolvedValueOnce({
        rows: [{
          store_name: 'Wood Crafts',
          pickup_address: JSON.stringify({ line1: 'Plot 2', city: 'Noida', pincode: '201301' }),
          is_admin_managed: false,
        }],
      });

      // iThink API throws an error
      ithinkRequest.mockRejectedValue(new Error('Pincode temporarily unserviceable by partner couriers'));

      // Error record update
      query.mockResolvedValueOnce({ rows: [] });

      await expect(logisticsService.createShipment(order)).rejects.toThrow(
        /Pincode temporarily unserviceable/
      );

      // Verify buyer notification was NEVER called
      expect(createNotification).not.toHaveBeenCalled();

      // Verify shipment_status was set to failed in DB
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("shipment_status = 'failed'"),
        expect.arrayContaining(['order-api-fail'])
      );
    });
  });

  describe('checkServiceability', () => {
    test('returns serviceable: false for invalid pincode format', async () => {
      const result = await logisticsService.checkServiceability('1234');
      expect(result.serviceable).toBe(false);
      expect(result.message).toMatch(/Invalid 6-digit Indian pincode/);
    });

    test('falls back to offline validator with source: "estimated" and preserved shape', async () => {
      isIThinkEnabled.mockReturnValue(false);

      const result = await logisticsService.checkServiceability('400001');

      expect(result.serviceable).toBe(true);
      expect(result.pincode).toBe('400001');
      expect(result.source).toBe('estimated');
      expect(Array.isArray(result.couriers)).toBe(true);
      expect(result.estimated_delivery_days).toBeDefined();
      expect(result.estimated_delivery_date).toBeDefined();
    });

    test('uses live iThink rate response when enabled and available', async () => {
      isIThinkEnabled.mockReturnValue(true);
      ithinkRequest.mockResolvedValueOnce({
        status: 'success',
        serviceable: true,
        estimated_days: 2,
        data: [{ name: 'BlueDart Air', type: 'Express', estimated_days: 2, cod_available: false }],
      });

      const result = await logisticsService.checkServiceability('560001');

      expect(result.serviceable).toBe(true);
      expect(result.source).toBe('ithink');
      expect(result.estimated_delivery_days).toBe(2);
      expect(result.couriers[0].name).toBe('BlueDart Air');
    });

    test('uses resolved pickup pincode when options.seller is provided', async () => {
      isIThinkEnabled.mockReturnValue(true);
      ithinkRequest.mockResolvedValueOnce({
        status: 'success',
        serviceable: true,
        estimated_days: 3,
        data: [{ name: 'Delhivery Surface', type: 'Standard', estimated_days: 3, cod_available: true }],
      });

      const seller = {
        store_name: 'Artisan Workshop',
        pickup_address: JSON.stringify({
          line1: '123 Craft Lane',
          city: 'Jaipur',
          pincode: '302020',
        }),
      };

      const result = await logisticsService.checkServiceability('400001', { seller });

      expect(result.serviceable).toBe(true);
      expect(ithinkRequest).toHaveBeenCalledWith(
        '/rate/serviceability.json',
        'POST',
        expect.objectContaining({
          pickup_pincode: '302020',
          delivery_pincode: '400001',
        })
      );
    });
  });

  describe('generateSellerAWB & getShippingLabel for Special Shops', () => {
    test('generateSellerAWB books AWB successfully for admin-managed special shop', async () => {
      process.env.TOHFA_WAREHOUSE_NAME = 'Tohfa Central Warehouse';
      process.env.TOHFA_WAREHOUSE_PHONE = '9876500000';
      process.env.TOHFA_WAREHOUSE_LINE1 = 'Warehouse 42, Logistics Park';
      process.env.TOHFA_WAREHOUSE_CITY = 'Jaipur';
      process.env.TOHFA_WAREHOUSE_PINCODE = '302001';

      const order = {
        id: 'order-awb-special-1',
        seller_id: 'special-seller-1',
        address_id: 'addr-buyer-1',
        total_amount: 1500,
        payment_status: 'paid',
        status: 'packed',
      };

      // 1. generateSellerAWB queries orders
      query.mockResolvedValueOnce({ rows: [order] });
      // 2. createShipment queries delivery address
      query.mockResolvedValueOnce({
        rows: [{ id: 'addr-buyer-1', name: 'Buyer', line1: 'Flat 1', city: 'Delhi', pincode: '110001' }],
      });
      // 3. createShipment queries seller
      query.mockResolvedValueOnce({
        rows: [{
          store_name: 'Tohfa Special',
          is_admin_managed: true,
          pickup_address: null,
        }],
      });
      // 4. iThink API returns AWB
      ithinkRequest.mockResolvedValueOnce({
        status: 'success',
        waybill: 'ITL-AWB-998877',
        courier_name: 'Delhivery Surface',
      });
      // 5. Update orders
      query.mockResolvedValueOnce({
        rows: [{ ...order, status: 'shipped', tracking_id: 'ITL-AWB-998877', courier: 'Delhivery Surface' }],
      });
      // 6. Update seller_orders
      query.mockResolvedValueOnce({ rows: [] });

      const result = await logisticsService.generateSellerAWB('order-awb-special-1', 'special-seller-1');

      expect(result.success).toBe(true);
      expect(result.awb).toBe('ITL-AWB-998877');
      expect(result.tracking_id).toBe('ITL-AWB-998877');
      expect(result.courier).toBe('Delhivery Surface');
      expect(result.label_url).toBe('/api/logistics/label/order-awb-special-1?format=html');
    });

    test('getShippingLabel uses warehouse address for admin-managed shop', async () => {
      process.env.TOHFA_WAREHOUSE_NAME = 'Tohfa Central Warehouse';
      process.env.TOHFA_WAREHOUSE_PHONE = '9876500000';
      process.env.TOHFA_WAREHOUSE_LINE1 = 'Warehouse 42, Logistics Park';
      process.env.TOHFA_WAREHOUSE_LINE2 = 'Phase 2';
      process.env.TOHFA_WAREHOUSE_CITY = 'Jaipur';
      process.env.TOHFA_WAREHOUSE_STATE = 'Rajasthan';
      process.env.TOHFA_WAREHOUSE_PINCODE = '302001';

      query.mockResolvedValueOnce({
        rows: [{
          id: 'order-label-1',
          status: 'shipped',
          tracking_id: 'ITL-LABEL-123',
          tracking_url: 'https://ithinklogistics.com/track/ITL-LABEL-123',
          courier: 'Delhivery Surface',
          total_amount: 2000,
          created_at: new Date(),
          buyer_name: 'Priya Patel',
          buyer_phone: '9876543210',
          recipient_name: 'Priya Patel',
          recipient_phone: '9876543210',
          delivery_line1: 'A-102, Residency',
          delivery_line2: '',
          delivery_city: 'Mumbai',
          delivery_state: 'Maharashtra',
          delivery_pincode: '400001',
          store_name: 'Tohfa Special Curation',
          store_phone: '9123456789',
          pickup_address: null,
          is_admin_managed: true,
          items: [{ name: 'Handmade Vase', quantity: 1, unit_price: 2000 }],
        }],
      });

      const label = await logisticsService.getShippingLabel('order-label-1');

      expect(label.tracking_id).toBe('ITL-LABEL-123');
      expect(label.pickup_address.contact_name).toBe('Tohfa Central Warehouse');
      expect(label.pickup_address.line1).toBe('Warehouse 42, Logistics Park');
      expect(label.pickup_address.city).toBe('Jaipur');
      expect(label.pickup_address.pincode).toBe('302001');
      expect(label.delivery_address.city).toBe('Mumbai');
    });
  });
});
