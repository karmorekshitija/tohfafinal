# Tohfa — incremental UI implementation plan for Anti-Gravity

**Status:** Planning deliverable, not an implementation or deployment instruction.  
**Date:** 16 October 2026.  
**Owner intent:** Improve the UI of the previously reviewed marketplace pages, taking restrained inspiration from iOS. Cover mobile and desktop precisely. Keep Seller Studio structure and behavior substantially unchanged.  
**Companion:** Read `ANTIGRAVITY_UI_VISUAL_SPEC.md` for design values and per-page layouts; read `ANTIGRAVITY_UI_ACCEPTANCE_CHECKLIST.md` for required evidence.

## 1. Scope contract — read before changing anything

This plan supersedes the earlier audit's broad redesign recommendations for this work package. The previous report identifies opportunities; it does not authorize implementing all of them.

**Permitted in a future implementation:** scoped CSS, typography, spacing, borders, surfaces, responsive sizing, alignment, visual grouping, icon sizing, focus styling, accessible names/label associations, and narrowly scoped markup/class adjustments necessary for those visual changes. Approved neutral static copy changes are explicitly listed in the visual spec.

**Not permitted:** backend, APIs, database, authentication/session logic, pricing, fees, payments, stock defaults, product types, ranking, filters, checkout, order status rules, drafts/storage, notification delivery, subscriptions, verification logic, URL structure, data formatting semantics, or infrastructure changes. Do not change business behavior because it is implemented in a frontend file.

**Seller Studio limitation:** preserve all nine navigation destinations, their order, page section order, field order, number of steps, status tabs, dropdown options, save boundaries, existing dialogs, and action labels. Improve readability and containment only. Do not implement Today/Products/Orders/Money/More, a new dashboard experience, a listing wizard, or settings subpages.

**Change character:** recognizable Tohfa after each phase. Preserve the pine/ivory identity, logo, imagery, page purpose, content, information order, and working behavior. No framework migration, component-tree rewrite, new animation library, icon pack, native-iOS imitation, dark mode, or generated replacement imagery.

**Existing protection rules:** `LOCK_MANIFEST.md` and `.agents/rules/protect-buyer-admin.md` describe protected buyer/auth/components/admin zones. This document is a requested plan; it does not edit those zones or broadly unlock them. Apply the user's explicit scope and applicable authorization when implementation is requested. Do not modify the protection files, remove protections, or treat this plan as permission to alter admin/backend. The old rebuild instruction in `docs/SCOPE.md` is not applicable to this incremental task; the current user explicitly rejects abrupt changes.

Do not repair unrelated defects opportunistically. Record them in a deferred list. Do not suppress an existing failure merely to make screenshots attractive.

## 2. Evidence and limits

The 15 October audit inspected the live public home, mobile product, search, empty cart, seller recruitment/login, ZipGift entry, and ten authenticated seller pages. Seller mobile screenshots covered dashboard, add-product, and orders. The account had no listings/orders. No real transactions were performed. Product variants, populated tables, and completed fulfillment therefore need local preview fixtures and later authorized test-account checks.

This plan also inspected the current source on 16 October. It does not assume local source is byte-identical to deployment. Capture fresh baseline screenshots before implementation. The existing audit report remains at `C:/Users/ACER/.codex/visualizations/2026/10/15/01a13fea-a5a4-7b73-bdd3-e151f69e1dea/Tohfa-UX-Seller-Audit.md`.

Observed code risks relevant to styling:

- Vite multi-page HTML + vanilla JavaScript + Tailwind **3.4**, not React/Next or Tailwind 4.
- Current page paths are `frontend/src/buyer/*.html` and `frontend/src/seller/*.html`; README references to desktop/mobile folders are stale for these pages.
- Much buyer rendering lives in inline modules in the HTML. A similarly named `.js` file is not proof of runtime ownership.
- `frontend/src/tailwind.css` imports `./styles/tokens.css` and `./styles/responsive.css`. A separate `frontend/src/responsive.css` is explicitly loaded on some pages. Both contain broad rules and `!important` declarations. Do not add a third generic override layer or consolidate the two files during this work.
- `frontend/src/styles/tailwind.css` also exists. Do not assume it is the entry imported by the reviewed pages; their links point to `/src/tailwind.css`.
- Seller custom elements inject their own stylesheet from `frontend/src/components/seller-components.js`. This, page-local styles, and responsive overrides compete. The old `frontend/src/js/sellerLayout.js` is not the current reviewed shell.
- Global tokens and Tailwind disagree on some font and background choices. Resolve only inside the scoped UI treatment, not with a global replacement.

