/**
 * Tohfa v2 — Universal Empty State Component
 * File: frontend/src/utils/emptyState.js
 * Master Reference: TOHFA_COMBINED_CODEBASE_AND_AUTH_AUDIT_MASTER.md (Section 5.1)
 */

export function renderEmptyState({
  containerId,
  icon = '🎁',
  title = 'Nothing Found Here',
  description = 'There are no items to display at this moment.',
  actionText = 'Explore Marketplace',
  actionHref = '/buyer/home.html',
  theme = 'amber'
}) {
  const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!container) return;

  const bgColors = {
    amber: 'bg-amber-50 text-amber-900',
    rose: 'bg-rose-50 text-rose-600',
    stone: 'bg-stone-100 text-stone-700'
  };

  container.innerHTML = `
    <div class="col-span-full w-full flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <div class="w-20 h-20 ${bgColors[theme] || bgColors.amber} rounded-full flex items-center justify-center mb-4 text-3xl shadow-inner">
        ${icon}
      </div>
      <h3 class="text-xl md:text-2xl font-serif font-semibold text-stone-800 mb-2">${title}</h3>
      <p class="text-stone-500 max-w-md text-sm mb-6 leading-relaxed">${description}</p>
      ${actionText && actionHref ? `
        <a href="${actionHref}" class="inline-flex items-center gap-2 px-6 py-2.5 bg-stone-900 text-amber-50 rounded-full font-medium text-sm hover:bg-stone-800 transition shadow-sm hover:shadow">
          ${actionText} &rarr;
        </a>
      ` : ''}
    </div>
  `;
}

export default renderEmptyState;
