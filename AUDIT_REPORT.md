# Tohfa Full-Codebase Audit Report

Scope: read-only review of the repository at `C:\Users\ACER\OneDrive\Desktop\antigravity_workspace\tohfanew.worktrees\full-codebase-audit-tohfahub`. Source and configuration files were not modified. Findings marked **confirmed** are directly provable from the checked-in code; **suspected** findings require a deployed-environment or database check.

## 1. Summary

| ID | Severity | Status | Finding |
|---|---|---|---|
| CART-01 | P0 | Confirmed | `POST /api/cart` uses `ON CONFLICT (buyer_id, product_id, variant_id)`, but the base schema has no matching unique constraint. On a database created from `schema.sql` alone, add-to-cart fails; the fallback repeats the same invalid conflict target. `backend/src/controllers/cart.controller.js:228-274`, `backend/src/db/schema.sql:317-331`. |
| CART-02 | P1 | Confirmed | Migration `012` adds a three-column unique constraint, but PostgreSQL permits multiple `NULL` `variant_id` values. Repeated adds of a standard product therefore do not upsert and can create duplicate cart rows. `backend/src/db/migrations/012_seller_capacity_social_fields.sql:47-57`. |
| CART-03 | P1 | Confirmed | Add-to-cart accepts any `variant_id` without checking that it belongs to `product_id`, and does not validate variant stock. Order placement adds variant price but checks only `products.stock_quantity`. `backend/src/controllers/cart.controller.js:214-226`; `backend/src/services/order.service.js:141-151`. |
| ROUTE-01 | P1 | Confirmed | Checkout calls `POST /api/orders/overflow`, but no such route is registered. The overflow branch always receives the API 404. `frontend/src/buyer/checkout.js:235-258`; `backend/server.js:148-189,268-270`; `backend/src/routes/order.routes.js:18-27`. |
| ROUTE-02 | P1 | Confirmed | The unavailable-product component calls `/api/products/:id/similar`; product routes expose recommendations and more-like-this, not `similar`. `frontend/src/components/unavailable-state.js:28`; `backend/src/routes/product.routes.js:36-38`. |
| IMG-01 | P1 | Confirmed | Product image inserts have no URL uniqueness or deduplication. Create, update, and upload append every supplied/uploaded URL, so duplicate files/URLs are persisted and returned. `backend/src/controllers/product.controller.js:969-989,1171-1192,1315-1337`; `backend/src/db/schema.sql:244-252`. |
| DEPLOY-01 | P1 | Suspected | Root and frontend Vercel configurations disagree about project root/output (`vercel.json` has no build/output, while `frontend/vercel.json` outputs `frontend/dist`). A deployment configured at the wrong root can serve neither the intended static pages nor the built output. `vercel.json:1-29`; `frontend/vercel.json:1-40`; `package.json:6-9`. |
| API-01 | P1 | Confirmed | Frontend messaging UI calls endpoints that intentionally return HTTP 501. This is a visible dead feature, not a transport mismatch. `frontend/src/buyer/messages.js:19`; `backend/server.js:230-247`. |
| SCHEMA-01 | P1 | Suspected | There are parallel `sellers`/`seller_profiles`, `users`/`buyer_id`/`cart_id` compatibility models and many additive migrations. Controllers rely on whichever columns exist and use query fallbacks; a partially migrated production database can behave differently from `schema.sql`. `backend/src/db/schema.sql:101-157,317-331`; `backend/src/db/migrations/006_master_audit_schema_sync.sql:303-324`; `backend/src/db/migrations/012_seller_capacity_social_fields.sql:28-57`. |

The highest-risk user journey is add-to-cart: it is blocked on a fresh schema, duplicates standard products on the migrated schema, and can carry a mismatched variant into checkout. Fix the database constraint and server-side product/variant validation before UI polish or deployment work.

### Post-audit backend/database remediation applied

The implementation was subsequently cross-checked against [codebase_logic.md](./codebase_logic.md), and the following backend/database-only changes were made:

* Added migration `022_cart_image_integrity.sql` and matching schema indexes for nullable-safe cart uniqueness, deterministic duplicate cart-row consolidation, and exact duplicate product-image cleanup before unique-index creation.
* Reworked cart upserts to target the correct partial unique index for variant and non-variant items, validate variant ownership, and reject quantities above available stock.
* Added variant-aware order validation, atomic product/variant stock reservation during payment confirmation, and variant restocking on cancellation/refund.
* Added migration `023_overflow_orders.sql`, capacity detection, the unpaid `POST /api/orders/overflow` backend contract, and structured overflow errors.
* Added the backend `/api/products/:id/similar` alias used by the existing frontend.
* Deduplicated product image URLs at backend read/write boundaries and protected normalized image rows with a unique database index.

