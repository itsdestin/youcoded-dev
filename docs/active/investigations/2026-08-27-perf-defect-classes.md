---
status: active
date: 2026-08-27
tags: [performance, perf-lab, main-process, renderer, stress-testing]
---

# Performance defect classes, and the register of instances (2026-08-27)

Companion to `docs/active/handoffs/2026-08-27-perf-lab-session-status.md`. That document
records what the perf lab *measures*; this one records what there is *to* measure — the
mechanism taxonomy the stress suite is being built against, and every instance found so
far with its verification state.

**Why a taxonomy at all.** Each class has a different symptom, a different fix, and — the
load-bearing part — **a different metric**. A rig that measures the wrong metric for a
class reports a clean bill of health on a broken app. Two of the classes below were
invisible to every scenario the lab had on 2026-08-26.

**Confidence discipline.** Every instance is marked `verified` (call chain traced in this
repo, command shown) or `suspected` (shape matches, chain not traced). Nothing here is
measured against a running app unless it says so — a mechanism is a hypothesis until the
rig reproduces it.

---

## The classes

### Class 1 — Main-process blocking

**Mechanism.** Electron's main process is single-threaded and serves IPC for *every*
session and *every* window. Any synchronous work there — `readFileSync`, `JSON.parse` of
a large file, a long loop — stops the entire application for its duration.

**What the user feels.** Everything freezes at once. Animations stop app-wide, clicks do
nothing, every window is affected simultaneously. Destin's report: *"it also feels like
things freeze up fully sometimes like there's a bottleneck of some sort."*

**Why ordinary testing misses it.** Unit tests call these functions directly and measure
them in isolation, where a few milliseconds looks fine. The defect is not the function's
cost; it is *where it runs*. Nothing in a unit test says "and meanwhile nothing else in
the app could respond."

**The metric.** IPC round-trip stall. The lab pings `window.claude.getPlatform()`, whose
handler is literally `() => process.platform` (`ipc-handlers.ts:1387-1389`) — zero work,
so every millisecond measured is thread availability, never handler cost.

**Guard against the wrong fix.** Moving work off the main process fixes every
main-process metric while the app freezes exactly as much as before, if the work lands in
the renderer. `compare.mjs` PRIMARY therefore carries
`replayStall.huge.median.rendererLongtaskMaxMs` specifically so that trade registers as a
regression.

#### Class 1's most dangerous sub-shape: **async in name only**

A function declared `async` whose body contains no `await` on the hot path. It blocks
exactly as hard as a synchronous function, but **it defeats code review**: a reviewer
reads `await store.list('claude')` and reasonably assumes the main process yields there.
It does not.

Three separate instances found so far, in unrelated subsystems:

- `refreshTurns()` (`chatsearch-index/index-store.ts:129`) — `async`, **zero** `await` in
  lines 129-210, `fs.lstatSync` per conversation plus sync chunk reads.
- `conversation-store.ts:327 list()` — `async`, but the record loop is `readdirSync` +
  `readFileSync` + parse per file with no yield. The only `await` is `heal()`, reached
  only for rare conflict-copy filenames.
- `listPastSessions()` (`session-browser.ts:372`) — genuinely async for transcript reads,
  but calls the blocking `store.list()` twice (`claude` and `native`) at line 542.

**This is a mechanically checkable shape**, and per the workspace knowledge ladder that
makes it a candidate ast-grep rule rather than a paragraph: *an `async` function in
`src/main/**` that contains a `*Sync(` call and no `await` before it*. That would catch
the next one at commit time instead of six months later.

### Class 2 — Renderer blocking

**Mechanism.** The renderer's main thread runs React, layout, paint and event handling.
Long synchronous work there freezes *that window* — but not the rest of the app.

**What the user feels.** Scrolling stutters, typing lags behind the cursor, one window is
sluggish while others stay responsive.

**The metric.** `PerformanceObserver({entryTypes:['longtask']})` — total, count and max.
Known bias, stated rather than hidden: the observer only reports tasks of 50ms or more.

**Distinguishing 1 from 2 is the whole game.** They feel similar to a user and have
opposite fixes. `scenario-replay-stall.mjs` attributes by overlap: a stalled ping covered
by a renderer long task is charged to the renderer, the remainder to the main process, and
the two sum exactly to the total. When the long-task observer fails to attach, attribution
is reported as **null — never as "100% main process"**, which would be a fabricated
indictment. `validateReport` refuses a report whose attribution is null.

