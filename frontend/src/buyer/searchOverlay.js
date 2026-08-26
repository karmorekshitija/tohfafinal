/**
 * Tohfa Search Overlay Controller
 * File: frontend/src/buyer/searchOverlay.js
 */

export function initSearchOverlay() {
  const searchBtn = document.getElementById('header-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', (e) => {
      // If already navigating to search.html, allow natural navigation
    });
  }
}

export default { initSearchOverlay };
