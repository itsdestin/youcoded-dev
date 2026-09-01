---
status: active
created: 2026-08-31
revised: 2026-09-01
tags: [ui, motion, session-strip, chat-view, desktop, handoff]
plan: docs/active/plans/2026-08-31-session-strip-and-switch-motion.md
spec: docs/active/specs/2026-08-31-session-strip-and-switch-motion-design.md
deck: docs/active/design/2026-08-31-session-motion/session-motion-live.json
---

# Session strip & switch motion — handoff

**State: rebuilt 2026-09-01, green, served as a live deck, waiting on Destin's three answers.**

**Later on 2026-09-01:** Destin saw the rebuild in the workbench (*"I think this is better"*)
and asked for Chrome's select-on-press: the old session collapsing to a dot and the new one
opening the moment you press, before any drag. That forced a second drag model — the pill in
hand is now a floating twin over a row that is free to reshape underneath it (spec §6.1,
§7.4) — and the deck's second step is now a pick-one on WHEN the switch happens (press /
press-with-name-on-drop / release) instead of the drag yes/no. Three modes are read from
`[data-select]`; the winner becomes the only behaviour.

The first cut (14 commits, 2026-08-31) was rejected in use: *"much too bouncy/aggressive"*,
*"clicking is weird and jumpy"*, *"drag spacing is still really odd"*. This session recorded
each gesture frame by frame in the workbench, found a mechanical cause for every complaint,
and rebuilt the motion on top of the first cut's correctness work (id-keyed drag, the packer
measuring the badge, the frozen pack). The spec's §3, §5.2, §6, §7.4–7.5, §8 and §11 are
rewritten to describe what is built now; the plan is history.

## Where the work lives

| | |
|---|---|
| Branch | `feat/session-strip-motion` (youcoded), merged up to `origin/master` at `57a8efc0` |
| Worktree | `worktrees/session-motion` — clean, committed, **not pushed** at the time of writing |
| Review deck | `docs/active/design/2026-08-31-session-motion/session-motion-live.json` — three live steps |
| Deck branch | `feat/session-motion-review` (youcoded-dev), worktree `worktrees/motion-docs` — see "Why a workspace worktree" |
| Verification | `bash scripts/verify.sh worktrees/session-motion` → exit 0 (types, FULL suite, knip, eslint, ast-grep); `node scripts/workbench-boot-check.mjs <port>` → 15/15 routes |

## What was wrong, by frame, and what replaced it

| Destin's words | Cause (measured) | Now |
|---|---|---|
| "clicking is weird and jumpy" | Pointer-down cleared hover, so the peek collapsed to a dot and the click re-opened it: open → shut → open | Hover untouched at pointer-down; the peek becomes the active label, then the badge opens |
| "still seeing … truncated names" | The badge sat at full width while the name was still opening; and widths were measured in `system-ui` while the UI font is a ~15% wider monospace | Badge opens after the name (`badge-in`); fonts read off the real label |
| jank on every click | The label animated the text's own width, so the ellipsis re-fitted every frame ("theme …", "theme cont…") | Name laid out once at `max-content`; only a clipping box's `max-width` animates, between two measured numbers; overflow fades |
| "too bouncy/aggressive" | Spring curve on a width-like property; the whole row overshot and came back | No overshoot anywhere: `--ease-out` and `--ease-settle` only |
| "drag spacing is still really odd" | (a) the pill was positioned by its SLOT with an ease: it hopped 26px per slot while the cursor moved 130px; (b) a dot picked up while its peek was open collapsed mid-drag, opening a ~150px void | Pill rides under the cursor 1:1, clamped to the row; target = nearest **slot** centre; hover held through the drag |
| release jumped | Visuals cleared at pointer-up, reorder landed after the cross-window IPC | Reorder + release + settle in one render; the pill glides home (two-render FLIP) |
| (found, not reported) | The review presets had been pasted **inside `:root`**, so `[data-motion=crisp]` swallowed `--bottom-chrome-total` and the drawer width for every normal page | Presets outside `:root`; a test pins `:root` still holds both |
| (found, not reported) | The switch window opened from `useEffect` — one un-animated frame first on any non-click switch | Derived during render; test pins committed sequence `[false, true]` |

