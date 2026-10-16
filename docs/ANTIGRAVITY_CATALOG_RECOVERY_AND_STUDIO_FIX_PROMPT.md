# Antigravity execution prompt: restore the original catalog and fix Seller Studio

Act as a senior full-stack engineer executing a narrowly scoped recovery. Diagnose with evidence, repair the causes, and verify actual behavior. Do not redesign the UI or create content to make screens look populated.

## Owner instructions — authoritative

- Keep the original three Tohfa Special shops: **Crochet Lady**, **The Candle Story**, **Nails Diva**. The owner explicitly confirmed these names.
- The owner explicitly confirmed **Aarohi Creations was added without permission**. Remove that unauthorized seller and its unauthorized catalog from the marketplace.
- Preserve original normal sellers, including empty stores. Empty is a valid state. Do not infer that a seller is unwanted from an empty catalog, a duplicate display name, or a test-looking name alone.
- Restore original product ownership, prices, photos, galleries and variants from evidence. No new sellers, products, photos, prices, addresses, biographies, reviews, orders or demo metrics.
- Fix repeated Application Approved detours and glitchy Seller Studio navigation. Preserve the existing visual design, typography, colors, layouts, commercial terms, routes and features.
- Audit prior claimed completion. Report verified, partial, failed and unverified separately. No claims of zero bugs or complete verification based on screenshots or mocked APIs.

## Evidence already collected — read before changing anything

Read `docs/CATALOG_AND_STUDIO_RECOVERY_AUDIT.md` and `docs/catalog-recovery-current-inventory.json`. The JSON is a read-only current-state capture, **not a historical source of truth or full backup**. It includes 20 sellers, 41 seller_profiles, 81 products, 227 product_images and 20 variants. Counts include inactive records and must not be presented as storefront counts.

Current identities in the configured database:

| Intended record | users.id | sellers.id | seller_profiles.id | Current name / evidence |
|---|---:|---:|---:|---|
| Crochet Lady — KEEP and restore | 121 | 27 | 150 | `Tohfa Special Pottery Renamed 1791288560336`; slug remains `crochet-lady` |
| The Candle Story — KEEP | 122 | 28 | 151 | Correct name; slug `the-candle-story` |
| Nails Diva — KEEP and restore | 123 | 29 | 152 | `Nails Diva Studio`; slug `nails-diva` |
| Extra special shop — investigate test provenance, remove proven fixture | 160 | 69 | 187 | `Tohfa Special Pottery Renamed 1791184376814` |
| Extra normal shop — investigate test provenance, remove proven fixture | 161 | 70 | 188 | `Priya Crafts 1791184376814` |
| Aarohi Creations — owner confirmed unauthorized | 319 | 203 | 341 | 18 products, IDs 1105–1122, created October 6, 2026 |

Additional product contamination candidates: 383 (`Handmade Teakwood Coaster Set STEP_A_BEFORE_FIX`), 384 (`... STEP_D_AFTER_FIX`), and 1222 (`VAR-5 Full Lifecycle Test`, owned by original Crochet Lady user 121). Determine provenance and dependencies before removing these exact records. Do not remove their legitimate parent sellers.

The original special catalog currently contains product IDs 321–378, created together August 30. This is a **candidate historical cohort**, not authorization to assume every current price/image is original. Compare backups, audit trails, git history and original supplied assets. Never use a date or ID range alone as a deletion filter.

## Phase 1 — contain the cause and establish recovery evidence

1. Preserve the dirty workspace. Record current branch, HEAD, diff, untracked files and existing work. Do not reset, checkout over, clean or overwrite another agent's work. Current audit baseline was HEAD `9e3095f`; recheck.
2. Identify the exact database used by the locally viewed frontend/backend. A localhost URL does not establish an isolated database. Record environment identity without printing credentials.
3. Before mutations, take a recoverable backup of all affected rows and their dependencies. The provided inventory excludes users, banking, orders and many other columns; it is insufficient for rollback.
4. Audit test entry points before running them. `backend/tests/seller_pipeline_e2e.test.js` imports the configured DB, selects a real admin, creates sellers and calls admin update routes. Its cleanup swallows failures. Its generated names match contamination in the current database. Never run this or another writing test against the application database. Require a separately configured disposable test database; fail closed if isolation cannot be established. Block external email/payment/WhatsApp effects in tests.
5. Do not run `seed_tofa_specials.js`, legacy seed wrappers, catalog reset commands or destructive migrations. The seeder deletes products and related order_items, cart items, wishlist rows, reviews and more before rebuilding. It is not a restoration method.
6. Build a manifest for every proposed change: exact table/key, current value, expected value, evidence, affected references and rollback. Distinguish owner-confirmed unauthorized content, proven fixture contamination and uncertain historical content.

