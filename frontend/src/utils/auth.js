/**
 * Tohfa v2 — Auth Utility & Storage Wrapper
 * File: frontend/src/utils/auth.js
 * Master Reference: TOHFA_COMBINED_CODEBASE_AND_AUTH_AUDIT_MASTER.md (Section 2.1 / AUTH-02)
 */

export const TOKEN_KEY = 'tohfa_auth_token';
export const USER_KEY = 'tohfa_user_data';

export const authStorage = {
  getToken: () => {
    return localStorage.getItem(TOKEN_KEY) ||
           sessionStorage.getItem(TOKEN_KEY) ||
           localStorage.getItem('tohfa_access_token') ||
           sessionStorage.getItem('tohfa_access_token') ||
           localStorage.getItem('auth_token') ||
           sessionStorage.getItem('auth_token') ||
           localStorage.getItem('tohfa_admin_token') ||
           sessionStorage.getItem('tohfa_admin_token') ||
           null;
  },

  setToken: (token) => {
    if (!token) return;
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_KEY, token);
    // Legacy compatibility
    localStorage.setItem('tohfa_access_token', token);
    sessionStorage.setItem('tohfa_access_token', token);
  },

  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);

    // Clean up all legacy / session token keys
    localStorage.removeItem('auth_token');
    localStorage.removeItem('tohfa_access_token');
    localStorage.removeItem('tohfa_refresh_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('tohfa_user');
    localStorage.removeItem('tohfa_admin_token');
    localStorage.removeItem('tohfa_admin_refresh_token');

    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('tohfa_access_token');
    sessionStorage.removeItem('tohfa_refresh_token');
    sessionStorage.removeItem('user_role');
    sessionStorage.removeItem('tohfa_user');
    sessionStorage.removeItem('tohfa_admin_token');
    sessionStorage.removeItem('tohfa_admin_refresh_token');
  },

  getUser: () => {
    try {
      const raw = localStorage.getItem(USER_KEY) ||
                  sessionStorage.getItem(USER_KEY) ||
                  localStorage.getItem('tohfa_user') ||
                  sessionStorage.getItem('tohfa_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setUser: (user) => {
    if (!user) return;
    const str = typeof user === 'string' ? user : JSON.stringify(user);
    localStorage.setItem(USER_KEY, str);
    sessionStorage.setItem(USER_KEY, str);
    localStorage.setItem('tohfa_user', str);
    sessionStorage.setItem('tohfa_user', str);
  }
};

/**
 * Open Redirect Protection Helper (CHK-14)
 * Ensures redirect URL is a safe relative internal path starting with '/' and NOT starting with '//' or '/\'
 */
export function getSafeRedirectUrl(target, fallback = '/buyer/home.html') {
  if (!target || typeof target !== 'string') return fallback;
  const trimmed = target.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return trimmed;
  }
  return fallback;
}

/**
 * Intelligent Role-Based Redirection (AUTH-01 / CHK-07 / CHK-14)
 * @param {Object} [user] Optional user object. If not passed, fetched from authStorage.
 */
export function redirectUserByRole(user) {
  const activeUser = user || authStorage.getUser();
  const role = activeUser?.role;

  if (role === 'admin' || role === 'master_admin') {
    window.location.href = '/admin/dashboard.html';
    return;
  }

  if (role === 'seller') {
    const isApprovedOrOnboarded = activeUser.is_onboarded === true ||
                                  activeUser.is_approved === 1 ||
                                  activeUser.is_approved === true ||
                                  activeUser.isSellerApproved === true ||
                                  activeUser.verification_status === 'verified';
    if (isApprovedOrOnboarded) {
      window.location.href = '/seller/dashboard.html';
    } else {
      window.location.href = '/seller/onboarding.html';
    }
    return;
  }

  // Buyer or standard user with Open Redirect Protection
  const params = new URLSearchParams(window.location.search);
  const rawTarget = params.get('redirect') ||
                    params.get('returnTo') ||
                    sessionStorage.getItem('tohfa_return_to');
  sessionStorage.removeItem('tohfa_return_to');
  const safeReturnTo = getSafeRedirectUrl(rawTarget, '/buyer/home.html');
  window.location.href = safeReturnTo;
}

export function logout() {
  const refreshToken = sessionStorage.getItem('tohfa_refresh_token') ||
                       localStorage.getItem('tohfa_refresh_token');

  // Fire and forget logout endpoint call
  if (refreshToken) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    }).catch(err => console.error("Logout request failed:", err));
  }

  authStorage.clear();
  window.location.href = '/auth/login.html';
}

// Window global bindings
if (typeof window !== 'undefined') {
  window.logout = logout;
  window.authStorage = authStorage;
  window.redirectUserByRole = redirectUserByRole;
  window.getSafeRedirectUrl = getSafeRedirectUrl;
}

export default {
  TOKEN_KEY,
  USER_KEY,
  authStorage,
  getSafeRedirectUrl,
  redirectUserByRole,
  logout
};
