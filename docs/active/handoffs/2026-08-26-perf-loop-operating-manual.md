---
title: Perf lab — operating manual for the autonomous session
status: active
date: 2026-08-26
last_updated: 2026-08-27
plan: docs/active/plans/2026-08-23-perf-lab-and-optimization-loop.md
status_doc: docs/active/handoffs/2026-08-27-perf-lab-session-status.md
corrections: docs/active/investigations/2026-08-26-perf-lab-plan-corrections.md
---

# Perf lab — operating manual

**You are a session with no memory of any of this.** Assume you remember nothing. Everything
you need is in this document or in the four files listed below. Read this whole file before
you do anything.

## What this is for (read this first — the objective CHANGED)

The original plan (2026-08-23) said: build a rig, measure once, run an optimization loop,
open one PR, stop.

**That is no longer the objective.** Destin changed it mid-session, and his words are the
operative goal:

> *"turn everything we find to work or be useful this session into a repeatable stress test
> we can use to cycle and notice future performance issues on different app surfaces."*

So: **the deliverable is a repeatable per-surface stress suite, not a one-time optimization
pass.** Every real finding becomes a permanent scenario in `scripts/perf-lab/`, so the next
time performance regresses on any surface it is caught by running one command instead of
being re-investigated from scratch. Optimizations are a *consequence* of the suite, not the
point of it.

The reframe happened because Destin reported real daily symptoms the rig was completely
missing: frequent freezes, lagging animations, sluggishness, and moments where *"all
animations app-wide slow down, sometimes I can't click anything."* Those reports are primary
evidence. Coverage of the surfaces he complains about outranks shaving milliseconds off
surfaces he does not.

The per-experiment procedure in §3 still applies **whenever you are optimizing** — it is how
a change earns the right to be kept. It is not the shape of the whole job any more.

## Your reading list

| File | What it is | When you need it |
|---|---|---|
| `docs/active/handoffs/2026-08-27-perf-lab-session-status.md` | **The authoritative current state** — what is built, what is covered, what is measured, what remains | First. Before this manual's numbers, before the plan, before anything |
| `docs/active/investigations/2026-08-26-perf-lab-plan-corrections.md` | 18 verified corrections, including two retracted claims | Whenever the plan or older prose contradicts this manual — the corrections win |
| `scripts/perf-lab/README.md` | **Operator reference for the rig** — every flag, every metric's meaning, environment/ports table, known limits | Before touching `run.mjs`. This manual deliberately does **not** repeat it |
| `docs/active/plans/2026-08-23-perf-lab-and-optimization-loop.md` | The original plan | History only. It is wrong in places and its objective was superseded |

Two paths you will type constantly:

- Workspace root: `/home/destin/youcoded-dev` — the rig, the reports. Run every rig command from here.
- Product worktree: `/home/destin/youcoded-dev/worktrees/perf-lab` — branch `perf/optimization-pass`. **Every app code change goes here and nowhere else.**

**Nothing has shipped.** Zero optimizations are merged, no PR is open, and neither the
workspace commits nor the product branch have been pushed (status doc §4, §7).

---

## 0. The four rules that override everything else

If you read nothing else in this file, read these.

1. **No product code changes until Destin approves the card list.** This is a human gate. §7
   has the proposed list; he has not seen it yet. Bringing him the list is a *deliverable*,
   not a formality you can skip because a fix looks obvious.
2. **Do no other work while a rig run is in flight.** Not a subagent, not a grep, not a
   build. §4 explains what this already cost.
3. **A screenshot difference STOPS the loop** (`ux-bugfix`, §3g). You do not decide that a
   visible change is fine.
4. **Anything paint-related needs Destin's eyes on a real screen before it counts** (§3h).
   Xvfb has no GPU; the rig can rank paint work backwards.

---

## 1. Two retracted claims — carry these forward or you will re-derive them

Both of these were stated confidently, written down, and were **wrong**. Stale prose
containing them may still exist elsewhere. These retractions are recorded in full in the
corrections investigation (§17 and §18) and in the status doc §5.

### Retraction 1 — the "3.3 second blank window" was a rig artefact, not an app property

The rig reported `blankWindowMs` ≈ 3,330 ms — a window visible but empty for 3.3 seconds on
every launch — reproduced across three runs on two days. It looked like the single largest
cost in the whole product. It was the rig measuring itself.

**Mechanism.** On a normal (setup-complete) boot the renderer gates its entire UI on
`window.claude.firstRun.getState()` (`App.tsx:472-488`) and renders an empty `<div>` until it
resolves (`App.tsx:2669-2672`). That IPC's main handler calls `detectAuth()` (`main.ts:887`
→ `prerequisite-installer.ts:457`), which shells out to **`claude auth status`** and awaits
its stdout. The fixture's fake `claude` ignored argv and idled forever, so the call never
returned and **`App.tsx`'s own 3-second *safety* timeout became the primary path on every
boot**. `fake-claude.cjs` now answers `auth status` and exits. Measured blank window fell
**~3,330 ms → ~356 ms** (status doc §3.4, §5a).

**State this lesson explicitly, because it cost a day: stability is not validity.** That
number had a **0.4 % spread across six boots** — the strongest-looking evidence in the entire
dataset — and it was stable *precisely because* it was a hardcoded timeout. What cracked it
was noticing that only **61 ms of long tasks** spanned a 3-second gap: the renderer was not
busy, it was idle, waiting on the harness. **A gap that stays ~3.0 s even when everything
before it gets 3× faster is a timer, not work.** Before ranking a surprisingly large number,
find the mechanism that produces it.

**Residual real finding, stated at its true size:** the app's first contentful paint genuinely
is gated behind a subprocess call to the `claude` CLI, capped at 3 s by that safety timeout.
That is a robustness question worth a ROADMAP entry. It is **not** a flat 3-second tax on
every user and must never be reported as one.

**Consequence for reports:** every pre-fix report was moved to `scratch/perf-lab/discarded/`
rather than kept. **Nothing may be baselined against them.**

### Retraction 2 — `hastText` does NOT re-walk on every re-render

The wrong claim (stated to Destin as a headline suspect, and filed on the ROADMAP before it
was checked): *"`MarkdownContent.tsx:186-187` calls `hastText(node)` unmemoized, so every code
block in the conversation re-walks its AST on every re-render."*

**What the source actually says:** `MarkdownContent` is wrapped in `React.memo`
(`MarkdownContent.tsx:265`) and its `content` prop is a plain `string`. React's default
shallow comparison therefore skips the whole component — `hastText` included — when the
message text has not changed. **An unrelated re-render costs nothing.**

What remains true, and is narrower:

- On a **resume**, every message mounts for the first time, so all N walks happen at once.
  That genuinely feeds the replay freeze.
- While **streaming**, the growing bubble's `content` changes on every token, so a bubble
  containing a large code block re-walks repeatedly. This is real and is the best remaining
  explanation for streaming-time spikes.
- Cost scales with **fence count in one message**, not with conversation length.

**The rule this suggests, which generalizes:** when attributing cost to a call site, establish
how often that call site actually executes before describing its impact. A hot-looking line
inside a memoized component is not a hot line. The fix here was to read fifty lines further
down the same file.

---

## 2. The measured facts

Everything below traces to the status doc §3 or to the one surviving complete report,
`perf-reports/2026-08-27-0702-4256ade-repeat-a.json`. **That report is a floor, not a
baseline** — its `_provenance` block records that it was taken with **plain-prose** fixture
content, before the realistic-content switch and before `huge` was recalibrated, so it is
**not comparable to any report produced after commit `9060b0d`**.

### 2.1 The app-wide freeze — measured, mechanism identified

This is Destin's reported symptom, reproduced (status doc §3.1):

