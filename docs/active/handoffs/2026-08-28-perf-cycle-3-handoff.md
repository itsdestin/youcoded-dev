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

Current master: `youcoded` at `8935c28f` or later. Baseline report for any A/B:
`perf-reports/2026-08-28-0325-984b11a-cycle2-paged.json` (EXIT 0, all phases, three
consecutive runs agreeing).

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

### Measured, 2026-08-28 — `perf-reports/2026-08-28-0733-8935c28-probe-scrollback.json`

One repeat (a probe, not a baseline — the report is stamped INCOMPLETE for exactly that
reason, and a keep/reject decision needs 2+). Same six sessions, each of the three
resumed conversations scrolled to its beginning; every leg reached the top.

| | floor (nothing scrolled) | ceiling (all three read to the top, post-GC) |
|---|---|---|
| PSS | 1,492.5 MB | **4,443.2 MB** (+2,950.7) |
| peak BEFORE the forced GC | — | 5,950.1 MB |
| JS heap, live | 20 MB | 534.4 MB |
| JS heap, committed | 22 MB | 1,111.9 MB |
| DOM nodes | 23,461 | **1,464,735** (62x) |
| event listeners | 945 | 31,427 |

**Destin's reading was right and the plan's was wrong.** Paging moved where a
conversation starts; the ceiling is untouched. 12,100 messages read back cost ~2.95 GB
retained, and the pre-paging figure (7.0 GB) was measured with streaming and 40 switches
on top, so this is the same regime rather than a smaller one.

Three findings that should shape the plan:

1. **Nothing is released, and now there is a number for it.** Switching away from every
   scrolled conversation and forcing a GC gave back **42.1 MB of 2,950.7 — 1.4%**. That
   is the control: no existing mechanism bounds this, so any cycle-3 change is starting
   from zero rather than improving something partial.
2. **The rise is mostly RENDERED, not stored.** Live JS objects account for 514 MB and
   V8's committed heap for 1,090 MB; the remaining **~1,861 MB (63%) is DOM, layout and
   paint** — 1.44 M nodes, ~119 per message. Eviction frees both halves (dropping a
   timeline entry unmounts its DOM too); parking a hidden view frees only the DOM half,
   and only for the five sessions you are not looking at. **A third option the two-way
   framing missed: virtualizing the message list** — render only what is on screen —
   attacks the 63% directly without dropping any data, and is the only one of the three
   that also helps the conversation currently in front of you.
3. **Scrolling back gets slower the more the APP holds, not the conversation.** Page-turn
   medians ran huge 429 ms (116 pages, scrolled first), medium 887 ms (83 pages), small
   **987 ms for its single page** — a 50-turn conversation, slowest of the three, because
   by then the app held 1.46 M nodes. Cost is global, so a change that bounds total
   rendered nodes should show up here as well as in PSS.

Phase cost: ~3 minutes per repeat after the build, so 3 repeats is ~10 minutes.

**The rig now measures this.** `scripts/perf-lab/scenario-scrollback.mjs` (phase
`scrollback`, own boot, runs last) opens the same six sessions the workload phase opens,
scrolls each resumed conversation to its beginning, and reports the ceiling post-GC split
three ways — `deltaJsHeapMb` (what eviction frees), `deltaNonJsMb` (what parking frees) and
`deltaDomNodes`. `releasedMb` records what switching away plus a forced GC gives back:
~0 today, and the metric a cycle-3 change has to move. Three of its paths are PRIMARY, so
the gate now judges the ceiling and not only the floor. **Run it before planning either
change** — README → "scenario-scrollback.mjs".

## 3. The two candidate changes (they are NOT the same thing)

They free different memory. **Parking frees rendered DOM for sessions you are not looking
at; it does NOT free reducer state** — `timeline`, `toolCalls`, `toolGroups` and
`assistantTurns` all live in the chat store and survive an unmount. **Only eviction (b)
frees those**, and it also drops the DOM as a consequence. So (b) is the direct answer to
scroll-back accumulation and (a) is complementary, not a substitute.

### (a) Park hidden views — cycle-1 handoff §6
`ChatView.tsx` keeps every open session's view mounted (`content-visibility: hidden`,
deliberately NOT `display:none`). Unmount a hidden session's view and rebuild on switch;
after paging a view starts at only ~30 turns, so the rebuild is cheap — but a view the
user has scrolled back through is arbitrarily large, and rebuilding THAT is not cheap
unless (b) has already bounded it.
- KEEP metric: `workload.median.pssAfterMb`.
- Guards: `workload.median.switchPaintedBySize.*` must not rise; **scroll position must
  survive a switch** (needs a pinning test — the rig cannot see it).
- Note the interaction with cycle 2: an unmounted view loses `history.cursor` unless it is
  in the reducer, which it IS (`SessionChatState.history`) — so a rebuilt view still knows
  where it was in the transcript. Verify, don't assume.

### (b) Evict off-screen turns — archived spec §2 "Eviction"
Bounds a SINGLE long-lived session rather than many open ones. Design as specced (reviewed
2026-08-28, but never implemented):
- Every user-prompt timeline entry already carries the byte offset of its transcript line —
  **`transcript-page.ts` stamps `data.offset` on user-message events today, unused**. That
  is the seed a new cursor is minted from. The live tailer does NOT stamp it yet.
- ChatView tracks `lastVisibleAt` per turn with one IntersectionObserver; a 60 s interval
  dispatches `HISTORY_EVICT { sessionId, beforeOffset }` when loaded turns >
  `2 × PAGE_TURNS` AND the oldest loaded run has been out of view > `EVICT_AFTER_MS`
  (5 min) AND that run has no tool in `activeTurnToolIds`, no open permission ask, and is
  not `currentTurnId`. Never drop below `PAGE_TURNS` loaded turns.
- The reducer removes those timeline entries and their `toolCalls` / `toolGroups` /
  `assistantTurns` entries, then sets the cursor to the boundary. Scrolling up re-fetches.
- **This is the one sanctioned deletion from `toolCalls`.** `.claude/rules/chat-reducer.md`
  says that Map is never cleared and `scripts/ast-grep/rules/toolcalls-never-cleared.yml`
  enforces it — both must be amended, not bypassed.
- Its value is the whole of the scroll-back ceiling in §2, plus however far a session grows
  from live streaming. Both paths only ADD; nothing subtracts today.

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
