/**
 * Tohfa v2 — Auth State Manager
 * File: frontend/src/js/auth.js
 * Role: JWT storage, user session management, role detection,
 *       and page-level auth guards. Import on every protected page.
 * Master Reference: TOHFA_COMBINED_CODEBASE_AND_AUTH_AUDIT_MASTER.md (Section 2.1 / AUTH-02)
 */

// ---------------------------------------------------------------------------
// STANDARDIZED STORAGE KEYS
// ---------------------------------------------------------------------------
export const TOKEN_KEY = 'tohfa_auth_token';
export const USER_KEY  = 'tohfa_user_data';

// Legacy keys for backward compatibility
const KEYS = {
  ACCESS_TOKEN:  'tohfa_access_token',
  REFRESH_TOKEN: 'tohfa_refresh_token',
  USER:          'tohfa_user',
};

// ---------------------------------------------------------------------------
// UNIFIED AUTH STORAGE HELPER
// ---------------------------------------------------------------------------
export const authStorage = {
  getToken: () => {
    return localStorage.getItem(TOKEN_KEY) ||
           sessionStorage.getItem(TOKEN_KEY) ||
           localStorage.getItem(KEYS.ACCESS_TOKEN) ||
           sessionStorage.getItem(KEYS.ACCESS_TOKEN) ||
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
    localStorage.setItem(KEYS.ACCESS_TOKEN, token);
    sessionStorage.setItem(KEYS.ACCESS_TOKEN, token);
  },

  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);

    localStorage.removeItem(KEYS.ACCESS_TOKEN);
    localStorage.removeItem(KEYS.REFRESH_TOKEN);
    localStorage.removeItem(KEYS.USER);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('tohfa_admin_token');
    localStorage.removeItem('tohfa_admin_refresh_token');

    sessionStorage.removeItem(KEYS.ACCESS_TOKEN);
    sessionStorage.removeItem(KEYS.REFRESH_TOKEN);
    sessionStorage.removeItem(KEYS.USER);
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('user_role');
    sessionStorage.removeItem('tohfa_admin_token');
    sessionStorage.removeItem('tohfa_admin_refresh_token');
  },

  getUser: () => {
    try {
      const raw = localStorage.getItem(USER_KEY) ||
                  sessionStorage.getItem(USER_KEY) ||
                  localStorage.getItem(KEYS.USER) ||
                  sessionStorage.getItem(KEYS.USER);
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
    localStorage.setItem(KEYS.USER, str);
    sessionStorage.setItem(KEYS.USER, str);
  }
};

// ---------------------------------------------------------------------------
// GET current user
// ---------------------------------------------------------------------------
export function getUser() {
  return authStorage.getUser();
}

// ---------------------------------------------------------------------------
// GET current user's role
// Returns: 'buyer' | 'seller' | 'admin' | 'master_admin' | null
// ---------------------------------------------------------------------------
export function getRole() {
  const user = getUser();
  return user ? user.role : null;
}

// ---------------------------------------------------------------------------
// CHECK if user is logged in
// ---------------------------------------------------------------------------
export function isLoggedIn() {
  return !!authStorage.getToken();
}

// ---------------------------------------------------------------------------
// SAVE auth data after login/register
// ---------------------------------------------------------------------------
export function saveAuth({ accessToken, refreshToken, user, access_token, refresh_token, token }) {
  const at = token || accessToken || access_token;
  const rt = refreshToken || refresh_token;

  if (at) {
    authStorage.setToken(at);
    if (user?.role === 'admin' || user?.role === 'master_admin') {
      localStorage.setItem('tohfa_admin_token', at);
      sessionStorage.setItem('tohfa_admin_token', at);
    }
  }

  if (rt) {
    localStorage.setItem(KEYS.REFRESH_TOKEN, rt);
    sessionStorage.setItem(KEYS.REFRESH_TOKEN, rt);
    if (user?.role === 'admin' || user?.role === 'master_admin') {
      localStorage.setItem('tohfa_admin_refresh_token', rt);
      sessionStorage.setItem('tohfa_admin_refresh_token', rt);
    }
  }

  if (user) {
    authStorage.setUser(user);
  }
}