### Class 3 — Cost that scales with a quantity that only grows

**Mechanism.** An operation whose cost is proportional to total messages, total open
sessions, total conversations, or total installed items. Correct, fast, and invisible on a
fresh install.

**What the user feels.** *"Gets at least slightly worse over time and with more sessions
working simultaneously."* — Destin, verbatim.

**Why ordinary testing misses it.** Test fixtures are small. A function that is O(n) over
conversations runs on three conversations in a test and 400 on a real machine.

**The metric.** Not an absolute number — **a ratio**. Run the same scenario at two or three
seed sizes and compare. A ratio near 1 means the cost is fixed; a ratio tracking the size
ratio means it is linear in the wrong thing. `scenario-artifacts.mjs` already reports
`sizeScaling` for exactly this reason; nothing else does yet.

### Class 4 — Idle cost

**Mechanism.** Work performed on a timer with no user action at all: polls, animation
tickers, watchers, broadcasts.

**What the user feels.** Periodic hitching while doing nothing. Fans, battery drain. The
app is "heavy" even when untouched.

**Why ordinary testing misses it — and how the perf lab measured idle and still could not
see this.** The lab *does* sample idle, in the cold-start loop: `SETTLE_MS = 10s` to let
boot work drain, then `CPU_SAMPLE_MS = 15s` of CPU and a PSS reading
(`run.mjs:789-800`). It reports `idle.pssMb` and `idle.cpuPct`, both in `PRIMARY`. That
measurement is blind to S1 for two independent reasons, and both are worth stating
because they generalise:

1. **It samples the cheapest possible configuration.** Idle is measured on a fresh boot
   with **zero sessions open**. S1's cost is `5 + 3N` reads; at N = 0 the entire
   per-session term — the part that scales, the part matching Destin's report — is
   exactly zero. The rig measures the one configuration in which the suspect is
   guaranteed innocent.
2. **CPU percent is the wrong instrument for a blocking cost.** A 40 ms main-thread block
   every 10 s is 0.27% of a 15-second window. It rounds to nothing as a percentage while
   being plainly visible as a hitch. Blocking is a *latency* defect; averaging it into a
   *throughput* number destroys exactly the signal that matters.

So the gap is not "we never measured idle" — it is **"we measured idle with no load and
with a metric that cannot see blocking."** Stability is not validity; neither is
coverage. This is the largest gap found this session.

**The metric.** Open N sessions, perform no action for a fixed window, and sample
main-process stall and CPU throughout. Repeat at two values of N: the difference is the
per-session idle tax.

### Class 5 — Cache invalidation storms

**Mechanism.** An expensive computation is correctly cached, then the cache is dropped on
a common event — so the cache protects the idle case and does nothing for the case that
actually hurts.

**What the user feels.** A screen that gets slower the more you interact with it, then
feels fine again after a pause.

**The metric.** Repeat the same mutating action N times in a row and time each one. A flat
line means the cache holds; a sawtooth means every action pays the full rebuild.

### Class 6 — Deliberate tradeoffs

**Not bugs.** Places where performance was knowingly traded for something else. They belong
in the register because a future session that "fixes" one without knowing it was a choice
will re-break the thing it was protecting.

**These are never a session's call to reverse.** They go to Destin with a before/after.

---

## The register

Verification state as of 2026-08-27. `verified` means the chain was traced in this repo
with the command recorded; it does **not** mean measured against a running app.

### Already measured against a running app

| # | instance | class | state |
|---|---|---|---|
| R1 | `TranscriptWatcher.getHistory()` — sync `readFileSync` + full parse of an entire transcript, from an IPC handler (`transcript-watcher.ts:451-488`, called at `ipc-handlers.ts:2489`) | 1 | **measured 2026-08-27: 43-200 ms.** Real, but **~1% of the freeze** — see the retraction below |
| R2 | No timeline virtualization — `ChatView.tsx:764` maps the full timeline | 2, 3 | **measured: THE freeze.** 6.2-6.9 s single renderer long task at 5,000 entries; ~99% of total stall |
| R3 | A ChatView stays mounted for every open session (`ChatView.tsx:695-707`) | 3 | **measured**: PSS 450 MB idle → 2,730 MB at six sessions |
| R4 | `MarkdownContent.tsx:296` — four synchronous tree passes per message incl. the full highlight.js grammar set | 2, 3 | contributing cause of R2 |
| R5 | `content-visibility:auto` removed from `globals.css:801-806` because `contain:paint` clipped theme glows | 6 | **Destin's call.** Restoring it is speed vs. how the themes look |

