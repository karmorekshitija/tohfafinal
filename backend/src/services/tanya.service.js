/**
 * Tohfa v2 - Tanya AI Gift Assistant Service
 * Falls back to smart keyword-based catalog search when no Gemini API key is present.
 */
'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiModel } = require('../config/gemini');
const { query } = require('../config/db');

const apiKey = process.env.GEMINI_API_KEY;
const genAI = (apiKey && apiKey !== 'YOUR_GEMINI_API_KEY') ? new GoogleGenerativeAI(apiKey) : null;

const OCCASION_SYNONYMS = {
  'birthday': ['gift', 'celebration', 'candle', 'jewellery', 'nails', 'floral', 'personalized'],
  'wedding': ['bridal', 'couple', 'gift', 'candle', 'floral', 'hamper', 'ritual'],
  'anniversary': ['couple', 'romantic', 'candle', 'floral', 'gift', 'keepsake', 'personalized'],
  'housewarming': ['home decor', 'candle', 'plant', 'vase', 'ceramic', 'sculpture'],
  'baby shower': ['baby', 'gift', 'handcrafted', 'soft', 'keepsake'],
  'diwali': ['diya', 'candle', 'gift', 'festive', 'hamper', 'home decor'],
  'christmas': ['gift', 'candle', 'ornament', 'hamper', 'festive'],
  'mother': ['floral', 'jewellery', 'candle', 'gift', 'keepsake', 'handmade'],
  'father': ['personalized', 'keepsake', 'handcrafted', 'gift'],
  'graduation': ['gift', 'keepsake', 'personalized', 'celebration'],
  'valentine': ['romantic', 'candle', 'floral', 'couple', 'gift', 'jewellery'],
  'raksha bandhan': ['gift', 'hamper', 'handcrafted', 'festive'],
  'gift': ['hamper', 'keepsake', 'personalized', 'handcrafted'],
};

async function smartCatalogSearch(userMessage) {
  try {
    const lowerMsg = userMessage.toLowerCase();
    const extraTerms = [];
    for (const [key, synonyms] of Object.entries(OCCASION_SYNONYMS)) {
      if (lowerMsg.includes(key)) extraTerms.push(...synonyms);
    }
    const words = lowerMsg.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
    const allTerms = [...new Set([...words, ...extraTerms])].slice(0, 10);
    if (!allTerms.length) return null;
    const conditions = allTerms.map((_, i) =>
      `(p.name ILIKE $${i + 1} OR array_to_string(p.tags, ' ') ILIKE $${i + 1} OR c.name ILIKE $${i + 1})`
    ).join(' OR ');
    const params = allTerms.map(t => `%${t}%`);
    const { rows } = await query(
      `SELECT p.id, p.name, p.base_price, p.description, c.name AS category_name,
              COALESCE(sp.store_name, 'Artisan Studio') AS store_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
       WHERE (p.status = 'active' OR p.is_active = TRUE)
         AND p.stock_quantity > 0
         AND (${conditions})
       ORDER BY p.view_count DESC, p.created_at DESC
       LIMIT 5`,
      params
    );
    return rows;
  } catch (err) {
    console.error('[Tanya] Smart catalog search error:', err.message);
    return null;
  }
}

function formatProductsAsReply(products, userMessage) {
  const lowerMsg = userMessage.toLowerCase();
  let occasion = 'a special occasion';
  for (const key of Object.keys(OCCASION_SYNONYMS)) {
    if (lowerMsg.includes(key)) { occasion = key; break; }
  }
  let reply = `Namaste! 🎁 Here are some handcrafted treasures from Tohfa perfect for **${occasion}**:\n\n`;
  products.forEach((p, i) => {
    const price = `₹${Number(p.base_price).toLocaleString('en-IN')}`;
    const link = `/buyer/product.html?id=${p.id}`;
    reply += `**${i + 1}. [${p.name}](${link})** — ${price}\n`;
    reply += `   *By ${p.store_name}* · ${p.category_name || 'Artisan Gift'}\n`;
    if (p.description) reply += `   ${p.description.slice(0, 90)}...\n`;
    reply += '\n';
  });
  reply += `\n💬 Want me to help narrow it down? Tell me the **recipient's age**, **your budget**, or **any personal preferences**!`;
  return reply;
}

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
      const { rows } = await query(`SELECT id, name, base_price, description, category_id FROM products WHERE status = 'active' AND stock_quantity > 0 LIMIT 50`);
      products = rows;
    }
    if (!products || !products.length) return null;
    const items = products.map(r =>
      `- [ID: ${r.id}] "${r.name}" by ${r.store_name || 'Artisan'} (Category: ${r.category_name || 'Gift'}) — ₹${r.base_price}. Direct Link: /buyer/product.html?id=${r.id}.${r.description ? ' Notes: ' + r.description.slice(0, 100) : ''}`
    );
    return `Available Products in Tohfa Live Inventory:\n${items.join('\n')}`;
  } catch (err) {
    console.error('[Tanya] Failed to fetch product catalog context:', err.message);
    return null;
  }
}

async function chat(userMessage, history = []) {
  try {
    if (!genAI && !geminiModel) {
      const catalogProducts = await smartCatalogSearch(userMessage);
      if (catalogProducts && catalogProducts.length > 0) {
        return formatProductsAsReply(catalogProducts, userMessage);
      }
      return `Namaste! 🎁 I am Tanya, your Tohfa gift guide.\n\nExplore our handcrafted collections:\n\n- 🕯️ [Candles & Aromatherapy](/buyer/category.html?slug=candles-aromatherapy)\n- 💐 [Floral & Bouquets](/buyer/category.html?slug=floral-bouquets)\n- 💍 [Jewellery & Wearables](/buyer/category.html?slug=jewellery-wearables)\n- 🎁 [Gifts & Keepsakes](/buyer/category.html?slug=gifts-keepsakes)\n\n💬 Tell me the **occasion**, **recipient**, and **budget**!`;
    }
    const catalogContext = await getProductCatalogContext();
    const systemInstruction = `You are Tanya, Tohfa's friendly AI Gift Assistant. Recommend ONLY real products from the catalog below. Always include direct product links like [Name](/buyer/product.html?id=ID).\n\n${catalogContext || 'Catalog unavailable - guide to /buyer/categories.html'}`;
    const formattedHistory = Array.isArray(history) ? history.map(item => ({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.parts?.[0]?.text || item.text || String(item) }]
    })) : [];
    let modelToUse = geminiModel;
    if (genAI) {
      modelToUse = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] } });
    }
    const chatSession = modelToUse.startChat({ history: formattedHistory, systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] } });
    const result = await chatSession.sendMessage(userMessage);
    return result.response.text();
  } catch (err) {
    console.error('[Tanya] Chat generation error:', err.message);
    try {
      const fp = await smartCatalogSearch(userMessage);
      if (fp && fp.length > 0) return formatProductsAsReply(fp, userMessage);
    } catch (_) {}
    return `Namaste! 🎁 Tell me the **occasion**, **recipient**, and **budget** and I'll find the perfect handcrafted match!`;
  }
}

module.exports = { chat, getProductCatalogContext };
