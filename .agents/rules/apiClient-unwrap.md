# Rule: `apiClient` (axios) Auto-Unwraps `json.data`

**Applies to:** Any page using `import apiClient from '/src/utils/apiClient.js'`

---

## What the apiClient Does

The axios instance in `frontend/src/utils/apiClient.js` has a response interceptor at **line 194–195** that automatically strips the outer `data` wrapper from every successful response:

```js
// apiClient.js line 194-195
return json.data !== undefined ? json.data : json;
```

## What This Means for You

The backend always responds with this shape:
```json
{ "success": true, "data": { "product": { "id": 1, "name": "..." } } }
```

But `apiClient.get(...)` resolves to:
```json
{ "product": { "id": 1, "name": "..." } }
```

The outer `success` and `data` keys are gone. `response` IS `json.data`.

## ✅ Correct Pattern

```js
const response = await apiClient.get(`/products/${id}`);
// response = { product: {...} }  ← already unwrapped by apiClient

const product = response?.product;  // ✅ direct
```

## ❌ Wrong Pattern (Do NOT Do This)

```js
const response = await apiClient.get(`/products/${id}`);

// WRONG — response.data is undefined, apiClient already stripped it
const payload = response.data || response;
const product = payload.data?.product || payload.product;
```

## Scope

This rule applies to all pages that use `apiClient` (the default export from `utils/apiClient.js`).  
It does **NOT** apply to pages using `api.js` (from `js/api.js`) which is a plain `fetch` wrapper that does NOT auto-unwrap.

| Client | File | Auto-unwraps? |
|--------|------|---------------|
| `apiClient` (default export) | `src/utils/apiClient.js` | ✅ YES — strips `json.data` |
| `api` named export | `src/js/api.js` | ❌ NO — returns raw JSON |