## 3. Exact coverage

| ID | Screen | Source owner | Extent |
|---|---|---|---|
| B01 | Marketplace home | `frontend/src/buyer/home.html` | Existing content and sections, visual refinement |
| B02 | Search idle/typing/results | `frontend/src/buyer/search.html` | Existing modes only; no new filtering |
| B03 | Product detail | `frontend/src/buyer/product.html` | Existing gallery, info, options, estimator, reviews, related items |
| B04 | Empty cart | `frontend/src/buyer/cart-empty.html` | Empty state and recommendations |
| B05 | Login | `frontend/src/auth/login.html` | Form layout and presentation |
| B06 | Become a seller | `frontend/src/auth/signup-seller.html` | Existing assisted-onboarding contact page |
| B07 | ZipGift | `frontend/src/buyer/zip-gift.html` | Existing placeholder layout only; preserve auth gating |
| S01 | Dashboard | `frontend/src/seller/dashboard.html` | Visual polish only |
| S02 | Add product | `frontend/src/seller/add-product.html`, presentation markup in `add-product.js` | Existing single-page form |
| S03 | Catalog | `frontend/src/seller/catalog.html` | Toolbar, cards/table, states |
| S04 | Customized | `frontend/src/seller/customized-products.html` | Existing products/orders views |
| S05 | Orders | `frontend/src/seller/orders.html` | Existing filters, list and detail overlay |
| S06 | Payouts | `frontend/src/seller/payouts.html` | Existing financial content, formatting and actions |
| S07 | Profile/settings | `frontend/src/seller/profile.html` | Existing sections and save boundaries |
| S08 | Plans | `frontend/src/seller/plans.html` | Existing commercial content and actions |
| S09 | Analytics | `frontend/src/seller/analytics.html` | Existing chart/metric/error layout |
| S10 | Reviews | `frontend/src/seller/reviews.html` | Existing summaries, tabs, replies/settings controls |

Other pages receive **regression checks only**, not new designs: populated cart, checkout, category pages, buyer profile/wishlist, seller edit-product/order-detail, signup-buyer, and admin. Shared changes must not leak into them. No full functional audit is implied by a screenshot check.

## 4. Phase 0 — baseline and documentation discovery

### P0.1 — create a clean record of the starting point

Read `docs/SCOPE.md`, `docs/DESIGN_GUIDELINES.md`, protection files, all three documents in this handoff, and `frontend/package.json`. Run `git status --short` and record existing changes. At planning time an existing deletion of `docs/tohfa-bug-audit-remediation-plan.pdf` was present; do not restore, stage, or otherwise touch unrelated work.

Record the branch/commit and source-vs-live difference. Do not overwrite other work or create a duplicate frontend. Use a `codex/` branch only if branching is part of the authorized implementation environment.

**Output:** implementation log with baseline commit, existing changes, page checklist, test environment and missing fixtures. No code modification in P0.

### P0.2 — inspect actual runtime owners

For every scoped screen, record loaded stylesheet order, page-local style blocks, injected styles, scripts, templates, and selectors used for event delegation. Inspect the relevant markup and its handler before changing it.

Use these existing anchors; locate them by symbol/ID rather than assuming line numbers remain fixed:

| Owner | Anchors to inspect and preserve |
|---|---|
| `buyer/home.html` | Inline `createProductCard`, `#homepage-hero-search-input`, `#product-feed-grid`, `#sponsored-product-grid`, `#category-rows-container`, `#tohfa-buyer-bottom-nav` |
| `buyer/search.html` | `#idle-view`, `#typing-view`, `#results-view`, `#search-input`, `#sort-select`, `#results-grid`, inline card templates |
| `buyer/product.html` | Inline module; gallery, quantity, personalization, buy controls, sticky purchase bar, PIN estimator, product JSON-LD |
| `buyer/cart-empty.html` | `#popular-categories-container`, `#empty-cart-recommendations-grid` |
| `auth/login.html` | `#email`, `#password`, `#toggle-pw-btn`, `#loginSubmitBtn`, error container |
| `components/tohfa-include.js` | `insertComponents`, `executeFooterScripts`, `tohfa-navbar-loaded`; read-only behavior contract |
| `components/tohfa-footer.html` | `openAboutModal`, `handleFooterContactClick`, existing modal handlers |
| `components/seller-components.js` | `injectGlobalStyles`, `seller-layout`, `seller-sidebar`, `seller-topbar`, `.seller-main-panel`, `.seller-topbar-header`, `.sidebar-link`, `fetchSellerProfile` |
| `seller/add-product.js` | Existing draft/validation/publish handlers and dynamic variant markup; only class/label-association changes permitted |
| `seller/orders.html` | `filter-btn`, existing order/detail renderers and bound action selectors |