| conversation | main-process IPC stall (max) | worst single renderer long task |
|---|---|---|
| 100 messages | 5 ms | 117 ms |
| **5,000 messages** | **3,353 ms** | 3,257 ms |
| 50,000 messages | 3,190 ms | **24,329 ms** |

A 5,000-message conversation is **ordinary usage** and it stalls the whole app ~3.3 s.

**Mechanism:** `TranscriptWatcher.getHistory()` (`youcoded/desktop/src/main/transcript-watcher.ts:451-488`)
does a synchronous `fs.readFileSync` of the entire transcript plus a full parse of every
line, called from an IPC handler (`ipc-handlers.ts:2489`). The main process is
single-threaded and serves IPC for **every** session, so while it runs nothing anywhere in
the app can respond.

The probe measures this with `window.claude.getPlatform()`, whose handler is literally
`() => process.platform` (`ipc-handlers.ts:1387`) — zero work, so every millisecond it
reports is thread availability, never handler cost.

### 2.2 Renderer cost is O(total messages) and unvirtualized

- `ChatView.tsx:764` maps the full timeline; **no virtualization anywhere in the renderer**.
- `MarkdownContent.tsx:296` runs four synchronous tree passes per message, including
  highlight.js with its full ~37-grammar set.
- `globals.css:801-806` records `content-visibility:auto` being **deliberately removed**
  because its implicit `contain:paint` clipped theme glows — leaving `contain: layout style`,
  which does **not** skip offscreen work. The app had the mechanism that makes long
  conversations cheap and traded it for a visual effect. **Restoring it is a real product
  tradeoff and is Destin's call, not a session's.**

### 2.3 Cost scales with the number of open sessions

