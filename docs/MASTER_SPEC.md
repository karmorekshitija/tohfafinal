# 📜 TOHFA — MASTER SPECIFICATION FILE
### The Single Source of Truth for All Development

> **RULE FOR ALL AGENTS & FUTURE SESSIONS:**
> Before changing ANY code on this project, read this file completely.
> Every feature, every workflow, every pipeline described here is the APPROVED, AUTHORITATIVE specification.
> Do NOT add features not listed here. Do NOT alter workflows unless this file says so.
> If the user asks for a change — first update this file, THEN update the code to match.
> This file governs the code. The code does NOT govern this file.

---

## 🏗️ PROJECT OVERVIEW

**Tohfa** is a curated Indian artisan gifting marketplace — like Amazon, but exclusively for handmade gifts from Indian artisans.

**Three user types:**
- **Buyers** — Shop for gifts
- **Sellers (Artisans)** — List and sell handmade products
- **Admins** — The Tohfa team with full platform control

**Tech Stack:**

| Layer | Technology | Host |
|---|---|---|
| Frontend | Vite Multi-Page App (HTML + CSS + Vanilla JS) | Vercel |
| Backend | Node.js + Express | DigitalOcean Droplet |
| Database | Neon PostgreSQL | Neon Cloud |
| Auth | JWT (Access 15min + Refresh 7 days, rotated) | — |
| AI (Tanya) | Google Gemini API | — |
| WhatsApp | Twilio WhatsApp Business API | — |
| Payments | Razorpay | — |
| Logistics | iThink Logistics API | — |
| Image Storage | Cloudinary | — |
| Email | Nodemailer + SMTP | — |

---

## 📁 FOLDER STRUCTURE

```
tohfanew/
├── frontend/src/
│   ├── auth/          → Login, Signup, Forgot Password pages
│   ├── buyer/         → All buyer-facing pages
│   ├── seller/        → All seller studio pages
│   ├── admin/         → Admin control panel pages
│   ├── components/    → Reusable HTML/JS components (navbar, footer)
│   ├── js/            → Shared JS utilities (api.js, auth.js, utils.js)
│   └── styles/        → Shared CSS (tokens, reset, components, animations)
└── backend/src/
    ├── routes/        → URL path definitions
    ├── controllers/   → HTTP request/response handlers
    ├── services/      → Business logic
    ├── middleware/     → Auth checks, validation, upload, rate limiting
    ├── config/        → External service clients (DB, Cloudinary, etc.)
    └── db/            → schema.sql, seed.sql, migrations
```

---

## 🚦 STATUS KEY (used throughout this document)

| Symbol | Meaning |
|--------|---------|
| ✅ Working | Working correctly — do not change |
| 🔴 Broken | Broken or missing — needs to be fixed/built |
| 🟡 Partial | Partially working or needs adjustment |
| ❌ Removed | Feature REMOVED — do not build or keep this |
| 🔒 Locked | Do not touch, it is correct |

---

## ══════════════════════════════════════
## PART 1 — PIPELINES (Approved Workflows)
## ══════════════════════════════════════

Each pipeline below describes EXACTLY how a feature should work.
Do not deviate from these unless this file is updated first.

---

## PIPELINE 1 — AUTHENTICATION (Login & Signup)

Files: auth.service.js, auth.controller.js, auth.routes.js, middleware/auth.js

### Buyer Signup:
1. Buyer fills: name, email, password on signup-buyer.html
2. Backend checks for duplicate email
3. Password hashed with bcrypt (12 salt rounds)
4. User saved to `users` table
5. Empty shopping cart created automatically
6. Two tokens issued:
   - Access Token: 15-minute lifetime
   - Refresh Token: 7-day lifetime
7. Buyer redirected to home.html

### Seller Signup:
1. Seller fills: name, email, phone, password, store name, craft specialty, bio on signup-seller.html
2. Backend creates BOTH a `users` row AND a `seller_profiles` row in a single atomic transaction
3. Seller starts with verification_status = 'pending_verification'
4. Seller redirected to onboarding.html — they CANNOT sell until Admin approves

IMPORTANT: signup-seller.html MUST include fields for store name, craft specialty, and bio.
These are required at signup, NOT filled in later.

### Login (Buyers and Sellers share the same login page):
1. User enters email + password
2. Backend finds the account
3. bcrypt.compare() checks the password
4. If correct → new Access + Refresh tokens issued
5. redirectUserByRole() sends the user to the right page:
   - Buyer → home.html
   - Seller (approved) → seller/dashboard.html
   - Seller (pending) → seller/onboarding.html
   - Admin → admin/dashboard.html
6. If wrong → "Invalid email or password" error

