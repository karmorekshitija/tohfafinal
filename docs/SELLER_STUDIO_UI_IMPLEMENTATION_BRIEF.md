# Seller Studio: professional UI refinement implementation brief

Date: 16 October 2026
Deliverable status: implementation plan only; no implementation or verification is claimed by this document.
Audience: AntiGravity, acting as a senior frontend UI engineer and accessibility reviewer.

## 1. Assignment and decision authority

Improve the existing Seller Studio so sellers can read, find and operate its existing tools comfortably on mobile and desktop. Use restrained iOS-inspired clarity while retaining Tohfa's pine green, warm ivory, existing fonts and identity. Deliver an incremental refinement, not a new application.

The user's current instruction is decisive: UI changes only; no backend changes; no added or removed features; keep Plans important and directly accessible. This brief supersedes older seller visual prescriptions only where explicitly specified here, including the 130px desktop rail. It does not activate the older buyer/auth work package or the earlier Today/Products/Orders/Money/More proposal. Do not implement earlier suggestions for new queues, filters, counters, dashboards, listing wizards or data corrections.

Read the repository instructions and current source before implementation. The user has expressly authorized Seller Studio UI work. `frontend/src/components/seller-components.js` is a shared/protected owner: this brief identifies only its seller presentation template as relevant to that authorization, not a general component unlock. Keep any permitted edits opt-in and restricted as described below. If the implementation environment independently blocks that file, complete the CSS/page work and report the exact blocked grouping change; never create a replacement sidebar or a script that secretly rewrites it to evade the restriction.

### Non-negotiable invariants

- Keep all nine normal-seller navigation destinations, their labels, URLs and existing active-tab mappings.
- Keep Plans in the primary menu. Do not move it into Settings, More, a collapsed group or a secondary account menu.
- Preserve existing role visibility: the current admin-switched session deliberately omits Payouts and Plans. Do not expose them through styling or change that condition.
- Preserve every existing field, option, tab, action, link, confirmation, dialog, loading/empty/error state and section-level save boundary.
- Preserve routes, query strings, API calls, request methods/payloads, response handling, authorization, validation, calculations, dates/currency formatting, storage, drafts, uploads and subscriptions.
- No backend, database, migration, authentication, dependency, deployment or environment changes.
- Do not resolve an existing business/data defect under the heading of UI cleanup. Record it separately.
- Never invent values, reviews, products, payout dates, subscription benefits, verification status, metrics, loading outcomes or success messages.
- Keep existing functional copy and commercial claims unchanged; formatting is permitted. New static copy is limited to the navigation group headings specified below and necessary accessible names for existing controls.

## 2. Verified baseline and evidence limits

At planning time the repository HEAD is `9e3095f`; record actual HEAD and dirty status again before work. Ten seller HTML files already opt into `frontend/src/styles/ui-refinement.css`. The existing stylesheet is 818 lines with 110 `!important` declarations. These numbers describe the baseline, not optimization targets.

The live shell is rendered by `frontend/src/components/seller-components.js`, using `seller-layout`, `seller-sidebar`, `.seller-main-panel` and `.seller-topbar-header`. `frontend/src/js/sellerLayout.js` is a legacy owner and is not the place to implement this work. Runtime-injected shell CSS uses `!important`; inspect the actual cascade rather than adding increasingly broad overrides.

Existing local modifications include ten seller pages, the refinement stylesheet, planning documents and `frontend/scripts/prerender_seo.mjs`; a prior PDF is already deleted. Preserve these unrelated and prior changes. Do not restore, delete, stage or overwrite them wholesale.

The previous acceptance report is not sufficient proof:

- Saved Reviews mobile and desktop screenshots show login, with zero sidebar links in the report. Correct the test session and assert the target page before measuring.
- A dashboard screenshot is obscured by its welcome tour. Capture tour-open and tour-dismissed states separately through existing controls.
- The old script checks mainly overflow and typography. Device scale factor is not browser zoom; focus styling on one element is not keyboard workflow verification.
- The latest local build compiled, but live catalog fetches failed; prerender output contained zero products/categories/sellers. A successful exit is not proof of complete SEO output.
- Analytics contains existing `3.5` conversion fallbacks. Leave the calculation unchanged in this UI scope and list it as a deferred correctness issue.

