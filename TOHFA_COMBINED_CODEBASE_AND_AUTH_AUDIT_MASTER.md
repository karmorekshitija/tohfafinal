# TOHFA E-COMMERCE PLATFORM (thetohfa.in)

# Master Architectural Audit, Authentication Deep-Dive & Post-Refactor Verification

---

## 1\. Executive Summary & Platform Health

This unified document consolidates the complete architectural audit, authentication and session overhaul, database schema migrations, and post-refactor verification for **Tohfa (`thetohfa.in`)**.

┌─────────────────────────────────────────────────────────────────────────────────────────────┐

│                                TOHFA MASTER PLATFORM HEALTH                                 │

├──────────────────────────────┬─────────────────────────────┬────────────────────────────────┤

│ Subsystem / Layer            │ Initial State (Pre-Refactor)│ Refactored Production Baseline │

├──────────────────────────────┼─────────────────────────────┼────────────────────────────────┤

│ 1\. Database Relational Model │ Incomplete (Missing 7 tables)│ ✅ Master Schema \+ Migrations  │

│ 2\. Authentication & Session  │ Token collisions & 404 drops│ ✅ Unified Storage & Redirection│

│ 3\. Multi-Vendor Sub-Orders   │ Monolithic Order Leakage    │ ✅ Isolated \`seller\_orders\`    │

│ 4\. Admin Governance          │ Mock UI / Missing Controls  │ ✅ Master Authority & Refunds  │

│ 5\. UI Settings Page          │ Redundant / Dead Route      │ ✅ Completely Excised          │

│ 6\. Tohfa Specials Engine     │ Unused Schema Flag          │ ✅ Live DB Curation & Badging  │

│ 7\. Payment Verification      │ Race Condition / Tampering  │ ✅ Idempotent DB Row Locks     │

│ 8\. Frontend API Client       │ Inconsistent \`.data\` parsing│ ✅ Auto-Unwrapper & 401 Intercept│

│ 9\. UI Empty-State Handling   │ Fatal \`TypeError: .map()\`   │ ✅ Universal \`renderEmptyState\`│

│ 10\. Discount & Coupon Engine │ Client-Side JS Calculation  │ ✅ Server-Side Coupon Engine   │

└──────────────────────────────┴─────────────────────────────┴────────────────────────────────┘

---

## 2\. Authentication, Login, Signup & Session Architecture

┌─────────────────────────────────────────────────────────────────────────────────────────────┐

│                            TOHFA UNIFIED AUTHENTICATION FLOW                                │

├─────────────────────────────────────────────────────────────────────────────────────────────┤

│                                                                                             │

│                                      \[User Credentials\]                                     │

│                                (Email / Phone \+ Password)                                   │

│                                              │                                              │

│                                              ▼                                              │

│                                  POST /api/auth/login                                       │

│                       (Normalize Email to Lowercase, Trim, Bcrypt)                          │

│                                              │                                              │

│                                              ▼                                              │

│                            ┌─────────────────┴─────────────────┐                            │

│                            ▼                                   ▼                            │

│                      Buyer Account                       Seller Account                     │

│                            │                                   │                            │

│                   \[Merge Guest Cart\]                \[Verify KYC & Active\]                   │

│               (Local \-\> DB cart\_items)                         │                            │

│                            │                         ┌─────────┴─────────┐                  │

│                            ▼                         ▼                   ▼                  │

│                   Redirect: /buyer/home       Verified: /seller/dash   Pending: /seller/onb │

│                                                                                             │

└─────────────────────────────────────────────────────────────────────────────────────────────┘

---

### 2.1. Key Authentication Loopholes & Verified Solutions

#### AUTH-01: Intelligent Role-Based Redirection

* **Problem:** In `auth/login.html`, successful logins hardcoded `window.location.href = '/buyer/home.html'`, forcing artisans and admins to manually edit their browser URLs to reach their respective portals.  
* **Solution:** Implemented `redirectUserByRole()`:  
  - **Buyers:** Redirected to `/buyer/home.html` (or validated `?redirect=` return URL).  
  - **Sellers:** Checked `is_onboarded` and KYC status $\\rightarrow$ redirected to `/seller/dashboard.html` (or `/seller/onboarding.html` if incomplete).  
  - **Admins:** Redirected to `/admin/dashboard.html`.

---

#### AUTH-02: Storage Key Synchronization

* **Problem:** Different scripts checked disparate keys: `auth.js` stored `auth_token`, `adminApiClient.js` looked for `token`, and checkout looked for `jwt`. This mismatch triggered immediate session drops and infinite login redirect loops.  
* **Solution:** Unified all authentication storage into a single standard wrapper:  
    
  // frontend/src/utils/auth.js  
    
  export const TOKEN\_KEY \= 'tohfa\_auth\_token';  
    
  export const USER\_KEY \= 'tohfa\_user\_data';  
    
  export const authStorage \= {  
    
    getToken: () \=\> localStorage.getItem(TOKEN\_KEY),  
    
    setToken: (token) \=\> localStorage.setItem(TOKEN\_KEY, token),  
    
    clear: () \=\> {  
    
      localStorage.removeItem(TOKEN\_KEY);  
    
      localStorage.removeItem(USER\_KEY);  
    
    },  
    
    getUser: () \=\> {  
    
      try {  
    
        return JSON.parse(localStorage.getItem(USER\_KEY) || 'null');  
    
      } catch {  
    
        return null;  
    
      }  
    
    },  
    
    setUser: (user) \=\> localStorage.setItem(USER\_KEY, JSON.stringify(user))  
    
  };

---

#### AUTH-03: Atomic Seller Registration & Profile Initialization

* **Problem:** Registering via `signup-seller.html` inserted a record into `users` with `role: 'seller'`, but failed to create a corresponding record in `sellers`. When the artisan logged in, `sellerOnly` middleware failed with `404 Seller Profile Not Found`, locking them out.  
* **Solution:** Wrapped seller signup in an atomic database transaction:  
    
  // backend/src/controllers/auth.controller.js  
    
  exports.signupSeller \= async (req, res, next) \=\> {  
    
    const client \= await db.getClient();  
    
    try {  
    
      await client.query('BEGIN');  
    
      const { name, email, phone, password, storeName, craftSpecialty } \= req.body;  
    
      const normalizedEmail \= email.toLowerCase().trim();  
    
      const passwordHash \= await bcrypt.hash(password, 10);  
    
      const storeSlug \= storeName.toLowerCase().replace(/\[^a-z0-9\]+/g, '-') \+ '-' \+ Date.now();  
    
      // 1\. Create User Row  
    
      const userRes \= await client.query(  
    
        \`INSERT INTO users (name, email, phone, password\_hash, role)  
    
         VALUES ($1, $2, $3, $4, 'seller') RETURNING id, name, email, role\`,  
    
        \[name, normalizedEmail, phone, passwordHash\]  
    
      );  
    
      const user \= userRes.rows\[0\];  
    
      // 2\. Initialize Seller Profile Row  
    
      await client.query(  
    
        \`INSERT INTO sellers (user\_id, store\_name, slug, bio, verification\_status, is\_active)  
    
         VALUES ($1, $2, $3, $4, 'pending\_verification', true)\`,  
    
        \[user.id, storeName, storeSlug, \`Artisan specializing in ${craftSpecialty || 'handcrafted gifts'}\`\]  
    
      );  
    
      await client.query('COMMIT');  
    
      const token \= generateJWT(user);  
    
      return res.status(201).json({  
    
        success: true,  
    
        message: 'Seller registered successfully. Please complete store onboarding.',  
    
        data: { token, user }  
    
      });  
    
    } catch (err) {  
    
      await client.query('ROLLBACK');  
    
      next(err);  
    
    } finally {  
    
      client.release();  
    
    }  
    
  };

---

#### AUTH-04: Case-Insensitive Email Normalization & Indian Phone Sanitization

* **Problem:** `Aarav.Sharma@gmail.com` on signup failed to match `aarav.sharma@gmail.com` on login due to case-sensitive `VARCHAR` comparisons. Unsanitized phone variations (`+91 98765 43210` vs `09876543210`) triggered unhandled 500 server crashes.  
* **Solution:** All auth queries now enforce `LOWER(TRIM(email))`, and phone numbers are normalized to standard 10 digits (`^[6-9]\d{9}$`).

---

#### AUTH-05: Automated Guest-to-Authenticated Cart Migration

* **Problem:** Items added to cart by guest users in `localStorage` vanished upon logging in.  
* **Solution:** Immediately after successful login in `auth.js`, the frontend transmits guest items to `POST /api/cart/merge`, idempotently inserting them into the user's database `cart_items` before redirecting.

---

#### AUTH-06: Admin Login Boundary Isolation

* **Problem:** `admin/login.html` called the generic login endpoint, allowing buyers to authenticate and attempt rendering admin panels with broken queries.  
* **Solution:** Created a dedicated `POST /api/auth/admin-login` endpoint that validates `user.role === 'admin' || user.role === 'master_admin'` and returns `403 Forbidden` for non-admin accounts.

---

## 3\. Core Architecture & Backend Logic Loopholes

---

### 3.1. Razorpay Webhook & Payment Idempotency

* **Vulnerability:** Simultaneous execution of frontend verification (`/api/payment/verify`) and Razorpay webhooks (`payment.captured`) caused double inventory decrements and duplicate customer emails.  
* **Solution:** Database row-level locking (`SELECT ... FOR UPDATE`) in `payment.service.js`:  
    
  async function markOrderPaid(orderId, paymentDetails, client) {  
    
    const orderRes \= await client.query(  
    
      'SELECT status FROM orders WHERE id \= $1 FOR UPDATE',  
    
      \[orderId\]  
    
    );  
    
    if (orderRes.rows.length \=== 0\) throw new Error('Order not found');  
    
      
    
    // Guard against duplicate execution  
    
    if (\['confirmed', 'processing', 'packed', 'shipped'\].includes(orderRes.rows\[0\].status)) {  
    
      return { alreadyProcessed: true };  
    
    }  
    
    await client.query(  
    
      \`UPDATE orders   
    
       SET status \= 'confirmed', payment\_status \= 'paid', payment\_id \= $2, updated\_at \= NOW()   
    
       WHERE id \= $1\`,  
    
      \[orderId, paymentDetails.razorpay\_payment\_id\]  
    
    );  
    
    // Atomically decrement inventory  
    
    await client.query(  
    
      \`UPDATE products p  
    
       SET stock\_quantity \= p.stock\_quantity \- oi.quantity  
    
       FROM order\_items oi  
    
       WHERE oi.order\_id \= $1 AND p.id \= oi.product\_id\`,  
    
      \[orderId\]  
    
    );  
    
    return { alreadyProcessed: false };  
    
  }

---

### 3.2. Multi-Vendor Sub-Orders Architecture

* **Vulnerability:** When a buyer purchased items from multiple artisans in one checkout, the monolithic `orders` record allowed artisans to see items, buyers, and revenue belonging to other vendors. iThink Logistics could not generate multi-origin pickups.  
* **Solution:** Parent orders are automatically split into vendor-isolated `seller_orders`:  
    
  CREATE TABLE seller\_orders (  
    
      id SERIAL PRIMARY KEY,  
    
      order\_id INT REFERENCES orders(id) ON DELETE CASCADE,  
    
      seller\_id INT REFERENCES sellers(id) ON DELETE RESTRICT,  
    
      subtotal NUMERIC(10,2) NOT NULL,  
    
      shipping\_fee NUMERIC(10,2) DEFAULT 0.00,  
    
      platform\_commission NUMERIC(10,2) DEFAULT 0.00,  
    
      seller\_payout\_amount NUMERIC(10,2) NOT NULL,  
    
      status VARCHAR(50) DEFAULT 'order\_placed',  
    
      awb\_number VARCHAR(100),  
    
      courier\_name VARCHAR(100),  
    
      tracking\_url TEXT,  
    
      payout\_status VARCHAR(50) DEFAULT 'unsettled',  
    
      created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()  
    
  );

---

### 3.3. Customization Proof-of-Work Loop

* **Vulnerability:** Artisans had no way to upload sample mockups or portrait proofs for customer approval before starting physical creation.  
* **Solution:** Introduced a 5-step personalization lifecycle: $$\\text{Pending Review} \\longrightarrow \\text{Proof Uploaded by Seller} \\longrightarrow \\text{Buyer Approved} \\longrightarrow \\text{In Crafting} \\longrightarrow \\text{Shipped}$$

---

### 3.4. Dynamic iThink Logistics Multi-Origin Pickups

* **Vulnerability:** Logistics bookings used a single global warehouse address from `.env`.  
* **Solution:** Passed each artisan's verified `sellers.pickup_address` dynamically during AWB generation.

---

### 3.5. Tanya AI Inventory Grounding (Gemini RAG)

* **Vulnerability:** Open prompts caused the AI gifting assistant to recommend products not sold on Tohfa.  
* **Solution:** Active catalog inventory is injected directly into Gemini system instructions, restricting recommendations to verified live products.

---

## 4\. Admin Governance & Tohfa Specials Engine

---

### 4.1. Complete Removal of the UI Settings Tab

* **Action Taken:** `frontend/src/admin/ui-settings.html` has been permanently deleted, sidebar navigation links in `AdminSidebar.js` removed, router handlers in `adminLayout.js` excised, and backend routes dropped from `admin.routes.js`.

---

### 4.2. "Tohfa Specials" (Tohfa Originals) Implementation

Tohfa Specials represents platform-curated, quality-guaranteed signature handcrafted items:

1. **Certified Quality Badge:** ✨ Gold *"Tohfa Original"* badge displayed across product cards and detail pages.  
2. **Search Priority Ranking:** Configurable ranking boost (`priority_rank` integer 1–100).  
3. **Signature Packaging:** Option for custom wax-sealed gift packaging.  
4. **Admin Direct Control:** Managed via `frontend/src/admin/tohfa-originals.html` calling `PATCH /api/admin/tohfa-specials/:productId`.

---

### 4.3. Master Admin Control Endpoints

POST   /api/admin/sellers/:id/kyc          \-\> Approve/reject artisan KYC & override commission %

PATCH  /api/admin/sellers/:id/suspend      \-\> Suspend store & unpublish products

PATCH  /api/admin/tohfa-specials/:id       \-\> Toggle Tohfa Special badge, rank & packaging

POST   /api/admin/orders/:id/refund        \-\> Execute instant refund via Razorpay Refund API

PATCH  /api/admin/orders/:id/force-status  \-\> Emergency order status override

POST   /api/admin/payouts/:id/disburse     \-\> Record UTR number & disburse seller funds

PATCH  /api/admin/users/:id/status         \-\> Ban or reactivate buyer accounts

GET    /api/admin/audit-logs               \-\> Fetch immutable action history (Admin, Action, IP, Time)

---

## 5\. Frontend UI Bugs & Empty-State Handling

### 5.1. Universal Empty State Component (`frontend/src/js/utils.js`)

To prevent fatal `TypeError: Cannot read properties of undefined (reading 'map')` when backend returns empty lists, all views now route through `renderEmptyState()`:

// frontend/src/js/utils.js

export function renderEmptyState({

  containerId,

  icon \= '🎁',

  title \= 'Nothing Found Here',

  description \= 'There are no items to display at this moment.',

  actionText \= 'Explore Marketplace',

  actionHref \= '/buyer/home.html',

  theme \= 'amber'

}) {

  const container \= document.getElementById(containerId);

  if (\!container) return;

  const bgColors \= {

    amber: 'bg-amber-50 text-amber-900',

    rose: 'bg-rose-50 text-rose-600',

    stone: 'bg-stone-100 text-stone-700'

  };

  container.innerHTML \= \`

    \<div class="col-span-full w-full flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in"\>

      \<div class="w-20 h-20 ${bgColors\[theme\] || bgColors.amber} rounded-full flex items-center justify-center mb-4 text-3xl shadow-inner"\>

        ${icon}

      \</div\>

      \<h3 class="text-xl md:text-2xl font-serif font-semibold text-stone-800 mb-2"\>${title}\</h3\>

      \<p class="text-stone-500 max-w-md text-sm mb-6 leading-relaxed"\>${description}\</p\>

      ${actionText && actionHref ? \`

        \<a href="${actionHref}" class="inline-flex items-center gap-2 px-6 py-2.5 bg-stone-900 text-amber-50 rounded-full font-medium text-sm hover:bg-stone-800 transition shadow-sm hover:shadow"\>

          ${actionText} \&rarr;

        \</a\>

      \` : ''}

    \</div\>

  \`;

}

---

### 5.2. Verified UI Bug Fixes

* **Notifications (`notifications.js`):** Added safe array guard `Array.isArray(data) ? data : data?.notifications || []` preventing crashes on 0 notifications.  
* **Wishlist (`wishlist.js`):** Dynamic empty card rendered when saved items list reaches 0\.  
* **Cart (`cart.js`):** Subtotal `.reduce()` guarded against empty items; checkout button disabled on 0 items.  
* **Product Rating (`product.js`):** Average rating calculation checks for zero reviews, rendering `✨ New Artisan Listing` instead of `NaN`.  
* **Navbar Search (`search.js`):** Unified query parameter parsing to handle both `?q=` and `?search=`.  
* **Chart.js Zero-Data (`seller/dashboard.js`, `analytics.html`):** Calls `chartInstance.destroy()` and displays placeholder overlay when sales points are empty.

---

## 6\. Unified Frontend API Client (`frontend/src/utils/apiClient.js`)

// frontend/src/utils/apiClient.js

const API\_BASE\_URL \= '/api';

export async function apiRequest(endpoint, options \= {}) {

  const token \= localStorage.getItem('tohfa\_auth\_token');

  const headers \= {

    'Content-Type': 'application/json',

    ...(token ? { 'Authorization': \`Bearer ${token}\` } : {}),

    ...options.headers

  };

  try {

    const response \= await fetch(\`${API\_BASE\_URL}${endpoint}\`, { ...options, headers });

    

    if (response.status \=== 401\) {

      localStorage.removeItem('tohfa\_auth\_token');

      localStorage.removeItem('tohfa\_user\_data');

      const currentPath \= window.location.pathname;

      if (\!currentPath.includes('/auth/')) {

        window.location.href \= \`/auth/login.html?redirect=${encodeURIComponent(currentPath)}\`;

      }

      return null;

    }

    const json \= await response.json().catch(() \=\> ({}));

    if (\!response.ok) {

      throw new Error(json.message || \`Request failed with status ${response.status}\`);

    }

    // Automatically unwrap standardized data wrapper

    return json.data \!== undefined ? json.data : json;

  } catch (error) {

    console.error(\`API Error on \[${options.method || 'GET'} ${endpoint}\]:\`, error);

    throw error;

  }

}

export const api \= {

  get: (url, opts) \=\> apiRequest(url, { method: 'GET', ...opts }),

  post: (url, body, opts) \=\> apiRequest(url, { method: 'POST', body: JSON.stringify(body), ...opts }),

  put: (url, body, opts) \=\> apiRequest(url, { method: 'PUT', body: JSON.stringify(body), ...opts }),

  patch: (url, body, opts) \=\> apiRequest(url, { method: 'PATCH', body: JSON.stringify(body), ...opts }),

  delete: (url, opts) \=\> apiRequest(url, { method: 'DELETE', ...opts })

};

---

## 7\. Master Database Relational Schema (`backend/src/db/schema.sql`)

\-- TOHFA MASTER PRODUCTION SCHEMA (PostgreSQL)

\-- 1\. USERS & AUTH

CREATE TABLE users (

    id SERIAL PRIMARY KEY,

    name VARCHAR(150) NOT NULL,

    email VARCHAR(255) UNIQUE NOT NULL,

    phone VARCHAR(20) UNIQUE,

    password\_hash VARCHAR(255) NOT NULL,

    role VARCHAR(20) DEFAULT 'buyer' CHECK (role IN ('buyer', 'seller', 'admin', 'master\_admin')),

    is\_active BOOLEAN DEFAULT TRUE,

    reset\_password\_token VARCHAR(255),

    reset\_password\_expires TIMESTAMP WITH TIME ZONE,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    updated\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

\-- 2\. BUYER SAVED ADDRESSES

CREATE TABLE user\_addresses (

    id SERIAL PRIMARY KEY,

    user\_id INT REFERENCES users(id) ON DELETE CASCADE,

    recipient\_name VARCHAR(150) NOT NULL,

    phone VARCHAR(20) NOT NULL,

    address\_line1 TEXT NOT NULL,

    address\_line2 TEXT,

    landmark VARCHAR(150),

    city VARCHAR(100) NOT NULL,

    state VARCHAR(100) NOT NULL,

    pincode VARCHAR(10) NOT NULL,

    address\_type VARCHAR(20) DEFAULT 'home' CHECK (address\_type IN ('home', 'office', 'other')),

    is\_default BOOLEAN DEFAULT FALSE,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

\-- 3\. SELLERS & ARTISAN PROFILES

CREATE TABLE sellers (

    id SERIAL PRIMARY KEY,

    user\_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,

    store\_name VARCHAR(200) NOT NULL,

    slug VARCHAR(200) UNIQUE NOT NULL,

    bio TEXT,

    logo\_url TEXT,

    banner\_url TEXT,

    pickup\_address JSONB NOT NULL,

    bank\_details JSONB,

    commission\_rate NUMERIC(5,2) DEFAULT 10.00,

    verification\_status VARCHAR(50) DEFAULT 'pending\_verification' CHECK (verification\_status IN ('pending\_verification', 'verified', 'rejected', 'suspended')),

    is\_active BOOLEAN DEFAULT TRUE,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

\-- 4\. CATEGORIES

CREATE TABLE categories (

    id SERIAL PRIMARY KEY,

    name VARCHAR(100) NOT NULL,

    slug VARCHAR(100) UNIQUE NOT NULL,

    image\_url TEXT,

    is\_featured BOOLEAN DEFAULT FALSE,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

\-- 5\. PRODUCTS & PERSONALIZATION RULES

CREATE TABLE products (

    id SERIAL PRIMARY KEY,

    seller\_id INT REFERENCES sellers(id) ON DELETE CASCADE,

    category\_id INT REFERENCES categories(id) ON DELETE RESTRICT,

    name VARCHAR(255) NOT NULL,

    slug VARCHAR(255) UNIQUE NOT NULL,

    description TEXT,

    base\_price NUMERIC(10,2) NOT NULL,

    stock\_quantity INT DEFAULT 0,

    preparation\_days INT DEFAULT 2 CHECK (preparation\_days \>= 0),

    weight\_grams INT DEFAULT 500 CHECK (weight\_grams \> 0),

    is\_customizable BOOLEAN DEFAULT FALSE,

    customization\_schema JSONB DEFAULT '{}',

    images TEXT\[\] NOT NULL DEFAULT '{}',

    is\_active BOOLEAN DEFAULT TRUE,

    is\_tohfa\_original BOOLEAN DEFAULT FALSE,

    tohfa\_special\_badge VARCHAR(100) DEFAULT NULL,

    priority\_rank INT DEFAULT 0,

    special\_packaging\_available BOOLEAN DEFAULT TRUE,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    updated\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

\-- 6\. PERSISTENT SHOPPING CART

CREATE TABLE carts (

    id SERIAL PRIMARY KEY,

    user\_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    updated\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

CREATE TABLE cart\_items (

    id SERIAL PRIMARY KEY,

    cart\_id INT REFERENCES carts(id) ON DELETE CASCADE,

    product\_id INT REFERENCES products(id) ON DELETE CASCADE,

    quantity INT NOT NULL DEFAULT 1 CHECK (quantity \> 0),

    customization\_payload JSONB DEFAULT '{}',

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

\-- 7\. COUPONS & PROMOTIONS

CREATE TABLE coupons (

    id SERIAL PRIMARY KEY,

    code VARCHAR(50) UNIQUE NOT NULL,

    discount\_type VARCHAR(20) NOT NULL CHECK (discount\_type IN ('percentage', 'flat')),

    discount\_value NUMERIC(10,2) NOT NULL CHECK (discount\_value \> 0),

    min\_order\_amount NUMERIC(10,2) DEFAULT 0.00,

    max\_discount\_amount NUMERIC(10,2),

    usage\_limit\_per\_user INT DEFAULT 1,

    times\_used INT DEFAULT 0,

    starts\_at TIMESTAMP WITH TIME ZONE NOT NULL,

    expires\_at TIMESTAMP WITH TIME ZONE NOT NULL,

    is\_active BOOLEAN DEFAULT TRUE,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

\-- 8\. PARENT ORDERS (Payment & Invoice Level)

CREATE TABLE orders (

    id SERIAL PRIMARY KEY,

    user\_id INT REFERENCES users(id) ON DELETE RESTRICT,

    total\_amount NUMERIC(10,2) NOT NULL,

    discount\_amount NUMERIC(10,2) DEFAULT 0.00,

    shipping\_amount NUMERIC(10,2) DEFAULT 0.00,

    coupon\_id INT REFERENCES coupons(id) ON DELETE SET NULL,

    payment\_method VARCHAR(50) DEFAULT 'razorpay',

    payment\_status VARCHAR(50) DEFAULT 'pending' CHECK (payment\_status IN ('pending', 'paid', 'failed', 'refunded')),

    payment\_id VARCHAR(100),

    razorpay\_order\_id VARCHAR(100),

    shipping\_address JSONB NOT NULL,

    cancellation\_reason TEXT,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    updated\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

\-- 9\. SELLER SUB-ORDERS (Fulfillment Level)

CREATE TABLE seller\_orders (

    id SERIAL PRIMARY KEY,

    order\_id INT REFERENCES orders(id) ON DELETE CASCADE,

    seller\_id INT REFERENCES sellers(id) ON DELETE RESTRICT,

    subtotal NUMERIC(10,2) NOT NULL,

    shipping\_fee NUMERIC(10,2) DEFAULT 0.00,

    platform\_commission NUMERIC(10,2) DEFAULT 0.00,

    seller\_payout\_amount NUMERIC(10,2) NOT NULL,

    status VARCHAR(50) DEFAULT 'order\_placed' CHECK (status IN ('order\_placed', 'crafting', 'packed', 'shipped', 'delivered', 'cancelled', 'returned')),

    awb\_number VARCHAR(100),

    courier\_name VARCHAR(100),

    tracking\_url TEXT,

    payout\_status VARCHAR(50) DEFAULT 'unsettled' CHECK (payout\_status IN ('unsettled', 'holding', 'eligible', 'paid')),

    delivered\_at TIMESTAMP WITH TIME ZONE,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

\-- 10\. ORDER ITEMS & CUSTOMIZATION SNAPSHOT

CREATE TABLE order\_items (

    id SERIAL PRIMARY KEY,

    seller\_order\_id INT REFERENCES seller\_orders(id) ON DELETE CASCADE,

    product\_id INT REFERENCES products(id) ON DELETE RESTRICT,

    quantity INT NOT NULL CHECK (quantity \> 0),

    unit\_price NUMERIC(10,2) NOT NULL,

    customization\_details JSONB DEFAULT '{}',

    customization\_status VARCHAR(50) DEFAULT 'none' CHECK (customization\_status IN ('none', 'pending\_proof', 'proof\_uploaded', 'buyer\_approved', 'in\_crafting')),

    proof\_image\_url TEXT,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

\-- 11\. OCCASIONS & REMINDERS

CREATE TABLE occasions (

    id SERIAL PRIMARY KEY,

    user\_id INT REFERENCES users(id) ON DELETE CASCADE,

    title VARCHAR(150) NOT NULL,

    recipient\_name VARCHAR(150),

    occasion\_date DATE NOT NULL,

    reminder\_days\_before INT DEFAULT 7,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

\-- 12\. WISHLIST

CREATE TABLE wishlists (

    id SERIAL PRIMARY KEY,

    user\_id INT REFERENCES users(id) ON DELETE CASCADE,

    product\_id INT REFERENCES products(id) ON DELETE CASCADE,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user\_id, product\_id)

);

\-- 13\. REVIEWS & RATINGS (Verified Purchases Only)

CREATE TABLE reviews (

    id SERIAL PRIMARY KEY,

    product\_id INT REFERENCES products(id) ON DELETE CASCADE,

    user\_id INT REFERENCES users(id) ON DELETE CASCADE,

    rating INT NOT NULL CHECK (rating \>= 1 AND rating \<= 5),

    comment TEXT,

    images TEXT\[\] DEFAULT '{}',

    seller\_reply TEXT,

    seller\_replied\_at TIMESTAMP WITH TIME ZONE,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(product\_id, user\_id)

);

\-- 14\. SELLER PAYOUTS

CREATE TABLE seller\_payouts (

    id SERIAL PRIMARY KEY,

    seller\_id INT REFERENCES sellers(id) ON DELETE RESTRICT,

    amount NUMERIC(10,2) NOT NULL,

    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed')),

    utr\_number VARCHAR(100),

    disbursed\_at TIMESTAMP WITH TIME ZONE,

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

\-- 15\. IMMUTABLE AUDIT LOGS

CREATE TABLE audit\_logs (

    id SERIAL PRIMARY KEY,

    admin\_id INT REFERENCES users(id) ON DELETE SET NULL,

    action\_type VARCHAR(100) NOT NULL,

    target\_entity VARCHAR(100) NOT NULL,

    target\_id VARCHAR(100) NOT NULL,

    details JSONB DEFAULT '{}',

    ip\_address VARCHAR(50),

    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);

---

## 8\. Final Pre-Flight Deployment Checklist

1. **Mount All Express Routes (`backend/server.js`):** Ensure `auth.routes`, `buyer.routes`, `seller.routes`, `admin.routes`, `product.routes`, `cart.routes`, `order.routes`, `payment.routes`, and `coupon.routes` are registered.  
2. **Execute Database Migrations:** Run `schema.sql` (or sequential migrations `002` through `005`).  
3. **Include Razorpay SDK:** Verify `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>` in `frontend/src/buyer/checkout.html`.  
4. **iThink Dynamic Pincode Integration:** Verify that `logistics.service.js` dispatches pickups using each artisan's `sellers.pickup_address`.

