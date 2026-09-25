/**
 * Tohfa v2 — Tanya AI Gift Assistant Service
 * Connects directly to Google Gemini API (gemini-1.5-flash) and queries live PostgreSQL catalog.
 */
'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { query } = require('../config/db');

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment variables. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env and restart the server.');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: `
You are "Tanya", the AI Concierge for Tohfa (thetohfa.in) - an online marketplace for authentic Indian handmade, customized, and artisanal gifts.

YOUR BEHAVIOR:

INTENT RECOGNITION:

Gifting / Shopping: If the user is looking for gifts, occasions (birthdays, anniversaries, corporate, festive), recommend suitable categories and product ideas. Return relevant product suggestions from the catalog.

Support / Issue Inquiries: If the user mentions an order issue, shipping delay, payment problem, refund, bug, complaint, or any support topic — respond with empathetic support guidance ONLY. Direct them to the Orders tab in their profile or to tohfa126@gmail.com. Do NOT recommend products. Return products: [].

Conversational: For greetings or questions about Tohfa, respond warmly and concisely.

CRITICAL RULE: Never recommend gift products when the user is reporting an issue or seeking support. Keep the two intents strictly separate.

TONE: Warm, helpful, professional, polite. Keep responses concise (under 3-4 sentences unless detailed recommendations are asked).
`
  });
}

async function getActiveProducts() {
  try {
    const { rows } = await query(
      `SELECT p.id, p.name, COALESCE(p.base_price, p.price, 0) AS price, p.slug, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = TRUE
       ORDER BY p.created_at DESC
       LIMIT 20;`
    );
    return rows.map(p => ({
      id: p.id,
      name: p.name,
      base_price: p.price,
      price: p.price,
      slug: p.slug,
      category_name: p.category_name || 'Handcrafted Gift'
    }));
  } catch (err) {
    console.error('[Tanya] Error fetching active catalog products:', err.message);
    return [];
  }
}

async function chat(userMessage, history = []) {
  try {
    // ── Catalog retrieval: isolated try/catch so a DB error NEVER kills the chat ──
    let activeProducts = [];
    let catalogContext = '';
    try {
      const { rows: products } = await query(
        `SELECT p.id, p.name, COALESCE(p.base_price, p.price, 0) AS price, p.slug, c.name AS category_name
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.is_active = TRUE
         ORDER BY p.created_at DESC
         LIMIT 15;`
      );
      activeProducts = products.map(p => ({
        id: p.id,
        name: p.name,
        base_price: p.price,
        price: p.price,
        slug: p.slug,
        category_name: p.category_name || 'Handmade'
      }));
      catalogContext = activeProducts.length > 0
        ? activeProducts.map(p => `- ${p.name} (₹${p.price}, ${p.category_name})`).join('\n')
        : 'Catalog is currently empty.';
    } catch (dbErr) {
      console.warn('[Tanya] Non-fatal catalog query warning:', dbErr.message);
      // Fallback: chat still works for policy/support questions without product data
      catalogContext = 'Marketplace items: Handmade gifts, candles, hampers, personalized crafts.';
    }

    // getGeminiModel() throws a clear error if the API key is missing or placeholder
    const model = getGeminiModel();

    const prompt = `
Live Platform Catalog:
${catalogContext}

User Query: "${userMessage}"

Respond directly to the user following your system instructions.
If the user is asking for gifts and any catalog items fit, mention 2-3 specific product names from the catalog above.
If they are reporting an issue, shipping problem, order query, or any support concern, answer their support request directly and direct them to their Orders tab or tohfa126@gmail.com — do NOT recommend products.
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const lowerMessage = userMessage.toLowerCase();
    const supportKeywords = ['order', 'stuck', 'bug', 'issue', 'problem', 'payment', 'failed', 'refund', 'seller', 'shipping', 'delivery', 'support', 'cancel', 'complaint', 'tracking', 'return', 'exchange', 'dispute'];
    const isSupportQuery = supportKeywords.some(kw => lowerMessage.includes(kw));

    let matchedProducts = [];
    if (!isSupportQuery) {
      const lowerResponse = responseText.toLowerCase();
      matchedProducts = activeProducts.filter(p =>
        lowerResponse.includes(p.name.toLowerCase()) ||
        (p.category_name && lowerResponse.includes(p.category_name.toLowerCase()))
      ).slice(0, 3).map(p => ({
        id: p.id,
        name: p.name,
        base_price: p.base_price,
        category_name: p.category_name,
        link: `/buyer/product.html?id=${p.id}`
      }));
    }

    return {
      success: true,
      data: {
        reply: responseText,
        products: matchedProducts // Always [] for support queries
      }
    };
  } catch (error) {
    console.error('[Tanya] Gemini API Error:', error.message);
    return {
      success: false,
      statusCode: 500,
      message: `Tanya service error: ${error.message}`
    };
  }
}

module.exports = { chat, getActiveProducts };
