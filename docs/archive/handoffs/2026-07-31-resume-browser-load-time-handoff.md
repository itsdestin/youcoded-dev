---
status: shipped
---

# Resume Browser load time — diagnosis handoff

> **RESOLVED 2026-07-31** — fixed by `f8ca631b` on `feat/session-launch-ux` (chunked reveal;
> not the windowing this doc anticipated). Outcome, including which of this doc's hypotheses
> were disproved, is in [Outcome](#outcome) at the bottom. Everything above it is the original
> diagnosis handoff, left unedited.

**Date:** 2026-07-31
**Reported by:** Destin — "it definitely does feel slow and takes a while to load/display resumable sessions. i've been wanting to optimize it for performance for a while."
**Goal of the receiving session:** make opening the Resume Browser, and typing in its search box, feel immediate at Destin's real data scale (~1,642 rows).

This is a **diagnosis-first** handoff. A first measurement pass is already done and is recorded below so you don't repeat it — including two things I got **wrong** before measuring, which are the traps this doc mainly exists to stop you falling into.

---

## Start here: branch state

The Resume Browser's row markup was rewritten on **`feat/session-launch-ux`** (worktree `youcoded-dev/worktrees/session-ux`, 12 commits ahead of master, head `6ef06c72`, **unmerged**). The card is now: absolutely-positioned icon cluster, tag chips line, folder + model + timestamp bottom row, an in-card tag sheet, and a mutually-exclusive expanded resume pane.

**Branch off `feat/session-launch-ux`, not master** — or wait for it to merge. A perf rewrite of `renderSessionRow` on master will conflict with essentially all of it.

---

## What was measured

### File IO is NOT the bottleneck — do not start here

Full IO cost of one `listPastSessions()` against Destin's real `~/.claude` tree, measured 2026-07-31 (script in the appendix):

```
A  walk + stat         0.01s
B  tail reads          0.01s   32.1MB over 549 files
C  head reads          0.03s   78.7MB over 411 files
D  store list (sync)   0.01s   0.7MB over 1682 files
   total               0.06s
```

Sixty milliseconds. Page cache + NVMe make this a non-issue. `conversation-store.list()` doing 1,682 **synchronous** `readFileSync` calls on the main process looks alarming and is measurably ~10ms — leave it alone unless a profile says otherwise.

### Rendering IS the bottleneck

Measured over CDP against the UI Workbench with the stress fixture temporarily raised to 1,642 rows (Destin's real count — see below):

```
                        1642 rows        5 rows (baseline)
open → list committed   948ms            225ms
DOM nodes               37,920           546
one search keystroke    278ms            48ms
cards rendered          1642             4
```

So **~720ms of the open and ~230ms of every keystroke is row rendering**, at ~23 DOM nodes per card.

`ResumeBrowser.tsx:1193` is `flatSorted.map((s) => renderSessionRow(s, true))` — every row, every render, no windowing. `:1180` is the grouped-mode equivalent.

---

## Two corrections — read these before re-deriving anything

**1. Don't "skip the transcript scrape for rows the store already covers."** I proposed this before measuring. It would save ~10ms of a ~1,000ms problem. Dead end.

**2. `find ~/.claude/projects -name '*.jsonl' | wc -l` gives 1,221 and is the WRONG number.** Transcripts live at depth 2; the files at depth 4 and 6 are **subagent transcripts** (`<session>/subagents/agent-*.jsonl`) which `listPastSessions` never scans, because it walks exactly one level. I used the recursive count to conclude "672 browsable transcripts have no store record", which was false and led to a wrong recommendation. Correct figures:

```
browsable transcripts (depth 2, >500B)     548
  …with a store record                     548   (100%)
  …without                                   0
store records with no local transcript     1094
────────────────────────────────────────────────
rows the browser builds                   ~1642
```

Use `find ~/.claude/projects -mindepth 2 -maxdepth 2 -name '*.jsonl' -size +500c` when you need this count.

---

## The likely fix, and what makes it non-trivial

Window the list — render only the ~20 rows in view. Expected: open well under 250ms, keystrokes imperceptible.

Four things that make this more than dropping in a virtualization library:

1. **Grouped mode interleaves headers with rows.** When the Projects filter is active, `grouped` (`:1180`) renders a `<div>` header per project followed by its rows. A windowed list needs one flat index over a *mixed* item list (header | row), not a uniform row array.
2. **Rows are variable height, and change height on click.** A card grows when its resume pane or tag sheet opens, and the tag chips line is conditional and can wrap. Fixed-height windowing will misplace things; you need measured or estimated-with-correction heights.
3. **`useScrollFade` (`:240`, applied at `:1169`)** reads the scroll container to drive the top/bottom fade pseudo-elements. Verify it still behaves when its child is a virtualized spacer rather than the real content.
4. **The whole filter pipeline recomputes per keystroke.** `applyFilters` → `sortSessions`/`groupSessions` (`resume-browser-filters.ts`) are `useMemo`'d on `search`, so each keystroke re-runs the full pipeline over 1,642 rows *and* re-renders every row. Windowing fixes the render half; check whether the filter half is worth debouncing after that.

Also worth profiling before committing to windowing: `renderSessionRow` is a closure re-created every render and is not memoized, so React reconciles all 1,642 subtrees on any state change (including `organizeId`, `expandedId`, and every keystroke). A `React.memo`'d row component might get a large share of the keystroke win for far less structural risk than windowing — measure both before choosing.

---

## Constraints

- **Never touch Destin's live app.** All runtime work happens in a dev/workbench instance. See `.claude/rules/live-app-safety.md`, which overrides anything in conflict.
- Verify with `bash scripts/verify.sh worktrees/<your-worktree>` and `node scripts/workbench-boot-check.mjs`.
- Guard tests that touch this file today: `desktop/tests/resume-browser-organize.test.tsx` (7), `resume-browser-native-picker.test.tsx` (4), `resume-browser-filters` tests. They assert on rows being present in the DOM — **a windowed list will break any assertion about an off-screen row**, and that failure is the test doing its job, not a bug in the test.
- Report the same before/after numbers from the harness below. "Feels faster" is not a result.

---

## Appendix — measurement harness

Both scripts were run from the session scratchpad; neither is committed. Recreate them under your scratchpad.

### IO benchmark

Mirrors `session-browser.ts`'s phases against the real tree (read-only). Constants must match the source: `HEAD = 256*1024`, `TAIL = 64*1024`, `MIN = 500`, one-level walk. Times four phases: directory walk + stat; tail read of every file; head read of the files with no topic file and no conversation-index entry; and the conversation-store record read (`~/YouCoded/Personal/Conversations/{claude,native}/*.json`).

### Render benchmark

Headless Chrome + CDP against the workbench (`bash scripts/run-workbench.sh <worktree>` on port 5233), following the launcher pattern in `scripts/workbench-boot-check.mjs`. Sequence:

1. Navigate to `?mode=workbench&child=1&scenario=stress`, wait ~6s for boot.
2. Click `button[title="All Sessions"]`, then the button whose text is exactly `Resume`.
3. (Row selector note: count `button[aria-label^="Organize "]`. Do NOT scope by `.scroll-fade` — the mounted app has FOUR of those and `querySelector` picks the wrong one, which reads as "zero rows rendered".) Time from that click until `document.querySelectorAll('[aria-haspopup="dialog"]').length` is non-zero and stable across two consecutive `requestAnimationFrame`s. Report that, plus `document.getElementsByTagName('*').length`.
4. Then set the search input's value through the native setter and dispatch `input`, timing to stability the same way.

To measure at real scale, temporarily raise the stress fixture count in `desktop/src/renderer/dev/workbench/scenarios.ts` (`Array.from({ length: 220 }, …)` → `1642`) and **revert it before committing** — it is 220 on purpose so the normal stress scenario stays usable.

---

## Outcome

Fixed 2026-07-31 by `f8ca631b` on `feat/session-launch-ux`. The diagnosis above was
confirmed against the harness in the appendix before anything changed.

### Confirmed, and what the confirmation added

The reproduction matched this doc (37,920 DOM nodes exactly). Cost attribution across the
open was new — roughly half React, a third browser style+layout:

|                       | before | after |
|-----------------------|--------|-------|
| open → list settled   | 804ms  | 96ms  |
| ↳ script (React)      | 425ms  | 72ms  |
| ↳ style recalc        | 194ms  | 13ms  |
| ↳ layout              | 99ms   | 8ms   |
| DOM nodes             | 37,920 | 1,585 |
| cards built           | 1,642  | 50    |
| search keystroke 1    | 220ms  | 64ms  |
| search keystroke 2    | 319ms  | 83ms  |
| search keystroke 3    | 183ms  | 100ms |

Median of 5 runs each, same machine, back-to-back with only `ResumeBrowser.tsx` stashed
between them; the baseline was stable to ±7ms. **Open time is now flat in conversation
count** — 90ms at 5 rows, 96ms at 1,642, 85ms at 4,000 — so it no longer degrades as
history grows.

### Two hypotheses in this doc were disproved — do not re-derive them

1. **`React.memo` on the row could not have fixed the open.** This doc suggested it "might
   get a large share of the keystroke win." It gets none of the OPEN win: a first render has
   nothing to bail out of, so all 425ms of script and all 293ms of style+layout still happen.
2. **The filter pipeline never needed debouncing.** Keystroke cost shows no trend with
   session count (4,000 rows keystrokes as fast as 200), so `applyFilters`/`sortSessions`
   over 1,642 rows was never a meaningful share.

### What was built, and why not windowing

Chunked reveal: 50 items rendered, an IntersectionObserver sentinel tops up by 50 on scroll
(the same gating shape `ArtifactThumbnail.tsx` already uses). Grouped and flat mode flatten
into one ordered header|row list, so a single slice bounds both — that is this doc's hazard
1, and it had to be solved either way.

Hazards 2 and 3 (variable heights, `useScrollFade` seeing a spacer) simply do not arise:
chunked reveal does no height bookkeeping and the container still holds real content.
Weighed against a dependency (`@tanstack/react-virtual`) and a hand-rolled virtualizer;
chosen for landing on an unmerged 12-commit branch with the least structural risk.

**Accepted trade-off:** the scrollbar is proportional to what is revealed, not the whole
list, and scrolling continuously through many hundreds of rows re-accumulates DOM. True
windowing is the upgrade if deep scrolling ever becomes a real usage pattern.

### Two traps, caught by a behavioural check rather than by the perf numbers

- The reveal window must reset on **query** changes only, never on the item list's identity.
  `items` also changes when a session mutates (tagging, marking complete, saving a note), and
  resetting on those collapsed the list back to 50 rows under a user who had scrolled down to
  organize something.
- Resetting the window while the container stayed scrolled deep left the sentinel already in
  view, cascading it straight back up — measured re-revealing 250 rows instead of 50.
  Scrolling to the top on a query change is what makes the reset stick.

Both were invisible to the timings and only showed up in the functional check. Keep that
check in mind before trusting a future perf change here.

### Harness note

The stress fixture count is now a `?stressRows=N` URL knob
(`dev/workbench/scenarios.ts`), so re-running the render benchmark no longer needs the
temporary source edit this doc's appendix described — nothing to remember to revert. The
default is still 220. Both benchmark scripts remained in the session scratchpad, uncommitted.
