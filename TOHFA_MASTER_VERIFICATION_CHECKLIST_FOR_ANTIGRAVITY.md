# TOHFA MARKETPLACE (thetohfa.in)

# Master Antigravity Verification Checklist

Use this exhaustive checklist to verify every bug fix, logic correction, database migration, API route alignment, and frontend user flow across the **Tohfa** codebase.

---

## 1\. Product Detail Page & Navigation Routing

- [x] **CHK-01: Standalone Navbar Link Removal**  
        
      - Verify that `frontend/src/components/tohfa-navbar.html` and `frontend/public/components/tohfa-navbar.html` **do NOT** contain a direct `<a href="/buyer/product.html">PRODUCT</a>` link without query parameters.  
      - Confirm navbar links point strictly to collection/index pages (`Home`, `Categories`, `Tohfa Specials`, `ZipGift`, `Occasions`).

      

- [x] **CHK-02: Universal Parameter Extraction (`product.js`)**  
        
      - Verify that `frontend/src/buyer/product.js` parses all identifier formats:  
          
        const identifier \= urlParams.get('id') || urlParams.get('productId') || urlParams.get('slug');  
          
      - Confirm that visiting `/buyer/product.html` with no query parameters automatically redirects to `/buyer/categories.html` instead of displaying the "Product Not Found" card.

      

- [x] **CHK-03: Dual Integer ID & String Slug Resolution (`product.controller.js`)**  
        
      - Verify that `backend/src/controllers/product.controller.js` (`getProductDetail`) supports both numeric integer IDs and text slug strings:  
          
        WHERE (p.id \= $1 OR p.slug \= $2) AND p.is\_active \= true  
          
      - Confirm that querying with a slug string (e.g. `/api/products/terracotta-clay-pot`) does not throw PostgreSQL syntax error `22P02: invalid input syntax for type integer`.

      

- [x] **CHK-04: API Response Wrapper Normalization**  
        
      - Confirm that `product.js` safely unwraps the payload:  
          
        const product \= response?.data || response?.product || response;

        
- [x] **CHK-05: Active Status Database Flags**  
        
      - Verify all active products in PostgreSQL have `is_active = TRUE` and associated sellers have `is_active = TRUE` and `verification_status = 'verified'`.

---

## 2\. Authentication, Login, Signup & Session Management

- [x] **CHK-06: Database-Backed Password Reset Tokens**  
        
      - Confirm `backend/src/services/resetTokenStore.js` is no longer used for in-memory storage.  
      - Verify reset tokens and expiration timestamps are stored in `users.reset_password_token` and `users.reset_password_expires`.

      

- [x] **CHK-07: Role-Based Redirection (`redirectUserByRole`)**  
        
      - Confirm `frontend/src/js/auth.js` routes users dynamically upon login:  
        * **Buyers:** `/buyer/home.html` (or safe internal `?redirect=` URL).  
        * **Sellers (Onboarded):** `/seller/dashboard.html`.  
        * **Sellers (Pending Onboarding):** `/seller/onboarding.html`.  
        * **Admins / Master-Admins:** `/admin/dashboard.html`.

      

- [x] **CHK-08: Unified LocalStorage Key (`tohfa_auth_token`)**  
        
      - Verify that `apiClient.js`, `api.js`, `auth.js`, and `adminApiClient.js` all use the unified storage key `tohfa_auth_token` (and `tohfa_user_data`), eliminating 401 reload loops.

      

- [x] **CHK-09: Atomic Seller Signup Database Transaction**  
        
      - Confirm that `POST /api/auth/signup` for sellers creates both `users` and `sellers` table rows inside an atomic transaction (`BEGIN ... COMMIT`), preventing `404 Seller Profile Not Found` lockouts.

      

- [x] **CHK-10: Email Case Normalization**  
        
      - Verify that `auth.service.js` and `auth.controller.js` apply `LOWER(TRIM(email))` on both signup and login queries.

      

- [x] **CHK-11: Indian Phone Number Sanitization**  
        
      - Verify that Indian phone numbers are sanitized to standard 10 digits (`^[6-9]\d{9}$`), stripping `+91`, `0`, and spaces to avoid unhandled database unique constraint errors.

      

- [x] **CHK-12: Guest-to-Authenticated Cart Migration**  
        
      - Confirm that when a guest user logs in at `auth/login.html`, items in `localStorage.getItem('guest_cart')` are automatically sent to `POST /api/cart/merge`.

      

