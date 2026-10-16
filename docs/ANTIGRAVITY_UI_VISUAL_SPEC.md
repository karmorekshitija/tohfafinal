# Tohfa — detailed UI specification

**Date:** 16 October 2026. **Applies only to:** the 17 screens in the companion implementation plan. This is a proposed specification, not a claim that these values already exist or have passed browser testing.

## Design reasoning

A gifting marketplace needs to make four things easy to scan: the item, its price, its maker, and the available next action. Long marketing descriptions, competing badge styles and tiny controls weaken that hierarchy. Larger readable text should be balanced with product density, not applied as a blanket size increase.

For sellers, preserve learned locations and actions. Consistent labels, field spacing and clear section boundaries reduce scanning effort without requiring a new workflow. Empty, loading and error content should remain visible as currently implemented; correcting the conditions that choose those states is deferred.

The iOS influence is **clarity, comfortable controls, grouping, stable navigation and safe-area awareness**. Retain Tohfa's warm palette and editorial character. Do not introduce an Apple-like app shell, SF Symbols, downloaded San Francisco fonts, frosted panels, glass effects, oversized rounded cards or spring/bounce animations.

External grounding:

- Apple's design guidance recommends touch-friendly controls, readable text, appropriate contrast and aligned content. Its 44-point native target guidance informs this project's chosen **44 CSS-pixel** web target; points and CSS pixels are not claimed to be interchangeable standards. [Apple UI Design Dos and Don'ts](https://developer.apple.com/design/tips/)
- For the web, WCAG 2.2 target-size minimum is 24 CSS pixels with defined exceptions. This project deliberately chooses a more generous 44px target for standalone controls. [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- Verify ordinary text at 4.5:1 and qualifying large text at 3:1 contrast. Check actual composited colours, not only token names. [W3C contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- Keep non-exempt content usable at 320 CSS px equivalent without two-directional scrolling. Tables can need a bounded horizontal scroll region. [W3C reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- Fixed bars must not entirely obscure keyboard-focused elements; this plan aims for fully visible focused controls. [W3C focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)

Exact visual values below are project decisions, not quotations from Apple or evidence of measured conversion improvement.

## V01 — responsive layout

| Range | Page gutter | Content | Grid behavior |
|---|---:|---|---|
| 320–767px | 16px | Full available width | Product feeds 2 columns; forms one column except existing short paired fields |
| 768–1023px | 24px | Full available width | Product feeds 3 columns; existing tablet navigation behavior retained |
| 1024–1439px | 32px | Centered max 1280px outer container | Product feeds 4 columns; seller sidebar remains 130px |
| 1440px and above | 40px | Centered max 1280px outer container | Keep 4 product columns; do not stretch text/cards indefinitely |

Container max-width includes its inline padding (`box-sizing:border-box`). At mobile widths, resulting content is viewport minus 32px. Use `width:100%; max-width:1280px; margin-inline:auto`. Never give a child `100vw` inside a padded parent. Use `min-width:0` on flex/grid children with text, money or inputs.

Buyer navigation breakpoint remains 768px. Seller drawer/sidebar breakpoint remains 1024px. Do not make these identical just for stylistic consistency. Keep existing 640px local breakpoints if needed for controls, but don't add new arbitrary device-specific cutoffs.

At 320px, keep two product columns only if titles/prices/buttons fit without clipping. Allow action text to wrap and cards to grow. Do not reduce text below the specified size or hide card information to force a short card. At zoom/reflow, a scoped one-column fallback is acceptable when actual content cannot fit; keep source and reading order.

## V02 — typography

Keep the root at the user's browser default (normally 16px). Values are target CSS px at default zoom; implement in rem. Do not use `html { font-size:62.5% }`, viewport-only font sizes or disabled text scaling. Use explicit role classes to avoid changing unrelated headings.

**Fonts:** DM Sans with `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` fallbacks for UI/body. Existing Playfair Display with Georgia/serif fallback for buyer editorial headings and retained seller page headings. Keep original logo font untouched. Retain existing Material Symbols font on icons. Use tabular numerals for money/metrics; reserve existing monospace for IDs/codes rather than every label. Do not globally remove font imports during this work.

| Role | Mobile size / line height | Desktop size / line height | Weight and usage |
|---|---|---|---|
| Existing hero wordmark | 40 / 44 | 64 / 70 | Preserve identity; no extra headline |
| Buyer page title | 28 / 34 | 36 / 44 | Serif 600; maximum readable line length 24ch |
| Product title | 26 / 32 | 32 / 40 | Serif 600; show full title, no truncation |
| Buyer section heading | 22 / 28 | 28 / 34 | Serif 600 |
| Seller page title | 24 / 30 | 30 / 38 | Existing serif 600; no new display treatment |
| Seller section heading | 20 / 26 | 22 / 28 | Existing family 600; remove excessive tracking via scoped styles |
| General body | 16 / 24 | 16 / 24 | Sans 400 |
| Product card title | 14 / 20 | 16 / 22 | Existing serif or sans consistently per existing card family, 600 |
| Card price | 16 / 22 | 18 / 24 | Sans 600, tabular numbers |
| Product detail price | 24 / 30 | 28 / 34 | Sans 600, tabular numbers |
| Metrics | 26 / 32 | 32 / 38 | Sans 600; wrap/fit without losing digits |
| Field label | 14 / 20 | 14 / 20 | Sans 500; retain meaning and required indicator |
| Input/select/textarea | 16 / 24 | 16 / 24 | Sans 400 |
| Button | 15 / 20 | 15 / 20 | Sans 600 |
| Product-card button | 14 / 20 | 14 / 20 | Sans 600, at least 44px high |
| Supporting/helper text | 14 / 20 | 14 / 20 | Sans 400 |
| Maker/metadata | 13 / 18 | 14 / 20 | Sans 400; never lower opacity to unreadable levels |
| Badge/counter | 12 / 16 | 12 / 16 | Sans 600; concise existing content |
| Buyer bottom-nav label | 12 / 16 | Not applicable | Sans 500; retain labels |
| Seller sidebar label | 12 / 16 | 12 / 16 | Sans 500/600 active; normal tracking, allow wrapping |
| Table header / cell | 13 / 18; 14 / 20 | 13 / 18; 14 / 20 | Header 600, cell 400 |
| Error text | 14 / 20 | 14 / 20 | Sans 500; no content clipped |
| Footer links | 14 / 20 | 14 / 20 | Sans 400/500 |

Use default letter spacing for UI, at most -0.02em on large headings. No letter spacing of 0.1em on operational labels. Prefer sentence case when the existing text is only visually uppercased by CSS; do not mass-rewrite business strings. Keep line heights unitless/equivalent scalable values. Desktop means >=1024px; interpolate heading sizes at tablet or use the mobile value until 1024px.

No fixed text-container height. A two-line product title area may have a minimum height to align buttons, but long titles can grow. Do not replace full product names with ellipses solely for visual uniformity. On long catalog titles, preserve existing expand/detail access if truncation already exists.

## V03 — colours and states

Use the original palette rather than recolouring the product.

| Proposed scoped token | Value | Role |
|---|---|---|
| `--ui-canvas` | `#FFF8E7` | Main warm ivory canvas |
| `--ui-surface` | `#FAF6EE` | Quiet raised/grouped surface |
| `--ui-surface-emphasis` | `#DCE6D8` | Restrained selected/summary background |
| `--ui-ink` | `#1C1C1A` | Main text |
| `--ui-secondary-ink` | `#4F6553` | Supporting text on light surfaces |
| `--ui-primary` | `#14381F` | Primary action, links, active state |
| `--ui-primary-hover` | `#285C3A` | Pointer hover only |
| `--ui-on-primary` | `#FFF8E7` | Text on primary |
| `--ui-border` | `rgba(20,56,31,.16)` | Decorative separators/card edges |
| `--ui-input-border` | `#7A867A` | Input boundaries; verify against actual surface |
| `--ui-danger-ink` | `#B42318` | Existing error/destructive text only |
| `--ui-focus` | `#14381F` | Focus outline |

Preserve existing semantic status colours unless contrast fails; change only their scoped presentation, not status meaning. Sage `#A8BFA5` is a background/accent, not body text on ivory. Do not turn all status badges green. Keep Sponsored visibly identifiable; do not disguise advertising as verification.

Measured planning checks on opaque colours: existing moss `#587A5B` is approximately 4.56:1 on `#FFF8E7`, but 4.48:1 on `#FAF6EE`; it is marginal for ordinary text. Existing sage on ivory is approximately 1.86:1. Existing `#D14B4B` error text on ivory is approximately 4.12:1. Hence the darker scoped text choices. Re-measure final composited colours, including opacity, hover, selected and disabled states. Decorative separators need not be mistaken for sufficient input-boundary contrast.

## V04 — spacing, shape and depth

Spacing scale: **4, 8, 12, 16, 20, 24, 32, 40, 48, 64px**. Do not introduce 17/23/37px spacing just to match a screenshot.

| Relationship | Mobile | Desktop |
|---|---:|---:|
| Page title → subtitle | 8 | 8 |
| Page heading group → content | 24 | 32 |
| Marketplace sections | 32 | 48 |
| Seller sections | 24 | 32 |
| Section heading → content | 16 | 20 |
| Card padding | 16 | 20–24 |
| Product card text padding | 12 | 16 |
| Label → input | 8 | 8 |
| Input → helper/error | 6–8 | 6–8 |
| Field group → next group | 20 | 24 |
| Product grid gap | 12 | 20 |
| Button group gap | 8–12 | 12 |

Corner roles: inputs/buttons 12px; product/group cards 16px; existing dialogs 20px; badge/segmented control 8px or retained capsule where already established. Keep image crop corners aligned with card corners. Do not make every element pill-shaped. Preserve established search-pill appearance if present.

One light visual boundary per ordinary card: subtle border **or** restrained shadow. Avoid stacking border + heavy shadow + coloured outer container. Proposed shadow only for elevated existing dialogs/menus or a needed header separation: `0 4px 16px rgba(20,56,31,.08)`. Product cards can remain flat with a border. Do not add backdrop blur.

## V05 — controls and interaction presentation

- Primary controls minimum 48px high; compact/card/icon actions minimum 44×44px hit area. Visual glyph 20–24px. Maintain space between adjacent hit areas; do not overlap enlarged invisible targets.
- Inputs/selects minimum 48px high, padding 12px; textarea minimum 120px unless existing specialized control requires more. Keep native select behavior and validation.
- Radio/checkbox visible glyph 18–20px, associated label row minimum 44px; preserve actual input and keyboard behavior. No CSS-only fake form controls.
- Focus: 2px solid visible outline, 2px offset; light contrasting outer ring on dark surfaces. Ensure enclosing overflow does not clip it.
- Existing disabled controls retain disabled semantics; no hover/press response implying availability. Do not add/remove disabled attributes based on new rules.
- Pointer hover: subtle colour/border change. Press: colour feedback only; optional <=1px translation on existing non-layout-moving button, not a bouncing scale system.
- Transitions 150–200ms for colour/opacity, at most 200ms for existing panels. Respect `prefers-reduced-motion`; no smooth-scroll takeover, autoplay or new entry animations.
- Style existing loading placeholders with reserved geometry. Do not introduce a permanent spinner or add artificial loading delay. Do not infer a success/empty state from a failed response.
- Link labels stay recognizable and descriptive. Existing user text and dynamic data must keep escaping/sanitization intact.

## V06 — header, footer and navigation

**Buyer desktop:** target header 68px minimum height, horizontal content aligned to page gutters; existing logo left, existing navigation and auth/utilities retained in current order. Icons 22px inside 44px targets. If content wraps at 1024px, grow the header rather than shrink labels. Measure actual fixed/sticky header height for content offsets.

**Buyer mobile:** target header 56px minimum height; retain current logo/actions and auth visibility rules. Keep utilities 44px; do not add another row of duplicate actions. On pages where auth buttons are already visible, allow the existing header to wrap/grow instead of hiding them. Never assume every page uses `tohfa-navbar.html`.

**Buyer bottom nav:** preserve Home, Category, ZipGift, Profile and the 768px visibility breakpoint. Target 64px content height + safe-area bottom padding, 12px labels, 22px icons, existing active indication with readable contrast. If a page's current implementation has no nav, do not introduce it.

**Footer:** existing links/groups and modal triggers retained. Typography 14/20, headings 13/18, vertical link rhythm giving 44px interactive rows on mobile. Two columns on mobile only where the existing groups fit; wrap to one without dropping links. Desktop keep existing grouping. No footer feature cleanup.

**Seller:** sidebar stays 130px at >=1024; topbar stays 60px; mobile remains hamburger/drawer. Sidebar labels 12/16 instead of 9px; preserve order, active styles and icons. Nav may scroll independently at short heights. Keep topbar account control and all destinations.

## V07 — fixed bars, safe areas and scrolling

Never fix overlap by blindly increasing all body padding. Inventory each page's actually visible fixed elements.

Buyer pages with bottom nav: reserve its real height including safe area in the page's scrollable content. Product page with an existing sticky purchase bar: place that bar above the visible bottom nav, reserve the sum of both heights plus 16px content clearance, and apply safe-area inset **once** to the bottommost bar. On widths where nav is absent, use only the purchase bar's required offset. The total must use actual rendered bar heights if labels wrap at text zoom; fixed guessed heights must not clip enlarged content.

Position the existing assistant launcher 16px from the right and 16px above the topmost bottom bar. Preserve its original launcher/widget and interaction; adjust through CSS in the scoped page. Do not create another assistant. If mobile content cannot fit, allow existing panel scrolling; never cover the close or send control. Existing modals must appear above navigational bars/launcher and remain scrollable within the visible viewport.

Use CSS sizing/variables and the existing presentation behavior. If CSS cannot account for runtime wrapped bars, document the precise limitation and a possible measurement hook separately. Such a hook is proposal-only and outside the current implementation allowlist; do not add it under this plan. No new dependency or global event framework. Do not add JavaScript merely to avoid understanding existing CSS.

Seller desktop uses the existing internal `.seller-main-panel` scroll container; mobile currently switches to document scrolling. Preserve both. Topbar placeholder plus padding can double-count height: target a visible 24px mobile / 32px desktop gap between actual header bottom and first content, adjusting only scoped effective offsets after measuring. Do not change scroll architecture to achieve it.

Verify drawer parent/child transforms; do not add another translation. If impersonation banner is present in an authorized test state, account for its actual height without changing session switching or the admin panel. Do not infer impersonation from a username.

## V08 — product cards

Use one visual language across all existing renderers, not a new shared data abstraction.

Structure remains: existing image and overlay controls → existing title/price/maker/badges in their existing content order → existing CTA. Photo uses a consistent square box for discovery cards, `object-fit:cover` only where cropping is already the chosen behavior. Do not stretch images. Product detail images retain their separate behavior.

Image wishlist icon: 20px glyph with 44px target, 8px inset. Sponsored/new badges: 12/16px, modest padding, avoid collision with wishlist. Text/body gap 8px. Card CTA min-height 44px and full available width. Price always visible and allowed to wrap; never mask a currency digit with `overflow:hidden`.

Product title visible with at least two lines of capacity and natural growth when necessary. Align CTA at the bottom using flex layout rather than fixing every card's overall height. At 320px, allow a two-line action label. Keep meaningful image alt text and existing click destinations.

No new rating, discount, delivery date, stock count, verification badge or promotional statistic. Preserve existing out-of-stock grayscale and conditional controls. Do not replace failed imagery with misleading generated product images.

## V09 — forms, dialogs, tables and states

Forms: one label association for each input; preserve names/types/required constraints. Mobile single column; retain existing intentional short pairs if both still have 120px+ usable control width. Display helper/error beneath its field. Preserve error text and when it appears. Do not rewrite validation to enable new errors.

Existing dialogs: width `min(100% - 32px, existing-purpose max-width)`, target max-height `calc(100dvh - 32px)` with `100vh` fallback; body scrolls internally, header/close reachable. Do not convert dialogs to bottom sheets or implement new trap/dismiss logic as a styling shortcut. Record accessibility behavior bugs separately if fixing requires a broader interaction change.

Tables: 14/20px body, 13/18px header, 12–16px cell padding, subtle separators; monetary columns aligned with tabular numbers. Maintain all columns and existing responsive row/card rendering. Existing essential tables may use contained horizontal scrolling; avoid forcing the whole document wider. Do not use nth-child-based reorder when scripts/CSS already rely on child positions.

States: preserve current conditions and visibility. Refine only spacing/type/borders of empty/error/loading panels. State icons 32–40px, title 18/24, body 14/20, 16px gap to existing action, max text width 45ch. No new success text or promises. Do not reserve half a screen for an empty decorative panel unnecessarily; use content-based height.

## V10 — approved static copy edits

Only B04 changes copy in this package:

- Heading: **Your cart is empty**.
- Supporting sentence: **Explore handmade gifts and find something thoughtful.**
- Keep the existing **Explore Categories** action and destination.

Other copy remains unchanged apart from accessible labels and removing CSS-forced excessive uppercase where it does not change meaning. In particular, seller terminology cleanup, fees, verification, delivery estimates and plan wording are deferred. Do not invent onboarding response times or rewrite policy text.

## B01 — marketplace home

**Retain:** header → botanical hero → search → occasions → existing seasonal/sponsored/feed/category sections → footer and bottom nav. Preserve current conditional section order exactly as implemented.

**Desktop:** hero 240px target height, centered existing wordmark 64/70; keep original imagery. Search max-width 640px, min-height 52px, 24px spacing from adjacent content; preserve current overlap if used but no more than 24px. Section headings 28/34 with existing supporting copy 14/20. Occasions 80px images with 13/18 labels and 20px gap. Feed 4 columns with 20px gap. Rails retain their existing items, with approximately 240px card basis and existing arrows sized to 44px.

**Mobile:** hero 160px target, wordmark 40/44; search fills inner width, 48px minimum, input 16px. Occasion images 64px and label max width 80px; horizontal rail with 12px gap. Keep rail swipe and existing arrows' visibility rules. Feed 2 columns / 12px gap. Sponsored/category rails target 160px card basis at 390px, constrained by viewport; a partial next card can signal horizontal content. Section gap 32px; avoid giant blank reserved areas.

**States:** no products, long maker name, sponsored, options/customizable, unavailable, failed image and conditional seasonal banner. Keep existing fallback/visibility behavior; an empty `src` in a hidden banner is not automatically a visibly broken asset.

**Acceptance:** at 390px the header/hero/search/occasion start is readable without text overlap; every product remains reachable; no data reduction; consistent cards across all renderer branches; no new queries.

## B02 — search

**Desktop:** existing search control max-width 720px, 52px min-height. Result title/count left and existing sort right within one wrapping toolbar; gap 16px. Four-column results under a 24px toolbar gap. Suggestions/recent searches max-width 720px with 44px rows.

**Mobile:** search full inner width, 48px; clear icon 44px. Title/count then existing sort on the next line, native select minimum 48px and full width when necessary. Two-column results / 12px gap; 24px from toolbar. Existing suggestions, matching studios/categories and recent searches remain accessible with wrapping or their current rail behavior.

**States:** idle, typing, results, no results, loading, error, paginated continuation. Preserve `#pagination-sentinel`; do not put it inside a hidden/overflow-clipped wrapper that prevents intersection detection. No new Filter button or delivery/budget controls.

## B03 — product detail

**Desktop:** current primary gallery and detail area use a 55/45 approximate proportion with a 32px gap within 1280px. `minmax(0,...)` prevents description overflow. Gallery max visual height around 620px while respecting image ratio; preserve lightbox/thumbs. Detail heading 32/40, price 28/34, maker 14/20. Separate existing content groups with 24px; place existing quantity/CTA controls in their current sequence with 48px controls. Reviews and related sections follow, separated by 48px.

**Mobile:** keep gallery before details. Main image within viewport minus gutters, no imposed desktop height; thumb targets 44px, preserve orientation if already established. Product title 26/32, price 24/30. Detail surface 16px padding where present; description 16/24. Quantity controls 44px targets with readable quantity; existing main CTA 48px. PIN input and Check button can share a row only if input remains usable; otherwise stack at narrow width. Helper/estimate text 14/20, no new delivery promises.

**Persistent controls:** use V07 for existing purchase bar and navigation; price 18/24 and CTA 15/20 in the bar, allow wrapping. Preserve both existing CTA handlers/synchronization, do not create a third.

**States:** long title, multiple images, stock/unavailable, variants, personalized text/choices/photo, validation, reviews/no reviews, PIN response, related options. Keep full customization labels visible; do not shrink their controls to fit the detail card.

## B04 — empty cart

**Desktop:** primary empty panel max-width 640px centered, 48px top/bottom content spacing, 48px icon, 32/40 serif heading, body max 45ch. Existing browse CTA 48px and natural width; popular categories below with 44px chip hit targets. Recommendations return to the full existing container with consistent cards.

**Mobile:** 24px panel spacing, 40px icon, 26/32 heading, 16/24 body, full-width existing primary CTA. Avoid large min-height or decorative blank bands. Categories wrap. Preserve existing recommendation grid breakpoints unless narrow reflow requires one column.

Use the exact approved copy in V10; no redesign of populated cart or checkout.

## B05 — login

**Desktop:** card max-width 440px, 32px inner padding, heading 30/38, subtitle 16/24; label/input/field gaps per V04. Existing primary and Google actions full-width, min-height 48px. Separate alternative login by 24px, not a large decorative separator panel.

**Mobile:** page gutter 16px; card padding 20px (16px at 320 if needed), heading 26/32. Header existing sign-up/seller links may wrap. Never vertically center with a rigid viewport height that clips fields when keyboard opens; use min-height plus scrollable document. Password toggle 44px, reserve sufficient input trailing padding. Existing error container above fields has 14/20 text and 12px padding, height auto.

Keep autocomplete, password manager, input type and redirect behavior unchanged. Do not use actual credentials in screenshots or handoff artifacts.

## B06 — become a seller

**Desktop:** existing main card max-width 680px, 32px padding; heading 32/40; body 16/24. Reduce nested border/shadow emphasis so the contact panel reads as one grouped area. Existing phone/mail links minimum 44px, WhatsApp action 48px, 24px separation from the explanation.

**Mobile:** 16px outer gutter, 20px card padding, heading 28/34; phone/email on their existing stacked/wrapped layout, email `overflow-wrap:anywhere` if needed. WhatsApp full width. Keep current content/contact methods intact.

## B07 — ZipGift

Preserve the existing Coming Soon mockup and overlay/state. Constrain artwork to available width and a maximum 560px desktop content region where compatible with the current canvas. Use 28/34 mobile and 36/44 desktop for the availability heading, with body 16/24 and 24px spacing. Do not make covered mockup inputs appear active. Preserve auth redirect and all current links. This page was not entered as an authenticated buyer during the audit; local/test screenshot evidence must be labelled accordingly.

## Seller page specifications — S01–S10

**Shared constraint for every S page:** retain source order, page destinations, fields, controls and state semantics. These specifications do not authorize a product redesign. Use V02 sizes, V04 spacing, V05 controls and existing responsive structures.

### S01 Dashboard

Desktop: preserve 4 KPI columns, 20px gap and 20px padding; mobile preserve 2 columns, 12px gap and 16px padding. Metric labels 14/20; values 26/32 mobile, 32/38 desktop, no truncation of currency. Greeting/date can wrap within their current header group; right date uses 13/18 with max-width sufficient for the full date. Period controls 44px high, 14px text, wrapping/rail only within their current group. Stock/recent/quick-actions/holiday/chart order stays exactly as it is. Remove excessive empty padding, not empty-state content. Chart area 240px mobile / 320px desktop if the existing chart supports responsive height; keep dataset/resize logic unchanged.

### S02 Add product

Content target max-width 1040px desktop within current shell. Form cards 24px padding desktop / 16px mobile; sections 24px apart. Desktop preserve existing field columns; mobile fields full-width except current short dimension groups that still fit, with each dimension input at least 100px or wrap to next row. Photo upload area min-height 160px, clear 16/24 instruction and 14/20 format help. Keep upload controls and accepted formats unchanged. Variant rows: labels 14/20, action targets 44px, no clipped extra-price/photo fields; use existing responsive renderer. Existing bottom Save Draft / Preview / Publish group wraps into an accessible layout at 320px, with publication retaining original prominence; allocate bottom clearance based on real bar height. Preview dialog uses V09. Keep the single-page structure and every default value.

### S03 Catalog

Desktop existing summary/search/action row uses 16px gaps, aligning baselines; filters may wrap rather than squeezing. Mobile preserve current table-to-card behavior and source child order; filter controls 48px, existing New Listing 48px, compact row actions 44px. Discount input 16px text / 44px min-height. Existing table columns remain. Empty panel padding 24px with readable current copy and existing action. Floating control must clear chat and any bottom action region; no action duplication.

### S04 Customized

Top summary chips get 16px padding, 13/18 labels, 24/30 values. Existing product/order selector remains, with 44px targets and selected treatment in pine/pale sage. At narrow width keep the existing horizontal strip rather than dropping tabs. Filters 14/20 and 48px native controls. Empty panel max text width 45ch, 24px padding; table header 13/18 in secondary ink, not pale sage text. Keep Direct-Cart and custom-fee content unchanged. Preserve existing desktop table/mobile counterpart rather than building new ones.

### S05 Orders

Heading 24/30 mobile / 30/38 desktop. Existing search/date toolbar wraps at mobile with 12px gaps, controls min-height 48px. Status buttons 44px, `white-space:nowrap; flex-shrink:0`; contain horizontal scrolling to their strip. Preserve original status list and counts. Metric cards as S01. Existing mobile order rows retain nth-child-dependent positions; apply 14/20 text and 12px gaps only. Detail overlay uses V09, with close target 44px, readable status/tracking fields and contained scrolling. Do not reorder row children or add next-action business logic.

### S06 Payouts

Keep current sections and summary count. Desktop 4 summary cells where already used; mobile 2, with amounts allowed to wrap safely. Section padding 20–24px desktop / 16px mobile. Bank summary labels 14/20, values 16/24; preserve masking and never expose full data for visual consistency. Request Payout uses existing state and placement; 48px minimum control. Existing tables use contained overflow and 14/20 cells; statement/dispute lists retain their current scrolling behavior. Separate sections with 24/32px spacing, not stronger trust styling. No illustrative balances or new verified icons.

### S07 Profile/settings

Retain Basic Info → About → Business/Billing → Pickup sequence and current tabs. Overall form max-width 1120px, each section 24px desktop / 16px mobile padding. Headings 22/28 desktop / 20/26 mobile, labels 14/20, inputs 16/24. Existing field pairs become one column only through responsive CSS where currently cramped; retain DOM order. Avatar preview 80px, upload target at least 44px; banner/about imagery bounded by existing aspect purpose, no stretched images. Existing per-section Save controls 48px and full-width on mobile if needed; keep them adjacent to their own sections, never introduce a global Save. Preserve all badges and validation semantics.

### S08 Plans

Keep existing plan order, paid/free content and emphasis. Desktop equal card widths in existing grid, 24px padding; align price/header/CTA baselines using consistent internal spacing and flex layout, not fixed total card heights. Feature text 14/22, price 32/38, renewal/qualifiers 14/20. **Mobile preserve the existing horizontal snap rail**, targeting existing 285px card basis constrained to at most 85vw, with 16px gaps and clear next-card visibility. Do not switch to a new stacked comparison flow in this limited seller pass. Buttons 48px, no clipped GST/renewal/slot text. Existing modal stays within viewport.

### S09 Analytics

Keep all metrics and charts, original order and current responsive column changes (including XL grid). Min-width 0 for cards; labels wrap, metrics do not use ellipses. Chart region minimum 240px mobile / 300px desktop where current responsive chart container supports it; do not alter chart datasets/scales/plugins. Range controls 44px and wrapping. Error panel gets 16px padding, readable 14/20 copy and existing Retry control 44px. Keep contradictory data-state issue visible and deferred. Tables follow V09.

### S10 Reviews

Preserve existing summary layout, collapsing to available mobile width as current behavior permits. Overall-rating text 28/34; distribution labels 14/20 with adequate row spacing; no change to star values or colours' meaning. Tabs 44px; existing search 48px. Review cards 16px mobile / 24px desktop padding, buyer/date 14/20 and review body 16/24. Reply textarea 16px and min-height 120px when already present; existing controls 44–48px. Settings modal follows V09. No new automatic-request policy or message sends.

## Required visual demonstration before calling the design implemented

At least home, search, product, login, seller dashboard, add-product and orders must have side-by-side baseline/refined screenshots at 390×844 and 1440×1000. Remaining covered pages need the same widths in the final evidence set. Include top, middle and bottom where needed; a full-page capture alone cannot prove fixed-bar placement. Annotate any fixture state and any screen not tested on actual Safari.

The UI is successful when text is comfortable, controls do not collide, the next existing action is recognizable, and the current workflows still behave identically. A different-looking site alone is not completion.