Verification completed locally: all changed backend JavaScript files pass `node --check`, `git diff --check` passes, and no frontend files were modified. Jest and `psql` are unavailable in this checkout, so the migration and live Neon behavior still require execution in a configured database environment.

### System map: frontend routes, backend routes, and deployment wiring

**Mounting map.** `backend/server.js:148-189` mounts auth, buyer/profile, seller, admin, products/product, cart, orders/order, customization(s), payments/payment, wishlist, occasions/occasion, coupons/coupon, reviews/review, notifications/notification, analytics, Tanya/chatbot, logistics, upload, and sitemap aliases. `backend/server.js:218-228` adds compatibility endpoints for categories, seller discovery, capacity, wishlist add, address aliases, occasions, reports, and bulk inquiries. The route modules delegate to controllers as follows:

* `auth.routes.js` → `auth.controller.js`; `buyer.routes.js` → `buyer.controller.js`; `seller.routes.js` → seller, product, order, review, and buyer controllers.
* `product.routes.js` → `product.controller.js`; `cart.routes.js` → `cart.controller.js`; `order.routes.js` → `order.controller.js`.
* `customization.routes.js`, `payment.routes.js`, `wishlist.routes.js`, `occasion.routes.js`, `coupon.routes.js`, `review.routes.js`, `notification.routes.js`, `analytics.routes.js`, `tanya.routes.js`, `logistics.routes.js`, `upload.routes.js`, and `sitemap.routes.js` each map to their same-named controller (except upload/sitemap, which are controller-backed through their route modules).

**Calls that do map.** Buyer home/product/search/cart/checkout use `/api/products/*`, `/api/cart*`, `/api/buyer/addresses`, `/api/orders`, `/api/payments`, `/api/coupons`, `/api/wishlist`, `/api/occasions`, and `/api/customization`; those mounts exist. Seller listing creation and image upload use `/api/products` and `/api/products/:id/images`, which exist (`frontend/src/seller/add-product.js:621-658`; `backend/src/routes/product.routes.js:49-60`).

**Confirmed mismatches or incomplete features.**

* `/api/orders/overflow` is called but absent (ROUTE-01).
* `/api/products/:id/similar` is called but absent (ROUTE-02).
* `/api/messages/conversations` and related message endpoints exist only as explicit 501 stubs (`backend/server.js:230-247`).
* `frontend/src/buyer/zip-gift.js:38,48` calls `/cart` and `/wishlist` without `/api`; the central client normalizes only `api.js` calls, so these are browser-relative non-API URLs and are likely 404s (**P1 confirmed by code path**).
* `frontend/src/components/ReportWidget.js:747` calls `/api/chatbot/message`; the alias is mounted, but the Tanya route must be checked for its exact verb/path before treating this as safe (**P2 suspected**).

The frontend has one static page tree under `frontend/` (buyer, seller, admin, auth) and a client-side role redirect in `frontend/src/js/router.js:10-24`. No separate mobile page tree was found.

### Schema and migration cross-reference

The principal controller-to-schema relationships are:

* Auth uses `users` and `refresh_tokens` (`backend/src/controllers/auth.controller.js`, `backend/src/services/auth.service.js`; schema `backend/src/db/schema.sql:13-39`).
* Product CRUD uses `products`, `product_images`, `product_variants`, category and customization tables (`backend/src/controllers/product.controller.js:328-353,726-762,969-1020`; schema `backend/src/db/schema.sql:202-307`).
* Cart uses `carts` and `cart_items` (`backend/src/controllers/cart.controller.js:29-57,228-274`; schema `backend/src/db/schema.sql:311-331`).
* Orders use `orders`, `seller_orders`, `order_items`, payments and seller payout data (`backend/src/services/order.service.js:232-353`; schema `backend/src/db/schema.sql:357-437`).
* Seller identity is split between `sellers` and `seller_profiles` and controllers routinely `COALESCE` both representations (`backend/src/controllers/product.controller.js:330-352`; schema `backend/src/db/schema.sql:101-157`).

**Migration observations.**

1. `schema.sql` does not define the cart upsert constraint; only migration 012 does, and it has the nullable-key defect (CART-01/02).
2. Migration 006 and migration 012 both create/alter compatibility cart structures, with 012 adding `user_id`/`added_at` to variants of the table. `cart.controller.js` has fallbacks for missing customization columns, indicating live-schema drift is expected rather than prevented.
3. Product image storage deliberately has two sources: `products.images` and normalized `product_images`. Read queries aggregate both (`backend/src/controllers/product.controller.js:328-349,400-412,726-762`), but writes do not synchronize the legacy array on image upload. This makes duplicate/stale representations possible even when normalized rows are correct.
4. `product_variants.images` was added in migration 010 and also via `ALTER TABLE` in schema setup (`backend/src/db/migrations/010_variant_images_multi.sql:6-17`; `backend/src/db/schema.sql:254-270`), while the variant table has no uniqueness rule for variant identity. This is a P2 data-quality risk.
5. Automatic boot synchronization is invoked from `backend/server.js:285-292`; it is non-destructive by description but still makes startup behavior database-dependent. Production migration completion should be verified separately; no live DB was contacted in this audit.

