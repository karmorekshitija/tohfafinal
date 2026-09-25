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

// Recipient profiles: each has patterns to match, an emoji, a personal intro, and a closing tip
const RECIPIENT_PROFILES = [
  {
    keys: ['boyfriend', 'bf', 'bae', 'partner', 'lover', 'husband', 'fiance'],
    emoji: '💑',
    label: 'your boyfriend',
    intro: (occasion) => `Aww, gifting for your boyfriend? 💑 That's so sweet! Here are some heartfelt handcrafted picks from Tohfa that he'll absolutely love for **${occasion}**:\n\n`,
    closing: `\n💬 Want something more personal? Tell me his **hobbies**, **your budget**, or if you want it **engraved/customised**!`,
  },
  {
    keys: ['girlfriend', 'gf', 'wife', 'fiancee', 'fiancée'],
    emoji: '💝',
    label: 'your girlfriend',
    intro: (occasion) => `She's going to love this! 💝 Here are some gorgeous handcrafted Tohfa gifts for **${occasion}** that'll make her feel extra special:\n\n`,
    closing: `\n💬 Want to make it more special? Share her **style**, **favourite colour**, or **budget** and I'll narrow it down!`,
  },
  {
    keys: ['mom', 'mum', 'mother', 'maa', 'mumma', 'mama', 'amma', 'aai'],
    emoji: '🌸',
    label: 'your mom',
    intro: (occasion) => `Your mom deserves the best! 🌸 Here are some lovingly handcrafted Tohfa gifts for **${occasion}** that'll warm her heart:\n\n`,
    closing: `\n💬 Tell me her **favourite things** (flowers, candles, jewellery?) or your **budget** — I'll find the perfect match!`,
  },
  {
    keys: ['dad', 'father', 'papa', 'baba', 'pappa', 'pitaji', 'abba', 'abbu'],
    emoji: '👔',
    label: 'your dad',
    intro: (occasion) => `Showing some love to Dad? 👔 Here are some thoughtful handcrafted Tohfa picks for **${occasion}** that any father would be proud to receive:\n\n`,
    closing: `\n💬 Share his **interests** or your **budget** and I'll find the most fitting handcrafted gift for him!`,
  },
  {
    keys: ['sister', 'sis', 'didi', 'behen', 'bhen'],
    emoji: '👯‍♀️',
    label: 'your sister',
    intro: (occasion) => `Sisters are forever! 👯‍♀️ Here are some fun and heartfelt handcrafted Tohfa gifts for **${occasion}** that your sis will totally adore:\n\n`,
    closing: `\n💬 Tell me her **vibe** (boho, minimal, glam?) or your **budget** — let's find her something she'll obsess over!`,
  },
  {
    keys: ['brother', 'bro', 'bhai', 'bhaiya'],
    emoji: '🤝',
    label: 'your brother',
    intro: (occasion) => `Getting something for your bro? 🤝 Here are some unique handcrafted Tohfa gifts for **${occasion}** that'll genuinely impress him:\n\n`,
    closing: `\n💬 Share his **interests** or your **budget** and I'll find the best handcrafted match for him!`,
  },
  {
    keys: ['friend', 'bestie', 'bff', 'yaar', 'dost'],
    emoji: '🎊',
    label: 'your friend',
    intro: (occasion) => `Treat your bestie to something special! 🎊 Here are some amazing handcrafted Tohfa gifts for **${occasion}** they'll absolutely adore:\n\n`,
    closing: `\n💬 Tell me more about them — **their taste**, **hobbies**, or your **budget** — and I'll curate the perfect pick!`,
  },
  {
    keys: ['boss', 'manager', 'sir', 'ma\'am', 'madam', 'colleague', 'coworker', 'office'],
    emoji: '💼',
    label: 'your colleague/boss',
    intro: (occasion) => `Making a great impression at work? 💼 Here are some elegant handcrafted Tohfa gifts for **${occasion}** that strike the perfect professional-yet-personal note:\n\n`,
    closing: `\n💬 Want something subtle and classy? Share your **budget** or if you need **office-appropriate wrapping**!`,
  },
  {
    keys: ['baby', 'infant', 'newborn', 'toddler', 'kid', 'child', 'son', 'daughter', 'beta', 'beti'],
    emoji: '🍼',
    label: 'the little one',
    intro: (occasion) => `How adorable! 🍼 Here are some safe, handcrafted Tohfa gifts for **${occasion}** that the little one (and parents!) will love:\n\n`,
    closing: `\n💬 Tell me their **age** or a **specific theme** (animals, colours, soft toys?) and I'll help you find the cutest match!`,
  },
  {
    keys: ['grandma', 'grandmother', 'nani', 'dadi', 'aaji', 'ajji'],
    emoji: '🌺',
    label: 'your grandmother',
    intro: (occasion) => `She'll be so touched! 🌺 Here are some warm, handcrafted Tohfa gifts for **${occasion}** perfect for your beloved grandmother:\n\n`,
    closing: `\n💬 Tell me what she enjoys — **scents, flowers, spiritual items** — and I'll find something she'll treasure!`,
  },
  {
    keys: ['grandpa', 'grandfather', 'nana', 'dada', 'ajoba'],
    emoji: '🎖️',
    label: 'your grandfather',
    intro: (occasion) => `A gift for Grandpa? 🎖️ Here are some meaningful handcrafted Tohfa picks for **${occasion}** that honor him beautifully:\n\n`,
    closing: `\n💬 Share his **interests** or **preferred styles** and I'll narrow it down to something truly special!`,
  },
  {
    keys: ['teacher', 'guru', 'mentor', 'professor', 'madam', 'sir'],
    emoji: '📚',
    label: 'your teacher',
    intro: (occasion) => `Gifting your teacher? How thoughtful! 📚 Here are some elegant handcrafted Tohfa gifts for **${occasion}** that show how much you appreciate them:\n\n`,
    closing: `\n💬 Tell me your **budget** or if you want something **personalised with a message** for them!`,
  },
];

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
              COALESCE(sp.store_name, 'Artisan Studio') AS store_name,
              (SELECT pi.url FROM product_images pi
               WHERE pi.product_id = p.id
               ORDER BY pi.sort_order ASC LIMIT 1) AS cover_image
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

