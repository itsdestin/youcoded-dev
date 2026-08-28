# perf-lab

**What this is for:** a repeatable stress suite that catches performance regressions
**per app surface** — you run one command, it drives the real packaged app through a
fixed set of journeys, and it writes numbers you can put next to last week's numbers.
It started life as a one-off optimization rig; it is now the permanent measurement
that stops each freeze, stall or memory jump we have already found from quietly coming
back.

Every finding becomes a scenario, so the next regression on that surface is *caught by
running a command* instead of being re-investigated from scratch. What is not a
scenario is not measured — see the coverage table, and read it as the honest list it
is.

> **Terms, once.** *Main process* — the single background process that owns the app's
> files, IPC and windows; there is exactly one, shared by every open session.
> *Renderer* — the process that draws a window (the web page). *IPC* — the messages the
> window sends the main process to get anything done. *Long task* — a stretch of ≥50 ms
> where a thread was too busy to respond. *PSS* — a memory figure that counts shared
> memory fairly, so six windows don't each get billed for the same megabyte.

---

## Surface coverage — the honest list

Taken from `docs/active/handoffs/2026-08-27-perf-lab-session-status.md` §2. **A surface
that is not `covered` is *unreviewed*, never *fine*.** This rig has twice reported a
clean pass while measuring nothing at all (a blank screenshot that compared equal to
the next run's blank screenshot; a settings-open check that returned `true`
unconditionally — corrections doc §15). Both were found by opening the artifact, not by
reading the report. Do not let this table drift optimistic.

| surface | scenario | status |
|---|---|---|
| startup / boot chores | in `run.mjs` | **covered** |
| history reload by size | `scenario-history.mjs` | **covered** |
| chat under load (6 sessions, streaming, switching) | `scenario-workload.mjs` | **covered** |
| app-wide freeze on replay | `scenario-replay-stall.mjs` | **built, never run against the real app** |
| artifacts / editor / HTML viewer | `scenario-artifacts.mjs` | **built, never run against the real app** |
| terminal | — | **NOT covered** |
| marketplace | — | **NOT covered** |
| sync | — | **NOT covered** |
| themes / theme switching | — | **NOT covered** |
| buddy / multi-window | — | **NOT covered** |

**The two "built, never run" rows are not yet reachable from the CLI.** `run.mjs`'s
phase list is `PHASES = ['startup', 'history', 'workload', 'shots']` (`run.mjs:54`) —
neither new scenario is wired into the orchestrator, the report schema or
`compare.mjs`'s `PRIMARY` list yet. Today they exist as modules with unit tests
(`tests/scenario-replay-stall.test.mjs`, `tests/scenario-artifacts.test.mjs`) and are
called by hand. Wiring them in is item 1 of the remaining work in the status doc.

---

## Running it

```bash
node scripts/perf-lab/run.mjs [--checkout <dir>] [--runs 5] [--history-repeats 5] \
  [--workload-repeats 3] [--only startup,history,workload,shots] [--force-build] \
  [--label <text>] [--out perf-reports/] [--max-minutes 45] [--dry-run]
```

It builds the **packaged** app, boots it repeatedly against a throwaway fixture HOME
under a virtual X display, and writes **one JSON report** (plus a Markdown summary)
that `compare.mjs` can later use to judge a code change as KEEP or REJECT.

The point is not "get a number". It is to get a number you can *defend* — measured on
a quiet machine, repeated enough times to know its own noise band, taken against a
build that is byte-identical to what ships, with every boot's error log counted.

### Launch it with `bg-run.sh`, not by hand

```bash
bash scripts/perf-lab/bg-run.sh --label cycle3-eviction        # a full run
bash scripts/perf-lab/bg-run.sh --only history --history-repeats 1 --label probe
```

A full run is ~26 minutes, which is longer than an agent turn, and there are three
ways to lose one that have all actually happened:

- a `run_in_background` Bash task running the rig is **killed ~15–25 s after launch**
  with no user action — `setsid nohup` survives, a plain `&` does not;
- the log redirect and `--out` resolve against the **shell's cwd**, so a session whose
  cwd had drifted into a worktree launched a run that died instantly with its log
  written where nobody looked;
- a watcher that greps only for *progress* lines is **silent through a hang**, and
  silence is indistinguishable from "still running".

`bg-run.sh` handles all three: it cds to the workspace root, launches detached, and
prints the exact `Monitor` filter to watch it with — one that matches `TIMED OUT`,
`aborted` and `EXIT` as well as progress.

