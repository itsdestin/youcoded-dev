---
status: active
---

# Resume Browser load time — diagnosis handoff

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
3. Time from that click until `document.querySelectorAll('[aria-haspopup="dialog"]').length` is non-zero and stable across two consecutive `requestAnimationFrame`s. Report that, plus `document.getElementsByTagName('*').length`.
4. Then set the search input's value through the native setter and dispatch `input`, timing to stability the same way.

To measure at real scale, temporarily raise the stress fixture count in `desktop/src/renderer/dev/workbench/scenarios.ts` (`Array.from({ length: 220 }, …)` → `1642`) and **revert it before committing** — it is 220 on purpose so the normal stress scenario stays usable.
