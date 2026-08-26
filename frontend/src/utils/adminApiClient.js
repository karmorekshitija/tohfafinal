import axios from 'axios';

const adminApiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
});

// Attach admin token to every request
adminApiClient.interceptors.request.use((config) => {
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
  const token = sessionStorage.getItem('tohfa_auth_token') ||
                localStorage.getItem('tohfa_auth_token') ||
                sessionStorage.getItem('tohfa_admin_token') ||
                localStorage.getItem('tohfa_admin_token') ||
                sessionStorage.getItem('tohfa_access_token') ||
                localStorage.getItem('tohfa_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

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

// Redirect to login on 401/403 or try silent refresh
adminApiClient.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = prefixRelativeUrls(response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if ((error.response?.status === 401 || error.response?.status === 403) && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
        .then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return adminApiClient(originalRequest);
        })
        .catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = sessionStorage.getItem('tohfa_admin_refresh_token') ||
                           localStorage.getItem('tohfa_admin_refresh_token') ||
                           sessionStorage.getItem('tohfa_refresh_token') ||
                           localStorage.getItem('tohfa_refresh_token');
      if (refreshToken) {
        try {
          const res = await axios.post('/api/admin/auth/refresh', { refresh_token: refreshToken, refreshToken }, {
            headers: { 'Content-Type': 'application/json' }
          });
          if (res.data?.success) {
            const { access_token, refresh_token, token } = res.data.data;
            const newAccess = token || access_token;
            const newRefresh = refresh_token;

            if (newAccess) {
              sessionStorage.setItem('tohfa_auth_token', newAccess);
              localStorage.setItem('tohfa_auth_token', newAccess);
              sessionStorage.setItem('tohfa_admin_token', newAccess);
              localStorage.setItem('tohfa_admin_token', newAccess);
            }
            if (newRefresh) {
              sessionStorage.setItem('tohfa_admin_refresh_token', newRefresh);
              localStorage.setItem('tohfa_admin_refresh_token', newRefresh);
              sessionStorage.setItem('tohfa_refresh_token', newRefresh);
              localStorage.setItem('tohfa_refresh_token', newRefresh);
            }
            
            // Sync session across tabs
            window.dispatchEvent(new Event('tohfa-session-sync'));

            processQueue(null, newAccess);
            originalRequest.headers.Authorization = `Bearer ${newAccess}`;
            isRefreshing = false;
            return adminApiClient(originalRequest);
          }
        } catch (refreshError) {
          processQueue(refreshError, null);
          isRefreshing = false;
          sessionStorage.removeItem('tohfa_auth_token');
          localStorage.removeItem('tohfa_auth_token');
          sessionStorage.removeItem('tohfa_user_data');
          localStorage.removeItem('tohfa_user_data');
          sessionStorage.removeItem('tohfa_admin_token');
          localStorage.removeItem('tohfa_admin_token');
          sessionStorage.removeItem('tohfa_admin_refresh_token');
          localStorage.removeItem('tohfa_admin_refresh_token');
          window.location.href = '/admin/login.html';
          return Promise.reject(refreshError);
        }
      } else {
        isRefreshing = false;
        sessionStorage.removeItem('tohfa_auth_token');
        localStorage.removeItem('tohfa_auth_token');
        sessionStorage.removeItem('tohfa_user_data');
        localStorage.removeItem('tohfa_user_data');
        sessionStorage.removeItem('tohfa_admin_token');
        localStorage.removeItem('tohfa_admin_token');
        window.location.href = '/admin/login.html';
      }
    }
    return Promise.reject(error);
  }
);

export default adminApiClient;