## 3. File ownership and allowed changes

| Owner | Permitted work | Forbidden work |
|---|---|---|
| `frontend/src/styles/ui-refinement.css` | Extend/consolidate scoped seller tokens, shell layout and page rules | Global selectors affecting unmarked pages, dormant buyer/auth styles |
| `frontend/src/seller/dashboard.html` | Scoped classes, wrappers with verified selector safety, presentation | Data loading, dashboard metrics, new action queues |
| `frontend/src/seller/add-product.html` | Existing form layout and visual grouping | New steps, field/default/validation changes |
| `frontend/src/seller/catalog.html` | Existing toolbar, table/cards and state presentation | New filters, stock rules, action behavior |
| `frontend/src/seller/customized-products.html` | Existing two-tab page presentation | Merge with Catalog/Orders or new custom workflow |
| `frontend/src/seller/orders.html` | Existing tabs, list/table, existing detail modal presentation | Status model, tracking/proof/fulfillment behavior |
| `frontend/src/seller/payouts.html` | Existing amounts, panels and actions presentation | Recalculate or relabel the meaning of money |
| `frontend/src/seller/profile.html` | Existing section/field/save-group presentation | New settings, combined saves, account behavior |
| `frontend/src/seller/plans.html` | Plan comparison typography, spacing, responsive layout | Prices, benefits, order, defaults, CTA logic, billing |
| `frontend/src/seller/analytics.html` | Existing cards, chart containers, filters | Chart datasets, metric definitions, fallback repairs |
| `frontend/src/seller/reviews.html` | Existing filters, review cards and modal presentation | New review filters, reply logic, notification rules |
| `frontend/src/components/seller-components.js` | Narrow opt-in seller template classes, semantic nav group headings, accessible names | Shared runtime CSS redesign, fetches, role checks, session/logout, admin switching, event-handler changes |
| `frontend/src/seller/add-product.js` | Only existing generated markup class hooks if CSS cannot reach it safely | Any executable logic or payload/default change |

Inline generated markup in the ten HTML files may receive equivalent presentation-only class hooks. Preserve escaping and every dynamic expression. Before wrapping/moving elements, inspect `querySelector`, `closest`, `children`, `nth-child`, event delegation and label associations. If selectors depend on structure, keep the structure and style it instead.

Everything else is read-only in this work package, including global styles, Tailwind configuration, responsive stylesheets, `frontend/public`, legacy layout code, API clients, all `backend/`, buyer/auth/admin, lock/rule files, package/lock files, SEO script and deployment configuration. Do not hand-edit `dist`. Ordinary builds may regenerate ignored output; report output limitations honestly.

Do not add a new CSS framework, icon library, font request, component framework, chart library, animation library or parallel desktop/mobile implementation.

## 4. Visual direction: Tohfa with restrained iOS clarity

Use readable grouped surfaces, consistent alignment, clear active states, generous touch areas and quiet separators. These are the iOS-inspired qualities to adopt. Do not imitate Apple branding or native system chrome. Do not add glass effects, backdrop blur, blue accents, floating docks, ornamental gradients, oversized hero banners, dashboard illustrations, grain, parallax, bouncy animations or decorative metric cards.

Use existing Material Symbols; keep icon meanings. Use Playfair Display sparingly for the page title/brand. Operational labels, rows, tabs and forms use DM Sans. Existing chart-series/status colors can remain when semantically necessary; do not recolor charts without keeping legend correspondence intact.

### Exact palette: reuse existing scoped tokens

| Role | Existing value |
|---|---|
| Canvas | `#FFF8E7` |
| Surface | `#FAF6EE` |
| Selected/emphasis surface | `#DCE6D8` |
| Primary text | `#1C1C1A` |
| Secondary text | `#4F6553` |
| Primary/sidebar | `#14381F` |
| Primary hover | `#285C3A` |
| Text on primary | `#FFF8E7` |
| Subtle divider | `rgba(20,56,31,0.16)` |
| Input boundary | `#7A867A` |
| Destructive text | `#B42318` |
| Focus on light surfaces | `#14381F` |