## How Destin reviews it

The deck is **live**: each pane is the real strip in the workbench's live route. He clicks,
hovers and drags in the pane itself.

```bash
cd worktrees/motion-docs   # or the main checkout once it has pulled origin/master
python3 scripts/ui-review/review-cards.py serve docs/active/design/2026-08-31-session-motion/session-motion-live.json
# prints  [deck] http://127.0.0.1:<port>/deck-live.html   — quote that line to Destin
```

`serve` boots the `session-motion` worktree's workbench on :5513 itself. Three steps:

1. **feel** — pick one of Settled / Crisp / Soft (`[data-motion]`, speed and curve only).
2. **switch-when** — pick one of Press / Press-name-on-drop / Release (`[data-select]`).
3. **arrival** — pick one of Fade-and-lift / Fade / Cut (`[data-arrival]`).

Answers land in `session-motion-live.answers.json` beside the spec on Submit.

## After the answers

1. Move the winning values into `:root` in `globals.css` and **delete** the `[data-motion]` /
   `[data-arrival]` blocks, the `?motion=` / `?arrival=` / `?select=` scaffold in `index.tsx`,
   `readSelectOn` and the two losing branches in `SessionStrip` (the `SelectOn` type,
   `dragMode`, `heldAsDot`), and the `motion` / `arrival` / `select` props on
   `SessionStripMotionDemo` (keep the demo and its two
   registry surfaces with one candidate each — they are how the strip gets reviewed next time).
   Update the two `animation-frame-budget` pins that name the presets.
2. If the drag is a "no", the answer's note says what; the model is in `drag-order.ts` and
   §7.4 — do not go back to slot positioning, that is the thing it replaced.
3. Merge and push `feat/session-strip-motion`; then `feat/session-motion-review` (deck +
   docs). Archive the spec, plan and this handoff; flip ROADMAP items 1067 and 1374.
4. Clean up: `worktrees/session-motion`, `worktrees/motion-docs` (and its `worktrees`
   symlink), `worktrees/session-switch-animation` (PR youcoded#192 — close unmerged).

## Why a workspace worktree, and the symlink in it

The main `youcoded-dev` checkout is 29 commits behind and cannot pull: other sessions have
uncommitted edits to `CLAUDE.md` / `ROADMAP.md` / two rules, and untracked files that
`origin/master` now tracks. The live-deck tooling (`deck/live.py`, `?view=live`) is only on
`origin/master`, so this session's docs and deck live in `worktrees/motion-docs`, a worktree
of `youcoded-dev` at `origin/master`. The deck's `serve` resolves `live.worktree` under its
own root's `worktrees/`, so that worktree holds an **untracked symlink** `worktrees →
../../worktrees`. Once the main checkout has pulled, the deck runs from there unchanged and
both the worktree and the symlink go.

## Things the next session should not re-learn

- Measuring text: **read the label's computed font**; never assume `system-ui`. The packer
  had under-measured every name since it was written.
- The twin must have **no transition on its position**, and the neighbours must have
  `transition: none` for the one render in which the DOM order changes (`reorderQuiet`).
- A drop reorders the row and React **re-inserts the moved node, which restarts any CSS
  animation on it** — that is why the badge's opening is armed by the switch alone
  (`badgeArmed`), not by the drag.
- Drag geometry is **synthetic** (`layoutRects` from the pack computed at press), never the
  DOM: on a select-on-press the row is mid-animation when the drag starts.
- `useLayoutEffect` with no deps in `SessionStrip` is the settle FLIP; it does a cheap null
  check every render on purpose.
- `data-session-idx` is a cross-process contract (main.ts tear-off placement, perf-lab).
  Never rename it; `data-session-id` sits beside it.
- Recording scenes need `?mode=workbench&child=1&…`; run `record.mjs` from the workspace
  root (paths are relative); a Vite server started before a dependency was linked caches
  the failed resolution — restart it.
- A youcoded worktree from before the games branch lacks `chess.js`; `cp -al` it from a
  sibling worktree that has it, never `npm ci` in a hardlinked tree.
- The old clip deck (`session-motion.json`, 8 clips) is kept as the record of what was
  rejected as a medium; it is not the review.
