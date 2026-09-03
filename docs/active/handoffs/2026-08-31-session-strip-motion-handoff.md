---
status: active
created: 2026-08-31
tags: [ui, motion, session-strip, chat-view, desktop, handoff]
plan: docs/active/plans/2026-08-31-session-strip-and-switch-motion.md
spec: docs/active/specs/2026-08-31-session-strip-and-switch-motion-design.md
blocked_on: docs/archive/specs/2026-08-31-live-review-panes-design.md
---

# Session strip & switch motion — handoff

**State: code complete and green. Review medium rejected. Not merged.**

Tasks 1–12 of the plan are implemented, committed and verified. The work is
blocked on ONE thing: the review deck it was presented in was clip-based, and
Destin rejected clips as a way to judge motion — *"the videos are just rough to
compare."* Nothing about the code is known to be wrong; it has simply not been
approved, and some motion values may change once it is reviewed properly.

---

## Where the work lives

| | |
|---|---|
| Branch | `feat/session-strip-motion` (youcoded), 12 commits ahead of `origin/master` |
| Worktree | `worktrees/session-motion` — clean |
| "Before" worktree | `worktrees/session-motion-before` — detached at `2af35eff`, existed only to record the Before clips. **Safe to delete.** |
| Diff | 13 files, +838 / −143 |
| Workspace artifacts | committed to `youcoded-dev` (plan, deck spec + scenes + clips, `record.mjs` drag verb) |

Verification at the point of handoff:

- `bash scripts/verify.sh worktrees/session-motion` → **exit 0** (types, related tests + all 30 source-scanning guards, knip, eslint, ast-grep)
- full desktop suite → **7573 passed, 42 skipped, 0 failed**
- Android and the marketplace worker are untouched and were not run (desktop-only change).

---

## What was built

| Area | Change |
|---|---|
| Motion tokens | Three curves + three durations in the theme-independent `:root` of `globals.css`. All three curve values already existed inline — a rename, not a new look. |
| `use-one-shot-window.ts` | One hook: true for one animation window after a key changes, never on mount. Serves both the pill expand and the transcript arrival. |
| `pill-label-style.ts` | Pure module for the label's width + transition. Fixes both causes of the snap: `maxWidth` was `undefined` for the active pill (nothing to interpolate), and the transition was switched off for every pack-expanded pill — which the packer guarantees the active pill always is. Uses `calc-size()`. |
| Hover handlers | Now attached unconditionally, gated inside the handler. A pill the packer collapsed to a dot under a resting cursor used to stay a dot. |
| Curves | The three hand-written `cubic-bezier(` in `SessionStrip.tsx` converted to tokens; the file pinned against a fourth. `steps()` deliberately untouched. |
| `drag-order.ts` | Pure: nearest-pill hit test, canonical reorder indices, neighbour slide offsets. Everything keyed by session id. |
| Drag state | Moved off indices onto ids end to end. Pill geometry frozen at pointer-down. |
| `use-frozen-pack.ts` | Holds the pack taken at pointer-down so the row cannot repack under the cursor. |
| Drag visuals | Ghost + insertion line deleted; the real pill lifts and moves, neighbours step aside. |
| `ChatView` | The incoming conversation arrives on a session switch; the outgoing one is not animated. |

---

## Things found during implementation that are NOT in the plan

Read these before touching the branch.

### The drag bug was worse than the plan described, and it is now pinned

The plan said drops land in the wrong slot once sessions overflow into the "+N"
chip. Reading `packSessions` showed *why*, and it is broader: the packer keeps
the active pill plus a **prefix** of the others. So whenever the active session
sits past that prefix, its position in the visible strip is not its position in
`sessions` — meaning **dragging the active pill** was the broken case, and the
wrong pill also dimmed for the whole drag.

`tests/drag-order.test.ts` → `describe('the index spaces the strip used to mix')`
reproduces this with the real packer. Do not delete it.

### `data-session-idx` is a cross-process contract — never rename it

The plan originally renamed it. It is read from outside the renderer by two
consumers that both **fail silently**:

- `youcoded/desktop/src/main/main.ts:1167` — the main process measures the first
  pill by that attribute, inside a string `tsc` cannot see, to place a torn-off
  window under the cursor. A miss is swallowed (`if (!pillRect) return`).
- `scripts/perf-lab/scenario-workload.mjs:259,301,303` — reads the attribute
  **and its numeric value**.

The branch **adds** `data-session-id` beside it. `animation-frame-budget.test.ts`
asserts both are present.

### Pill geometry must be frozen, not re-measured

`getBoundingClientRect()` includes the `translateX` the neighbours carry during a
drag. Re-measuring per pointermove feeds this frame's hit-test answer back in as
next frame's input — pills chatter at the boundaries and the dragged pill's
travel clamp drifts. `pillRectsRef` is filled once in `handlePointerDown`.

### Three small environment facts the plan got wrong

- Test files using `renderHook` need `// @vitest-environment jsdom` on line 1 —
  this repo's vitest runs `node` by default.
- Recording scenes must use `?mode=workbench&child=1&…`. The workbench wraps the
  app in an iframe, so a top-level `querySelector` finds **zero** pills. This
  cost a wrong turn; it is now in the scenes and the commit message.
- Spreading a `NodeList` fails under this tsconfig (no `DOM.Iterable`) — use
  `Array.from`.

### `calc-size()` was verified, not assumed

Checked headlessly in the app's own Chromium (146 via Electron 41.10.3):
`CSS.supports` true for both `calc-size(max-content, size)` and the capped form,
and it computes to a real intrinsic width. The `grid-template-columns` fallback
documented in `pill-label-style.ts` is **not** needed.

### The old bug was never reproduced end-to-end in a live window

Several attempts to drive the app into the overflow state by clicking failed. The
proof is the packer-level test plus reading the two lines of old code, not a
recording of the old behaviour. Stated plainly so nobody repeats the attempt
thinking it is easy.

---

## What is NOT done

1. **Task 12's review was rejected as a medium.** The deck at
   `docs/active/design/2026-08-31-session-motion/` (spec, 4 scenes, 8 clips)
   exists and builds, and its clips are committed. It should be **re-authored as
   live pick-one steps** once `docs/archive/specs/2026-08-31-live-review-panes-design.md`
   ships. Keep the clips — a live step does not archive, so a still or clip
   alongside is still wanted.
2. **Task 13** (per-bubble stagger) is conditional and untouched. Correct.
3. **Destin has answered nothing.** No step was approved. Motion values are
   provisional.
4. **The plan's remaining Done criteria**: worktrees not removed, branch not
   merged, spec not flipped to `shipped`, docs not archived, PR #192 not closed.

---

## Next steps, in order

1. Another session implements the live-review-panes spec.
2. Author real alternative motion candidates in
   `youcoded/desktop/src/renderer/dev/workbench/compare/registry.tsx` on this
   branch — **the built behaviour is one named candidate among genuine
   alternatives**, not the only option with two worse ones invented around it.
   A step with no real alternative becomes a "try this" instead.
3. Re-author the deck as live steps; hand it to Destin; act on the answers.
4. Only then: merge, clean up both worktrees and the branch, archive the plan and
   spec, flip the roadmap item, close youcoded PR #192 unmerged.

---

## Housekeeping done at handoff

- Deck server stopped (it was serving the superseded clip review).
- Temporary probe scripts (`scripts/ui-review/_probe.mjs`, `_dragcheck.mjs`)
  deleted — they were throwaway CDP helpers, not committed.
- `worktrees/session-motion-before` is still on disk and is safe to delete; it
  holds no work.