### Token / Session System:
- Every protected request checks the Access Token via auth.js middleware
- Expired token → prompt to log in again
- Database is checked to ensure account is not banned

### Password Reset Flow:
1. User clicks "Forgot Password" → enters email
2. Backend generates random secret token, saves it (hashed) with 1-hour expiry
3. Email with reset link sent via Nodemailer
4. User clicks link → token validity checked
5. User sets new password → reset token deleted

### Route Guard (ProtectedRoute.js):
- Unapproved/pending sellers MUST be redirected to /seller/onboarding.html
- NEVER to become-seller.html — that file does NOT exist
- Suspended sellers see a clear "account suspended" state, not a blank page
- Zero references to become-seller.html are allowed anywhere in the codebase

---

## PIPELINE 2 — BROWSING PRODUCTS

Files: product.controller.js, product.routes.js

### Home Page Feed:
1. home.html loads
2. Calls /api/home/feed → "For You" feed (active products, sorted by view count)
3. Calls /api/products/featured → featured/sponsored items
4. is_tohfa_original flag is NEVER sent to buyers — stripped before response

### Product Categories:
- Category list is hardcoded in product.controller.js as CATEGORY_CATALOG
- Each category has subcategories
- Shown on categories.html

### Search:
1. Buyer types in search bar on search.html
2. Calls /api/products?search=term
3. Backend uses PostgreSQL full-text search
4. Results returned filtered and sorted

### Single Product Page (product.html?id=xyz):
1. product.js reads the id from the URL
2. Calls GET /api/products/:id
3. Backend returns: product details, images, variants, seller info, reviews
4. Backend increments view_count on that product
5. Page renders all data

---

## PIPELINE 3 — SELLER PUBLIC PROFILE PAGE

Files: seller-profile.html, seller-profile.js, seller.controller.js

This is the public storefront for each artisan. Visible to everyone including non-logged-in visitors.

### What It Shows:
1. Hero/banner: cover photo, profile photo, store name, bio, "Verified Artisan" badge
2. About the seller: bio/description
3. All active, published products by this seller (product grid with prices)
4. Reviews left by buyers
5. Stats: total products, average star rating, member since date

### How It Loads:
1. Click seller's name → seller-profile.html?id=SELLER_ID
2. seller-profile.js reads id from URL
3. Calls GET /api/seller/public/:id → seller profile (no private data)
4. Calls GET /api/products/seller/:id → all their active products
5. Page renders

### What Is NOT on This Page:
- ❌ "Follow Studio" button — REMOVED entirely

---

## PIPELINE 4 — CART SYSTEM

Files: cart.controller.js, cart.routes.js

### Adding to Cart:
1. Buyer clicks "Add to Cart"
2. POST /api/cart
3. If product already in cart → quantity increased
4. If not → new row added to cart_items

### Viewing Cart:
1. GET /api/cart
2. Backend joins cart_items + products + sellers
3. Returns: product name, image, price, store name, chosen variant

### Updating/Removing:
- PUT /api/cart/:id → change quantity
- DELETE /api/cart/:id → remove item
- DELETE /api/cart → clear entire cart

---

## PIPELINE 5 — CHECKOUT & PAYMENT

Files: order.service.js, order.controller.js, payment.service.js, payment.controller.js, webhook.controller.js

### Step 1 — Choose Address:
- Buyer selects a saved address or adds a new one
- GET /api/user/addresses lists saved addresses

### Step 2 — Apply Coupon (Optional):
1. Buyer types coupon code
2. POST /api/coupons/apply
3. Backend checks database coupons table first
4. If not found → checks built-in static list (WELCOME10, TOHFA100, ARTISAN20, FIRSTGIFT)
5. Validates: active? not expired? minimum order met?
6. Returns discount amount and final price

### Step 3 — Place Order:
1. Buyer clicks "Place Order"
2. POST /api/orders with address + cart items + coupon
3. Backend's placeOrders():
   - Fetches cart items
   - Groups items by seller (1 seller = 1 order; 2 sellers = 2 separate orders)
   - Checks stock availability
   - Creates a Razorpay Order (payment invoice)
   - Saves order to DB with status = pending
   - Decrements stock

### Step 4 — Payment:
1. Razorpay payment window opens
2. Buyer pays via UPI, card, wallet, etc.
3. On success → redirected to payment-success.html
4. On failure → redirected to payment-failure.html

### Step 5 — Payment Verification (TWO methods):

Method A — Direct Verification:
- Frontend sends payment proof to POST /api/payments/verify
- Backend verifies HMAC-SHA256 signature
- If valid → markOrderPaid():
  1. Order status → confirmed
  2. Payment status → paid
  3. Stock decremented (with DB lock to prevent double-deduction)

