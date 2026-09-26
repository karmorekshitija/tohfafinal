/**
 * Tohfa v2 — Tanya AI Gift Assistant Service
 * Connects directly to Google Gemini API (gemini-1.5-flash) and queries live PostgreSQL catalog.
 */
'use strict';

const { GoogleGenAI } = require('@google/genai');
const { query } = require('../config/db');

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment variables. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env and restart the server.');
  }
  return new GoogleGenAI({ apiKey });
}

const systemInstruction = `
You are "Tanya", the AI Concierge for Tohfa (thetohfa.in) - an online marketplace for authentic Indian handmade, customized, and artisanal gifts.

YOUR BEHAVIOR:

INTENT RECOGNITION:

Gifting / Shopping: If the user is looking for gifts, occasions (birthdays, anniversaries, corporate, festive), recommend suitable categories and product ideas. Return relevant product suggestions from the catalog.

Support / Issue Inquiries: If the user mentions an order issue, shipping delay, payment problem, refund, bug, complaint, or any support topic — respond with empathetic support guidance ONLY. Direct them to the Orders tab in their profile or to tohfa126@gmail.com. Do NOT recommend products. Return products: [].

Conversational: For greetings or questions about Tohfa, respond warmly and concisely.

CRITICAL RULE: Never recommend gift products when the user is reporting an issue or seeking support. Keep the two intents strictly separate.

FORMATTING: Never use Markdown formatting in your responses. Do not use asterisks (*) for bold or italic text. If you want to list items, use standard hyphens (-) instead.

TONE: Warm, helpful, professional, polite. Keep responses concise (under 3-4 sentences unless detailed recommendations are asked).
`;

async function getActiveProducts() {
  try {
    const { rows } = await query(
      `SELECT p.id, p.name, p.base_price AS price, p.slug, p.images[1] AS cover_image, c.name AS category_name
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
      cover_image: p.cover_image || null,
      slug: p.slug,
      category_name: p.category_name || 'Handcrafted Gift'
    }));
  } catch (err) {
    console.error('[Tanya] Error fetching active catalog products:', err.message);
    return [];
  }
}

// Fallback models in priority order
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash'];

async function chat(userMessage, history = []) {
  const lowerMessage = (userMessage || '').toLowerCase();
  const supportKeywords = ['order', 'stuck', 'bug', 'issue', 'problem', 'payment', 'failed', 'refund', 'seller', 'shipping', 'delivery', 'support', 'cancel', 'complaint', 'tracking', 'return', 'exchange', 'dispute'];
  const isSupportQuery = supportKeywords.some(kw => lowerMessage.includes(kw));

  let activeProducts = [];
  try {
    // ── Catalog retrieval: isolated try/catch so a DB error NEVER kills the chat ──
    let catalogContext = '';
    try {
      const { rows: products } = await query(
        `SELECT p.id, p.name, p.base_price AS price, p.slug, p.images[1] AS cover_image, c.name AS category_name
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
        cover_image: p.cover_image || null,
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

    const prompt = `
Live Platform Catalog:
${catalogContext}

User Query: "${userMessage}"

Respond directly to the user following your system instructions.
If the user is asking for gifts and any catalog items fit, mention 2-3 specific product names from the catalog above.
If they are reporting an issue, shipping problem, order query, or any support concern, answer their support request directly and direct them to their Orders tab or tohfa126@gmail.com — do NOT recommend products.
`;

    let responseText = null;
    let lastError = null;

    try {
      const ai = getGeminiClient();

      // Try primary model first, then secondary fallback model
      for (const modelName of GEMINI_MODELS) {
        try {
          const result = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { systemInstruction }
          });
          if (result && result.text) {
            responseText = result.text;
            break; // Succeeded!
          }
        } catch (modelErr) {
          lastError = modelErr;
          console.warn(`[Tanya] Model '${modelName}' attempt failed:`, modelErr.message);
        }
      }
    } catch (clientErr) {
      lastError = clientErr;
      console.warn('[Tanya] Gemini client initialization error:', clientErr.message);
    }

    // If all AI models failed or experienced high-demand/service spikes, activate graceful fallback
    if (!responseText) {
      console.warn('[Tanya] All Gemini models unavailable. Activating resilient fallback response.');

      if (isSupportQuery) {
        return {
          success: true,
          data: {
            reply: "I am sorry to hear you are having an issue. For payment, order, or delivery queries, please check the Orders section in your profile or email our support team directly at tohfa126@gmail.com with your order details. We will resolve it for you as quickly as possible.",
            products: []
          }
        };
      }

      // Gifting query fallback: provide top catalog products
      if (activeProducts.length > 0) {
        const fallbackProducts = activeProducts.slice(0, 3).map(p => ({
          id: p.id,
          name: p.name,
          base_price: p.base_price,
          cover_image: p.cover_image,
          category_name: p.category_name,
          link: `/buyer/product.html?id=${p.id}`
        }));
        return {
          success: true,
          data: {
            reply: "Namaste! Here are some of our popular handcrafted treasures from the Tohfa catalog. Feel free to browse through them or reach out to us at tohfa126@gmail.com for personalized gifting help.",
            products: fallbackProducts
          }
        };
      }

      return {
        success: true,
        data: {
          reply: "Namaste! I'm Tanya, your Tohfa gift companion. Please explore our handcrafted collection or write to tohfa126@gmail.com for help.",
          products: []
        }
      };
    }

    // AI generated a response: filter products if shopping vs support
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
        cover_image: p.cover_image,
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
    console.error('[Tanya] Unexpected Chat Error:', error.message);
    return {
      success: true,
      data: {
        reply: isSupportQuery
          ? "We apologize for the trouble. Please check the Orders tab in your profile or contact tohfa126@gmail.com with your details, and our team will assist you right away."
          : "Namaste! We are experiencing a brief connection glitch. Please browse our collections above or reach out to tohfa126@gmail.com.",
        products: []
      }
    };
  }
}

module.exports = { chat, getActiveProducts };
