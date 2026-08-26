/**
 * Tohfa — Client-Side Router
 * File: frontend/src/js/router.js
 * Role: Role-based routing for single responsive frontend.
 */

'use strict';

/**
 * Role-aware root redirect.
 * Directs users to their single responsive starting page based on auth state.
 */
export function rootRedirect() {
  let role = 'buyer';
  try {
    const raw = localStorage.getItem('tohfa_user');
    if (raw) role = JSON.parse(raw).role || 'buyer';
  } catch { /* empty */ }

  if (role === 'admin') {
    window.location.replace('/admin/dashboard.html');
    return;
  }

  if (role === 'seller') {
    window.location.replace('/seller/dashboard.html');
    return;
  }

  // Default: buyer homepage
  window.location.replace('/buyer/home.html');
}

/**
 * Helper to get active user role
 */
export function getUserRole() {
  try {
    const raw = localStorage.getItem('tohfa_user');
    return raw ? JSON.parse(raw).role : 'buyer';
  } catch {
    return 'buyer';
  }
}

