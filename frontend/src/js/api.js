/**
 * Tohfa v2 — Central API Client
 * File: frontend/src/js/api.js
 * Role: Single fetch wrapper used by EVERY frontend page.
 *       Handles auth headers, automatic token refresh, error normalization.
 *       Import this module first in any page that talks to the backend.
 */

import { TOKEN_KEY, USER_KEY, authStorage } from './auth.js';

// ---------------------------------------------------------------------------
const BACKEND_URL = '';

// ---------------------------------------------------------------------------
// INTERNAL: Token management (Unified Local & Session Storage)
// ---------------------------------------------------------------------------
function _getAccessToken() {
  return authStorage.getToken();
}

function _setTokens(tokenData) {
  if (!tokenData) return;
  const at = tokenData.accessToken || tokenData.access_token || tokenData.token || tokenData.data?.access_token || tokenData.data?.accessToken || tokenData.data?.token;
  const rt = tokenData.refreshToken || tokenData.refresh_token || tokenData.data?.refresh_token || tokenData.data?.refreshToken;
  if (at) {
    authStorage.setToken(at);
  }
  if (rt) {
    localStorage.setItem('tohfa_refresh_token', rt);
    sessionStorage.setItem('tohfa_refresh_token', rt);
  }
}

function _clearTokens() {
  authStorage.clear();
}

// ---------------------------------------------------------------------------
// INTERNAL: Refresh the access token using the stored refresh token
// Returns true if successful, false if refresh failed (user must re-login).
// ---------------------------------------------------------------------------
let _isRefreshing = false;
let _refreshQueue = [];

async function _refreshAccessToken() {
  if (_isRefreshing) {
    // Queue concurrent requests waiting for refresh
    return new Promise((resolve) => {
      _refreshQueue.push(resolve);
    });
  }

  _isRefreshing = true;
  const refreshToken = localStorage.getItem('tohfa_refresh_token') ||
                       sessionStorage.getItem('tohfa_refresh_token') ||
                       sessionStorage.getItem('tohfa_admin_refresh_token');

  if (!refreshToken) {
    _isRefreshing = false;
    return false;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, refresh_token: refreshToken }),
    });

    if (!res.ok) {
      _clearTokens();
      _isRefreshing = false;
      _refreshQueue.forEach(cb => cb(false));
      _refreshQueue = [];
      return false;
    }

    const data = await res.json();
    _setTokens(data);
    _isRefreshing = false;
    _refreshQueue.forEach(cb => cb(true));
    _refreshQueue = [];
    return true;
  } catch {
    _clearTokens();
    _isRefreshing = false;
    _refreshQueue.forEach(cb => cb(false));
    _refreshQueue = [];
    return false;
  }
}

// ---------------------------------------------------------------------------
// MAIN: Tohfa API fetch wrapper
// Usage: await api.get('/products')
//        await api.post('/auth/login', { email, password })
//        await api.put('/buyer/profile', formData, { isFormData: true })
// ---------------------------------------------------------------------------
async function _request(method, path, body = null, opts = {}) {
  const { isFormData = false, skipAuth = false } = opts;

  const isForm = isFormData || (typeof FormData !== 'undefined' && body instanceof FormData);

  const buildHeaders = () => {
    const headers = {};
    if (!isForm) {
      headers['Content-Type'] = 'application/json';
    }
    const token = _getAccessToken();
    if (token && !skipAuth) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const buildBody = () => {
    if (!body) return undefined;
    if (isForm) return body; // FormData — browser sets content-type with boundary
    return typeof body === 'string' ? body : JSON.stringify(body);
  };

  const cleanPath = path.startsWith('/api') ? path : (path.startsWith('/') ? path : `/${path}`);
  const targetUrl = `${BACKEND_URL}${cleanPath}`;

  let response = await fetch(targetUrl, {
    method,
    headers: buildHeaders(),
    body: buildBody(),
  });

  // If 401 — attempt token refresh then retry once
  if (response.status === 401 && !skipAuth) {
    const refreshed = await _refreshAccessToken();
    if (refreshed) {
      response = await fetch(targetUrl, {
        method,
        headers: buildHeaders(),
        body: buildBody(),
      });
    } else {
      _clearTokens();
      const currentPath = window.location.pathname + window.location.search;
      if (!window.location.pathname.includes('/auth/')) {
        window.location.href = `/auth/login.html?redirect=${encodeURIComponent(currentPath)}`;
      }
      return null;
    }
  }

  // Parse JSON response
  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => ({}));
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const error = new Error(
      (data && (data.message || data.error)) || `Request failed: ${response.status}`
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------
export const api = {
  get:    (path, opts)        => _request('GET',    path, null, opts),
  post:   (path, body, opts)  => _request('POST',   path, body, opts),
  put:    (path, body, opts)  => _request('PUT',    path, body, opts),
  patch:  (path, body, opts)  => _request('PATCH',  path, body, opts),
  delete: (path, opts)        => _request('DELETE', path, null, opts),
};

export { BACKEND_URL };
