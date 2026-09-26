const { Bot: TelegramBot } = require('node-telegram-bot-api');
const { query } = require('../config/db');

class TelegramService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    
    // We only enable sending/listening if both variables are present
    this.isEnabled = !!this.botToken && !!this.chatId;

    if (this.isEnabled) {
      // Initialize the bot with polling enabled so it listens for messages
      this.bot = new TelegramBot(this.botToken, { polling: true });
      console.log('[TelegramService] Bot initialized in conversational mode.');
      this.setupListeners();
    } else {
      console.warn('[TelegramService] Telegram notifications disabled (Missing ENV variables).');
    }
  }

  setupListeners() {
    // Listen for any message
    this.bot.on('message', async (msg) => {
      // Only process commands if they come from our authorized chat ID
      // The chatId in .env is stored as a string, msg.chat.id is a number
      if (String(msg.chat.id) !== String(this.chatId)) {
        // Ignore messages from unauthorized chats
        return;
      }

      const text = msg.text || '';
      
      if (text.startsWith('/start')) {
        await this.bot.sendMessage(msg.chat.id, `👋 Hello Admin! I am the Tohfa Admin Bot.
I will notify you of new orders and seller applications.

You can also ask me for:
/stats - View quick platform metrics
/pending - List pending seller applications
/orders - See the latest 5 Tohfa Special Orders`);
      } 
      
      else if (text.startsWith('/stats')) {
        try {
          const { rows: userRows } = await query(`SELECT COUNT(*) as count FROM users`);
          const { rows: orderRows } = await query(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as rev FROM orders WHERE payment_status = 'paid'`);
          const { rows: sellerRows } = await query(`SELECT COUNT(*) as count FROM sellers WHERE is_approved = true`);

          const msgText = `📊 <b>Platform Stats</b>
          
<b>Total Users:</b> ${userRows[0].count}
<b>Approved Sellers:</b> ${sellerRows[0].count}
<b>Total Orders:</b> ${orderRows[0].count}
<b>Total Revenue:</b> ₹${orderRows[0].rev}`;

          await this.bot.sendMessage(msg.chat.id, msgText, { parse_mode: 'HTML' });
        } catch (e) {
          await this.bot.sendMessage(msg.chat.id, '❌ Error fetching stats.');
          console.error(e);
        }
      }

      else if (text.startsWith('/pending')) {
        try {
          const { rows } = await query(`SELECT store_name, applied_at FROM sellers WHERE verification_status = 'pending_verification' LIMIT 10`);
          if (rows.length === 0) {
            await this.bot.sendMessage(msg.chat.id, '✅ No pending applications! All caught up.');
            return;
          }

          let msgText = `📝 <b>Pending Applications (${rows.length})</b>\n\n`;
          rows.forEach((r, i) => {
            msgText += `${i+1}. ${r.store_name} (Applied: ${new Date(r.applied_at).toLocaleDateString()})\n`;
          });
          msgText += `\n<a href="https://thetohfa.in/admin/sellers.html?tab=applications">Review all in Admin Panel</a>`;

          await this.bot.sendMessage(msg.chat.id, msgText, { parse_mode: 'HTML', disable_web_page_preview: true });
        } catch (e) {
          await this.bot.sendMessage(msg.chat.id, '❌ Error fetching pending applications.');
          console.error(e);
        }
      }

      else if (text.startsWith('/orders')) {
        try {
          const { rows } = await query(`
            SELECT o.id, o.total_amount, o.status, s.store_name 
            FROM orders o
            JOIN seller_profiles s ON s.user_id = o.seller_id
            WHERE s.is_admin_managed = true OR s.is_admin_managed::text = '1'
            ORDER BY o.created_at DESC LIMIT 5
          `);

          if (rows.length === 0) {
            await this.bot.sendMessage(msg.chat.id, 'No special orders yet.');
            return;
          }

          let msgText = `🎁 <b>Latest 5 Special Orders</b>\n\n`;
          rows.forEach((r, i) => {
            const shortId = String(r.id).slice(0,8);
            msgText += `<b>#${shortId}</b> - ${r.store_name}\nAmount: ₹${r.total_amount} | Status: ${r.status}\n\n`;
          });

          await this.bot.sendMessage(msg.chat.id, msgText, { parse_mode: 'HTML' });
        } catch (e) {
          await this.bot.sendMessage(msg.chat.id, '❌ Error fetching orders.');
          console.error(e);
        }
      }
      
      // If it's not a command, let the AI handle it!
      else if (text) {
        try {
          const { GoogleGenAI } = require('@google/genai');
          const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
          
          if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
            await this.bot.sendMessage(msg.chat.id, "I'd love to chat, but my AI brain is missing! Please set GEMINI_API_KEY in the backend .env file.");
            return;
          }

          // Show "typing" status while AI thinks
          this.bot.sendChatAction(msg.chat.id, 'typing');

          const ai = new GoogleGenAI({ apiKey });
          
          const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: text,
            config: {
              systemInstruction: "You are the Tohfa Admin AI Assistant. You help the admins of Tohfa (thetohfa.in) manage their handmade marketplace. Keep responses helpful, concise, and conversational. Do not use markdown like asterisks."
            }
          });
          const responseText = result.text;
          
          await this.bot.sendMessage(msg.chat.id, responseText);
        } catch (e) {
          console.error('[Telegram AI Error]:', e);
          await this.bot.sendMessage(msg.chat.id, "Sorry, my AI brain encountered an error. 🤕");
        }
      }
    });
  }

  /**
   * Base function to send a message to the configured Telegram chat
   * @param {string} text - The message text
   * @param {string} parseMode - HTML or Markdown
   */
  async sendMessage(text, parseMode = 'HTML') {
    if (!this.isEnabled || !this.bot) return;

    try {
      await this.bot.sendMessage(this.chatId, text, {
        parse_mode: parseMode,
        disable_web_page_preview: true
      });
      console.log('[TelegramService] Message sent successfully.');
    } catch (error) {
      console.error('[TelegramService] Error sending message:', error.message);
    }
  }

  /**
   * Sends an alert when a Tohfa Special order is placed
   */
  async sendSpecialOrderAlert(orderData, shopName, buyerName) {
    const text = `🎁 <b>Tohfa Special Order Alert!</b>
    
<b>Order ID:</b> #${String(orderData.id).slice(0, 8)}
<b>Shop:</b> ${shopName}
<b>Buyer:</b> ${buyerName}
<b>Total Amount:</b> ₹${orderData.total_amount}

<a href="https://thetohfa.in/admin/special-orders.html">Review Special Orders</a>`;

    await this.sendMessage(text);
  }

  /**
   * Sends an alert when a new seller application (KYC) is submitted
   */
  async sendNewSellerApplicationAlert(sellerData) {
    const text = `📝 <b>New Seller Application!</b>
    
<b>Store Name:</b> ${sellerData.store_name}
<b>Artisan:</b> ${sellerData.artisan_name}
<b>Phone:</b> ${sellerData.phone || 'N/A'}
<b>Location:</b> ${sellerData.city ? (sellerData.city + (sellerData.state ? ', ' + sellerData.state : '')) : 'N/A'}

<a href="https://thetohfa.in/admin/sellers.html?tab=applications">Review Application</a>`;

    await this.sendMessage(text);
  }
}

module.exports = new TelegramService();