Preserve established warning/success status mappings. Do not reuse a status color for an unrelated decorative purpose. Measure actual computed contrast: ordinary text at least 4.5:1, large text 3:1, essential control boundaries/focus 3:1 against adjacent colors. If an existing muted treatment fails, use an existing darker ink token, not a new palette. Never solve contrast by removing information.

### Typography and geometry

| Element | Desktop | Mobile |
|---|---|---|
| Page title | Playfair, 28/36px, 600–700 | Playfair, 24/32px |
| Section heading | DM Sans, 18/26px, 600 | Same |
| Main body/fields | DM Sans, 16/24px | Same; inputs never below 16px |
| Table text/secondary body | DM Sans, 14/20px | Same |
| Navigation labels | DM Sans, 14/20px, 500; active 600 | Same |
| Group heading/metadata | DM Sans, 12/16px, 600 | Same; never essential long text |
| Metric value | 28/36px, tabular figures | 24/32px, tabular figures |

Use existing font weights when available; do not introduce additional font downloads. Keep IDs and dates readable with tabular figures; reserve Space Mono for short identifiers, not prose. Currency must wrap/reflow or gain width rather than truncate away meaningful digits.

Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48px. Controls/input radius 12px; surface cards 16px; dialogs 20px; compact statuses 8px. Preserve established capsule controls where replacing the shape would impair continuity. Ordinary cards use a subtle border and no heavy shadow. Existing elevated panels may use `0 4px 16px rgba(20,56,31,.08)`.

Primary controls/inputs: minimum 48px high. Compact controls/icons: minimum 44×44px hit region with no overlapping hit regions. Focus: 2px visible outline with 2px offset; ivory contrasting ring on dark backgrounds. Disabled states retain actual disabled behavior. Hover/pressed feedback changes color; transitions limited to 150–200ms color/opacity. Respect reduced motion; preserve visibility when animation is suppressed.

## 5. Navigation: retain nine destinations and add readable grouping

Preserve current link order to minimize retraining and structural risk. The earlier discussion's reordered/renamed menu is not required. Exact target:

```text
Tohfa Studio

Daily work
  Dashboard
  Catalog
  Orders
  Customized

Performance
  Payouts
  Analytics
  Reviews

Store
  Settings
  Plans

View Store
Logout
```

| Label | Existing destination | Active-tab aliases to preserve |
|---|---|---|
| Dashboard | `/seller/dashboard.html` | `home`, `dashboard` |
| Catalog | `/seller/catalog.html` | `catalog`; Add Product also uses this |
| Orders | `/seller/orders.html` | `orders` |
| Customized | `/seller/customized-products.html` | `customized`, `customised` |
| Payouts | `/seller/payouts.html` | `payments`, `payouts` |
| Analytics | `/seller/analytics.html` | `analytics` |
| Reviews | `/seller/reviews.html` | `reviews` |
| Settings | `/seller/profile.html` | `profile`, `settings` |
| Plans | `/seller/plans.html` | `plans` |

Group headings are real static text, non-interactive and expanded. Do not simulate them using pseudo-element text or make accordion groups. Retain all link elements, IDs, badges and conditional blocks. Existing customized-count and plan-pill badges retain their existing meanings and visibility; add no new badges.

For the opt-in pages only, change the visual rail to horizontal icon-and-label rows. Add dedicated class hooks rather than long utility-dependent selectors. Remove icon bottom spacing only through scoped styling. Keep active background and readable text; do not rely solely on color to identify selection. Accessible `aria-current` may mirror the existing active condition without changing it.

The shared template must preserve original output for unmarked pages. Prefer inserting the three static headings conditionally for the existing opt-in marker, leaving link sequence/structure intact. Avoid group wrappers if the current shell's node assumptions would be disturbed. Do not modify link click, drawer, profile-fetch, plan-pill, logout or admin-switch logic.

## 6. Responsive shell specification

| CSS viewport | Navigation | Content gutters | Layout |
|---|---|---|---|
| 320–767px | Existing hamburger/drawer | 16px each side | Single-column page sections |
| 768–1023px | Existing hamburger/drawer | 24px each side | Two columns only for compatible existing cards/fields |
| 1024–1279px | 216px persistent sidebar | 24px each side | Compact desktop; tables get bounded scroll |
| 1280px and above | 232px persistent sidebar | 32px each side | Content max-width 1200px, centered within remaining panel |

