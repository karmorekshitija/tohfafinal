# Rule: Tohfa API Clients & Response Handling

**Applies to:** Any frontend page importing an API client

---

## The Two Clients in the Codebase

1. **`apiClient` (default export from `src/utils/apiClient.js`)**
   - This is an **Axios** instance (`axios.create`).
   - Requests return standard Axios `response` objects:
     - `response.data` contains the HTTP response body returned by Express (`{ success: true, data: { ... } }`).
     - `response.status` contains HTTP status code (200, 400, etc.).

2. **`api` (named export from `src/utils/apiClient.js` or `src/js/api.js`)**
   - This is a `fetch`-based wrapper.
   - In `src/utils/apiClient.js`, `api.get()` calls `apiRequest()` which unwraps `json.data`.
   - In `src/js/api.js`, `api.get()` returns the raw parsed JSON response.

---

## Universal Robust Unwrap Pattern

When reading an API response in frontend pages, ALWAYS use this shape-tolerant unwrap:

```javascript
// Works for Axios ({ data: { success, data: { product } } }),
// fetch with raw JSON ({ success, data: { product } }),
// or pre-unwrapped data ({ product })
const resData = response?.data || response;
const payload = resData?.data || resData;
const item = payload?.product || payload?.item || payload;
```

Never assume `response` is already unwrapped when using Axios `apiClient`.
