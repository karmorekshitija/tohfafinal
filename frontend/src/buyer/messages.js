/**
 * File: frontend/src/buyer/messages.js
 * U-01 fix: Messaging is not yet implemented. Show a clear Coming Soon state
 * instead of a blank infinite spinner.
 */
'use strict';

const threadList = document.getElementById('threadList');
const activeChatArea = document.getElementById('activeChatArea');
const chatEmpty = document.getElementById('chatEmpty');

// U-01 fix: Show Coming Soon immediately — do not call unimplemented API
const comingSoonHTML = `
  <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;
              padding: 48px 24px; text-align:center; grid-column:1/-1;">
    <div style="font-size:56px; margin-bottom:16px;">💬</div>
    <h3 style="font-family:var(--font-display,serif); font-size:1.25rem;
               color:var(--color-primary,#14381F); margin-bottom:8px;">
      Messaging Coming Soon
    </h3>
    <p style="color:var(--color-text-muted,#666); max-width:340px; font-size:0.875rem; line-height:1.5;">
      Direct messaging between buyers and artisans is on our roadmap.
      For now, reach your artisan via the WhatsApp button on their store page.
    </p>
  </div>
`;

if (threadList) threadList.innerHTML = comingSoonHTML;
if (activeChatArea) activeChatArea.style.display = 'none';
if (chatEmpty) chatEmpty.style.display = 'none';
