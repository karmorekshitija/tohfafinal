/**
 * Tohfa v2 — Reusable Seller Onboarding Status Hook & Client State
 * File: frontend/src/utils/useSellerOnboardingStatus.js
 * Role: Single client-side source of truth for seller onboarding readiness:
 *       - hasBillingAddress: boolean
 *       - hasBankingDetails: boolean
 *       - onboardingTourDismissed: boolean
 *       - isComplete: boolean
 */
'use strict';

let cachedStatus = null;
let fetchPromise = null;
const LISTENERS = new Set();

/**
 * Returns auth headers with token from storage
 */
function getAuthHeaders() {
  const token = (typeof window !== 'undefined' && window.authStorage?.getItem('tohfa_access_token')) ||
                sessionStorage.getItem('tohfa_access_token') ||
                sessionStorage.getItem('tohfa_auth_token') ||
                localStorage.getItem('tohfa_access_token') ||
                localStorage.getItem('tohfa_auth_token') ||
                localStorage.getItem('token') ||
                sessionStorage.getItem('token') || '';
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

/**
 * Normalizes boolean flags from various backend response formats
 */
function normalizeBoolean(val) {
  return val === true || val === 'true' || val === 1 || val === '1';
}

/**
 * Fetches the seller profile and extracts onboarding flags.
 */
export async function fetchSellerOnboardingStatus(forceRefresh = false) {
  if (!forceRefresh && cachedStatus && !cachedStatus.loading) {
    return cachedStatus;
  }

  if (fetchPromise && !forceRefresh) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      const headers = getAuthHeaders();
      if (!headers.Authorization) {
        cachedStatus = {
          hasBillingAddress: false,
          hasBankingDetails: false,
          onboardingTourDismissed: false,
          isComplete: false,
          missing: ['billing_address', 'banking_details'],
          loading: false,
          error: 'Not authenticated',
          profile: null
        };
        return cachedStatus;
      }

      const res = await fetch('/api/seller/profile', { headers });
      if (!res.ok) {
        throw new Error(`Profile fetch failed with status ${res.status}`);
      }

      const json = await res.json();
      const profile = json.data?.profile || json.data || {};

      const hasBillingAddress = normalizeBoolean(
        profile.hasBillingAddress ?? profile.has_billing_address ?? (profile.billing_address?.address_line1 && profile.billing_address?.city)
      );

      const hasBankingDetails = normalizeBoolean(
        profile.hasBankingDetails ?? profile.has_banking_details ?? (profile.bank_details?.account_number || profile.bank_details?.bank?.account_number)
      );

      const onboardingTourDismissed = normalizeBoolean(
        profile.onboardingTourDismissed ?? profile.onboarding_tour_dismissed
      );

      const missing = [];
      if (!hasBillingAddress) missing.push('billing_address');
      if (!hasBankingDetails) missing.push('banking_details');

      cachedStatus = {
        hasBillingAddress,
        hasBankingDetails,
        onboardingTourDismissed,
        isComplete: hasBillingAddress && hasBankingDetails,
        missing,
        loading: false,
        error: null,
        profile
      };

      // Broadcast update to all registered listeners and window
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('seller-onboarding-status-updated', {
          detail: cachedStatus
        }));
      }
      LISTENERS.forEach(fn => {
        try { fn(cachedStatus); } catch (e) { console.error(e); }
      });

      return cachedStatus;
    } catch (err) {
      console.warn('[useSellerOnboardingStatus] Error fetching status:', err.message);
      cachedStatus = {
        hasBillingAddress: false,
        hasBankingDetails: false,
        onboardingTourDismissed: false,
        isComplete: false,
        missing: ['billing_address', 'banking_details'],
        loading: false,
        error: err.message,
        profile: null
      };
      return cachedStatus;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Reusable hook function for components, scripts, and pages.
 * Supports synchronous snapshot access and async refresh.
 */
export function useSellerOnboardingStatus(onUpdateCallback) {
  if (typeof onUpdateCallback === 'function') {
    LISTENERS.add(onUpdateCallback);
  }

  const status = cachedStatus || {
    hasBillingAddress: false,
    hasBankingDetails: false,
    onboardingTourDismissed: false,
    isComplete: false,
    missing: ['billing_address', 'banking_details'],
    loading: true,
    error: null,
    profile: null
  };

  return {
    ...status,
    refresh: () => fetchSellerOnboardingStatus(true),
    unsubscribe: () => {
      if (onUpdateCallback) LISTENERS.delete(onUpdateCallback);
    }
  };
}

// Make available on window for inline scripts and HTML pages
if (typeof window !== 'undefined') {
  window.useSellerOnboardingStatus = useSellerOnboardingStatus;
  window.fetchSellerOnboardingStatus = fetchSellerOnboardingStatus;

  // Listen for storage changes in multi-tab setups
  window.addEventListener('storage', (e) => {
    if (e.key === 'tohfa_onboarding_updated') {
      fetchSellerOnboardingStatus(true).catch(() => {});
    }
  });
}
