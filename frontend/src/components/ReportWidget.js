// Tohfa Unified Chatbot (Recommendations + FAQ + Problem Reporting)
(function() {
  // Early queuing support for AI Gift Guide clicks
  if (!window.openTohfaChat) {
    window.openTohfaChat = function(prefillQuery) {
      if (!window.__tohfaChatQueue) window.__tohfaChatQueue = [];
      window.__tohfaChatQueue.push(prefillQuery);
    };
  }

  // 1. Inject Stylesheets dynamically
  const style = document.createElement('style');
  style.textContent = `
    /* Floating Mascot Button — bare transparent PNG, no circle background */
    #tohfa-chat-mascot {
      position: fixed;
      bottom: 74px;        /* above mobile bottom nav bar */
      right: 6px;
      width: 48px;
      height: 48px;
      background: none;
      border: none;
      border-radius: 0;
      box-shadow: none;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      cursor: pointer;
      z-index: 99999;
      opacity: 0.92;
      transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease;
      animation: mascotFloat 3.5s ease-in-out infinite;
    }
    @media (min-width: 769px) {
      #tohfa-chat-mascot {
        width: 90px;
        height: 90px;
        bottom: 32px;
        right: 32px;
        opacity: 1;
      }
    }
    #tohfa-chat-mascot:hover {
      transform: scale(1.1) translateY(-4px);
      animation-play-state: paused;
    }
    #tohfa-chat-mascot:active {
      transform: scale(0.95);
    }
    /* Hide old icon — replaced by img */
    #tohfa-chat-mascot span.material-symbols-outlined {
      display: none;
    }
    /* Mascot PNG inside the button */
    #tohfa-chat-mascot img.mascot-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: bottom center;
      display: block;
      filter: drop-shadow(0 6px 16px rgba(61, 107, 79, 0.28));
      pointer-events: none;
    }
    /* Gold notification badge repositioned for bare image */
    #tohfa-chat-badge {
      position: absolute;
      top: 6px;
      right: 2px;
      width: 14px;
      height: 14px;
      background-color: #14381F;
      border-radius: 50%;
      border: 2px solid #FFFFFF;
      animation: pulseGold 2s infinite;
    }
    @keyframes pulseGold {
      0% { box-shadow: 0 0 0 0 rgba(200, 151, 58, 0.7); }
      70% { box-shadow: 0 0 0 6px rgba(200, 151, 58, 0); }
      100% { box-shadow: 0 0 0 0 rgba(200, 151, 58, 0); }
    }
    @keyframes mascotFloat {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-10px); }
    }

    /* Chat Panel */
    #tohfa-chat-panel {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 380px;
      height: 560px;
      border-radius: 20px;
      background-color: #FFF8E7;
      border: 1px solid rgba(143, 175, 130, 0.3);
      box-shadow: 0 12px 40px rgba(43, 43, 40, 0.18);
      display: flex;
      flex-direction: column;
      z-index: 99999;
      overflow: hidden;
      transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      transform: translateY(24px) scale(0.94);
      opacity: 0;
      pointer-events: none;
    }
    #tohfa-chat-panel.open {
      transform: translateY(0) scale(1);
      opacity: 1;
      pointer-events: auto;
    }

    /* Header */
    .tohfa-chat-header {
      background-color: #14381F;
      color: #FFFFFF;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #14381F;
    }
    .tohfa-chat-header-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .tohfa-chat-header-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background-color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: #14381F;
      font-family: 'Space Mono', monospace;
      font-size: 14px;
      border: 1px solid #14381F;
    }
    .tohfa-chat-header-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 18px;
      font-style: italic;
      font-weight: bold;
      margin: 0;
    }
    .tohfa-chat-header-status {
      font-family: 'DM Sans', sans-serif;
      font-size: 11px;
      opacity: 0.85;
      margin: 0;
    }
    .tohfa-chat-close-btn {
      background: none;
      border: none;
      color: #FFFFFF;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      transition: background-color 0.2s ease;
      padding: 0;
    }
    .tohfa-chat-close-btn:hover {
      background-color: rgba(255,255,255,0.15);
    }

    /* Message List */
    .tohfa-chat-messages {
      flex: 1;
      padding: 16px 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scroll-behavior: smooth;
    }

    /* Bubble Styling */
    .tohfa-chat-bubble {
      max-width: 82%;
      padding: 10px 14px;
      border-radius: 16px;
      font-family: 'DM Sans', sans-serif;
      font-size: 13.5px;
      line-height: 1.5;
      word-wrap: break-word;
    }
    .tohfa-chat-bubble.bot {
      background-color: rgba(20,56,31,0.06); /* Sage tint */
      color: #2B2B28;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .tohfa-chat-bubble.user {
      background-color: #14381F; /* Forest */
      color: #FFFFFF;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }

    /* Recommendation Cards */
    .tohfa-chat-recommendations-wrapper {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-self: flex-start;
      max-width: 85%;
      margin-top: 4px;
    }
    .tohfa-chat-product-card {
      background: #FFFFFF;
      border: 1px solid rgba(143, 175, 130, 0.35);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      box-shadow: 0 2px 8px rgba(43,43,40,0.06);
      transition: all 0.2s ease;
      cursor: pointer;
      text-decoration: none;
      color: inherit;
    }
    .tohfa-chat-product-card:hover {
      transform: translateY(-2px);
      border-color: #14381F;
      box-shadow: 0 4px 12px rgba(43,43,40,0.1);
    }
    .tohfa-chat-product-img-wrapper {
      width: 76px;
      height: 76px;
      flex-shrink: 0;
      background-color: #FFF8E7;
      overflow: hidden;
      border-right: 1px solid rgba(143, 175, 130, 0.15);
    }
    .tohfa-chat-product-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .tohfa-chat-product-details {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      flex: 1;
      min-width: 0;
    }
    .tohfa-chat-product-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-weight: bold;
      font-size: 13.5px;
      color: #14381F;
      margin: 0 0 2px 0;
      line-clamp: 1;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .tohfa-chat-product-price {
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      font-weight: bold;
      color: #14381F;
      margin: 0 0 4px 0;
    }
    .tohfa-chat-product-reason {
      font-size: 10.5px;
      color: #555552;
      line-height: 1.3;
      margin: 0;
      line-clamp: 2;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* Ticket Card */
    .tohfa-chat-ticket-card {
      background: #FFFFFF;
      border: 2px dashed #14381F; /* Gold dashed border */
      border-radius: 12px;
      padding: 14px;
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-self: flex-start;
      max-width: 82%;
      box-shadow: 0 3px 10px rgba(200, 151, 58, 0.08);
      font-family: 'DM Sans', sans-serif;
    }
    .tohfa-chat-ticket-header {
      font-family: 'Space Mono', monospace;
      font-size: 10.5px;
      font-weight: bold;
      color: #14381F;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .tohfa-chat-ticket-id {
      font-size: 16px;
      font-family: 'Playfair Display', serif;
      font-weight: bold;
      color: #14381F;
      margin: 2px 0;
    }
    .tohfa-chat-ticket-desc {
      font-size: 12px;
      color: #4A4A4A;
      line-height: 1.45;
      margin: 0;
    }

    /* Input area */
    .tohfa-chat-input-container {
      padding: 12px 16px;
      background-color: #FFFFFF;
      border-top: 1px solid rgba(143, 175, 130, 0.2);
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .tohfa-chat-input {
      flex: 1;
      border: 1px solid #D9D4CB;
      border-radius: 20px;
      padding: 8px 16px;
      font-family: 'DM Sans', sans-serif;
      font-size: 13.5px;
      outline: none;
      background-color: #FFF8E7;
      transition: all 0.2s ease;
    }
    .tohfa-chat-input:focus {
      border-color: #14381F;
      background-color: #FFFFFF;
      box-shadow: 0 0 0 2px rgba(143, 175, 130, 0.25);
    }
    .tohfa-chat-send-btn {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background-color: #14381F;
      border: none;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      padding: 0;
    }
    .tohfa-chat-send-btn:hover {
      background-color: #14381F; /* Gold hover */
      transform: scale(1.05);
    }
    .tohfa-chat-send-btn:active {
      transform: scale(0.95);
    }
    .tohfa-chat-send-btn:disabled {
      background-color: #D9D4CB;
      cursor: not-allowed;
    }

    /* Loading dots */
    .tohfa-chat-loading-dots {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      justify-content: center;
      height: 20px;
      padding: 4px 6px;
    }
    .tohfa-chat-dot {
      width: 6px;
      height: 6px;
      background-color: #666662;
      border-radius: 50%;
      animation: tohfaDotBounce 1.4s infinite ease-in-out both;
    }
    .tohfa-chat-dot:nth-child(1) { animation-delay: -0.32s; }
    .tohfa-chat-dot:nth-child(2) { animation-delay: -0.16s; }

    @keyframes tohfaDotBounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1.0); }
    }

    /* Quick Reply Chips */
    .tohfa-chat-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 20px;
      background-color: #FFF8E7;
      border-top: 1px solid rgba(143, 175, 130, 0.1);
    }
    .tohfa-chat-chip {
      background-color: #FFFFFF;
      border: 1px solid rgba(143, 175, 130, 0.4);
      color: #14381F;
      border-radius: 12px;
      padding: 4px 10px;
      font-size: 11.5px;
      font-family: 'DM Sans', sans-serif;
      cursor: pointer;
      transition: all 0.2s ease;
      font-weight: 500;
    }
    .tohfa-chat-chip:hover {
      background-color: #14381F;
      color: #FFFFFF;
      border-color: #14381F;
    }

    /* Custom scrollbar */
    .tohfa-chat-messages::-webkit-scrollbar {
      width: 4px;
    }
    .tohfa-chat-messages::-webkit-scrollbar-track {
      background: transparent;
    }
    .tohfa-chat-messages::-webkit-scrollbar-thumb {
      background: #8FAF82;
      border-radius: 4px;
    }

    /* Mobile view overrides */
    @media (max-width: 768px) {
      #tohfa-chat-mascot {
        width: 64px;
        height: 64px;
        bottom: 76px;   /* clears mobile bottom nav (~64px) + breathing room */
        right: 12px;
      }
      #tohfa-chat-panel {
        bottom: 0;
        right: 0;
        width: 100%;
        height: 100%;
        max-height: 100%;
        border-radius: 0;
        border: none;
        transform: translateY(100%);
      }
      #tohfa-chat-panel.open {
        transform: translateY(0);
      }
      .tohfa-chat-header {
        padding: 12px 16px;
      }
      .tohfa-chat-messages {
        padding: 12px 16px;
      }
      .tohfa-chat-input-container {
        padding: 10px 12px;
        padding-bottom: 24px; /* safe area offset */
      }
    }
  `;
  document.head.appendChild(style);

  // 2. Client-side Session Generator / Management
  function getOrInitSession() {
    let session = localStorage.getItem('tohfa_chatbot_session_id');
    if (!session) {
      session = 'session-' + Date.now() + '-' + Math.round(Math.random() * 1E9);
      localStorage.setItem('tohfa_chatbot_session_id', session);
    }
    return session;
  }

  // 3. Main Init Function
  function initChatbot() {
    if (typeof document === 'undefined') return;
    if (!document.body) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChatbot, { once: true });
      }
      return;
    }

    const sessionId = getOrInitSession();

    // Prevent double initialization
    if (document.getElementById('tohfa-chat-mascot')) return;

    // Create Mascot Button
    const mascot = document.createElement('div');
    mascot.id = 'tohfa-chat-mascot';
    mascot.title = 'Tohfa Assistant';
    mascot.innerHTML = `
      <img class="mascot-img" src="/img/artisan-mascot.png" alt="Tohfa Assistant" draggable="false" />
      <div id="tohfa-chat-badge" style="display:none;"></div>
    `;
    document.body.appendChild(mascot);

    // Create Chat Panel
    const panel = document.createElement('div');
    panel.id = 'tohfa-chat-panel';
    panel.innerHTML = `
      <div class="tohfa-chat-header">
        <div class="tohfa-chat-header-info">
          <div class="tohfa-chat-header-avatar">🌱</div>
          <div>
            <h4 class="tohfa-chat-header-title">Tohfa Assistant</h4>
            <p class="tohfa-chat-header-status">Online · AI Companion</p>
          </div>
        </div>
        <button class="tohfa-chat-close-btn" id="tohfa-chat-close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      
      <div class="tohfa-chat-messages" id="tohfa-chat-msgs-list">
        <!-- Message list bubbles are inserted dynamically -->
      </div>

      <div class="tohfa-chat-chips" id="tohfa-chat-quick-chips">
        <button class="tohfa-chat-chip" data-query="Find me a gift">🎁 Find me a gift</button>
        <button class="tohfa-chat-chip" data-query="What is your return policy?">📦 Returns & Shipping</button>
        <button class="tohfa-chat-chip" data-query="Report a payment issue">⚠️ Report an issue</button>
      </div>

      <div class="tohfa-chat-input-container">
        <input type="text" class="tohfa-chat-input" id="tohfa-chat-text-input" placeholder="Type your query..." />
        <button class="tohfa-chat-send-btn" id="tohfa-chat-send" disabled>
          <span class="material-symbols-outlined" style="font-size:18px;">send</span>
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    const msgsList = panel.querySelector('#tohfa-chat-msgs-list');
    const textInput = panel.querySelector('#tohfa-chat-text-input');
    const sendBtn = panel.querySelector('#tohfa-chat-send');
    const closeBtn = panel.querySelector('#tohfa-chat-close');
    const badge = mascot.querySelector('#tohfa-chat-badge');
    const chipsContainer = panel.querySelector('#tohfa-chat-quick-chips');

    let chatHistory = [];
    let isWaitingResponse = false;

    // Load initial greeting
    appendBotMessage("Namaste! I'm the Tohfa Assistant. 🌱 How can I help you today? You can search for handcrafted items, ask about policies, or report a problem.");

    // Toggle open state
    if (mascot && panel) {
      mascot.addEventListener('click', () => {
        panel.classList.toggle('open');
        if (badge) badge.style.display = 'none'; // Clear notification badge
        if (panel.classList.contains('open')) {
          if (textInput) textInput.focus();
          scrollMessages();
        }
      });
    }

    window.openTohfaChat = function(prefillQuery) {
      if (panel) panel.classList.add('open');
      if (badge) badge.style.display = 'none'; // Clear notification badge
      if (prefillQuery) {
        sendMessage(prefillQuery);
      } else {
        if (textInput) textInput.focus();
        scrollMessages();
      }
    };

    // Process queued triggers
    if (window.__tohfaChatQueue && window.__tohfaChatQueue.length > 0) {
      while (window.__tohfaChatQueue.length > 0) {
        const query = window.__tohfaChatQueue.shift();
        window.openTohfaChat(query);
      }
    }

    // Close panel
    if (closeBtn && panel) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.remove('open');
      });
    }

    // Handle input validation
    if (textInput && sendBtn) {
      textInput.addEventListener('input', () => {
        sendBtn.disabled = textInput.value.trim().length === 0 || isWaitingResponse;
      });

      textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !sendBtn.disabled) {
          sendMessage(textInput.value.trim());
        }
      });

      sendBtn.addEventListener('click', () => {
        if (!sendBtn.disabled) {
          sendMessage(textInput.value.trim());
        }
      });
    }

    // Handle quick chips
    if (chipsContainer) {
      chipsContainer.querySelectorAll('.tohfa-chat-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const query = chip.getAttribute('data-query');
          sendMessage(query);
        });
      });
    }

    function scrollMessages() {
      msgsList.scrollTop = msgsList.scrollHeight;
    }

    function appendUserMessage(text) {
      const bubble = document.createElement('div');
      bubble.className = 'tohfa-chat-bubble user';
      bubble.textContent = text;
      msgsList.appendChild(bubble);
      scrollMessages();
    }

    function formatBotHtml(rawText) {
      if (!rawText) return "";
      const div = document.createElement('div');
      div.textContent = rawText;
      let escaped = div.innerHTML;
      // Convert markdown links [label](url) to clickable tags safely
      escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#14381F;font-weight:bold;text-decoration:underline;" target="_blank">$1</a>');
      // Convert newlines to <br>
      escaped = escaped.replace(/\n/g, '<br>');
      return escaped;
    }

    function appendBotMessage(text) {
      const bubble = document.createElement('div');
      bubble.className = 'tohfa-chat-bubble bot';
      bubble.innerHTML = formatBotHtml(text);
      msgsList.appendChild(bubble);
      scrollMessages();
    }

    function appendLoadingBubble() {
      const bubble = document.createElement('div');
      bubble.className = 'tohfa-chat-bubble bot';
      bubble.id = 'tohfa-chat-loading-bubble';
      bubble.innerHTML = `
        <div class="tohfa-chat-loading-dots">
          <div class="tohfa-chat-dot"></div>
          <div class="tohfa-chat-dot"></div>
          <div class="tohfa-chat-dot"></div>
        </div>
      `;
      msgsList.appendChild(bubble);
      scrollMessages();
    }

    function removeLoadingBubble() {
      const bubble = document.getElementById('tohfa-chat-loading-bubble');
      if (bubble) bubble.remove();
    }

    function appendRecommendations(products, noteText) {
      if (!products || products.length === 0) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'tohfa-chat-recommendations-wrapper';

      products.forEach(p => {
        const card = document.createElement('a');
        card.className = 'tohfa-chat-product-card';
        card.href = `/buyer/product.html?id=${p.id}`;

        const imgUrl = p.image_url || '/img/ceramic_bowls.jpg';
        const formattedPrice = `₹${(p.price_paise / 100).toFixed(0)}`;

        card.innerHTML = `
          <div class="tohfa-chat-product-img-wrapper">
            <img class="tohfa-chat-product-img" src="${imgUrl}" alt="${p.name}" loading="lazy" />
          </div>
          <div class="tohfa-chat-product-details">
            <h5 class="tohfa-chat-product-name">${p.name}</h5>
            <p class="tohfa-chat-product-price">${formattedPrice}</p>
            <p class="tohfa-chat-product-reason">${p.reason || ''}</p>
          </div>
        `;
        wrapper.appendChild(card);
      });

      msgsList.appendChild(wrapper);
      scrollMessages();
    }

    function appendTicketCard(ticket) {
      if (!ticket) return;

      const card = document.createElement('div');
      card.className = 'tohfa-chat-ticket-card';
      card.innerHTML = `
        <div class="tohfa-chat-ticket-header">Support Ticket Created</div>
        <div class="tohfa-chat-ticket-id">Reference ID: #${ticket.id}</div>
        <p class="tohfa-chat-ticket-desc"><strong>Category:</strong> ${ticket.category}</p>
        <p class="tohfa-chat-ticket-desc">${ticket.description}</p>
      `;
      msgsList.appendChild(card);
      scrollMessages();
    }

    // Call API Route
    async function sendMessage(text) {
      if (isWaitingResponse) return;

      appendUserMessage(text);
      textInput.value = '';
      sendBtn.disabled = true;
      isWaitingResponse = true;

      // Hide quick chips once communication starts
      if (chipsContainer) {
        chipsContainer.style.display = 'none';
      }

      appendLoadingBubble();

      const token = sessionStorage.getItem('tohfa_access_token');
      const headers = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const res = await fetch('/api/chatbot/message', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            message: text,
            session_id: sessionId
          })
        });

        removeLoadingBubble();

        if (res.ok) {
          const resp = await res.json();
          const data = resp.data || {};
          const reply = typeof data === 'string' ? { text: data } : (data.reply ? { text: data.reply } : data);

          // Render response based on intent/type
          if (reply.type === 'recommendation') {
            appendBotMessage(reply.text || "Here are some recommendations from our catalog:");
            if (reply.products && reply.products.length > 0) {
              appendRecommendations(reply.products, reply.text);
            }
          } else if (reply.type === 'problem_report' && reply.ticket) {
            appendBotMessage(reply.text || "Your ticket has been logged successfully.");
            appendTicketCard(reply.ticket);
          } else {
            // FAQ / Unclear / Standard text reply
            appendBotMessage(reply.text || "I've received your query but encountered an empty response.");
          }

          // Trigger gold unread badge if panel is closed
          if (!panel.classList.contains('open')) {
            badge.style.display = 'block';
          }
        } else {
          appendBotMessage("I'm sorry, I encountered a communication error with our server. Please try again in a moment.");
        }
      } catch (err) {
        console.error("Chatbot response error:", err);
        removeLoadingBubble();
        appendBotMessage("It looks like I'm having trouble connecting right now. Please check your internet connection.");
      } finally {
        isWaitingResponse = false;
        sendBtn.disabled = textInput.value.trim().length === 0;
      }
    }
  }

  // Init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
  } else {
    initChatbot();
  }
})();
