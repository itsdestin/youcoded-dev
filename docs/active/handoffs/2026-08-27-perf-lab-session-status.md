---
title: Perf lab — session status and handoff
status: active
date: 2026-08-27
plan: docs/active/plans/2026-08-23-perf-lab-and-optimization-loop.md
corrections: docs/active/investigations/2026-08-26-perf-lab-plan-corrections.md
manual: docs/active/handoffs/2026-08-26-perf-loop-operating-manual.md
---

# Perf lab — where this stands

**Read this before the plan.** The plan (2026-08-23) describes what we set out to
build. Its objective changed partway through on Destin's instruction, and several of
its specifics turned out to be wrong about this machine and this app. This document
is the current truth; the plan is history.

---

## 1. The objective — read all three, the third one governs

The goal has been restated twice by Destin. Each restatement widened it, and a session
that acts on an earlier one will build the wrong thing.

**v1 — the plan (2026-08-23).** Build a one-command headless performance rig, capture a
baseline, then run an autonomous measure → change → re-measure loop whose kept wins ship
as one `perf/optimization-pass` PR.

**v2 — mid-session (Destin, verbatim intent).** *"turn everything we find to work or be
useful this session into a repeatable stress test we can use to cycle and notice future
performance issues on different app surfaces."* The **suite** became the deliverable, not
a one-time optimization pass.

That reframe was prompted by Destin reporting real, daily symptoms the rig was missing:
frequent freezes, lagging animations, sluggishness, and moments where *"all animations
app-wide slow down, sometimes I can't click anything."* Those reports are primary
evidence and they redirected the whole exercise.

**v3 — 2026-08-27 (Destin, verbatim). THIS IS THE OPERATIVE GOAL:**

> *"the goal is to create the infrastructure to hillclimb/optimize all bug classes and
> improve code efficiency autonomously. this work all cross-pollinates a bit, this should
> help us improve our perf optimization rig. we will use these bugs to test the rig a bit
> later."*

### What v3 changes

v2 aimed at *detecting regressions*. v3 aims at **an autonomous improvement loop**, and
the difference is not scope — it is what counts as evidence.

1. **The deliverable is the loop, not the suite and not the fixes.** The suite is one
   component. A loop also needs a verdict function, guardrails, a ratchet, and — the part
   nobody has built — a way to know the loop can *see*.
2. **The 28 defects in `2026-08-27-perf-defect-classes.md` are no longer the product.
   They are the TEST CORPUS for the rig.** Destin: *"we will use these bugs to test the
   rig a bit later."* Each register entry is a labelled case with a known mechanism and a
   known location. That makes them the closest thing available to ground truth.
3. **"All bug classes" is wider than performance.** Hillclimbing needs a measurable
   objective function; perf metrics are the ones that exist today, but the same
   loop shape applies to any mechanically checkable property (dead code via `knip`, the
   ast-grep invariant scans, type errors). Do not silently narrow v3 back to perf.

### The consequence nobody has addressed yet

**An autonomous loop is only as good as its sensitivity, and the rig's sensitivity is
currently unknown.** `compare.mjs` keeps a change only when the improvement clears BOTH
5% and the baseline's own run-to-run spread. That means every metric has a **detectable
effect floor** equal to its spread — and no one has measured what those spreads are. If a
metric's spread is 30%, the loop is structurally blind to every real 20% win on it, and
will report "no change" forever while hillclimbing gets nowhere.

Worse, we already have one proven case of a metric that was *stable and wrong*: the
retracted 3.3 s blank window had 0.4% spread across six boots and was stable **because**
it was a hardcoded timeout (§5). Low spread proves repeatability, never validity.

So before the loop can be trusted to run unattended, two things must be measured that
never have been:

- **the spread of every PRIMARY metric**, which sets the smallest win each can prove;
- **whether the rig detects a defect we know is there** — which is exactly what the
  28-entry register is for.

A rig that cannot detect a hand-verified defect is broken, and it will say the app is
fine while it does so. That failure is silent by construction, which is why it has to be
tested deliberately rather than assumed.