## 2. Add to Cart — root cause

1. Product detail loads through `frontend/src/buyer/product.js:39-41`, checks `isLoggedIn()`, then sends `{ product_id, variant_id, quantity: 1, customization_data }` at `frontend/src/buyer/product.js:383-399`.
2. `api.js` adds the bearer token and retries a 401 through `/api/auth/refresh` (`frontend/src/js/api.js:55-81,101-145`). The cart router applies `authMiddleware` to every operation (`backend/src/routes/cart.routes.js:12-36`), and middleware verifies JWT plus active user (`backend/src/middleware/auth.js:10-56`).
3. The server checks only `product_id` and active product status, serializes customization, and performs the faulty upsert (`backend/src/controllers/cart.controller.js:204-274`). It does not check ownership of `variant_id`, variant stock, or requested quantity against stock.
4. Cart reads calculate server-side prices, customization fees, seller grouping, and shipping (`backend/src/controllers/cart.controller.js:29-175`). The UI renders `/api/cart` and computes its own subtotal/shipping (`frontend/src/buyer/cart.js:61-112`), using a hard-coded ₹79 shipping value while the backend returns ₹50/free shipping. This is a **P1 confirmed total-display mismatch**; checkout subsequently recomputes from cart items and the order service recomputes again.
5. Checkout sends only `address_id` plus coupon fields (`frontend/src/buyer/checkout.js:225-236`). `order.service.js` fetches all active buyer cart rows, groups by seller (`:197-220`), creates one parent order and one seller order per seller (`:226-353`), then deletes selected cart rows (`:353-360`). This is the intended multi-seller design and is conceptually sound, but payment is created only for `orders[0]` (`frontend/src/buyer/checkout.js:260-269`); confirm that the parent order, not a seller split, is the payment aggregate in production.
6. Guest merge posts `/api/cart/merge`, falls back to individual adds, then deletes local guest state regardless of partial failure (`frontend/src/buyer/cart.js:23-55`). The `finally` deletion means failed items can be lost (**P1 confirmed**).

## 3. Duplicate Images — root cause

Seller UI keeps selected photos in `uploadedPhotos` and submits a product first, then uploads each compressed file as `formData.append('images', compressed)` (`frontend/src/seller/add-product.js:11,210-228,638-658`). The upload middleware/controller accepts the files and inserts each `file.path` at the next `sort_order` (`backend/src/controllers/product.controller.js:1315-1337`). There is no content hash, URL check, or `ON CONFLICT`.

The JSON create/update paths are equally permissive: `photos`, `images`, and scalar image aliases are normalized and inserted without dedupe (`backend/src/controllers/product.controller.js:969-989`); update deletes existing rows and reinserts every supplied entry (`:1171-1192`). The schema has only an index on `product_id`, not a unique `(product_id,url)` constraint (`backend/src/db/schema.sql:244-252`).

Reads can expose the duplication through both `product_images` aggregation and the legacy `products.images` array (`backend/src/controllers/product.controller.js:20-27,328-349,726-762`). Variant image arrays are also accepted as-is (`:996-1007,1198-1207,1374-1385`). **Confirmed remediation requirement:** canonicalize one image source, trim/dedupe URLs before insert, prevent duplicate upload hashes/URLs, and add a migration-safe unique index after cleaning existing duplicates. Do not silently delete existing data without a migration/report.

## 4. Other confirmed bugs found

* **P1 — Checkout overflow endpoint is not registered.** The checkout branch calls `POST /api/orders/overflow`, but `backend/server.js:148-189,268-270` and `backend/src/routes/order.routes.js:18-27` expose no such route. This branch receives a 404 whenever it is selected (`frontend/src/buyer/checkout.js:235-258`).
* **P1 — Unavailable-product recommendations use a nonexistent route.** `frontend/src/components/unavailable-state.js:28` calls `/api/products/:id/similar`, while `backend/src/routes/product.routes.js:36-38` exposes different recommendation endpoints.
* **P1 — Zip-gift cart and wishlist calls omit the API prefix.** `frontend/src/buyer/zip-gift.js:38,48` calls `/cart` and `/wishlist` directly rather than `/api/cart` and `/api/wishlist`; the central API client cannot normalize these browser-relative URLs.
* **P1 — Messaging UI is connected to deliberate 501 stubs.** `frontend/src/buyer/messages.js:19` reaches endpoints implemented as HTTP 501 in `backend/server.js:230-247`, so the visible feature is not operational.
* **P1 — Cart totals disagree between backend and cart page.** The backend returns server-calculated shipping, while `frontend/src/buyer/cart.js:61-112` hard-codes ₹79. Checkout/order calculations use different server-side values, so the displayed total can differ from the amount used downstream.
* **P1 — Guest cart merge can lose items after partial failure.** `frontend/src/buyer/cart.js:23-55` deletes local guest state in `finally`, including when individual fallback adds fail.
* **P1 — Variant integrity and stock are not enforced at cart/order boundaries.** `backend/src/controllers/cart.controller.js:214-226` accepts an arbitrary `variant_id`, and `backend/src/services/order.service.js:141-151` checks product stock but not variant ownership/stock.
* **P1 — Image writes allow duplicate and stale representations.** Product image writes accept repeated URLs and maintain both `products.images` and `product_images` without a uniqueness rule (`backend/src/controllers/product.controller.js:969-989,1171-1192,1315-1337`; `backend/src/db/schema.sql:244-252`).

