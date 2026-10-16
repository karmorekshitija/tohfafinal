# Tohfa UI refinement — implementation and acceptance checklist

**Date:** 16 October 2026. All checkboxes below are future work. None claims that implementation or browser verification has occurred in the planning task.

## A. Task order and completion record

Execute in the sequence below. A phase checkpoint means review the diff and evidence and resolve regressions before continuing; it does not mean requesting user confirmation for every file. The plan itself is not authorization to deploy.

| Task | Dependency | Required output |
|---|---|---|
| P0.1 Baseline | None | Commit, dirty files, runtime/environment record |
| P0.2 Ownership | P0.1 | Stylesheet/script/selector map per page |
| P0.3 Allowed primitives | P0.2 | Confirmed existing stack and no new API/dependency need |
| P0.4 Baseline checks | P0.1 | Category/regression/build baseline results |
| P1.1 Scoped stylesheet | P0 complete | Opt-in marker, scoped variables, no global leak |
| P1.2 Type/surfaces | P1.1 | Computed styles, contrast checks, fallback checks |
| P1.3 Shared presentation | P1.2 | Header/card/form/dialog/chat parity evidence |
| P2.1 Home | P1 complete | B01 screenshots and action parity |
| P2.2 Search | P2.1 | B02 three-mode and pagination checks |
| P2.3 Product | P2.1 | B03 dynamic options and sticky-area checks |
| P2.4 Empty cart | P2.1 | B04 copy/layout/link checks |
| P2.5 Login | P1 complete | B05 form/autofill/error checks |
| P2.6 Seller recruitment | P2.5 | B06 contact layout/destination checks |
| P2.7 ZipGift | P1 complete | B07 placeholder/gating parity |
| P3.0 Seller shell | P1 complete | Sidebar/drawer/scroll-owner checks |
| P3.1 Dashboard | P3.0 | S01 structure/value inventory unchanged |
| P3.2 Add product | P3.0 | S02 all fields/defaults/actions unchanged |
| P3.3 Catalog | P3.0 | S03 toolbar/table/mobile renderer parity |
| P3.4 Customized | P3.0 | S04 both views/filters unchanged |
| P3.5 Orders | P3.0 | S05 tabs/list/detail overlay unchanged |
| P3.6 Payouts | P3.0 | S06 data/masking/actions unchanged |
| P3.7 Profile | P3.0 | S07 sections/fields/save boundaries unchanged |
| P3.8 Plans | P3.0 | S08 content/commercial actions unchanged |
| P3.9 Analytics | P3.0 | S09 metrics/charts/state behavior unchanged |
| P3.10 Reviews | P3.0 | S10 counts/filters/replies/settings unchanged |
| P4.1 Responsive/accessibility | All page tasks | Viewport/state matrix and limitations |
| P4.2 Diff/build parity | P4.1 | Reviewed hunks and existing check results |
| P4.3 Handoff | P4.2 | Screenshot index, task log, deferred issues |

For each task use this record:

```text
Task ID:
Baseline commit:
Files and exact anchors changed:
Visual intent:
Selectors/attributes/handlers preserved:
Before screenshot paths:
After screenshot paths:
Viewport/state/browser checks:
Observed result:
Pre-existing failures or remaining limitations:
Any deviation from spec and concrete reason:
Scope review: no data, API, route, auth, business or workflow changes
```

## B. File allowlist and edit boundaries

- [ ] New presentation stylesheet only: `frontend/src/styles/ui-refinement.css`.
- [ ] Scoped page HTML owners only: the 17 screens in the implementation plan.
- [ ] `frontend/src/seller/add-product.js`: only presentation classes/markup label associations in existing renderers if needed; no draft/validation/upload/publish logic edits.
- [ ] Inline scripts in page HTML: string-template classes/visual markup only when necessary; no handler/condition/payload/query changes.
- [ ] Shared component templates (`seller-components.js`, `tohfa-navbar.html`, `tohfa-footer.html`, `ReportWidget.js`) are **read first, edit only if a verified scoped visual hook is missing**. Any added class/aria attribute must preserve rendering and handlers; retain unmarked-page output/appearance. Prefer styling existing hooks. No fetch/session/assistant logic edits.
- [ ] No direct edits to global tokens, Tailwind configuration, either existing responsive stylesheet, include-loader behavior or legacy sellerLayout.js as a shortcut.
- [ ] No changes to backend, database, API files, auth utilities, route configuration, package/lock files, `.agents`, protection manifests, admin source, or manually edited generated `dist`.
- [ ] Existing unrelated working-tree changes remain untouched.
- [ ] No new desktop/mobile page copies, shadow implementations, generated fake product images or unused styles.