Method B — Webhook (Backup, more reliable):
- Razorpay auto-calls /api/webhook on payment success
- Backend verifies webhook signature
- Even if Method A failed, this still marks order as paid

### Commission Structure:
IMPORTANT: Tohfa charges 5% from EACH side on every transaction:
- Buyer pays 5% platform fee on top of product price (added at checkout)
- Seller receives payout minus 5% (deducted from their payout)
This applies to: regular orders, customization orders, overflow orders

### After Payment:
- WhatsApp message sent to seller: "New order received!"
- Shipment automatically booked via iThink Logistics (for regular sellers)

---

## PIPELINE 6 — ORDER MANAGEMENT

Files: order.controller.js

### Order Status Journey:
pending → confirmed → making/processing → ready_to_ship → shipped → delivered
                  ↘ cancelled

| Status | Meaning |
|--------|---------|
| pending | Order placed, payment being processed |
| confirmed | Payment received, seller accepted |
| making/processing | Artisan is crafting the item |
| ready_to_ship | Item packed, ready for courier |
| shipped | Package handed to courier |
| delivered | Buyer received the package |
| cancelled | Order was cancelled |

The system enforces valid transitions only. You cannot go from delivered back to cancelled.

### Permissions:
- Seller: can confirm → update progress → mark shipped → mark delivered
- Buyer: can request cancellation only before shipped
- Admin: can manually set any order to any status at any time

### Cancellation & Refund:
1. Buyer requests cancel
2. If already shipped → cannot cancel
3. If not yet shipped → stocks restocked
4. If already paid → Razorpay refund triggered automatically
5. refund_requests record created
6. Both buyer and seller get notifications

---

## PIPELINE 7 — OVERFLOW / BUSY-SELLER ORDERS

Files: order.controller.js, overflow_orders table

### What Is an Overflow Order?
When an artisan is at full capacity (busy), they mark themselves as "busy" in their dashboard.
If a buyer tries to order from them, a special flow kicks in.

### The Correct Flow:

Step 1 — Buyer tries to order from busy seller:
- System detects seller is at capacity
- Prominent warning shown BEFORE buyer can proceed:
  "This artisan is currently busy with other orders.
   - Delivery will take LONGER than usual
   - The seller may DECLINE your request
   - Payment will only be charged if the seller ACCEPTS
   Do you still want to send a request? [Cancel] [Send Request]"

Step 2 — Buyer sends request (NO payment taken):
- Buyer clicks "Send Request"
- overflow_orders row created with status = pending
- NO payment taken at this step
- Buyer's cart is NOT cleared

Step 3 — Seller reviews:
- Seller sees request in their dashboard on overflow.html
- Seller can: Accept OR Decline

Step 4 — If seller accepts:
- Razorpay payment order created for the buyer
- Buyer gets in-app notification + WhatsApp: "Your request was accepted! Please complete payment within 24 hours."
- Buyer pays
- After payment → real orders row created from overflow snapshot
- Order status = confirmed → normal order flow continues

Step 5 — If seller declines:
- Overflow order status → declined
- Buyer notified: "The artisan could not accept your order at this time."
- No money was ever taken

---

## PIPELINE 8 — CUSTOMIZATION SYSTEM

Files: customization.service.js, customization.controller.js, customization-form.html, customization-form.js

### The Key Principle:
- Customizations are simple: text inputs and image uploads only
- Seller sets the price UPFRONT when listing the product
- There is NO price negotiation or quote process
- Buyer pays the fixed price immediately

### Step 1 — Seller sets up customization (at listing time):
- Seller marks product as "customizable"
- Configures: fixed price, what buyer needs to provide (text/images), turnaround time, buyer instructions
- Config saved to open_customization_configs table

### Step 2 — Buyer fills form & pays:
1. Buyer opens product page
2. Clicks "Customise This"
3. Form appears with text fields and/or image upload
4. Buyer sees the fixed price clearly before submitting
5. Buyer clicks "Submit & Pay ₹XXXX"
6. customization_requests row created with status = pending_payment
7. Razorpay payment window opens immediately
8. Buyer pays → verified → status = confirmed

### Step 3 — Seller makes the custom item:
1. Seller sees the order under "Custom Orders" in dashboard
2. Order shows: buyer's text requirements, reference images, delivery address
3. Seller updates status: confirmed → making → ready_to_ship

### Step 4 — Proof photo before dispatch (via WhatsApp):
1. Seller uploads proof photo of the completed item via dashboard
2. System sends WhatsApp message to the buyer with:
   - The proof photo
   - Message: "Your custom order is ready! Here's a preview. We'll be dispatching it to [buyer's address] shortly. Order by [Store Name], ₹[Amount] paid."
3. Seller then dispatches and marks order shipped

