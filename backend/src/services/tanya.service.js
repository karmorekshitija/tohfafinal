/**
 * Tohfa v2 — Tanya AI Gift Assistant Service
 * File: backend/src/services/tanya.service.js
 * Connects directly to Google Gemini API (gemini-1.5-flash) with robust catalog fallback.
 */
'use strict';

const { GoogleGenAI } = require('@google/genai');
const { query } = require('../config/db');

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

const systemInstruction = `
You are "Tanya", the AI Concierge for Tohfa (thetohfa.in) - an online marketplace for authentic Indian handmade, customized, and artisanal gifts.

YOUR BEHAVIOR:
1. Gifting / Shopping: If the user is looking for gifts or occasions (birthdays, anniversaries, corporate, festive, weddings), recommend suitable categories and product ideas. Mention 2-3 specific product names from the live catalog provided.
2. Support / Issue Inquiries: If the user mentions an order issue, shipping delay, payment problem, refund, bug, or complaint, respond with empathetic support guidance ONLY. Direct them to their Orders tab or to tohfa126@gmail.com. Do NOT recommend products for support queries.
3. Conversational: For greetings or questions about Tohfa, respond warmly, politely, and concisely.

RULES:
- Never recommend gift products when the user is reporting an issue or seeking support.
- FORMATTING: Never use raw Markdown asterisks (*) for bold or italic text. If listing items, use standard hyphens (-) instead.
- TONE: Warm, graceful, professional, and concise (under 3-4 sentences).
`;

async function getActiveProducts(limit = 15) {
  try {
    const { rows } = await query(
      `SELECT p.id, p.name, p.base_price AS price, p.slug, c.name AS category_name,
              COALESCE(sp.store_name, 'Artisan Studio') AS store_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
       WHERE p.status = 'active' OR p.is_active = TRUE
       ORDER BY p.created_at DESC
       LIMIT $1;`,
      [limit]
    );
    return rows.map(p => ({
      id: p.id,
      name: p.name,
      base_price: p.price,
      price: p.price,
      slug: p.slug,
      store_name: p.store_name,
      category_name: p.category_name || 'Handcrafted Gift'
    }));
  } catch (err) {
    console.error('[Tanya] Error fetching active catalog products:', err.message);
    return [];
  }
}

/**
 * Smart offline fallback in case Gemini API is down, slow, or unconfigured
 */
function generateFallbackResponse(userMessage, activeProducts) {
  const lower = userMessage.toLowerCase();
  const supportKeywords = ['order', 'stuck', 'bug', 'issue', 'problem', 'payment', 'failed', 'refund', 'seller', 'shipping', 'delivery', 'support', 'cancel', 'complaint', 'tracking', 'return', 'exchange', 'contact'];
  const isSupport = supportKeywords.some(kw => lower.includes(kw));

  if (isSupport) {
    return {
      reply: "I am here to help. For real-time updates regarding your order, dispatch status, or refunds, please visit your Orders tab or reach our direct support team at tohfa126@gmail.com. We are happy to assist you.",
      products: []
    };
  }

  const sampleProducts = activeProducts.slice(0, 3).map(p => ({
    id: p.id,
    name: p.name,
    base_price: p.base_price,
    store_name: p.store_name,
    category_name: p.category_name,
    link: `/buyer/product.html?id=${p.id}`
  }));

  return {
    reply: "Welcome to Tohfa! I would love to help you discover authentic handcrafted creations from artisan studios across India. Here are some of our trending gifts to explore:",
    products: sampleProducts
  };
}

async function chat(userMessage, history = []) {
  const activeProducts = await getActiveProducts(15);
  const catalogContext = activeProducts.length > 0
    ? activeProducts.map(p => `- ${p.name} (₹${p.base_price}, ${p.category_name})`).join('\n')
    : 'Handmade scented candles, customized resin art, personalized jewelry, artisanal gift hampers.';

  const ai = getGeminiClient();

  // If no Gemini API key is configured, gracefully fall back immediately
  if (!ai) {
    console.warn('[Tanya] No Gemini API key found. Using catalog fallback.');
    return {
      success: true,
      data: generateFallbackResponse(userMessage, activeProducts)
    };
  }

  const prompt = `
Live Platform Catalog:
${catalogContext}

User Query: "${userMessage}"

Respond directly to the user following your system instructions.
If the user is asking for gift recommendations, mention 2-3 specific product names from the catalog.
If they are reporting an issue, shipping problem, or support inquiry, answer their support request directly and direct them to their Orders tab or tohfa126@gmail.com — do NOT recommend products.
`;

  try {
    // 8-second timeout promise race to prevent user-facing lag
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API timeout')), 8000)
    );

    const apiPromise = ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 450
      }
    });

    const result = await Promise.race([apiPromise, timeoutPromise]);
    const responseText = result?.text || '';

    const lowerMessage = userMessage.toLowerCase();
    const supportKeywords = ['order', 'stuck', 'bug', 'issue', 'problem', 'payment', 'failed', 'refund', 'seller', 'shipping', 'delivery', 'support', 'cancel', 'complaint', 'tracking', 'return', 'exchange', 'contact'];
    const isSupportQuery = supportKeywords.some(kw => lowerMessage.includes(kw));

    let matchedProducts = [];
    if (!isSupportQuery && responseText) {
      const lowerResponse = responseText.toLowerCase();
      matchedProducts = activeProducts.filter(p =>
        lowerResponse.includes(p.name.toLowerCase()) ||
        (p.category_name && lowerResponse.includes(p.category_name.toLowerCase()))
      ).slice(0, 3).map(p => ({
        id: p.id,
        name: p.name,
        base_price: p.base_price,
        store_name: p.store_name,
        category_name: p.category_name,
        link: `/buyer/product.html?id=${p.id}`
      }));

      // If Gemini didn't mention exact names, provide top catalog items
      if (matchedProducts.length === 0 && activeProducts.length > 0) {
        matchedProducts = activeProducts.slice(0, 3).map(p => ({
          id: p.id,
          name: p.name,
          base_price: p.base_price,
          store_name: p.store_name,
          category_name: p.category_name,
          link: `/buyer/product.html?id=${p.id}`
        }));
      }
    }

    return {
      success: true,
      data: {
        reply: responseText,
        products: matchedProducts
      }
    };
  } catch (error) {
    console.warn('[Tanya] Gemini call failed or timed out:', error.message, '— Activating fallback.');
    // Never crash the chat. Return clean catalog fallback instead.
    return {
      success: true,
      data: generateFallbackResponse(userMessage, activeProducts)
    };
  }
}

module.exports = { chat, getActiveProducts };
