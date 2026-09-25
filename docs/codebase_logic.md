# 🎁 Tohfa — Complete Codebase Logic (Revised & Corrected)

> **Think of Tohfa as a digital version of a gifting mall** — like Amazon, but only for handmade gifts from Indian artisans. There are three types of people using it: **Buyers** (who shop for gifts), **Sellers** (artisans who make and sell things), and **Admins** (the Tohfa team who control everything behind the scenes).

> [!NOTE]
> This document has been corrected with your feedback. All bugs and business logic changes are clearly marked with 🐛 (existing bug) and ✅ (correct/intended behaviour).

---

## 🏗️ THE BIG PICTURE — HOW THE WHOLE THING IS ORGANIZED

```
TOHFA WEBSITE
├── frontend/   → Everything the user SEES (buttons, pages, forms)
└── backend/    → The "brain" behind the scenes (data, logic, database)
```

Imagine you open a restaurant. The **frontend** is the dining area — tables, menus, waiters. The **backend** is the kitchen — where food is actually made. The **database** is the refrigerator — where everything is stored.

---

## 📁 FRONTEND — WHAT THE USER SEES

The frontend has **4 sections**, one for each type of user:

| Folder | Who uses it | What it is |
|--------|------------|------------|
| `auth/` | Everyone | Login, Signup, Forgot Password pages |
| `buyer/` | Shoppers | Home, Products, Cart, Orders, Seller Profiles, etc. |
| `seller/` | Artisans | Dashboard, Add Product, Orders, Payouts |
| `admin/` | Tohfa Team | Control panel for the entire platform |

There's also a `components/` folder with **reusable parts** — like the navbar (top menu bar) and footer — that appear on every page.

---

## 📁 BACKEND — THE BRAIN

The backend runs on **Node.js + Express** (a popular web server). It's organized into 4 layers:

```
Routes → Controllers → Services → Database
  ↑           ↑            ↑           ↑
 URL     Logic for     Complex     Stores
 paths   each request  business    all data
                        rules
```

Think of it like a restaurant order:
- **Routes** = The waiter takes your order at the table
- **Controllers** = The manager decides what to cook
- **Services** = The chef actually cooks it
- **Database** = The storage where all food/data lives

---

## 🔑 PIPELINE 1 — SIGNING UP & LOGGING IN (Authentication)

**Files involved:** `auth.service.js`, `auth.controller.js`, `auth.routes.js`, `middleware/auth.js`

### How Buyer Signup Works:
1. You fill in your **name, email, password** on `signup-buyer.html`
2. The frontend sends this to the backend
3. Backend **checks if email already exists** (no duplicates allowed)
4. Backend **encrypts (hashes) your password** using `bcrypt` — a special scrambling tool so even Tohfa can't see your real password
5. Backend **saves you to the database** in the `users` table
6. Backend **creates an empty shopping cart** for you automatically
7. Backend gives you **two special keys**:
   - **Access Token** (lasts 15 minutes) — like a day-pass at a theme park
   - **Refresh Token** (lasts 7 days) — like a season pass that gets you a new day-pass
8. You're now logged in!

### How Seller Signup Works:

**What the backend code does (correct logic):**
1. Collects name, email, phone, password, store name, craft specialty, bio
2. Backend creates BOTH a `users` entry AND a `seller_profiles` entry in one atomic transaction
3. Seller starts with `verification_status = 'pending_verification'` — they cannot sell until Admin approves them

> [!WARNING]
> **🐛 BUG FOUND (from your comment):** The current `signup-seller.html` form only shows fields for **name, email, phone, and password**. It does **NOT** show fields for store name, craft specialty, or bio on the registration page. The backend code does accept these fields, but the frontend form never asks for them at signup time. This means sellers register with a blank store profile.
>
> **FIX NEEDED:** Add "Store Name", "Craft Specialty", and "Bio" fields to `signup-seller.html`, OR redirect sellers to a profile completion page (`onboarding.html`) right after signup where they fill these in.

### How Login Works:
1. You type email + password
2. Backend finds your account in database
3. Backend uses `bcrypt.compare()` to check if your password matches the stored scrambled version
4. If correct → issues new Access + Refresh tokens
5. If wrong → says "Invalid email or password"

### The Token System (Security):
- Every time you click something private (your orders, profile, etc.), the **Access Token is checked**
- The `auth.js` middleware does this — it reads the token from your request header and decodes it
- If the token **expired** → tells you to log in again
- The database is also checked to make sure your account wasn't **banned** between tokens

### Password Reset Flow:
1. You click "Forgot Password" → type your email
2. Backend generates a **random secret token** and saves it (hashed) to your account with a **1-hour expiry**
3. An email is sent to you with a link containing that token
4. You click the link → backend checks the token is valid and not expired
5. You type a new password → backend updates it and **deletes the reset token**

---