function detectRecipient(lowerMsg) {
  for (const profile of RECIPIENT_PROFILES) {
    for (const key of profile.keys) {
      // Match whole word to avoid false positives (e.g. "mama" inside "caramel")
      const regex = new RegExp(`\\b${key}\\b`, 'i');
      if (regex.test(lowerMsg)) return profile;
    }
  }
  return null;
}

function formatProductsAsReply(products, userMessage) {
  const lowerMsg = userMessage.toLowerCase();

  // Detect occasion
  let occasion = 'a special occasion';
  for (const key of Object.keys(OCCASION_SYNONYMS)) {
    if (lowerMsg.includes(key)) { occasion = key; break; }
  }

  // Detect recipient and pick personalised intro/closing
  const recipient = detectRecipient(lowerMsg);
  const intro = recipient
    ? recipient.intro(occasion)
    : `Namaste! 🎁 Here are some handcrafted treasures from Tohfa perfect for **${occasion}**:\n\n`;
  const closing = recipient
    ? recipient.closing
    : `\n💬 Want me to help narrow it down? Tell me the **recipient's age**, **your budget**, or **any personal preferences**!`;

  let reply = intro;
  products.forEach((p, i) => {
    const price = `₹${Number(p.base_price).toLocaleString('en-IN')}`;
    const link = `/buyer/product.html?id=${p.id}`;
    reply += `${i + 1}. **[${p.name}](${link})** — ${price}\n`;
    reply += `*By ${p.store_name}* · ${p.category_name || 'Artisan Gift'}\n`;
    if (p.description) reply += `${p.description.slice(0, 90)}...\n`;
    reply += '\n';
  });
  reply += closing;
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
        return {
          reply: formatProductsAsReply(catalogProducts, userMessage),
          products: catalogProducts.map(p => ({
            id: p.id,
            name: p.name,
            base_price: p.base_price,
            store_name: p.store_name,
            category_name: p.category_name,
            cover_image: p.cover_image || null,
            link: `/buyer/product.html?id=${p.id}`,
          })),
        };
      }
      return {
        reply: `Namaste! 🎁 I am Tanya, your Tohfa gift guide.\n\nExplore our handcrafted collections:\n\n- 🕯️ [Candles & Aromatherapy](/buyer/category.html?slug=candles-aromatherapy)\n- 💐 [Floral & Bouquets](/buyer/category.html?slug=floral-bouquets)\n- 💍 [Jewellery & Wearables](/buyer/category.html?slug=jewellery-wearables)\n- 🎁 [Gifts & Keepsakes](/buyer/category.html?slug=gifts-keepsakes)\n\n💬 Tell me the **occasion**, **recipient**, and **budget**!`,
        products: [],
      };
    }

    const catalogContext = await getProductCatalogContext();
    const systemInstruction = `You are Tanya, Tohfa's warm and friendly AI Gift Assistant. Your goal is to make every gift recommendation feel personal and unique.

IMPORTANT — PERSONALISE BY RECIPIENT:
- If the user mentions "boyfriend / bf / bae / partner / husband": use a warm romantic tone 💑, focus on sentimental & couple items.
- If they mention "girlfriend / gf / wife": use an affectionate, celebratory tone 💝, suggest elegant/beautiful picks.
- If they mention "mom / maa / mother / mumma": use a loving, respectful tone 🌸, focus on comfort, floral, jewellery gifts.
- If they mention "dad / papa / father / baba": use a proud, appreciative tone 👔, focus on personalized, handcrafted keepsakes.
- If they mention "sister / didi / sis": use a fun, sisterly tone 👯‍♀️, suggest trendy, fun picks.
- If they mention "brother / bro / bhai": use a casual, cool tone 🤝, suggest unique artisan items.
- If they mention "friend / bestie / bff / yaar": use an excited, enthusiastic tone 🎊.
- If they mention "boss / colleague / office": use a polished, professional tone 💼.
- If they mention "baby / kid / child / son / daughter": use an adorable, gentle tone 🍼.
- If they mention "teacher / guru / mentor": use a respectful, appreciative tone 📚.

Always vary your opening sentence. Never repeat the same intro twice. Recommend ONLY real products from the catalog below. Always include direct product links like [Name](/buyer/product.html?id=ID). End with a personalised follow-up question based on the recipient.

${catalogContext || 'Catalog unavailable - guide to /buyer/categories.html'}`;
    const formattedHistory = Array.isArray(history) ? history.map(item => ({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.parts?.[0]?.text || item.text || String(item) }]
    })) : [];
    let modelToUse = geminiModel;
    if (genAI) {
      modelToUse = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
        generationConfig: { maxOutputTokens: 500 }, // SECURITY: cap response size to limit cost per request
      });
    }
    const chatSession = modelToUse.startChat({ history: formattedHistory, systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] } });
    const result = await chatSession.sendMessage(userMessage);
    const replyText = result.response.text();

    // Parse product IDs mentioned in the reply and look up their images
    let products = [];
    try {
      const idMatches = [...replyText.matchAll(/product\.html\?id=(\d+)/g)].map(m => parseInt(m[1], 10));
      const uniqueIds = [...new Set(idMatches)].slice(0, 5);
      if (uniqueIds.length > 0) {
        const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(',');
        const { rows } = await query(
          `SELECT p.id, p.name, p.base_price,
                  COALESCE(sp.store_name, 'Artisan Studio') AS store_name,
                  COALESCE(c.name, 'Artisan Gift') AS category_name,
                  (SELECT pi.url FROM product_images pi
                   WHERE pi.product_id = p.id
                   ORDER BY pi.sort_order ASC LIMIT 1) AS cover_image
           FROM products p
           LEFT JOIN seller_profiles sp ON sp.user_id = p.seller_id
           LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.id IN (${placeholders})`,
          uniqueIds
        );
        // Sort by appearance order in reply
        products = uniqueIds
          .map(id => rows.find(r => r.id === id))
          .filter(Boolean)
          .map(p => ({
            id: p.id,
            name: p.name,
            base_price: p.base_price,
            store_name: p.store_name,
            category_name: p.category_name,
            cover_image: p.cover_image || null,
            link: `/buyer/product.html?id=${p.id}`,
          }));
      }
    } catch (_) { /* products remain [] if image lookup fails */ }

    return { reply: replyText, products };
  } catch (err) {
    console.error('[Tanya] Chat generation error:', err.message);
    try {
      const fp = await smartCatalogSearch(userMessage);
      if (fp && fp.length > 0) {
        return {
          reply: formatProductsAsReply(fp, userMessage),
          products: fp.map(p => ({
            id: p.id,
            name: p.name,
            base_price: p.base_price,
            store_name: p.store_name,
            category_name: p.category_name,
            cover_image: p.cover_image || null,
            link: `/buyer/product.html?id=${p.id}`,
          })),
        };
      }
    } catch (_) {}
    return {
      reply: `Namaste! 🎁 Tell me the **occasion**, **recipient**, and **budget** and I'll find the perfect handcrafted match!`,
      products: [],
    };
  }
}

module.exports = { chat, getProductCatalogContext };