- [x] **CHK-13: Admin Login Portal Boundary**  
        
      - Confirm that `admin/login.html` calls `POST /api/auth/admin-login`, rejecting non-admin credentials with `403 Forbidden`.

      

- [x] **CHK-14: Open Redirect Protection**  
        
      - Verify that the `?redirect=` parameter only accepts relative internal paths starting with `/` (and not `//`).

---

## 3\. Database Schema & Data Models (`backend/src/db/schema.sql`)

- [x] **CHK-15: Saved User Addresses Table (`user_addresses`)**  
        
      - Verify table exists with columns: `id`, `user_id`, `recipient_name`, `phone`, `address_line1`, `address_line2`, `landmark`, `city`, `state`, `pincode`, `address_type`, `is_default`.

      

- [x] **CHK-16: Persistent Cart Models (`carts` & `cart_items`)**  
        
      - Verify `carts` and `cart_items` tables exist.  
      - Verify `cart_items` has `customization_payload JSONB DEFAULT '{}'`.

      

- [x] **CHK-17: Server-Side Coupons Table (`coupons`)**  
        
      - Verify table exists with: `code`, `discount_type` (`percentage`, `flat`), `discount_value`, `min_order_amount`, `max_discount_amount`, `usage_limit_per_user`, `starts_at`, `expires_at`, `is_active`.

      

- [x] **CHK-18: Multi-Vendor Sub-Orders Table (`seller_orders`)**  
        
      - Verify `seller_orders` table exists with: `order_id`, `seller_id`, `subtotal`, `shipping_fee`, `platform_commission`, `seller_payout_amount`, `status`, `awb_number`, `courier_name`, `tracking_url`, `payout_status`, `delivered_at`.

      

- [x] **CHK-19: Customization Details on Order Items (`order_items`)**  
        
      - Verify `order_items` references `seller_orders(id)` and contains `customization_details JSONB`, `customization_status`, and `proof_image_url`.

      

- [x] **CHK-20: Product Crafting Lead Time & Weight**  
        
      - Verify `products` table has `preparation_days INT DEFAULT 2` and `weight_grams INT DEFAULT 500`.

      

- [x] **CHK-21: Tohfa Specials Columns on `products`**  
        
      - Verify `products` table has `is_tohfa_original BOOLEAN DEFAULT FALSE`, `tohfa_special_badge VARCHAR(100)`, `priority_rank INT DEFAULT 0`, and `special_packaging_available BOOLEAN DEFAULT TRUE`.

      

- [x] **CHK-22: Seller Payouts Ledger (`seller_payouts`)**  
        
      - Verify table exists with: `seller_id`, `amount`, `status` (`pending`, `paid`), `utr_number`, `disbursed_at`.

      

- [x] **CHK-23: Immutable Audit Logs Table (`audit_logs`)**  
        
      - Verify table exists with: `admin_id`, `action_type`, `target_entity`, `target_id`, `details JSONB`, `ip_address`, `created_at`.

      

- [x] **CHK-24: Additional Feature Tables**  
        
      - Verify tables exist: `occasions`, `notifications`, `wishlists`, `reviews`, `seller_followers`, `bulk_inquiries`.

---

## 4\. Multi-Vendor Order Splitting, Customization & Payment Pipelines

- [x] **CHK-25: Multi-Vendor Checkout Splitting**  
        
      - Confirm that checkout with items from multiple artisans creates one parent `orders` record (for Razorpay payment) and splits into multiple `seller_orders` records (one per vendor).

      

- [x] **CHK-26: Razorpay Webhook & Verification Idempotency**  
        
      - Verify that `payment.service.js` uses `SELECT ... FOR UPDATE` row-level locks on `orders`.  
      - Confirm that simultaneous execution of `/api/payment/verify` and Razorpay Webhook `payment.captured` does not double-decrement inventory or duplicate confirmation emails.

      

- [x] **CHK-27: Currency Integer Mathematics (Paise vs. Rupees)**  
        
      - Verify all amounts passed to Razorpay SDK/API are integers in paise (`Math.round(amount * 100)`).  
      - Verify all amounts stored in PostgreSQL are standard `NUMERIC(10,2)`.

      

- [x] **CHK-28: Server-Grounded Pricing & Customization Fees**  
        
      - Verify that `cart.controller.js` and `order.controller.js` recalculate all item prices, custom fees, shipping rates, and coupon discounts from the database, ignoring client-side manipulated totals.

      