## 5. Suspected but unconfirmed issues

* **Needs production confirmation — Vercel project-root/config mismatch (P1).** Root `vercel.json` and `frontend/vercel.json` specify different deployment assumptions (`vercel.json:1-29`; `frontend/vercel.json:1-40`). The deployed Vercel project root and actual static/API behavior were not available from the local checkout.
* **Needs production database confirmation — schema drift across compatibility models (P1).** Parallel `sellers`/`seller_profiles`, cart identity columns, additive migrations, and controller fallbacks suggest behavior can differ on a partially migrated database (`backend/src/db/schema.sql:101-157,317-331`; `backend/src/db/migrations/006_master_audit_schema_sync.sql:303-324`; `backend/src/db/migrations/012_seller_capacity_social_fields.sql:28-57`). No live Neon connection was made.
* **Needs endpoint/verb confirmation — ReportWidget chatbot alias (P2).** `frontend/src/components/ReportWidget.js:747` calls `/api/chatbot/message`; the compatibility alias exists, but its exact verb/path contract should be verified against the Tanya route before classifying it as working.
* **Needs production confirmation — payment aggregation for multi-seller orders.** Checkout creates payment data using `orders[0]` (`frontend/src/buyer/checkout.js:260-269`) while order creation splits seller orders. The parent-order aggregation assumption should be checked against the deployed Razorpay flow.
* **Needs data confirmation — duplicate-image scope.** The code permits duplicate URLs and dual image sources, but determining whether the reported product has duplicate persisted rows, duplicated legacy-array entries, duplicated variant arrays, or a rendering-only duplication requires querying the production database/API response.

## 6. Recommended fix order

**Checks performed.** Git status was clean before the audit; no source/config edits were made. The existing backend test command was attempted and could not run because `jest` is not installed (`npm --prefix backend test -- --passWithNoTests`, exit code 1). No dependency installation, build, migration, or live database/network mutation was performed.

**Deployment/configuration review.** Root `vercel.json` rewrites `/api/:path*` to `https://tohfafinal.onrender.com/api/:path*` and has no build/output declaration (`vercel.json:1-29`). `frontend/vercel.json` declares `outputDirectory: frontend/dist` and a second API rewrite (`frontend/vercel.json:1-40`). `backend/vercel.json` rewrites all paths to `/api/index.js` (`backend/vercel.json:1-8`), while `api/index.js` correctly exports `backend/server.js`. Select one Vercel project root and one authoritative config; verify `/health`, `/api/products`, CORS, static page routing, and Render availability in a deployed smoke test.

**Recommended fix order.**

1. **P0:** Repair cart schema/upsert: add a migration-safe partial unique index for `(buyer_id, product_id)` where `variant_id IS NULL`, and a unique constraint/index for non-null variants; remove reliance on an invalid conflict target. Clean duplicate rows first.
2. **P1:** Validate product/variant relationship, variant stock, quantity, and seller/product status in cart and order transactions; use row locks/decrement stock atomically at order placement.
3. **P1:** Fix checkout overflow contract (implement it or remove the branch), map `/similar` to an existing recommendation endpoint, correct `/cart` and `/wishlist` zip-gift calls, and either implement messaging or hide/disable the UI.
4. **P1:** Make one server-authoritative pricing/shipping response the UI consumes; remove the cart page’s hard-coded ₹79.
5. **P1:** Make guest merge transactional/acknowledged so local items are removed only after successful per-item persistence.
6. **P1:** Deduplicate image URLs/files, reconcile `products.images` with `product_images`, clean existing duplicates, then add an appropriate unique index and tests.
7. **P1/P2:** Consolidate migrations and seller/cart compatibility columns, document the required migration order, and run a schema verification against the production database.
8. **P2:** Normalize route aliases and add automated route-contract tests covering every frontend API call and the six critical journeys (auth, listing, cart, checkout, image upload, seller order).