**Output:** selector inventory, screenshots, and a short CSS ownership map. Never invent element IDs from this plan; check the current file when an ID is not given.

### P0.3 — allowed implementation primitives

Use the installed Tailwind 3 utility system, existing CSS files, CSS custom properties, media queries, Grid/Flexbox, `minmax(0,1fr)`, `min-width:0`, `aspect-ratio`, `:focus-visible`, `prefers-reduced-motion`, and `env(safe-area-inset-bottom, 0px)`. Use existing Material Symbols and existing fonts. Keep standard native inputs/selects and browser zoom.

Do not invent service methods, design-system packages, new endpoints, chart APIs, dynamic Tailwind class names requiring an unconfigured safelist, Tailwind 4 directives, or a new frontend framework. Retain existing native form types and constraints.

Documentation: local `frontend/package.json`, `frontend/tailwind.config.js`, the actual loaded styles, and references in the visual spec. This is a CSS/markup task; no new application API is needed.

### P0.4 — establish checks before editing

Run `npm --prefix frontend run check:categories` and `npm --prefix frontend run check:regressions`; record baseline failures. Capture a baseline build if practical with existing dependencies. Do not install/update dependencies just to obtain a green baseline. Existing failures outside scope are recorded, not repaired or hidden.

**Phase exit:** baseline and ownership map complete, targeted source files identified, no application modifications.

## 5. Phase 1 — scoped design foundation

### P1.1 — opt-in visual treatment

Create exactly one new stylesheet: `frontend/src/styles/ui-refinement.css`. It is the sole owner of this refinement's reusable visual rules. Add a `data-ui-refinement="buyer"`, `"auth"`, or `"seller"` attribute to the relevant existing body, and a page marker such as `data-ui-page="home"`. These attributes are proposed additions, not existing APIs.

Load `/src/styles/ui-refinement.css` on the allowlisted pages only, after existing stylesheet links and page style blocks where practical. Do not edit global imports to activate the treatment everywhere. Keep selectors under `[data-ui-refinement]`; page exceptions must also include `[data-ui-page]`.

Define additive `--ui-*` variables inside that scope. Do not redefine the shared `--text-xs`, Tailwind `text-xs`, or existing palette globally. No wildcard font resets; explicitly exclude icon glyphs, logo treatment, technical codes, and third-party controls.

**Cascade rule:** first fix the owning page's conflicting visual class or inline style if safe. If an existing external `!important` rule still wins, use the narrowest scoped override and document the exact conflict. Do not add `!important` to every rule. Do not remove global rules for the sake of one page. Dynamically injected seller styles require a computed-style check after mount.

**Verification:** styles have no effect without the opt-in marker; shared footer/header on unmarked admin/checkout pages remain unchanged; no duplicate stylesheet injection; final computed font/spacing values match the visual spec.

### P1.2 — typography and surfaces

Implement visual spec V01–V05: body/type roles, spacing, colour contrast, corners and focus states. Use new semantic classes only where explicit markup roles are needed, e.g. `ui-page-title`, `ui-field-label`, `ui-product-card`. All selectors remain scoped. These classes are proposed, not assumed to exist.

Retain DM Sans for UI and Playfair Display for existing editorial headings; leave logo lettering unchanged. Stop using monospace for ordinary new UI labels; do not mass-replace existing identifier/code formatting. Keep seller page titles recognizable and use the conservative seller sizing specified.

**Verification:** ₹ renders; long headings wrap; font fallback is usable; icon ligatures still render as icons; no 9–11px actionable labels in changed components; 200% zoom retains information.

