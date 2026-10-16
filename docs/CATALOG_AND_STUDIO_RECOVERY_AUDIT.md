# Catalog and Seller Studio recovery audit — October 16, 2026

## Scope and status

This is an evidence-based management handoff, not a completed repair or exhaustive certification of every file. Reviewed the current git diff/history, catalog seed paths, seller/admin identity update code, approval guards/onboarding, shared Studio shell, buyer image fallbacks, previous reports and acceptance harnesses. Captured the configured database in a repeatable-read, read-only transaction. No application code, database records or image files were changed in this audit.

The owner confirmed the original special shops are Crochet Lady, The Candle Story and Nails Diva, and confirmed Aarohi Creations is unauthorized. The exact original normal-seller allowlist and historical image/price baseline remain unestablished.

## Confirmed findings

1. **Original shop names have changed in the database.** Crochet Lady's slug and user 121 remain, but sellers row 27 and seller_profiles row 150 are named `Tohfa Special Pottery Renamed 1791288560336`. Nails Diva user 123 / seller 29 / profile 152 is named `Nails Diva Studio`. The Candle Story user 122 retains its name.
2. **Unauthorized seller identified by the owner:** Aarohi Creations user 319 / seller 203 / profile 341, with 18 products (1105–1122). These products were created within approximately one second on October 6. Timing alone did not establish authorization; the owner explicitly rejected this seller.
3. **Fixture-like contamination exists:** extra special seller 69/user 160 and normal seller 70/user 161 use the exact timestamped naming patterns in backend/tests/seller_pipeline_e2e.test.js. Products 383, 384 and 1222 include explicit test-stage/lifecycle names. Removal still needs exact identity/dependency checks, not name-based blanket deletion.
4. **The E2E test can write to the configured application database.** It imports the normal DB module and creates/updates sellers with an existing admin identity. Cleanup catches and ignores individual errors. No isolated-database requirement is visible in this test file. Do not execute it during investigation.
5. **Repeated approval detour is explained by inconsistent state handling.** ProtectedRoute.js gates on saved tohfa_user approval; onboarding.html fetches the current application but never synchronizes saved approval before linking back to dashboard. Its truthy approval check also treats string `false` as approved. This establishes a defective code path; a real-session browser reproduction remains outstanding.
6. **Prior verification is narrower than claimed.** The UI harness uses invented browser fixtures, including Aarav Handcrafts, and intercepts mutation calls with success responses. This does not prove those fixtures were inserted in the DB; it also cannot prove real login, saves, catalog identity or prices. The extra viewport loop selects five pages, unlike the report's blanket all-ten-pages/across-eight-viewports claim. Commercial feature descriptions also need checking against actual plan cards.
7. **Unsafe recovery path exists:** seed_tofa_specials.js deletes products and associated order_items, reviews and other dependencies before rebuilding the special catalog. Reseeding would destroy the evidence and could lose history.
8. **Unrelated stock-photo fallbacks exist** in buyer home/search/cart/checkout/product/seller-profile/wishlist paths. A fallback can show imagery that was never supplied for the actual product. This is distinct from an inserted DB image row and must be traced separately.

## Strong risks requiring reproduction

- updateSpecialShop matches one route parameter against user, seller and profile ID spaces and slugs. It prefers user/profile matches over seller matches, while the E2E caller supplies a seller ID. Numeric collisions can mutate the wrong shop. This is a concrete implementation risk and a plausible cause of the Crochet Lady rename; the specific historical write has not been proven from audit logs.
- Shared seller-profile session cache lacks an identity key. Its resolved in-memory promise also survives until document teardown. Account switching or profile updates can reuse stale data.
- Sidebar navigation uses full-document links; shell CSS is injected at module execution while refined styles load in page heads. This can contribute to first-paint layout changes. No browser performance recording was made, so smoothness is not yet verified.

## Current inventory, not restoration baseline

`catalog-recovery-current-inventory.json` contains 20 sellers, 41 seller_profiles, 81 products, 227 image rows and 20 variant rows, including inactive records. Seller and profile row counts are different; filtering only sellers would miss profile-only records. The inventory includes only selected non-credential catalog fields and is not a full backup.

Special user product counts: user 121 has 21, user 122 has 28, user 123 has 10. These counts include the test product 1222 under user 121. Original-looking special products 321–378 form a common August 30 creation cohort. Their current price/image values must not be assumed to be the requested original values without historical evidence.

The current uncommitted diff contains seller UI changes and SEO changes, but no newly tracked catalog images or seed modifications. This does not exonerate previous runs: database mutations and earlier commits are outside that diff. Attribution to a particular agent is not established.

## Deliverables and remaining work

- Execution prompt: `ANTIGRAVITY_CATALOG_RECOVERY_AND_STUDIO_FIX_PROMPT.md`.
- Read-only collector: `../scripts/catalog_recovery_inventory.cjs`; it never imports the server, migration runner or seeds. It was executed successfully using read-only transactions. An initial sandbox network denial was resolved with an approved read-only invocation.
- Current selected-field evidence: `catalog-recovery-current-inventory.json`.
- Still pending: full affected-row backup, historical catalog comparison, identity-contract repair, unauthorized-content removal, approval repair, navigation measurements/fix, and isolated regression testing. No claim that all previous tasks are done is justified by this audit.
