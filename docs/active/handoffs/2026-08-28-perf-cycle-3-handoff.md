---
status: active
created: 2026-08-28
supersedes_for_cycle_3: docs/active/handoffs/2026-08-27-perf-cycle-1-handoff.md §6
---

# Perf cycle 3 — handoff

Cycles 1 and 2 are SHIPPED. This is what remains, what changed under it, and what to
verify before committing to any of it.

## 1. Where the programme stands

| cycle | card | outcome |
|---|---|---|
| 1 | per-token streaming costs (N1/N2/N3) | SHIPPED — youcoded PR #342, merge `97600ddd`. Gate said REJECT because the rig streams whole turns and is blind to the per-token path; Destin shipped on the pinning tests. |
| 2 | paged conversation history | SHIPPED — youcoded PR #349, merge `a09b58c6` (+ docs PR #351, `8935c28f`). |
| 3 | **park hidden views** — and/or **evict off-screen turns** | NOT STARTED. Read §2 before planning: its premise moved. |

Current master: `youcoded` at `8935c28f`. Baseline report for any A/B:
**`perf-reports/2026-08-28-0803-8935c28-cycle3-baseline.json`** (EXIT 0, every phase
including `scrollback`, 3 repeats). It supersedes the cycle-2 baseline
(`…-0325-984b11a-cycle2-paged.json`), which has no scrollback numbers — comparing against
that one leaves the three ceiling metrics unjudged.

## 2. READ THIS FIRST: what paging did and did NOT bound

The cycle-1 handoff (§6) sized card 3 as **"463 MB → 7.0 GB at six sessions"**. That 7.0 GB
was measured when every open session rendered its ENTIRE transcript on open.

Paging moved the STARTING point, not the ceiling. Same rig, same fixture, six sessions:

| | before paging | after paging |
|---|---|---|
| `workload.median.pssAfterMb` | 7003.7 | **1721.1** (−75.4%) |
| `idle.pssMb.median` | 461.2 | 466.2 (unchanged) |

**1721 MB is a FLOOR, not a new ceiling.** The rig never scrolls back, so that number is
"six sessions at `PAGE_TURNS` turns each". A page loaded by scrolling up is PREPENDED and
never removed (`chat-reducer.ts` → `HISTORY_PAGE_LOADED`, no cap, no eviction anywhere in
the reducer), and every open session's view stays mounted (`App.tsx` renders
`sessions.map(<ChatView>)`; hidden ones only get `content-visibility: hidden`, which skips
layout but keeps rendering state alive). So a user who scrolls to the top of each of six
long conversations rebuilds the whole 7 GB working set — just gradually, and only if they
ask for it.

**That accumulation is what cycle 3 is for.** Do not read the 75% drop as "most of the
prize is already collected"; read it as "the default case is fixed, the worst case is
not". The open question is not how big the prize is — it is how much of the working set is
rendered DOM (which parking frees) versus reducer data (which only eviction frees), because
that decides which of the two changes below is the real fix.

### Measured, 2026-08-28 — the cycle-3 baseline

`perf-reports/2026-08-28-0803-8935c28-cycle3-baseline.json` — EXIT 0, every phase, 3
repeats, `aborted: null`, `incomplete: []`, and every conversation reached its beginning
on every repeat. It agrees with the cycle-2 report (`…-0325-984b11a-cycle2-paged.json`)
on all 20 pre-existing PRIMARY metrics inside noise (largest 7.5%, most under 4%), so the
app and the rig are unchanged and the new numbers can be read straight. **A/B any cycle-3
change against THIS report.**

| | floor (nothing scrolled) | ceiling (all three read to the top, post-GC) |
|---|---|---|
| PSS | 1,539.4 MB | **4,306.0 MB** (+2,764.5) |
| JS heap, live | ~20 MB | +514.2 MB |
| JS heap, committed | ~22 MB | +949.9 MB |
| DOM nodes | ~23,500 | **+1,441,256** |
| released by switching away + a forced GC | — | **41.0 MB — 1.5%** |