If the scoped design cannot be implemented within these boundaries, record the particular conflict and leave that part unchanged rather than silently expanding scope.

## C. Browser and viewport matrix

Use the same data, zoom and browser state for each before/after pair. Wait for fonts/data/visible lazy images; scroll the actual container. Do not mistake initial lazy-load placeholders for failed images. Record actual CSS viewport rather than window dimensions.

| Width × height | Required purpose |
|---|---|
| 320 × 740 | Narrow phone, long labels, two-column card fit |
| 390 × 844 | Main mobile reference for every screen |
| 430 × 932 | Larger phone, card/toolbar balance |
| 768 × 1024 | Buyer nav breakpoint/tablet |
| 1024 × 768 | Seller sidebar threshold/short laptop |
| 1440 × 1000 | Main desktop reference for every screen |
| 1920 × 1080 | Max-width containment and whitespace |

Additionally check 767/768 and 1023/1024 widths, 844×390 landscape, browser zoom 200%, and desktop 1280px at 400% for 320px-equivalent reflow. Do not claim full WCAG conformance from these limited checks.

Browser coverage: Chromium for repeatable screenshots; actual iOS Safari for keyboard, safe-area, native select and fixed bars when available; one desktop Safari or Firefox layout check where available. Explicitly mark unavailable environments. Emulation does not verify real on-screen keyboard behavior.

## D. Per-page state coverage

| Page | Required visual states / interactions to preserve |
|---|---|
| Home | Loaded feed, sponsored/normal/options/sold-out card, long title, lazy image, rails, auth badge visibility |
| Search | Idle, typing/suggestions, results, no results, loading/error if existing, sort, continuation sentinel |
| Product | Gallery/thumb/lightbox, long title, quantity, personalization types, variant selection, unavailable states, PIN response, related cards, sticky bar |
| Empty cart | Empty message, category wrapping, recommendations including long names |
| Login | Empty, focused, password visibility, autofill, loading/error, responsive header; no auth-flow redesign |
| Seller recruitment | Long email/phone wrapping, WhatsApp target, sign-in link |
| ZipGift | Existing gated public entry and authorized placeholder state; no new active controls |
| Seller dashboard | Empty metrics, large fixture amounts, date wrap, quick actions, holiday controls and chart container |
| Add product | Default form, conditional customization, variants, media previews, existing validation/preview, bottom actions; no publish |
| Catalog | Empty, loading, populated local fixture, long titles, filters, current mobile rows/actions |
| Customized | Products/orders existing views, empty/populated fixture, tabs, filters, table/card layouts |
| Orders | Tabs/search/date, empty, populated local fixture, existing detail overlay and long address/tracking text |
| Payouts | Zero/large amounts, masked receiving details, tables, existing unavailable state; no payout request |
| Profile | Each existing section, long field values, focus, image previews, bank/pickup areas; no save |
| Plans | Current/non-current plans, long feature lists, mobile rail, existing modal; no checkout |
| Analytics | Empty, populated chart fixture, existing failure display, range layout, table |
| Reviews | Empty, long-review fixture, distribution, tabs, existing reply/settings modal; no message/settings submission |

Fixture data may be provided through an isolated local preview or intercepted response. Do not add mock values to application fallback code or persist them to production. Any tests needing a valid session use a dedicated authorized test account, and credentials must not be written in the plan, logs or screenshots.

## E. Layout acceptance

- [ ] Body does not horizontally overflow. Existing `overflow-x:hidden` is not accepted as proof: inspect element bounding boxes and clipped content too.
- [ ] All text, prices and buttons remain visible at 320px and 200% zoom; no price/title clipped to force equal heights.
- [ ] Product grid has appropriate 2/3/4 columns; contained product rails still scroll; no page-level horizontal rail overflow.
- [ ] Page gutters and headings align; no accumulated padding from global + page + injected style layers.
- [ ] Fixed header never covers first content; last action and footer remain reachable.
- [ ] Bottom nav, product purchase bar, add-product action group and chat launcher never overlap interactive controls.
- [ ] Safe-area padding is applied once per bottommost fixed stack; visual measurements remain valid if buttons wrap.
- [ ] Seller desktop internal scroll and mobile document scroll still work; drawer can open/close after resizing.
- [ ] Text zoom does not cut off sidebar destinations, dialog close/send controls, or required form fields.
- [ ] Modals/overlays are above navigation/chat, bounded by viewport, with their existing controls reachable.
- [ ] Portrait and landscape images retain intended proportions; discovery crops do not distort.
- [ ] No new long empty vertical gaps, forced `100vh` panels or decorative scroll animations.