### Found by code sweep, not yet measured

| # | instance | class | confidence |
|---|---|---|---|
| S1 | `buildStatusData()` on a 10-second `setInterval` (`ipc-handlers.ts:2062`) | 1, 3, 4 | verified |
| S2 | `refreshTurns()` — `async` in name only, sync loop over ALL conversations (`chatsearch-index/index-store.ts:129`) | 1, 3 | verified |
| S3 | `scanSkills()` — fully synchronous directory walk, cache dropped at 10 sites (`skill-scanner.ts:21`, `skill-provider.ts`) | 1, 5 | verified |
| S4 | `listThemes()` re-reads and re-parses every local theme manifest per listing (`theme-marketplace-provider.ts:116-131`) | 1, 5 | verified |
| S5 | Buddy glide — `setInterval(…, 16)` calling `setPosition()` on up to 3 OS windows from the main process (`buddy-window-manager.ts:227-243`) | 1, 4 | verified shape; impact unmeasured |
| S6 | Cross-window cursor broadcast at ~30 Hz to every window during a session-pill drag (`main.ts:1184-1191`) | 1, 3 | verified — but **downgraded**, see below |

### RETRACTION (2026-08-27, measured): the freeze is the renderer, not the main process

Until today this register — and everything else written this session — said R1 was the
app-wide freeze. **It is not.** `scenario-replay-stall.mjs`, run against the app for the
first time on 2026-08-27, attributes the stall over 6 runs at two sizes:

| size | total stall (3 runs) | main process | renderer | main's share |
|---|---|---|---|---|
| medium (5,000 entries) | 7,379 / 10,908 / 14,081 ms | 99 / 19 / 150 ms | 7,280 / 10,889 / 13,931 ms | **0.2-1.3%** |
| huge (7,000 entries) | 12,591 / 6,466 / 18,449 ms | 162 / 43 / 200 ms | 12,429 / 6,423 / 18,249 ms | **0.7-1.3%** |

Every run agrees. R1's synchronous read is real and measurable — it is the 43-200 ms — but
the freeze is **R2**: the renderer receiving 5,000 entries and rendering all of them at
once, with N1's unmemoized full-timeline scan and N4's markdown passes on top.

**The consequences for this register:**

- **R1 and M1 drop from "the fix" to "correct but ~1%."** Both remain genuine Class 1
  defects worth fixing — synchronous whole-file I/O on the main process will matter more as
  transcripts grow — but neither moves the symptom. My earlier claim that M1 "changes the
  plan" was itself overstated: it is the twin of a defect that turns out to be minor.
- **R2, N1, N2, N3 are the fix**, and they are all renderer work.
- **Class 1's instances are not thereby exonerated.** S1, S2, S3, S4, G1 and M4 are
  main-process blocking on *different* paths and are still untested. What was disproved is
  R1's role in *this* symptom, not the class.

**How the mistake happened, because it generalises.** The pre-attribution table's first
column was headed "main-process IPC stall" while holding `ipcMaxMs` — the RAW end-to-end
stall, which a blocked renderer produces just as readily, since a blocked renderer cannot
dispatch the ping or resolve its promise. The tell was in the table the whole time: 3,353 ms
of "main-process stall" beside 3,257 ms of "worst renderer long task." Two numbers that
close are one number measured twice. **The measurement was right; the label was invented,
and the culprit was named from the label.**

This is the second time this session a confident finding came from reading a number as
something it was not (the first was the retracted 3.3 s blank window). Both were caught the
same way — by building the instrument that could actually answer the question, instead of
inferring the answer from an instrument that could not.

### Second-pass sweep — main process (2026-08-27)