Keep the existing 1024px sidebar threshold and 60px topbar baseline. Header may grow for text enlargement; never clip it to force the baseline height. Sidebar nav rows are at least 44px tall, with 20–22px icons, 12px icon/text gap and 12px horizontal padding. Group labels use 16px top/8px bottom separation. Sidebar footer stays usable on short screens; navigation scrolls when necessary, without hiding Plans.

Use a scoped sidebar-width variable consistently for sidebar width, main-panel offset and topbar positioning. Inspect all three computed rectangles at 1023/1024 and 1279/1280px. Preserve desktop internal main-panel scrolling and mobile document scrolling. Do not add nested page-wide scroll containers or a second mobile header.

Mobile drawer target width: `min(288px, calc(100vw - 32px))`. Preserve the current overlay/open/close behavior; verify that overlay geometry follows the new width. No bottom navigation, extra shortcuts, hamburger replacement, swipe gestures or persistent footer action bar. Plans appears in the same expanded Store group as desktop.

Apply `min-width:0` to appropriate flex/grid children and `minmax(0,1fr)` to fluid tracks. Never hide document overflow as a substitute for locating clipped content. Tables may scroll in their own bounded labeled region; the document must not scroll horizontally. Existing tabs can scroll horizontally where needed, with a visible scrollbar/edge cue and no clipped focus ring.

Keep safe-area padding on the bottommost existing fixed surface once. Existing dialogs must fit the visible viewport with internal content scrolling and reachable close/confirmation controls. Avoid relying on fixed bottom buttons when the keyboard opens. Test actual iOS keyboard behavior if available and report if it is not.

## 7. Page-by-page instructions

All pages keep current section order and functional content. Change layout within existing sections, not information architecture or workflows. Do not build a new dashboard action queue from the previous recommendation.

### S01 Dashboard — `dashboard.html`

- Preserve onboarding warning, greeting/date, current period choices, all metrics, Low Stock Alerts, Recent Orders, Quick Actions, Holiday Mode and Store Performance Overview.
- Visually prioritize the existing onboarding warning using restrained semantic border/ink, not a giant hero. Existing alert content remains conditional.
- Use consistent metric surfaces. Existing metric cards may form a four-column desktop row when each is at least 160px; reduce to two, then one when text cannot fit. Do not remove metrics to fit.
- Keep Recent Orders readable; align existing actions with its heading. Quick Actions remain the same actions and destinations.
- Holiday Mode remains a labeled functional control with its existing explanatory text and behavior.
- Preserve welcome tour behavior. Capture both tour states; do not disable the tour in application code for screenshots.

### S02 Add Product — `add-product.html`

- Preserve the five existing groups: Product Details, Photos & Media, Pricing & Inventory, Shipping & Dimensions, Customisation Builder; preserve conditional group visibility.
- Keep field order, required/optional semantics, labels, defaults, variant controls, upload controls, preview, save/publish/draft actions exactly as implemented.
- Form content max-width 960px. Two-column desktop field rows only where existing pairs are related; single column below 768px. Long descriptions and uploads span the available width.
- Put helper/error text immediately below its existing field without altering validation. Keep existing image crop/thumbnail behavior.
- No wizard, accordion, auto-save, new preview, invented stock default, pricing guidance or changed shipping rules.

### S03 Catalog — `catalog.html`

- Preserve current search, filters, sorting, selection, bulk controls, summary values and item actions.
- Desktop: title/action row, existing toolbar, existing table. Align numeric values consistently and preserve column order.
- Mobile: keep the existing mobile renderer if present; improve its spacing without adding a second data implementation. If a table is the only current renderer for a state, retain a bounded scroll region rather than dropping columns.
- Wrap toolbar controls in DOM order; search may take full width. Do not collapse actions into a newly invented overflow menu.
- Preserve loading, empty, error and row-action states separately.

### S04 Customized — `customized-products.html`