### Refund Policy on Customization:
- Custom items are non-refundable by default
- Buyer sees a clear non-refundable notice before paying
- Exception: Admin can manually approve a refund if seller sent wrong/damaged item

---

## PIPELINE 9 — OCCASIONS & REMINDERS

Files: occasion.service.js, occasion.controller.js, whatsapp.service.js

### How It Works:
1. Buyer saves an occasion: e.g., "Mom's Birthday on March 15th"
2. Every day at 9:00 AM, a scheduled cron job runs
3. It scans all saved occasions
4. Sends reminders:
   - 30 days before → WhatsApp + in-app notification
   - 14 days before → another reminder
   - 7 days before → final urgent reminder ("Only 7 days left! Order now!")
5. Each reminder sent only once per threshold (tracked with flags: reminder_sent_1m, reminder_sent_2w, reminder_sent_1w)

### WhatsApp Integration:
- Uses Twilio
- Formats Indian phone numbers correctly (+91XXXXXXXXXX)
- Failures are silent — if WhatsApp fails, the rest of the app still works fine

---

## PIPELINE 10 — LOGISTICS & SHIPPING

Files: logistics.service.js, logistics.controller.js

### How Shipping Works:
1. After payment confirmed, webhook triggers createShipment()
2. System checks if seller is regular or Tohfa Special

For Regular Sellers:
- Fetches seller's pickup address from their profile
- Fetches buyer's delivery address
- Calls iThink Logistics API to book courier pickup
- Gets back a waybill number (tracking number)
- Saves waybill to the order
- Notifies buyer with tracking info

For Tohfa Special Sellers:
- Shipment handled manually by the Tohfa admin team
- Admin manually updates delivery stage in admin panel
- Admin can set any order to: shipped, out_for_delivery, delivered, etc.
- Buyer sees these updates in real-time on orders.html

### Pincode Serviceability Check:
- Before checkout, buyer can check if their pincode is deliverable
- GET /api/logistics/check?pincode=XXXXXX
- Backend queries iThink's API to confirm delivery is possible

---

## PIPELINE 11 — TANYA (AI GIFT ASSISTANT)

Files: tanya.service.js, tanya.controller.js, tanya.routes.js

Tanya is Tohfa's AI gift assistant powered by Google Gemini AI.

### How It Works:
1. Buyer types something like: "I need a gift for my mom's 50th birthday, budget ₹1000"
2. Frontend sends to POST /api/tanya/chat
3. Backend fetches the live product catalog from the database (top 50 active, in-stock products)
4. Catalog is injected into Tanya's system instructions — Tanya only recommends real, existing products
5. Tanya's rules:
   - Start with "Namaste! 🎁"
   - Only recommend products from the live catalog
   - Include direct product links (/buyer/product.html?id=xxx)
   - Include price, maker name, and why it's a good gift
   - Never make up products that don't exist
6. AI response sent back and shown in chat window

---

## PIPELINE 12 — REVIEWS & RATINGS

Files: review.controller.js, review.routes.js

### Rules:
1. Buyer can only review after the order is delivered
2. Buyer can only leave one review per order
3. Buyer fills: 1-5 star rating + optional comment
4. Backend verifies:
   - Order belongs to the buyer
   - Order status is "delivered"
   - No existing review for this order
5. Review saved to reviews table
6. Seller gets a notification
7. Sellers can reply to reviews (seller_reply field)
8. Reviews appear on the seller's public profile page

---

## PIPELINE 13 — WISHLIST

Files: wishlist.controller.js

### Wishlist:
- Buyer clicks heart icon on a product → POST /api/wishlist
- Saved to wishlists table linked to user ID
- wishlist.html loads all saved items with current prices
- Buyer can remove items at any time

### Follow Sellers Feature:
❌ REMOVED — The "Follow Studio" / "Follow Sellers" feature has been removed from the product entirely.
- Remove the "Follow Studio" button from seller-profile.html
- followSeller/unfollowSeller functions in seller.controller.js are dead code — do not surface

---

## PIPELINE 14 — SELLER ANALYTICS

Files: analytics.controller.js, analytics.routes.js

Sellers have their own analytics dashboard (analytics.html) showing:
- Daily revenue for the last 30 days (line chart)
- Top 5 products by order count and revenue
- Total orders, average order value, total revenue
- Profile views (how many people viewed their store page)
- Conversion rate (percentage of store visitors who bought)

All numbers are calculated on the fly from the database — not pre-stored.

---

## PIPELINE 15 — ADMIN PANEL

Files: admin.controller.js, admin.routes.js, admin/ frontend pages

### Seller KYC (Verification):
1. New seller signs up → status = pending_verification
2. Admin sees them in sellers.html
3. Admin can: approve (seller can now list) or reject (with written reason)
4. On approve → seller gets email + in-app notification
5. On reject → seller is told why and can re-apply after fixing profile

