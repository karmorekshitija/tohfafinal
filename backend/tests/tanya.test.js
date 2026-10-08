/**
 * Unit & Integration Tests for Tanya AI Assistant Service
 * File: backend/tests/tanya.test.js
 */
'use strict';

const tanyaService = require('../src/services/tanya.service');

describe('Tanya AI Service Tests', () => {
  describe('Support Query Detection', () => {
    const supportQueries = [
      "i didn't got y parcel",
      "parcel not delivery",
      "package delayed",
      "where is my shipment",
      "my order is stuck",
      "haven't received my item yet",
      "payment failed refund money",
      "want to return and get exchange",
      "courier tracking status",
      "i did not get my parcel",
      "didn't get delivery",
      "when will it arrive"
    ];

    test.each(supportQueries)('should identify "%s" as a support query', (query) => {
      expect(tanyaService.isSupportQuery(query)).toBe(true);
    });

    const nonSupportQueries = [
      "gift for mom",
      "anniversary gift for girlfriend",
      "birthday surprise for brother",
      "looking for handmade candles",
      "wooden photo frame for dad",
      "festive diwali hampers"
    ];

    test.each(nonSupportQueries)('should NOT identify "%s" as a support query', (query) => {
      expect(tanyaService.isSupportQuery(query)).toBe(false);
    });

    test('fallback response returns products: [] for support queries', () => {
      const mockCatalog = [
        { id: '1', name: 'Scented Candle', base_price: 499, category_name: 'Candles & Aromatherapy', occasions: [] },
        { id: '2', name: 'Photo Frame', base_price: 799, category_name: 'Frames', occasions: [] }
      ];

      const res = tanyaService.generateFallbackResponse("i didn't got y parcel", mockCatalog);
      expect(res.products).toEqual([]);
      expect(res.reply).toContain('Orders tab');
      expect(res.reply).toContain('tohfa126@gmail.com');
    });
  });

  describe('Contextual Recipient and Occasion Matching', () => {
    test('detects recipient: mom', () => {
      const detected = tanyaService.detectRecipientAndOccasion("suggest a birthday gift for my mom");
      expect(detected.recipient).toBeTruthy();
      expect(detected.recipient.key).toBe('mom');
      expect(detected.occasion).toBeTruthy();
      expect(detected.occasion.key).toBe('birthday');
    });

    test('detects recipient: girlfriend and occasion: anniversary', () => {
      const detected = tanyaService.detectRecipientAndOccasion("anniversary gift for girlfriend");
      expect(detected.recipient).toBeTruthy();
      expect(detected.recipient.key).toBe('girlfriend');
      expect(detected.occasion).toBeTruthy();
      expect(detected.occasion.key).toBe('anniversary');
    });

    test('detects recipient: brother', () => {
      const detected = tanyaService.detectRecipientAndOccasion("customized gift for my brother");
      expect(detected.recipient).toBeTruthy();
      expect(detected.recipient.key).toBe('brother');
    });

    test('detects recipient: dad', () => {
      const detected = tanyaService.detectRecipientAndOccasion("best wooden keepsake for dad");
      expect(detected.recipient).toBeTruthy();
      expect(detected.recipient.key).toBe('dad');
    });

    test('ranks products tailored for mom in fallback response', () => {
      const mockCatalog = [
        { id: 'p1', name: 'Handcrafted Desk Clock', base_price: 999, category_name: 'Frames', description: 'Wood desk accessory', occasions: [] },
        { id: 'p2', name: 'Aroma Lavender Scented Candle', base_price: 599, category_name: 'Candles & Aromatherapy', description: 'Relaxing aroma for mom', occasions: ['birthday'] },
        { id: 'p3', name: 'Customized Mom Photo Frame', base_price: 799, category_name: 'Frames', description: 'Special photo frame for mother', occasions: ['birthday'] }
      ];

      const res = tanyaService.generateFallbackResponse("birthday gift for mom", mockCatalog);
      expect(res.products.length).toBeGreaterThan(0);
      expect(res.reply).toContain('mom');
      expect(res.products[0].name).toMatch(/Candle|Frame/);
    });
  });

  describe('Chat method with support query', () => {
    test('chat returns empty products for parcel inquiry', async () => {
      const res = await tanyaService.chat("parcel not delivery");
      expect(res.success).toBe(true);
      expect(res.data.products).toEqual([]);
      expect(res.data.reply).toContain('tohfa126@gmail.com');
    });
  });
});