### P1.3 — shared component presentation

Style the existing buyer header, bottom navigation, footer, cards, input controls, buttons, existing dialogs and assistant launcher according to V06–V10. Preserve all destinations, tab counts, visibility/auth rules, event handlers and dialog triggers. Some headers are inline copies; style their existing markup consistently without introducing another header or extracting a shared renderer.

Keep existing active/disabled/loading classes authoritative. Do not accidentally override `.hidden`, inline `display:none`, `disabled`, `aria-hidden`, status classes or out-of-stock treatment. A CSS rule must not make an unavailable action clickable-looking or visible.

**Verification:** one activation produces one original action; cart/wishlist handlers still identify the same product; About/Contact open existing modals; keyboard focus is visible; no chat/CTA/nav collision.

**Phase exit:** demonstrate home, product and one seller form at 390px and 1440px; verify unmarked checkout/admin screenshots are unchanged. Continue only after correcting visual regressions, not by layering further overrides.

## 6. Phase 2 — marketplace and access pages

Each task uses the matching detailed layout in `ANTIGRAVITY_UI_VISUAL_SPEC.md`. Change only presentation in the listed owner; dynamically generated markup must receive the same classes as initial HTML.

### P2.1 / B01 — home

Apply B01 dimensions, typography, card treatment, heading alignment and rail spacing. Keep section order, result counts, sponsored order, query behavior, category/occasion links, lazy loading, and existing hero image. Do not remove ZipGift or sponsored inventory. Do not build a new filter or personalization engine.

All rendering branches in `createProductCard` need consistent visuals: ready-made, customizable/options, wishlist state, sold-out, sponsored and ordinary cards. Preserve branch decisions and data attributes exactly.

**Done:** hero/search/occasions fit mobile width; 2/3/4-column feed follows spec; rails scroll without page overflow; cards retain readable price/title and original action; no content is hidden to shorten the page.

### P2.2 / B02 — search

Apply layout to all three existing modes and all inline card renderers, including suggestions, seller/category matches, results, sort and bottom count. Do not add filter controls that lack a working existing implementation. Do not alter debounce, queries, pagination, ranking, result counts, or recent-search storage.

**Done:** idle → typing → results looks consistent; clear/search/sort retain behavior; long terms and seller names wrap; native select works at 320px; loading and error states keep existing visibility behavior.

### P2.3 / B03 — product

Apply gallery/detail proportions, product typography, control sizing and existing sticky purchase-bar containment. Keep gallery image order/crop semantics and all dynamic variants/customization controls. Group existing information visually without changing its order or moving it into hidden accordions.

Keep each purchase control's existing handler; do not create a new CTA or duplicate form. Preserve price calculation, quantity, personalization values, PIN check, delivery claims, JSON-LD, and image lightbox behavior. If the purchase bar and bottom nav coexist, resolve CSS offsets rather than deleting a destination.

**Done:** readable full product name; no price clipping; thumbnail controls 44px; custom text/photo/options visible when originally eligible; all bottom content reachable above fixed controls; no layout jump when data loads.

### P2.4 / B04 — empty cart

Reduce ornamental scale, apply the approved heading/body copy, keep existing Explore Categories and real recommendations. Preserve the cart-empty redirect condition; do not change populated cart.

**Done:** clear empty state within the initial phone viewport where text scaling permits; recommendation cards match home; existing category links and product URLs unchanged.

### P2.5 / B05 — login

Apply form width, label/input spacing, full-width primary button and error presentation. Preserve username/email/mobile support as implemented, password toggle, Google button, reset/signup links, redirects and validation. Do not change the login label's meaning or invent OTP support.

**Done:** password manager/autofill still works; long error wraps without pushing actions offscreen permanently; keyboard does not trap content; header links wrap without overlap.

### P2.6 / B06 — seller recruitment

Polish current assisted-onboarding page, contact links and WhatsApp CTA. Preserve actual phone/email/WhatsApp destination and message, target behavior and sign-in links. Do not add response-time, fee, eligibility or verification promises without separately approved business content.

**Done:** phone/email strings wrap; WhatsApp CTA has clear prominence; desktop/mobile use one layout tree.

### P2.7 / B07 — ZipGift

Apply typography, bounded illustration size and spacing to existing placeholder only. Preserve access behavior, content and navigation. Do not implement ZipGift, remove it from nav, or alter authentication to expose the page.