## Phase 2 — fix identity resolution before restoring data

Investigate `backend/src/controllers/admin.controller.js`, especially `updateSpecialShop`. It resolves a single route value against users.id, seller_profiles.id, sellers.id and slugs; it prioritizes user/profile matches ahead of seller matches. The test sends a sellers.id. Different ID spaces can collide and select a different existing shop. This is a plausible explanation for the original Crochet Lady being renamed with test data; prove the particular collision from audit logs before claiming causality.

Trace each admin caller and response field. Establish one explicit ID contract per route; do not blindly change precedence or add another OR match. Update callers where necessary, retain supported compatibility only when unambiguous, reject ambiguity and update related tables transactionally by the resolved user_id. Check approval, suspension and plan updates for the same cross-ID pattern. Add isolated collision tests with overlapping user/seller/profile IDs and assert unrelated shops are byte-for-byte unchanged. Also inspect Boolean('false') coercion in updateSpecialShop; preserve false correctly.

## Phase 3 — restore only authorized data

1. Restore existing identities for users 121 and 123 to Crochet Lady and Nails Diva, synchronizing the applicable seller tables. Preserve IDs, slugs, ownership and all unaffected fields. Investigate whether the test also overwrote biography, pickup address, status or commission; restore only evidence-backed values.
2. Remove Aarohi Creations (user 319, seller 203, profile 341) and products 1105–1122 from active discovery, search, special sections, seller storefronts, recommendations and feeds. Re-read and assert IDs and ownership before acting. Inspect orders, payments, wallets and foreign keys. Prefer reversible quarantine/soft deletion using existing status fields when history is referenced; preserve legitimate transactional history. Do not cascade-delete the user account or order records.
3. Remove proven test-created sellers/products using exact reviewed IDs and provenance. Do not delete all records with Test/QA/Priya in their names, all non-special sellers, all recently created records or all empty sellers.
4. Restore previous prices and image mappings from trustworthy pre-change evidence. Keep image order, variant association, primary-image choice and product IDs stable. Missing evidence means mark that record unresolved and request only the missing source; do not invent a replacement.
5. Trace image references across products.images, product_images, product_variants, local assets and remote storage. Remove unauthorized catalog associations first. Do not delete physical files or remote media until all remaining references, including order history, are checked. Preserve shared legitimate assets.
6. Identify stock-photo fallbacks in buyer product/cart/search/profile/gallery code. They can present unrelated photos as products. Preserve original valid photos; when no verified photo exists, use the existing neutral placeholder or empty state. Do not substitute another product or fetch new stock imagery.
7. Execute reviewed changes transactionally with expected-before-value/affected-row assertions, rollback on mismatch, idempotent reruns and no broad deletion. Invalidate only relevant caches and regenerate existing feeds where needed.

## Phase 4 — fix approval/login state

Inspect `frontend/src/components/ProtectedRoute.js`, both `frontend/src/js/auth.js` and `frontend/src/utils/auth.js`, onboarding.html, dashboard approval logic, both API clients and backend approval/profile/login responses.

Observed defect: ProtectedRoute trusts saved tohfa_user.is_approved. onboarding.html fetches fresh application status and shows Application Approved, but does not update saved user state. Clicking dashboard can therefore send the seller straight back. onboarding.html also tests app.is_approved by truthiness; the string 'false' must never mean approved. Other guards disagree on which flags establish approval.

