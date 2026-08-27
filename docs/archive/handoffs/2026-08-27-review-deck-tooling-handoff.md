---
status: shipped
created: 2026-08-27
---

Superseded by `docs/archive/specs/2026-08-27-review-deck-v2-design.md` (built on `feat/review-deck-v2`); gaps 1, 3, 5, 6, 7 closed there; 2 and 4 are ROADMAP ideas.

# Hand-off: the UI review tooling (screenshot rig + review deck)

**Purpose of this file:** a prompt Destin can paste into another Claude session to
work on the *tooling itself* — how UI changes are captured, shown and decided —
without that session having to rediscover the pieces. Everything below is reachable
from the workspace root `/home/destin/youcoded-dev`.

## Paste-able prompt

> I want to improve the tooling we use to mock up, screenshot and review UI changes in
> YouCoded. Start by reading `docs/active/handoffs/2026-08-27-review-deck-tooling-handoff.md`
> (this file), then `scripts/ui-review/README.md` and `.claude/skills/ui-review/SKILL.md`.
> The pieces are: (1) the **UI Workbench** — the real renderer in a browser tab against a
> fake backend (`scripts/run-workbench.sh`, `youcoded/desktop/src/renderer/dev/workbench/`);
> (2) the **screenshot rig** — `scripts/ui-review/run-review.sh` boots a workbench on a
> dedicated port and runs every `scripts/ui-review/plans/*.json` through `shot.mjs` across
> six themes, verifying each shot, then builds sheets/coverage/gallery; (3) the **review
> deck** — `scripts/ui-review/review-cards.py crop|build <spec.json>` turns a spec into a
> one-point-per-step HTML page (one screenshot, one ring, one problem line, one fix line,
> Yes / No / Tell me more), with Before/After flip when a spec has two runs. Specs and the
> pages they produced live in `docs/active/design/2026-08-25-ui-audit/` (`phase-c-cards.json`
> is the brief format, `phase-c-review.json` the before/after format). Read the "Known gaps"
> list in the hand-off before proposing changes, and do all work in a worktree.

## The pieces, in the order a change flows through them

| Step | What | Where |
|---|---|---|
| Mock / build the UI | Edit the real components; the workbench hot-reloads them in a browser tab (no Electron). Channels with no backend go in `MOCK_ONLY`. | `scripts/run-workbench.sh`; `youcoded/desktop/src/renderer/dev/workbench/` (`mock-shim.ts`, `scenarios.ts`, `WorkbenchFrame.tsx`, `fixtures/`); `scripts/workbench-boot-check.mjs` (headless boot check of every route) |
| Photograph every surface | `run-review.sh <worktree> [outDir] [themes]` — starts the workbench on Vite `5173 + YOUCODED_PORT_OFFSET` (default offset 300 → 5473), refuses if that port serves another worktree, runs plans in parallel shards. | `scripts/ui-review/run-review.sh`; `shot.mjs` (one Chrome per shard, CDP; per-shot `actions`, `expect`, readiness `ready`, RMSE-vs-baseline check); `plans/*.json` (`main`, `overlays`, `narrow`, `tall`, `latency`, `marketplace`, `empty-marketplace`, `electron-*` for the real app) |
| Reports | Side-by-side theme sheets, painted-pixel contrast probe, coverage (covered / partial / MISSED with the reason), gallery. | `montage.sh`, `montage-ab.sh`, `contrast.mjs`, `coverage.mjs`, `make-gallery.py`; outputs under `scratch/<run>/` (git-ignored) |
| Show it to Destin | A **deck**: one step per point. Spec JSON → `crop` cuts 1:1 regions out of the run's PNGs → `build` writes the HTML next to the spec. Crop regions are named in `crops.json` (shared) or in the spec. | `scripts/ui-review/review-cards.py`; `scripts/ui-review/crops.json`; specs + HTML in `docs/active/design/2026-08-25-ui-audit/` (`phase-c-cards.json`, `phase-c-review.json`); images under `images/` there (git-ignored) |
| Decide | Destin answers Y / N / M per step; the summary step copies one feedback block into chat; answers persist in the page's localStorage. | built into the deck HTML (`review-cards.py` `JS` block) |
| Record | Decisions go into the findings ledger and ROADMAP the same day. | `docs/active/design/2026-08-25-ui-audit-findings.md` (§5 ledger), `ROADMAP.md` (whole-UI entry) |

Older, rejected formats kept only for their archived pages: `scripts/ui-review/review-page.py`
(prose-first page; Phase A/B), and the plain gallery. Do not revive them — see
`feedback-review-page-format` in Claude's memory for why.

## Known gaps (verified, not guesses)

*Update 2026-08-27 evening:* gaps 1, 3, 6 and 7 are closed (port probing, rig-measured boxes, run-id ordering, per-plan sheets). New since: **choice steps** (`variants`, pick one — Destin's rule), **per-step `themes`** for one-theme real-app captures, brief decks say *build it / leave it*, the root URL redirects to the deck, attach mode picks the app window. Still open: 2 (theme-asset:// in the workbench), 4 (attaching Destin's own screenshot), 5 (text-based `expect`s).

1. **Two sweeps at once deadlock.** Shards take CDP port `30000 + offset + index`, index up
   to ~80, so two sessions at offsets 300 and 310 overlap and hang silently (2026-08-27).
   Workaround: offsets ≥ 100 apart. Fix: probe ports before use; refuse loudly.
2. **The workbench cannot serve theme folders** (`theme-asset://`), so community-theme
   previews and wallpaper-dependent bits fall back in screenshots. A mock handler that
   maps `theme-asset://<slug>/<file>` onto the fixture theme folders would close this.
3. **Marker coordinates are hand-estimated percentages** in the spec. A helper that
   takes a CSS selector (or text) and resolves the ring position from the live page
   during `shot.mjs` would remove the guesswork — the rig already runs JS per shot.
4. **`?step=N` deep links exist, but the deck has no way to attach a screenshot Destin
   took himself** (e.g. of the live app) to a step.
5. **Plan `expect`s are brittle to copy changes** (the Library tab text change broke three
   plans in one day). Prefer `aria-label`/role selectors over visible text in new plans.
6. **Coverage merges manifests by mtime**; a partial re-run of one plan under load can
   leave stale MISSED rows from an earlier attempt until the plan is re-run cleanly.
7. **Sheets are rebuilt for every plan on every run** (`montage.sh` over all `shots-*`),
   which is most of the wall-clock on a small re-run; scope it to the plans that ran.

## What "good" looks like (Destin's words, 2026-08-25 → 27)

- Gallery of full-window sheets: "this sucks as a review surface — no quick way to give
  feedback and none of the changes are explained."
- Prose-first page: "gotta read WAY too much text in different areas… images are poorly
  organized/annotated."
- Board of cards with markers + a points list: "still WAY too much going on visually…
  not clear where I'm supposed to glance/select."
- The deck (one point per step): "that was much better."

So the bar is: one thing to look at, one line to read, one thing to click; never make
him hunt for where to look or what to do next.