Start with `--dry-run`. It resolves everything — checkout, build freshness, boot
counts, output paths, the deadline, and exactly which `compare.mjs` metrics the
selected phases are on the hook for — and exits 0 having launched nothing.

Output lands in `perf-reports/<YYYY-MM-DD>-<HHMM>-<sha7>[-label].{json,md}`, with
screenshots under `perf-reports/shots/<same-stem>/` (gitignored — the reports
themselves are tracked) and each boot's `desktop.log` copied to
`scratch/perf-lab/logs/<stem>-<boot>.log`.

| Exit | Meaning |
|---|---|
| 0 | clean report |
| 2 | error (build failed, machine never went idle, a scenario threw) |
| 3 | `--max-minutes` budget exceeded — app family killed first |
| 4 | report is missing numbers a requested phase owed (see below) |
| 130 | interrupted |

Exit **4** is the one worth understanding. A report full of `—` is worse than no
report, because someone will rank experiments from it. So the run validates its own
output against `compare.mjs`'s `PRIMARY` list and refuses to exit 0 if any metric a
requested phase was responsible for came back missing — or came back with a median
but **no per-run samples** behind it, which would make `spreadPct()` report 0% noise
and let pure jitter through the gate as a proven win. The report is still written
(the numbers cost real minutes) but it is stamped `incomplete` in both the JSON and
the Markdown.

### The first run of a new scenario is a shakedown, not a baseline

When a scenario runs against the real app for the first time — which is true *today*
for `scenario-replay-stall` and `scenario-artifacts` — expect it to fail on selectors,
waits and timing, not to produce numbers. Both are written to fail loudly with the real
cause rather than return a plausible zero, which is the behaviour you want on a
shakedown. Fix what breaks, run it again, and only then record the result as a
baseline. Ranking anything from a first run is how the rig ends up measuring itself
(see *Reference numbers* → the retracted 3.3-second startup).

---

## The two probes, and why there are two

The rig watches **two different threads**, because "the app froze" and "this window
stuttered" are different bugs with different fixes.

| probe | file | what it can see |
|---|---|---|
| renderer long-task probe | `scenario-workload.mjs` (`installProbe`) | the **window** freezing — the drawing thread too busy to paint or respond |
| IPC stall probe | `probe-ipc.mjs` | the **main process** freezing — which stalls IPC for *every* session at once |

The second one is the important addition, and it is what "the whole app is frozen"
actually is. There is one main process and it is single-threaded; every open session's
IPC goes through it. While it is blocked, nothing anywhere in the app can proceed —
not the conversation you are looking at, not the other five.

`probe-ipc.mjs` measures that by pinging `window.claude.getPlatform()` every 100 ms and
timing the round trip. That handler is literally `() => process.platform`
(`ipc-handlers.ts:1387-1389`) — zero work — so every millisecond it reports is
queueing and thread availability, never the cost of the handler itself. Its thresholds
are chosen against what a person perceives: >100 ms a click feels laggy, >250 ms the UI
feels stuck, >1000 ms the app looks frozen.

### The attribution rule, plainly