- Preserve both Customized Products and Customized Orders tabs and their counters. Preserve the Pre-Made Catalog link and all filters/actions.
- Use an understated selected tab treatment; keep tab names fully accessible at 320px, using bounded horizontal scrolling when required.
- Bound the existing minimum-width table to its container. Preserve existing mobile cards and their content.
- Do not rename this destination to Custom Orders: it also manages listings. Do not merge its data into Catalog or Orders.

### S05 Orders — `orders.html`

- Preserve every existing status tab, count, date/search/filter control, row action and detail overlay.
- Use readable order identifiers, existing status text and aligned amounts. Keep current status colors meaningful.
- Mobile toolbar wraps; existing rows/cards retain all information. No new urgency metric, dispatch deadline, queue or priority ranking.
- Existing detail modal: maximum 960px wide; narrow-screen margin 12px; maximum height `calc(100dvh - 24px)` with internal scrolling. Keep current modal behavior and action order.
- Verify long item names, notes, thumbnails and all currently supported action states without changing fulfillment logic.

### S06 Payouts — `payouts.html`

- Preserve total/month/week earnings, pending payout, Earnings Trend, Receiving Bank & Payout Destination, Recent Settlements, Business Tax & GST Identity, Invoices & Statements, Refunds & Disputes.
- Keep monetary definitions, precision, masks, verification claims, dates and download/action behavior unchanged.
- Improve alignment and wrap full monetary values. Do not hide bank details currently shown or reveal details currently masked.
- Use one-column mobile sections and existing compatible two-column desktop sections. No new payout request, settlement forecast, reconciliation feature or recalculated take-home figure.

### S07 Profile — `profile.html`

- Preserve Basic Info, About Page, business/billing sections, operational pickup address and every existing subsection/save boundary.
- Use grouped form surfaces with clear existing headings. Keep field order and help text; paired fields may use two columns at >=768px.
- Keep upload controls, password/account actions and Close Seller Account accessible. Destructive actions retain warning/confirmation and separated semantic styling.
- No combined Save All, new settings navigation, additional forms or changed pickup/bank semantics.

### S08 Plans — `plans.html` — high-priority preservation check

- Keep the Plans navigation label and `/seller/plans.html`; normal sellers retain direct access on both devices.
- Preserve Basic, Pro, Max in that order; current-plan state, existing Most Popular treatment, price notes, feature lists, priority explanation, terms and every dialog/action stay intact.
- Preserve `plansGrid`, `card-basic`, `card-pro`, `card-max`, `basic-cta`, `pro-cta`, `max-cta`, price element IDs and `handlePlanAction` bindings.
- Snapshot displayed prices and terms before/after in the same fixture. The source currently contains Basic 0, Pro 499 and Max 999 placeholders/defaults; these are evidence of source content, NOT permission to hardcode or override runtime values.
- Use three columns only at >=1280px, with at least 280px usable width per card. Below 1280px use one column, max-width 640px centered. No carousel, tabs, hidden feature rows or horizontal pricing scroll.
- Keep existing CTA position relative to feature lists; align corresponding desktop price/CTA areas using layout, not fixed heights that clip text. Allow natural height at enlarged text sizes.
- Keep the existing featured tier's green treatment if contrast passes. Improve readability of all tiers, including the Max action; do not switch the recommended plan or add badges/discounts/free trials.
- Preserve current/upgrade/downgrade/cancel/renewal states that actually exist. Verify through intercepted test responses; never buy, cancel or modify a real subscription.

### S09 Analytics — `analytics.html`

- Preserve all six current metric types, period controls, charts, legends, tooltips, empty states and existing exports/actions.
- Desktop metric grid: three columns at >=1280px; two at 768–1279px; single column below 768px. Chart grid becomes one column when labels cannot fit.
- Style surrounding containers, headings and spacing; do not rewrite chart construction, data transformations or axis semantics. Preserve correspondence between series and legend colors.
- Record the existing conversion fallback issue; do not fix it in this UI task or conceal contradictory data.

### S10 Reviews — `reviews.html`

- Preserve summary values, existing conditional recommendation banner, list, reply controls and Auto-Request Settings dialog.
- Exact existing filters are All Reviews, Needs Reply, Critical (1-2 stars). Preserve `data-filter` values `all`, `unreplied`, `critical`. Do not add Replied or replace Critical.
- Keep readable customer/product/rating/date/review/reply information where currently rendered. Long review text wraps; do not add truncation or a new Read More feature.
- Style existing settings switch/day controls/preview without changing values, template, notification behavior or save handler.
- Before any screenshot, assert the Reviews heading and seller shell, and confirm URL is not login. The previous login screenshots are not acceptance evidence.