### Suspension:
- Admin can suspend/ban a seller
- Typed suspension reason MUST reach the audit log and seller notification
- frontend key and backend key for the reason field MUST be the same (use 'reason' everywhere)

### Product Moderation:
- Admin can view, approve, or delete any product
- Can mark products as "Tohfa Originals" (internal flag — NEVER shown to buyers)

### Order Management:
- See ALL orders on the entire platform
- Filter by date, seller, order status
- Manually edit delivery stage of any order
- Admin can set: confirmed → making → shipped → out_for_delivery → delivered
- Buyer sees changes reflected immediately in orders.html
- Approve refunds for cancelled orders

### Coupon Management:
- Create, edit, disable coupon codes
- Set: discount type (percentage or flat), minimum order amount, expiry date

### Banner Management:
- Upload and manage homepage hero banner images (Cloudinary)

### Dashboard Stats:
- Total GMV, total buyers, active approved sellers, orders in progress, pending KYC count

### Audit Logs:
- Every admin action recorded in audit_logs table with: who, what, when
- Tamper-proof history

---

## PIPELINE 16 — SELLER PAYOUTS

Files: seller.controller.js (payout sections)

### Commission:
IMPORTANT: 5% from buyer (added at checkout) + 5% from seller (deducted from payout)
This applies to ALL transaction types: regular, customization, overflow.

### Payout Timeline:
1. Order marked delivered → payout status = holding (7-day buyer return window)
2. After 7 days → payout status = ready
3. Seller requests payout from payouts.html
4. Admin reviews and approves
5. Money transferred to seller's registered bank account
6. Full history visible in payment-history.html

---

## PIPELINE 17 — NOTIFICATIONS

Files: email.service.js, notification.controller.js, whatsapp.service.js

### In-App Notifications (stored in notifications table):
Triggered automatically for:
- New order placed
- Order status changed (confirmed, shipped, delivered, cancelled)
- Review received (seller notified)
- Customization proof photo uploaded
- Overflow order accepted/declined
- Occasion reminders

Buyer sees on notifications.html.

### Email (Nodemailer):
Used only for: password reset links

### WhatsApp (Twilio):
Used for:
- Occasion reminders (30/14/7 days)
- New order alert for sellers
- Customization proof photo message to buyer (before dispatch)
- Overflow order status updates (accepted/declined)

---

## PIPELINE 18 — SELLER SUBSCRIPTION PLANS

Files: frontend/src/seller/plans.html, seller.controller.js

Located at "Plans" in the very bottom of the Seller Studio sidebar navigation.

### The 3 Tiers:

| Plan | Monthly Price | Key Benefits | Bulk Order Priority |
|------|-------------|-------------|---------------------|
| Basic | ₹0 (Free forever) | Unlimited listings, standard order & payment mgmt, basic analytics, reviews, WhatsApp alerts | 3rd (approached after Max & Pro) |
| Pro | ₹199/month | Everything in Basic + 5 Sponsored Products + priority placement + "Pro Studio" badge + advanced analytics + priority support | 2nd (approached after Max) |
| Max | ₹499/month | Everything in Pro + Meta Ads integration + Unlimited Sponsored Products + "Max Studio" badge + dedicated account manager + early feature access | 1st (approached FIRST for all bulk inquiries) |

### Bulk & Corporate Order Priority:
1. Max sellers approached FIRST
2. Pro sellers approached SECOND if Max sellers unavailable
3. Basic sellers approached THIRD

### Upgrade Flow:
1. Seller opens plans.html
2. Page auto-checks current plan via /api/seller/profile
3. Clicking "Upgrade" → confirmation modal → Razorpay checkout modal
4. On successful payment → profile subscription tier updates immediately
5. Perks activate in real-time
6. Sellers can downgrade back to Basic at any time at no charge

---

## ══════════════════════════════════════
## PART 2 — FEATURES: STATUS & DECISIONS
## ══════════════════════════════════════

### BUYER-FACING FEATURES

