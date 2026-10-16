# Paste into AntiGravity

Act as a senior frontend UI engineer and accessibility reviewer for the existing Tohfa Seller Studio.

Implement `docs/SELLER_STUDIO_UI_IMPLEMENTATION_BRIEF.md` exactly, reading it completely before changes. It is the current seller-only execution specification and supersedes conflicting older seller visual prescriptions only within its stated boundaries.

The assignment is a professional, restrained, iOS-inspired UI refinement using the existing Tohfa pine/ivory theme and existing fonts. This is not a rebuild. Mobile and desktop are equally required.

Keep all existing features, nine navigation labels/destinations and behavior. Keep Plans directly visible in the main navigation and preserve every plan price, benefit, term, state and action. Do not add features, remove features, merge pages, invent data or change backend/API/auth/payment/subscription logic. Do not implement the earlier five-destination proposal, new dashboard queues or a listing wizard.

Use the brief's exact palette, responsive dimensions, page specifications, file boundaries and acceptance matrix. Preserve existing dirty changes. Shared seller shell edits are limited to the explicitly described opt-in presentation markup; no general component rewrite or buyer/admin changes.

Work through P0–P4. Do not ask for repeated approval at routine phase checkpoints. If a particular operation is blocked, explain the exact constraint and complete independent allowed work without inventing a workaround that violates it.

Fix the test harness's false-pass problem before claiming visual acceptance: Reviews previously captured the login page. Assert the URL, seller shell, expected page anchor and navigation count. Use isolated fixtures, intercept mutations, and fail on unexpected API requests. Never test payments, subscriptions, replies or account changes against production. Capture the dashboard both with and without its existing welcome tour.

Deliver the exact evidence package specified in section 12, with a factual results file at `docs/SELLER_STUDIO_UI_IMPLEMENTATION_RESULTS.md`. Distinguish PASS, FAIL, PRE-EXISTING, BLOCKED and NOT TESTED. Do not call compilation success or an empty prerender output deployment-ready. Do not deploy, publish or merge.
