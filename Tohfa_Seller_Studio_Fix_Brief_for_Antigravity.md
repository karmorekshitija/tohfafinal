# Tohfa Seller Studio — Fix Brief for Antigravity (Part 2: Seller Studio + Buyer↔Seller↔Admin Connectivity)

**Scope:** Seller Studio backend (`seller.routes.js`, `seller.controller.js`) and frontend (`frontend/src/seller/*`), plus the shared routing/auth plumbing that connects buyer, seller, and admin (`ProtectedRoute.js`, `frontend/src/utils/auth.js`). This is a companion to the Admin Panel brief — read that one first for the "Tohfa Special" model, since Task 3 there depends on this brief's findings.

**Rule for Antigravity:** Same as Part 1 — no new naming conventions, no new tables beyond what's specified, confirm before touching anything outside the named scope, and if anything here is ambiguous, stop and ask rather than guess.

---

## 1. THE CRITICAL BUG — fix this first, it blocks everything else

**Symptom:** A seller who has signed up and is pending admin approval cannot reach any working page describing their status once they navigate away from the immediate post-login redirect (refresh, direct URL, bookmark, or coming back later). They land on a blank/404 page instead.

**Root cause:** `frontend/src/components/ProtectedRoute.js`'s seller route guard redirects unapproved sellers to:
```
/seller/become-seller.html?status=pending
```
**This file does not exist anywhere in the repository.** Neither does `/buyer/become-seller.html`, which the "Sell on Tohfa" footer link (`handleFooterSellerLink()`, present in multiple pages including `products.html`) redirects a logged-in buyer to.

**The correct destination already exists and already works:** `frontend/src/seller/onboarding.html`, titled "Application Status," which correctly calls the real, working `GET /api/seller/application-status` endpoint. Confirm this by checking: `frontend/src/utils/auth.js`'s `redirectUserByRole()` function (used right after login) already redirects a pending seller here correctly — the bug is specifically that `ProtectedRoute.js`'s separate, later-running route guard doesn't use the same destination.