A slow ping on its own does not say *which* thread was at fault, because a blocked
renderer also delays the ping (it can't send the call or handle the reply). So read the
two probes together:

- **ping stalled + a renderer long task at the same moment ⇒ the renderer was blocked.**
- **ping stalled + the renderer idle ⇒ the main process was blocked** — the app-wide
  freeze, and the one a plain long-task number misses entirely.

`scenario-replay-stall.mjs` does this apportionment by *overlap* rather than picking a
winner (`attributeStalls`, `mergeIntervals`, `overlapMs`): the part of a stall covered
by a long task is charged to the renderer, the remainder to the main process, so
`mainProcessStallMs + rendererStallMs === ipcTotalStallMs` exactly — no unattributed
remainder to wonder about. `summarizeBlame()` reduces that to one word:
`main-process`, `renderer`, `mixed` or `none`.

Two honesty rules are built in, both worth knowing before you quote a blame verdict:

- **If the long-task observer failed to attach, attribution is `null`/`unknown`, never
  "100 % main process."** Reporting no-overlap as a main-process stall would be a
  fabricated indictment of the exact thing the scenario exists to accuse.
- **Renderer blocking under 50 ms is invisible** to the browser's long-task observer,
  so it gets charged to the main process. Only stalls beyond the 100 ms ping interval
  are attributed at all, so the bias is small by construction — but it *is* why a
  handful of milliseconds of `mainProcessStallMs` is noise and seconds of it is a bug.

---

## The scenarios

### startup (in `run.mjs`) — boot
Cold-boots the packaged app `--runs` times and reads the instrumented marks.
**Look first at `sessionsListed`** — the moment the session list is on screen and the
app is usable. `blankWindowMs` (how long a user stares at a created-but-empty window)
is the second one.

### `scenario-history.mjs` — how long a conversation takes to come back
Resumes each of the three fixture transcripts and splits the cost so you know which
side to fix: `ipcLast10Ms` / `ipcAllMs` are main-process cost (read the `.jsonl`, parse
it, ship it over IPC); `resumeFirstMessageMs` / `resumeStableMs` are renderer cost
(first bubble on screen / timeline stopped growing).
**Look first at `history.medium.median.resumeStableMs`** — medium is ordinary usage.
A run that never stabilised reports `resumeStableMs: null` — **never 0** — with a
warning the Markdown surfaces.

### `scenario-workload.mjs` — chat under real load
Six mixed sessions (4 Claude Code, 2 native), three transcripts being appended to
continuously, 40 session switches, with the renderer probe running throughout.
**Look first at `switchP95Ms`** — the tail latency a user actually notices.
`probe.longtaskTotalMs` (total main-thread blocking), `cpuDuringPct` and `pssAfterMb`
(the cost of holding all that open) come next.

### `scenario-replay-stall.mjs` — the app-wide freeze *(never run against the real app)*
The same measurement as history, asked the other way round. History asks "how long
until the conversation is on screen?" — a cost the user asked for. This asks **"how
long was the rest of the app unusable while that happened?"** — a cost the user did
not ask for, and the one behind the complaint. It arms **both** probes, resumes a
transcript at each size, waits for the timeline to stop growing, and splits the stall.
**Look first at `mainProcessStallMaxMs` for the `medium` size** — the longest single
stretch during which nothing in the app could respond, on an ordinary conversation.
Then `blame`, which names the culprit in one word.

Defaults: 3 repeats per size (not history's 5, because a `huge` resume costs roughly
two minutes a sample), a 100 ms ping interval, and a 240 s ceiling on one resume watch.
Its Node-side 500 ms poll is itself an instrument: while the renderer is blocked a CDP
`evaluate` does not return until the block ends, so a poll that takes 24 s to answer
has just measured a 24-second renderer freeze.

### `scenario-artifacts.mjs` — files, editor and HTML viewer *(never run against the real app)*
Opens files in the session drawer, **types real key events** into a code editor, swaps
an HTML preview back and forth, and copies a code block out of the transcript — with
both probes running over every step. Every surface here was previously unmeasured: no
earlier scenario ever opened the artifact drawer, mounted a CodeMirror editor or
rendered an iframe preview, so the reported spikes when editing files and navigating
HTML artifacts were literally uncatchable.

**Look first at `ipcSumOfSteps.maxMs`** — the worst IPC round trip across every step,
i.e. "did any part of this journey freeze the whole app". Then check which step's
`stall.verdict` is `main`.

Each file exists in a small and a large version so cost-versus-size is *measured*
rather than asserted; `sizeScaling` holds the large/small ratios, and each ratio
answers one suspect:

| ratio | suspect it tests | reading |
|---|---|---|
| `markdownOpenRatio` vs `markdownFenceRatio` | markdown parse + syntax highlighting per code block | if open cost tracks fence count, the cost really is per-code-block |
| `htmlSwapRatio`, with `htmlNav.inPage` as the control | `<iframe srcDoc>` re-parsing the whole document on every swap | swaps slow while in-page navigation is fast ⇒ the re-parse is the cost |
| `keystrokeRatio` | CodeMirror re-tokenising the file on each edit | a ratio near 1 **exonerates** this suspect at these file sizes |

The fixture files are generated from a seeded PRNG (`rng32`) so they are byte-identical
between a baseline and a candidate run — otherwise "the large file got slower" could
just mean "the large file got different".

---

## Reference numbers — what we already measured

Compare a new run against these at a glance. **All figures below are from
`docs/active/handoffs/2026-08-27-perf-lab-session-status.md` §3.** Read the caveat
under each table before quoting one.

### The app-wide freeze on replay (status doc §3.1)

| conversation | main-process IPC stall (max) | worst single renderer long task |
|---|---|---|
| 100 messages | 5 ms | 117 ms |
| **5,000 messages** | **3,353 ms** | 3,257 ms |
| 50,000 messages | 3,190 ms | **24,329 ms** |

A 5,000-message conversation is **ordinary usage** and it stalls the whole app ~3.3 s.

*Caveats.* These came from a one-off diagnostic on 2026-08-26, before
`scenario-replay-stall.mjs` existed — the scenario is that diagnostic hardened to the
rig's standards, and **it has not yet produced numbers of its own**. The 50,000-message
row is also no longer reproducible by default: `huge` was recalibrated to 3,500 turns
(see *The fixture* below), so today's `huge` is 7,000 messages.

**Mechanism, for the record:** `TranscriptWatcher.getHistory()`
(`youcoded/desktop/src/main/transcript-watcher.ts:451-488`) does a synchronous
`fs.readFileSync` of the entire transcript plus a full parse of every line, called from
an IPC handler (`ipc-handlers.ts:2489`). The main process is single-threaded and serves
IPC for every session, so while it runs, nothing anywhere in the app can respond.

### Startup (status doc §3.4)

| | |
|---|---|
| `whenReady` | ~655 ms |
| window created | ~685 ms |
| **`blankWindowMs`** | **~356 ms** |
| interactive (`sessionsListed`) | ~980 ms |
| **all 16 boot chores together** | **~29 ms** |
| idle PSS | ~450 MB |

*Caveat, and it is the important one:* an earlier report claimed `blankWindowMs`
≈ 3,330 ms with a **0.4 % spread across six boots**, the strongest-looking evidence in
the whole dataset. It was the rig measuring itself — the fixture's fake `claude`
ignored argv and never returned from `claude auth status`, so `App.tsx`'s 3-second
*safety* timeout became the primary path on every boot. Fixed; the measured blank window
fell to ~356 ms. **Stability is not validity.** What cracked it was noticing only 61 ms
of long tasks spanning a 3-second gap: the renderer was idle, waiting on us. A gap that
stays ~3.0 s even when everything before it gets 3× faster is a timer, not work. Full
account: corrections doc §17.

### Memory versus open sessions (status doc §3.3)

| | PSS |
|---|---|
| idle | **~450 MB** |
| six sessions open | **~2,730 MB** |

`ChatView.tsx:695-707` keeps a ChatView **mounted for every open session**
(`content-visibility: hidden`, deliberately not `display: none`, for resize
performance). This matches the "worse with more sessions" report exactly.

### Which old reports you may compare against

**Almost none.** Everything measured before the fake-`claude` fix lives in
`scratch/perf-lab/discarded/` — it measured the rig, not the app, and nothing may be
baselined against it. The one surviving complete report,
`perf-reports/2026-08-27-0702-4256ade-repeat-a.json`, carries a `_provenance` block
saying it is **plain-prose content**, taken before the realistic-content switch and the
`huge` recalibration, and is therefore **not comparable to any report produced after
commit `9060b0d`**. It is a floor, not a baseline.

---

## The fixture, and what it contains

Every boot runs against a throwaway HOME that is wiped and rebuilt from scratch
(`fixture.mjs`; a full rebuild measured 545 ms, most of which is copying the model).

**Transcripts are realistic by default.** `content.mjs` generates transcript bodies that
look like a real coding session — fenced, syntax-highlighted code blocks, Edit-tool
diffs, tool cards and log dumps — in the exact JSONL shapes the app's two consumers
accept. The old prose filler is still available as `{ content: 'plain' }` but is not the
default, because prose is the *cheapest* thing this app can render and numbers taken
against it are a floor rather than a measurement. The turn mix is fixed and documented
in `content.mjs`'s `MIX`: 30 % prose, 24 % code, 24 % tool, 14 % diff, 8 % long output.

One subtlety the generator deliberately works around: tool-result bodies are collapsed
and unmounted by default (`ToolCard.tsx:1083`), so a giant payload hidden in a
`tool_result` costs almost nothing on resume. Every expensive payload here is therefore
*also* placed in the assistant's visible text, where it is unconditionally parsed and
highlighted — otherwise the fixture would look rich and measure cheap.

**Sizes** (`fixture.mjs:186`, `SIZES = { small: 50, medium: 2500, huge: 3500 }` turns,
2 history-visible messages per turn):

| size | turns | history messages | file |
|---|---|---|---|
| small | 50 | 100 | ≈ 0.26 MiB |
| medium | 2,500 | 5,000 | ≈ 24 MiB |
| huge | 3,500 | 7,000 | ≈ 33 MiB |

**`huge` was recalibrated from 25,000 turns to 3,500** when the content became
realistic. The measured reason is in `fixture.mjs:150-186`: at 25,000 turns the file is
224 MiB and a resume takes ~1,166 s, far past the 240 s watch ceiling, so every sample
would have been a timeout. 3,500 turns lands at the same ~33 MiB and the same ~119 s
resume the old prose `huge` had, keeping 2× headroom under the ceiling — while still
mounting 10,258 timeline entries of real code and diff content.

**The tradeoff, stated plainly:** the suite no longer probes the 50,000-message regime.
Getting it back means raising `WATCH_TIMEOUT_MS` in `scenario-history.mjs`, or building
that one size with `{ content: 'plain' }` — both deliberate choices, not defaults.

---

## Reading a REJECT

The gate is deliberately conservative and a REJECT is a **prompt to investigate, not a
verdict on the change**. Cycle 2 shipped a 97% win whose first gate run rejected on
four items, none of which was the change being bad. Run each one down before arguing
with it — and equally, before accepting it:

| the gate says | check |
|---|---|
| a **rate** regressed (`…Pct`) | compare the matching total. A change that makes a phase finish faster raises every rate in it. `cpuTotalSeconds` is gated for exactly this reason; `cpuDuringPct` is context only. |
| a metric "was ZERO, now N" | look at the baseline's own per-run spread — `0, 0, 70` is not a zero baseline. Then decide whether N is a cost you *chose* (it may be the price of a correctness fix, and worth saying so out loud). |
| a screen DIFFs | the differ now prints the bounding box and names a whole-frame vertical shift. A shift means a layout change **above** the content — often another PR's, so check `git log <baseline-sha>..HEAD` before assuming it is yours. |
| a screen DIFFs by a lot | look at the PNG. A 14% diff on `native-chat` in cycle 2 was a genuine duplicate-message bug that no test caught. |

`screen native-chat` photographs a real local model's reply, so it has a permanent
non-deterministic floor of a few tenths of a percent. Anything meaningfully above that
is real.

## Hard rules

**Never dev mode.** `main.ts` chooses `loadFile` vs the Vite dev URL on
`app.isPackaged`, and dev mode loads hundreds of unbundled modules. Its startup
numbers are fiction. The rig always builds and runs the packaged binary
(`electron-builder --linux dir`), which is why a cold run costs 1–3 minutes of build.

**Never the live app.** Destin runs the real YouCoded app as his daily working
environment. Nothing here may signal it. Process discovery is a `/proc/<pid>/cmdline`
**substring** match against rig-owned absolute paths — never a process *name*, because
`pkill youcoded` would kill his app. On top of that, `launch.mjs` refuses vague
needles, skips any process whose cmdline mentions the real `~/.config/youcoded`,
`~/.youcoded` or `~/.claude`, and excludes this process and every ancestor of it. See
`.claude/rules/live-app-safety.md`.

**Writes are confined** to `perf-reports/`, `scratch/perf-lab/`, and the fixture HOME.
The fixture HOME is wiped and rebuilt before every boot.

**Do no other work while a run is in flight.** A subagent dispatched mid-run once pushed
load average to 4.47 and the noise gate correctly aborted a 20-minute run (`exit 2`).
The gate samples only *before* each boot, so mid-boot load is invisible to it — it is a
backstop, not a guarantee.

---

## Environment and ports

Every boot runs with `HOME` pointed at the fixture, so everything the app touches
under `~` lands in a throwaway directory.

| Thing | Value | Why |
|---|---|---|
| Fixture HOME | `scratch/perf-lab/home` | wiped + rebuilt per boot; holds `.claude/`, `.youcoded/`, `.config/youcoded/`, the local model and the fake `claude` binary |
| `XDG_CONFIG_HOME` etc. | **deleted** from the child env | on Linux Electron's userData is `(XDG_CONFIG_HOME \|\| $HOME/.config)/youcoded`; an inherited value would send the run into the **real** profile |
| `YOUCODED_PROFILE` | **unset** | a profile skips the install-hooks chore (`main.ts:1339`) and renames the remote config file — we must measure the boot users actually get |
| `YOUCODED_PORT_OFFSET` | `100` | shifts every port in `shared/ports.ts` clear of the live app |
| Remote server | **10000** | `REMOTE_SERVER_DEFAULT_PORT = 9900 + offset` |
| Local engine (llama-server) | **10020** | `ENGINE_PORT = 9920 + offset` |
| App CDP | **9555** | `--remote-debugging-port`; the rig refuses to attach if something it does not own is already there |
| Pixel-diff Chrome | **9556**, else OS-assigned | each diff gets its own port *and* its own throwaway profile — see troubleshooting |
| Xvfb display | `:99` at **1600x1000x24** | reused between runs if already up |
| `YOUCODED_NATIVE` | `1` | enables the native harness so the workload journey can create native sessions |
| Engine context size | **16384** | written into the fixture's `config.json`; llama.cpp clamps `-c` down to the model's trained context, and the app's agent system prompt alone is 4,244 tokens |

---

## What each metric means

**Startup** — every number is milliseconds since the rig *spawned the process*, which
is the only clock comparable across runs. Main-process marks come from the perf log;
renderer marks and paint entries come over CDP and are converted onto the same clock.

| Metric | Meaning |
|---|---|
| `whenReady` | Electron's `app.whenReady()` fired |
| `chores.*` | one boot chore each, measured as `mark[n] − mark[n−1]` — so the ORDER of the chore list is load-bearing |
| `createWindow` / `createWindowAt` | how long `createWindow()` took / when it started |
| `blankWindowMs` | **the blank box.** Window is created visible, so this is `firstContentfulPaint − createWindowAt` — the time a user stares at nothing. A settled screenshot cannot see a regression here, which is why it is a primary metric |
| `didFinishLoad` | the renderer finished loading the document |
| `documentStart` | `performance.timeOrigin` — the page began loading |
| `modulesEvaluated` | the renderer bundle finished evaluating. `modulesEvaluated − documentStart` is the **bundle-evaluation cost** (React, react-dom, CSS, the whole component graph) |
| `rootRender` / `appMounted` | React root render called / `App` mounted |
| `firstPaint` / `firstContentfulPaint` | browser paint timings |
| `sessionsListed` | the session list is on screen — the app is usable |
| `postWindowDone` | post-window work finished. **Network-bound**: the release check lives in here |

> **Both `*-start` marks fire at module *end*, and are named accordingly.** ESM hoists
> every `import` above the module body and TypeScript's CommonJS output emits all 46
> `require()` calls above the first statement, so a mark written "at the top" actually
> lands after everything has evaluated. They were renamed to `yc:modules-evaluated` and
> `main:imports-done` — what they really measure. The lost window was recovered for free
> via `performance.timeOrigin` as `documentStart`. Corrections doc §7.

**Idle** — after a 10 s settle, CPU is sampled over 15 s across the whole process
family and PSS is read from `/proc/<pid>/smaps_rollup`.

**History** — see the scenario section above. Measured at the three transcript sizes in
the fixture table.

**Workload** — see the scenario section above.

**IPC stall (`probe-ipc.mjs`)** — `medianMs` / `p95Ms` / `maxMs` round trips,
`over100ms` / `over250ms` / `over1000ms` counts, `totalStallMs` (round-trip time beyond
the ping interval — the interval itself is not a stall), and the five `worst` stalls
with timestamps so they can be lined up against renderer long tasks. `missedTicks`
counts pings skipped because one was still outstanding; if it exceeds `pings`, the
stall totals are a **floor**, not the full cost, and the scenario says so in a warning.

**Errors** — the count of `"level":"ERROR"` lines in that boot's `desktop.log`. A boot
that logged errors is not a clean measurement. `compare.mjs` refuses a KEEP verdict if
the candidate logged more errors than the baseline, and a findings doc must not rank a
phase from an erroring boot.

**`network`** — a list of report paths whose value moves with the internet rather than
with the code (`chores.announcements`, and `postWindowDone` because the release check
is inside it). Mark these `network`; do not rank them.

---

## What actually runs

**Cold-start loop**, `--runs` times: noise gate → fresh fixture → launch → wait for
the `yc:sessions-listed` mark → collect startup marks → 10 s settle → 15 s CPU sample
→ PSS → count errors + archive the log → kill.

**Scenario boot**, once: fresh fixture → launch → `welcome` shot → history scenario →
resume `medium` and shoot `chat-medium` → open/close Settings, shoot `settings-open` →
workload ×`--workload-repeats` → one extra workload pass with `keepSessions` for the
`six-sessions` and `native-chat` shots (its numbers are deliberately **excluded** from
the median, because taking screenshots perturbs the timings it would contribute) →
count errors + archive the log → kill.

The **noise gate** refuses to take official numbers unless `loadAvg1() < 4` and the
machine is under 10% busy over 3 s. It waits 30 s and retries up to 5×, counting every
discard into the report so a reader can see the run happened on a noisy machine.

Every boot is inside `try/finally` and the teardown always runs — including on Ctrl-C
and on the `--max-minutes` watchdog. `launchApp().kill()` deliberately **throws** if a
process survived SIGKILL (a survivor would hold the CDP port and the profile lock, and
the next boot would silently measure the wrong app); the orchestrator always prints
that failure, and re-throws it only when the body of the boot had not already failed.

---

## Tests

```bash
node --test scripts/perf-lab/tests/*.test.mjs
```

**Use the glob.** `node --test scripts/perf-lab/tests/` fails on Node 26 — it tries to
`require()` the directory and reports a bare `'test failed'`. And never run a bare
`node --test` from the workspace root: it recurses into the sub-repos' `node_modules`
and hangs.

`tests/run-report.test.mjs` is the one to keep green above all others. It builds a
report through the orchestrator's real section builders and asserts that every
`compare.mjs` `PRIMARY` path resolves and has samples behind it. If someone renames a
field, `compare.mjs` will not crash — it will just silently stop judging that metric.
That test is the only thing standing between you and a keep/reject gate that is
quietly blind.

---

## Troubleshooting

**"Xvfb is not installed."** The rig needs a virtual X display. Either
`sudo pacman -S --needed xorg-server-xvfb`, or use the vendored copy the rig
provisions for itself under `scratch/perf-lab/assets/xvfb-prefix/` (**no root needed** —
the same distro package extracted into a user prefix, and every shared library it wants
was already present); `resolveXvfbBin()` prefers `$XVFB_BIN`, then `Xvfb` on `PATH`,
then the vendored one, so a proper system install silently takes over if one ever lands.
`xdpyinfo` must also be present (`sudo pacman -S --needed xorg-xdpyinfo`) — without it
the rig cannot tell whether the display came up, and a missing Xvfb would surface 90
seconds later as an unexplained CDP timeout instead of a clear message.

**The engine and model provision themselves.** The plan assumed a pre-downloaded
llama.cpp engine and a GGUF in a HuggingFace cache. Neither existed. `fixture.mjs`
downloads both into `scratch/perf-lab/assets/` on first use — the engine version, its
URL and its sha256 are read straight out of the app's own `engine-pin.ts`, and the
archive is verified against the same hash the app checks. Bump the pin and the rig
follows with no edit here. **First run costs roughly 510 MB of download** (~40 MB engine
+ a ~470 MB model). Afterwards the *engine* is a hardlink copy (`cp -al`, near-instant)
but the **model is a real 470 MB file copy into every fixture rebuild** — that copy is
most of the fixture's 545 ms build time.

**Why not a tiny toy model.** The plan specified `stories260K.gguf` (1.1 MB). It cost
nothing because it never worked: its GGUF metadata caps context at 2,048 tokens,
llama.cpp clamps `-c` down to that, and the app's agent system prompt alone is 4,244
tokens — so every native send returned `context size (2048 tokens), try increasing it
(provider error 400)` straight into the chat pane. It is also a story-completion model
with no chat template. Replaced with Qwen2.5-0.5B-Instruct Q4_K_M (~470 MB, 32,768-token
context, real chat template). Corrections doc §12.

**`youcoded/desktop/node_modules` in the MAIN checkout is stale.** It was missing
`zod`, `ulid`, `diff`, `@codemirror/*` and more, so `npx tsc --noEmit` reported 135
errors on master. The perf worktree was fixed with its own `npm ci`. Anything that
typechecks or builds `youcoded/desktop` directly needs one too. Never symlink or
junction `node_modules` between worktrees — `npm ci` follows the link and empties the
shared copy (see `docs/PITFALLS.md`).

**Selector traps.** Three guesses in the original plan did not exist in the app, and
each would have silently produced a *plausible* wrong number rather than an error:

- There is **no `data-message-id`** anywhere in the renderer. Timeline entries are
  `.chat-scroll .timeline-entry`, and the count must exclude entries inside
  `[aria-hidden="true"]` — the app keeps a `ChatView` mounted for *every* open session,
  so an unfiltered count sums all of them. This lives once, in
  `scenario-history.mjs`'s exported `MESSAGE_COUNT_EXPR`; import it rather than
  re-typing it.
- `data-session-idx` is on the session pill **and** on the overflow dropdown's rows,
  and that dropdown lists *all* sessions. Scope any query to the strip. Overflow is
  **width**-driven, not count-driven, so "6 sessions" does not imply overflow.
- `window.claude.native.listModels` does not exist. Model listing is
  `providers.catalog()` / `engine.models()` / `models.installed()`. `modelId` is the
  GGUF basename without `.gguf`.

**`window.claude.session.switch(id)` does nothing on desktop.** It is a parity stub
that returns `{ ok: true }` and switches nothing (`ipc-handlers.ts:820-824` — "Switch
is a client-side concern on desktop"). Timing it reports a ~0 ms switch that never
happened, and screenshotting after it saves the *previous* conversation under the new
name. Drive `window.__perfLab.switchTo(...)` from `scenario-workload.mjs` instead — it
clicks the real pill (or the overflow menu) and reports `ok` only when the visible pane
actually moved.

**A screenshot is missing from the report.** Screenshot failures never abort the
numeric phases; they are recorded in `screens.failures` and turn into exit 4. A screen
that was not captured is **unreviewed**, not "unchanged" — never report it as fine.
`[title="Settings"]` (`HeaderBar.tsx:449`) sits in a ternary branch, so a layout that
renders the other branch has no such button. `capture()` also now refuses to save a
frame before first-contentful-paint plus non-trivial visible text, because a blank
screenshot compares equal to the *next* run's blank screenshot and the gate passes
forever (corrections doc §15).

**An optional leg failed and took the whole scenario with it.** It shouldn't any more.
The workload journey's native first-token timing is non-fatal: its timings go `null` and
`nativeFailure` quotes what the pane actually showed. A local-model problem is a fixture
issue, not a reason to lose four PRIMARY responsiveness measurements. Corrections doc §14.

**A run hangs.** `cdp.mjs` rejects every in-flight request when its target dies, so this
should fail loudly instead. If it still hangs, `--max-minutes` kills the family and
exits 3. Historically the cause was two pixel-diffs sharing one headless-Chrome profile:
the second silently *attached* to the first browser and hung forever when it was killed.
Each diff now gets its own port and its own throwaway profile.

**Two runs at once.** Don't. They would fight over CDP port 9555, the fixture HOME and
the Xvfb display.

---

## Keeping the machine awake

This machine sleeps on idle (KDE PowerDevil), and a full run is 20+ minutes of
mostly waiting. A suspend mid-run does **not** fail loudly — it stretches whatever
interval straddles it, and the noise gate only samples *before* each boot, so
nothing downstream would catch it. Wrap any real run:

```bash
systemd-inhibit --what=idle:sleep --mode=block --who="perf-lab" \
  --why="performance measurement run in progress" \
  node scripts/perf-lab/run.mjs --runs 5 --label exp-1
```

No root needed. The inhibitor is released when the command exits, so nothing is
left holding the machine awake. Confirm with `systemd-inhibit --list`.

---

## Known limits — read before ranking anything

**Look at the artifact, not just the report.** The rig has twice reported success while
measuring nothing, and neither case was findable from the report — both took opening the
PNG. If a number looks clean, check that the thing it names actually happened.

**Xvfb has no GPU.** Everything renders through software rasterisation. Any measurement
that depends on paint, blur, compositing or GPU-accelerated effects can **rank
backwards** here: an experiment that removes a `backdrop-filter` may look like a win on
this rig and be invisible (or a loss) on real hardware, and vice versa. Treat those
results as a hypothesis and confirm them with a human looking at a real window. (The
symptoms this suite chases are theme-independent — equally present on plain Midnight and
on blur/glass themes — which is the evidence that they are main-thread JavaScript rather
than paint, and the reason the missing GPU matters less here than it first appeared.)

**The pixel gate is coarse by design.** `pct` rounds to 2 dp, so under ~0.0128% of the
frame (≈205 px at 1600×1000) reports `0.00` and passes. The raw `differing` count rides
along in the result so a "0%" pass stays auditable.

**Warm cache by construction.** History repeats 2..N read a file the OS page cache is
already holding, so those are warm-cache costs.

**Medians, not means, throughout** — and `compare.mjs` judges every claimed win against
the baseline's own run-to-run spread, so a single fast run can neither prove nor veto
anything. That is why `--runs` and the sample arrays behind every median matter, and why
a report that lost its samples is rejected rather than published.

**A stress suite still needs a human to set thresholds.** Nothing here says whether
3.3 s is unacceptable and 200 ms is fine. Propose thresholds from a measured baseline;
do not invent them.

---

## Further reading

| Doc | What it holds |
|---|---|
| `docs/active/handoffs/2026-08-27-perf-lab-session-status.md` | **current truth** — coverage, findings, what remains, retractions |
| `docs/active/investigations/2026-08-26-perf-lab-plan-corrections.md` | the 18 verified corrections, each with its mechanism |
| `docs/active/handoffs/2026-08-26-perf-loop-operating-manual.md` | operating the measure → change → re-measure loop |
| `docs/active/plans/2026-08-23-perf-lab-and-optimization-loop.md` | the original plan — **history, not truth**; several of its specifics were wrong about this machine and this app |
