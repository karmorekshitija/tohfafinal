# Tohfa: SEO, AEO and GEO audit

Audit date: 16 October 2026 (India). Confirmed domain: thetohfa.in. Live requests redirect to www.thetohfa.in.

## Executive assessment

Tohfa has invested in SEO infrastructure, but several deployed defects prevent that infrastructure from delivering its intended value. The immediate priority is to make product and creator pages work at the URLs submitted to search engines, then strengthen commercial content and authority.

The best initial opportunity is specific, purchasable handmade and personalized gifting searches, followed by well-supported corporate and wedding collections. Ranking first for every query containing “gifts” is neither a realistic promise nor a useful single target. Measure qualified organic purchases and corporate inquiries alongside visibility.

**SEO** means discovery and visibility in search, including product results. **AEO** means making useful answers easy to find and understand. **GEO** means improving the likelihood that generative search systems can retrieve, understand and cite the business. These overlap substantially. Google explicitly treats its generative search optimization as SEO and recommends useful original content and sound technical foundations, rather than special AI markup. [Google guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

## Evidence and scope

- Read the frontend templates, URL utilities, route guard, build configuration, prerender generator, sitemap controller and existing SEO checker.
- Crawled all **86 URLs in the live sitemap**, plus five diagnostic URLs: **91 HTTP checks**. Of the sitemap URLs, **83 returned HTTP 200 and three returned 404** after redirects.
- Live sitemap contains **58 products, six categories, three seller pages and 19 other URLs**.
- Tested product, seller and category navigation in a real headless Edge browser. Also tested commercial landing-page rendering.
- Ran the existing local checker: **269 checks passed, zero warnings, zero errors**. Its coverage is insufficient to establish production SEO readiness.
- Conducted public web searches for the exact domain, brand, corporate gifting, bridal gifting and general gifts. These are discovery samples, not a controlled, location-specific Google ranking report.
- No authenticated Search Console, GA4, Merchant Center, backlink database or server logs were available. Index coverage, Google-selected canonicals, traffic, conversion rates, feed approvals and AI citation frequency remain unverified.
- Initial sandbox DNS failures were environmental: subsequent permitted public requests and browser visits succeeded. **This audit does not report the website as down.**

Evidence files: [HTTP crawl](live-crawl.json), [browser checks](browser-check.json), [landing-page checks](landing-browser-check.json), [live sitemap](live-sitemap.xml). Local build and live product slug suffixes differ; live conclusions use the live crawl, not the local build.

## What is already implemented

| Area | Work present | Assessment |
|---|---|---|
| Homepage metadata | Descriptive title, description, canonical, Open Graph and Twitter metadata | Present on live site; hostname needs alignment |
| Brand schema | Organization and WebSite JSON-LD with contact information | Present; entity information needs strengthening |
| Commercial pages | Customized, personalized, handmade, gifts-in-India and bulk gifting pages | Live; product grids and content depth need work |
| Corporate entry point | `/bulk`, with corporate/event positioning and inquiry form | Existing foundation; corporate SEO is not completely absent |
| Product SEO generator | Slug URLs, titles, descriptions, Product/Offer and breadcrumb JSON-LD | Metadata is deployed; visible HTML and routing are broken |
| Category generator | Category-specific titles, descriptions and headings | Present; schema and runtime canonical are inconsistent |
| Editorial content | Guides hub and five gift guides with Article markup | Present, but most guides are extremely brief |
| Crawl discovery | Public robots.txt and XML sitemap | Reachable; seller exclusion and dead URLs conflict with discovery |
| Merchant feed | Public XML feed with product IDs, prices, images and availability | Reachable; account submission/approval not established |
| Duplicate URL handling | Permanent redirects configured for selected old buyer URLs and spelling variants | Partial; public URL generation remains inconsistent |
| Private/search indexing | Noindex directives on several private pages and internal search | Present; must be checked alongside robots and auth rules |
| Image delivery foundations | WebP homepage hero, high fetch priority, below-fold lazy loading, static caching rules | Useful foundations; no live Core Web Vitals result established |
| Automated checking | HTML metadata/schema syntax and sitemap/feed checks | Useful starting point, but false confidence from missing behavior checks |

## Prioritized technical findings

### P0 — Product URLs submitted in the sitemap redirect away from the product

**Live reproduction:** opening `/products/crochet-evil-eye-keychain-269ea9` ends at `/categories` after JavaScript runs. This was an observed browser result, not just a source-code inference.

**Cause:** `frontend/src/buyer/product.html:772` reads only `id`, `productId` or `slug` query parameters. A clean `/products/{slug}` URL supplies none. Lines 775–776 and the `loadProduct` guard redirect to the category directory. The generator copies this behavior into generated product pages.

**Fix:** resolve the product identifier from the clean pathname, with legacy query parameters as compatibility input. Keep the user on the product URL; use real not-found handling for invalid products. Normalize old URLs to the preferred slug URL where possible.

**Acceptance:** every sitemap product opens the correct product as a logged-out visitor, stays on its product URL, supports mobile browsing, and retains the same canonical before and after JavaScript. The shared code suggests broad exposure; the browser reproduction sampled one product, not all 58.

### P0 — Product prerendering does not populate the visible product template

All **58 live product pages have empty H1 text in the initial response**, despite product-specific metadata and JSON-LD. The prerender generator replaces the literal `<div id="productContent"></div>`, but the current template uses elements such as `#product-name` and no matching empty container. The replacement silently does nothing.

**Fix:** render the actual current template, including title, description, price, image, seller and availability, using a robust template contract. Fail the build if the expected insertion targets are absent. Preserve this content during client initialization.

**Acceptance:** raw HTML contains a meaningful product heading and useful purchase information; schema agrees with that content. The page remains understandable without JavaScript. An H1 element containing only a loading skeleton must fail the checker.

### P0 — Public creator storefronts are treated as private seller administration

The sitemap lists `/seller/crochet-lady`, `/seller/the-candle-story` and `/seller/nails-diva`. Live robots.txt disallows **all `/seller/` paths**. A logged-out browser visit to `/seller/crochet-lady` redirects to `/auth/login`.

`frontend/src/components/ProtectedRoute.js` applies its seller authentication guard to this prefix. The seller template also expects an ID query parameter rather than the clean slug.

**Fix:** separate public storefront routes, for example `/makers/{slug}`, from authenticated seller administration. Resolve slugs to public seller data and update links, sitemap and canonicals. Keep account/admin authorization intact; simply removing all seller protection is not the fix.

**Acceptance:** public maker pages load without login, contain real maker stories and product links, and are allowed by robots. Private seller tools remain protected and excluded.

### P1 — Canonicals, redirects and internal URLs disagree

All **83 successful sitemap HTML responses** use non-www canonicals while their final response URLs are www. A browser visit to `/category/floral-bouquets` additionally changes its canonical to `https://thetohfa.in/buyer/category.html?slug=floral-bouquets`.

The cause of the latter is `frontend/src/utils/categoryLinks.js:45` and the category page's runtime canonical update. Product code also rewrites canonicals toward `/buyer/product?id=...` when a query identifier is present.

**Fix:** select one host and public URL system. Keeping www would match current redirects, but either choice is valid if applied consistently. Use shared URL helpers for links, redirects, schema, sitemap, feed and runtime code. Prefer clean category/product URLs; handle filters separately.

**Acceptance:** canonical points directly to the final HTTP 200 page and does not change during rendering. Inspect Google-selected canonicals in Search Console after deployment. Conflicting signals do not prove a penalty, but they create avoidable ambiguity. [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

### P1 — Three sitemap policy URLs return 404

Live `/returns`, `/privacy` and `/terms-conditions` return 404. Corresponding buyer templates exist, but these clean routes are omitted from the generator's clean-page copy list. Current Vercel rewrites do not supply them.

**Fix:** publish policy pages at the advertised URLs, update canonicals and old-path redirects, and check navigation and checkout links. These pages support both user trust and merchant onboarding.

**Acceptance:** all three return 200 with substantive, accurate policies; every sitemap URL is an intended canonical indexable destination. The deliberately nonexistent diagnostic URL correctly returned 404, which is a positive result.

### P1 — Commercial landing pages have empty shopping sections and missing shared navigation

The live customized-gifts browser check found **zero children in `#productsGrid`** and empty navbar/footer `data-include` containers. Source inspection shows similar empty grids across the four gift landing pages, without product-loading code on those pages.

The inclusion script looks for `#tohfa-navbar` and `#tohfa-footer`, while these pages use `data-include`. This prevents the intended shared navigation from appearing.

**Fix:** render a relevant, purchasable collection into each page and use one consistent component-inclusion contract. Prefer static HTML for essential navigation and product links. Avoid filling every landing page with the same unfiltered catalog.

**Acceptance:** both initial HTML and rendered page contain meaningful links into the shop; visible shopping sections are populated; header/footer work on desktop and mobile.

### P1 — Category schema is generic despite generated category metadata

The live Floral & Bouquets page's JSON-LD still describes “Handcrafted Collections” at `/buyer/category`. The generator creates a category-specific `jsonLd` variable but does not insert it into the category HTML.

**Fix:** serialize the generated category schema into the correct script element and update its breadcrumb URLs. Add a useful collection introduction and server-rendered product links.

### P1 — Build-time catalog fetching can silently publish an incomplete catalog

The generator requests `/api/products?limit=500` once. The product controller caps the limit at **100** (`backend/src/controllers/product.controller.js:426`). There is no pagination loop. The current 58-product sitemap is below this ceiling, so this is a **growth risk**, not evidence that current products are missing.

Fetch errors return null and become empty arrays; generation can still report success. The expression `fetchFromApi('/api/sellers/featured') || fetchFromApi('/api/sellers')` evaluates a truthy Promise, so the fallback is ineffective.

**Fix:** paginate until complete; validate counts and required templates; await fallback results; use timeouts and explicit failure policy. Do not replace a healthy catalog with empty output during an API outage. Trigger regeneration or equivalent revalidation for product changes.

### P1 — Product feed/schema accuracy needs operational validation

The feed and Product/Offer markup exist, but both are build snapshots. Price, stock, customization and delivery terms must agree with current purchasable variants. The generator hardcodes `brand: Tohfa` even for marketplace sellers; use the actual product brand where applicable. Add genuine identifiers when available, and follow Merchant Center rules for products without assigned identifiers. Do not fabricate GTINs or reviews.

Add shipping and return information where supported and accurate, including how personalized items differ. Confirm Merchant Center ownership, feed fetch, diagnostics and free-listing eligibility; an XML file alone is not an approved merchant account. [Google product data guidance](https://developers.google.com/search/docs/appearance/structured-data/product), [merchant listing requirements](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing).

### P2 — The existing checker needs stronger acceptance criteria

The checker samples only the first 15 slug product directories, treats an empty H1 skeleton as a pass, parses JSON-LD without checking its semantics, and endorses the broad seller disallow. It calls feed entries “eligible” based on counting XML items, without Merchant Center validation. Its final readiness claim exceeds what it tests.

Add checks for every sitemap destination, host/canonical agreement, meaningful initial content, live status, rendered redirects, schema/page consistency, public-path robots access and collection completeness. Add one representative browser regression per page type plus full HTTP checks. Update build integration so critical failures block release.

### P2 — Sitemap maintenance and secondary consistency

Use genuine modification dates instead of stamping every page with each build date. Unify the public static sitemap and backend sitemap policy; the backend query's broad product-status condition and seller selection need review before it becomes authoritative. Confirm only published, approved content enters discovery.

Use a recognizable brand logo in Organization markup rather than the botanical hero, verified social profile links in `sameAs`, consistent business details, and accurate public contact information. Replace old buyer links in breadcrumbs and navigation. Redirect superseded product slugs only when there is a true replacement; use 404/410 for permanently removed items as appropriate.

## Content, keyword and commercial coverage

The site should map pages to distinct shopping needs rather than repeat “gifts” everywhere. These are proposed targets, **not measured search volumes or difficulty scores**.

| Search need | Current coverage | Recommended action |
|---|---|---|
| Handmade/customized/personalized gifts India | Four live landing pages | Populate collections, differentiate their purpose and avoid near-duplicate content |
| Corporate gifts India | `/bulk` exists; `/corporate-gifts` is 404 | Strengthen `/bulk` as the main corporate hub, or deliberately migrate it; do not create competing duplicate hubs |
| Employee gifts / welcome kits / client gifts | Mentions within bulk page | Add distinct collections only where actual products, capacity and demand justify them |
| Bridal gifts / gifts for bride | No dedicated page found; `/bridal-gifts` is 404 | Build a real bridal collection with occasion, taste, price and personalization choices |
| Bridesmaid hampers | No dedicated coverage found | Separate from gifts for the bride if stock supports a meaningful collection |
| Wedding return gifts | Mentioned in bulk copy | Provide quantities, customization, packaging, fulfillment terms and actual examples |
| Birthday/anniversary gifts | Brief guides | Add useful product selection, budget comparisons and delivery guidance |
| Gifts under ₹500 / ₹1,000 / ₹2,000 | No dedicated landing pages identified in sitemap | Curate only budget pages with enough qualifying stock; keep prices current |
| Specific products, e.g. crochet bouquets or personalized candles | Existing catalog/categories | Fix indexing path first; then improve product details, imagery and internal links |
| Local gifting searches | Delhi in Organization schema | Publish local information only for real operations; do not generate unsupported city pages |

Corporate and bridal buyers have different needs. Corporate pages should answer quantity, per-unit budget, branding, samples, invoicing, bulk production, split delivery, packaging and enquiry-response questions. Bridal pages should distinguish gifts for the bride, gifts for bridesmaids and gifts for wedding guests; include personalization deadlines and real photography. Publish only capabilities the team can fulfill.

**Corporate hub brief:** clear corporate-gifting heading; actual gift sets; indicative price bands with conditions; minimum quantities where applicable; branding examples; production and delivery process; invoice information; relevant case studies; FAQs; short form capturing budget, quantity, deadline and locations. Validate any portfolio or client claims.

**Bridal collection brief:** gifting recipient and occasion; shoppable products; price and personalization options; materials and dimensions; packaging examples; preparation time and delivery estimate; replacement/return terms; genuine reviews; related wedding collections.

## Editorial quality and AEO

Approximate main-content word counts from the local source, including headings and breadcrumb text: birthday **53**, anniversary **53**, handmade guide **102**, personalized-gift selection guide **107**, best-customized-gifts guide **221**. These are observations about depth, not minimum word-count rules.

The “5 Essential Rules” guide contains only two numbered rules. Some guides claim one-to-three-day preparation for handmade products without showing product-specific qualification. The best-customized guide links to `/category/home-decor`, which is not one of the six sitemap categories; validate that destination and its inventory before retaining the recommendation.

Improve guides by answering the decision fully: who each gift suits, actual products, budget, materials, personalization constraints, realistic preparation/delivery timing and mistakes to avoid. Add author/editor responsibility and truthful update dates. Use original product photos, maker experience and real order examples. Avoid unsupported “best,” “first” and universal service claims.

Recommended answer topics:

1. What can I personalize on this product?
2. How long will making it take, separately from shipping?
3. Can a gift arrive before a specific event?
4. What is included in this hamper and its displayed price?
5. What is the minimum quantity for corporate orders?
6. Can names, company logos and packaging be customized?
7. Can an order be shipped to multiple addresses?
8. What happens if a personalized item arrives damaged?
9. Which options fit this budget, recipient and deadline?
10. What distinguishes bridal, bridesmaid and wedding-return gifts?

Write direct answers where they help the buyer, with tables for genuine comparisons. No fixed answer length or special AI prose format is necessary. Visible FAQs are useful even without rich results; FAQ markup should not be sold as a general ecommerce rich-result shortcut. [Google FAQ rich-result restrictions](https://developers.google.com/search/blog/2023/08/howto-faq-changes).

## GEO and brand authority

The public search sample surfaced similarly named businesses, including [wearetohfa.in](https://www.wearetohfa.in/), [thetohfa.com](https://thetohfa.com/) and [tohfaonline.com](https://tohfaonline.com/). No ownership relationship is assumed. This creates a brand-disambiguation challenge; it does not establish trademark infringement or an SEO penalty.

Build a coherent business entity across About, Contact, Organization markup, social profiles, merchant account and credible external mentions. Describe exactly what distinguishes this Tohfa: its marketplace model, actual makers, product strengths and service area. Verified profiles should link back to the preferred domain.

Create material that others can substantively cite: a documented maker story, original craft demonstration, a real corporate-order case study, or a transparent personalization/lead-time guide. Pursue relevant editorial and partner coverage from makers, wedding planners, event organizers and genuine customers. Do not buy manipulative links, fabricate independent recommendations, or mass-produce near-identical location pages.

The competitive sample illustrates useful execution: [The Gift Axis](https://thegiftaxis.com/) publishes concrete order case-study examples; [Leoberry](https://leoberrygifts.com/) separates corporate, wedding and personalized needs; [Presto](https://prestogifts.com/) exposes product and price-band navigation. These are observed content patterns, not audited claims about their market share or exact rankings.

The live wildcard robots rule allows public paths generally, but blocks public seller routes. Check CDN/WAF access and current search-crawler guidance for each AI platform during implementation; do not confuse search discovery with permission to train models. No chatbot recommendation audit was performed, so current ChatGPT, Gemini or Perplexity citation rates are unknown.

An `llms.txt` file is not a priority fix or a substitute for accessible HTML. Google states it does not use such files for search visibility. Focus first on working URLs, useful content, accurate product data and credible references. [Google generative-search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

## Performance, analytics and verification still required

No trustworthy live Lighthouse/CrUX or Core Web Vitals measurement was obtained, so no speed score is assigned. Inspect homepage, category, product and corporate pages on mobile: image transfer sizes, layout shifts, font loading, JavaScript work, API response delays and interaction responsiveness. Existing font preconnects, WebP and caching are positives, not proof of passing performance.

Searches of the inspected frontend source did not reveal standard GA4/GTM snippets or verification tags. This does **not** prove that analytics or Search Console are absent: DNS verification and external injection are possible.

Obtain or check:

- **Search Console:** domain property, sitemap processing, Page Indexing, URL Inspection, crawl stats, manual actions, security issues, Google-selected canonicals and query/page/country/device performance. Check any applicable generative-search inclusion setting in the current account.
- **Analytics:** organic sessions, landing-page engagement, product views, add-to-cart, checkout, purchases and revenue; corporate lead submissions, quote qualification and resulting revenue. Prevent duplicate purchase events.
- **Merchant Center:** ownership, feed processing, disapprovals, shipping/return settings and free-listing participation.
- **Bing Webmaster Tools:** indexing/crawl status and available visibility reporting.
- **Authority:** referring-domain quality, existing listings, reviews and brand mentions using an appropriate backlink source.
- **AI visibility baseline:** a fixed set of relevant prompts, recording date, engine, locale, cited URLs and whether Tohfa is mentioned. Repeat consistently; answers vary and manual observations are not total impression counts.

## Execution roadmap

| Window | Work | Owner | Completion evidence |
|---|---|---|---|
| Days 1–3 | Repair product route parsing and visible prerender content; separate public makers from seller auth | Engineering | Logged-out browser stays on the correct product/maker; raw HTML contains content |
| Days 3–7 | Align host and public URL helpers; fix policy routes, category schema, empty grids and navigation | Engineering | All sitemap URLs resolve correctly; canonical stable before/after rendering |
| Days 5–10 | Pagination/failure handling, catalog refresh strategy and stronger SEO checks | Engineering | Complete catalog generation; simulated API failure cannot publish empty catalog |
| Week 2 | Validate Search Console, analytics and Merchant Center; inspect key URLs | Engineering + marketing | Verified properties, processed sitemap/feed and reliable conversion events |
| Weeks 2–4 | Upgrade corporate hub; publish supported bridal/wedding collections; improve top products | Content + operations | Shoppable pages with verified terms, useful answers and inquiry/purchase paths |
| Weeks 3–6 | Repair and expand existing guides; add maker stories and original imagery | Content + makers | Complete, factual guides linked to real products and author responsibility |
| Weeks 4–8 | Earn relevant mentions/reviews and publish substantiated case studies | Partnerships + marketing | Relevant referring sources and documented customer evidence |
| Weeks 8–12 | Review query and conversion data; refine promising pages and resolve remaining indexing issues | Marketing + engineering | Measurable non-brand visibility, qualified leads and organic revenue trends |

Timing is a proposed work sequence, not a ranking guarantee. Fixes can be verified promptly; crawling, indexing and competitive visibility take variable time.

## Definition of success

First establish technical acceptance: no unintentionally blocked public pages, no broken sitemap targets, no product-to-category redirects, stable canonicals, useful initial HTML, populated collections and accurate product/feed information.

Then track business performance by topic: branded versus non-branded clicks, impressions and CTR; indexed canonical product/collection pages; organic purchases and revenue; qualified corporate inquiries; product-feed health; and observed AI citations. Compare equivalent time windows and account for festive seasonality. Do not use a passing local SEO script, a domain-authority score or a single “gifts” rank as the sole success measure.

## What this audit changed

Added this report, public-read audit scripts and locally saved evidence. No application fixes, production deployment, account changes or messages to third parties were made. Pre-existing workspace changes were preserved.
