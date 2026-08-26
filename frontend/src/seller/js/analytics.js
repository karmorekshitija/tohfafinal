/**
 * Tohfa Seller Studio — Analytics Utilities & Chart Guards (BUG-20 fix)
 * File: frontend/src/seller/js/analytics.js
 */

export function renderGuardedChart(canvasId, emptyPlaceholderId, chartConfig, currentInstance) {
  const canvas = document.getElementById(canvasId);
  const emptyPlaceholder = document.getElementById(emptyPlaceholderId);

  if (currentInstance) {
    currentInstance.destroy();
    currentInstance = null;
  }

  if (!canvas) return null;

  const datasets = chartConfig?.data?.datasets || [];
  const labels = chartConfig?.data?.labels || [];

  const hasData = labels.length > 0 && datasets.some(ds => 
    Array.isArray(ds.data) && ds.data.some(val => val !== 0 && val != null)
  );

  if (!hasData) {
    canvas.classList.add('hidden');
    if (emptyPlaceholder) emptyPlaceholder.classList.remove('hidden');
    return null;
  }

  canvas.classList.remove('hidden');
  if (emptyPlaceholder) emptyPlaceholder.classList.add('hidden');

  const ctx = canvas.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return null;

  return new Chart(ctx, chartConfig);
}