## 🛍️ PIPELINE 2 — BROWSING PRODUCTS

**Files involved:** `product.controller.js`, `product.routes.js`

### How the Home Page Loads Products:
1. Your browser opens `home.html`
2. It calls `/api/home/feed` to get a **personalized "For You" feed**
3. Backend queries the `products` table for active products, sorted by view count (popularity)
4. It also calls `/api/products/featured` for featured items
5. The `is_tohfa_original` flag (secret internal label) is **NEVER sent to buyers** — it's stripped out before sending

### Product Categories:
- The category list (`Art & Portraits`, `Candles & Fragrance`, `Ceramics`, etc.) is **hardcoded** in `product.controller.js` as a `CATEGORY_CATALOG` object
- Each category has subcategories (e.g., "Candles & Fragrance" → Soy Wax, Incense, etc.)

### Searching for Products:
1. You type something in the search bar on `search.html`
2. It calls `/api/products?search=yourterm`
3. Backend uses **full-text search** (PostgreSQL's built-in search engine) to find matching products
4. Results come back filtered + sorted

### Viewing a Single Product:

> [!WARNING]
> **🐛 BUG FOUND (from your comment):** The basic function of clicking a product and loading its full detail page is **not working properly on the live website**. The `product.js` file does have the correct logic (reads `?id=` from URL, calls `/api/products/:id`), but the page is not loading product data correctly.
>
> **What SHOULD happen:**
> 1. You click a product card → browser goes to `product.html?id=xyz`
> 2. `product.js` reads the `id` from the URL
> 3. Calls `GET /api/products/xyz`
> 4. Backend fetches: product details, images, variants (size/color), seller info, reviews
> 5. Backend also records a "view" — increments the `view_count` on that product
> 6. Page renders all this data
>
> **FIX NEEDED:** Debug why the product detail page is not loading data — likely an API endpoint mismatch or CORS/auth issue.

---

## 🏪 PIPELINE 3 — ARTISAN / SELLER PUBLIC PROFILE PAGE

**Files involved:** `seller-profile.html`, `seller-profile.js`, `seller.controller.js`

> [!NOTE]
> This pipeline was missing from the original document. Adding it now.

This is the **public-facing store page** for each artisan — like visiting a stall in a craft fair. Any visitor (even without logging in) can see it.

### What the Seller Profile Page Shows:
1. **Hero/Banner Section:** Seller's cover photo, profile photo, store name, bio, "Verified Artisan" badge
2. **About the Seller:** Their bio/description written at signup or from profile settings
3. **All Products by This Seller:** A grid of all their active, published products with prices
4. **Contact:** A "Chat on WhatsApp" button (if the seller has added their WhatsApp number)
5. **Reviews:** Reviews left by buyers who purchased from this artisan

### How It Loads:
1. You click a seller's name anywhere on the site → goes to `seller-profile.html?id=SELLER_ID`
2. `seller-profile.js` reads the `id` from URL
3. Calls `GET /api/seller/public/:id` → backend returns the seller's profile (no private data)
4. Calls `GET /api/products/seller/:id` → backend returns all their active products
5. Page renders the hero section + product grid

### Seller Profile Stats (visible on their profile):
- Total products listed
- Star rating average (calculated from all their reviews)
- Member since date

> [!NOTE]
> The "Follow Studio" button exists in the current code but is being **removed** (see Pipeline 11 update below). Once removed, the seller profile page will only show: Profile, Products, About, and Reviews.

---

## 🛒 PIPELINE 4 — CART SYSTEM

**Files involved:** `cart.controller.js`, `cart.routes.js`

The cart is like your shopping basket at a supermarket.

### Adding to Cart:
1. You click "Add to Cart" on a product
2. Frontend calls `POST /api/cart`
3. Backend checks if this product is already in your cart:
   - **If yes** → increases the quantity
   - **If no** → adds a new row to the `cart_items` table

### Viewing Cart:
1. Frontend calls `GET /api/cart`
2. Backend joins `cart_items` + `products` + `sellers` tables to give you:
   - Product name, image, price
   - Seller/store name
   - Your chosen variant (color, size)

### Updating/Removing Items:
- `PUT /api/cart/:id` → change quantity
- `DELETE /api/cart/:id` → remove item
- `DELETE /api/cart` → clear entire cart

---

## 💳 PIPELINE 5 — CHECKOUT & PAYMENT

**Files involved:** `order.service.js`, `order.controller.js`, `payment.service.js`, `payment.controller.js`, `webhook.controller.js`

This is the most complex pipeline. Think of buying something online step by step:

### Step 1 — Choose Address
- You select a saved address or add a new one
- Frontend calls `/api/user/addresses` to list your saved addresses

### Step 2 — Apply Coupon (Optional)
1. You type a coupon code (e.g., `WELCOME10`)
2. Frontend calls `POST /api/coupons/apply`
3. Backend checks the code in the `coupons` database table
4. If not found in DB → checks a **built-in static list** of hardcoded coupons (WELCOME10, TOHFA100, ARTISAN20, FIRSTGIFT)
5. Validates: Is it active? Is it not expired? Is the order amount high enough?
6. Returns the **discount amount** and **final price**

### Step 3 — Place Order
1. You click "Place Order"
2. Frontend sends `POST /api/orders` with your address + cart items + coupon
3. Backend's `placeOrders()` service:
   - Fetches your cart items
   - **Groups them by seller** (if you buy from 2 sellers, it creates 2 separate orders)
   - Checks stock availability
   - Creates a **Razorpay Order** (like a payment invoice) via Razorpay's API
   - Saves the order to database with status = `pending`
   - Decrements stock

### Step 4 — Payment
1. Razorpay's payment window pops up in the browser
2. You pay by UPI, card, etc.
3. Razorpay sends you back to `payment-success.html` if paid

### Step 5 — Payment Verification (TWO ways it gets confirmed):

**Way A — Direct Verification:**
- Frontend sends the payment proof to `POST /api/payments/verify`
- Backend uses **HMAC-SHA256 cryptography** to verify the signature (a math formula to prove Razorpay sent this, not a fake)
- If valid → calls `markOrderPaid()` which:
  1. Updates order status to `confirmed`
  2. Updates payment status to `paid`
  3. Decrements product stock (with database locking, to prevent double-deduction)

**Way B — Webhook (Backup, More Reliable):**
- Razorpay **automatically calls** Tohfa's `/api/webhook` whenever a payment succeeds
- Backend verifies the webhook signature (same cryptography trick)
- Even if Way A failed, Way B still marks the order as paid
- This prevents orders being "paid but not confirmed"

### Commission Structure:
> [!IMPORTANT]
> **Corrected from your comment:** Tohfa charges **5% commission from each side** during any transaction.
> - Buyer pays a 5% platform fee on top of the product price
> - Seller receives their earnings minus a 5% platform deduction
> - This applies to all transaction types: regular orders, customization orders, overflow orders

### After Payment:
- A **WhatsApp message** is sent to the artisan seller's phone saying "New order received!"
- A shipment is automatically booked via **iThink Logistics**

---

## 📦 PIPELINE 6 — ORDER MANAGEMENT

**Files involved:** `order.controller.js`

### Order Statuses (The Journey of an Order):

```
pending → confirmed → making/processing → ready_to_ship → shipped → delivered
                  ↘ cancelled
```

- **pending** — Order placed, payment being processed
- **confirmed** — Payment received, seller has accepted it
- **making/processing** — Artisan is actively crafting the item
- **ready_to_ship** — Item is packed and ready to be dispatched
- **shipped** — Package has been handed to the courier
- **delivered** — Buyer has received it
- **cancelled** — Order was cancelled

The system enforces **valid transitions** only. For example, you CANNOT go from `delivered` back to `cancelled`. The system rejects invalid changes.

### Who Can Change What:
- **Seller** can: confirm → update progress → mark shipped → mark delivered
- **Buyer** can: request cancellation (only before shipped)
- **Admin** can: do anything, including manually editing the delivery stage

> [!IMPORTANT]
> **Admin Delivery Stage Control (from your comment):**
> The Admin panel has controls to manually override and edit which stage a specific order is in — for example if the courier system has a lag or if a "special" seller needs manual handling. The admin can set any order to any status and the buyer will see the updated stage reflected in real-time on their `orders.html` page.

### Cancellation & Refund:
1. Buyer requests cancel
2. Backend checks if already shipped (if yes, cannot cancel)
3. If not yet shipped → **stocks are restocked** (items returned to inventory)
4. If order was already **paid** → a **Razorpay refund** is triggered automatically
5. A `refund_requests` record is created
6. Both buyer and seller get **notifications**

---

## 🚦 PIPELINE 7 — OVERFLOW / BUSY-SELLER ORDERS

**Files involved:** `order.controller.js`, `overflow_orders` table

> [!NOTE]
> This pipeline has been **completely rewritten** based on your correction.

### What is an Overflow Order?
Some artisans are independent makers — they can only craft a limited number of items at a time. When they are **at full capacity** (busy with existing orders), they mark themselves as busy in their dashboard.

### The Full Correct Flow:

**Step 1 — Buyer Tries to Buy from a Busy Seller**
- Buyer adds a product to cart → goes to checkout
- System detects the seller is currently at capacity
- A **prominent warning is shown to the buyer** before they can proceed:

```
⚠️ This artisan is currently busy with other orders.
  • Delivery will take LONGER than usual
  • The seller may DECLINE your request
  • Payment will only be charged if the seller ACCEPTS
  
  Do you still want to send a request?  [Cancel]  [Send Request]
```

**Step 2 — Buyer Confirms & Request is Sent (NO payment yet)**
- If the buyer clicks "Send Request", an **overflow order request** is created
- This is saved to the `overflow_orders` table with status = `pending`
- **NO payment is taken at this stage** — only a request is filed
- Buyer's cart is NOT cleared yet

**Step 3 — Seller Reviews the Request**
- Seller sees the overflow request in their dashboard (`overflow.html`)
- They can either:
  - ✅ **Accept** → proceeds to payment step
  - ❌ **Decline** → buyer is notified, request is closed, buyer can shop elsewhere

**Step 4 — Seller Accepts → Payment is Now Triggered**
- When seller accepts, a **Razorpay payment order** is created for the buyer
- The buyer receives an **in-app notification + WhatsApp message**: "Your request was accepted! Please complete payment within 24 hours."
- Buyer goes to the payment page and pays
- After payment → a real `orders` row is created from the overflow snapshot
- Order status = `confirmed`
- Normal order flow continues from here

**Step 5 — Seller Declines**
- Overflow order status → `declined`
- Buyer receives a notification: "The artisan could not accept your order at this time. Please try again later or explore other artisans."
- No money was ever taken

### Why This Is Better:
- Buyer is never charged for something a seller can't make
- Seller is never forced to take orders they can't fulfill
- Buyer always knows the risk before submitting

---

## 🎨 PIPELINE 8 — CUSTOMIZATION SYSTEM

**Files involved:** `customization.service.js`, `customization.controller.js`, `customization-form.html`, `customization-form.js`

> [!NOTE]
> This pipeline has been **completely rewritten** based on your correction. The old quote-negotiation flow has been replaced with a simpler, fixed-price + proof photo flow.

This is Tohfa's "order something uniquely made for you" feature.

### The Key Principle (Corrected):
- Since customizations on Tohfa are simple (just **text inputs and image uploads**), the seller **sets the price upfront** when listing the product
- There is NO price negotiation or quote process
- Buyer pays the fixed price immediately after submitting their requirements

### The Complete Corrected Flow — 4 Steps:

---

**Step 1 — Seller Sets Up the Product with Customization (at listing time)**

When a seller lists a product as "customizable", they configure:
- **Fixed price** for the customized version (set once, shown clearly to buyer)
- What the buyer needs to provide: text (e.g., name, message) and/or reference images
- **Turnaround time**: how many days it takes to make (e.g., "5-7 business days")
- Brief instructions for the buyer (e.g., "Please provide the name in CAPITAL letters")

This config is saved to `open_customization_configs` in the database.

---

**Step 2 — Buyer Fills the Customization Form & Pays Immediately**

1. Buyer opens the customizable product page
2. Clicks "Customise This"
3. A form appears (`customization-form.html`) with:
   - Text fields: name, message, or any text the seller asked for
   - Image upload: reference photos if required
4. Buyer sees the **fixed price clearly displayed** before submitting
5. Buyer fills everything in and clicks **"Submit & Pay ₹XXXX"**
6. A `customization_requests` row is created in the database (status = `pending_payment`)
7. **Razorpay payment window opens immediately** for the fixed price
8. Buyer pays → payment is verified (same Razorpay flow as normal orders)
9. Status updates to `confirmed` and order is created

---

**Step 3 — Seller Makes the Custom Item**

1. Seller sees the new order in their dashboard under "Custom Orders"
2. The order shows: buyer's text requirements, reference images, delivery address
3. Seller starts crafting the item
4. Seller can update the order status:
   - `confirmed` → `making` → `ready_to_ship`

---

**Step 4 — Seller Sends Proof Photo Before Dispatch (via WhatsApp)**

Before packing and dispatching, the seller **sends a proof photo** of the completed item:

1. Seller uploads the photo of the finished product via their dashboard (proof upload button)
2. The system automatically sends a **WhatsApp message to the buyer** containing:
   - The proof photo
   - A text message: *"Your custom order is ready! 🎁 Here's a preview. We'll be dispatching it to [buyer's address] shortly. Order by [Store Name], ₹[Amount] paid."*
3. After the buyer sees the proof, the seller dispatches the package and marks it `shipped`

---

### Why No Refunds on Customization:
- Custom items are made specifically for one person — they cannot be resold
- Buyers see a **clear non-refundable notice** before paying
- Exception: If the seller sends a wrong or damaged item, the admin can manually approve a refund

---

## 🗓️ PIPELINE 9 — OCCASIONS & REMINDERS

**Files involved:** `occasion.service.js`, `occasion.controller.js`, `whatsapp.service.js`

This is Tohfa's **gift reminder system** — like a personal assistant for gifting.

### How It Works:
1. You save an occasion: "Mom's Birthday on March 15th"
2. Every day at **9:00 AM**, a scheduled job (cron) runs automatically
3. It scans all saved occasions in the database
4. It checks:
   - **30 days before** → sends a WhatsApp reminder + in-app notification
   - **14 days before** → sends another reminder
   - **7 days before** → sends a final urgent reminder ("Only 7 days left! Order now!")
5. Each reminder is sent only **once** (tracked with `reminder_sent_1m`, `reminder_sent_2w`, `reminder_sent_1w` flags)

### WhatsApp Integration:
- Uses **Twilio** (a messaging platform) to send WhatsApp messages
- Formats Indian phone numbers correctly (+91XXXXXXXXXX)
- All messages fail **silently** — if WhatsApp fails, the rest of the app still works fine

---

## 🚚 PIPELINE 10 — LOGISTICS & SHIPPING

**Files involved:** `logistics.service.js`, `logistics.controller.js`

### How Shipping is Automated:
1. After payment is confirmed, the webhook triggers `createShipment()`
2. Backend checks if the seller is a **"regular" seller** (eligible for automated shipping via **iThink Logistics**) or a **"special" seller** (manually managed by admin)
3. For **regular sellers**:
   - Fetches the seller's pickup address from their profile
   - Fetches the buyer's delivery address
   - Calls the **iThink Logistics API** to book a courier pickup
   - Gets back a **waybill number** (tracking number)
   - Saves the waybill to the order
   - Notifies the buyer with tracking info
4. For **special sellers** (Tohfa Originals / curated makers):
   - Shipment is handled manually by the Tohfa admin team
   - Admin manually updates the delivery stage in the admin panel
   - Admin can update the order to `shipped`, `out_for_delivery`, `delivered` etc. — the buyer sees these updates in real-time

### Pincode Serviceability Check:
- Before checkout, buyer can check if their pincode is deliverable
- Calls `GET /api/logistics/check?pincode=XXXXXX`
- Backend queries iThink's API to confirm delivery is possible to that area

---

## 🤖 PIPELINE 11 — TANYA (AI CHATBOT)

**Files involved:** `tanya.service.js`, `tanya.controller.js`, `tanya.routes.js`

**Tanya** is Tohfa's AI gift assistant powered by **Google Gemini AI** (like ChatGPT, but Google's version).

