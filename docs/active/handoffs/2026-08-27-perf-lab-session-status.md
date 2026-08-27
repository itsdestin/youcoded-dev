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

## 1. The objective, original and revised

**Original (the plan):** build a one-command headless performance rig, capture a
baseline, then run an autonomous measure → change → re-measure loop whose kept wins
ship as one `perf/optimization-pass` PR.

**Revised (Destin, mid-session, verbatim intent):** *"turn everything we find to work
or be useful this session into a repeatable stress test we can use to cycle and notice
future performance issues on different app surfaces."*

That reframe is the operative goal. The **suite is the deliverable**, not a one-time
optimization pass. Every finding becomes a permanent scenario so the next regression on
any surface is caught by running one command instead of being re-investigated.

The reframe was prompted by Destin reporting real, daily symptoms the rig was missing:
frequent freezes, lagging animations, sluggishness, and moments where *"all animations
app-wide slow down, sometimes I can't click anything."* Those reports are primary
evidence and they redirected the whole exercise.

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
| app-wide freeze on replay | `scenario-replay-stall` | **built, never run against the real app** |
| artifacts / editor / HTML viewer | `scenario-artifacts` | **built, never run against the real app** |
| terminal | — | **NOT covered** |
| marketplace | — | **NOT covered** |
| sync | — | **NOT covered** |
| themes / theme switching | — | **NOT covered** |
| buddy / multi-window | — | **NOT covered** |

---

## 3. The findings that matter

### 3.1 The app-wide freeze — measured, mechanism identified
This is Destin's reported symptom, reproduced.

| conversation | main-process IPC stall (max) | worst single renderer long task |
|---|---|---|
| 100 messages | 5 ms | 117 ms |
| **5,000 messages** | **3,353 ms** | 3,257 ms |
| 50,000 messages | 3,190 ms | **24,329 ms** |

A 5,000-message conversation is **ordinary usage** and it stalls the whole app ~3.3 s.

**Mechanism:** `TranscriptWatcher.getHistory()`
(`youcoded/desktop/src/main/transcript-watcher.ts:451-488`) does a synchronous
`fs.readFileSync` of the entire transcript plus a full parse of every line, called from
an IPC handler (`ipc-handlers.ts:2489`). The main process is single-threaded and serves
IPC for **every** session, so while it runs nothing anywhere in the app can respond.

The probe measures this with `window.claude.getPlatform()`, whose handler is
`() => process.platform` (`ipc-handlers.ts:1387`) — zero work, so every millisecond is
thread availability.

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

## 4. What remains

1. **Wire `scenario-replay-stall` and `scenario-artifacts` into `run.mjs`** — report schema, `--only` phases, `.md` summary rows.
2. **Add stall metrics to `compare.mjs` PRIMARY.** Nominated with reasoning by the scenario author: `replayStall.medium.median.mainProcessStallMaxMs`, `…mainProcessStallMs`, and `replayStall.huge.median.rendererLongtaskMaxMs` — the last specifically so a "fix" that moves work off the main process but merely relocates it into the renderer cannot read as a clean win.
3. **Shakedown run.** Both new scenarios have never touched the real app. Expect selector/wait failures. They are written to fail loudly with the real cause rather than return a plausible zero — treat the first run as a shakedown, **not** a baseline.
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

- Worktree `worktrees/perf-lab` on `perf/optimization-pass`, 4 commits ahead of `origin/master`, **not pushed**.
- Workspace `master` has 30 commits, **not pushed**.
- A session-long `systemd-inhibit` (`who=claude-perf-session`) may still be holding the machine awake — kill it when done: `pkill -f 'who=claude-perf-session'`.
- Xvfb may still be running on `:99`. Harmless; `startXvfb` reuses it.