---

## 2. What is built and committed

All 16 plan tasks are implemented. 30 workspace commits, 4 product commits on
`youcoded` branch `perf/optimization-pass` (worktree `worktrees/perf-lab/`).
**168 rig unit tests pass**; `bash scripts/verify.sh perf-lab` is green.

### Product code (`perf/optimization-pass`, NOT merged, NOT pushed)
Permanent, opt-in startup instrumentation. Zero behaviour change — every mark is a
no-op unless `YOUCODED_PERF_LOG` is set.
- `desktop/src/main/perf-marks.ts` — `perfMark(name)` appends JSONL when that env var names a file
- 20 marks through `main.ts`'s boot chain; 4 `performance.mark()` calls in the renderer
- Source-pinning tests so a renamed/dropped mark fails a test instead of silently blanking a report column

### The rig (`youcoded-dev/scripts/perf-lab/`, committed to master)
| module | what it does |
|---|---|
| `run.mjs` | orchestrator + report writer + `validateReport` |
| `build.mjs` | packaged production build with tree-fingerprint freshness |
| `fixture.mjs` | throwaway fixture HOME; self-provisions engine + model |
| `content.mjs` | **realistic** transcript content — code blocks, diffs, tool cards |
| `launch.mjs` | Xvfb + packaged app + CDP, with hardened kill-safety |
| `cdp.mjs` / `procs.mjs` | CDP client; `/proc` CPU + PSS sampling |
| `metrics-startup.mjs` | main + renderer marks → startup phase table |
| `probe-ipc.mjs` | **main-process stall detector** (app-wide freeze) |
| `scenario-history.mjs` | history reload by size |
| `scenario-workload.mjs` | 6 sessions, streaming, switching, responsiveness probe |
| `scenario-replay-stall.mjs` | **the app-wide freeze**, with renderer-vs-main attribution |
| `scenario-artifacts.mjs` | **artifacts / editor / HTML viewer** |
| `screenshots.mjs` | capture + dependency-free pixel diff |
| `compare.mjs` | spread-aware KEEP/REJECT verdict |

### Surface coverage — state this honestly, do not imply more
| surface | scenario | status |
|---|---|---|
| startup / boot chores | in `run.mjs` | covered |
| history reload by size | `scenario-history` | covered |
| chat under load (6 sessions, streaming, switching) | `scenario-workload` | covered |
| app-wide freeze on replay | `scenario-replay-stall` | covered — **run 2026-08-27, clean first contact** |
| artifacts / editor / HTML viewer | `scenario-artifacts` | covered — **run 2026-08-27, clean first contact** |
| terminal | — | **NOT covered** |
| marketplace | — | **NOT covered** |
| sync | — | **NOT covered** |
| themes / theme switching | — | **NOT covered** |
| buddy / multi-window | — | **NOT covered** |

---

## 3. The findings that matter

### 3.1 The app-wide freeze — reproduced, and the cause is the RENDERER

> **RETRACTION (2026-08-27, measured).** Everything in this section before today said the
> freeze was **main-process** blocking caused by `TranscriptWatcher.getHistory()`. That was
> **wrong**, and it was wrong because of a mislabelled column, not a bad measurement. See
> "How the mistake happened" below. The corrected finding is that the freeze is
> **~99% renderer**.

The freeze is real and reproduces every time. The attribution is the opposite of what was
claimed. Measured 2026-08-27 by `scenario-replay-stall.mjs` — the scenario built
specifically to answer this question — over **6 runs across two invocations**:

| size | rendered entries | total stall | main process | renderer | main's share |
|---|---|---|---|---|---|
| small | 100 | 0 ms | 0 ms | 0 ms | — |
| medium | 5,000 | 7,379 / 10,908 / 14,081 ms | 99 / 19 / 150 ms | 7,280 / 10,889 / 13,931 ms | **0.2–1.3%** |
| huge | 7,000 | 12,591 / 6,466 / 18,449 ms | 162 / 43 / 200 ms | 12,429 / 6,423 / 18,249 ms | **0.7–1.3%** |

