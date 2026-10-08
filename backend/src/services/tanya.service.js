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
1. Gifting / Shopping: If the user is looking for gifts or occasions (birthdays, anniversaries, corporate, festive, weddings, gifts for mom, dad, girlfriend, boyfriend, etc.), recommend suitable categories and product ideas. Mention 2-3 specific product names from the live catalog provided.
2. Support / Issue Inquiries: If the user mentions an order issue, parcel delivery delay, shipping problem, payment problem, refund, bug, or complaint, respond with empathetic support guidance ONLY. Direct them to their Orders tab or to tohfa126@gmail.com. Do NOT recommend products for support queries.
3. Conversational: For greetings or questions about Tohfa, respond warmly, politely, and concisely.

RULES:
- Never recommend gift products when the user is reporting an issue, parcel problem, or seeking support.
- FORMATTING: Never use raw Markdown asterisks (*) for bold or italic text. If listing items, use standard hyphens (-) instead.
- TONE: Warm, graceful, professional, and concise (under 3-4 sentences).
`;

const RECIPIENT_PATTERNS = [
  {
    key: 'mom',
    match: /\b(mom|mother|maa|ammi|mummy|mum|mommy)\b/i,
    label: 'mom',
    categories: ['candles & aromatherapy', 'floral bouquets', 'frames', 'gifts & keepsakes', 'hair accessories', 'nails & beauty'],
    keywords: ['candle', 'frame', 'keepsake', 'flower', 'bouquet', 'aroma', 'diffuser', 'lamp', 'photo', 'mom', 'mother']
  },
  {
    key: 'dad',
    match: /\b(dad|father|papa|abbu|daddy|father's day)\b/i,
    label: 'dad',
    categories: ['frames', 'gifts & keepsakes', 'candles & aromatherapy'],
    keywords: ['frame', 'keepsake', 'leather', 'wood', 'desk', 'pen', 'organizer', 'mug', 'dad', 'father']
  },
  {
    key: 'girlfriend',
    match: /\b(girlfriend|gf|fianc[eé]e?|wife|partner|her|babe|love)\b/i,
    label: 'girlfriend or partner',
    categories: ['floral bouquets', 'hair accessories', 'nails & beauty', 'candles & aromatherapy', 'gifts & keepsakes', 'frames'],
    keywords: ['bouquet', 'flower', 'rose', 'hair', 'scrunchie', 'candle', 'nail', 'jewelry', 'jewellery', 'resin', 'frame', 'heart', 'romantic', 'spotify']
  },
  {
    key: 'boyfriend',
    match: /\b(boyfriend|bf|husband|hubby|fianc[eé]|him)\b/i,
    label: 'boyfriend or partner',
    categories: ['frames', 'gifts & keepsakes', 'candles & aromatherapy'],
    keywords: ['frame', 'keepsake', 'leather', 'desk', 'acrylic', 'spotify', 'wallet', 'watch', 'bracelet', 'hamper']
  },
  {
    key: 'sister',
    match: /\b(sister|sis|didi|behna)\b/i,
    label: 'sister',
    categories: ['hair accessories', 'nails & beauty', 'floral bouquets', 'candles & aromatherapy', 'gifts & keepsakes', 'frames'],
    keywords: ['scrunchie', 'clip', 'nail', 'candle', 'bouquet', 'resin', 'frame', 'jewelry', 'box']
  },
  {
    key: 'brother',
    match: /\b(brother|bro|bhaiya|bhai)\b/i,
    label: 'brother',
    categories: ['gifts & keepsakes', 'frames'],
    keywords: ['frame', 'keepsake', 'resin', 'desk', 'mug', 'organizer', 'hamper', 'rakhi']
  },
  {
    key: 'friend',
    match: /\b(friend|bestie|buddy|bff|pal|colleague|coworker)\b/i,
    label: 'friend',
    categories: ['candles & aromatherapy', 'floral bouquets', 'frames', 'gifts & keepsakes', 'hair accessories', 'nails & beauty'],
    keywords: ['candle', 'frame', 'mug', 'hamper', 'keepsake', 'bouquet', 'resin']
  },
  {
    key: 'baby_kids',
    match: /\b(baby|kid|kids|child|children|daughter|son|toddler)\b/i,
    label: 'little one',
    categories: ['gifts & keepsakes', 'frames'],
    keywords: ['toy', 'baby', 'frame', 'keepsake', 'nameplate', 'cushion', 'wooden']
  }
];

const OCCASION_PATTERNS = [
  {
    key: 'birthday',
    match: /\b(birthday|bday|b'day)\b/i,
    label: 'birthday',
    keywords: ['birthday', 'celebration', 'hamper', 'frame', 'cake', 'custom']
  },
  {
    key: 'anniversary',
    match: /\b(anniversary|anni)\b/i,
    label: 'anniversary',
    keywords: ['anniversary', 'couple', 'love', 'romantic', 'frame', 'spotify', 'keepsake', 'candle']
  },
  {
    key: 'wedding',
    match: /\b(wedding|marriage|shaadi|shadi|bridal|bride|groom)\b/i,
    label: 'wedding',
    keywords: ['wedding', 'couple', 'frame', 'resin', 'hamper', 'platter', 'keepsake', 'bouquet']
  },
  {
    key: 'diwali',
    match: /\b(diwali|deepavali)\b/i,
    label: 'Diwali',
    keywords: ['diwali', 'candle', 'diya', 'diffuser', 'hamper', 'pooja', 'festive']
  },
  {
    key: 'rakhi',
    match: /\b(rakhi|rakshabandhan|raksha bandhan)\b/i,
    label: 'Raksha Bandhan',
    keywords: ['rakhi', 'brother', 'sister', 'hamper', 'keepsake', 'sweet', 'box']
  },
  {
    key: 'valentines',
    match: /\b(valentine|valentines|valentine's)\b/i,
    label: "Valentine's Day",
    keywords: ['valentine', 'love', 'rose', 'bouquet', 'heart', 'candle', 'frame', 'spotify']
  },
  {
    key: 'housewarming',
    match: /\b(housewarming|house warming|griha pravesh|grihapravesh)\b/i,
    label: 'housewarming',
    keywords: ['frame', 'candle', 'diffuser', 'aroma', 'nameplate', 'decor', 'wall art', 'plant']
  },
  {
    key: 'corporate',
    match: /\b(corporate|office|client|employee|boss|farewell)\b/i,
    label: 'corporate gifting',
    keywords: ['desk', 'organizer', 'pen', 'hamper', 'frame', 'custom', 'candle']
  }
];

function isSupportQuery(message) {
  if (!message || typeof message !== 'string') return false;
  const lower = message.toLowerCase();

  const supportKeywords = [
    'order', 'orders', 'parcel', 'parcels', 'package', 'packages', 'shipment',
    'shipments', 'courier', 'dispatch', 'dispatched', 'tracking', 'track',
    'stuck', 'bug', 'issue', 'problem', 'payment', 'failed', 'refund',
    'refunds', 'seller', 'shipping', 'delivery', 'deliver', 'delivered',
    'delay', 'delayed', 'late', 'support', 'cancel', 'cancellation',
    'complaint', 'complaints', 'return', 'returns', 'exchange', 'contact',
    'damaged', 'broken', 'lost', 'wrong item', 'missing item', 'customer care',
    'help desk'
  ];

  if (supportKeywords.some(kw => lower.includes(kw))) {
    return true;
  }

  const supportPhrases = [
    /didn['’]?t (get|got|receive)/i,
    /haven['’]?t (get|got|received|receive)/i,
    /not (received|delivered|delivery|arrived|reach|reached)/i,
    /where is my/i,
    /when will (it|my) arrive/i,
    /help with (my )?(order|package|parcel|payment)/i
  ];

  return supportPhrases.some(pattern => pattern.test(lower));
}

function detectRecipientAndOccasion(message) {
  if (!message || typeof message !== 'string') return { recipient: null, occasion: null };
  const recipient = RECIPIENT_PATTERNS.find(p => p.match.test(message)) || null;
  const occasion = OCCASION_PATTERNS.find(p => p.match.test(message)) || null;
  return { recipient, occasion };
}

function scoreProductRelevance(product, userMessage, detectedRecipient, detectedOccasion) {
  let score = 0;
  const lowerName = (product.name || '').toLowerCase();
  const lowerDesc = (product.description || '').toLowerCase();
  const lowerCat = (product.category_name || '').toLowerCase();
  const occasionList = Array.isArray(product.occasions) ? product.occasions.map(o => String(o).toLowerCase()) : [];

  // Match recipient
  if (detectedRecipient) {
    if (detectedRecipient.categories.some(c => lowerCat.includes(c))) {
      score += 6;
    }
    if (detectedRecipient.keywords.some(kw => lowerName.includes(kw) || lowerDesc.includes(kw))) {
      score += 4;
    }
  }

  // Match occasion
  if (detectedOccasion) {
    if (occasionList.some(occ => occ.includes(detectedOccasion.key))) {
      score += 7;
    }
    if (detectedOccasion.keywords.some(kw => lowerName.includes(kw) || lowerDesc.includes(kw))) {
      score += 4;
    }
  }

  // Direct keyword matching from user query words
  const words = userMessage.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  for (const word of words) {
    if (lowerName.includes(word)) score += 3;
    else if (lowerCat.includes(word)) score += 2;
    else if (lowerDesc.includes(word)) score += 1;
  }

  return score;
}

function rankProductsForQuery(products, userMessage) {
  const { recipient, occasion } = detectRecipientAndOccasion(userMessage);
  const scored = products.map(p => ({
    product: p,
    score: scoreProductRelevance(p, userMessage, recipient, occasion)
  }));

  scored.sort((a, b) => b.score - a.score);
  return {
    recipient,
    occasion,
    rankedProducts: scored.map(s => s.product),
    hasMatch: scored.length > 0 && scored[0].score > 0
  };
}

async function getActiveProducts(limit = 30) {
  try {
    const { rows } = await query(
      `SELECT p.id, p.name, p.base_price AS price, p.slug, p.description,
              c.name AS category_name,
              COALESCE(sp.store_name, 'Artisan Studio') AS store_name,
              COALESCE(
                (SELECT array_agg(pot.occasion_slug) FROM product_occasion_tags pot WHERE pot.product_id = p.id),
                '{}'::text[]
              ) AS occasions
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
       WHERE p.status = 'active' OR p.is_active = TRUE
       ORDER BY p.is_sponsored DESC, p.view_count DESC, p.created_at DESC
       LIMIT $1;`,
      [limit]
    );
    return rows.map(p => ({
      id: p.id,
      name: p.name,
      base_price: Number(p.price || 0),
      price: Number(p.price || 0),
      slug: p.slug,
      description: p.description || '',
      store_name: p.store_name,
      category_name: p.category_name || 'Handcrafted Gift',
      occasions: Array.isArray(p.occasions) ? p.occasions : []
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
  if (isSupportQuery(userMessage)) {
    return {
      reply: "I am here to help. For real-time updates regarding your order, parcel tracking, dispatch status, or refunds, please visit your Orders tab or reach our direct support team at tohfa126@gmail.com. We are happy to assist you.",
      products: []
    };
  }

  const { recipient, occasion, rankedProducts, hasMatch } = rankProductsForQuery(activeProducts, userMessage);
  const selectedList = (hasMatch ? rankedProducts : activeProducts).slice(0, 3);
  const sampleProducts = selectedList.map(p => ({
    id: p.id,
    name: p.name,
    base_price: p.base_price,
    store_name: p.store_name,
    category_name: p.category_name,
    link: `/buyer/product.html?id=${p.id}`
  }));

  let replyText = "Welcome to Tohfa! I would love to help you discover authentic handcrafted creations from artisan studios across India. Here are some of our trending gifts to explore:";

  if (recipient && occasion) {
    replyText = `Here are some thoughtful handcrafted ${occasion.label} gifts tailored for your ${recipient.label} from our artisan studios:`;
  } else if (recipient) {
    replyText = `Here are some wonderful handcrafted gifts tailored for your ${recipient.label} from our artisan studios:`;
  } else if (occasion) {
    replyText = `Here are our top handcrafted creations curated for a memorable ${occasion.label}:`;
  }

  return {
    reply: replyText,
    products: sampleProducts
  };
}

async function chat(userMessage, history = []) {
  if (isSupportQuery(userMessage)) {
    return {
      success: true,
      data: {
        reply: "I am here to help. For real-time updates regarding your order, parcel delivery, tracking, or refunds, please visit your Orders tab or reach our direct support team at tohfa126@gmail.com. We are happy to assist you.",
        products: []
      }
    };
  }

  const activeProducts = await getActiveProducts(30);
  const { recipient, occasion, rankedProducts } = rankProductsForQuery(activeProducts, userMessage);
  const prioritizedProducts = rankedProducts.length > 0 ? rankedProducts : activeProducts;

  const catalogContext = prioritizedProducts.slice(0, 15).map(p =>
    `- ${p.name} (₹${p.base_price}, Category: ${p.category_name}${p.occasions.length > 0 ? ', Occasions: ' + p.occasions.join(', ') : ''})`
  ).join('\n') || 'Handmade scented candles, customized resin art, personalized jewelry, artisanal gift hampers.';

  const ai = getGeminiClient();

  // If no Gemini API key is configured, gracefully fall back immediately
  if (!ai) {
    console.warn('[Tanya] No Gemini API key found. Using catalog fallback.');
    return {
      success: true,
      data: generateFallbackResponse(userMessage, activeProducts)
    };
  }

  const contextHint = recipient || occasion
    ? `User Context: Looking for ${recipient ? 'recipient: ' + recipient.label : ''}${recipient && occasion ? ', ' : ''}${occasion ? 'occasion: ' + occasion.label : ''}.`
    : '';

  const prompt = `
Live Platform Catalog:
${catalogContext}

${contextHint ? contextHint + '\n' : ''}User Query: "${userMessage}"

Respond directly to the user following your system instructions.
If the user is asking for gift recommendations, mention 2-3 specific product names from the catalog that best match their request.
If they are reporting an issue, shipping problem, parcel delivery question, or support inquiry, answer their support request directly with guidance to check their Orders tab or email tohfa126@gmail.com — do NOT recommend products.
`;

  try {
    // 8-second timeout promise race to prevent user-facing lag
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API timeout')), 8000)
    );

    const apiPromise = ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 450
      }
    });

    const result = await Promise.race([apiPromise, timeoutPromise]);
    const responseText = result?.text || '';

    let matchedProducts = [];
    if (responseText) {
      const lowerResponse = responseText.toLowerCase();
      matchedProducts = prioritizedProducts.filter(p =>
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

      // If Gemini didn't mention exact names, provide top context-matched catalog items
      if (matchedProducts.length === 0 && prioritizedProducts.length > 0) {
        matchedProducts = prioritizedProducts.slice(0, 3).map(p => ({
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

module.exports = { chat, getActiveProducts, isSupportQuery, detectRecipientAndOccasion, generateFallbackResponse };

