/**
 * Tohfa v2 — Tanya AI Gift Assistant Service
 * File: backend/src/services/tanya.service.js
 * Role: Powered by Google Gemini AI with strict live catalog grounding (BUG-09).
 *       Recommends only products actively listed and in stock on Tohfa,
 *       includes direct product links (/buyer/product.html?id=...),
 *       and provides thoughtful alternatives with polite follow-up questions.
 */
'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiModel } = require('../config/gemini');
const { query } = require('../config/db');

const apiKey = process.env.GEMINI_API_KEY;
const genAI = (apiKey && apiKey !== 'YOUR_GEMINI_API_KEY') ? new GoogleGenerativeAI(apiKey) : null;

/**
 * Fetch top active products from database to inject into Tanya's catalog knowledge (BUG-09)
 * Strict grounding query: SELECT id, name, base_price, slug, category_id FROM products WHERE ...
 */
async function getProductCatalogContext() {
  try {
    let products = [];
    try {
      const { rows } = await query(
        `SELECT p.id, p.name, p.base_price, p.description, p.category_id,
                COALESCE(c.slug, '') AS slug,
                COALESCE(c.name, 'Artisan Gift') AS category_name,
                COALESCE(sp.store_name, 'Tohfa Artisan') AS store_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
         WHERE p.status = 'active' AND p.stock_quantity > 0
         ORDER BY p.view_count DESC, p.created_at DESC
         LIMIT 50`
      );
      products = rows;
    } catch (sqlErr) {
      // Fallback query if JOINs differ
      const { rows } = await query(
        `SELECT id, name, base_price, description, category_id
         FROM products
         WHERE status = 'active' AND stock_quantity > 0
         LIMIT 50`
      );
      products = rows;
    }

    if (!products || !products.length) {
      return null;
    }

    const items = products.map(r => 
      `- [ID: ${r.id}] "${r.name}" by ${r.store_name || 'Artisan'} (Category: ${r.category_name || 'Gift'}) — ₹${r.base_price}. Direct Link: /buyer/product.html?id=${r.id}.${r.description ? ' Notes: ' + r.description.slice(0, 100) : ''}`
    );

    return `Available Products in Tohfa Live Inventory (Strict Grounding Catalog):\n${items.join('\n')}`;
  } catch (err) {
    console.error('[Tanya] Failed to fetch product catalog context:', err.message);
    return null;
  }
}

/**
 * Process a message from buyer and generate AI recommendations grounded in catalog
 * @param {string} userMessage
 * @param {Array<{role: string, parts: Array<{text: string}>}>} history
 * @returns {Promise<string>}
 */
async function chat(userMessage, history = []) {
  try {
    const catalogContext = await getProductCatalogContext();

    if (!catalogContext) {
      return "Namaste! ✨ Explore our popular categories like Candles, Pottery, and Custom Portraits at [Browse Categories](/buyer/categories.html).";
    }

    const systemInstruction = `You are Tanya, Tohfa's friendly, warm, and expert AI Gift Assistant (AI Gift Guide) at thetohfa.in.
Tohfa is an artisanal marketplace for handcrafted and personalized gifts made by independent Indian sellers and makers.

Strict Grounding Rules (BUG-09):
1. Opening Style: Warm, respectful Indian hospitality ("Namaste! 🎁").
2. Catalog Grounding: Recommend ONLY real products from Tohfa's active catalog provided below. NEVER hallucinate or invent products, brand names, or catalog items not listed in this inventory.
3. Direct Product Links: When recommending any item, ALWAYS include:
   - Exact product name
   - Price in INR (e.g. ₹1,299)
   - Maker / Store name
   - Direct link in markdown format: [Product Name](/buyer/product.html?id=<product_id>) or /buyer/product.html?id=<product_id> using the EXACT product ID from the inventory list.
   - Why it's a thoughtful, authentic gift for the recipient/occasion.
4. Thoughtful Alternatives: If the user asks for something not directly in stock, suggest the closest handcrafted alternative from the catalog and ask engaging follow-up questions (e.g. recipient's hobbies, budget, occasion date).
5. Never Fabricate URLs: Only use links formatted as /buyer/product.html?id=<product_id> matching the real product IDs provided.
6. Tone: Polite, charming, concise, helpful, and never repetitive.

${catalogContext}`;

    if (!genAI && !geminiModel) {
      return `Namaste! 🎁 I am Tanya. I'd love to help you find the perfect gift! Explore our curated categories or let me know the occasion, recipient, and budget you're shopping for! You can also check our featured collections directly at /buyer/categories.html.`;
    }

    const formattedHistory = Array.isArray(history) ? history.map(item => ({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.parts?.[0]?.text || item.text || String(item) }]
    })) : [];

    let modelToUse = geminiModel;
    if (genAI) {
      modelToUse = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemInstruction }],
        },
      });
    }

    const chatSession = modelToUse.startChat({
      history: formattedHistory,
      systemInstruction: {
        role: 'system',
        parts: [{ text: systemInstruction }],
      },
    });

    const result = await chatSession.sendMessage(userMessage);
    return result.response.text();
  } catch (err) {
    console.error('[Tanya] Chat generation error:', err.message);
    return `Namaste! 🎁 I'm currently checking our latest artisan collections. Could you tell me a bit more about the occasion and your budget? You can also browse our curated categories at /buyer/categories.html anytime!`;
  }
}

module.exports = {
  chat,
  getProductCatalogContext,
};


