---
paths:
  - "youcoded/docs/index.html"
  - "youcoded/docs/media/**"
  - "youcoded/docs/site/**"
  - "youcoded/docs/gallery/**"
  - "scripts/ui-review/**"
  - "youcoded/desktop/src/renderer/dev/workbench/**"
last_verified: 2026-08-28
verify:
  - path: scripts/ui-review/site-assets.sh
    contains: "docs/media"
  - path: scripts/ui-review/record.mjs
    contains: "waitForText"
  - path: scripts/ui-review/README.md
    contains: "Recording a loop"
  - path: scripts/ui-review/copy-preview.py
  - path: youcoded/desktop/src/renderer/dev/workbench/mock-shim.ts
    contains: "__workbenchAppearanceSync"
  - path: youcoded/desktop/src/renderer/dev/workbench/reply-script.ts
    contains: "splitTurns"
  - path: youcoded/desktop/src/renderer/dev/workbench/fixture-loader.ts
    contains: "turn_complete"
  - test: youcoded/desktop/tests/workbench-reply-script.test.ts
  - test: youcoded/desktop/tests/workbench-fixture-actions.test.ts
---
# Landing page (itsdestin.github.io/youcoded) + demo-clip tooling

The site is `youcoded/docs/index.html` (GitHub Pages serves `/docs`). Its pictures are
NOT drawn: every loop, still and the live embed come from the real renderer through the
workbench. **How-to for all of it: `scripts/ui-review/README.md` → "Recording a loop".**
Rebuilt 2026-08-28 for 1.3.0 (youcoded #360): `docs/archive/specs/2026-08-27-landing-page-rebuild-design.md`.

## Assets are generated, never hand-edited
**Invariant:** `bash scripts/ui-review/site-assets.sh <worktree>` regenerates `docs/media/`
(loops + posters), `docs/gallery/` (48 stills) and `docs/site/` (embed). It refuses a
workbench serving another tree and refuses to overwrite the gallery if any shot failed
verification. It is a step in the desktop release checklist (`docs/build-and-release.md`).
**Why:** the previous site drifted for four months because its mockups were hand-drawn.
**Guard:** the script's own checks; `scripts/workbench-boot-check.mjs`.

## Loops live in `docs/media/`, not `docs/site/media/`
**Invariant:** never write recordings under `docs/site/` — `npm run build:site` runs with
`--emptyOutDir` and empties that folder.
**Why:** it deleted nine freshly recorded loops on 2026-08-27.
**Guard:** none — candidate (site-assets.sh comment).

## One JSON scene per clip; wait for things, don't sleep
**Invariant:** clips are `scripts/ui-review/scenes/<name>.json` driven by `record.mjs`
(`click` / `clickText` / `typeSlow` / `key` / `waitFor` / `waitForText` / `hold`). Before
clicking anything a scripted reply produces (a permission card, a sentence), use
`waitFor`/`waitForText` — a fixed `settle` is a race. The poster is the LAST frame.
**Why:** row 2's first "Yes" fired 2 s before the card existed; first-frame posters showed
blank chats once loops started empty.

## What the "model" says is a fixture
**Invariant:** `?reply=<name>` picks `fixtures/replies/<name>.jsonl`; one `turn_complete`
per turn, the Nth message plays the Nth turn (wraps); `user_message` lines put a bubble on
the timeline only for turns nobody typed here (phone half of the sync row + `?autoplay=`).
Conversation fixtures end with `turn_complete` or they render frozen mid-turn.
Switches: `?seed=none` (empty chat), `?title=`, `?model=`, `?platform=android`,
`?signedIn=1` (fake friend for Connect Four), `?latency=` (0 for the live embed).
**Guard:** `workbench-reply-script.test.ts` (`splitTurns`, `isControl`),
`workbench-fixture-actions.test.ts`, `workbench-mock-contract.test.ts` (HAND_WRITTEN).

## Restart the workbench after editing a fixture or the mock shim
**Invariant:** the filming workbench runs with `VITE_NO_WATCH=1` on port 5473
(`YOUCODED_PORT_OFFSET=300`); it serves the code it started with.
**Why:** every frame still "verifies" against stale code — filmed the old fixture twice.

## The live embed
**Invariant:** the page's theme button drives the app's real Settings → Appearance; theme
changes go through `__workbenchAppearanceSync` (the app's cross-window sync), never a
reload; the iframe ignores the pointer until the visitor clicks once.
**Why:** a reload flashed the poster; an interactive iframe under the wheel trapped page
scroll ("janky").

## Motion in a review deck
**Invariant:** an animation, hover or visual bug is reviewed as a deck CLIP step
(`"clip": "<scene>"`, recordings from `scripts/ui-review/record-pair.sh <scene> <before> <after> <clips-dir>`),
never as a prose description or a still that can't show it.
**Guard:** `tests/test_spec.py` ClipStepTests, `tests/deck-render.test.mjs` (clip step).

## Copy and review
**Invariant:** page copy is reviewed in place with `scripts/ui-review/copy-preview.py serve
… [--media docs/media]` (edit text on a page-shaped preview; per-row loop verdicts) — never
a table, contact sheet, or chat description (all rejected). The never-claim list lives in the
spec's Global Constraints; the disclaimer paragraph is verbatim.
