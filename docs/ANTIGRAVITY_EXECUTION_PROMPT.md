# Prompt for Anti-Gravity: Tohfa UI refinement

Copy the text below into Anti-Gravity with this repository open at `C:\Users\ACER\OneDrive\Desktop\antigravity_workspace\tohfanew`. The three referenced plan files are already in `docs/`.

---

You are implementing a bounded, incremental **UI-only** refinement of Tohfa. Work through the authorized tasks continuously until the acceptance checklist is complete or a genuine external blocker remains. Do not pause after each phase to ask whether you should continue. Do not finish after giving a plan, a sample screen, or a partial polish. Execute, verify, correct regressions, and hand over a reviewable diff.

Before editing, read these repository files **in full and in this order**:

1. `docs/ANTIGRAVITY_UI_ONLY_IMPLEMENTATION_PLAN.md`
2. `docs/ANTIGRAVITY_UI_VISUAL_SPEC.md`
3. `docs/ANTIGRAVITY_UI_ACCEPTANCE_CHECKLIST.md`
4. `docs/SCOPE.md` and `docs/DESIGN_GUIDELINES.md`
5. `LOCK_MANIFEST.md` and `.agents/rules/protect-buyer-admin.md`

The user's current design direction is incremental and UI-only. Where an older document calls for a full rebuild, this prompt and the current user request take precedence. **Do not delete, rebuild, migrate, or restructure the frontend.** The repository's protected-file rules still apply to edits. Treat this prompt as a work order, not as a bypass of those rules. Do not print, infer, supply, or insert an unlock phrase on the user's behalf. If a protected path lacks the required authorization, complete all independently permitted work, prepare the exact proposed changes and validation evidence for the protected portion, and clearly identify that precise remaining gate. Do not silently modify a protected file or broaden the work to unrelated files to work around the gate.

Start with Phase 0 of the implementation plan. Inspect actual imports, stylesheets, scripts, generated markup, selectors, event handlers, and route behavior before editing. Record the initial commit and `git status --short`. Existing unrelated changes belong to the user; leave them alone. Do not assume similarly named JavaScript files are loaded. Do not assume an element, data field, API, CSS class, or component exists merely because the plan mentions a concept: confirm it in the current repository before using it.

Implement the plan in the documented order. For each task:

- Change only the listed page's presentation or its explicitly allowed scoped visual rules.
- Preserve content order, data, conditions, links, query parameters, API calls, authentication, price and stock logic, form fields and constraints, event-binding IDs/classes, checkout, shipping, payouts, WhatsApp behavior, and other existing business behavior.
- Preserve Seller Studio's navigation items/order, current pages, section/field order, save boundaries, single-page add-product flow, and order controls. Seller Studio receives visual/readability polish only.
- Use the exact visual values and screen layouts from the visual spec. Check mobile and desktop, including 320px narrow phone, 390px phone, 768px tablet, 1024px breakpoint and 1440px desktop. Test real overflow rather than masking it with `overflow-x:hidden`.
- Apply visual rules through the scoped stylesheet and opt-in page markers specified in the plan. Keep new rules narrow; do not use global resets, an extra framework, a blanket `!important` layer, duplicated mobile pages, fabricated content, sample earnings, or placeholder functionality.
- Preserve loaded fonts, icon rendering, dynamic product-card variants, hidden/disabled states and accessibility semantics. If a visual change requires touching generated markup, inspect every rendering branch and retain its data attributes and handlers.
- At the end of each task, inspect the diff and capture before/after screenshots at 390×844 and 1440×1000. Exercise existing states using isolated local fixtures if needed; never write fixture values into production fallback code or send real orders/messages/payments for testing.
- Fix regressions introduced by your work before moving on. Record any pre-existing failure separately. Do not weaken checks or change unrelated code to make the UI appear finished.

Keep working without repeated permission requests for routine implementation and verification within the authorized scope. Send concise progress updates when meaningful findings or blockers arise. If you hit an actual block that prevents a particular task, continue every independent task that is still permitted. Do not convert uncertainty into a guessed implementation. Record the exact file, missing fact, attempted check, and what would resolve it.

Do **not** implement the deferred backlog in the plan. In particular, do not change payout verification, sample-data fallbacks, draft persistence, stock defaults, analytics calculations, seller navigation structure, listing steps, fees, subscriptions, ZipGift availability, or WhatsApp integrations. Do not deploy, merge, publish, or edit the backend/admin panel as part of this UI pass.

Complete the verification phase in `docs/ANTIGRAVITY_UI_ACCEPTANCE_CHECKLIST.md`. Run the repository's existing frontend category and regression checks, the frontend build, `git diff --check`, and a page/state/viewport visual review. Verify unmarked pages were not affected by shared styles. Report any test or Safari coverage you could not perform; never claim it passed without evidence.

Your final response must include:

1. What changed, by page and shared presentation file.
2. What behavior remained identical and how you checked it.
3. The exact checks run and their results, with pre-existing failures distinguished from new ones.
4. Paths to before/after screenshots or other review evidence.
5. The remaining deferred and blocked items, with exact reasons.

Do not say “done” until all **permitted** tasks and required checks are complete. Do not invent verification results or claim live deployment. Stop only when the bounded work is complete or a specific required external condition prevents further progress.