**Done:** placeholder is readable at supported sizes in an authorized local/test state; public redirect remains identical. If unavailable for live visual inspection, mark it as source/local-verified rather than claiming a live review.

**Phase exit:** all B tasks have before/after screenshots and behavior parity. No new data/API surface, new filter, removed section, or changed navigation destination.

## 7. Phase 3 — Seller Studio visual polish, deliberately limited

### P3.0 — shell

Read `seller-components.js`; do not edit legacy `sellerLayout.js`. Apply scoped CSS to the existing custom elements. Keep the 130px desktop sidebar, 60px topbar, current desktop threshold at 1024px, existing hamburger/drawer below it, all nav items and their order. Improve labels to 12/16px, icon alignment, active contrast, button targets and content insets. Permit nav's own vertical scrolling on short screens without losing logout/view-store actions. Do not add buyer bottom tabs to Seller Studio.

Preserve the existing desktop `.seller-main-panel` internal scroll container and the mobile switch to document scrolling. Do not switch scroll architecture. Inspect effective topbar and panel offsets after dynamic styles mount; eliminate double padding only inside scoped seller pages. Preserve existing drawer toggling and profile/logout behavior.

**Done:** no obscured first heading, no clipped final action, drawer remains dismissible, all nine destinations reachable at 390px and 1024px.

### P3.1 / S01 — dashboard

Apply specified type, compact spacing and equal metric alignment. Retain greeting/date, period controls, KPI → stock → recent orders → quick actions → holiday → chart order. Keep holiday controls and graph functionality. Do not redesign for onboarding, invent data, hide zero metrics, or change the all-stocked message.

### P3.2 / S02 — add product

Keep the single-page form, four existing sections and conditional customization area. Apply 16px inputs, 14px labels, useful line height, clear section separation, responsive existing field pairs, readable upload surface, and non-overlapping bottom action group. Keep both existing desktop/mobile action presentations as currently implemented; do not create another form/tree. Style dynamic variant rows without changing parsing, photo upload, validation, defaults, storage or publish logic.

### P3.3 / S03 — catalog

Align summary chips, existing filters/search and New Listing. Keep current card/table mode and controls. Improve empty/loading/error layout and table readability. A table may scroll inside its own labelled region; do not hide action columns or turn rows into a new data renderer.

### P3.4 / S04 — customized

Restyle existing item/order summary boxes, segmented view buttons, filters and empty panel. Keep Pre-Made Catalog link, Direct-Cart text, products/orders distinction and all table columns. Improve low-contrast headings; do not merge this page with catalog/orders.

### P3.5 / S05 — orders

Improve status-tab target sizing, ensure `shrink-0` tabs can scroll, align date/search controls, and style existing metrics/list/detail overlay. Preserve statuses, transitions, order data, filtering and selection. Do not change 100% fallback, generate labels, alter orders or build a new fulfillment workflow.

### P3.6 / S06 — payouts

Apply hierarchy to existing metrics, sections and tables; use tabular digits and wrapping. Keep Request Payout location within its current group, receiving details, tax, invoices and disputes. No changes to money calculations, labels such as Verified, fallback data, masking, withdrawal logic or settlement claims in this package.

### P3.7 / S07 — profile/settings

Improve section titles, label/control rhythm, existing two-column groups, image preview containment and per-section Save alignment. Preserve section/field order, tabs, save boundaries, existing badges and validation. Do not introduce settings subpages, accordions, address-copy logic or bank verification.

### P3.8 / S08 — plans

Align comparable card elements and button rows, use readable feature lists and preserve the existing mobile horizontal snap rail. Preserve displayed prices/discounts/GST/slot counts/promises/renewal text, plan emphasis, plan order and checkout actions. Do not modify subscription logic or claim business-content correctness.

### P3.9 / S09 — analytics

Improve existing metric grid, chart containers, range controls, table and error presentation. Keep chart datasets, number formats, filters and state conditions. Do not suppress failed states, invent chart data, or relabel zero values in this package. The known contradictory error/zero behavior is deferred, not fixed cosmetically.

### P3.10 / S10 — reviews

Improve summary, rating distribution, tabs, review cards and reply/settings controls. Keep star values/counts, filtering, reply handlers and request settings. Do not submit a review response or change automatic-request settings during verification.

