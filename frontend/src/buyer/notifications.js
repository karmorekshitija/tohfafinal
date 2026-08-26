/**
 * Tohfa v2 — Buyer Notifications Logic
 * File: frontend/src/buyer/notifications.js
 */
'use strict';

import { api } from '../js/api.js';
import { initBuyerShell } from '../js/layout.js';
import { requireAuth } from '../js/auth.js';
import { formatDate } from '../js/utils.js';

if (requireAuth()) {
  initBuyerShell();
}

const listContainer = document.getElementById('notificationsList');
const emptyState = document.getElementById('emptyState');

export async function loadNotifications() {
  if (!listContainer) return;

  try {
    const res = await api.get('/api/notifications');
    const data = res?.data !== undefined ? res.data : res;
    const items = Array.isArray(data) ? data : (data?.notifications || []);

    if (!items.length) {
      if (emptyState) emptyState.style.display = 'flex';
      listContainer.innerHTML = '';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    listContainer.innerHTML = items.map(item => `
      <div class="notification-card ${item.is_read ? 'read' : 'unread'}" data-id="${item.id}">
        <div class="notification-icon">
          <span class="material-symbols-outlined">${item.icon || 'notifications'}</span>
        </div>
        <div class="notification-body">
          <div class="notification-title">${item.title || 'Update'}</div>
          <p class="notification-text">${item.message || item.body || ''}</p>
          <span class="notification-time">${formatDate(item.created_at)}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load notifications:', err);
    if (emptyState) emptyState.style.display = 'flex';
  }
}

document.addEventListener('DOMContentLoaded', loadNotifications);