| # | instance | class | confidence |
|---|---|---|---|
| M1 | **`NativeSessionHost.getHistory()` is a twin of R1** — and multiplies by specialist child count (`harness/native-session-host.ts:3474`) | 1, 3 | **verified by hand** |
| M2 | The 10-second status payload is ALSO `JSON.stringify`'d and pushed to every connected remote browser client (`remote-server.ts:359`, `:2217`) | 1, 3, 4 | verified |
| M3 | Attention summary broadcast to every window on a ~1s classifier cadence, 100 ms debounce (`main.ts:426-455`, `:1832-1845`) | 1, 3, 4 | verified |
| M4 | **Conversation reconciler walks every `.jsonl` under `~/.claude/projects` at startup AND every 30 minutes, forever** (`conversations/reconciler.ts:97-142`, `service.ts:229`) | 3, 4 | **verified by hand** |
| M5 | `specialistSpawnCounts` map has no delete path (`harness/native-session-host.ts:329`) | — | verified; impact trivial |
| M6 | `~/.claude/backup.log` read **in full** to display its last 30 lines; never rotated (`sync-state.ts:697`) | 1, 3 | verified |
| M7 | Buddy desktop-capture PNGs written to `os.tmpdir()` and never cleaned up (`main.ts:1807-1816`) | — | verified absence of cleanup; impact likely negligible |

#### M1 in detail — fixing R1 alone would NOT fix the freeze

This is the most consequential finding of the second pass, because it changes what "fix
the freeze" means.

`getHistory()` at `harness/native-session-host.ts:3474` is **not async at all** — a plain
synchronous method, called from the same `TRANSCRIPT_REPLAY` IPC handler as R1
(`ipc-handlers.ts:2489`). Traced by hand:

- `this.store.readEvents(sessionId, entry.cwd)` (`harness/session-store.ts:216`)
- → `home.readSessionLines(...)` (`native-home.ts:152`)
- → `fs.readFileSync(p, 'utf8')` of the **entire** session file, then `JSON.parse` per line.

Then, if the session has ever delegated to a specialist, line 3487 does
`records.map((record) => this.store.readEvents(record.childId, record.workDir))` — **the
same full synchronous read again, once per child.**

So the cost is `1 + C` complete file reads and parses, where C is the number of specialist
children, all on the main process, all at once.

**The consequence for planning:** R1 and M1 are two independent code paths doing the same
blocking work — one for Claude Code sessions, one for native sessions. A change that fixes
`transcript-watcher.ts` and stops there would pass every test, ship, and leave Destin
freezing on exactly the sessions the app is moving toward. Card C1 must cover both, and
the stall scenario must be run against a native session as well as a Claude Code one.
This is the cross-surface-parity miss the workspace rules exist to catch.

#### M4 in detail — the second periodic scanner

`RECONCILE_INTERVAL_MS = 30 * 60_000` (`conversations/service.ts:29`), started at
`service.ts:229`, plus a startup pass at `:202`. The loop (`reconciler.ts:97-142`)
`readdirSync`s the projects dir, then for every slug directory `readdirSync`s it and calls
`await readSessionTranscriptMeta(...)` on **every** `.jsonl` file.

The per-file read is genuinely async and bounded (a tail read, not a whole file), and the
O(n²) store lookup that once cost 2.8s on 600 records has already been fixed — its own
comment records that incident. What remains is an unbounded sequential walk whose cost
tracks **the total number of Claude Code transcript files on the machine ever**, including
ones created outside the app entirely. Nothing prunes `~/.claude/projects`.

Together with S1 this makes **two** independent periodic scanners, on two different
cadences, neither of which any scenario measures.

### Second-pass sweep — growth over months (2026-08-27)

| # | instance | class | confidence |
|---|---|---|---|
| G1 | **Resume Browser re-scans every conversation record and every transcript on each open** (`session-browser.ts:372-560` → `ipc-handlers.ts:1609`) | 1, 3 | **verified by hand** |
| G2 | chatsearch index is explicitly "tombstones, never prune" — keeps turns for conversations whose transcripts are gone (`chatsearch-index/index-store.ts:126-132`) | 3 | verified (self-documented) |
| G3 | Sync-space git repos grow unbounded; `git gc --auto` every 50th sync **repacks but never expires** (`sync-spaces/git-transport.ts:610-628`) | 3 | verified (self-documented) |
| G4 | `unmatchedParents` array grows for every Agent tool-use that never binds, and each successful bind pays a linear scan over it (`subagent-index.ts:49,58-73`) | 3 | verified |
| G5 | `ownWrites` map entries for projects with no active watcher are never removed (`artifacts/project-watcher.ts:91,192-203`) | 3 | verified |
| G6 | Claude Code's own retention prunes raw transcripts at 365 days, but nothing prunes the app's derived records — leaving un-openable tombstones (`retention-default.ts` vs `conversation-store.ts:391`) | 3 | verified mechanism; multi-year curve suspected |