**Acceptance for every S task:** match the per-page spec at 390 and 1440; exercise long/empty/error visual states; compare original action and field inventory; no navigation, section order, data, state condition or payload differences. Seller workflow changes are a separate later project.

## 8. Phase 4 — verification and handoff

### P4.1 — page/state/viewport verification

Execute the companion checklist. Minimum baseline widths: 320, 390, 768, 1024, 1440 and 1920 CSS px. Check both sides of 768/1024 breakpoints. Test 200% zoom and 320px-equivalent reflow; inspect keyboard focus and mobile safe areas. Chrome/Edge emulation is not proof of iOS Safari behavior; identify any real Safari checks not performed.

Use isolated local fixtures/intercepted responses for empty/populated/long/error variants where no test data exists. Fixtures must never enter production rendering, the database, or fallback logic. Do not create production products/orders, send WhatsApp messages, request payouts, or purchase a subscription for screenshot testing.

### P4.2 — source and behavior parity

Review `git diff --name-only`, `git diff --check`, and actual changed hunks. All hunks must be presentation-related or explicitly permitted accessibility/static-copy changes. Verify original IDs, name/type/required/min/max attributes, data attributes, URLs, event-binding selectors, and conditional rendering branches. Preserve SEO/canonical/JSON-LD and data escaping.

Check that new styles do not globally match `html`, `body`, `section`, `.flex-row`, all `button`, all headings or Tailwind utilities outside scope. Confirm no global overflow hiding was added to conceal a defect. Check dynamic templates, not only static HTML.

Run existing category/regression checks and `npm --prefix frontend run build` (which runs prebuild and postbuild). Report pre-existing failures accurately. Do not weaken tests, edit build scripts, update dependencies or touch backend to obtain a pass. Do not manually edit `dist`.

### P4.3 — completion evidence

For each task record: files/anchors changed, screenshot paths, viewports/states checked, original behavior preserved, results, limitations, and deferred issues. Complete a phase before starting broad work on the next. If a task cannot be completed without logic changes, leave the conflicting portion unchanged and document it rather than inventing a workaround.

No production deployment, merge or publication is part of this plan. Supply a reviewable implementation diff when implementation is separately requested.

## 9. Deferred backlog — do not silently implement

These remain important findings but fall outside the user's current UI-only scope:

- True payout verification; sample earnings fallback; contradictory analytics values; zero-order on-time rate.
- Account-backed drafts, reliable saved-status logic, stock defaults, fees/take-home calculations.
- Split made-to-order vs personalization semantics; row-based customization editor; multi-step listing.
- New-seller dashboard; navigation consolidation; restructuring settings; fulfillment redesign.
- WhatsApp behavior, delivery, templates, login deep links and notification configuration.
- Remove/repurpose ZipGift; new buyer filters; ranking/sponsored policy; homepage section removal or fewer fetched products.
- Seller onboarding SLA/fees, subscription claims, paid trust badges and verification policy.
- Backend bugs, auth gating, transactional testing, admin redesign and asset/CDN service changes.

Do not make questionable claims appear more trustworthy through stronger badges or celebratory visual emphasis. Preserve current semantics while recording the issue for later correction.

## 10. Copy-ready Anti-Gravity handoff

> This is an incremental UI-only refinement of Tohfa. Read `docs/ANTIGRAVITY_UI_ONLY_IMPLEMENTATION_PLAN.md`, `docs/ANTIGRAVITY_UI_VISUAL_SPEC.md`, and `docs/ANTIGRAVITY_UI_ACCEPTANCE_CHECKLIST.md` completely before work. Follow the current user authorization and repository protections. Begin with Phase 0; inventory the actual loaded code and capture baselines. Use existing Vite/vanilla JS/Tailwind 3.4. Keep all APIs, auth, data, routes, business behavior, navigation and Seller Studio workflows unchanged. Implement only the task currently assigned; no full rebuild, dependency updates, unrelated cleanup or deployment. Use the exact design values and page scope. Preserve event selectors and dynamic rendering branches. Produce phase-specific screenshots, behavior-parity evidence and a small reviewed diff. If the requested visual result requires out-of-scope behavior changes, document that portion and leave it unchanged. Never invent data or hide a known failure to make the UI appear complete.
