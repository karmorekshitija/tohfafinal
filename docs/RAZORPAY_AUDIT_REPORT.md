# 🛡️ Tohfa v2 — Razorpay Incident & Architecture Audit Report

**Date & Time**: 27 September 2026, 13:45 IST  
**Author**: Senior Full Stack & Systems Architecture Engineer  
**Scope**: Razorpay Integration, Checkout Workflow, Order Rendering, and Launch Readiness  

---

## Executive Summary

During our deep-dive analysis of Tohfa v2's codebase and live runtime environment, we isolated the exact reasons why Razorpay payments are failing, why the order details page displayed **₹0.00 / N/A / Empty Items** (as seen in `Screenshot 2026-09-27 at 12.36.30 PM.png`), and where the **Bypass Razorpay** option originates.

| Issue | Severity | Status | Root Cause |
|---|---|---|---|
| **Razorpay API 401 Unauthorized** | 🔴 Critical (Blocker) | Identified | Key ID & Secret pair in `.env` (`rzp_test_TgQ9Sb5UZxYnLS`) is rejected by Razorpay (`HTTP 401 Authentication failed`). |
| **Bypass Razorpay Button Visible** | 🟠 High (Pre-Launch) | Identified | `<button id="btn-test-pay">` in `frontend/src/buyer/cart.html` allows users to place orders bypassing payment. |
| **Order Detail Shows ₹0.00 & N/A** | 🟡 Medium (Visual/Data) | Identified | `getOrderById` query was missing `total_paise`, `subtotal_paise`, `shipping_paise`, and `ship_to` structuring; `order-detail.html` lacked fallbacks. |
| **Missing Order Items in DB** | 🟡 Medium (Edge Case) | Identified | Legacy order record `2473186c` created at 00:02 IST had empty `order_items` from an earlier schema transition. Subsequent orders created after 03:50 IST have all items intact. |

---

## 1. Why Did Razorpay Work at Night but Fails Now?

### The Forensic Timeline

1. **Midnight Success (00:02:15 IST / 18:32:15 UTC)**:
   - Order `#TOHFA-P52VNZ4D` (ID `2473186c-894d-4fee-8bec-79a1e0420823`) was placed for **₹328.00**.
   - Razorpay generated `order_TglW8oPyKfBhMx` and recorded a real successful transaction `pay_TglWZjGOlTTTCx`.
   - The signature `7b0b7459b63a5d7d7f4f29f98b9df1b73277ddb549090fad4f54a1f2ec8d81ab` was verified by HMAC-SHA256 and stored in the PostgreSQL `payments` table.
   - **Conclusion**: At midnight, the credentials in the environment matched Razorpay's authentication server.

2. **What Changed Between 00:02 IST and 12:30 PM?**:
   - We executed an automated authentication probe against Razorpay’s official API endpoint (`https://api.razorpay.com/v1/orders`) using the exact `RAZORPAY_PRIMARY_KEY_ID` and `RAZORPAY_PRIMARY_KEY_SECRET` currently configured in `.env`.
   - **Probe Result**:
     ```json
     {
       "statusCode": 401,
       "error": {
         "description": "Authentication failed",
         "code": "BAD_REQUEST_ERROR"
       }
     }
     ```
   - **Reason**: In Razorpay, when a developer visits the Razorpay Dashboard (as shown by open tabs `x.razorpay.com` and `Razorpay Dashboard` in the browser at 3:00 AM) and clicks **"Regenerate Key"** or switches between accounts, Razorpay **immediately revokes** the previous secret key.
   - If the new Key ID was copied to `.env` without its newly issued Secret (or if the Secret was regenerated and not updated in `.env`), any subsequent API call fails with `401 Authentication failed`.

3. **How This Breaks the User Checkout**:
   - The buyer clicks **"Place Order & Pay"** on `/buyer/cart.html` or `/buyer/checkout.html`.
   - The backend creates the order record (`POST /api/orders`).
   - The frontend immediately calls `POST /api/payments/create-order` to get the Razorpay checkout intent.
   - The backend calls `razorpay.orders.create(...)`, which crashes with `401 Authentication failed`.
   - The backend catches this error and returns:
     ```json
     {
       "success": false,
       "message": "Payment gateway authentication failed. Please verify Razorpay API keys in backend/.env",
       "code": "GATEWAY_AUTH_ERROR"
     }
     ```
   - The frontend receives HTTP 502, aborts the payment flow, and **the Razorpay payment popup never opens**.

---

## 2. Why Did the Screenshot Show ₹0.00, N/A Shipped To, and No Items?

In `Screenshot 2026-09-27 at 12.36.30 PM.png`, order `2473186c-894d-4fee-8bec-79a1e0420823` was viewed on `order-detail.html`:
- **Subtotal, Shipping, Total displayed as ₹0.00**:
  - `frontend/src/buyer/order-detail.html` renders prices using:
    ```javascript
    formatPaise(o.subtotal_paise) // if undefined, returns "₹0.00"
    formatPaise(o.shipping_paise) // if undefined, returns "₹0.00"
    formatPaise(o.total_paise)    // if undefined, returns "₹0.00"
    ```
  - In `backend/src/controllers/order.controller.js` (`getOrderById`), the SQL query was selecting `o.total_amount` (₹328.00) in rupees, but **was not returning `subtotal_paise`, `shipping_paise`, or `total_paise`**.
  - Because `o.subtotal_paise` was `undefined`, `formatPaise(undefined)` defaulted to `"₹0.00"`.