- [x] **CHK-29: Customization Proof-of-Work State Machine**  
        
      - Verify status lifecycle: $$\\text{Pending Review} \\longrightarrow \\text{Proof Uploaded (Seller)} \\longrightarrow \\text{Buyer Approved} \\longrightarrow \\text{In Crafting} \\longrightarrow \\text{Shipped}$$  
      - Confirm seller can upload proof photo in `seller/order-detail.html` calling `POST /api/seller/orders/custom-proof`.

      

- [x] **CHK-30: Automated Cancellation Refund Call**  
        
      - Confirm that cancelling a prepaid order via `cancel-order.html` calls `razorpayInstance.payments.refund()`.

---

## 5\. Logistics & iThink Logistics Integration

- [x] **CHK-31: Dynamic Artisan Pickup Origin**  
        
      - Verify that `logistics.service.js` passes the artisan's specific verified `sellers.pickup_address` (street, city, state, pincode) to iThink API instead of a static `.env` warehouse address.

      

- [x] **CHK-32: Pre-Checkout Pincode Serviceability Check**  
        
      - Confirm that entering a PIN code on `product.html` or `checkout.html` queries `GET /api/logistics/serviceability?pincode=X` against the iThink API.

      

- [x] **CHK-33: Accurate Delivery Estimation Formula**  
        
      - Verify delivery dates combine artisan lead time \+ courier SLA: $$\\text{Delivery Date} \= \\text{Current Date} \+ \\text{Product Preparation Days} \+ \\text{Courier Transit Days}$$

      

- [x] **CHK-34: Shipping Label / Manifest PDF Download**  
        
      - Verify that "Download Shipping Label" in `seller/orders.html` calls `GET /api/logistics/label/:sellerOrderId` and streams the PDF.

---

## 6\. Seller Studio Portal

- [x] **CHK-35: Enforced KYC Gatekeeping (`sellerOnly.js`)**  
        
      - Verify that unverified sellers (`verification_status !== 'verified'`) are blocked from publishing products or viewing active marketplace feeds.

      

- [x] **CHK-36: Real Dashboard Metrics (No Static Fake Data)**  
        
      - Confirm `frontend/src/seller/dashboard.js` calls `GET /api/seller/dashboard-metrics` and populates live GMV, order counts, active listings, and ratings without falling back to hardcoded ₹45,200.

      

- [x] **CHK-37: Isolated Sub-Order Visibility**  
        
      - Confirm that `GET /api/seller/orders` filters strictly by `WHERE seller_id = req.seller.id` so artisans never see items belonging to other sellers.

      

- [x] **CHK-38: Multipart Image Upload Header Fix**  
        
      - Confirm that `add-product.js` and `customization-form.js` do **NOT** manually set `'Content-Type': 'multipart/form-data'`, preserving the browser boundary hash.

      

- [x] **CHK-39: Customization Schema Persistence**  
        
      - Verify that `POST /api/products` correctly saves `customization_schema` JSON (fonts, max characters, photo requirement, add-on price) to PostgreSQL.

      

- [x] **CHK-40: 7-Day Escrow Payout Settlement**  
        
      - Confirm seller balance calculation holds funds in `unsettled/holding` status until 7 days post-delivery before marking them `eligible_for_payout`.

      

- [x] **CHK-41: Live Analytics & Date Range Filtering**  
        
      - Verify that `seller/analytics.html` fetches live data via `GET /api/seller/analytics?range=30d` and responds to dropdown changes.

      

- [x] **CHK-42: Artisan Review Public Replies**  
        
      - Verify that the "Reply" button on `seller/reviews.html` calls `POST /api/reviews/:id/reply` and stores `reviews.seller_reply`.

      

- [x] **CHK-43: Store Vacation Mode Toggle**  
        
      - Verify that toggling Vacation Mode on `seller/store-config.html` sends `PATCH /api/seller/status`, updating `sellers.is_active` and unpublishing products from buyer search.

---

## 7\. Admin Governance Console

- [x] **CHK-44: Total Removal of UI Settings Tab**  
        
      - Confirm `frontend/src/admin/ui-settings.html` is deleted.  
      - Confirm `AdminSidebar.js` has no UI Settings menu entry.  
      - Confirm `adminLayout.js` and `admin.routes.js` have no UI Settings routes.

      

