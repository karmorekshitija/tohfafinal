/**
 * File: frontend/src/buyer/occasions.js
 */
'use strict';
import { api } from '../js/api.js';
import { showToast } from '../js/utils.js';

const list = document.getElementById('occasionsList');
const loading = document.getElementById('occasionsLoading');
const empty = document.getElementById('occasionsEmpty');
const addBtn = document.getElementById('addOccasionBtn');

async function loadOccasions() {
  try {
    const res = await api.get('/api/occasions');
    const items = res?.data || [];
    if (loading) loading.style.display = 'none';

    if (!items.length) {
      if (empty) {
        empty.innerHTML = `
          <div style="text-align:center; padding:var(--space-8) var(--space-4);">
            <div style="font-size:48px; margin-bottom:var(--space-3);">🎉</div>
            <h3 style="font-family:var(--font-display); font-size:var(--text-xl); color:var(--color-primary); margin-bottom:var(--space-2);">No Occasions Saved Yet</h3>
            <p style="color:var(--color-text-muted); max-width:380px; margin:0 auto var(--space-4); font-size:var(--text-sm);">Never miss a special birthday, anniversary, or milestone. Add your first occasion to receive curated artisan gift recommendations.</p>
          </div>
        `;
        empty.style.display = 'block';
      }
      return;
    }

    if (list) {
      list.innerHTML = items.map(occ => `
        <div class="occasion-card">
          <div class="occasion-icon-wrap">🎁</div>
          <div style="flex:1;">
            <div style="font-family:var(--font-display); font-size:var(--text-base); font-weight:var(--weight-medium);">${occ.title || occ.name}</div>
            <div class="text-small" style="color:var(--color-text-muted);">${occ.date || ''}</div>
          </div>
          <span class="occasion-date-badge">${occ.days_remaining ? `${occ.days_remaining}d left` : 'Upcoming'}</span>
        </div>
      `).join('');
    }
  } catch (err) {
    if (loading) loading.style.display = 'none';
    if (empty) empty.style.display = 'block';
  }
}

if (addBtn) {
  addBtn.addEventListener('click', async () => {
    const title = document.getElementById('occasionName')?.value?.trim() || document.getElementById('occasionTitle')?.value?.trim();
    const occasion_type = document.getElementById('occasionType')?.value || 'birthday';
    const date = document.getElementById('occasionDate')?.value;
    const reminder_days = parseInt(document.getElementById('occasionReminder')?.value || '7', 10);
    const notes = document.getElementById('occasionNotes')?.value?.trim() || null;

    if (!title || !date) {
      showToast('Please fill in the occasion name/title and date.', 'error');
      return;
    }

    const payload = {
      title,
      name: title,
      occasion_type,
      type: occasion_type,
      date,
      reminder_days,
      notes
    };

    try {
      await api.post('/api/occasions', payload);
      showToast('Occasion saved successfully! 📅', 'success');
      loadOccasions();
    } catch (e) {
      showToast(e.message || 'Could not save occasion.', 'error');
    }
  });
}

window.deleteOccasion = async (id) => {
  if (!confirm('Remove this occasion?')) return;
  try {
    await api.delete(`/api/occasions/${id}`);
    showToast('Occasion removed.', 'info');
    loadOccasions();
  } catch (e) {
    showToast(e.message || 'Failed to delete occasion.', 'error');
  }
};

loadOccasions();
