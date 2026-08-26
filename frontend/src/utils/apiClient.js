/**
 * Tohfa v2 — Unified Frontend API Client
 * File: frontend/src/utils/apiClient.js
 * Master Reference: TOHFA_COMBINED_CODEBASE_AND_AUTH_AUDIT_MASTER.md (Section 5 & Section 6)
 */

import axios from 'axios';
import Toast from '../components/Toast.js';
import { TOKEN_KEY, USER_KEY, authStorage } from './auth.js';

const API_BASE_URL = '/api';

export function getAuthToken() {
  return authStorage.getToken();
}

export function isAuthenticated() {
  return !!getAuthToken();
}

export function clearAllTokens() {
  authStorage.clear();
}

export function requireAuth(pendingAction = null) {
  if (isAuthenticated()) return true;
  if (pendingAction) {
    sessionStorage.setItem('tohfa_pending_action', JSON.stringify(pendingAction));
  }
  const currentPath = window.location.pathname + window.location.search;
  sessionStorage.setItem('tohfa_return_to', currentPath);
  if (!window.location.pathname.includes('/auth/')) {
    window.location.href = `/auth/login.html?redirect=${encodeURIComponent(currentPath)}`;
  }
  return false;
}

export function unwrapResponse(res) {
  if (!res) return res;
  if (res.data !== undefined) {
    return res.data.data !== undefined ? res.data.data : res.data;
  }
  return res;
}

// ---------------------------------------------------------------------------
// UNIFIED FETCH-BASED apiRequest (Section 6 Specification)
// ---------------------------------------------------------------------------
export async function apiRequest(endpoint, options = {}) {
  const token = authStorage.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
    delete headers['content-type'];
  }

  // Normalize endpoint URL: handle '/api/foo' vs '/foo' vs 'foo'
  let cleanEndpoint = endpoint;
  if (cleanEndpoint.startsWith('/api/')) {
    cleanEndpoint = cleanEndpoint.slice(4); // remove '/api' prefix
  } else if (cleanEndpoint.startsWith('/api')) {
    cleanEndpoint = cleanEndpoint.slice(4);
  }
  if (!cleanEndpoint.startsWith('/')) {
    cleanEndpoint = `/${cleanEndpoint}`;
  }

  const targetUrl = `${API_BASE_URL}${cleanEndpoint}`;

  try {
    const response = await fetch(targetUrl, { ...options, headers });

    if (response.status === 401) {
      authStorage.clear();
      const currentPath = window.location.pathname + window.location.search;
      if (!currentPath.includes('/auth/')) {
        window.location.href = `/auth/login.html?redirect=${encodeURIComponent(currentPath)}`;
      }
      return null;
    }

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(json.message || json.error || `Request failed with status ${response.status}`);
    }

    // Automatically unwrap standardized data wrapper
    return json.data !== undefined ? json.data : json;
  } catch (error) {
    console.error(`API Error on [${options.method || 'GET'} ${endpoint}]:`, error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// PUBLIC api METHOD SUITE (Section 6 Specification)
// ---------------------------------------------------------------------------
export const api = {
  get:    (url, opts)       => apiRequest(url, { method: 'GET', ...opts }),
  post:   (url, body, opts) => apiRequest(url, { method: 'POST', body: (body instanceof FormData || typeof body === 'string') ? body : JSON.stringify(body), ...opts }),
  put:    (url, body, opts) => apiRequest(url, { method: 'PUT', body: (body instanceof FormData || typeof body === 'string') ? body : JSON.stringify(body), ...opts }),
  patch:  (url, body, opts) => apiRequest(url, { method: 'PATCH', body: (body instanceof FormData || typeof body === 'string') ? body : JSON.stringify(body), ...opts }),
  delete: (url, opts)       => apiRequest(url, { method: 'DELETE', ...opts })
};

// ---------------------------------------------------------------------------
// AXIOS INSTANCE (Maintained for backward compatibility)
// ---------------------------------------------------------------------------
const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
});

apiClient.isAuthenticated = isAuthenticated;
apiClient.requireAuth = requireAuth;
apiClient.unwrap = unwrapResponse;

// Attach token or mock responses for guest visits
apiClient.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    if (config.headers) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
      if (typeof config.headers.delete === 'function') {
        config.headers.delete('Content-Type');
        config.headers.delete('content-type');
      }
    }
  }
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  }

  const url = config.url || '';
  const method = (config.method || 'get').toLowerCase();

  if (method === 'get') {
    if (url.includes('/cart')) {
      return Promise.reject({
        isMock: true,
        mockResponse: { data: { success: true, data: { items: [], item_count: 0 } } }
      });
    }
    if (url.includes('/wishlist')) {
      return Promise.reject({
        isMock: true,
        mockResponse: { data: { success: true, data: { items: [], count: 0 } } }
      });
    }
    if (url.includes('/profile/me')) {
      return Promise.reject({
        isMock: true,
        mockResponse: { data: { success: false, message: 'Not logged in' } }
      });
    }
    if (url.includes('/notifications')) {
      return Promise.reject({
        isMock: true,
        mockResponse: { data: { success: true, unread_count: 0, notifications: [] } }
      });
    }
  }

  return config;
});

function prefixRelativeUrls(obj) {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    if (obj.startsWith('/uploads/') || obj.startsWith('/media/')) {
      const apiHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '' : 'https://api.thetohfa.in';
      return apiHost + obj;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(prefixRelativeUrls);
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      obj[key] = prefixRelativeUrls(obj[key]);
    }
  }
  return obj;
}

apiClient.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = prefixRelativeUrls(response.data);
    }
    const url = response.config?.url;
    const method = response.config?.method;
    if (url && (url.includes('/cart') || url.includes('/cart/items')) && ['post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
      window.dispatchEvent(new CustomEvent('tohfa-cart-updated'));
    }
    return response;
  },
  async (error) => {
    if (error.isMock) {
      return Promise.resolve(error.mockResponse);
    }
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      clearAllTokens();
      requireAuth();
      return Promise.reject(error);
    }

    if (error.response?.status !== 401 && !error.config?.suppressToast) {
      const isGet = (error.config?.method || 'get').toLowerCase() === 'get';
      const forceShow = error.config?.showToastOnError === true;
      if (!isGet || forceShow) {
        const msg = error.response?.data?.message || error.message || 'Request failed';
        Toast.show(msg, 'error');
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
