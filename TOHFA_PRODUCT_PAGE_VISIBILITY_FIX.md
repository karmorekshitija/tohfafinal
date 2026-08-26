# TOHFA E-COMMERCE PLATFORM (thetohfa.in)

## Product Page Visibility & "Product Not Found" Bug Fix Guide

---

## 1\. Executive Summary & Root Cause Analysis

### The Issue

When opening or clicking through to `buyer/product.html`, users encounter a **"Product Not Found"** error card:

> *"The product you're looking for might have been removed, deactivated, or does not exist."*

### Why This Happens (The 4 Failure Points)

1. **Empty Query Parameter in Direct Navbar Links:**  
   * In `tohfa-navbar.html`, the top navigation bar contains a standalone link to `<a href="/buyer/product.html">PRODUCT</a>`.  
   * Since product pages are dynamic detail views that strictly require a specific item ID (`?id=123`) or slug (`?slug=ceramic-pot`), clicking "PRODUCT" from the header navigates to `/buyer/product.html` with an empty `location.search`.  
   * `product.js` reads `urlParams.get('id')` $\\rightarrow$ evaluates to `null` $\\rightarrow$ calls `api.get('/products/null')` $\\rightarrow$ backend returns `404` $\\rightarrow$ renders the error screen.  
2. **Query Parameter Name Inconsistency Across Pages:**  
   * Homepage product cards link to `?id=X`.  
   * Category page product cards link to `?slug=X` or `?productId=X`.  
   * `product.js` was previously only reading `urlParams.get('id')`.  
3. **Backend SQL Type Mismatch on String Slugs:**  
   * In `product.controller.js`, the query `SELECT * FROM products WHERE id = $1` treats `$1` as integer. Passing a text slug (e.g. `/api/products/terracotta-vase`) throws PostgreSQL syntax error `22P02: invalid input syntax for type integer`.  
4. **Response Payload Unwrapping Discrepancy:**  
   * If the API returns `{ success: true, data: { ... } }`, but `product.js` looks for `res.product` or raw `res`, `product` evaluates to `undefined` and triggers `showProductNotFound()`.

---

## 2\. Code Changes & Step-by-Step Fixes

---

### Step 1: Update Frontend Navbar (`frontend/src/components/tohfa-navbar.html` & `frontend/public/components/tohfa-navbar.html`)

Remove the standalone "PRODUCT" link from the main navigation. Navbars must only point to index/collection pages:

\<\!-- frontend/src/components/tohfa-navbar.html \--\>

\<header class="sticky top-0 z-50 bg-stone-900 text-stone-100 shadow-md border-b border-stone-800"\>

  \<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between"\>

    

    \<\!-- Brand Logo \--\>

    \<a href="/buyer/home.html" class="flex items-center gap-2"\>

      \<span class="text-2xl font-serif font-bold text-amber-50 tracking-tight"\>Tohfa\<span class="text-amber-500"\>.\</span\>\</span\>

    \</a\>

    \<\!-- Main Navigation Links (Point to collections, NOT empty product detail) \--\>

    \<nav class="hidden md:flex items-center space-x-8 text-sm font-medium"\>

      \<a href="/buyer/home.html" class="text-stone-300 hover:text-amber-400 transition flex items-center gap-1.5"\>

        \<span\>🏠\</span\> Home

      \</a\>

      \<a href="/buyer/categories.html" class="text-stone-300 hover:text-amber-400 transition flex items-center gap-1.5"\>

        \<span\>🏷️\</span\> Categories

      \</a\>

      \<a href="/buyer/home.html\#tohfa-specials" class="text-amber-300 hover:text-amber-200 transition flex items-center gap-1.5"\>

        \<span\>✨\</span\> Tohfa Specials

      \</a\>

      \<a href="/buyer/zip-gift.html" class="text-stone-300 hover:text-amber-400 transition flex items-center gap-1.5"\>

        \<span\>⚡\</span\> ZipGift

      \</a\>

      \<a href="/buyer/occasions.html" class="text-stone-300 hover:text-amber-400 transition flex items-center gap-1.5"\>

        \<span\>📅\</span\> Occasions

      \</a\>

    \</nav\>

    \<\!-- Header Actions (Search, Wishlist, Cart, Profile) \--\>

    \<div class="flex items-center space-x-5"\>

      \<button id="nav-search-btn" class="text-stone-300 hover:text-white transition"\>🔍\</button\>

      \<a href="/buyer/wishlist.html" class="text-stone-300 hover:text-rose-400 transition relative"\>

        \<span\>❤️\</span\>

        \<span id="nav-wishlist-count" class="hidden absolute \-top-1.5 \-right-2 bg-rose-600 text-white text-\[10px\] w-4 h-4 rounded-full flex items-center justify-center font-bold"\>0\</span\>

      \</a\>

      \<a href="/buyer/cart.html" class="text-stone-300 hover:text-amber-400 transition relative"\>

        \<span\>🛒\</span\>

        \<span id="nav-cart-count" class="hidden absolute \-top-1.5 \-right-2 bg-amber-600 text-white text-\[10px\] w-4 h-4 rounded-full flex items-center justify-center font-bold"\>0\</span\>

      \</a\>

      \<a href="/buyer/profile.html" class="text-stone-300 hover:text-white transition"\>👤\</a\>

    \</div\>

  \</div\>