## 8. States, accessibility and regression boundaries

Style only states the application already supports. Inventory them before edits. Do not turn a failed fetch into an empty state or add a Retry control without an existing retry action. Missing states are deferred findings, not permission to build them.

Keep native form controls and keyboard behavior. Associate existing labels with fields and name icon-only controls where a presentation-only attribute is sufficient. Do not turn ordinary existing filter buttons into a full ARIA tab widget unless its required keyboard interaction already exists; use truthful selected/pressed semantics appropriate to the current implementation.

Verify keyboard access, visible focus, logical DOM order, drawer open/close, existing dialog dismissal and focus return. If focus trapping/return is missing and cannot be addressed without changing event logic, record that limitation; do not claim complete accessibility or silently broaden this work package.

All CSS must be scoped under `[data-ui-refinement="seller"]`; page rules additionally use the existing `data-ui-page` value. Use explicit class hooks for new visual groupings. Preserve `.hidden`, responsive visibility, status-gated controls and permission visibility. Never set blanket `display:flex !important` on buttons/cards that may be conditionally hidden.

Do not change render order with CSS `order` to create a keyboard/visual mismatch. Do not use `overflow:hidden` on the page to mask a layout defect. Do not normalize every card height, enlarge decorative art, or make operational content look like a marketing page.

## 9. Execution phases and concrete deliverables

### P0 — baseline and ownership

1. Read this brief, current seller source, shared component and applicable repository instructions.
2. Record branch, HEAD and dirty files. Separate prior changes from this task; no whole-file rollback of prior work.
3. Create a selector/dependency inventory for all ten pages: stylesheet order, page marker, data loads, generated markup, IDs, form/actions, section order, active tab and role conditions.
4. Capture baseline mobile 390×844 and desktop 1440×1000 screenshots for all ten pages using isolated fixtures, plus Plans current/upgrade states and Reviews populated state.
5. Record existing checks, missing states and pre-existing defects. Do not describe fixtures as live seller evidence.

### P1 — shell and design system

1. Consolidate existing scoped token/control rules; add no parallel refinement stylesheet.
2. Apply sidebar widths, horizontal rows, group headings, topbar offsets and drawer sizing to opt-in pages only.
3. Validate normal seller and admin-switched visibility; verify all nine normal-seller links, View Store, Logout and badge placement.
4. Verify unmarked shell consumers before continuing. Required: edit-product, order-detail, payment-history, profile-settings and settings/billing where applicable.

### P2 — operational screens

Refine Dashboard, Catalog, Customized, Orders and Add Product in that order. After each page, compare functional inventory and run the page-specific mobile/desktop interactions with intercepted mutations. Inspect all changed script hunks for accidental logic changes.

### P3 — money, trust and configuration

Refine Payouts, Reviews, Analytics, Profile and Plans. Give Plans its own before/after content-and-action parity record. Validate Reviews authentication/page identity before collecting evidence.

### P4 — acceptance and handoff

Complete the matrix below, run repository checks, inspect full diff and deliver the evidence package. Mark each task PASS, FAIL, BLOCKED, NOT TESTED or PRE-EXISTING with evidence. These checkpoints are quality checks, not requests for repeated approval. Do not deploy, publish, merge or purchase anything.

## 10. Test harness requirements: prevent false passes

- Use an isolated local frontend and intercepted API fixtures. Block unhandled application API requests; log them and provide appropriate fixtures. Never allow test saves, uploads, replies, payouts, subscriptions or logout mutations to reach production.
- Match real request/response shapes by reading call sites. Reviews fetches `/api/profile/me`; its fixture must support the existing authentication path. Do not bypass application guards by editing source.
- Assert final URL, page marker, expected unique heading/anchor and seller-shell presence on every navigation. For normal sellers assert nine destination links; for admin-switched sessions assert the actual permitted set. Zero links is failure.
- Wait for page readiness, fonts and expected rendered fixtures using explicit selectors. A fixed 600ms delay alone is not sufficient.
- Capture console errors, page errors, failed requests and unexpected navigation. A blank or login page cannot pass because it has no overflow.
- Fail the runner with nonzero exit when required assertions fail. Persist counts of executed, skipped and failed cases; never equate process completion with acceptance.
- Keep fixtures synthetic and confined to the harness. Do not put sample customer/bank/session data into product source or reports.
- Capture before/after with identical fixture, period, viewport, scroll position and tour state. Capture lower content as well as the first viewport, scrolling the actual main panel.