| Feature | Status | Notes |
|---------|--------|-------|
| Home page feed | ✅ Working | For You feed + featured products |
| Category browsing | ✅ Working | Hardcoded CATEGORY_CATALOG |
| Product search | ✅ Working | Full-text search with filters |
| Product detail page | 🔴 Broken | Not loading data correctly — fix needed |
| Seller public profile | 🟡 Partial | Works but Follow Studio button must be removed |
| Add to cart | ✅ Working | |
| Cart page | ✅ Working | |
| Checkout | ✅ Working | |
| Apply coupon | ✅ Working | DB + static fallback list |
| Razorpay payment | ✅ Working | |
| Payment success/failure pages | ✅ Working | |
| Wishlist | ✅ Working | Heart icon saves product |
| Follow Sellers | ❌ Removed | Remove button from UI entirely |
| Occasions & reminders | ✅ Working | 30/14/7 day WhatsApp + in-app |
| Orders history | ✅ Working | |
| Order detail page | ✅ Working | |
| Cancel order | ✅ Working | Only before shipped; auto refund if paid |
| Reviews (post-delivery) | ✅ Working | One per order, after delivered |
| Notifications page | ✅ Working | |
| Tanya AI chatbot | ✅ Working | Gemini-powered, uses live catalog |
| Buyer profile page | ✅ Working | |
| Edit buyer profile | ✅ Working | |
| Saved addresses | ✅ Working | |
| Customization form | ✅ Working | Fixed price, immediate payment |
| Overflow order request | ✅ Working | No payment until seller accepts |
| Search page | ✅ Working | |
| Zip Gift page | 🟡 Partial | Coming soon placeholder |
| Messages (buyer side) | 🟡 Partial | Confirm if global messages system exists |
| Bulk orders form | 🟡 Partial | Confirm scope before building |

---

### SELLER STUDIO FEATURES

| Feature | Status | Notes |
|---------|--------|-------|
| Seller signup | 🔴 Broken | Form missing store name, craft specialty, bio fields |
| Seller onboarding/status page | ✅ Working | onboarding.html is correct destination |
| Seller dashboard | ✅ Working | Revenue, orders, top products |
| Add product (6-step wizard) | ✅ Working | |
| Edit product | ✅ Working | |
| Catalog management | 🟡 Partial | /api/seller/catalog/summary endpoint missing on backend |
| Product discount (per listing) | 🔴 Broken | Backend endpoint missing — confirm scope before building |
| Bulk discount | 🔴 Broken | Backend endpoint missing — confirm scope before building |
| Orders list | 🟡 Partial | PATCH /api/seller/orders/:id/tracking endpoint missing |
| Order detail | 🟡 Partial | Same tracking endpoint missing |
| Overflow orders | ✅ Working | overflow.html — accept/decline requests |
| Customization (setup at listing) | ✅ Working | |
| Analytics | ✅ Working | Revenue chart, top products |
| Reviews management | ✅ Working | Can reply to reviews |
| Payouts | ✅ Working | Request payout, payment history |
| Seller profile/store editing | ✅ Working | |
| Store config | ✅ Working | Vacation mode, shipping presets |
| Messages (seller side) | 🔴 Broken | POST /api/seller/messages/start — backend missing; check if global messages route exists first |
| Plans / Subscriptions | ✅ Working | Basic (free), Pro (₹199), Max (₹499) |
| Busy mode / overflow toggle | ✅ Working | Seller marks themselves as at-capacity |
| Proof photo upload | ✅ Working | Sent to buyer via WhatsApp |

---

### ADMIN PANEL FEATURES

| Feature | Status | Notes |
|---------|--------|-------|
| Admin login | ✅ Working | Separate URL, separate auth |
| Dashboard KPIs | ✅ Working | GMV, buyers, sellers, orders |
| Seller KYC (approve/reject/ban) | 🟡 Partial | Suspend reason key mismatch (ban_reason vs reason) — fix needed |
| Product moderation | ✅ Working | |
| Order management | ✅ Working | Platform-wide view + filters |
| Manual delivery stage override | ✅ Working | Admin can set any order to any stage |
| Refund approvals | ✅ Working | |
| Coupon management | ✅ Working | |
| Banner management | ✅ Working | Cloudinary upload |
| Category management | ✅ Working | |
| Reports | ✅ Working | User reports + resolution |
| Audit logs | ✅ Working | Tamper-proof history |
| Tohfa Originals / Special Sellers | ✅ Working | Internal only — never visible to buyers |
| Our Story section | ✅ Working | Admin features/unfeatures sellers |
| Master admin | ✅ Working | Admin account management |
| Sponsored products | 🟡 Partial | Verify route name: /sponsored vs /sponsor |

---

## ══════════════════════════════════════
## PART 3 — KNOWN BUGS (Confirmed)
## ══════════════════════════════════════

These bugs have been confirmed. Fix them in order of priority.