### How It Works:
1. You open the chat and type something like "I need a gift for my mom's 50th birthday, budget ₹1000"
2. Frontend sends the message to `POST /api/tanya/chat`
3. Backend first **fetches the live product catalog** from the database (top 50 active, in-stock products)
4. This catalog is injected into Tanya's **system instructions** — so Tanya only recommends REAL products that actually exist on Tohfa
5. Tanya's rules:
   - Start with "Namaste! 🎁" (Indian hospitality)
   - Only recommend products from the live catalog
   - Include direct product links (`/buyer/product.html?id=xxx`)
   - Include price, maker name, and why it's a good gift
   - Never make up products that don't exist
6. The AI response is sent back and shown in the chat window

---

## ⭐ PIPELINE 12 — REVIEWS & RATINGS

**Files involved:** `review.controller.js`, `review.routes.js`

### How Reviews Work:
1. You can **only review after your order is delivered** (not before)
2. You can **only leave one review per order** (no duplicate reviews)
3. You fill in a **1-5 star rating** and optional comment
4. Backend verifies:
   - The order belongs to you
   - The order is "delivered"
   - You haven't already reviewed this order
5. Review is saved to `reviews` table
6. The **seller is notified** with a notification
7. Sellers can **reply** to reviews (there's a `seller_reply` field)
8. Reviews appear on the seller's **public profile page** for all visitors to see

---

## ❤️ PIPELINE 13 — WISHLIST

> [!IMPORTANT]
> **From your comment: The "Follow Sellers" feature has been REMOVED from this pipeline entirely.**

**Files involved:** `wishlist.controller.js`

### Wishlist:
- You click the heart icon on a product → calls `POST /api/wishlist`
- Saved to `wishlists` table linked to your user ID
- Your wishlist page (`wishlist.html`) loads all your saved items with current prices
- You can remove items from your wishlist at any time

> [!NOTE]
> The Follow Sellers feature (code in `seller.controller.js` → `followSeller`/`unfollowSeller`, and the "Follow Studio" button in `seller-profile.js`) currently EXISTS in the codebase but should be treated as **removed from the product**. The button should be hidden/removed from the seller profile page UI.

---

## 📊 PIPELINE 14 — SELLER ANALYTICS

**Files involved:** `analytics.controller.js`, `analytics.routes.js`

Sellers have their own analytics dashboard (`analytics.html`) showing:
- **Daily revenue** for the last 30 days (line chart)
- **Top 5 products** by order count and revenue
- **Total orders, average order value, total revenue**
- **Profile views** (how many people viewed their store page)
- **Conversion rate** (percentage of visitors who actually bought something)

All these numbers are calculated on the fly by querying the database — not pre-stored.

---

## 👑 PIPELINE 15 — ADMIN PANEL

**Files involved:** `admin.controller.js`, `admin.routes.js`, `admin/` frontend pages

The Admin is like the owner of the entire mall — they have total control.

### Admin Can Do:

**Seller KYC (Verification):**
1. A new seller signs up → status is `pending_verification`
2. Admin sees them in the `sellers.html` admin page
3. Admin can **approve** (seller can now list products) or **reject** (with a written reason)
4. When approved → seller gets notified by email + in-app notification
5. When rejected → seller is told why and can fix their profile and re-apply

**Product Moderation:**
- Admin can view, approve, or delete any product on the platform
- Can mark products as **"Tohfa Originals"** (internal flag, never shown to buyers publicly)

**Order Management & Delivery Stage Control:**
- See ALL orders on the entire platform
- Filter by date, seller, or order status
- **Manually edit the delivery stage of any order** — useful for special sellers or when the courier system has delays
  - Admin sets: `confirmed` → `making` → `shipped` → `out_for_delivery` → `delivered`
  - The buyer sees these changes reflected immediately in their `orders.html` page
- Approve refunds for cancelled orders

**Coupon Management:**
- Create, edit, and disable coupon codes platform-wide
- Set discount type (percentage or flat), minimum order amount, expiry date

**Banner Management:**
- Upload and manage homepage hero banner images
- Stored in Cloudinary (image hosting service), URL saved to database

**Dashboard Stats:**
- Total money earned on the platform (GMV = Gross Merchandise Value)
- Total buyers registered, active approved sellers
- Orders currently in progress, pending KYC applications count

**Audit Logs:**
- Every admin action is recorded in an `audit_logs` table with: who did it, what they did, when
- This creates a tamper-proof history — no admin action can be secretly undone

---

## 💰 PIPELINE 16 — SELLER PAYOUTS

**Files involved:** `seller.controller.js` (payout sections)

### How Artisans Get Paid:

> [!IMPORTANT]
> **Commission Structure (corrected from your comment):**
> Tohfa charges **5% from each side** on every transaction:
> - **5% from the buyer** → added on top at checkout (platform fee)
> - **5% from the seller** → deducted from their payout
> - This applies to ALL transactions: regular orders, customization orders, overflow orders

### Payout Timeline:
1. When an order is marked **delivered**, payout status becomes `holding` (a 7-day waiting period — buyer return window)
2. After 7 days → payout becomes `ready`
3. Seller requests a payout from their dashboard (`payouts.html`)
4. Admin reviews and approves the payout
5. Money is transferred directly to the seller's registered bank account
6. Full payment history is visible in `payment-history.html`

---

## 📧 PIPELINE 17 — EMAIL & NOTIFICATIONS

**Files involved:** `email.service.js`, `notification.controller.js`

### In-App Notifications:
- Stored in `notifications` table
- Triggered automatically for:
  - New order placed
  - Order status changed (confirmed, shipped, delivered, cancelled)
  - Review received (seller gets notified)
  - Customization proof photo uploaded
  - Overflow order accepted/declined
  - Occasion reminders
- Buyer sees them on `notifications.html`

### Email:
- Used for: password reset links
- Sent via **Nodemailer** (an email-sending library)

### WhatsApp (Twilio):
- Occasion reminders (30/14/7 days before saved occasions)
- New order alert for sellers
- Customization proof photo message to buyer (before dispatch)
- Overflow order status updates

---

## 💎 PIPELINE 18 — SELLER SUBSCRIPTION PLANS (Tiered Growth Engine)

**Files involved:** `frontend/src/seller/plans.html`, `frontend/src/components/seller-components.js`, `seller.controller.js`

This is Tohfa Studio's monetization & seller acceleration system — allowing artisans to boost their store, get advertising, and jump the queue for high-value orders.

### Navigation in Seller Studio:
Artisans can find this by clicking **"Plans"** located at the **very bottom of their Seller Studio navigation sidebar** (`/seller/plans.html`).

### The 3 Subscription Tiers:

| Plan | Monthly Price | Key Benefits | Bulk Order Routing Priority |
| :--- | :--- | :--- | :--- |
| **Basic** | **₹0** (Free forever) | • Unlimited product listings<br>• Standard order & payment management<br>• Basic dashboard analytics & customer reviews<br>• WhatsApp order alerts | 🥉 **3rd Priority** (Approached after Max & Pro) |
| **Pro** | **₹199** / month | • Everything in Basic<br>• **5 Sponsored Products** (featured in search results & home feed)<br>• Priority placement across category pages<br>• "Pro Studio" badge on public seller profile<br>• Advanced revenue analytics & priority customer support | 🥈 **2nd Priority** (Approached after Max) |
| **Max** | **₹499** / month | • Everything in Pro<br>• **Meta Ads Integration** (Artisan products promoted via sponsored Facebook & Instagram ads)<br>• **Unlimited Sponsored Products** (no cap on featured listings)<br>• "Max Studio" badge (highest buyer trust signal)<br>• Dedicated account manager & early feature access | 🥇 **1st Priority** (Approached FIRST for all bulk inquiries) |

---

### 📦 How Bulk & Corporate Order Priority Works:
When companies or buyers submit large bulk gifting inquiries (e.g. corporate Diwali gifts, wedding hampers):
1. **Max sellers are approached 1st** — giving top-tier subscribers the first right of refusal on high-ticket sales.
2. If Max sellers are unavailable or at capacity, **Pro sellers are approached 2nd**.
3. **Basic sellers are approached 3rd**.

### 💳 How Upgrading / Payment Works:
1. Seller opens `plans.html` in their Studio.
2. The page automatically checks their current active plan via `/api/seller/profile`.
3. Clicking **"Upgrade"** opens a confirmation modal and launches the **Razorpay checkout modal**.
4. Upon successful payment verification, their profile's subscription tier updates immediately and perks (like sponsored badges and feed boosting) activate in real-time.
5. Sellers can downgrade back to Basic anytime at no charge.

---

## 🔐 SECURITY SYSTEMS

### Rate Limiter:
- Stops abuse — if someone sends API requests too fast, they get temporarily blocked
- Login has a **stricter limit** (to prevent password guessing attacks)

### Input Validation:
- Every form field is validated on the backend too (not just in the browser)
- Indian phone numbers are cleaned up automatically (handles +91, 0 prefix, spaces, etc.)

### Role-Based Access:
- `auth.js` → checks if you're logged in
- `sellerOnly.js` → only sellers can access seller routes
- `adminOnly.js` → only admins can access admin routes
- Buyers can never access seller or admin endpoints — they get a 403 (Access Denied) error

### Password Security:
- Passwords are hashed with `bcrypt` using 12 salt rounds (very hard to crack)
- Reset tokens are hashed with `SHA-256`
- Refresh tokens are also hashed before storing in the database

### CORS (Cross-Origin Resource Security):
- Only `thetohfa.in` and `localhost` are allowed to communicate with the backend
- Requests from any other website are automatically blocked

### Webhook Security:
- Razorpay payment webhooks are verified using **HMAC-SHA256 signature** — mathematically impossible to fake without the secret key

---

## 🗃️ DATABASE — WHERE EVERYTHING IS STORED

The database is **PostgreSQL** hosted on **Neon** (a cloud database service). Here are the key tables:

| Table | What it stores |
|-------|---------------|
| `users` | Everyone — buyers, sellers, admins |
| `refresh_tokens` | Login session tokens |
| `addresses` | Buyer delivery addresses |
| `sellers` | Master artisan store info |
| `seller_profiles` | Extended seller details, photos, subscription_plan, settings |
| `products` | All products listed on the platform |
| `product_images` | Photos for each product |
| `product_variants` | Size/color options per product |
| `carts` | One cart per user |
| `cart_items` | Items currently in each cart |
| `orders` | All placed & paid orders |
| `order_items` | Individual items inside each order |
| `payments` | Payment records from Razorpay |
| `refund_requests` | Refund requests and their status |
| `overflow_orders` | Requests made when seller is at full capacity |
| `reviews` | Product and seller reviews |
| `wishlists` | Products saved by buyers |
| `occasions` | Saved birthday/anniversary dates |
| `notifications` | In-app notification messages |
| `coupons` | Discount codes |
| `open_customization_configs` | Seller's customization rules per product |
| `customization_requests` | Buyer customization request details |
| `audit_logs` | Tamper-proof history of all admin actions |

---

## 📸 IMAGE UPLOADS — CLOUDINARY

**Files involved:** `middleware/upload.js`

All images are uploaded to **Cloudinary** (a cloud image hosting service) — NOT stored on Tohfa's own server.

| Upload type | Max size | Auto-resize to |
|------------|---------|--------------|
| Product images | 10MB, up to 8 per product | Auto quality |
| Profile photo | 5MB | 400x400 pixels |
| Cover/store banner | 8MB | 1200x400 pixels |
| Customization reference images | 10MB, up to 5 | Auto quality |
| Admin homepage banners | 10MB | 1400x560 pixels |
| Proof-of-work photo (customization) | 10MB | Auto quality |

---

## 🌐 HOW FRONTEND & BACKEND TALK TO EACH OTHER

Every page in the frontend uses **JavaScript fetch() calls** to talk to the backend API.

**Example — Loading Products on Home Page:**
```
home.html opens
    ↓
home.js runs
    ↓
fetch("http://backend/api/home/feed")
    ↓
Backend processes, queries database
    ↓
Returns JSON data
    ↓
home.js uses the data to draw the product cards on screen
```

The frontend stores your **Access Token** in localStorage (browser memory) and sends it with every request:
```
Authorization: Bearer eyJhbGci...
```

---

## 🔄 THE COMPLETE SHOPPING FLOW (From Start to Delivery)

```
1. BROWSE
   Buyer opens home.html
   → Loads featured products + "For You" feed (sorted by popularity)

2. DISCOVER
   Buyer searches/filters → views seller profile page
   → Sees artisan's bio, all their products, reviews
   → Clicks a product → product.html?id=xyz loads full detail

3. WISHLIST (optional)
   Buyer clicks heart icon → saved to wishlist for later

4A. REGULAR ORDER
   Buyer clicks "Add to Cart" → selects variant if any
   → Cart page → checkout → address → coupon → pay

4B. CUSTOM ORDER
   Buyer clicks "Customise This"
   → Fills form (text + reference images)
   → Sees fixed price → clicks "Submit & Pay"
   → Pays immediately → seller starts crafting
   → Seller uploads proof photo → WhatsApp sent to buyer
   → Seller dispatches

4C. OVERFLOW ORDER (busy seller)
   Buyer sees warning: "Seller is busy, longer delivery, seller may decline"
   → Buyer confirms → request sent (NO payment yet)
   → Seller accepts → buyer gets notified → buyer pays
   → OR seller declines → buyer is notified, no charge

5. CHECKOUT & PAYMENT
   Razorpay payment window opens
   → Buyer pays via UPI/card/etc.
   → Payment verified via signature + webhook backup
   → Order status → "confirmed"

6. SELLER MAKES & SHIPS
   Seller gets WhatsApp alert: "New order!"
   → Seller confirms, makes the item
   → iThink Logistics booked (for regular sellers)
   → Admin handles logistics (for special sellers)
   → Seller marks "shipped" → buyer sees tracking

7. DELIVER
   Courier delivers to buyer
   → Order marked "delivered"
   → Payout enters 7-day holding period
   → Buyer can now leave a 1-5 star review

8. PAYOUT
   After 7 days → payout status = "ready"
   → Seller requests payout
   → Admin approves → bank transfer sent
   → Tohfa's cut: 5% from buyer (added at checkout) + 5% from seller (deducted from payout)

9. REMINDERS (running in background daily)
   Every day at 9:00 AM → occasion cron runs
   → Sends WhatsApp + in-app reminders at 30/14/7 days
   → Tanya AI chatbot available anytime for gift advice
```

---

## 🐛 KNOWN BUGS SUMMARY (From Your Comments)

| # | Bug | Location | Status |
|---|-----|---------|--------|
| 1 | Seller signup form doesn't ask for store name/specialty/bio | `signup-seller.html` | 🔴 Needs fix |
| 2 | Product detail page not loading (`product.html?id=xyz`) | `product.js` + API | 🔴 Needs fix |
| 3 | "Follow Seller" feature needs to be removed from UI | `seller-profile.js`, `seller-profile.html` | 🟡 Needs UI removal |
| 4 | Commission shows as 10% — should be 5% from each side | `seller.controller.js`, documentation | 🟡 Needs correction |

---

## 🎯 FULL SYSTEM SUMMARY TABLE

| System | Purpose | Key Files |
|--------|---------|-----------|
| Auth | Login/Signup/Security | `auth.service.js`, `middleware/auth.js` |
| Products | Catalog, Search, Feed | `product.controller.js` |
| Seller Profile | Public artisan store page | `seller-profile.html`, `seller.controller.js` |
| Cart | Shopping basket | `cart.controller.js` |
| Regular Orders | Standard purchase flow | `order.service.js`, `order.controller.js` |
| Overflow Orders | Busy seller request flow (pay on accept) | `order.controller.js` |
| Customization | Fixed-price custom order + WhatsApp proof | `customization.service.js` |
| Payments | Razorpay integration, webhook | `payment.service.js`, `webhook.controller.js` |
| Occasions | Reminder system (30/14/7 days) | `occasion.service.js` |
| Logistics | Auto-shipping via iThink + admin manual | `logistics.service.js` |
| Tanya AI | Gift chatbot (Google Gemini) | `tanya.service.js` |
| Reviews | Ratings/feedback (delivered orders only) | `review.controller.js` |
| Wishlist | Save products for later | `wishlist.controller.js` |
| Seller Analytics | Revenue, top products, views | `analytics.controller.js` |
| Seller Plans | Basic (₹0), Pro (₹199), Max (₹499) subscription tiers | `seller/plans.html`, `seller-components.js` |
| Admin Panel | Full platform governance + order stage control | `admin.controller.js` |
| Payouts | 7-day hold → bank transfer, 5%+5% commission | `seller.controller.js` |
| WhatsApp | Reminders, order alerts, proof photos | `whatsapp.service.js` |
| Notifications | In-app alerts for all events | `notification.controller.js` |
| Uploads | Images to Cloudinary | `middleware/upload.js` |