Every individual run agrees. `blame` is `renderer` at both sizes in both invocations.
Reports: `perf-reports/2026-08-27-0941-4256ade-shakedown.json` and
`…-0944-4256ade-attribution-confirm.json`.

**The corrected mechanism.** The main process *does* read the whole transcript
synchronously — `TranscriptWatcher.getHistory()`
(`transcript-watcher.ts:451-488`) via `ipc-handlers.ts:2489` — and that read is real, and
it is measurable: it is the **43–200 ms** in the main-process column. It is simply not the
freeze. The freeze is what happens next: the renderer receives 5,000 entries and renders
**all of them at once**, synchronously, with markdown parsing and syntax highlighting per
message (§3.2). `rendererLongtaskMaxMs` sits at 6.2–6.9 s — a single unbroken block of
renderer main-thread work.

The physics is consistent: the two costs are sequential, not concurrent. Main reads the
file (fast), hands it over, and the renderer chokes on it for six to eighteen seconds.

**How the mistake happened — this is the generalisable part.** The old table's first
column was headed *"main-process IPC stall (max)"*. It was not that. It was `ipcMaxMs`,
the **raw end-to-end** unresponsiveness — which a blocked *renderer* produces just as
readily, because a blocked renderer cannot dispatch the ping or resolve its promise. The
tell was sitting in the table the whole time: **3,353 ms of "main-process stall" next to
3,257 ms of "worst renderer long task."** Two numbers that close together are one number
measured twice. I read a raw quantity as an attributed one and named the culprit from it.

Attribution requires the renderer long-task track to subtract; `attributeStalls` exists
precisely to do that, and until today it had never been run against the app. **The number
was right; the label was invented.**

**Known limitation, stated rather than hidden.** Attribution charges *overlapping*
main-and-renderer blocking entirely to the renderer, so a main-process block hiding under
a long task would be invisible. That does not rescue the original claim: the two costs
here are sequential by construction (the renderer cannot render data the main process has
not finished reading), and 43–200 ms is the size a `readFileSync` + parse of this fixture
should be.

**What this changes in the fix list.** C1 (async + chunked transcript replay) and M1 (its
native twin) target **~1%** of the freeze. They remain correct changes — synchronous whole-file
I/O on the main process is a genuine Class 1 defect, and it will matter more as transcripts
grow — but neither is the fix for this symptom, and shipping either alone would move
nothing a user could feel. **C2 (virtualize the timeline) is the fix**, with C3, N1 and N2
as the supporting cast. All four are renderer work.

### 3.2 Renderer cost is O(total messages), and unvirtualized
- `ChatView.tsx:764` maps the full timeline; no virtualization anywhere in the renderer.
- `MarkdownContent.tsx:296` runs four synchronous tree passes per message, including
  highlight.js with its full ~37-grammar set.
- `globals.css:801-806` records `content-visibility:auto` being **deliberately removed**
  because its implicit `contain:paint` clipped theme glows — leaving `contain: layout
  style`, which does **not** skip offscreen work. The app had the mechanism that makes
  long conversations cheap and traded it for a visual effect. **Restoring it is a real
  product tradeoff and is Destin's call, not a session's.**

### 3.3 Cost scales with open sessions
`ChatView.tsx:695-707` keeps a ChatView **mounted for every open session**
(`content-visibility: hidden`, deliberately not `display:none`, for resize perf).
Measured: PSS **450 MB idle → ~2,730 MB with six sessions**. Matches Destin's
"worse with more sessions" exactly.

### 3.4 Startup is fine — this kills three plan cards
| | |
|---|---|
| whenReady | ~655 ms |
| window created | ~685 ms |
| **blankWindowMs** | **~356 ms** |
| interactive (`sessionsListed`) | ~980 ms |
| **all 16 boot chores together** | **~29 ms** |
| idle PSS | ~450 MB |