**Fix:**
1. In `ProtectedRoute.js`, change the seller guard's redirect target from `/seller/become-seller.html?status=pending` to `/seller/onboarding.html`.
2. Update the guard's allow-list check (it already allows `/seller/onboarding.html` to be visited without redirect — verify this still works correctly once it's also the actual redirect target, i.e. no redirect loop).
3. Find every other reference to `become-seller.html` in the codebase (grep the whole `frontend/` tree for the literal string `become-seller`) and decide, per reference, whether it should point to `/seller/onboarding.html` (for an already-pending seller) or to `/auth/signup-seller.html` (for a buyer who hasn't applied at all yet — see Task 2). Do not leave any reference pointing at a page that doesn't exist.
4. After the fix, manually verify the full loop: sign up a fresh seller → confirm redirect to onboarding.html → admin approves in the admin panel → seller logs out and back in → confirm redirect to `/seller/dashboard.html` and that the dashboard loads with real data.

---

## 2. Buyer-to-seller upgrade path is fully broken — decide whether to fix or remove it

There are two separate "become a seller" pathways in this codebase:

**Path A — direct signup (`/auth/signup-seller.html` → `auth.service.js`'s seller registration).** This one is correct and complete: creates a `users` row with `role='seller'`, and populates both `sellers` and `seller_profiles` with store name, pickup address, bank details, PAN, GST, and portfolio images, inside a single transaction. **Do not change this path.**

**Path B — buyer upgrade (`POST /api/seller/apply`, `seller.controller.js`'s `applyAsSeller`).** This is meant for an existing buyer account that wants to start selling, and it is broken in two independent ways:

1. It gates on `req.user.role !== 'seller'` — i.e., it refuses anyone whose role isn't *already* `seller`. Since the entire point of this endpoint is to let a `buyer` become a `seller`, this condition can never be satisfied by its actual intended caller. This needs to check the opposite condition (allow `role === 'buyer'`, and handle promoting `role` to `seller` as part of the approval flow, not before it) — or be removed if Path A is meant to be the only onboarding route (see decision point below).
2. Even with the gate fixed, its INSERT only writes `store_name`, `bio`, `whatsapp_number`, `seller_type`, and `is_approved` into `seller_profiles`. It never collects or writes pickup address, bank details, PAN, GST, or portfolio images (the fields your spec requires upfront), and it never writes a `sellers` table row at all — so a seller onboarded this way would be incomplete and inconsistent with Path A's data shape, and admin's KYC review screen would show gaps.

**Decision needed before building:** confirm with Kshitija whether Path B should be (a) properly rebuilt to collect the same full KYC fields as Path A and insert into both tables identically, just reachable from inside the logged-in buyer experience instead of the public signup page, or (b) removed entirely in favor of always sending a buyer who wants to sell to `/auth/signup-seller.html` (accepting that this may require a separate account/email, or building an account-merge/role-upgrade step — flag that complexity if choosing this option). Do not silently pick one — this changes account data model behavior and needs a decision, not an assumption.

If keeping Path B: also add the missing `sellers` table insert (matching Path A's fields) inside a transaction, so both onboarding paths produce identically-shaped, fully-queryable seller records regardless of which one a given seller went through.

---

## 3. Admin-side data-loss bug: suspend reason silently discarded

`frontend/src/admin/sellers.html`'s suspend-confirmation handler sends:
```js
adminApiClient.patch(`/admin/sellers/${id}/suspend`, { ban_reason: reason })
```
but the backend's `suspendSeller` in `admin.controller.js` reads:
```js
const { reason = 'Administrative suspension' } = req.body;
```
The key names don't match (`ban_reason` vs `reason`), so the destructured `reason` is always `undefined` on the frontend's actual payload and always falls back to the generic default. The admin's typed suspension reason is silently thrown away and never reaches the audit log or the seller-facing notification.

**Fix:** Change the frontend payload key from `ban_reason` to `reason` (simpler than changing the backend, since `reason` is the more semantically correct name and other endpoints in this same controller already use `reason` as the standard key). After the fix, verify the typed reason actually shows up in the audit log entry for `SELLER_SUSPENDED`.

---

## 4. Seller Studio endpoints called by the frontend that do not exist on the backend at all

These are not typos of a real route (like the admin `/sponsored` vs `/sponsor` bug) — they are entirely unbuilt backend functionality. Each of these frontend features will fail on every use until the backend route + controller function is built.

| Frontend file | Calls | Status |
|---|---|---|
| `seller/dashboard.html` | `POST /api/seller/messages/start` | No messaging route exists under `/api/seller` at all. Confirm whether a global `/api/messages` system exists elsewhere in the codebase that this should instead call (check `backend/src/routes/` for a `messages.routes.js` or similar) before building a new one from scratch — don't duplicate an existing system. |
| `seller/orders.html`, `seller/order-detail.html` | `PATCH /api/seller/orders/:id/tracking` | Not registered. Only `/status`, `/label`, `/awb`, `/proof` exist for orders. Build a `PATCH /seller/orders/:id/tracking` route + `sellerController.updateOrderTracking` function that writes tracking number/carrier to the order record and notifies the buyer — check what column(s) the `orders` table already has for this (search schema for `tracking_number`, `courier`, `awb_number` etc., since the AWB generation endpoint (`generateOrderAWB`) may already touch related columns) before adding new ones. |
| `seller/catalog.html` | `GET /api/seller/catalog/summary` | Not registered. Build a lightweight aggregate endpoint (active listing count, total stock, any other summary stats the catalog page's header actually displays — check the page's rendering code for exactly which fields it expects). |
| `seller/catalog.html` | `PATCH /api/seller/listings/:id/discount` | Not registered. Build per-listing discount support if this is a real planned feature — confirm with Kshitija what "discount" means here (a percentage off `base_price`? a separate `sale_price` column?) before choosing a schema, since this affects buyer-facing price display too. |
| `seller/catalog.html` | `POST /api/seller/listings/bulk-discount` and `POST /api/seller/listings/bulk-discount-all` | Not registered. Same confirmation needed as above before building — this is two related but distinct bulk actions (selected listings vs. all listings), build both once the discount model is confirmed. |

For every one of these: **confirm the feature is actually wanted and scoped correctly before building the backend**, since a UI element already exists calling it — don't assume the frontend's shape is correct without checking what data it expects back.

---

## 5. Full route-audit method (repeat this for `seller.routes.js` the way it was done for `admin.routes.js`)

The Admin Panel brief's Task 7 (verification sweep) already established the method: grep every registered route path out of the route file, grep every frontend API call, and diff the two lists by hand rather than assuming they match. This was how Bug 2 in Part 1 (`/sponsored` vs `/sponsor`) and every endpoint in Section 4 above were found. Apply that same method to:

1. `product.controller.js` / `product.routes.js` — seller-facing listing creation/editing calls into this controller via `seller.routes.js`'s `/listings` endpoints; verify `createProduct`, `updateProduct`, `updateProductStatus`, and `uploadImages` all use field names that match what `seller/add-product.html` and `seller/edit-product.html` actually send (check especially image upload field names and any customization-schema fields, since those are common places for frontend/backend key-name drift like the suspend-reason bug in Section 3).
2. `buyer.controller.js`'s address functions, reused by seller studio (`/seller/addresses`) — confirm the response shape returned to a seller matches what `store-config.html` and `profile-settings.html` expect (label fields, default-address flag, etc.).
3. Any endpoint returning a bare array where the frontend paginates (same pattern as Bug 4 in the Admin brief) — check `getSellerOrders`, `getSellerReviews`, and `getSellerProducts` specifically, since orders and reviews pages in the seller studio have pagination controls.

Report findings before fixing anything not already named in this brief, the same way Part 1's Task 7 asked for.

---

## 6. Buyer ↔ Seller Studio ↔ Admin connectivity — what "connected" means concretely

Since the ask is for the admin panel to have "ultimate control" and everything to be "connected," here is what that requires concretely, cross-referencing both briefs:

1. **A seller's approval status must flow one way, consistently:** Admin approves in `sellers.html` → `seller_profiles.is_approved` (and `sellers.is_approved`, kept in sync — already handled correctly by `verifySellerKYC`) → seller's next login reads it fresh (`auth.service.js`'s `login()` — already correct) → `redirectUserByRole` sends them to the right place (already correct) → `ProtectedRoute.js`'s guard on every subsequent page load must send them to the same right place if they're still pending (Section 1's fix) or let them through if approved (already correct logic, just needs the redirect target fixed).
2. **A buyer's "become a seller" journey must have exactly one entry point that actually works end-to-end**, per the decision in Section 2 — right now there effectively isn't one for an existing logged-in buyer, only for a brand-new signup.
3. **Admin suspending/banning a seller must actually reach the seller-facing experience:** confirmed `suspendSeller` already pauses products (`UPDATE products SET status='paused'`) and deactivates the user (`is_active=FALSE`) — verify the seller studio's own guard (`sellerOnly` middleware) correctly locks out a suspended seller's API calls (it does, via the `is_approved`/`is_active` check — this part is solid) and that the seller-facing UI shows a clear "your account is suspended" state rather than a generic error or blank page when this happens (check what `dashboard.html` does on a 403 with `code: 'SELLER_NOT_VERIFIED'` from the backend — if it doesn't handle this code specifically, it should show the same "Application Status" messaging pattern as `onboarding.html` rather than failing silently).
4. **Admin-managed Special Shops (from Part 1) must be able to use the seller studio transparently:** `sellerOnly` middleware already has logic for an admin acting on behalf of a Special Shop via an `X-Acting-Seller-Id` header — verify the admin frontend's "switch session" feature (`switchSessionToSpecialShop` in `admin.controller.js`, triggered from the Special Shops tab) actually lets an admin land in the real seller studio UI as that shop, with all the same pages (catalog, orders, payouts) working identically to a real seller's view. Test this specifically once Part 1's Special Shops feature is finished, since it's the mechanism that gives admin direct, hands-on control over those shops' listings and orders — not just database-level curation.

---

## 7. What NOT to do

- Do not build a new messaging system, discount system, or tracking system speculatively — confirm scope with Kshitija first for anything in Section 4 beyond the route-existence fix itself.
- Do not change `auth.js` or `apiClient.js` — they are the one part of this codebase that's already correctly unified; changing them risks breaking the parts of login/session handling that currently work.
- Do not remove Path A (direct seller signup) — it is the working, complete onboarding flow and must remain the reference implementation for whatever happens to Path B.
- Do not skip the manual end-to-end verification in Section 1, step 4 — this is the exact loop that's currently broken for Kshitija, so it needs to be walked through by hand after the fix, not just confirmed by reading the code.
