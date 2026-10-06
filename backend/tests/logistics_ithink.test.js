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

  describe('Consolidated Seller Pickup Address & Warehouse Sync', () => {
    test('createShipment accepts consolidated pickup_address with address_line1, landmark, facility_name and populates RTO return_* fields', async () => {
      const order = {
        id: '123e4567-e89b-12d3-a456-426614174009',
        seller_id: 'seller-consolidated-1',
        buyer_id: 'buyer-user-9',
        address_id: 'addr-buyer-9',
        total_amount: 1850,
        payment_status: 'paid',
        status: 'packed',
      };

      query.mockResolvedValueOnce({
        rows: [{ id: 'addr-buyer-9', name: 'Meera Nair', phone: '9876501234', line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' }],
      });
      query.mockResolvedValueOnce({
        rows: [{
          store_name: 'Jaipur Blue Pottery Studio',
          name: 'Kiran Verma',
          phone: '9812345678',
          pickup_address: {
            contact_name: 'Kiran Verma',
            phone: '9812345678',
            facility_name: 'Jaipur Dispatch Hub',
            address_line1: 'Plot 44, Sitapura Industrial Area',
            address_line2: 'Phase II',
            landmark: 'Near RIICO Water Tank',
            city: 'Jaipur',
            state: 'Rajasthan',
            pincode: '302022',
          },
        }],
      });

      ithinkRequest.mockResolvedValueOnce({
        status: 'success',
        waybill: 'ITL-CONSOLIDATED-101',
        courier_name: 'BlueDart Surface',
      });

      query.mockResolvedValueOnce({
        rows: [{ ...order, status: 'shipped', tracking_id: 'ITL-CONSOLIDATED-101', courier: 'BlueDart Surface' }],
      });
      query.mockResolvedValueOnce({ rows: [] });

      const result = await logisticsService.createShipment(order);
      expect(result.success).toBe(true);
      expect(result.waybill).toBe('ITL-CONSOLIDATED-101');

      const shipmentData = ithinkRequest.mock.calls[0][2];
      expect(shipmentData.pickup_facility_name).toBe('Jaipur Dispatch Hub');
      expect(shipmentData.pickup_name).toBe('Kiran Verma');
      expect(shipmentData.pickup_address).toContain('Plot 44, Sitapura Industrial Area');
      expect(shipmentData.pickup_address).toContain('Near RIICO Water Tank');
      expect(shipmentData.pickup_pincode).toBe('302022');
      expect(shipmentData.return_address).toContain('Plot 44, Sitapura Industrial Area');
      expect(shipmentData.return_pincode).toBe('302022');
    });

    test('syncSellerPickupWarehouse registers warehouse with iThink when enabled and falls back cleanly when disabled', async () => {
      isIThinkEnabled.mockReturnValue(true);
      ithinkRequest.mockResolvedValueOnce({
        status: 'success',
        warehouse_id: 'WH-JAIPUR-01',
      });

      const syncRes = await logisticsService.syncSellerPickupWarehouse('seller-1', {
        contact_name: 'Arun',
        phone: '9876543210',
        facility_name: 'Arun Crafts Studio',
        address_line1: '10 Heritage Lane',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302001',
      });
      expect(syncRes.synced).toBe(true);
      expect(syncRes.warehouse_id).toBe('WH-JAIPUR-01');

      isIThinkEnabled.mockReturnValue(false);
      const localRes = await logisticsService.syncSellerPickupWarehouse('seller-1', {
        address_line1: '10 Heritage Lane',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302001',
      });
      expect(localRes.synced).toBe(false);
      expect(localRes.source).toBe('local');
    });
  });

  describe('Consolidated Seller Onboarding Normalizers & Validators', () => {
    const onboarding = require('../src/utils/sellerOnboarding');

    test('normalizes billing_address, pickup_address, and bank_details and evaluates full onboarding status', () => {
      const billing = onboarding.normalizeBillingAddress({
        legal_business_name: 'Tohfa Artisans LLP',
        gstin: '08aaaaa0000a1z5',
        pan_number: 'abcde1234f',
        address_line1: '21 Johari Bazar',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302003',
      });
      expect(billing.gstin).toBe('08AAAAA0000A1Z5');
      expect(billing.pan_number).toBe('ABCDE1234F');
      expect(onboarding.isValidGstin(billing.gstin)).toBe(true);
      expect(onboarding.isValidPan(billing.pan_number)).toBe(true);

      const pickup = onboarding.normalizePickupAddress({
        contact_name: 'Ramesh',
        phone: '+91 9876543210',
        address_line1: '21 Johari Bazar',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302003',
        same_as_billing: true,
      });
      expect(pickup.phone).toBe('9876543210');
      expect(onboarding.isValidIndianPhone(pickup.phone)).toBe(true);

      const bank = onboarding.normalizeBankDetails({
        account_holder_name: 'Tohfa Artisans LLP',
        bank_name: 'HDFC Bank',
        account_number: '50100234567890',
        ifsc_code: 'hdfc0001234',
      });
      expect(bank.ifsc_code).toBe('HDFC0001234');
      expect(onboarding.isValidIfscOrRouting(bank.ifsc_code)).toBe(true);

      const status = onboarding.evaluateSellerOnboarding({
        billing_address: billing,
        pickup_address: pickup,
        bank_details: bank,
      });
      expect(status.hasBillingAddress).toBe(true);
      expect(status.hasPickupAddress).toBe(true);
      expect(status.hasBankingDetails).toBe(true);
      expect(status.isComplete).toBe(true);
    });
  });

  describe('Consolidated Seller Profile Controller Endpoints (Billing & Pickup)', () => {
    const sellerController = require('../src/controllers/seller.controller');

    function createMockRes() {
      const res = {};
      res.statusCode = 200;
      res.status = jest.fn((code) => {
        res.statusCode = code;
        return res;
      });
      res.json = jest.fn((body) => {
        res.body = body;
        return res;
      });
      return res;
    }

    test('PUT /api/seller/profile/billing rejects invalid GSTIN or mismatched account numbers and saves valid payload', async () => {
      const next = jest.fn();

      // 1. Invalid GSTIN -> 400
      const badReq = {
        user: { id: 'seller-u1' },
        body: {
          legal_business_name: 'Craft House',
          gstin: 'INVALIDGST',
          address_line1: '12 Main Rd',
          city: 'Jaipur',
          state: 'Rajasthan',
          pincode: '302001',
          account_holder_name: 'Craft House',
          account_number: '123456789012',
          ifsc_code: 'HDFC0001234',
        },
      };
      const badRes = createMockRes();
      await sellerController.updateBillingProfile(badReq, badRes, next);
      expect(badRes.statusCode).toBe(400);
      expect(badRes.body.success).toBe(false);

      // 2. Valid payload -> 200
      query.mockResolvedValueOnce({
        rows: [{
          store_name: 'Craft House',
          sp_billing_address: {},
          sp_pickup_address: {},
          sp_bank_details: {},
        }],
      });
      query.mockResolvedValueOnce({ rows: [] }); // UPDATE seller_profiles
      query.mockResolvedValueOnce({ rows: [] }); // UPDATE sellers
      query.mockResolvedValueOnce({
        rows: [{
          billing_address: { address_line1: '12 Main Rd', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
          pickup_address: { address_line1: '12 Main Rd', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
          bank_details: { account_holder_name: 'Craft House', account_number: '123456789012', ifsc_code: 'HDFC0001234' },
          onboarding_tour_dismissed: false,
          is_admin_managed: false,
        }],
      });

      const okReq = {
        user: { id: 'seller-u1' },
        body: {
          legal_business_name: 'Craft House LLP',
          gstin: '08AAAAA0000A1Z5',
          pan_number: 'ABCDE1234F',
          same_as_billing: true,
          billing_address: {
            address_line1: '12 Main Rd',
            city: 'Jaipur',
            state: 'Rajasthan',
            pincode: '302001',
          },
          bank_details: {
            account_holder_name: 'Craft House LLP',
            bank_name: 'HDFC Bank',
            account_number: '123456789012',
            confirm_account_number: '123456789012',
            ifsc_code: 'HDFC0001234',
          },
        },
      };
      const okRes = createMockRes();
      await sellerController.updateBillingProfile(okReq, okRes, next);
      expect(okRes.statusCode).toBe(200);
      expect(okRes.body.success).toBe(true);
      expect(okRes.body.data.hasBillingAddress).toBe(true);
      expect(okRes.body.data.hasBankingDetails).toBe(true);
    });

    test('PUT /api/seller/profile/pickup-address validates phone & pincode and syncs pickup address', async () => {
      const next = jest.fn();

      // 1. Invalid phone -> 400
      const badReq = {
        user: { id: 'seller-u1' },
        body: {
          pickup_address: {
            contact_name: 'Arun',
            phone: '123',
            address_line1: 'Plot 9',
            city: 'Jaipur',
            state: 'Rajasthan',
            pincode: '302001',
          },
        },
      };
      const badRes = createMockRes();
      await sellerController.updatePickupAddress(badReq, badRes, next);
      expect(badRes.statusCode).toBe(400);

      // 2. Valid pickup address -> 200
      isIThinkEnabled.mockReturnValue(false); // uses local serviceability + warehouse fallback
      query.mockResolvedValueOnce({
        rows: [{
          store_name: 'Arun Studio',
          phone: '9876543210',
          sp_pickup_address: {},
          sp_billing_address: {},
        }],
      });
      query.mockResolvedValueOnce({ rows: [] }); // UPDATE seller_profiles
      query.mockResolvedValueOnce({ rows: [] }); // UPDATE sellers
      query.mockResolvedValueOnce({
        rows: [{
          billing_address: { address_line1: 'Plot 9', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
          pickup_address: { contact_name: 'Arun', phone: '9876543210', address_line1: 'Plot 9', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
          bank_details: { account_holder_name: 'Arun', account_number: '123456789012', ifsc_code: 'HDFC0001234' },
        }],
      });

      const okReq = {
        user: { id: 'seller-u1' },
        body: {
          pickup_address: {
            contact_name: 'Arun',
            phone: '9876543210',
            facility_name: 'Arun Dispatch Studio',
            address_line1: 'Plot 9, Sitapura',
            landmark: 'Near Gate 2',
            city: 'Jaipur',
            state: 'Rajasthan',
            pincode: '302001',
          },
        },
      };
      const okRes = createMockRes();
      await sellerController.updatePickupAddress(okReq, okRes, next);
      expect(okRes.statusCode).toBe(200);
      expect(okRes.body.success).toBe(true);
      expect(okRes.body.data.pickup_address.address_line1).toBe('Plot 9, Sitapura');
      expect(okRes.body.data.hasPickupAddress).toBe(true);
    });

    test('PUT /api/seller/profile/billing saves billing address when bank_name is omitted (auto-derived from IFSC) or when only billing address is provided', async () => {
      const next = jest.fn();

      // 1. Mismatched confirm_account_number -> 400
      const mismatchReq = {
        user: { id: 'seller-u2' },
        body: {
          legal_business_name: 'Craft House',
          address_line1: '12 Main Rd',
          city: 'Jaipur',
          state: 'Rajasthan',
          pinCode: '302001',
          account_holder_name: 'Craft House',
          account_number: '123456789012',
          confirm_account_number: '999999999999',
          ifsc_code: 'SBIN0001234',
        },
      };
      const mismatchRes = createMockRes();
      await sellerController.updateBillingProfile(mismatchReq, mismatchRes, next);
      expect(mismatchRes.statusCode).toBe(400);
      expect(mismatchRes.body.message).toMatch(/do not match/i);

      // 2. Billing address + IFSC without bank_name -> auto-derives "SBIN Bank" and upserts cleanly
      query.mockResolvedValueOnce({ rows: [] }); // no existing row in seller_profiles yet!
      query.mockResolvedValueOnce({ rows: [] }); // INSERT ... ON CONFLICT DO UPDATE seller_profiles
      query.mockResolvedValueOnce({ rows: [] }); // UPDATE sellers
      query.mockResolvedValueOnce({
        rows: [{
          billing_address: { address_line1: '12 Main Rd', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
          pickup_address: { address_line1: '12 Main Rd', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
          bank_details: { account_holder_name: 'Craft House', bank_name: 'SBIN Bank', account_number: '123456789012', ifsc_code: 'SBIN0001234' },
          onboarding_tour_dismissed: false,
          is_admin_managed: false,
        }],
      });

      const okNoBankNameReq = {
        user: { id: 'seller-u2' },
        body: {
          legal_business_name: 'Craft House',
          addressLine1: '12 Main Rd',
          city: 'Jaipur',
          state: 'Rajasthan',
          pinCode: '302001',
          account_holder_name: 'Craft House',
          account_number: '123456789012',
          ifsc_code: 'SBIN0001234',
        },
      };
      const okNoBankNameRes = createMockRes();
      await sellerController.updateBillingProfile(okNoBankNameReq, okNoBankNameRes, next);
      expect(okNoBankNameRes.statusCode).toBe(200);
      expect(okNoBankNameRes.body.success).toBe(true);
      expect(okNoBankNameRes.body.data.bank_details.bank_name).toBe('SBIN Bank');
      expect(okNoBankNameRes.body.data.razorpay_sync).toBeDefined();
    });
  });
});