- [x] **CHK-45: Tohfa Specials Curation Console**  
        
      - Verify `frontend/src/admin/tohfa-originals.html` calls `PATCH /api/admin/tohfa-specials/:productId` to toggle `is_tohfa_original`, subtitle badge, and `priority_rank`.

      

- [x] **CHK-46: Forced Refund / Dispute Resolution View**  
        
      - Verify `frontend/src/admin/refunds.html` allows admins to trigger instant full/partial Razorpay refunds via `POST /api/admin/orders/:id/refund`.

      

- [x] **CHK-47: Seller KYC Approval / Rejection**  
        
      - Verify that clicking "Approve KYC" on `admin/sellers.html` calls `PATCH /api/admin/sellers/:id/kyc` and updates `sellers.verification_status = 'verified'`.

      

- [x] **CHK-48: Custom Commission Overrides**  
        
      - Verify admin can override default 10% commission on a per-artisan basis via `PATCH /api/admin/sellers/:id/kyc`.

      

- [x] **CHK-49: Immutable Audit Logging Pipeline**  
        
      - Confirm every administrative state mutation invokes `logAdminAction()` in `backend/src/services/audit.service.js` and writes to `audit_logs`.

---

## 8\. Buyer User Experience & Empty-State Handling

- [x] **CHK-50: Universal Empty State Component (`renderEmptyState`)**  
        
      - Verify `frontend/src/js/utils.js` exports `renderEmptyState()`.

      

- [x] **CHK-51: Notifications Safe Array Guard (`notifications.js`)**  
        
      - Confirm opening `buyer/notifications.html` with 0 notifications renders the clean empty state without console `TypeError: .map()`.

      

- [x] **CHK-52: Wishlist Safe Empty State (`wishlist.js`)**  
        
      - Confirm opening `buyer/wishlist.html` with 0 items displays the empty wishlist prompt with a link to categories.

      

- [x] **CHK-53: Cart Safe Empty State & Button Lock (`cart.js`)**  
        
      - Confirm 0 cart items hides the subtotal container, shows `cart-empty-state`, and disables the checkout button.

      

- [x] **CHK-54: Product Rating NaN Guard on Zero Reviews (`product.js`)**  
        
      - Confirm products with 0 reviews display `✨ New Artisan Listing` instead of `NaN / 5.0 (0 reviews)`.

      

- [x] **CHK-55: Navbar Search Parameter Unification (`search.js`)**  
        
      - Confirm searching from the navbar parses both `?q=` and `?search=`.

      

- [x] **CHK-56: "Buy Now" Customization Gating (`product.js`)**  
        
      - Confirm clicking "Buy Now" on customizable items redirects through `customization-form.html?productId=X&buyNow=true`.

      

- [x] **CHK-57: Verified Purchase Review Gate (`review.controller.js`)**  
        
      - Confirm `POST /api/reviews` rejects submissions from users who have not received a delivered order of that product.

      

- [x] **CHK-58: Occasion Reminders 404 Route Alignment**  
        
      - Confirm adding an occasion on `buyer/occasions.html` calls `POST /api/occasions` (plural) rather than non-existent `/api/occasion/new`.

      

- [x] **CHK-59: Tanya AI Live Inventory Grounding (Gemini RAG)**  
        
      - Verify `backend/src/services/tanya.service.js` injects active product catalog items into the Gemini system instruction, preventing hallucination of non-existent items.

---

## 9\. Server Configuration & Deployment Checks

- [x] **CHK-60: Express Route Registration (`server.js`)**  
        
      - Verify that `backend/server.js` mounts all route modules:  
        * `/api/auth`  
        * `/api/buyer`  
        * `/api/seller`  
        * `/api/admin`  
        * `/api/products`  
        * `/api/cart`  
        * `/api/orders`  
        * `/api/payment`  
        * `/api/coupons`  
        * `/api/occasions`  
        * `/api/notifications`  
        * `/api/logistics`  
        * `/api/tanya`

      

- [x] **CHK-61: Database Migration Execution Order**  
        
      - Verify migrations execute sequentially: `schema.sql` $\\rightarrow$ `002_audit_fixes.sql` $\\rightarrow$ `003_seller_studio_fixes.sql` $\\rightarrow$ `004_buyer_platform_fixes.sql` $\\rightarrow$ `005_tohfa_specials_and_admin_authority.sql`.

      

- [x] **CHK-62: Razorpay Client SDK Script Tag**  
        
      - Verify `frontend/src/buyer/checkout.html` includes `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>` in `<head>`.