`ChatView.tsx:695-707` keeps a ChatView **mounted for every open session**
(`content-visibility: hidden`, deliberately not `display:none`, for resize performance).
Measured: PSS **450 MB idle → ~2,730 MB with six sessions** (status doc §3.3; the surviving
report's `workload.median.pssAfterMb` is 2729.8). This matches Destin's "worse with more
sessions" exactly.

### 2.4 Startup is fine — this is what killed three plan cards

From the surviving report (sha `4256ade`, 5 cold starts, zero `desktop.log` ERROR lines).
Milliseconds since the rig spawned the process:

| metric | value |
|---|---|
| `whenReady` | ~652 ms |
| `createWindowAt` | ~680 ms |
| `createWindow` (duration) | ~36 ms |
| `documentStart` | ~704 ms |
| `firstPaint` | ~866 ms |
| `modulesEvaluated` | ~951 ms |
| `appMounted` | ~978 ms |
| `sessionsListed` (interactive) | ~979 ms |
| `firstContentfulPaint` | ~1,036 ms |
| **`blankWindowMs`** | **~356 ms** |
| idle PSS | ~450 MB |
| **all 16 boot chores together** | **~29 ms** |

The whole boot is about **one second**. The chore breakdown from the same report, so you can
see there is nothing in there: `prelude` 11, `rotateLog` 4, `installHooks` 3, `themeProtocol`
3, `hookRelay` 2, and eleven more at 0 or 1 ms each.

**READ THIS BEFORE TRUSTING ANY EARLIER NUMBER.** An earlier version of this table reported
`firstContentfulPaint` 4,002 ms and `blankWindowMs` 3,321 ms. Those were the rig artefact in
§1 Retraction 1 — wrong by an order of magnitude.

### 2.5 Destin's symptom profile (his answers — load-bearing)

- All four surfaces: streaming, session switching, scrolling long conversations, opening panels.
- Present **from launch** AND worse over hours AND worse with more concurrent sessions.
- **Equally present on plain Midnight and on blur/glass themes.**

Theme-independence is the diagnostic: if this were compositing / `backdrop-filter` it would
track theme weight. It does not. **This is main-thread JavaScript, not paint** — which also
means Xvfb's missing GPU matters far less than feared, and the rig *can* measure it.

### 2.6 Artifact / editor spikes — suspects only, UNMEASURED

Destin reports spikes when editing files, copying text, and navigating HTML artifacts.
`scenario-artifacts` exists to measure exactly this and **has never run against the real
app**. Suspects, all unverified as costs:

- `HtmlView.tsx:40` `<iframe srcDoc={doc}>` — any change re-parses the whole document and
  re-runs its scripts; switching artifacts remounts the viewer outright
  (`ViewerErrorBoundary` is keyed by `artifact.id`, `ActiveArtifactView.tsx:569`).
- CodeMirror re-tokenisation on edit (`CodeEditorView.tsx:57-77` builds its state).
- `MarkdownContent.tsx:186-187` `hastText(node)` — **but see §1 Retraction 2**; the cost is
  paid when `content` changes, not on every re-render.

---

## 3. Surface coverage, and the two scenarios that have never run

**State this honestly. Do not imply more coverage than exists** (status doc §2).

| surface | scenario | status |
|---|---|---|
| startup / boot chores | in `run.mjs` | covered |
| history reload by size | `scenario-history.mjs` | covered |
| chat under load (6 sessions, streaming, switching) | `scenario-workload.mjs` | covered |
| app-wide freeze on replay | `scenario-replay-stall.mjs` | **built, NEVER RUN against the real app** |
| artifacts / editor / HTML viewer | `scenario-artifacts.mjs` | **built, NEVER RUN against the real app** |
| terminal | — | **NOT covered** |
| marketplace | — | **NOT covered** |
| sync | — | **NOT covered** |
| themes / theme switching | — | **NOT covered** |
| buddy / multi-window | — | **NOT covered** |

### 3.1 `scenario-replay-stall.mjs` — the app-wide freeze

Answers a different question from `scenario-history`. History asks *"how long until the
conversation is on screen?"* — a cost the user asked for. This asks *"how long was the REST
OF THE APP unusable while that happened?"* — the cost behind the complaint.

It runs **two probes at once** and attributes the stall between them
(`attributeStalls()`, `scenario-replay-stall.mjs:190`):

- the **IPC stall probe** (`probe-ipc.mjs`) pings the zero-work `getPlatform` handler every
  100 ms and measures end-to-end unresponsiveness;
- the **renderer long-task observer** (borrowed from `scenario-workload.mjs`) says when the
  renderer's own main thread was busy.

**The rule, in one sentence:** a stalled ping that overlaps a renderer long task is blamed on
the **renderer**; a stalled ping with no long task under it can only be the **main process**,
and that is the app-wide freeze. Overlapping blocks are apportioned by overlap, not
either/or. Neither probe alone can tell those two apart — running both is the entire point.

Shape: `runReplayStallScenario(app, fixture, { repeats = 3, sizes = ['small','medium','huge'] })`.
`repeats` is 3 rather than history's 5 because a `huge` resume costs minutes per sample.
Metrics it can be judged on are in its exported `NUMERIC_KEYS` — including
`mainProcessStallMs` / `mainProcessStallMaxMs`, `rendererStallMs` / `rendererStallMaxMs`,
and `rendererLongtaskMaxMs`.

Two deliberate design points worth knowing before you edit it:

- It polls from **Node**, not in-page, unlike `scenario-history`. That is itself an
  instrument: while the renderer is blocked a CDP `evaluate` does not return until the block
  ends, so a 500 ms poll that takes 24 s to answer has just measured a 24 s renderer freeze.
  An in-page sampler would also be adding renderer work to the very thread whose blocking is
  being measured.
- `WATCH_TIMEOUT_MS` is 240 s and is **mandatory** — without a ceiling a wedged renderer
  hangs the rig forever, because a CDP evaluate never returns while the main thread is
  blocked and `cdp.mjs` does not time a request out on its own.

**Known stale comment in that file:** its `WATCH_TIMEOUT_MS` comment
(`scenario-replay-stall.mjs:66-74`) still describes `huge` as "25,000 turns → 50,000
messages ... ~122s". That was true before the fixture recalibration (§3.3 below). The
240 s ceiling is still correct and generous; the justification text is out of date. Fix the
comment when you next touch the file.

### 3.2 `scenario-artifacts.mjs` — editor / HTML viewer / copy

A journey through the surface Destin complains about and no earlier scenario ever touched:
open files in the session drawer, **type** into a CodeMirror editor, swap an HTML preview
back and forth, and copy a code block out of the transcript — with **both** probes running
over every step, so each step carries its own `probe` (renderer) and `ipc` (main process)
window and its own `stall.verdict`.

It is built to separate three suspects, and it tells you which number answers which
(`scenario-artifacts.mjs:47-66`):

| suspect | the numbers that answer it |
|---|---|
| markdown parse / `hastText` per code block | `open.mdLarge.openMs` vs `open.mdSmall.openMs`, against `files.mdLarge.fences` vs `mdSmall.fences`; `sizeScaling.markdownOpenRatio` should track `markdownFenceRatio` if the cost really is per-code-block |
| `iframe srcDoc` re-parse | `htmlNav.swapLarge` vs `htmlNav.swapSmall`, and `sizeScaling.htmlSwapRatio`. `htmlNav.inPage` is the **control** — an in-document navigation that does not touch `srcDoc` |
| CodeMirror re-tokenisation on edit | `typing.codeLarge.keystroke` vs `typing.codeSmall.keystroke`, and `sizeScaling.keystrokeRatio`. A ratio near 1 **exonerates** this suspect at these file sizes |
| whole-app freeze | any step whose `stall.verdict` is `'main'` |

Its fixture files are generated from a **deterministic PRNG** (`rng32`, `:89`) on purpose:
byte-identical files between baseline and candidate, so "the large file got slower" cannot
secretly mean "the large file got different". `largeBytes` defaults to 400,000 — kept well
under `EDIT_MAX_BYTES` (3 MB, `editable-path-policy.ts:99`), above which the pane serves a
prefix and goes read-only and the typing step would have nothing to type into.

### 3.3 The fixture changed — every size figure in older prose is wrong

Two changes landed together (commit `9060b0d`), and reports from before them are **not
comparable** to reports after them:

- **Content is `realistic` by default** — code blocks, diffs and tool cards
  (`content.mjs`), not prose filler. Realistic content costs ~6.8× the bytes per turn and
  writes 2.92 JSONL lines per turn instead of 2.00, i.e. **1.46× as many timeline entries to
  render per turn**.
- **`huge` was recalibrated 25,000 turns → 3,500 turns.** Current sizes, from
  `fixture.mjs:186`: `small` **50**, `medium` **2,500**, `huge` **3,500** turns.

`medium` (2,500 turns = 5,000 history messages) is the important one: **that is an ordinary
conversation in this app, not a stress case**, and it is the size that stalls the whole app
~3.3 s.

**The tradeoff, stated plainly** (`fixture.mjs:178-186`): the default suite **no longer
probes the 50,000-message regime**. `huge` is now 7,000 history messages / 10,258 timeline
entries — 1.4× `medium`, not 10×. The ceiling that forced this is `scenario-history.mjs`'s
in-page `WATCH_TIMEOUT_MS` of 240 s per resume sample: a resume that overruns it reports
`null`, so `history.<size>.median.resumeStableMs` — a PRIMARY metric — goes blind while
still burning 240 s × 5 repeats. If the 50k regime is wanted back, the levers are raising
`WATCH_TIMEOUT_MS` or building that one size with `{ content: 'plain' }`; both are deliberate
choices, not defaults, and that is what the `--stress` tier in §7 is for.

### 3.4 A first run of either new scenario is a SHAKEDOWN, not a baseline

Neither `scenario-replay-stall` nor `scenario-artifacts` has ever touched the real app
(status doc §2, §4 item 3). Neither is wired into `run.mjs` yet — its `--only` phases today
are `startup,history,workload,shots` (`scripts/perf-lab/README.md`), and `run.mjs` contains
no reference to either scenario.

**Expect selector failures and wait-timeout failures on the first run.** Both scenarios are
written to fail loudly with the real cause rather than return a plausible zero, which is what
you want, but it means the first run's job is to find out what breaks. **Do not baseline
anything against it, do not report its numbers as findings, and do not describe a surface as
measured because a shakedown produced a number.**

---

## 4. While a run is in flight, do nothing else on this machine

**Rule: one rig run at a time, and no other work of your own while it runs.**

The noise gate requires 1-minute load average `< 4` and machine CPU `< 10%` before every
boot, and it retries five times before refusing. It is not decoration — a busy machine
stretches exactly the intervals being measured.

This was learned the expensive way: a repeatability run aborted mid-flight (`exit 2`, "the
machine never went idle across 5 attempts") because the session had **dispatched a subagent**
to do unrelated file-reading work *while* the run was going. Load hit **4.47**. Twenty
minutes of measurement was thrown away, correctly (status doc §6).

Concretely, while `run.mjs` is executing, do not: dispatch subagents, run test suites, run
builds, run `rg`/`grep` sweeps over the repos, or start a second rig run. Read a file if you
must, but prefer to simply wait — a full run is ~20–45 minutes and the loop has no deadline.
Waiting is cheaper than re-running.

Note what the gate does **not** protect you from: it samples only *before* each boot, so load
that arrives mid-boot is invisible to it. **That is the real reason for this rule — the gate
is a backstop, not a guarantee.**

**Inhibit suspend for any long run.** The machine sleeps on idle (KDE PowerDevil) and a
suspend mid-run does not fail loudly — it silently stretches whatever interval straddles it.

```bash
systemd-inhibit --what=idle:sleep --mode=block --who="perf-lab" \
  --why="performance measurement run in progress" \
  node scripts/perf-lab/run.mjs ...
```

No root needed; the inhibitor releases when the command exits.

---

## 5. Non-negotiables (the plan's Global Constraints, with corrections)

The following is the **Global Constraints** section of the plan, reproduced verbatim. Parts
have been overtaken by events. **Read the corrections immediately after it — they supersede
the text above them.** Everything not corrected is binding.

- **Live-app safety (overrides everything):** the rig NEVER touches the real `~/.config/youcoded`, `~/.claude`, `~/.youcoded`, or any running YouCoded process. Every launch uses `HOME=<fixture>` and `YOUCODED_PORT_OFFSET=100` (remote 10000, engine 10020 — clear of built 9900/9920 and dev 9950/9970). Process discovery is by fixture path, never by app name.
- **No `YOUCODED_PROFILE`.** A profile makes `main.ts` skip the install-hooks chore that every real launch runs, so the rig would measure a boot no user gets. `HOME` alone isolates userData (`<fixture>/.config/youcoded`), the hook socket is per-process, and the port offset moves every port — the profile adds nothing but a blind spot.
- **Measure what the user gets:** the fixture turns remote access ON (`<fixture>/.claude/youcoded-remote.json`, default is off) so the remote-server chore is real, not ~0.
- **Network-bound phases are flagged, never ranked as code cost:** `announcements` (GitHub fetch at boot, `announcement-service.ts:76`) and the release check (`ipc-handlers.ts:1716`) vary with WiFi. Reports carry them; findings mark them `network`.
- **Xvfb has no GPU.** Anything paint-heavy is measured on a slow software path, so rankings of renderer-paint work can be backwards. Any experiment touching paint/blur/animation/compositing REQUIRES an on-screen spot-check by Destin before it counts — flag it, don't script it (CLAUDE.md: final-stage visual verification is his).
- **Blank window is a hard-reject metric:** `startup.blankWindowMs` = first contentful paint − window creation. The window is created visible today (`main.ts:612`); an experiment that shows it earlier but paints later makes the user stare at a blank box longer, and settled screenshots can't see that.
- **Repetition everywhere a number can veto:** cold start ×5 (7 for baseline), history ×5 inside one boot, workload ×3 inside one boot. `compare.mjs` reads the spread from those runs for every PRIMARY metric.
- **Budget:** a rig run aborts after `--max-minutes 45`; an autonomous session runs at most 8 experiments before reporting.
- **No official numbers from dev mode.** Every reported number comes from `release/linux-unpacked/youcoded` (packaged; `app.isPackaged === true`).
- **Zero visible UX/UI change** in product code. Screenshot parity gate rejects any pixel diff > 0.05% unless the entry is tagged `ux-bugfix` for Destin's review.
- **Product changes stay cross-platform** (Windows/macOS/Linux). Rig may be Linux-only.
- **Ship gates per experiment:** `bash scripts/verify.sh perf-lab` green → rig run → keep only if target metric median improves ≥ 5% AND beyond baseline spread AND no other primary metric regresses > 3% AND screenshots match. (Thresholds are Destin's to change; defaults chosen at plan time.)
- **Two human gates:** (1) after Round 0, the ranked findings + proposed experiment cards go to Destin, who approves/vetoes/reorders before any product code changes; (2) any `ux-bugfix` PAUSES the loop — the session reports the diff PNGs and waits.
- **Reports are JSON; screenshots are not committed** except the baseline set and any `ux-bugfix` pair under `perf-reports/review/`. `perf-reports/shots/` is gitignored.
- **Every non-trivial product edit carries a WHY comment** (Destin reads code through comments).
- **Node built-ins only** in `scripts/perf-lab/` — the workspace root has no `package.json` and must not gain one.
- Fixed constants (use exactly): profile `perf`, CDP port `9555`, diff-engine Chrome CDP port `9556`, Xvfb display `:99` at `1600x1000x24`, fixture root `<workspace>/scratch/perf-lab/` (gitignored via `scratch/`), perf log `<fixture>/perf-marks.jsonl`.

### Corrections that supersede the block above

**1. "One PR" is superseded by the suite objective.** The plan's constraint was "all product
work lands as one `perf/optimization-pass` PR and the loop ends when the card list is
exhausted." The deliverable is now the **stress suite** (see the top of this file). Product
optimizations still ride that branch and still go through §6, but finishing the loop is no
longer the same thing as finishing the job.

**2. `perf-reports/LEDGER.md` does not exist.** Earlier drafts of this manual called it "the
only authority on which cards you may run" and said Destin's approved list "sits at the top
of that file". **It has never been created** — verified: `ls perf-reports/` shows only the
one surviving report pair plus `shots/`, and `git log -- perf-reports/LEDGER.md` is empty.
So today **there is no approved card list and no card may be run.** When the Round-0 gate
happens (§7), create `perf-reports/LEDGER.md`, put Destin's approved and ordered list at the
top, and from that moment on it *is* the authority — a card described in §6 is a
*description*, never a permission.

**3. Xvfb needs no sudo, and the "Destin installs Xvfb" prerequisite is void.** The plan
(Task 0, Step 1) made a `sudo pacman -S --needed xorg-server-xvfb` by Destin a hard
prerequisite. On this machine that install **failed** — the local package DB still listed
`21.1.23-1.1` while the repos had moved on, so every mirror 404'd. It was never needed. The
rig vendors its own Xvfb, extracted into a user prefix with no root:

```
scratch/perf-lab/assets/xvfb-prefix/usr/bin/Xvfb
```

`resolveXvfbBin()` in `scripts/perf-lab/launch.mjs` resolves `$XVFB_BIN` → `Xvfb` on `PATH`
→ the vendored copy, so a real system install silently takes over if one ever lands. **Never
ask Destin for sudo to run the rig.** (`xdpyinfo` does need to be on `PATH`; it already is.)

**4. There is no `perf` profile — there is no Electron profile at all.** The fixed-constants
bullet says "profile `perf`". Ignore that one word. The rig deliberately leaves
`YOUCODED_PROFILE` **unset**, for the reason the second bullet gives. Everything else in that
bullet still stands exactly as written: CDP `9555`, diff-engine Chrome `9556`, Xvfb `:99` at
`1600x1000x24`, fixture root `<workspace>/scratch/perf-lab/`, perf log
`<fixture>/perf-marks.jsonl` (`fixture.mjs:342`).

**5. Every line number in that block predates the instrumentation commits.** The four
`perfMark` commits on `perf/optimization-pass` shifted `main.ts` by tens of lines. Re-checked
2026-08-26 against `worktrees/perf-lab`: `main.ts:1339` (profile skips install-hooks) is now
**`main.ts:1371`**; `main.ts:191` (per-process hook socket) is now **`main.ts:208`**;
`main.ts:612` (window created visible) is unchanged. The *claims* still hold. **Treat every
line number in this manual the same way: grep the symbol, do not trust the number.**

---

## 6. Per-experiment procedure — use this whenever you optimize

Run these steps in order, every time. Do not skip a step because the change "is obviously
safe" — the whole point of the rig is that intuition about performance is wrong roughly half
the time.

### a. Take the next approved card

From **Destin's approved list at the top of `perf-reports/LEDGER.md`** (which you must create
at the Round-0 gate — see correction 2 above). Never run a card that is not on that list, and
never reorder it yourself. Add a ledger row before you touch any code:

```
| <n> | 2026-MM-DD | <card id> <short name> | <target metric path> | <one-line hypothesis> | — | — | running | — |
```

### b. Make the change

In `worktrees/perf-lab` only.

- **Every non-trivial edit carries a WHY comment.** Destin reads code through comments.
- **Product code stays cross-platform** — Windows, macOS, Linux. The rig may be Linux-only; the app may not.
- **Zero visible UX/UI change.** If your change alters what the user sees, it is not a perf experiment, it is a product change, and it needs Destin (step g).

### c. Gate on `verify.sh`

```bash
cd /home/destin/youcoded-dev
bash scripts/verify.sh perf-lab
```

Must exit 0. Runs `tsc --noEmit`, `knip`, `eslint`, `vitest related` on your changed files,
and the ast-grep invariant scan. **Fix it or abandon the card — never skip it and never
measure a red tree.** `--full` forces the whole suite. It covers `youcoded/desktop` only.

### d. Measure

```bash
node scripts/perf-lab/run.mjs --runs 5 --label exp-<n>
```

From the workspace root, on an idle machine, with nothing else of yours running (§4). Writes
`perf-reports/<date>-<time>-<sha7>-exp-<n>.{json,md}`.

**Exit codes matter.** 0 = clean report. 2 = something failed. 3 = over budget. 4 = the
report is missing numbers a requested phase owed — the report is written but stamped
`incomplete`, and **you must not rank or judge anything from it**. Anything but 0 means go to
§8, not to step e.

**Never start two rig runs at once.** They fight over CDP port 9555, the fixture HOME and the
Xvfb display, and both results are then garbage.

### e. Judge

```bash
node scripts/perf-lab/compare.mjs perf-reports/<baseline>.json perf-reports/<...-exp-<n>>.json --target <metric path>
```

`<baseline>` is the Round-0 baseline for your first experiment, and thereafter **the last
KEPT report**. Exit 0 = KEEP, exit 1 = REJECT.

The KEEP rule, as `compare.mjs` actually implements it (`verdict()`, `compare.mjs:80`), is all
four of:

1. the target improved by **≥ 5%** (`improveMinPct`), **and** that delta is **larger than the
   baseline's own run-to-run spread** on that same path — a win inside the noise band is not a win;
2. **no other** metric in `PRIMARY` regressed by more than **3% plus its own spread**;
3. **every screenshot comparison passed** (unless you pass `--ux-bugfix`, which is step g, not a shortcut);
4. the candidate logged **no more `desktop.log` ERROR lines than the baseline**.

Any single failure is a REJECT and the reason prints. Do not argue with it, and do not re-run
hoping for a better sample.

### f. Keep or revert

**KEEP** — one commit for this experiment, in `worktrees/perf-lab`, with before/after numbers
in the message:

```
perf(<area>): <what changed> — <target> <base>→<cand> (<Δ%>), screens ok
```

Update the ledger row and note the commit sha. **This report is now the baseline for the next
experiment.** Never delete a `.json` or `.md` report.

**REJECT** — revert completely:

```bash
cd /home/destin/youcoded-dev/worktrees/perf-lab
git checkout -- . && git clean -fd
```

Record the numbers and the reason. A rejected idea is data, not failure. **Never retry the
same idea with a tweak more than once** — two attempts and it is done.

### g. A screenshot differs — STOP

If a screenshot comparison fails and you believe the difference is an **obvious bug fix**
rather than a regression:

1. tag the ledger row `ux-bugfix`;
2. copy the baseline and candidate PNG pair to `perf-reports/review/exp-<n>/`;
3. commit **only** the ledger row and the review PNGs;
4. **STOP THE LOOP.** Report to Destin with the two images and wait for his answer.

Do not run the next card on top of a visible change. Do not silently keep one. Do not decide
for yourself that a visible difference is fine. **The screenshot gate exists because a metric
cannot see the screen.**

### h. Paint-related cards need Destin's eyes before KEEP

Anything touching blur, animation, compositing, CSS effects or GPU-accelerated paint: **the
rig's numbers may rank backwards.** Xvfb has no GPU, so everything renders through software
rasterisation, and removing a `backdrop-filter` can look like a win here and be invisible or
a loss on Destin's actual hardware.

Before you KEEP such a card, stop and **ask him for a 30-second on-screen look**:

```bash
bash scripts/run-dev.sh perf-lab --label "Perf: <card>"
```

His eyes decide, not the number. **Do not script the visual check** — CLAUDE.md is explicit
that final-stage visual verification is his, and building a rig for it wastes a session. Shut
the dev instance down when he has answered.

### i. Budget

**At most 8 experiments per session.** After the 8th — or when the approved list is
exhausted — write a session summary at the bottom of `LEDGER.md` (kept, rejected, still open,
current baseline filename) and stop.

---

## 7. What remains — in order

This is the work queue, from status doc §4. Items 1–3 come before any optimization.

1. **Wire `scenario-replay-stall` and `scenario-artifacts` into `run.mjs`** — report schema,
   `--only` phases, `.md` summary rows. Today `--only` accepts only
   `startup,history,workload,shots`.
2. **Add stall metrics to `compare.mjs`'s `PRIMARY` list.** Nominated with reasoning by the
   scenario author (status doc §4 item 2):
   - `replayStall.medium.median.mainProcessStallMaxMs`
   - `replayStall.medium.median.mainProcessStallMs`
   - `replayStall.huge.median.rendererLongtaskMaxMs`

   **Why the third one is on the list, and why it must not be dropped:** the obvious fix for
   the app-wide freeze is to move transcript reading off the main process. A fix that merely
   *relocates* that work into the renderer would improve both main-process metrics and read
   as a clean win — while the user still experiences a freeze, just in a different thread.
   Watching the renderer's worst long task at the same time is what makes that
   indistinguishable-on-paper outcome visible.

   For reference, `PRIMARY` today (`compare.mjs:13`) is: `startup.median.sessionsListed`,
   `startup.median.firstContentfulPaint`, `startup.median.blankWindowMs`, `idle.pssMb.median`,
   `idle.cpuPct.median`, `history.medium.median.resumeStableMs`,
   `history.huge.median.ipcLast10Ms`, `history.huge.median.resumeStableMs`,
   `workload.median.switchP95Ms`, `workload.median.probe.longtaskTotalMs`,
   `workload.median.pssAfterMb`, `workload.median.cpuDuringPct`.
3. **Shakedown run** of both new scenarios (§3.4). **Not a baseline.**
4. **A `--stress` tier** that restores the 50,000-message regime (needs `WATCH_TIMEOUT_MS`
   raised, or that one size built with `{ content: 'plain' }`), so the default suite stays
   fast enough to cycle on.
5. **Per-surface baseline** with realistic content — 7 runs. This is the first number that
   may be called a baseline.
6. **Round-0 human gate.** Bring Destin the ranked card list in §8. **No product code changes
   before he approves it.**
7. **Extend coverage** to the uncovered surfaces in §3: terminal, marketplace, sync, themes,
   buddy/multi-window.
8. **Thresholds.** A stress suite still needs a human to say "3.3 s is unacceptable, 200 ms
   is fine." Propose them from the baseline; **do not invent them.**

---

## 8. Experiment cards

**Two rules before any card.**

1. **`perf-reports/LEDGER.md` is the only authority on which cards may run** — and it does
   not exist yet (§5 correction 2). Until Destin approves a list, **no card may run**. A card
   described below is a *description*, not a permission.
2. **The baseline decides the order: attack the largest measured phase first.** Numbering is
   for reference, not priority.

### 8.1 The proposed list for the Round-0 gate

This is the replacement card list from status doc §4 item 6, in the order proposed there. It
is a proposal. **Destin has not seen it.**

| # | change | targets |
|---|---|---|
| **C1** | async + chunked transcript replay | the ~3.3 s app-wide freeze (§2.1) |
| **C2** | virtualize the timeline | multi-second renderer freeze; make render cost O(visible), not O(total) (§2.2) |
| **C3** | markdown + highlighting off the synchronous render path | per-message cost (§2.2) |
| **C4** | restore containment without clipping theme glows | offscreen work is never skipped — **a product tradeoff; Destin decides, not a session** (§2.2) |
| **C5** | unmount hidden sessions' ChatViews | "worse with more sessions" — PSS 450 MB → ~2,730 MB (§2.3) |

Notes per card:

- **C1 absorbs the old E5.** E5's verified detail still applies in full — see 8.2.
- **C3** must respect §1 Retraction 2: the win is on **first mount** (a resume mounts every
  message at once) and on **streaming** (a growing bubble's `content` changes per token). It
  is *not* a win on unrelated re-renders, because `React.memo` already skips those.
- **C4 is paint-related.** §6h applies with force: Xvfb has no GPU, and the reason
  `content-visibility:auto` was removed in the first place is a *visual* one
  (`globals.css:801-806`). Numbers cannot settle this card.
- **C5** interacts with a deliberate decision: `ChatView.tsx:695-707` keeps hidden sessions
  mounted with `content-visibility: hidden` rather than `display:none` **for resize
  performance**. Unmounting them may trade one symptom for another. Measure resize, not only
  PSS.

### 8.2 Cards carried over from the old E-list — still relevant

Every one below was re-verified against the `perf/optimization-pass` worktree on 2026-08-26.
**Line numbers move — always re-grep the symbol before editing.**

#### E4 — Tail-read `loadHistory` for small counts

**Target:** `history.huge.ipcLast10Ms` · **Status:** premise holds.

`session-browser.ts:660` is `export async function loadHistory(` with
`(sessionId, projectSlug, count = 10, all = false)`. It reads the whole file even for
`count = 10` — `session-browser.ts:671`,
`content = await fs.promises.readFile(jsonlPath, 'utf8')`. Note it is **already async**
(`fs.promises`), so this card is about bytes read, not about blocking the main thread.

The fix: read the last ~256 KB, parse from the last full newline, extend backwards until
`count` messages are found.

**Two semantics a tail-read must preserve, or it returns the wrong conversation:**

- **Dedup by uuid, last occurrence wins** — `session-browser.ts:680-688`
  (`lastParsedByUuid.set(parsed.uuid, parsed)`). Claude Code rewrites same-uuid lines as
  assistant text grows, so a tail-read can miss an earlier line whose uuid is rewritten
  later, or the reverse.
- **`messages.slice(-count)` at `session-browser.ts:720` is applied after dedup and
  filtering**, so N transcript lines is not N messages. A naive byte-tail must over-read and
  re-check.

Add a vitest with a duplicated uuid straddling the tail boundary. Real caller chain:
`ipc-handlers.ts:1619` → `App.tsx:2405`.

#### E5 — Async + cached transcript replay → **folded into C1**

**Target:** `history.huge.resumeStableMs`, plus the new
`replayStall.medium.median.mainProcessStallMaxMs` · **Status:** premise holds; this is the
verified detail behind C1.

`transcript-watcher.ts:451-488`, `getHistory(desktopSessionId)`, is still fully synchronous:
`fs.existsSync` at `:463`, `raw = fs.readFileSync(session.jsonlPath, 'utf8')` at `:465`, then
a full `raw.split('\n')` with `parseTranscriptLine` per line (`:467-470`). **No cache
exists** — the only `cache*` identifiers in the file are `cacheReadTokens` /
`cacheCreationTokens` (`:223-224`), unrelated token counters. Caller: `ipc-handlers.ts:2489`.

Make it async and cache the parsed result keyed by `(path, size, mtimeMs)`, invalidated by
the existing incremental tail.

**Constraint the cache must respect:** a fresh `SubagentIndex()` and a fresh `seenUuids` set
are rebuilt on every call (`:455`, `:462`), and the comment at `:455` says why — *"Fresh,
throwaway index so replay doesn't corrupt live correlation"*. A cache that shares that index
across calls will corrupt live subagent correlation. **Cache the parsed events, not the
index.**

#### E6 — Renderer code-splitting

**Target:** `startup.median.appMounted` and `idle.pssMb.median` · **Status:** premise holds
completely. Nothing named is split and the config is bare.

`vite.config.ts` (43 lines) has **no `manualChunks` and no `rollupOptions`** — its whole build
block is `build: { outDir: '../../dist/renderer' }`. All five components are statically
imported in `App.tsx`: `GamePanel` (`:20`), `SettingsPanel` (`:52`), `ResumeBrowser` (`:53`),
`MarketplaceScreen` (`:62`), `ProjectView` (`:68`).

**Reuse the existing precedent rather than inventing one.** The artifact viewers are already
lazily loaded — `components/artifact-views/RendererRegistry.ts:18,22,23,24` (`PdfView`,
`CodeEditorView`, `DocxView`, `XlsxView` via `lazy(() => import(...))`), with a purpose-built
`ViewerErrorBoundary.tsx` for chunk-load failure. Copy that shape **including the error
boundary** — a failed chunk load must not be a blank screen.

**Preload the chunks during idle after `sessions-listed`** so first open never shows a
spinner. The `settings-open` screenshot must come out identical.

Aimed at the right region: `modulesEvaluated` is ~951 ms from spawn and the
bundle-evaluation cost is `modulesEvaluated − documentStart` (~247 ms in the surviving
report). But note the ceiling: total boot is ~1 s, so this card competes with C1–C5 for a
much smaller prize.

#### E7 — Unmount the always-mounted settings drawer

**Target:** `idle.pssMb.median` · **Status:** code premise holds; the plan's `ROADMAP:409`
citation is stale — drop it.

The drawer really is always mounted. `App.tsx:3170` renders
`<SettingsPanel open={settingsOpen} …>` with **no `&&` guard**, unlike its neighbours.
`SettingsPanel` (`SettingsPanel.tsx:185`) has **no top-level `if (!open) return null`** — the
`if (!open) return null;` at `:159` belongs to the nested `ShortcutsPopup` (`:158`), a
different component; do not be fooled by it. The drawer is hidden by transform only
(`SettingsPanel.tsx:237-239`, `open ? 'translate-x-0' : '-translate-x-full'`), and the entire
body including `<DesktopSettings open={open} …>` mounts unconditionally at
`SettingsPanel.tsx:280`. Only the scrim is gated (`scrimVisible`, `:203`, used `:209`).

**Do not lump the siblings in — they are already gated.** `ResumeBrowser` self-gates at
`ResumeBrowser.tsx:718`; `MarketplaceScreen` is guarded by `App.tsx:3316`.

**ROADMAP correction.** `ROADMAP.md` lives in the workspace repo, not the worktree. Line 409
is an unrelated **done** item about auditioning sound presets. **There is no open ROADMAP
item asking to unmount the settings drawer.** The nearest live perf item is `ROADMAP.md:315`
("Window-resize lag has a SECOND cause, unidentified", `#perf`) — cite that, and delete the
`ROADMAP:409` reference wherever you find it. Keep the open-state transition identical; the
`settings-open` screenshot must not move.

**This same always-mounted transform trick is why the screenshot gate went blind once** — see
§8.4.

#### E8 (rewritten) — Find which switch step blocks, then fix that one

**Target:** `workload.median.probe.longtaskTotalMs` · **Status:** **the card as originally
written is dead** — the memoization it proposed already exists, and the reducer it proposed
to batch is not on the render path. What survives is the *measurement* instruction.

Verified against `App.tsx` (3,658 lines, five `useMemo` sites):

- **The session-status derivation is already memoized** — `App.tsx:768`,
  `const sessionStatuses = useMemo(…)` with deps `[sessionAttention]`, fed by
  `useSessionAttention(...)` at `:767`. The other memos are `gameConnection` (`:753`) and
  `settingsDangerBadge` (`:1896`).
- **"Batch reducer dispatches" has no target.** Chat state is deliberately kept off the
  render path via `chatStateMapRef` plus a store subscription (documented at
  `App.tsx:2536-2539`), and the session list is plain `useState` (`App.tsx:176`) — there is
  no reducer behind it at all.

**What the un-memoized work actually is:** repeated linear scans over `sessions` on every
render — `App.tsx:2526` (`const currentSession = sessions.find((s) => s.id === sessionId);`)
and the same pattern at `:507`, `:1921`, `:2470`, `:3221`. Plus the per-session render
fan-out at `App.tsx:2815` (`{sessions.map((s) => (`), which mounts one `<ChatView>` per open
session, so **every** session stays mounted across a window switch — the same fact C5
attacks.

**Do not implement the card's original fixes.** Instead: use the probe's `longtask`
timestamps against its `mark` entries to find *which* switch step blocks, then fix that.
Related work already landed: commit `81c9562d`, `ChatView.tsx:706` ("take inactive sessions
out of layout during resize").

### 8.3 Dropped cards — and the measurement that killed each

**Do not resurrect these without new measurement.** Each was killed by a number, and the
number is stated so a future session does not re-propose it from stale prose.

| card | what it proposed | killed by |
|---|---|---|
| **E1 — window before chores** | move `createWindow()` ahead of the boot chores | **The measurement.** E1 existed to attack a multi-second gap between window creation and painted content. That gap is **~356 ms**, and the earlier ~3,330 ms figure was the rig artefact in §1 Retraction 1. The chores it would skip past are worth **~29 ms in total**. Nothing to win. |
| **E2 — parallelize independent chores** | `Promise.all` over `reconcileMcp()`, `remoteServer.start()`, `startAnnouncementService()` | **~29 ms.** All 16 boot chores together cost ~29 ms out of a ~1 s boot — under 3%, and a perfect result is invisible. Also partly stale on its own terms: `startAnnouncementService()` is **already** fire-and-forget (`main.ts:1507`, not awaited) and is the `network` chore that must never be ranked; and the plan's "sync cleanups wrapped in `setImmediate`" do not exist — there is exactly one `setImmediate` in `main.ts` (line 2025, the legacy slug-symlink sweep) and it runs *after* window creation. The genuinely parallelizable set is `{ reconcileMcp, remoteServer.start }`, together ~0–1 ms. |
| **E3 — defer the chatsearch startup scan** | move `startChatsearchIndex()` out of the boot path | **Its premise is already false.** Its only caller is `main.ts:2039`, which is **after** `createWindow` (`main.ts:1583`) and five lines before `main:post-window:done` (`main.ts:2044`). It is already deferred past window creation and is not blocking first paint. (The scan itself kicks off at `chatsearch-index/index-service.ts:277`, `void refreshFromLiveState()`, worker at `:182`.) The residual claim — that it still shares the same `whenReady` continuation and competes with the renderer's first load — is real but far smaller than the card, and `postWindowDone` is `network`-contaminated by the release check, so it could only ever be judged on `idle.cpuPct.median`. |

The general lesson these three share: **all of them targeted startup, and startup turned out
to be about one second end to end.** The two large reproducible costs are both in the
renderer and the main process *under load*, not at boot.

### 8.4 Two rig bugs worth remembering when you write a new card

Both reported success while measuring nothing, and both were found by **opening the PNG**,
not by reading the report.

- **`welcome.png` was a blank dark rectangle** — 4,515 bytes against 142,372 for a real
  screen. Captured the moment the boot marks landed, well before first contentful paint. Worse
  than a missing shot: a blank image compares equal to the *next* run's blank image, so the
  gate reports `pass` and one of five screens is silently unwatched forever. `capture()` now
  refuses to save a frame before first-contentful-paint plus non-trivial visible text.
- **The Settings drawer was stuck open across two screens.** The open/closed check tested
  whether `[aria-label="Close settings"]` **exists** — but `SettingsPanel` is always mounted
  and merely translated off-screen (E7), so the query matched whether the drawer was open or
  shut and the scenario reported `{opened: true, closed: false}` on every run regardless of
  reality. Now measured from on-screen position.

---

## 9. When numbers look wrong

Most of what goes wrong here produces a *plausible* number rather than an error. Work through
this list before you believe a surprising result.

### Failures that announce themselves

**The noise gate refuses / the run stalls before booting.** The rig will not take official
numbers unless the 1-minute load average is under 4 and the machine is under 10% busy over
3 s. It waits 30 s and retries up to 5 times, counting every discard into the report. Fix it
by leaving the machine idle (§4). **Do not lower the gate.** If `discardedRuns` is non-zero,
say so when you report the result.

**A `—` in the Markdown summary, or `null` in the JSON.** Most often *a timing mark
disappeared*, because someone moved or renamed the code the mark sat next to. Run the pinning
tests:

```bash
cd /home/destin/youcoded-dev/worktrees/perf-lab/desktop
npx vitest run tests/perf-marks-*.test.ts
```

(three files: `perf-marks.test.ts`, `perf-marks-placement.test.ts`,
`perf-marks-renderer.test.ts`). A failure names the mark you broke. **Exit 4 from `run.mjs`
is the same problem caught by the rig itself**: it validates its report against
`compare.mjs`'s `PRIMARY` list and refuses to exit 0 when a metric a requested phase owed came
back missing — **or came back with a median but no per-run samples behind it**, which would
make the spread look like 0% and let pure jitter through the gate as a proven win.

**Non-zero ERROR lines.** The report counts `"level":"ERROR"` lines in each boot's
`desktop.log`:

```bash
ls /home/destin/youcoded-dev/scratch/perf-lab/logs/
grep '"level":"ERROR"' /home/destin/youcoded-dev/scratch/perf-lab/logs/<stem>-<boot>.log
```

**An erroring boot is not a baseline and not a candidate.**

**Native session never produces a first token.** Same logs. The local engine (llama-server)
runs on port **10020** in the fixture. **The model is Qwen2.5-0.5B-Instruct Q4_K_M** (~470 MB,
32,768-token context, real chat template) with the fixture's `contextSize` at 16384
(`fixture.mjs:45`, `:460`) — **not** the plan's `stories260K.gguf`, which could never answer:
its GGUF metadata caps context at 2,048 tokens while the app's agent system prompt alone
measures **4,244 tokens**, so every native send returned *"context size (2048 tokens), try
increasing it (provider error 400)"* rendered into the chat pane. It was also a
story-completion toy with no chat template — wrong shape twice over. Engine and model
provision into `scratch/perf-lab/assets/` on first use, from the version and sha256 pinned in
the app's own `engine-pin.ts`.

**A native failure must not cost you the other metrics.** The workload journey once timed the
native first token *before* its switching, streaming and CPU sampling, so when the native leg
threw, `switchP95Ms`, `probe.longtaskTotalMs`, `pssAfterMb` and `cpuDuringPct` were all lost
with it. The native leg is now non-fatal — its timings go `null` and `nativeFailure` quotes
what the pane actually showed. **Keep it that way in any scenario you write: an optional leg
must never be able to abort a mandatory measurement.**

**Something is already on :9555.** `launch.mjs` sweeps rig-owned processes first and then
**refuses to attach** if something it does not own is still answering. Find out what it is
(`ss -ltnp | grep 9555`). If it is a leftover from a killed run it matches a
`scratch/perf-lab` or `worktrees/perf-lab` path and the next sweep clears it. **If it is
anything else, do not kill it blindly** — Destin's live app must never be signalled.

**A run hangs.** `cdp.mjs` now rejects every in-flight request when its CDP target dies, so
this should fail loudly (verified: the same request rejects in 810 ms). If it still hangs,
`--max-minutes` kills the process family and exits 3.

### Traps that produce believable but wrong numbers

These are the dangerous ones. Each has already bitten this project once.

**A stale build.** The rig skips the build when the tree fingerprint is unchanged. That
fingerprint (`build.mjs → treeFingerprint`) is `HEAD` sha + a hash of `git status --porcelain`
+ `git diff HEAD` + the contents of untracked files. It therefore **does not see**: a change
to `node_modules` (an `npm ci`, an upgraded dep), a change to a **gitignored** file, or a
content edit inside an untracked *directory* that already existed. Force it with
`--force-build`. **When in doubt, force** — a wasted 2-minute build is cheaper than a wasted
40-minute run.

**Marks that measure something other than their name.** Two `*-start` marks originally fired
at module *end*, not module start — ESM hoists imports above every statement, and the
CommonJS emit puts all 46 `require()` calls above the first line of the body. The whole
bundle-evaluation cost sat *outside* the instrumented window while the mark name claimed the
opposite, and the rig could not detect it. They are now named for what they measure
(`yc:modules-evaluated`, `main:imports-done`), and `documentStart` was recovered for free
because `performance.timeOrigin` IS the page's navigation start. **If you add a mark, name it
after the instant it actually fires**, and pin it in `tests/perf-marks-placement.test.ts`.

**Chore durations that include work belonging to no chore.** Every `chores.*` number is
derived as `mark[n] − mark[n−1]`, so *everything* between two marks is charged to the later
chore. Three gaps once carried substantial foreign work (`installHooks` was also paying for
analytics, `getGPUInfo` and first-run detection). Two extra marks (`main:chore:prelude:done`,
`main:chore:ipc-prefs:done`) fixed the known cases. **The order of the chore list is
load-bearing:** if you reorder chores, `chores.*` attribution changes meaning even where the
code did not. **This is the one error class the source-pinning tests structurally cannot
catch.**

**A "0.00%" screenshot pass.** The pixel diff rounds `pct` to two decimals, so anything under
~0.0128% of the frame (≈205 pixels at 1600×1000) reports `0.00` and passes. The raw
`differing` pixel count rides along — check it before calling a screen identical. Related: the
diff once passed a *resized* window because it padded mismatched dimensions with transparent
pixels and compared RGB only; it now compares alpha and returns `sizeMatch`.

**A screen that was never captured.** Screenshot failures do not abort the numeric phases —
they land in `screens.failures` and turn into exit 4. **A screen that was not captured is
UNREVIEWED, never "unchanged".** Never report it as fine. See §8.4 for the two times this bit.

**Selectors that silently count zero.** Three selector guesses in the original plan did not
exist in the app and would each have produced a plausible wrong number:

- there is **no `data-message-id` anywhere in the renderer** — timeline entries are
  `.chat-scroll .timeline-entry`, and the count **must exclude entries inside
  `[aria-hidden="true"]`** because a `ChatView` stays mounted for *every* open session, so a
  bare query sums every open conversation. Both facts are baked into the shared
  `MESSAGE_COUNT_EXPR` export in `scenario-history.mjs` — **import it, never re-type it**;
- `data-session-idx` is on the session pill (`SessionStrip.tsx:782`) **and** on the overflow
  dropdown rows (`:921`), and that dropdown lists *all* sessions — scope any query to
  `.session-strip`. Overflow is **width-driven, not count-driven**, so "6 sessions" does not
  imply overflow;
- `window.claude.native.listModels` does not exist. Model listing is
  `window.claude.providers.catalog()`, `window.claude.engine.models()`, or
  `window.claude.models.installed()`.

**If you add an in-page measurement, assert it is non-zero before trusting it.**

**`window.claude.session.switch(id)` does nothing on desktop.** It is a parity stub that
returns `{ ok: true }` and switches nothing. Timing it reports a ~0 ms switch that never
happened. The workload scenario drives `window.__perfLab.switchTo(...)` instead, which clicks
the real pill and reports `ok` only when the visible pane moved.

**Warm cache by construction.** History repeats 2..N read a file the OS page cache is already
holding. Those are warm-cache costs, not cold-disk costs. Do not present them as first-open
latency.

**Network-bound phases are not code cost.** `chores.announcements` (a GitHub fetch at boot)
and `postWindowDone` (the release check lives inside it) move with WiFi. The report lists them
under `network`. **Never rank them, and never claim a win on them.**

**No GPU.** Repeated because it matters: every paint number on this rig comes from software
rasterisation. See §6h.

**Never take numbers from dev mode.** `main.ts` picks `loadFile` vs the Vite dev URL on
`app.isPackaged`, and dev mode loads hundreds of unbundled modules. Its startup numbers are
fiction. `run-dev.sh` is for Destin's eyes only, never for a number.

**The main checkout's `node_modules` is stale.** `youcoded/desktop/node_modules` was missing
`zod`, `ulid`, `diff`, `@codemirror/*` and more, so `npx tsc --noEmit` reported 135 errors on
**master**. The perf worktree was fixed with its own `npm ci`. If you ever typecheck or build
`youcoded/desktop` **directly**, run `npm ci` there first. **Never symlink or junction
`node_modules` between worktrees** — `npm ci` follows the link and empties the shared copy.

**Look at the artifact, not just the report.** Stated as its own rule because the rig has
twice reported success while measuring nothing (§8.4), and neither case was findable from the
report.

**Run the rig's own unit tests with the glob, not the directory:**

```bash
node --test scripts/perf-lab/tests/*.test.mjs
```

`node --test scripts/perf-lab/tests/` **fails on this Node** (26.4.0) with a bare
`'test failed'` — it tries to `require()` the directory. A bare `node --test` from the
workspace root recurses into the sub-repos' `node_modules` and hangs. `run-report.test.mjs`
is the one to keep green above all others: it asserts every `compare.mjs` `PRIMARY` path
resolves **and has samples behind it**, and it is the only thing standing between you and a
keep/reject gate that has quietly gone blind.

---

## 10. Reports you may and may not trust

- **`scratch/perf-lab/discarded/`** — everything measured before the fake-`claude` fix. It
  measured the rig, not the app. **Nothing may be baselined against it.**
- **`perf-reports/2026-08-27-0702-4256ade-repeat-a.json`** — the one surviving complete
  report. Its `_provenance` block says it plainly: **plain-prose content**, taken before the
  realistic-content switch and the `huge` recalibration, therefore **not comparable to any
  report produced after commit `9060b0d`**. It is a **floor**, not a baseline. Real
  conversations contain syntax-highlighted code, diffs and tool cards, all of which cost more.
- **The first run of either new scenario** — a shakedown (§3.4), not a baseline.

There is currently **no valid Round-0 baseline.** Producing one (§7 item 5) is work that has
not been done.

---

## 11. Finishing an optimization pass

When Destin's approved list is exhausted, or he tells you to stop, or you hit the
eight-experiment budget:

1. **Rebase onto current master.**

   ```bash
   cd /home/destin/youcoded-dev/youcoded && git fetch origin
   cd /home/destin/youcoded-dev/worktrees/perf-lab
   git rebase origin/master
   ```

   Every kept commit must survive intact, with its before/after numbers still true of what
   the commit now contains.

2. **Re-measure the whole branch once more, seven runs.**

   ```bash
   cd /home/destin/youcoded-dev
   node scripts/perf-lab/run.mjs --runs 7 --label final
   ```

   Seven, not five — this is the number that goes in the PR and it must carry a real spread.
   Machine idle. Raise `--max-minutes` if it aborts with exit 3.

3. **Confirm the branch still wins** against the **Round-0 baseline**, not the last
   intermediate, once per kept target:

   ```bash
   node scripts/perf-lab/compare.mjs perf-reports/<round-0-baseline>.json perf-reports/<...-final>.json --target <target of kept experiment>
   ```

   Every kept target must still improve and **no PRIMARY metric may regress**. If a target no
   longer wins after the rebase, **say so in the PR body** — do not quietly drop it and do not
   re-run hoping for a better sample.

4. **Generate the PR body from `perf-reports/LEDGER.md`.** Fixed mapping:

   | Ledger rows | PR section |
   |---|---|
   | verdict `KEEP` | **Changes** — one line each, with the target metric and Δ% |
   | verdict `REJECT` | **Tried and reverted** — the idea, the number it produced, why it failed the gate |
   | tagged `ux-bugfix` | **Needs Destin's eyes** — link the PNG pair under `perf-reports/review/` |
   | Round-0 baseline + final report filenames | **Evidence** |

5. **Open the PR** on `itsdestin/youcoded` from `perf/optimization-pass` into `master`.
   **Opening a PR needs Destin's confirmation first** (CLAUDE.md) — ask, then open.

6. **STOP. Do not merge.** Not after CI goes green, not if it looks obviously fine, not if
   Destin said the experiments were good. Merging is a separate decision he makes with the PR
   in front of him.

Also commit and push the workspace-side artifacts to `youcoded-dev`: every
`perf-reports/*.json` and `*.md` report, the `LEDGER.md`, any `perf-reports/review/` PNG
pairs, and this manual. `perf-reports/shots/` is gitignored and stays that way.

**Remember what "finishing" now means.** The optimization pass is one output. The
**suite** — every surface in §3 covered by a scenario that runs from one command — is the
deliverable Destin asked for.

---

## 12. Machine state as of 2026-08-27

- Worktree `worktrees/perf-lab` on `perf/optimization-pass`, 4 commits ahead of
  `origin/master`, **not pushed**.
- Workspace `master` has ~30 commits, **not pushed**.
- 168 rig unit tests pass; `bash scripts/verify.sh perf-lab` is green.
- A session-long `systemd-inhibit` (`who=claude-perf-session`) may still be holding the
  machine awake — kill it when done: `pkill -f 'who=claude-perf-session'`.
- Xvfb may still be running on `:99`. Harmless; `startXvfb` reuses it.