| # | Bug | Location | Priority | Status |
|---|-----|---------|---------|--------|
| B1 | Seller signup form missing store name, craft specialty, bio fields | auth/signup-seller.html | HIGH | ✅ Fixed (2026-08-29) |
| B2 | Product detail page / wishlist 500 error due to `price_paise` phantom column SQL queries | product.controller.js, wishlist.controller.js, admin.controller.js | HIGH | ✅ Fixed (2026-08-29) |
| B3 | Pending seller redirect points to non-existent become-seller.html | ProtectedRoute.js | HIGH | ✅ Fixed (2026-08-29) |
| B4 | Suspend reason key mismatch (ban_reason vs reason) | admin/sellers.html + admin.controller.js | MEDIUM | ✅ Fixed (2026-08-29) |
| B5 | "Follow Studio" button still exists in UI | seller-profile.html, seller-profile.js | MEDIUM | ✅ Fixed (2026-08-29) |
| B6 | POST /api/seller/messages/start — route doesn't exist | seller/dashboard.html | MEDIUM | ✅ Fixed (2026-08-29) |
| B7 | PATCH /api/seller/orders/:id/tracking — route doesn't exist | seller/orders.html, seller/order-detail.html | MEDIUM | ✅ Fixed (2026-08-29) |
| B8 | GET /api/seller/catalog/summary — route doesn't exist | seller/catalog.html | MEDIUM | ✅ Fixed (2026-08-29) |
| B9 | Buyer upgrade path (POST /api/seller/apply) — logic inverted | seller.controller.js | HIGH | ✅ Fixed (2026-08-29) |
| B10 | Tohfa Special Shops Studio nav shows Orders/Payouts/Plans tabs | seller-components.js, orders.html, payouts.html, plans.html | MEDIUM | ✅ Fixed (2026-08-29) |
| B11 | Buyer order timeline missing "preparing" status mapping | buyer/order-detail.html | LOW | ✅ Fixed (2026-08-29) |
| B12 | Dual seller tables (`sellers` vs `seller_profiles`) desync risk | 10 backend files | HIGH (Architectural) | ✅ Consolidated & Verified (2026-08-29) |
| B13 | Admin auth token collision with buyer/seller storage keys in adminApiClient.js | adminApiClient.js, seller/dashboard.html | HIGH | ✅ Fixed (2026-08-29) |
| B14 | Order queries reference phantom columns (`o.order_ref`, `o.amount_paid`, `oi.product_name`, `oi.variant_name`, `oi.customization_text`, `p.image_url`) | order.controller.js | HIGH | ✅ Fixed (2026-08-29) |
| B15 | Seller profile queries reference phantom `sp.profile_photo` and `sp.cover_photo` instead of `logo_url` and `banner_url` | seller.controller.js | HIGH | ✅ Fixed (2026-08-29) |
| B16 | Product detail `getProduct` references phantom `sp.profile_photo` | product.controller.js | HIGH | ✅ Fixed (2026-08-29) |
| B17 | Cart item query references `pi.image_url` instead of `pi.url`, failing primary cart query | cart.controller.js | HIGH | ✅ Fixed (2026-08-29) |
| B18 | Notifications controller uses `message` column and integer `is_read = 0/1` on boolean column | notification.controller.js | HIGH | ✅ Fixed (2026-08-29) |
| B19 | Occasions queries reference non-existent `updated_at` column | occasion.controller.js | MEDIUM | ✅ Fixed (2026-08-29) |
| B20 | Analytics seller summary references phantom `u.full_name`, `u.display_name`, and `pi.image_url` | analytics.controller.js | MEDIUM | ✅ Fixed (2026-08-29) |
| B21 | Following artisans query references phantom `sp.profile_photo` / `sp.cover_photo` | buyer.controller.js | MEDIUM | ✅ Fixed (2026-08-29) |
| B22 | Special shops seed script has syntax corruption and broken SQL | seed_tofa_specials.js | LOW | ✅ Fixed (2026-08-29) |

---

## ══════════════════════════════════════
## PART 4 — RULES FOR THE AI AGENT
## ══════════════════════════════════════

These rules are non-negotiable. Every agent session must comply.

1. READ THIS FILE BEFORE TOUCHING ANY CODE. If this file hasn't been read in the current session, read it before doing anything else.

2. DO NOT ADD FEATURES NOT LISTED IN THIS FILE. If you think something is a good idea, ask the user first and update this file before implementing.

3. DO NOT CHANGE WORKFLOWS. The pipelines in Part 1 define exactly how each feature works. Do not deviate.

4. DO NOT CHANGE NAMING CONVENTIONS. Do not introduce new table names, column names, or field names without explicit user approval and updating this file.

5. IF SOMETHING IS AMBIGUOUS, STOP AND ASK. Do not guess. Do not make assumptions about what the user might want.

6. WHEN A FEATURE IS MARKED REMOVED (❌), DO NOT BUILD OR RESTORE IT. Strip it from the UI and treat its backend code as dead code.

7. WHEN FIXING A BUG, FIX ONLY THAT BUG. Do not refactor surrounding code, add logging, add comments, or change anything beyond the minimal fix.