#### G1 in detail — the growth defect on a common action

`listPastSessions` (`session-browser.ts:372`) is reached from `IPC.SESSION_BROWSE`
(`ipc-handlers.ts:1609`) — i.e. every time the Resume Browser is opened. Per open it:

- walks every project slug dir and opens every `.jsonl` for a head+tail meta read
  (genuinely async), **and**
- calls `store.list('claude')` and `store.list('native')` (`session-browser.ts:542`), each
  of which is `readdirSync` + `readFileSync` + parse **per record file**
  (`conversation-store.ts:327-364`) with no yield in the read loop.

This is the clearest Class 3 instance found: cost scales with **every conversation you
have ever had**, it is paid on an action users perform constantly, and G2 and G6 guarantee
the denominator only ever grows — records are never deleted, so a conversation from last
year still costs a file read today.

### Second-pass sweep — renderer, streaming path (2026-08-27)

Destin named streaming as one of his four pain points (*"While Claude is streaming a
reply"*). All four findings below are on that path, and **the first two were verified by
hand**.

| # | instance | class | confidence |
|---|---|---|---|
| N1 | **`findArchiveBoundary(state.timeline)` — an unmemoized reverse scan of the ENTIRE timeline, in the render body, on every streamed token** (`ChatView.tsx:763` → `state/archive-boundary.ts:20-29`) | 2, 3 | **verified by hand** |
| N2 | **A forced layout reflow per streamed token** — `scrollToBottom()` reads `scrollHeight` and writes `scrollTop`, from an effect keyed on `state.lastActivityAt` which the reducer stamps on every delta (`ChatView.tsx:250-252`, `use-stick-to-bottom.ts:96-99`) | 2 | **verified by hand** |
| N3 | `splitIntoBubbles` re-runs from scratch every token for the live turn — the reducer creates a new `turn` object per delta, so the `useMemo` never hits while streaming (`AssistantTurnBubble.tsx:373`) | 2, 3 | verified |
| N4 | `assistantTurns` / `timeline` / `seenUuids` only ever append for a session's life, and every token does `new Map(session.assistantTurns)` — so per-token reducer cost grows with total turns ever produced (`chat-reducer.ts:83`) | 3 | verified growth; absolute cost unmeasured |

#### N1 and N2 in detail — the two verified per-token costs

**N1.** `findArchiveBoundary` (`state/archive-boundary.ts:20-29`) is a plain reverse `for`
loop over `timeline` looking for the last `/compact` or `/clear` marker. It is called at
`ChatView.tsx:763` **inline in the render body**, not inside a `useMemo`. In the common
case — a session that has never been compacted or cleared — there is no marker to find, so
it scans from the last entry all the way to index 0 **and returns nothing**, on every
render. A render happens per streamed token. This runs on the same growing array that
`ChatView.tsx:764` then `.map()`s in full, so a long session pays two complete walks per
token.

**N2.** `scrollToBottom` is `c.scrollTop = c.scrollHeight` (`use-stick-to-bottom.ts:96-99`)
— reading `scrollHeight` forces a synchronous layout, and the write follows it. It is
called from an effect (`ChatView.tsx:250-252`) whose deps include `state.lastActivityAt`,
and the reducer stamps `lastActivityAt: Date.now()` on every text and reasoning delta
(`chat-reducer.ts:1023`, `:1073`). The effect's own comment says it: *"one delta per
streamed token."*

The hook's authors already knew this read is expensive — `use-stick-to-bottom.ts:120-134`
calls it *"a FULL forced reflow of a large transcript"* and debounces the `onScroll`
listener for exactly that reason. **That debounce does not cover these two call sites.**
A forced reflow is document-wide, not container-scoped, so it interacts with every other
ChatView the app keeps mounted (R3).

#### What the renderer already gets right

Recorded so a future session does not "optimize" a thing that is already solved:

- `state/chat-context.ts` implements a **per-session** `useSyncExternalStore` specifically
  so a token in one session does not re-render every other ChatView. Its header documents
  this as a deliberate fix for that exact prior bug.
- `AssistantTurnBubble` and `ToolCard` are both `React.memo`'d with custom comparators;
  sibling turns and tools verified not to re-render on unrelated activity.
- Listener hygiene: 67 `addEventListener` against 67 `removeEventListener`; ResizeObservers
  spot-checked individually all have matching cleanup. No leak found.
- No `JSON.parse`/`stringify` anywhere on the streaming path.

**S6 downgrade, recorded rather than quietly dropped.** The first sweep flagged this as an
unbounded per-window broadcast. Reading `main.ts:1180-1195` directly: the ticker is
`clearInterval`'d on `SESSION_DRAG_ENDED`, and `stopCursorTicker()` is called *before*
each start, so it is idempotent and cannot accumulate. The cost is real — a synchronous
`screen.getCursorScreenPoint()` plus one send per window, 30 times a second — but it is
bounded to the duration of a drag the user is actively performing. That is a very
different thing from S1, which runs forever. Keep it in the register, rank it last.

#### S1 in detail — the largest sweep finding

Every 10 seconds, forever, regardless of window focus, on the main process:

- **5 fixed synchronous filesystem operations** — usage cache, announcement cache, sync
  marker, a `statSync` on the sync lock, backup metadata. Counted directly over
  `ipc-handlers.ts:1983-2058`.
- **3 more per open session** — `.context-<id>`, `.gitbranch-<id>`,
  `.session-stats-<id>.json`, in three separate loops over `sessionIdMap`. All via
  `readTextFile`/`readJsonFile`, both of which are `fs.readFileSync` wrappers
  (`ipc-handlers.ts:1923`, `1937`).
- **then a structured-clone send of the whole payload to EVERY open window** —
  `send()` at `ipc-handlers.ts:196-207` loops `windowRegistry.getWindowIds()` and calls
  `wc.send` per window — plus `remoteServer.broadcastStatusData(data)` when remote access
  is on.

So the per-tick cost is `5 + 3N` blocking reads plus `W` payload serializations, where N is
open sessions and W is open windows. The payload itself is O(N) — it carries a
per-session entry in each of `contextMap`, `gitBranchMap`, `sessionStatsMap` and
`attentionMap`.

**Why this is the best fit yet for Destin's symptom profile.** It is the only mechanism
found so far that is simultaneously (a) periodic with no user action, (b) linear in open
sessions, and (c) on the main process. That is his three complaints — hitches while idle,
worse with more sessions, whole-app freezes — in one place.

**Honest caveat.** The files are small and each read is probably sub-millisecond. "Probably
fast × 35, every 10 seconds" may be entirely invisible. This is a strong suspect with a
verified mechanism, **not a proven cause**. It is exactly what the idle scenario is for.

---

## Coverage: which classes the suite can currently catch

| class | covered? | by what |
|---|---|---|
| 1 — main-process blocking | **yes** | `scenario-replay-stall.mjs`, `probe-ipc.mjs` |
| 2 — renderer blocking | **yes** | long-task probe in workload, stall and artifacts |
| 3 — scales with a growing quantity | **partly** | history runs 3 sizes; artifacts reports `sizeScaling`. No scenario varies *session count* or *conversation count* and compares |
| 4 — idle cost | **NO** | `idle.pssMb` / `idle.cpuPct` exist but sample a **zero-session** boot with a **throughput** metric — blind to a per-session blocking cost by construction. Largest gap |
| 5 — cache invalidation storms | **NO** | no scenario repeats a mutating action and times each one |
| 6 — deliberate tradeoffs | n/a | needs Destin's eyes, not a metric |


---

## What the suite still needs — the scenario shopping list

Ordered by (instances it would cover x confidence the mechanism is real). Every one of
these is a gap in the CURRENT suite, not a refinement of it.

### 1. `idle` — the app at rest, with sessions open

**Covers:** S1, M2, M3, M4, S5. Five instances, three of them verified by hand.

Open N sessions, perform **no action** for a fixed window, sample main-process IPC stall
and CPU throughout. Run at two values of N; the difference is the per-session idle tax.

**Must not repeat the existing mistake.** `idle.pssMb`/`idle.cpuPct` already exist and are
blind to this: they sample a **zero-session** boot with a **throughput** metric. This
scenario has to hold sessions open and measure **latency**, or it will report the same
clean number.

Long enough to catch both cadences: the status poll is 10 s, the reconciler is 30 min.
A short idle window catches only the first — say so in the report rather than implying
the app was quiet.

### 2. `native-stall` — the stall scenario against a native session

**Covers:** M1, the twin of the one defect we have actually measured.

`scenario-replay-stall.mjs` currently drives Claude Code sessions only. M1 is a separate
code path with the same defect, made worse by specialist child count. Without this,
C1 can be declared fixed while half the freeze remains. Seed a native session with
delegations so the `1 + C` multiplication is exercised, not just the parent read.

### 3. `library-scale` — cost as a function of total history

**Covers:** G1, G2, G6, M4, and the Class 3 half of R2/R3.

Seed a fixture with hundreds of conversation records and transcripts, then time the
actions that walk them: Resume Browser open, chatsearch refresh, startup reconcile.
**Report the ratio between two seed sizes, not the absolute** — a Class 3 defect is
defined by its slope, and an absolute number on one fixture size cannot show a slope.

### 4. `streaming` — per-token cost in a long session

**Covers:** N1, N2, N3, N4. Two verified by hand.

Stream a response into a session that already holds many turns, and count forced reflows
and per-token long tasks. The existing workload scenario streams, but into short
sessions — which is precisely the configuration in which N1's scan is cheap and N4's Map
copy is small.

### 5. `repeat-action` — cache invalidation storms

**Covers:** S3, S4.

Perform the same mutating action N times in a row (favorite/unfavorite a skill; install/
uninstall a theme) and time each one. Flat means the cache holds; a sawtooth means every
action pays a full rebuild.

---

## This register's second job: calibrating the rig

Added 2026-08-27 after Destin restated the goal as *"infrastructure to hillclimb/optimize
all bug classes and improve code efficiency autonomously … we will use these bugs to test
the rig a bit later."*

Under that goal the register stops being a to-do list and becomes a **labelled test
corpus**. Each entry is a defect with a known mechanism at a known location, verified by
reading the code rather than by trusting a measurement. That makes it the only ground
truth available for answering the question an autonomous loop cannot answer about itself:

> **Can the rig actually see a defect that is definitely there?**

This matters because the failure is silent. A rig aimed at the wrong configuration, or
using a throughput metric for a latency defect, does not error — it returns a clean
number. Class 4 is the worked example: `idle.pssMb` and `idle.cpuPct` have been in
`PRIMARY` the whole time, and are structurally incapable of seeing S1.

### How to use the corpus

For each entry the rig claims to cover, the calibration question is three-part:

1. **Detection.** With the defect present, does the metric move outside the baseline's
   own spread? If not, the metric cannot prove any fix to it either — the loop would
   hillclimb blind.
2. **Attribution.** Does it move the *right* metric? A main-process defect that only
   shows up in a renderer number will send the next fix at the wrong thread.
3. **Floor.** How large does the effect have to be before the verdict flips? That number
   is the smallest win the loop can ever ship on that metric, and it should be published
   beside the metric rather than discovered later by a session wondering why nothing
   ever passes.

An entry the rig cannot detect is not a bad entry. It is a **gap in the rig**, and the
register is what makes that gap visible instead of silent.

### The inversion worth stating plainly

For every other purpose, a hand-verified defect the rig misses is bad news about the app.
For calibration it is the opposite: **it is the most valuable result available**, because
it is the only way to find out that a metric is decorative before an autonomous loop
spends a week trusting it.

## Standing rules this register implies

1. **A fix for R1 must also cover M1.** They are the same defect on two code paths. Any
   card that claims the freeze must name both, and the stall scenario must run against a
   native session before that card can be closed.
2. **Class 3 findings are judged on a ratio, never an absolute.** A single seed size
   cannot show a slope.
3. **`async` is not evidence of non-blocking.** Three instances found where it was not.
   Prefer promoting this to an ast-grep rule over trusting review to catch the fourth.
4. **Nothing here is proven until the rig reproduces it.** Every row above is a traced
   mechanism, not a measurement. The register's job is to aim the suite, and a mechanism
   that survives contact with a measurement is worth more than six that have not been
   tried.
