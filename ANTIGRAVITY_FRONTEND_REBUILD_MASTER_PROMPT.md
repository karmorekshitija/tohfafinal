# TOHFA — ANTIGRAVITY FRONTEND REBUILD MASTER PROMPT

You are rebuilding the frontend of an existing Tohfa application.

The current frontend has become messy because previous implementations mixed old UI, new UI, existing content and duplicate responsive implementations.

STOP PATCHING THE OLD FRONTEND.

## REQUIRED FIRST ACTION

Before ANY frontend work:
1. Read `SCOPE.md`.
2. Read `DESIGN_GUIDELINES.md`.

These are mandatory project contracts.

## CLEAN FRONTEND REBUILD

Treat the current frontend implementation as obsolete.

Delete obsolete frontend code completely:
- pages
- components
- frontend styles
- dead UI utilities/hooks
- obsolete assets
- duplicate implementations
- old/backup/test/temp frontend files
- unused frontend imports
- obsolete frontend dependencies where safe

Do NOT dump old code into `legacy`, `backup`, `old`, `v1`, `v2`, or similar folders.

Do NOT keep trash code "for reference".

If obsolete frontend code is not needed, remove it.

## IMPORTANT: PRESERVE NON-FRONTEND SYSTEMS

Do NOT blindly delete the whole repository.

Preserve:
- backend
- database
- APIs
- authentication
- payment systems
- business logic
- server/config infrastructure
- shared code required by backend/non-UI functionality

Only remove code that is genuinely obsolete frontend code.

## ONE FRONTEND — ABSOLUTE RULE

Build ONE responsive frontend.

NEVER create:
- desktop frontend + mobile frontend
- desktop/mobile duplicate pages
- desktop/mobile duplicate components
- `/desktop` and `/mobile` UI trees
- `PageDesktop`
- `PageMobile`
- `ComponentDesktop`
- `ComponentMobile`

Desktop, tablet and mobile must all be responsive states of the SAME implementation.

Use CSS, media queries, flexbox, CSS grid, fluid dimensions, responsive typography and responsive spacing.

Different layout at different widths is allowed.
Different frontend implementations are NOT.

## FUTURE SCREEN PROMPTS

I will give you detailed prompts for individual screens in future.

For EVERY future task:
1. Read `SCOPE.md`.
2. Read `DESIGN_GUIDELINES.md`.
3. Read the current task fully.
4. Identify exact scope.
5. Identify locked elements.
6. Inspect existing functionality/data.
7. Implement only the requested visual frontend.
8. Keep it responsive in the single shared implementation.
9. Clean all temporary/dead code.

The old frontend is NOT a visual reference.

It is only a source for existing functionality, content, data, routes and interactions that must be preserved unless the task explicitly changes them.

## LOCK SYSTEM

Any future prompt saying `LOCK [component]` means IMMUTABLE.

A locked component must not have its:
- styling
- size
- position
- typography
- colors
- icons
- content
- behavior
- responsive behavior

changed unless the prompt explicitly says it is unlocked.

## STRICT SCOPE

Never make unsolicited improvements.

Do not:
- add features
- remove features
- change backend
- change APIs
- change database
- change authentication
- change payment logic
- change routes
- redesign unrelated pages
- rewrite content without instruction
- invent data/statistics
- refactor unrelated code

If it is outside the current prompt's scope, LEAVE IT ALONE.

## DESIGN AUTHORITY

Priority order:
1. explicit current user instruction
2. `SCOPE.md`
3. `DESIGN_GUIDELINES.md`
4. reference images in the current task
5. existing functionality/data

The obsolete frontend is NOT a design authority.

## REFERENCE IMAGES

Use supplied reference images for:
- composition
- hierarchy
- spacing
- card structure
- image placement
- responsive concepts

Do not copy unrelated branding, content, features or functionality unless explicitly instructed.

Translate the reference into Tohfa's design system.

## CODE CLEANUP

After implementation:
- remove dead code
- remove unused imports
- remove unused components
- remove unused CSS
- remove unused assets
- remove temporary files
- remove backup files
- remove duplicate implementations

Do not leave comments or files saying "old", "temporary", "maybe later", "backup", etc.

## FINAL AUDIT

Before completing ANY task, verify:
- only requested scope changed
- locked components are untouched
- only ONE responsive frontend exists
- no desktop/mobile duplicate files exist
- obsolete frontend code is gone
- no trash files remain
- backend/API/database/business logic is untouched
- no features were invented or removed
- responsive behavior works across widths

## ABSOLUTE DEFAULT

When uncertain:

DO LESS, NOT MORE.

Do not assume permission.

Ask for clarification rather than expanding scope.

## FINAL COMMAND

Cleanly rebuild Tohfa's frontend from the obsolete implementation.

Preserve non-frontend application systems.

Create ONE responsive frontend.

Read `SCOPE.md` and `DESIGN_GUIDELINES.md` before EVERY future frontend task.

Follow future screen-specific prompts exactly.

Respect every LOCK instruction.

Never add unsolicited features or changes.

Never leave obsolete frontend/trash code behind.