Plan cards **E1** (window before chores), **E2** (parallelize chores) and **E3** (defer
chatsearch scan) all target this phase. E2 targets ~29 ms. E3's premise is already false
(the scan is already deferred past window creation). **Drop all three.**

### 3.5 Destin's symptom profile (his answers, load-bearing)
- All four surfaces: streaming, session switching, scrolling long conversations, opening panels
- Present **from launch** AND worse over hours AND worse with more concurrent sessions
- **Equally present on plain Midnight and on blur/glass themes**

Theme-independence is the diagnostic: if it were compositing/`backdrop-filter` it would
track theme weight. It does not. **This is main-thread JavaScript, not paint** — which
also means Xvfb's missing GPU matters far less than feared, and the rig *can* measure it.

### 3.6 Artifact / editor spikes — suspects only, UNMEASURED
Destin reports spikes when editing files, copying text, navigating HTML artifacts.
`scenario-artifacts` exists to measure this but **has not run**. Suspects:
- `HtmlView.tsx:40` `<iframe srcDoc={doc}>` — any change re-parses the whole document and re-runs its scripts
- CodeMirror re-tokenization on edit
- `MarkdownContent.tsx:186-187` `hastText(node)` — **see the correction in §5**

---

### 3.7 Rig facts a future session will need

- **The two new scenarios are not reachable from the CLI yet.** `run.mjs`'s
  `PHASES = ['startup','history','workload','shots']` — `scenario-replay-stall` and
  `scenario-artifacts` are written and unit-tested but not wired into the orchestrator,
  the report schema, or `compare.mjs`'s PRIMARY list. That is remaining item 1.
- **First run costs ~510 MB of download**, not 40 MB: the ~470 MB Qwen2.5-0.5B model
  plus the ~40 MB llama.cpp engine. Both are cached under `scratch/perf-lab/assets/`
  and both are now hardlinked into the fixture, so a rebuild costs no copy.

## 3b. What the RIG got wrong — the meta-finding, and the most important one

Five confidently wrong conclusions this session came from the **rig**, not the app.
Every one returned a clean, healthy-looking number rather than failing. That is the
failure mode that matters for objective v3: a tool meant to run unattended does not
announce that it is aimed at the wrong thing.

| # | what was measured | why the defect could not appear | how it presented |
|---|---|---|---|
| 1 | startup blank window | a fake `claude` binary ignored argv and never answered, so App.tsx's 3s safety timeout became the primary path | **3,330 ms, 0.4% spread across six boots** — stable *because* it was a hardcoded timeout |
| 2 | the app-wide freeze | a RAW end-to-end stall was labelled "main-process stall"; attribution was never run | named the wrong thread, and drove a fix list at ~1% of the problem |
| 3 | idle | sampled at **zero sessions** with a **CPU average**; the suspect is per-session and a 40 ms block is 0.27% of a 15 s window | "idle CPU fine" |
| 4 | session switching | six sessions created **fresh** (empty) | **118 ms** — same clock read 10,139 ms once they held real conversations |
| 5 | file-count costs | fixture had **3 transcripts in 1 dir**; the real machine has **804 across 10** | startup "fine"; the reconciler's own comment measures 2.8 s at 600 records |

**The generalisation, which is the durable lesson:** *stability is not validity, and
neither is coverage.* #1 was the most stable number in the report. #3 had coverage —
`idle.pssMb`/`idle.cpuPct` were in `PRIMARY` the whole time — pointed at the wrong
configuration with the wrong instrument.

### The class guard that replaced the three point fixes

Every scenario now exports `MEASURES`: its question, its configuration, **where each
clock starts and stops**, and **what it is blind to**. `run.mjs` renders it beside the
numbers under "What was actually measured". A scenario claiming no blind spots fails
its test, because that is precisely the claim that has been wrong five times.

### Two independent reviews (2026-08-27), both acted on

**Safety — a verified negative.** No path can signal the live app at `/opt/YouCoded`;
all 30 write sites land inside the sandbox. `launch.mjs` — which SIGKILLs process
families and deletes lock files — had **zero tests**; it now has 29, including the one
real gap found (it spared its own ancestors but not a *sibling* naming a rig path).