- Normalize boolean representations explicitly. Approval, setup completion, rejection and suspension are separate states. is_onboarded alone is not approval.
- Use authoritative server state to reconcile stale cached approval. Synchronize the actual storage keys used by all guards via existing storage helpers. Keep backend authorization intact.
- Approved active sellers should reach the intended Studio destination without a recurring success-panel stop or redirect loop. Preserve genuine pending/rejected/suspended behavior and incomplete banking/address listing restrictions.
- Handle unauthorized, expired-token, refresh-failure, 403 and network-error cases explicitly without granting approval or flashing an incorrect success state.
- Inspect fetchSellerProfile in seller-components.js: its 60-second session cache is not keyed to seller/token and its resolved window promise persists. Ensure logout, seller switching, approval/profile updates and session changes cannot reuse another seller's data. Avoid storing raw tokens as cache identifiers.
- Validate seller, admin-switched seller, account switching and multiple-tab behavior. Do not expose seller data before authorization completes.

## Phase 5 — make navigation stable without redesign

Sidebar links currently navigate separate HTML documents. Shared shell styles are inserted by JavaScript after a module imports its dependencies; refinement CSS is in page heads. This is a candidate source of first-paint shifts, not a browser-proven diagnosis.

- Reproduce using real navigation with normal and throttled loading; record before/after video or frame captures. Separate full-document loading from any actual reload loop.
- Stabilize shell geometry and essential styles before first paint; prevent the legacy sidebar width or missing custom elements from briefly shifting the content. Reserve layout space as needed without changing the final design.
- Eliminate repeated redirects, duplicated initialization and avoidable profile fetches. Preserve authorization and freshness.
- Use short, progressive navigation transitions only if appropriate and supported. Respect reduced motion and provide a functional unsupported-browser fallback. Do not rewrite into an SPA or intercept all links merely to hide symptoms.
- Preserve back/forward, direct URLs, refresh, deep links, modifier-click/new-tab, forms, dirty-form behavior, focus, scrolling and mobile drawer operation. Do not fade the whole app to blank while requests hang.

## Phase 6 — audit previous claims and verify

Read the existing execution prompt, UI implementation brief/results and acceptance scripts. Map each applicable requirement to implementation, a real test and evidence. Prior planning documents may contain unapproved future ideas: do not implement those as new requirements.

`scripts/seller_ui_harness.cjs` intercepts API responses and simulates successful local mutations. Its screenshots can establish fixture layout, not persisted saves, real login, correct seller ownership or original catalog preservation. `run_p4_acceptance.cjs` runs all ten pages at two reference sizes, but its additional viewport matrix selects five pages. Check the previous claim that all ten pages passed all eight sizes against actual artifacts. Also compare reported plan features/commissions with actual markup and API responses; do not change commercial terms to make the report true.

Required validation:

- Disposable-database tests: ID collisions; original shop not renamed by a fixture update; rollback; cleanup failure surfaced; unauthorized records absent; legitimate empty sellers retained; original prices/image mappings unchanged for untouched records.
- Approval matrix: pending -> approved in an existing session; fresh login; refresh; back/forward; rejected; suspended; incomplete setup; string/number/boolean flags; expired tokens; network failure; admin switch; logout/login to another seller.
- Navigation: all nine destinations, desktop/mobile, normal/throttled network, no redirect loop, no incorrect approval panel, no large shell shift, no duplicate handlers and reduced-motion support.
- Real read-only checks against the configured application database/API after recovery. Writes for tests belong only in isolated storage. Mocked browser tests must be labeled mocked.
- Run relevant existing frontend guards/build and safe targeted tests after inspecting their side effects. Do not run the root build blindly: it installs dependencies and frontend postbuild generates SEO output. Do not run the full backend suite against the configured application DB.
- Re-query affected records and compare with the recovery manifest. Count alone is not proof of restoration. Verify image URLs and ownership, prices, gallery order and variant images.

Deliver a concise report with exact changes, before/after identities, backup/rollback location, commands and results, real versus mocked evidence, unresolved records and any remaining blockers. Do not report catalog restoration or all-task completion until demonstrated. Continue independent fixes when historical data recovery is blocked. Nothing outside this scope.