// ---------------------------------------------------------------------------
// CLEAR auth data (logout)
// ---------------------------------------------------------------------------
export function clearAuth() {
  authStorage.clear();
}

// ---------------------------------------------------------------------------
// UPDATE cached user object
// ---------------------------------------------------------------------------
export function updateCachedUser(updates) {
  const user = getUser();
  if (user) {
    authStorage.setUser({ ...user, ...updates });
  }
}

// ---------------------------------------------------------------------------
// OPEN REDIRECT PROTECTION HELPER (CHK-14)
// ---------------------------------------------------------------------------
export function getSafeRedirectUrl(target, fallback = '/buyer/home.html') {
  if (!target || typeof target !== 'string') return fallback;
  const trimmed = target.trim();
  // Safe relative internal path: starts with single '/', does NOT start with '//' or '/\\'
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return trimmed;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// INTELLIGENT ROLE-BASED REDIRECTION (AUTH-01 / CHK-07 / CHK-14)
// ---------------------------------------------------------------------------
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

  // Buyer or fallback with Open Redirect Protection
  const params = new URLSearchParams(window.location.search);
  const rawTarget = params.get('redirect') ||
                    params.get('returnTo') ||
                    sessionStorage.getItem('tohfa_return_to');
  sessionStorage.removeItem('tohfa_return_to');
  const safeReturnTo = getSafeRedirectUrl(rawTarget, '/buyer/home.html');
  window.location.href = safeReturnTo;
}

// ---------------------------------------------------------------------------
// GUARD: Require login — redirect to login if not authenticated
// ---------------------------------------------------------------------------
export function requireAuth(redirectTo = '/auth/login.html') {
  if (!isLoggedIn()) {
    const currentPath = window.location.pathname + window.location.search;
    sessionStorage.setItem('tohfa_return_to', currentPath);
    window.location.href = redirectTo.includes('?') ? redirectTo : `${redirectTo}?redirect=${encodeURIComponent(currentPath)}`;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GUARD: Require specific role
// ---------------------------------------------------------------------------
export function requireRole(roles, redirectTo = '/buyer/home.html') {
  const role = getRole();
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(role)) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GUARD: Redirect if already logged in (for login/signup pages)
// ---------------------------------------------------------------------------
export function redirectIfLoggedIn() {
  if (!isLoggedIn()) return;
  redirectUserByRole();
}

// ---------------------------------------------------------------------------
// GUARD: Require approved seller
// ---------------------------------------------------------------------------
export function requireApprovedSeller() {
  const user = getUser();
  const isApproved = user && (user.is_onboarded || user.is_approved === 1 || user.is_approved === true || user.isSellerApproved === true || user.verification_status === 'verified');
  if (!isApproved) {
    window.location.href = '/seller/onboarding.html';
    return false;
  }
  return true;
}

export function logout() {
  const refreshToken = sessionStorage.getItem('tohfa_refresh_token') ||
                       localStorage.getItem('tohfa_refresh_token');

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

if (typeof window !== 'undefined') {
  window.authStorage = authStorage;
  window.redirectUserByRole = redirectUserByRole;
  window.getSafeRedirectUrl = getSafeRedirectUrl;
  window.logout = logout;
}

export default {
  TOKEN_KEY,
  USER_KEY,
  authStorage,
  getUser,
  getRole,
  isLoggedIn,
  saveAuth,
  clearAuth,
  updateCachedUser,
  getSafeRedirectUrl,
  redirectUserByRole,
  requireAuth,
  requireRole,
  redirectIfLoggedIn,
  requireApprovedSeller,
  logout
};
