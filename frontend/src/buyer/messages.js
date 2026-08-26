/**
 * File: frontend/src/buyer/messages.js
 */
'use strict';
import { api } from '../js/api.js';
import { showToast } from '../js/utils.js';

const threadList = document.getElementById('threadList');
const activeChatArea = document.getElementById('activeChatArea');
const chatEmpty = document.getElementById('chatEmpty');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

let activeConversationId = null;

async function init() {
  try {
    const res = await api.get('/api/messages/conversations');
    const threads = res?.data || [];
    if (threads.length === 0) {
      if (threadList) threadList.innerHTML = '<p class="text-small" style="padding:var(--space-4); color:var(--color-text-muted);">No active conversations yet.</p>';
      return;
    }
    if (threadList) {
      threadList.innerHTML = threads.map(t => `
        <div class="thread-item" data-id="${t.id}">
          <div style="font-weight:var(--weight-semibold); font-size:var(--text-sm);">${t.seller_name || 'Artisan'}</div>
          <div class="text-small" style="color:var(--color-text-muted);">${t.last_message || ''}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    if (threadList) threadList.innerHTML = '<p class="text-small" style="padding:var(--space-4); color:var(--color-text-muted);">Sign in to view messages.</p>';
  }
}

if (chatForm) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput?.value?.trim();
    if (!text) return;
    if (chatMessages) {
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble me';
      bubble.textContent = text;
      chatMessages.appendChild(bubble);
      chatInput.value = '';
    }
  });
}

init();