## F. Typography and accessibility presentation

- [ ] Ordinary body is 16/24; fields 16/24; field labels 14/20; compact metadata at least 13px except specified 12px nav/badges.
- [ ] Fonts load or fall back without unusable layout changes; ₹ and Indian names render; Material Symbols are not replaced by body font.
- [ ] Controls meet the project's 44px standalone target, primary actions 48px, with no overlapping click areas.
- [ ] Native input types/autocomplete/name/required/min/max/disabled values preserved.
- [ ] Labels remain associated with their inputs; icon-only controls have useful accessible names without replacing meaningful visible text.
- [ ] Text contrast checked on each actual surface; selected/hover/error/placeholder styles checked, including opacity.
- [ ] Essential control boundaries and focus state are distinguishable; no `outline:none` without a visible replacement.
- [ ] Keyboard order remains logical and focused elements are visible above fixed bars.
- [ ] Reduced-motion preference respected; no new motion required to understand content.
- [ ] No `user-scalable=no`, maximum-scale restriction or suppressed browser zoom.

## G. Behavioral parity checks

These are regression checks, not permission to fix or extend the underlying features.

- [ ] Existing links/routes/query parameters unchanged, including ZipGift/login redirects and seller View Store.
- [ ] Product card click, wishlist and cart/select-options action each use their original handler and product ID; no duplicated events.
- [ ] Search query/sort/recent search/sentinel behavior unchanged.
- [ ] Product quantity/options/customization price behavior unchanged in isolated test state.
- [ ] Auth field semantics, Google login integration and role-based redirect unchanged.
- [ ] Seller nav destinations/order and drawer control unchanged.
- [ ] Add-product defaults, conditional visibility, draft key, validation, upload and publish payload unchanged.
- [ ] Catalog/Orders filters, row child positions, status choices and original action selectors unchanged.
- [ ] Payment amounts, masking, label claims, request behavior, plan prices/content and renewal terms unchanged.
- [ ] Settings field/section order and per-section saves unchanged.
- [ ] Charts/data conditions, review filtering/reply handlers and WhatsApp/assistant endpoints unchanged.
- [ ] No hidden-state override reveals unauthorized, unavailable, empty or duplicate elements.
- [ ] SEO title/canonical/structured data and image alt intent preserved.

## H. Unchanged-page smoke tests

Because the codebase shares styles/components, compare at least one existing page from each relevant area before/after: category listing, populated cart, checkout, buyer account, signup-buyer, seller edit-product, seller order-detail, payment-history, settings/billing and admin. Use authorized local/read-only states. No intended visual redesign on these pages.

If unmarked pages change, fix the scope leak in this work package. Do not redesign those pages to match the leak. If a protected page cannot be tested, report the limitation and inspect scoped CSS to reduce risk; do not claim it passed.

## I. Build and diff review

Run from the repository root:

```powershell
git status --short
git diff --name-only
git diff --check
npm --prefix frontend run check:categories
npm --prefix frontend run check:regressions
npm --prefix frontend run build
```

Build invokes the existing prebuild/postbuild chain. Retain current dependencies/configuration. Compare failures with P0 baseline; document unrelated failures rather than altering tests or source outside scope. Compilation success alone is not visual verification.

Inspect changed hunks for unexpected `fetch`, API URLs, storage calls, conditions, event binding, schema/state, currency calculation and route changes. An existing string-template hunk can contain these nearby; review the actual diff rather than rejecting a file merely because it contains JavaScript.

## J. Final handoff contents

- [ ] Task checklist with completed/partial/deferred status, never an unqualified “everything done.”
- [ ] Exact changed file list and brief purpose per file.
- [ ] Before/after screenshot index for all 17 screens at mobile and desktop references.
- [ ] Additional state/viewport results and actual browser coverage.
- [ ] Build/regression/category results with pre-existing failures separated.
- [ ] Proof of no unrelated-page styling leak and no functional/payload/navigation changes.
- [ ] Explicit deferred correctness/workflow backlog from the master plan.
- [ ] No credentials, private bank details, production customer data or session tokens in evidence.
- [ ] No deployment/merge claimed or performed as part of this UI plan.

Rollback unit: revert only the implementation task's own scoped stylesheet/markup hunks or isolated commit, after verifying no later work depends on it. Never reset the entire working tree or restore unrelated deletions. Keep each phase small enough to review and roll back independently.