8. CONFIRM BEFORE TOUCHING ANYTHING OUTSIDE THE NAMED SCOPE. If a fix requires changes to a file not mentioned in the task, confirm with the user first.

9. THIS FILE IS UPDATED BEFORE CODE CHANGES. If the user requests a new feature or workflow change, update this file first, then implement.

10. DO NOT MODIFY auth.js OR apiClient.js. These are already correct and unified.

---

## ══════════════════════════════════════
## PART 5 — CHANGE LOG
## ══════════════════════════════════════

This section records every change instruction the user gives, with date and what was decided.

| Date | Instruction | Decision |
|------|------------|---------|
| 2026-08-29 | User requested this master spec file to be created | File created. No code changed. User will provide feature-by-feature instructions. |
| 2026-08-29 | Home page: Sponsored and For You sections show no products | Root cause: /api/products/feed returns empty or fails. Fix: ensure backend forYouFeed returns data; frontend falls back gracefully but shows empty. Both grids call /products/feed and parse products array. |
| 2026-08-29 | Product page: variant selector should show variant IMAGE (thumbnail) not just a color circle | Fix: replace the rounded color-dot button with a small square thumbnail image of the variant. When a variant is clicked, SWAP the entire gallery (main image + thumbnail strip) to that variant's images only. Inspiration: Amazon — each variant is completely isolated. |
| 2026-08-29 | Product page: vertical thumbnail strip should show all variant images when a variant is selected | Fix: updateGallery() is called correctly on variant click. The thumbnails should show only the selected variant's images, not a mix of all images. |
| 2026-08-29 | Product page: breadcrumb (Home > Category > Product Name) is too large on mobile | Fix: On mobile (< md breakpoint), truncate product name to ~15 chars with ellipsis, reduce font size, reduce icon size. On very small screens (< sm), hide the category segment and show only Home > Product Name (truncated). |
| 2026-08-29 | Admin Console: Real Data & Metrics | Ensure all stats across admin dashboard/sellers/orders are 100% dynamic from Neon DB SQL without hardcoded/artificial fallback data. |
| 2026-08-29 | Two Seller Types: Normal Sellers vs TOHFA Special Shops | Normal Sellers: apply -> KYC verified by admin -> automated iThink Logistics. TOHFA Special Shops: created by Admin with no KYC / no verification delay -> simple store info (name, slug, bio, specialty, origin), NO bank/financial details -> NOT connected to iThink Logistics (manual fulfillment by admin). |
| 2026-08-29 | TOHFA Special Shops: "Enter Studio" Workflow | Admin clicks Enter Studio -> switched session with Admin Mode banner -> full control to add/edit products and view analytics for that special shop. |
| 2026-08-29 | TOHFA Special Orders Desk & Buyer Reflection | Orders for Tohfa Special Shops managed in Admin Console (Special Orders tab) -> Admin can manually update status (Confirmed, Preparing, Dispatched, Delivered) and set custom buyer delivery notes -> instantly reflected on buyer's order details timeline. |
| 2026-08-29 | Fix `price_paise` phantom column SQL errors | Option (b): Removed broken SQL column queries (`product.controller.js`, `wishlist.controller.js`, `admin.controller.js`, `seed_specials.js`), computing paise safely in JS. |
| 2026-08-29 | Special Shop Studio navigation isolation | Hidden Orders, Payouts, and Plans tabs in `seller-components.js` when in `tohfa_admin_switch_context` mode, with safety guards in `orders.html`, `payouts.html`, and `plans.html`. |
| 2026-08-29 | Buyer order detail timeline mapping | Added `'preparing'` status to step 1 ("Crafting / In Progress") mapping in `order-detail.html`. |
| 2026-08-29 | Variant gallery synchronization in `product.js` | Updated variant button rendering with thumbnail previews and dynamic gallery thumbnail replacement on variant click. |
| 2026-08-29 | Admin & Buyer/Seller Auth Token Isolation (Step 0) | Isolated `adminApiClient.js` to strictly read/write `tohfa_admin_token` & `tohfa_admin_refresh_token`, preventing stale buyer/seller tokens from overriding admin authorization. Removed blanket `sessionStorage.clear()` on non-401 errors in `dashboard.html`. |
| 2026-08-29 | Comprehensive Codebase Audit (B14-B22) | Full system re-analysis identified 9 critical SQL & schema mismatch errors across `order.controller.js`, `seller.controller.js`, `product.controller.js`, `cart.controller.js`, `notification.controller.js`, `occasion.controller.js`, `analytics.controller.js`, `buyer.controller.js`, and `seed_tofa_specials.js`. Plan created for user approval. |

---

*This file is maintained by the user (Kshitija) and the Antigravity agent together.*
*Last reviewed: 2026-08-29*



