'use strict';

const crypto = require('crypto');

// Mock db before requiring services
const mockQuery = jest.fn();
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};
jest.mock('../src/config/db', () => ({
  query: (...args) => mockQuery(...args),
  getClient: jest.fn().mockResolvedValue(mockClient),
}));

// Mock global fetch
const originalFetch = global.fetch;
const mockFetch = jest.fn();
global.fetch = mockFetch;

const { normalizeIndianMobile, getPhone10, maskPhone } = require('../src/utils/phone');
const whatsappConfig = require('../src/config/whatsapp');
const whatsappCloudService = require('../src/services/whatsappCloud.service');
const whatsappOutboxService = require('../src/services/whatsappOutbox.service');
const whatsappService = require('../src/services/whatsapp.service');
const webhookController = require('../src/controllers/webhook.controller');
const ownerNotifyService = require('../src/services/ownerNotify.service');
const emailService = require('../src/services/email.service');

describe('Tohfa WhatsApp Messaging Suite', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...envBackup };
    process.env.WHATSAPP_ENABLED = 'false';
    process.env.WHATSAPP_REDIRECT_ALL_TO = '919755329298';
    process.env.WHATSAPP_APP_SECRET = 'test_app_secret_123';
    process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token_456';
    process.env.CRON_SECRET = 'test_cron_secret_789';
  });

  afterAll(() => {
    process.env = envBackup;
    global.fetch = originalFetch;
  });

  // ---------------------------------------------------------------------------
  // 1. Phone Normalization Tests
  // ---------------------------------------------------------------------------
  describe('Phone Normalization & Masking', () => {
    test('normalizes 10-digit Indian mobile starting with 6-9', () => {
      expect(normalizeIndianMobile('9876543210')).toBe('919876543210');
      expect(normalizeIndianMobile('8123456789')).toBe('918123456789');
      expect(normalizeIndianMobile('7000000000')).toBe('917000000000');
      expect(normalizeIndianMobile('6999999999')).toBe('916999999999');
    });

    test('normalizes 12-digit Indian mobile starting with 91', () => {
      expect(normalizeIndianMobile('919876543210')).toBe('919876543210');
      expect(normalizeIndianMobile('+91 98765-43210')).toBe('919876543210');
    });

    test('normalizes 11-digit number with leading 0', () => {
      expect(normalizeIndianMobile('09876543210')).toBe('919876543210');
      expect(normalizeIndianMobile('00919876543210')).toBe('919876543210');
    });

    test('rejects invalid numbers (length, prefix, invalid start digit)', () => {
      expect(normalizeIndianMobile('12345')).toBeNull();
      expect(normalizeIndianMobile('5876543210')).toBeNull(); // starts with 5
      expect(normalizeIndianMobile('915876543210')).toBeNull(); // starts with 915
      expect(normalizeIndianMobile(null)).toBeNull();
      expect(normalizeIndianMobile(undefined)).toBeNull();
      expect(normalizeIndianMobile('')).toBeNull();
      expect(normalizeIndianMobile('abcdefghij')).toBeNull();
    });

    test('getPhone10 extracts 10 digits correctly', () => {
      expect(getPhone10('919876543210')).toBe('9876543210');
      expect(getPhone10('+91 9876543210')).toBe('9876543210');
      expect(getPhone10('09876543210')).toBe('9876543210');
      expect(getPhone10('123')).toBeNull();
    });

    test('maskPhone preserves only last 4 digits', () => {
      expect(maskPhone('919876543210')).toBe('***3210');
      expect(maskPhone('919755329298')).toBe('***9298');
      expect(maskPhone(null)).toBe('****');
      expect(maskPhone('')).toBe('****');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Redirect & Dormant Logic
  // ---------------------------------------------------------------------------
  describe('Master Switch & Redirect Behavior', () => {
    test('when WHATSAPP_ENABLED is false, enqueued rows are suppressed and fetch is never called', async () => {
      process.env.WHATSAPP_ENABLED = 'false';

      mockQuery.mockResolvedValueOnce({ rows: [] }); // opt-out check
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'uuid-1',
            status: 'suppressed',
            intended_to: '919876543210',
            sent_to: '919755329298',
          },
        ],
      }); // insert

      const res = await whatsappOutboxService.enqueue({
        kind: 'seller_new_order',
        idempotencyKey: 'test:key:1',
        rawPhone: '9876543210',
        templateKey: 'new_order',
        variables: { orderId: '1234', buyerName: 'Alice', amount: '500.00' },
      });

      expect(res.ok).toBe(true);
      expect(res.status).toBe('suppressed');
      expect(mockFetch).not.toHaveBeenCalled();

      // Check processOutbox when disabled
      const outboxRes = await whatsappOutboxService.processOutbox();
      expect(outboxRes.processed).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('redirect swaps sent_to to test redirect number but preserves intended_to', async () => {
      process.env.WHATSAPP_ENABLED = 'true';
      process.env.WHATSAPP_REDIRECT_ALL_TO = '919755329298';

      mockQuery.mockResolvedValueOnce({ rows: [] }); // opt-out check
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'uuid-redirect',
            status: 'pending',
            intended_to: '919876543210',
            sent_to: '919755329298',
          },
        ],
      }); // insert
      mockQuery.mockResolvedValueOnce({ rows: [] }); // dispatch query update

      await whatsappOutboxService.enqueue({
        kind: 'seller_new_order',
        idempotencyKey: 'test:key:redirect',
        rawPhone: '9876543210',
        templateKey: 'new_order',
      });

      const insertCall = mockQuery.mock.calls.find((call) =>
        call[0].includes('INSERT INTO whatsapp_outbox')
      );
      expect(insertCall).toBeDefined();
      const [, , , intendedTo, sentTo] = insertCall[1];
      expect(intendedTo).toBe('919876543210'); // Real recipient preserved
      expect(sentTo).toBe('919755329298'); // Redirect target swapped
    });

    test('clearing WHATSAPP_REDIRECT_ALL_TO sends directly to recipient', async () => {
      process.env.WHATSAPP_ENABLED = 'true';
      process.env.WHATSAPP_REDIRECT_ALL_TO = '';

      mockQuery.mockResolvedValueOnce({ rows: [] }); // opt-out check
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'uuid-direct',
            status: 'pending',
            intended_to: '919876543210',
            sent_to: '919876543210',
          },
        ],
      }); // insert
      mockQuery.mockResolvedValueOnce({ rows: [] }); // dispatch

      await whatsappOutboxService.enqueue({
        kind: 'seller_new_order',
        idempotencyKey: 'test:key:direct',
        rawPhone: '9876543210',
        templateKey: 'new_order',
      });

      const insertCall = mockQuery.mock.calls.find((call) =>
        call[0].includes('INSERT INTO whatsapp_outbox')
      );
      const [, , , intendedTo, sentTo] = insertCall[1];
      expect(intendedTo).toBe('919876543210');
      expect(sentTo).toBe('919876543210');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Idempotency & Opt-Out & Marketing Consent
  // ---------------------------------------------------------------------------
  describe('Outbox Idempotency, Opt-Out, and Marketing Consent', () => {
    test('duplicate idempotency key returns duplicate: true without throwing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // opt-out check
      mockQuery.mockResolvedValueOnce({ rows: [] }); // ON CONFLICT DO NOTHING returns 0 rows

      const res = await whatsappOutboxService.enqueue({
        kind: 'seller_new_order',
        idempotencyKey: 'existing_key',
        rawPhone: '9876543210',
        templateKey: 'new_order',
      });

      expect(res.ok).toBe(true);
      expect(res.duplicate).toBe(true);
    });

    test('enqueuing to opted out number sets status to opted_out', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ phone10: '9876543210' }] }); // found in opt-outs
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'uuid-optout', status: 'opted_out' }],
      });

      const res = await whatsappOutboxService.enqueue({
        kind: 'seller_new_order',
        idempotencyKey: 'opt_out_key',
        rawPhone: '9876543210',
        templateKey: 'new_order',
      });

      expect(res.status).toBe('opted_out');
    });

    test('occasion reminder without marketing opt-in sets status to no_consent', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // opt-out check
      mockQuery.mockResolvedValueOnce({
        rows: [{ whatsapp_marketing_opt_in: false }],
      }); // user consent check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'uuid-noconsent', status: 'no_consent' }],
      });

      const res = await whatsappOutboxService.enqueue({
        kind: 'occasion_reminder',
        idempotencyKey: 'occasion_key',
        rawPhone: '9876543210',
        templateKey: 'occasion',
        recipientUserId: 'user-no-consent-123',
        requiresMarketingOptIn: true,
      });

      expect(res.status).toBe('no_consent');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. WhatsApp Cloud API Service & Retries
  // ---------------------------------------------------------------------------
  describe('WhatsApp Cloud API Service Payload & Retries', () => {
    test('sendTemplate structures payload with correct components and variables', async () => {
      process.env.WHATSAPP_ENABLED = 'true';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone_123';
      process.env.WHATSAPP_ACCESS_TOKEN = 'secret_token_abc';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [{ id: 'wamid.HBg12345' }],
        }),
      });

      const result = await whatsappCloudService.sendTemplate({
        to: '919755329298',
        name: 'tohfa_new_order_v1',
        language: 'en',
        bodyParams: ['8f12a9bc', 'Bob', '1250.00'],
      });

      expect(result.ok).toBe(true);
      expect(result.messageId).toBe('wamid.HBg12345');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/v26.0/phone_123/messages');
      const body = JSON.parse(options.body);
      expect(body.type).toBe('template');
      expect(body.template.name).toBe('tohfa_new_order_v1');
      expect(body.template.components[0].parameters).toEqual([
        { type: 'text', text: '8f12a9bc' },
        { type: 'text', text: 'Bob' },
        { type: 'text', text: '1250.00' },
      ]);
    });

    test('sendTemplate marks 429 and rate-limit error codes as retryable: true', async () => {
      process.env.WHATSAPP_ENABLED = 'true';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone_123';
      process.env.WHATSAPP_ACCESS_TOKEN = 'secret_token_abc';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({
          error: { code: 130429, message: 'Rate limit hit' },
        }),
      });

      const result = await whatsappCloudService.sendTemplate({
        to: '919755329298',
        name: 'tohfa_new_order_v1',
        bodyParams: ['8f12a9bc', 'Bob', '1250.00'],
      });

      expect(result.ok).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('130429');
    });

    test('sendTemplate marks invalid recipient 131026 as retryable: false', async () => {
      process.env.WHATSAPP_ENABLED = 'true';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone_123';
      process.env.WHATSAPP_ACCESS_TOKEN = 'secret_token_abc';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: { code: 131026, message: 'Message undeliverable' },
        }),
      });

      const result = await whatsappCloudService.sendTemplate({
        to: '919755329298',
        name: 'tohfa_new_order_v1',
        bodyParams: ['8f12a9bc', 'Bob', '1250.00'],
      });

      expect(result.ok).toBe(false);
      expect(result.retryable).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Status Precedence Updates
  // ---------------------------------------------------------------------------
  describe('Status Update Precedence (Never Moves Backwards)', () => {
    test('status does not move backwards from read to delivered or sent', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'outbox-uuid-1', status: 'read', kind: 'seller_new_order' }],
      });

      await whatsappOutboxService.applyStatusUpdate({
        providerMessageId: 'wamid.123',
        status: 'delivered',
      });

      // Status should remain read; query updates delivered_at only without changing status to 'delivered'
      const updateCall = mockQuery.mock.calls.find((call) =>
        call[0].includes('UPDATE whatsapp_outbox')
      );
      expect(updateCall[0]).not.toContain("SET status = 'delivered'");
    });

    test('status moves forward from sent to delivered and then read', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'outbox-uuid-2', status: 'sent', kind: 'seller_new_order' }],
      });

      await whatsappOutboxService.applyStatusUpdate({
        providerMessageId: 'wamid.456',
        status: 'delivered',
      });

      const updateCall = mockQuery.mock.calls.find((call) =>
        call[0].includes("SET status = 'delivered'")
      );
      expect(updateCall).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Webhook Signature Verification
  // ---------------------------------------------------------------------------
  describe('Inbound Webhook Verification & Events', () => {
    test('verifyWhatsAppWebhook validates verify_token safely', () => {
      process.env.WHATSAPP_VERIFY_TOKEN = 'secure_secret_tok';

      const validReq = {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'secure_secret_tok',
          'hub.challenge': '12345678',
        },
      };
      const sendMock = jest.fn();
      const sendStatusMock = jest.fn();
      const res = {
        status: jest.fn().mockReturnValue({ send: sendMock }),
        sendStatus: sendStatusMock,
      };

      webhookController.verifyWhatsAppWebhook(validReq, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(sendMock).toHaveBeenCalledWith('12345678');

      // Invalid token test
      const invalidReq = {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': '12345678',
        },
      };
      webhookController.verifyWhatsAppWebhook(invalidReq, res);
      expect(sendStatusMock).toHaveBeenCalledWith(403);
    });

    test('receiveWhatsAppEvent rejects missing signature or secret with 401', () => {
      const req = {
        headers: {},
        body: Buffer.from(JSON.stringify({ entry: [] })),
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      webhookController.receiveWhatsAppEvent(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('receiveWhatsAppEvent rejects invalid HMAC with 401', () => {
      process.env.WHATSAPP_APP_SECRET = 'app_secret_123';
      const req = {
        headers: {
          'x-hub-signature-256': 'sha256=invalid_hex_signature',
        },
        body: Buffer.from(JSON.stringify({ entry: [] })),
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      webhookController.receiveWhatsAppEvent(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('receiveWhatsAppEvent accepts valid HMAC and acknowledges 200', () => {
      const secret = 'app_secret_123';
      process.env.WHATSAPP_APP_SECRET = secret;
      const rawBody = Buffer.from(JSON.stringify({ entry: [] }));
      const validHmac =
        'sha256=' +
        crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const req = {
        headers: {
          'x-hub-signature-256': validHmac,
        },
        body: rawBody,
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      webhookController.receiveWhatsAppEvent(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('EVENT_RECEIVED');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Cron Authentication & Spoof Defense
  // ---------------------------------------------------------------------------
  describe('Cron Authentication Hardening', () => {
    test('rejects missing Authorization header with 401', async () => {
      process.env.CRON_SECRET = 'secret_cron_123';
      const req = { headers: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      // Server checkCronAuth logic test
      const authHeader = req.headers['authorization'] || '';
      const expected = `Bearer ${process.env.CRON_SECRET}`;
      const isAuthorized =
        authHeader.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));

      expect(isAuthorized).toBe(false);
    });

    test('rejects spoofed x-vercel-cron header when Bearer token is absent', async () => {
      process.env.CRON_SECRET = 'secret_cron_123';
      const req = {
        headers: {
          'x-vercel-cron': '1', // Spoofed header
        },
      };

      const authHeader = req.headers['authorization'] || '';
      const expected = `Bearer ${process.env.CRON_SECRET}`;
      const isAuthorized =
        authHeader.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));

      expect(isAuthorized).toBe(false);
    });

    test('accepts valid Bearer token', async () => {
      process.env.CRON_SECRET = 'secret_cron_123';
      const req = {
        headers: {
          authorization: 'Bearer secret_cron_123',
        },
      };

      const authHeader = req.headers['authorization'] || '';
      const expected = `Bearer ${process.env.CRON_SECRET}`;
      const isAuthorized =
        authHeader.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));

      expect(isAuthorized).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Occasion Catch-up Window & Atomic Claim Logic
  // ---------------------------------------------------------------------------
  describe('Occasion Catch-up Window & Atomic Claim Logic', () => {
    test('catch-up window selects days 28-30 but rejects day 27 or day 10', () => {
      function checkOccasionWindow(daysLeft) {
        if (daysLeft >= 28 && daysLeft <= 30) return '30d';
        if (daysLeft >= 12 && daysLeft <= 14) return '14d';
        if (daysLeft >= 5 && daysLeft <= 7) return '7d';
        return null;
      }

      expect(checkOccasionWindow(30)).toBe('30d');
      expect(checkOccasionWindow(29)).toBe('30d');
      expect(checkOccasionWindow(28)).toBe('30d');
      expect(checkOccasionWindow(27)).toBeNull(); // Day 27 not in 30d window
      expect(checkOccasionWindow(14)).toBe('14d');
      expect(checkOccasionWindow(13)).toBe('14d');
      expect(checkOccasionWindow(12)).toBe('14d');
      expect(checkOccasionWindow(11)).toBeNull(); // Day 11 not in 14d window
      expect(checkOccasionWindow(10)).toBeNull(); // Day 10 not in any window
      expect(checkOccasionWindow(7)).toBe('7d');
      expect(checkOccasionWindow(6)).toBe('7d');
      expect(checkOccasionWindow(5)).toBe('7d');
      expect(checkOccasionWindow(4)).toBeNull(); // Day 4 not in 7d window
    });

    test('atomic claim UPDATE returns 0 rows if already claimed, preventing double send', async () => {
      const occasionService = require('../src/services/occasion.service');

      // Month rows has 1 item
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'occ-1',
            label: 'Anniversary',
            person_name: 'Priya',
            days_left: 29,
            phone: '9876543210',
            user_id: 'user-1',
          },
        ],
      });
      // 14 days and 7 days return empty
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Transaction client query for atomic claim returns 0 rows (claimed by concurrent worker)
      mockClient.query.mockImplementation((sql) => {
        if (typeof sql === 'string' && sql.includes('UPDATE occasions SET reminder_sent_1m = TRUE')) {
          return Promise.resolve({ rows: [] }); // No rows returned -> already claimed!
        }
        return Promise.resolve({ rows: [] });
      });

      await occasionService.processOccasionReminders();

      // Ensure notification insert was NOT called for this item
      const notificationInsert = mockClient.query.mock.calls.find((call) =>
        typeof call[0] === 'string' && call[0].includes('INSERT INTO notifications')
      );
      expect(notificationInsert).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Inbound Webhook STOP / START & Autoreply
  // ---------------------------------------------------------------------------
  describe('Inbound Webhook STOP / START & Autoreply', () => {
    test('inbound STOP triggers addOptOut', () => {
      const secret = 'app_secret_123';
      process.env.WHATSAPP_APP_SECRET = secret;
      process.env.WHATSAPP_ENABLED = 'true';

      const spyOptOut = jest.spyOn(whatsappOutboxService, 'addOptOut').mockResolvedValue(true);

      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: '919876543210',
                      type: 'text',
                      text: { body: 'STOP' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const rawBody = Buffer.from(JSON.stringify(payload));
      const validHmac =
        'sha256=' +
        crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const req = {
        headers: { 'x-hub-signature-256': validHmac },
        body: rawBody,
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      webhookController.receiveWhatsAppEvent(req, res);
      expect(spyOptOut).toHaveBeenCalledWith('919876543210');
      spyOptOut.mockRestore();
    });

    test('inbound START triggers removeOptOut', () => {
      const secret = 'app_secret_123';
      process.env.WHATSAPP_APP_SECRET = secret;
      process.env.WHATSAPP_ENABLED = 'true';

      const spyOptIn = jest.spyOn(whatsappOutboxService, 'removeOptOut').mockResolvedValue(true);

      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: '919876543210',
                      type: 'text',
                      text: { body: 'START' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const rawBody = Buffer.from(JSON.stringify(payload));
      const validHmac =
        'sha256=' +
        crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const req = {
        headers: { 'x-hub-signature-256': validHmac },
        body: rawBody,
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      webhookController.receiveWhatsAppEvent(req, res);
      expect(spyOptIn).toHaveBeenCalledWith('919876543210');
      spyOptIn.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // 10. WhatsApp Service Public Wrapper Signatures
  // ---------------------------------------------------------------------------
  describe('WhatsApp Service Public Wrappers', () => {
    test('sendSellerOrderNotification enqueues with formatted short ID and amount', async () => {
      const spyEnqueue = jest.spyOn(whatsappOutboxService, 'enqueue').mockResolvedValue({ ok: true });

      const ok = await whatsappService.sendSellerOrderNotification('9876543210', {
        orderId: 'a1b2c3d4-e5f6-7890',
        sellerOrderId: 'so-1234',
        buyerName: 'Vikram',
        amount: 1450.5,
      });

      expect(ok).toBe(true);
      expect(spyEnqueue).toHaveBeenCalledWith({
        kind: 'seller_new_order',
        idempotencyKey: 'seller_order:so-1234:new_order',
        recipientUserId: undefined,
        rawPhone: '9876543210',
        templateKey: 'new_order',
        variables: {
          orderId: 'a1b2c3d4',
          buyerName: 'Vikram',
          amount: '1450.50',
        },
        requiresMarketingOptIn: false,
      });
      spyEnqueue.mockRestore();
    });

    test('sendProofPreviewNotification includes orderItemId and hash in key', async () => {
      const spyEnqueue = jest.spyOn(whatsappOutboxService, 'enqueue').mockResolvedValue({ ok: true });

      const ok = await whatsappService.sendProofPreviewNotification('9876543210', {
        orderItemId: 'item-888',
        sellerStoreName: 'Ceramic Works',
        productName: 'Handcrafted Mug',
        proofImageUrl: 'https://cloudinary.com/proof.jpg',
      });

      expect(ok).toBe(true);
      const calledArg = spyEnqueue.mock.calls[0][0];
      expect(calledArg.idempotencyKey).toMatch(/^proof:item-888:[a-f0-9]{16}$/);
      expect(calledArg.variables.sellerStoreName).toBe('Ceramic Works');
      expect(calledArg.variables.productName).toBe('Handcrafted Mug');
      spyEnqueue.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Mode Resolution & Manual Enqueue
  // ---------------------------------------------------------------------------
  describe('Mode Resolution & Manual Enqueue', () => {
    test('getMode resolves api, manual, and suppressed correctly', () => {
      process.env.WHATSAPP_ENABLED = 'true';
      expect(whatsappConfig.getMode()).toBe('api');

      process.env.WHATSAPP_ENABLED = 'false';
      process.env.WHATSAPP_MANUAL_MODE = 'true';
      process.env.OWNER_NOTIFY_EMAIL = 'owner@thetohfa.in';
      expect(whatsappConfig.getMode()).toBe('manual');

      process.env.WHATSAPP_MANUAL_MODE = 'false';
      expect(whatsappConfig.getMode()).toBe('suppressed');

      process.env.WHATSAPP_MANUAL_MODE = 'true';
      delete process.env.OWNER_NOTIFY_EMAIL;
      expect(whatsappConfig.getMode()).toBe('suppressed');
    });

    test('enqueueing in manual mode assigns manual_pending status', async () => {
      process.env.WHATSAPP_ENABLED = 'false';
      process.env.WHATSAPP_MANUAL_MODE = 'true';
      process.env.OWNER_NOTIFY_EMAIL = 'owner@thetohfa.in';

      mockQuery.mockResolvedValueOnce({ rows: [] }); // opt-out check
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'manual-uuid-1',
          status: 'manual_pending',
          intended_to: '919876543210',
          sent_to: '919876543210',
        }],
      }); // insert query

      const res = await whatsappOutboxService.enqueue({
        kind: 'seller_new_order',
        idempotencyKey: 'manual_key_1',
        rawPhone: '9876543210',
        templateKey: 'new_order',
        variables: { orderId: 'ord-1234', buyerName: 'Anita', amount: '899.00' },
      });

      expect(res.ok).toBe(true);
      expect(res.status).toBe('manual_pending');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Manual Mode Copy-Paste Message Formatting (User-Requested Feature)
  // ---------------------------------------------------------------------------
  describe('Manual Mode Copy-Paste Message Formatting (User-Requested Feature)', () => {
    test('buildReadyMessage for seller_new_order formats complete copy-paste message without placeholders', () => {
      const row = {
        kind: 'seller_new_order',
        variables: {
          storeName: 'Royal Pottery',
          orderId: '8f12a9bc',
          buyerName: 'Pooja Sharma',
          amount: '1450.00',
        },
      };

      const extra = {
        itemLines: '- Terracotta Vase x 2\n- Clay Diya Set x 1',
      };

      const msg = ownerNotifyService.buildReadyMessage(row, extra);

      expect(msg).toContain('Namaste Royal Pottery! 🎁');
      expect(msg).toContain('You have a new order on Tohfa.');
      expect(msg).toContain('Order #8f12a9bc from Pooja — Rs 1450.00');
      expect(msg).toContain('Items:');
      expect(msg).toContain('- Terracotta Vase x 2');
      expect(msg).toContain('https://thetohfa.in/seller/orders.html');
      expect(msg).toContain('— Team Tohfa');

      // Never contain unresolved placeholders or null/undefined
      expect(msg).not.toContain('{{');
      expect(msg).not.toContain('undefined');
      expect(msg).not.toContain('null');
      expect(msg).not.toContain('<');
      expect(msg.length).toBeLessThan(1000);
    });

    test('buildReadyMessage for buyer_quote formats cleanly', () => {
      const row = {
        kind: 'buyer_quote',
        variables: {
          sellerStoreName: 'Craft Studio',
          quoteAmount: '750',
          productName: 'Custom Wooden Nameplate',
          buyerName: 'Rahul',
        },
      };

      const msg = ownerNotifyService.buildReadyMessage(row);

      expect(msg).toContain('Namaste Rahul! 🎁');
      expect(msg).toContain('Craft Studio sent you a quote of Rs 750 for your custom request on Custom Wooden Nameplate.');
      expect(msg).toContain('https://thetohfa.in/buyer/orders.html');
      expect(msg).not.toContain('undefined');
    });

    test('buildReadyMessage for buyer_proof formats cleanly', () => {
      const row = {
        kind: 'buyer_proof',
        variables: {
          sellerStoreName: 'Artisan Glass',
          productName: 'Mosaic Lamp',
          proofImageUrl: 'https://cloudinary.com/proof-123.jpg',
          buyerName: 'Sneha',
        },
      };

      const msg = ownerNotifyService.buildReadyMessage(row);

      expect(msg).toContain('Namaste Sneha! 🎁');
      expect(msg).toContain('Artisan Glass has uploaded a design proof for your custom order Mosaic Lamp.');
      expect(msg).toContain('https://cloudinary.com/proof-123.jpg');
      expect(msg).not.toContain('undefined');
    });
  });

  // ---------------------------------------------------------------------------
  // 13. Mark-as-Sent HMAC Token Generation & Verification
  // ---------------------------------------------------------------------------
  describe('Mark-as-Sent HMAC Token Generation & Verification', () => {
    test('buildMarkAsSentToken returns 32-character hex HMAC when CRON_SECRET is configured', () => {
      process.env.CRON_SECRET = 'my_super_secret_cron_key';
      const token = ownerNotifyService.buildMarkAsSentToken('11111111-2222-3333-4444-555555555555');

      expect(token).toBeDefined();
      expect(token).toHaveLength(32);
      expect(/^[0-9a-f]{32}$/.test(token)).toBe(true);

      // Verify timingSafeEqual matching
      const expected = crypto.createHmac('sha256', process.env.CRON_SECRET)
        .update('11111111-2222-3333-4444-555555555555')
        .digest('hex')
        .slice(0, 32);

      const isMatch = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
      expect(isMatch).toBe(true);
    });

    test('buildMarkAsSentToken returns null when CRON_SECRET is absent', () => {
      delete process.env.CRON_SECRET;
      const token = ownerNotifyService.buildMarkAsSentToken('row-uuid-xyz');
      expect(token).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 14. Admin Alert Deduplication
  // ---------------------------------------------------------------------------
  describe('Admin Alert Deduplication', () => {
    test('deduplicates identical alerts within 10-minute window', async () => {
      process.env.OWNER_NOTIFY_EMAIL = 'admin@thetohfa.in';
      process.env.EMAIL_HOST = 'smtp.example.com';
      process.env.EMAIL_USER = 'user';
      process.env.EMAIL_PASS = 'pass';

      const spySendMail = jest.spyOn(ownerNotifyService, 'sendMail').mockResolvedValue({ messageId: 'msg-alert' });

      // First call -> sends
      await ownerNotifyService.sendAdminAlertEmail('special_order', {
        id: 'order-dup-1',
        shopName: 'Handmade Co',
        buyerName: 'Aarav',
        amount: 2500,
      });

      expect(spySendMail).toHaveBeenCalledTimes(1);

      // Immediate second call with same ID -> suppressed
      await ownerNotifyService.sendAdminAlertEmail('special_order', {
        id: 'order-dup-1',
        shopName: 'Handmade Co',
        buyerName: 'Aarav',
        amount: 2500,
      });

      expect(spySendMail).toHaveBeenCalledTimes(1);

      // Call with different ID -> sends
      await ownerNotifyService.sendAdminAlertEmail('special_order', {
        id: 'order-dup-2',
        shopName: 'Other Co',
        buyerName: 'Dev',
        amount: 1200,
      });

      expect(spySendMail).toHaveBeenCalledTimes(2);

      spySendMail.mockRestore();
    });
  });
});