- **Shipped To: "N/A - No shipping details available"**:
  - `order-detail.html` expected a structured object `o.ship_to.full_name`, `o.ship_to.line1`, etc.
  - The backend was returning `o.shipping_address` as a raw JSON string/object or flat address columns, but did not populate `o.ship_to`.
  - When `o.ship_to` was falsy, the template rendered `"N/A"` and `"No shipping details available"`.
- **Items in Order: Empty**:
  - In Neon PostgreSQL, order `2473186c-894d-4fee-8bec-79a1e0420823` was created before the cart-item UUID migration fix was applied last night. Its items were not linked in `order_items`. Later test orders (e.g. `afdb1cfb` at 03:58 IST) had 2/2 items properly linked.

---

## 3. The "Bypass Razorpay Option" Analysis

### Where is it located?
1. **Frontend UI**:
   - `frontend/src/buyer/cart.html` (Lines 213–216):
     ```html
     <button id="btn-test-pay" onclick="placeOrder(true)" class="w-full bg-amber-800 hover:bg-amber-900 text-white py-2.5 rounded-full font-semibold text-xs font-['DM_Sans'] transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer">
       <span class="material-symbols-outlined text-sm">bolt</span>
       <span>Instant Test Order (Bypass Razorpay Modal)</span>
     </button>
     ```
2. **Frontend Fallback Mechanisms**:
   - `frontend/src/buyer/cart.html` (lines 952–959 and 966–980):
     Auto-detects mock/test gateway and redirects to `payments/test-pay`.
   - `frontend/src/buyer/checkout.html` (lines 1186–1193 and 1201–1215):
     Contains the same test-pay bypass hooks.
   - `frontend/src/buyer/checkout.js` (lines 243–255 and 266–281):
     Contains `if (isTestPay) ... /api/payments/test-pay`.
3. **Backend API**:
   - `backend/src/routes/payment.routes.js`: Exposes `POST /api/payments/test-pay`.
   - `backend/src/controllers/payment.controller.js`: `testPay` accepts any order ID and marks it as `paid` using a simulated signature.

### Why Must This Be Disabled for Launch?
If this button or API remains active in production:
- Any buyer can click the button or call `/api/payments/test-pay` using DevTools or curl to acquire products for free without paying a single rupee.
- It violates Razorpay security standards and basic e-commerce integrity.

---

## 4. Launch Readiness Requirements (Test Mode vs Live Mode)

The user noted: *"we are now going to launch"*.

1. **Test Mode (`rzp_test_...`)**:
   - Test mode keys **never process real money**.
   - If real customers enter their real UPI or credit cards on a test key, the transaction fails with `"This is a test payment mode"`.
2. **Live Mode (`rzp_live_...`)**:
   - Before launch, the developer must switch to **Live Mode** in the Razorpay Dashboard.
   - Generate a **Live Key ID** (`rzp_live_...`) and **Live Key Secret**.
   - Paste them into `backend/.env` and `.env`:
     ```env
     RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxxxx
     RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
     RAZORPAY_PRIMARY_KEY_ID=rzp_live_xxxxxxxxxxxxxxxx
     RAZORPAY_PRIMARY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
     ```
   - Set up the Razorpay Webhook in the Razorpay Dashboard:
     - URL: `https://<your-production-domain>/api/webhooks/razorpay`
     - Secret: Set `RAZORPAY_PRIMARY_WEBHOOK_SECRET` in `.env`.
     - Subscribed events: `order.paid`, `payment.captured`, `payment.failed`, `refund.processed`.

---

## 5. Architectural Action Plan (Fixes to Execute)

### A. Remove All "Bypass Razorpay" Buttons & Mock Fallbacks
1. **`frontend/src/buyer/cart.html`**:
   - Remove the `<button id="btn-test-pay">` button completely.
   - Remove the `isTestPay` parameter and mock gateway auto-bypass from `placeOrder()`.
2. **`frontend/src/buyer/checkout.html`**:
   - Remove the `isTestPay` branch and mock gateway auto-bypass.
3. **`frontend/src/buyer/checkout.js`**:
   - Remove `isTestPay` logic and test-pay fallback.
4. **`backend/src/controllers/payment.controller.js`**:
   - Guard `testPay` endpoint: reject with `403 Forbidden` if `NODE_ENV === 'production'` or `ALLOW_TEST_PAY !== 'true'`.

### B. Fix Order Detail Rendering (`order-detail.html` & `order.controller.js`)
1. **`backend/src/controllers/order.controller.js`**:
   - Ensure `getOrderById` returns `total_paise`, `subtotal_paise`, `shipping_paise`, and structured `ship_to`.
2. **`frontend/src/buyer/order-detail.html`**:
   - Add resilient fallback formatting:
     ```javascript
     formatPaise(o.subtotal_paise || (o.total_amount ? Math.round((o.total_amount - (o.shipping_amount || 0)) * 100) : 0))
     formatPaise(o.shipping_paise || (o.shipping_amount ? Math.round(o.shipping_amount * 100) : 0))
     formatPaise(o.total_paise || (o.total_amount ? Math.round(o.total_amount * 100) : 0))
     ```
   - Fallback `ship_to` to `o.shipping_address` if `o.ship_to` properties are absent.
3. **Database Repair for Order `2473186c`**:
   - Insert the missing `order_items` record for the ₹249 `Heart Rose Candle` that was paid for under that order, restoring complete consistency.

### C. Razorpay Credentials Verification & Auto-Diagnostics
1. Add a self-healing diagnostic test on server start that tests Razorpay authentication directly with Razorpay API and prints clear status without crashing the process.
2. Provide simple instructions for the user to insert the matching, valid Key ID and Key Secret (Test or Live).

---

*End of Architectural Incident & Audit Report.*
