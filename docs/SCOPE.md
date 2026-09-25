# TOHFA — SCOPE.md

## Mandatory rule
READ THIS FILE AND `DESIGN_GUIDELINES.md` BEFORE EVERY FRONTEND TASK.

## Scope
Tohfa's frontend is being rebuilt from scratch because the previous frontend implementation is obsolete. Future screen-specific prompts supplied by the product/design owner are the source of truth for the requested UI.

## Frontend rebuild
Delete obsolete frontend implementation cleanly:
- old pages/components
- old frontend CSS/styles
- dead frontend hooks/utilities
- unused frontend assets
- duplicate/backup/test/temp UI files
- dead imports and obsolete frontend dependencies where safe

Do NOT keep old UI in folders named `old`, `legacy`, `backup`, `v1`, `v2`, `temp`, etc.

## Do not destroy the application
Do NOT blindly delete:
- backend
- database
- APIs
- authentication
- payment systems
- business logic
- server/config infrastructure
- shared code required by non-frontend systems

Delete only code that is genuinely obsolete frontend code.

## ONE RESPONSIVE FRONTEND
There must be ONE frontend implementation.

NEVER create:
- separate desktop frontend
- separate mobile frontend
- Desktop/Mobile page copies
- Desktop/Mobile component copies
- `PageDesktop`, `PageMobile`
- `ComponentDesktop`, `ComponentMobile`
- duplicate page trees

Desktop, tablet and mobile must be responsive states of the SAME components using CSS, media queries, flexbox, grid, fluid sizing, and responsive typography.

## Scope discipline
Only change what the current task explicitly requests.

Never:
- add features
- remove features
- change backend/business logic
- change routes
- change APIs
- change database
- change authentication
- redesign unrelated pages
- invent content/data/statistics
- refactor unrelated code

If something is outside scope: LEAVE IT ALONE.

## Locked components
If a prompt says a component is LOCKED, it is immutable until explicitly unlocked. Do not change its styling, size, position, content, behavior, or responsive behavior.

## Before every task
1. Read `SCOPE.md`.
2. Read `DESIGN_GUIDELINES.md`.
3. Read the complete current prompt.
4. Identify exact scope.
5. Identify locked components.
6. Inspect current code/functionality.
7. Implement only the requested frontend.
8. Use one responsive implementation.
9. Clean all temporary/dead code.

## After every task
Verify:
- no duplicate mobile/desktop frontend
- no obsolete frontend files
- no unused imports/components/assets
- no locked component changed
- no unrelated page/functionality changed
- no backend/API/database changes
- responsive behavior works at multiple widths

## Default rule
When uncertain: DO NOT CHANGE IT. Ask for clarification.