**Destin's reading was right and the plan's was wrong.** Paging moved where a
conversation starts; the ceiling is untouched. 12,100 messages read back cost ~2.76 GB
retained, and the pre-paging 7.0 GB figure was measured with streaming and 40 switches on
top, so this is the same regime rather than a smaller one.

Three findings that should shape the plan:

1. **Nothing is released, and now there is a number for it.** 41 MB of 2,764 — 1.5%.
   That is the control: no existing mechanism bounds this, so a cycle-3 change starts
   from zero rather than improving something partial. It is also what `releasedMb` is
   for — the metric a change has to move.
2. **The rise is mostly RENDERED, not stored.** Live JS objects account for 514 MB and
   V8's committed heap for 950 MB; the remaining **~1,896 MB (69%) is DOM, layout and
   paint** — 1.44 M nodes, ~119 per message. Eviction frees both halves (dropping a
   timeline entry unmounts its DOM too); parking a hidden view frees only the DOM half,
   and only for the five sessions you are not looking at. **A third option the two-way
   framing missed: virtualizing the message list** — render only what is on screen —
   attacks the 69% directly without dropping any data, and is the only one of the three
   that also helps the conversation currently in front of you.
3. **Every page turn gets more expensive as the window grows, linearly.** One `huge` leg,
   measured every 10 pages: 201 ms at 10 pages loaded, then 268, 365, 475, 610, and
   **705 ms at 110 pages** — 3.5x, and the conversation being scrolled never changed.
   The cost tracks what the APP holds, not what the conversation holds: `small` (50
   turns) posted the slowest single page of the run at **1,001 ms**, because by then the
   app held 1.46 M nodes. So a change that bounds total rendered nodes should show up
   here as well as in PSS — and `scrollback.median.perSize.huge.pageMedianMs` is PRIMARY
   precisely so a fix that trades this away cannot pass.

Phase cost: ~3 minutes per repeat after the build; the full 3-repeat run above took 17
minutes end to end including every other phase.

### Two things already verified in the renderer (2026-08-28)

**There is no virtualization today, and the `in-view` class is not it.** `ChatView.tsx`
renders every timeline entry in full; the `IntersectionObserver` at :408 exists only to
toggle a `.in-view` class that gates a `backdrop-filter` on wallpaper themes. Off-screen
entries lose the blur and keep every node. That is why 12,100 messages become 1.46 M nodes.

**`observeEntry` never unobserves — and that alone would make eviction free nothing.**
`ref={observeEntry}` (:1025) calls `observe(el)` for every entry and there is no
`unobserve` anywhere in `src/renderer/` (verified: the only matches in the tree are three
test mocks). An `IntersectionObserver` holds a STRONG reference to each observed target,
so an entry removed from the DOM stays reachable from the live observer for as long as
that session's ChatView is mounted. Today nothing removes an entry, so it never fires.
The moment eviction (or virtualization) unmounts one, the node and its subtree are
retained and the memory win is zero — while every test still passes and the reducer looks
correct. **Fix this first, with a test, before building either change.** It is the same
hazard as §4 pointed the other way: a mechanism that is load-bearing only once you start
removing things.

## 4. The trap this programme keeps hitting — read before touching the reducer

Four features broke in cycle 2, all the same shape: they depended on whole-file replay as
a SIDE EFFECT, and **none of ~7,000 passing tests noticed any of them** (empty
conversations on some entry paths; a stale Files drawer; duplicated messages; session
totals counting nothing). Written up in `docs/PITFALLS.md` → "Removing a broadcast" and
`youcoded/docs/chat-reducer.md` → "Paged history".

Eviction is the same class of hazard pointed the other way: it DELETES state other
features may read without ever having said so. Before evicting anything, enumerate who
reads `toolCalls` / `toolGroups` / `assistantTurns` **by name**, and ask what each does
when an entry vanishes. Candidates already known to reach into them: the artifact
tool-use tracker, `session-totals` (totals must NOT be recomputed on evict — they are
cumulative), Deliverables auto-open, and the specialists ledger.

## 5. Rig state — what it will and will not tell you

