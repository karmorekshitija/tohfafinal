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
    isIThinkEnabled.mockReturnValue(true);
  });

  describe('isEligibleForIThink', () => {
    test('returns true for normal seller (is_admin_managed = false)', async () => {
      query.mockResolvedValueOnce({
        rows: [{ is_admin_managed: false }],
      });
      const eligible = await logisticsService.isEligibleForIThink('seller-123');
      expect(eligible).toBe(true);
    });

    test('returns false for Tohfa Special shop (is_admin_managed = true)', async () => {
      query.mockResolvedValueOnce({
        rows: [{ is_admin_managed: true }],
      });
      const eligible = await logisticsService.isEligibleForIThink('special-seller-456');
      expect(eligible).toBe(false);
    });

    test('fails closed (returns false) if DB query throws', async () => {
      query.mockRejectedValueOnce(new Error('DB connection failed'));
      const eligible = await logisticsService.isEligibleForIThink('seller-err');
      expect(eligible).toBe(false);
    });

    test('returns false if sellerId is missing or empty', async () => {
      const eligible = await logisticsService.isEligibleForIThink(null);
      expect(eligible).toBe(false);
    });
  });

  describe('createShipment - Eligibility & Safety Gates', () => {
    test('Special Shop orders return manual_fulfillment_required and do NOT touch iThink API or status', async () => {
      const order = {
        id: 'order-special-1',
        seller_id: 'special-seller-1',
        total_amount: 1500,
        payment_status: 'paid',
        status: 'confirmed',
      };

      // Mock isEligibleForIThink -> false
      query.mockResolvedValueOnce({
        rows: [{ is_admin_managed: true }],
      });

      const result = await logisticsService.createShipment(order);

      expect(result.manual_fulfillment_required).toBe(true);
      expect(ithinkRequest).not.toHaveBeenCalled();
      expect(createNotification).not.toHaveBeenCalled();
    });

    test('Idempotency: Order with existing tracking_id returns existing shipment without calling iThink', async () => {
      const order = {
        id: 'order-already-booked',
        seller_id: 'normal-seller-1',
        tracking_id: 'AWB-EXISTING-999',
        tracking_url: 'https://ithinklogistics.com/track/AWB-EXISTING-999',
        courier: 'Delhivery Surface',
        status: 'shipped',
      };

      // Mock isEligibleForIThink -> true
      query.mockResolvedValueOnce({
        rows: [{ is_admin_managed: false }],
      });

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

      query.mockResolvedValueOnce({ rows: [{ is_admin_managed: false }] }); // eligible

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

      query.mockResolvedValueOnce({ rows: [{ is_admin_managed: false }] }); // eligible
      query.mockResolvedValueOnce({ rows: [{ id: 'addr-1', name: 'Buyer', line1: 'B-12' }] }); // address
      query.mockResolvedValueOnce({
        rows: [{ store_name: 'Artisan Workshop', pickup_address: null }],
      }); // seller without pickup address

      await expect(logisticsService.createShipment(order)).rejects.toThrow(
        /Pickup & return address is required before generating a shipping label/
      );
      expect(ithinkRequest).not.toHaveBeenCalled();
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

      // 1. isEligibleForIThink
      query.mockResolvedValueOnce({ rows: [{ is_admin_managed: false }] });
      // 2. address
      query.mockResolvedValueOnce({
        rows: [{ id: 'addr-buyer-1', name: 'Rohan Sharma', phone: '9876543210', line1: 'Flat 401', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }],
      });
      // 3. seller
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
        }],
      });

      // 4. iThink API returns real AWB response
      ithinkRequest.mockResolvedValueOnce({
        status: 'success',
        waybill: 'ITL-REAL-987654',
        courier_name: 'Delhivery Surface',
      });

      // 5. Atomic update orders
      query.mockResolvedValueOnce({
        rows: [{ ...order, status: 'shipped', tracking_id: 'ITL-REAL-987654', courier: 'Delhivery Surface' }],
      });

      // 6. Update seller_orders
      query.mockResolvedValueOnce({ rows: [] });

      const result = await logisticsService.createShipment(order);

      expect(result.success).toBe(true);
      expect(result.waybill).toBe('ITL-REAL-987654');
      expect(result.courier).toBe('Delhivery Surface');
      expect(result.tracking_url).toContain('ITL-REAL-987654');

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

      query.mockResolvedValueOnce({ rows: [{ is_admin_managed: false }] }); // eligible
      query.mockResolvedValueOnce({
        rows: [{ id: 'addr-buyer-1', name: 'Buyer', line1: 'Street 1', city: 'Delhi', pincode: '110001' }],
      });
      query.mockResolvedValueOnce({
        rows: [{
          store_name: 'Wood Crafts',
          pickup_address: JSON.stringify({ line1: 'Plot 2', city: 'Noida', pincode: '201301' }),
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
  });
});
