---
status: active
---

# Website legal pages — approved, not published

## Decisions

- `website-legal.review.json`: first attempt rejected (dark gold panels, large headings and wallpaper).
- `website-legal.review-2.answers.json`: L-1 through L-3 approved. Soft lavender, current live-site branding, compact titles and an unboxed reading column. L-3 requested an expandable section card with a new chevron.
- `website-legal.review-3.answers.json`: L-4 approved; the mobile section index is a tinted rounded card with a right-side chevron that turns upward when open.
- About now targets `https://youcoded.ai/privacy.html` and `https://youcoded.ai/terms.html` in the shared desktop/Android component.

## Scope and publication

Inspected the live homepage in isolated Chrome and compared its HTML and screenshot with this branch's `youcoded/docs/index.html`. Live has the newer lowercase Outfit wordmark and rounded mascot icon; the branch homepage has the older mark. Only the legal pages use the explicitly copied live logo and the branch's existing Outfit font. No newer commits were integrated, and the homepage was not edited.

Root `PRIVACY.md` and `TERMS.md` are unchanged. Generated pages preserve all wording, formatting and dates (September 15 and September 3, 2026 respectively). `docs/tools/gen-legal-pages.mjs --check` checks reproducibility; `docs/tools/legal-pages.test.mjs` independently checks fidelity and navigation.

Nothing is published. Both public policy addresses returned HTTP 404 during this session. Publish the website pages before releasing the changed app links. This branch has other unrelated work; do not treat the entire branch as this task.

## Verification

- Legal-page suite: 10 passing tests.
- About popup suite: 3 passing tests, including actual button clicks for both desktop and Android props; the two new link tests were observed failing against GitHub before changing the URLs.
- Isolated browser checks: 320/390/768/1440px widths; no measured horizontal overflow, working section destinations, readable document ends, mobile disclosure opens and closes, local-only runtime assets.
- Two `bash scripts/verify.sh <app-worktree> --base HEAD` runs: types, test types, 167 test files (2,598 tests passed, one skipped), knip, lint, design lint, ast-grep and journeys passed. **The overall check failed both times**: 273/274 screens opened; first `chat/tags`, then `pages`, timed out in `Runtime.evaluate` after 20 seconds. `chat/tags` passed alone and in the second full sweep; `pages` passed in the first sweep.
- Evidence retained at `scratch/verify-20261006-035850-3407337/` and `scratch/verify-20261006-040144-3429872/` (local scratch, not committed). No claim that these timeouts are fixed or pre-existing. Android native build was not run; Android coverage here is the shared component click test.

Close-out anchor audit: 549/549 anchors and 914/914 MAP paths passed, but the audit exited 1 for two unrelated rule globs (`attention-classifier.ts` and `ink-select-parser.ts`). It resolved component paths against the shared checkout and warned this workspace branch is 147 commits behind; no guidance was silently integrated or changed to mask that mismatch.

Read-only diagnosis found nested animation-frame waits in `scripts/shoot/engine.mjs` and `youcoded/desktop/src/renderer/shoot-mode.tsx`. An eight-second still-wait deadline is swallowed before the twenty-second open deadline; both failed screens took roughly 28 seconds. Background-tab frame scheduling is a hypothesis, not proven. No supported CLI concurrency override was found. A separate tooling investigation was offered, not authorized; no unrelated tooling edits or roadmap flake item were made.