\</header\>

---

### Step 2: Refactor Product Detail Script (`frontend/src/buyer/product.js`)

Add fallback redirection if no parameter exists, support multiple parameter keys (`id`, `productId`, `slug`), and safely unwrap API responses:

// frontend/src/buyer/product.js

import { api } from '../js/api.js';

import { renderEmptyState } from '../js/utils.js';

let currentProduct \= null;

document.addEventListener('DOMContentLoaded', async () \=\> {

  const urlParams \= new URLSearchParams(window.location.search);

  

  // 1\. Accept any standard parameter name

  const identifier \= urlParams.get('id') || urlParams.get('productId') || urlParams.get('slug');

  // 2\. If no parameter is provided, gracefully redirect to catalog instead of showing error

  if (\!identifier || identifier \=== 'null' || identifier \=== 'undefined') {

    window.location.replace('/buyer/categories.html');

    return;

  }

  await loadProduct(identifier);

});

async function loadProduct(identifier) {

  const container \= document.getElementById('product-detail-container');

  const errorContainer \= document.getElementById('product-not-found-container');

  try {

    const response \= await api.get(\`/products/${encodeURIComponent(identifier)}\`);

    

    // Universal safe payload unwrapper

    const product \= response?.data || response?.product || response;

    if (\!product || (\!product.id && \!product.slug)) {

      throw new Error('Product not found in catalog.');

    }

    currentProduct \= product;

    // Show content, hide error

    if (container) container.classList.remove('hidden');

    if (errorContainer) errorContainer.classList.add('hidden');

    renderProductUI(product);

  } catch (error) {

    console.error('Failed to load product:', error);

    if (container) container.classList.add('hidden');

    if (errorContainer) {

      errorContainer.classList.remove('hidden');

      renderEmptyState({

        containerId: 'product-not-found-container',

        icon: '🎁',

        title: 'Product Not Found',

        description: 'The handcrafted item you are looking for might have been removed, deactivated, or does not exist.',

        actionText: 'Back to Browse',

        actionHref: '/buyer/categories.html',

        theme: 'amber'

      });

    }

  }

}

function renderProductUI(product) {

  // Update document title

  document.title \= \`${product.name} | Tohfa Handcrafted Gifts\`;

  // Breadcrumbs

  document.getElementById('breadcrumb-category').textContent \= product.category\_name || 'Handcrafted';

  document.getElementById('breadcrumb-category').href \= \`/buyer/category.html?id=${product.category\_id || ''}\`;

  document.getElementById('breadcrumb-product').textContent \= product.name;

  // Title, Artisan, & Pricing

  document.getElementById('product-title').textContent \= product.name;

  document.getElementById('artisan-name').textContent \= product.store\_name || 'Verified Artisan';

  document.getElementById('artisan-link').href \= \`/buyer/seller-profile.html?id=${product.seller\_id}\`;

  document.getElementById('product-price').textContent \= \`₹${Number(product.base\_price).toLocaleString('en-IN')}\`;

  document.getElementById('product-description').textContent \= product.description;

  // Special Gold Badge for Tohfa Originals

  const badgeContainer \= document.getElementById('product-badge-container');

  if (badgeContainer) {

    if (product.is\_tohfa\_original) {

      badgeContainer.innerHTML \= \`

        \<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 border border-amber-300 text-amber-900 rounded-full text-xs font-semibold tracking-wide shadow-sm"\>

          ✨ Tohfa Original ${product.tohfa\_special\_badge ? \`• ${product.tohfa\_special\_badge}\` : ''}

        \</span\>

      \`;

      badgeContainer.classList.remove('hidden');

    } else {

      badgeContainer.classList.add('hidden');

    }

  }

  // Stock Status

  const stockBadge \= document.getElementById('stock-status');

  if (stockBadge) {

    if (product.stock\_quantity \> 0\) {

      stockBadge.textContent \= 'In Stock • Ready to Ship';

      stockBadge.className \= 'text-xs text-emerald-700 font-medium';

    } else {

      stockBadge.textContent \= 'Made to Order';

      stockBadge.className \= 'text-xs text-amber-700 font-medium';

    }

  }

  // Media Gallery Images

  const mainImage \= document.getElementById('main-product-image');

  const thumbsContainer \= document.getElementById('thumbnail-images');

  const images \= Array.isArray(product.images) && product.images.length \> 0 

    ? product.images 

    : \['/public/img/placeholder-product.png'\];

  if (mainImage) mainImage.src \= images\[0\];

  if (thumbsContainer) {

    thumbsContainer.innerHTML \= images.map((img, idx) \=\> \`

      \<button onclick="document.getElementById('main-product-image').src='${img}'" class="w-16 h-16 rounded-lg overflow-hidden border-2 border-transparent hover:border-amber-800 transition"\>

        \<img src="${img}" alt="${product.name}" class="w-full h-full object-cover"\>

      \</button\>

    \`).join('');

  }

  // Reviews & Rating Protection (Zero-Review NaN Guard)

  const reviews \= product.reviews || \[\];

  const ratingEl \= document.getElementById('product-rating-summary');

  if (ratingEl) {

    if (reviews.length \> 0\) {

      const avg \= (reviews.reduce((acc, r) \=\> acc \+ r.rating, 0\) / reviews.length).toFixed(1);

      ratingEl.innerHTML \= \`⭐ \<span class="font-bold text-stone-800"\>${avg}\</span\> \<span class="text-stone-400"\>(${reviews.length} reviews)\</span\>\`;

    } else {

      ratingEl.innerHTML \= \`\<span class="text-xs bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-full font-medium"\>✨ New Artisan Listing\</span\>\`;

    }

  }

  // Customization CTA Button State

  const actionBtnContainer \= document.getElementById('product-action-buttons');

  if (actionBtnContainer) {

    if (product.is\_customizable) {

      actionBtnContainer.innerHTML \= \`

        \<a href="/buyer/customization-form.html?productId=${product.id}" class="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-amber-900 text-amber-50 hover:bg-amber-800 rounded-full font-medium text-sm transition shadow-md"\>

          \<span\>✍️\</span\> Personalize This Gift

        \</a\>

      \`;

    } else {

      actionBtnContainer.innerHTML \= \`

        \<button id="add-to-cart-btn" class="w-full py-3.5 px-6 bg-stone-900 text-amber-50 hover:bg-stone-800 rounded-full font-medium text-sm transition shadow-md"\>

          Add to Cart

        \</button\>

      \`;

      document.getElementById('add-to-cart-btn')?.addEventListener('click', () \=\> addToCart(product.id));

    }

  }

}

async function addToCart(productId) {

  try {

    await api.post('/cart/items', { productId, quantity: 1 });

    window.location.href \= '/buyer/cart.html';

  } catch (err) {

    console.error('Add to cart failed:', err);

  }

}

---

### Step 3: Backend Controller Dual Identifier Query (`backend/src/controllers/product.controller.js`)

Ensure `getProductById` / `getProductDetail` handles both numeric integer IDs and slug strings:

// backend/src/controllers/product.controller.js

const db \= require('../config/db');

exports.getProductDetail \= async (req, res, next) \=\> {

  try {

    const { id } \= req.params;

    const isNumeric \= /^\\d+$/.test(id);

    // Query supporting ID lookup OR Slug lookup

    const query \= \`

      SELECT 

        p.\*,

        s.store\_name,

        s.slug AS seller\_slug,

        s.bio AS seller\_bio,

        s.logo\_url AS seller\_logo,

        s.verification\_status AS seller\_status,

        c.name AS category\_name,

        c.slug AS category\_slug

      FROM products p

      JOIN sellers s ON s.id \= p.seller\_id

      LEFT JOIN categories c ON c.id \= p.category\_id

      WHERE (p.id \= $1 OR p.slug \= $2) AND p.is\_active \= true

    \`;

    const params \= isNumeric ? \[parseInt(id, 10), id\] : \[-1, id\];

    const result \= await db.query(query, params);

    if (result.rows.length \=== 0\) {

      return res.status(404).json({ 

        success: false, 

        message: 'Product not found or currently inactive.' 

      });

    }

    const product \= result.rows\[0\];

    // Safely attach reviews

    const reviewsRes \= await db.query(\`

      SELECT r.id, r.rating, r.comment, r.images, r.created\_at, u.name AS reviewer\_name

      FROM reviews r

      JOIN users u ON u.id \= r.user\_id

      WHERE r.product\_id \= $1

      ORDER BY r.created\_at DESC

    \`, \[product.id\]);

    product.reviews \= reviewsRes.rows || \[\];

    return res.status(200).json({

      success: true,

      data: product

    });

  } catch (err) {

    next(err);

  }

};

---

### Step 4: Ensure Route Parameter Registration (`backend/src/routes/product.routes.js`)

Verify that the route parameter is registered as `:id`:

// backend/src/routes/product.routes.js

const express \= require('express');

const router \= express.Router();

const productController \= require('../controllers/product.controller');

// Public Product Discovery Endpoints

router.get('/', productController.getProducts);

router.get('/:id', productController.getProductDetail); // Handles /api/products/1 AND /api/products/slug

module.exports \= router;

---

### Step 5: Database Active Status Verification SQL

If testing on your local or DigitalOcean PostgreSQL database, ensure products are marked active:

\-- Run in PostgreSQL to ensure products are visible:

UPDATE products SET is\_active \= TRUE WHERE is\_active IS NULL OR is\_active \= FALSE;

UPDATE sellers SET verification\_status \= 'verified', is\_active \= TRUE WHERE is\_active IS NULL;

---

## 3\. Verification Checklist

1. Navigate to Home (`/buyer/home.html`).  
2. Click any product card $\\rightarrow$ URL navigates to `/buyer/product.html?id=1`.  
3. The page renders full imagery, title, pricing, artisan bio, and customization options without showing "Product Not Found".  
4. Navigating to `/buyer/product.html` directly without params automatically redirects to `/buyer/categories.html`.