**The gate had three holes, all leaning toward ACCEPT** — a zero baseline could never
register a regression; a missing metric was silently "no regression"; a one-sample run
passed while the noise check was disarmed. All closed; the gate now fails closed.

**The stall probe's real blind spot, and its DIRECTION.** The IPC probe is a
`setInterval` running *inside* the renderer, so a blocked renderer stops it firing —
only a block beginning while a ping is outstanding is sampled (~1% of the time). So
`ipcTotalStallMs` is a **FLOOR, not a total**. Critically the bias **overstates the
main process**, because a blocked main process leaves the renderer free to keep
pinging. **This is why §3.1's retraction survives its own instrument:** main measured
0.2-1.3% *despite* a bias favouring main, so the renderer's true share is at least as
large as reported. It also means the freeze is **worse** than the 12 s reported.
Recorded as `MEASURES.biasDirection`, with a per-run warning and `probeCoveragePct`.

## 3c. The second sweep (2026-08-27, afternoon) — four more rig defects, and the first trusted run

Before re-running, the app branch was found **124 commits behind master** (it would have
measured five-day-old code, missing the other session's OOM fix #335). Rebased cleanly,
then the full run: `perf-reports/2026-08-27-1141-16ea12e-post-rebase-baseline` —
26 min, 20/20 metrics, zero app errors, load 1.1. **The first run to trust.**

| metric | value | run-to-run |
|---|---|---|
| startup → session list | **0.94 s** | 2% |
| open medium (5,000 entries), fully rendered | **14.8 s** | 4% |
| open huge (7,000) | **22.0 s** | 6% |
| switch into huge, six sessions open | **11.1 s** | 4% |
| freeze split, huge | renderer 16.5 s / main 0.27 s | 12% / 62% |
| six sessions, PSS | **7.0 GB** | 5% |
| files panel: open large markdown / keystroke | 1.1 s / 33 ms | 12% / — |

The 124 commits changed the switch cost not at all (10.1 s → 10.1 s).

Then the entry count that now travels beside every switch timing exposed **four more
rig defects**, each found by the previous fix's run and closed the same afternoon
(`139efb2`, `88aa50c`, `ee0a08e`, `a718a56`, `39374a7`):

| # | defect | how it presented | fix |
|---|---|---|---|
| 6 | `cc-1` ('medium') created in project **beta** while its transcript lives under **alpha** (`t.cwd ?? cwd`, and the fixture record had no `cwd`) — it resumed NOTHING | "medium, 319 entries, 1.4 s" beside a 5,000-entry medium taking 14.8 s in the history scenario | fixture records `cwd`; scenario refuses a record without one |
| 7 | the streamer picked "any transcript that appeared after boot" — the only such file was the **empty control's** | control under continuous load, posting the 20 s cap; loaded sessions received no stream; `streamedFiles` 1–2 against a description saying 3 | `streamTargetsFor()` streams into medium + small **by name**; run records `streamedInto` |
| 8 | repeats shared one boot and the streamer appended to the fixture files; truncating them back did not hold because **the app keeps its own copy of every transcript under `~/YouCoded/Personal/Conversations` and re-extends the original from it** | every number grew run over run on an unchanged app (huge 10.9 → 13.9 → 14.6 s); panes holding 2× the transcript | **one fresh boot + fresh fixture per repeat**, like stall/artifacts; byte-size check at repeat start; `over` count when a pane holds more than its label |
| 9 | the 3-frame stability settle could never settle a streaming session | 0 of 6 such switches settled | for streaming sessions the clock stops at the first frame showing everything that had arrived by the click |

Also swapped `workload.median.switchPaintedP95Ms` out of PRIMARY for
`workload.median.switchPaintedBySize.huge.medianMs` — the pooled p95 was the maximum of
~18 samples, a third of them the control; the huge bucket is Destin's case and moved
4–12% run to run.

**Proof it holds** — `2026-08-27-2207-16ea12e-per-boot`: no size warning; huge
11.4 / 11.2 / 12.6 s; **every label verified by count** (huge 7,000/7,000; small
1,134/1,134; control 0/0).

**Two app findings from the clean runs, not yet in the defect register:**
- **Switching into an EMPTY conversation takes ~1.7 s while two other sessions stream**
  (1.70 / 1.72 / 2.60 s across three fresh boots; native sessions the same). A fixed
  switch tax under background load, independent of conversation size — plausibly the
  "lag when I switch around" Destin reports. Nothing to render, still 1.7 s.
- **Switching into a 5,000-entry conversation that is being streamed into** ran out the
  20 s cap in 2 of 3 repeats (~1,800 entries rendered) and took 10.4 s in the third.
  Bimodal; reported as a floor, never averaged.
- The app's transcript mirror (`~/YouCoded/Personal/Conversations/claude/transcripts/…`)
  is **bigger than the original** it mirrors (small: 7.4 MB vs 4.7 MB) and writes back
  into `~/.claude/projects`. Unverified whether that is by design (takeover) or a bug
  class of its own; worth a look by whoever owns `conversations/`.

**Decorative metrics, measured:** `replayStall.medium.mainProcessStallMaxMs` moves
173% run to run, `replayStall.huge.ipcTotalStallMs` 78%, `ipcMaxMs` 60–70%. With 3
repeats they can neither register a win nor a regression. They stay in PRIMARY as the
"did the fix just move work to the other thread" guard, but they do not guard. The
honest replacement is main-process CPU time from `/proc` over the replay window.

## 4. What remains

1. ~~Wire stall + artifacts into run.mjs~~ — done (`05ee447`).
2. ~~Add stall metrics to PRIMARY~~ — done; see §3c for which of them turned out decorative.
3. ~~Shakedown run~~ → **done and superseded**: the trusted baseline is
   `2026-08-27-1141-16ea12e-post-rebase-baseline`; the workload phase's trusted shape is
   `2026-08-27-2207-16ea12e-per-boot`.
3b. **The eyeball calibration — NOT DONE, blocks acting on any number.** `node
   scripts/perf-lab/eyeball.mjs` boots the rig's exact build with the rig's fixture on
   Destin's real screen (shifted ports, throwaway HOME, never `/opt/YouCoded`) and prints
   what to count. Rig says ~22 s to open huge, ~11 s to switch into it. If Destin's
   count is in that neighbourhood the rig is calibrated; if it is wildly off, the
   headless/no-GPU configuration is rig defect #10 and nothing below should be built on
   these numbers.
3c. **Replace the decorative stall metrics** (§3c) with main-process CPU seconds from `/proc`.
4. **`--stress` tier** to restore the 50,000-message regime (needs `WATCH_TIMEOUT_MS` raised), so the default suite stays fast enough to cycle on.
5. **Per-surface baseline** with realistic content.
6. **Round-0 gate** — bring Destin a ranked card list. **No product code changes before he approves it.** Proposed replacement list:
   | # | change | targets |
   |---|---|---|
   | 1 | async + chunked transcript replay | the ~3.3 s app-wide freeze |
   | 2 | virtualize the timeline | multi-second renderer freeze; O(visible) not O(total) |
   | 3 | markdown + highlighting off the sync render path | per-message cost |
   | 4 | restore containment without clipping theme glows | offscreen work never skipped — **product tradeoff, Destin decides** |
   | 5 | unmount hidden sessions' ChatViews | "worse with more sessions" |
7. **Extend coverage** to the uncovered surfaces in §2.
8. **Thresholds.** A stress suite still needs a human to say "3.3 s is unacceptable, 200 ms is fine." Propose from the baseline; do not invent.

**Zero optimizations have shipped. No PR has been opened. Nothing is pushed.**

A note on the harness, not the rig: twice this afternoon a `run_in_background` Bash task
running the rig was killed ~15–25 s after launch with no user action (feedback drafted).
Launching detached — `setsid nohup … &` — and watching the log with `Monitor` worked
every time; plain background Bash watchers were killed the same way.

---

## 5. Corrections and retractions — read before quoting any number

Two claims made during this session were **wrong** and were retracted. Both are recorded
in full in the corrections investigation. A future session must not re-derive them from
stale prose elsewhere.

**(a) The "3.3 second blank window at startup" was a rig artefact, not an app property.**
The fixture's fake `claude` ignored argv and idled forever, so `detectAuth()`'s
`claude auth status` never returned and `App.tsx`'s 3-second *safety* timeout became the
primary path on every boot. Fixed; measured blank window fell **~3330 ms → ~356 ms**.

The transferable lesson, which cost a day: **stability is not validity.** That number had
a **0.4 % spread across six boots** — the strongest-looking evidence in the dataset — and
it was stable precisely *because* it was a hardcoded timeout. What cracked it was noticing
only **61 ms of long tasks** spanned a 3-second gap: the renderer was idle, waiting on us.
A gap that stays ~3.0 s even when everything before it gets 3× faster is a timer, not work.

**(b) `hastText` does NOT re-walk on every re-render.** An earlier claim of mine said every
code block in a conversation re-walks its AST on every re-render. `MarkdownContent` is
`React.memo`'d on a plain `content: string` prop (`MarkdownContent.tsx:265`), so unrelated
re-renders skip it. What is true: on **resume** every message mounts fresh (all N walks at
once, feeding the freeze), and while **streaming** a growing bubble's content changes per
token, so a bubble holding a large code block re-walks repeatedly.

**Discarded reports.** Everything measured before the fake-`claude` fix is in
`scratch/perf-lab/discarded/` — it measured the rig, not the app. Nothing may be baselined
against it. The one surviving complete report,
`perf-reports/2026-08-27-0702-4256ade-repeat-a.json`, carries a `_provenance` block: it is
**plain-prose content**, taken before the realistic-content switch and the `huge`
recalibration, and is therefore **not comparable to any report produced after commit
`9060b0d`**. It is a floor, not a baseline.

---

## 6. Operating rules learned the hard way

- **Do no other work while a run is in flight.** A subagent dispatched mid-run pushed load to 4.47 and the noise gate correctly aborted a 20-minute run (`exit 2`). The gate samples only *before* each boot, so mid-boot load is invisible to it — it is a backstop, not a guarantee.
- **Inhibit suspend for long runs**: `systemd-inhibit --what=idle:sleep --mode=block --who="perf-lab" --why="…" node scripts/perf-lab/run.mjs …`. No root needed; releases on exit.
- **`node --test <dir>/` FAILS on Node 26.** Use `node --test scripts/perf-lab/tests/*.test.mjs`.
- **Xvfb needs no sudo** — vendored at `scratch/perf-lab/assets/xvfb-prefix/usr/bin/Xvfb`; `resolveXvfbBin()` prefers `$XVFB_BIN` → PATH → vendored.
- **Look at the artifact, not just the report.** The rig twice reported success while measuring nothing (a blank screenshot passing the parity gate; a settings-open check that was `true` unconditionally). Both were found by opening the PNG.
- **The main checkout's `node_modules` is stale** — `npm ci` before typechecking or building `youcoded/desktop` directly.

---

## 7. Machine state at handoff

- Worktree `worktrees/perf-lab` on `perf/optimization-pass`, **rebased onto `origin/master` 2026-08-27** (40feb750), 4 commits ahead, **not pushed**. Built binary at `desktop/release/linux-unpacked/` matches `16ea12e`.
- Workspace `master` has ~38 commits, **not pushed**.
- The eyeball fixture, if launched, lives at `scratch/perf-lab/eyeball/`; the rig's at `scratch/perf-lab/home/`. Both throwaway.
- A session-long `systemd-inhibit` (`who=claude-perf-session`) may still be holding the machine awake — kill it when done: `pkill -f 'who=claude-perf-session'`.
- Xvfb may still be running on `:99`. Harmless; `startXvfb` reuses it.