## 11. Acceptance matrix

| Coverage | Requirement |
|---|---|
| Every one of ten pages | 320×740, 390×844, 430×932, 768×1024, 1024×768, 1440×1000, 1920×1080 |
| Breakpoint checks | 767/768, 1023/1024, 1279/1280; sidebar/topbar/content rectangles align |
| Short/landscape | 844×390; menu, Plans, dialogs and footer actions reachable |
| Text/zoom | Actual browser 200% zoom; 400% desktop zoom/reflow near 320 CSS px; report method |
| Input stress | Long labels, product names, review text, large rupee amounts, errors and image fallbacks |
| Existing states | Loading, populated, empty, error, disabled, selected, dialog open, permission states where implemented |
| Keyboard | Navigate all destinations and existing actions; focus visible/unclipped; close/return behavior recorded |
| Motion/contrast | Reduced-motion emulation plus computed text/control contrast checks |
| Browsers | Chromium mandatory; real iOS Safari keyboard/safe-area and Firefox or desktop Safari when available; explicitly report unavailable coverage |
| Unmarked pages | Seller secondary pages plus buyer home/product and admin dashboard retain their existing shell/styles |
| Plans | Normal seller visibility, active state, price/benefit/terms parity, all existing plan-action states through mocks |

Page-level acceptance examples:

- A seller can locate Reviews and Plans without opening another category or expanding a submenu.
- All existing actions remain reachable at 320px and enlarged text sizes; no meaningful amount or label is clipped.
- Orders/Customized tables scroll locally without making the whole document wider.
- Profile retains every existing save control and field order.
- Add Product sends the same payload for the same fixture inputs before/after.
- Plan buttons invoke the same existing handler/plan key; no real payment is attempted.
- No new features, route calls, dependencies, business conditions or storage keys appear in the diff.

Run `git diff --check`, `npm --prefix frontend run check:categories`, `npm --prefix frontend run check:regressions`, `npm --prefix frontend run build`, then `npm --prefix frontend run seo:audit`. Inspect results, not only exit codes. If API data cannot be fetched, report compilation separately from prerender completeness and do not label zero-product output ready to deploy. Do not change the SEO script or backend to make this gate green. Compare `frontend/public` status before/after.

## 12. Required final evidence package

1. A concise change summary, scope confirmation and exact changed files with line anchors.
2. Page-by-page feature inventory comparison, including navigation and Plans invariants.
3. Before/after screenshot index for all ten pages at mobile and desktop reference sizes; named fixture/state/viewport for every capture.
4. Full viewport/state results and actual browser coverage, including every NOT TESTED limitation.
5. Command results with warnings and pre-existing failures distinguished from introduced regressions.
6. Shared-component diff explanation and unmarked-page regression results.
7. Deferred issues: conversion fallback, incomplete prior Reviews evidence, payout correctness questions or any newly discovered issue; no speculative repairs.
8. Confirmation that no backend, feature, subscription behavior, production state or deployment was changed.

Store temporary browser artifacts outside tracked application source; provide accessible absolute artifact paths. Add a factual completion report under `docs/SELLER_STUDIO_UI_IMPLEMENTATION_RESULTS.md` only after execution. Never prefill PASS rows. Rollback only this task's own verified hunks; preserve the pre-existing working tree.

## 13. Definition of done

The ten seller pages have a coherent Tohfa UI on desktop and mobile; the nine normal-seller destinations remain directly reachable; Plans remains prominent and commercially unchanged; all existing features and contracts are preserved; no unmarked page regresses; required checks have evidence and limitations are explicit. If a required check fails or is untested, report the implementation as partial rather than saying everything is done.