Working and trustworthy for this cycle: `pssAfterMb`, `switchPaintedBySize.*`,
`resumeStableMs`, the stall phase, screenshots (three of five are byte-identical across
the cycle-2 change, which is a real parity signal).

Fixed on 2026-08-28 (workspace `e50de2d`), so cycle 3 inherits them:
- **Per-repeat progress** in the history and stall phases, with an explicit `TIMED OUT`.
  A failure used to present as 40 minutes of silence.
- **The gate compares `workload.median.cpuTotalSeconds`**, not `cpuDuringPct`. A rate rises
  when a phase gets faster; `compare.mjs` derives the total for older reports.
- **Screenshot diffs report a bounding box and name a whole-frame vertical shift.**
- **`scripts/perf-lab/bg-run.sh`** — detached launch done correctly, prints the `Monitor`
  filter that catches failure as well as progress. Use it; a full run is ~26 min.
- README → **"Reading a REJECT"**: a REJECT is a prompt to investigate, not a verdict.
  Cycle 2 shipped a 97% win whose gate rejected on four items, none of them the change.

Still owed by the rig (unchanged from cycle-1 handoff §7, none blocking cycle 3):
`scenario-idle.mjs` is written but has no importer; the two stall metrics are too noisy at
3 repeats to register anything; no coverage of terminal, marketplace, sync, theme
switching or buddy windows; perf-lab is not in CI; the workload streams whole turns, never
native per-token deltas (so cycle 1 can never be re-gated until a native-delta scenario
exists).

## 6. Other open perf work, in rough value order

- **Buddy-window chat still forces a layout reflow per streamed token** — the exact twin of
  cycle-1's N2, left in on purpose because the rig measures no buddy window. Cheap, known,
  and the fix is already written for the main ChatView. ROADMAP `#buddy`.
- **A re-docked session still pays a full replay.** `TRANSCRIPT_REPLAY` survives for one
  caller because it also re-sends broker-held permission asks and specialist run records,
  which live only in main's memory and have no JSONL record. Folding those into the page
  response would retire the last whole-file read. Noted at the call site in `App.tsx`.
- **Android on-device paging** + its Kotlin tail reader (deferred by Destin's decision 1a).
  The phone pages over the remote bridge today; on-device is unimplemented.
- **Spec §4 smaller readers**: `listPastSessions` concurrency cap + memoised old-encoding
  dir resolution (25 MB re-read per list open), tail reads for `model:read-last` /
  `loadHistory`, catalog single-flight, `artifact-tracker.ts` session cleanup.
- **Four knowledge files are over their word budget**, so `/audit`'s mechanical pass fails
  every run (ROADMAP `#docs`, filed 2026-08-28). Three were already over.
- **One stale anchor**: `.claude/rules/harness-tools.md` expects `permissionSubject: () =>
  undefined` in `send-user-file.ts`; the code no longer says that. Decide which is right.

## 7. Environment facts worth not rediscovering

- **9 Windows CI failures on master** (`task-tool.test.ts` ×7, `harness-tool-guards` ×1,
  `harness-session-loop` ×1) block every PR from green. Proved master-level on 2026-08-28
  by a DOCS-ONLY PR (#351) reproducing them exactly. Merge with `--admin` after confirming
  the count and that none of the failures are yours.
- The "rotating extras" (`native-session-host.test.ts`, `git-service.test.ts`) are
  timing-sensitive **on any platform**, not just Windows — #351 flaked one on ubuntu and it
  passed on re-run. Re-run before believing them.
- **The main checkout's `node_modules` is badly stale** — confirmed 2026-08-28: 468
  packages installed against 640 after a fresh `npm ci`, with `ulid`, `ai`, `@codemirror/*`
  and `pdfjs-dist` missing outright. A perf-lab build against it fails at `tsc` with ~40
  `Cannot find module` errors. This is also what the two LOCAL `xterm-webgl-mipmap-patch`
  failures were: `node_modules` predating PR #333's postinstall patch. `npm ci` clears
  both. `worktrees/perf-lab` was reinstalled on 2026-08-28; the main checkout was NOT.
- Work in a worktree; `cp -al` for `node_modules`, never a symlink.
