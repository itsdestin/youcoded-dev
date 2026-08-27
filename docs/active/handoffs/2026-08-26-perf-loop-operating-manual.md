---
title: Perf loop — operating manual for the autonomous session
status: draft
date: 2026-08-26
plan: docs/active/plans/2026-08-23-perf-lab-and-optimization-loop.md
corrections: docs/active/investigations/2026-08-26-perf-lab-plan-corrections.md
---

# Perf loop — operating manual

You are the session that runs the optimization loop. The rig is already built. Your job
is: take one approved experiment card, change the app, re-measure, keep or revert, write
it down. Repeat until the approved list runs out. Then open one PR and stop.

**This document is your whole context.** Everything you need to execute is here or one
click away in the three files below. Read all three before your first experiment.

| File | What it is | When you need it |
|---|---|---|
| `scripts/perf-lab/README.md` | **Operator reference for the rig** — every flag, every metric's meaning, environment/ports table, known limits | Before touching `run.mjs`. This manual deliberately does **not** repeat it |
| `perf-reports/LEDGER.md` | The run log, and **the only authority on which cards you may run** (Destin's approved list is at the top) | Every experiment, start and end |
| `docs/active/investigations/2026-08-26-perf-lab-plan-corrections.md` | Eleven verified places where the original plan was wrong about this machine | When something in the plan contradicts this manual — the corrections win |

Two paths you will type constantly:

- Workspace root: `/home/destin/youcoded-dev` — the rig, the reports, the ledger. Run every rig command from here.
- Product worktree: `/home/destin/youcoded-dev/worktrees/perf-lab` — branch `perf/optimization-pass`. **Every app code change goes here and nowhere else.**

---

## 1. Non-negotiables

The following is the **Global Constraints** section of the plan, reproduced verbatim.
Parts of it have been overtaken by events. **Read the three corrections immediately after
it — they supersede the text above them.** Everything not corrected is binding.

- **Live-app safety (overrides everything):** the rig NEVER touches the real `~/.config/youcoded`, `~/.claude`, `~/.youcoded`, or any running YouCoded process. Every launch uses `HOME=<fixture>` and `YOUCODED_PORT_OFFSET=100` (remote 10000, engine 10020 — clear of built 9900/9920 and dev 9950/9970). Process discovery is by fixture path, never by app name.
- **No `YOUCODED_PROFILE`.** A profile makes `main.ts:1339` skip the install-hooks chore that every real launch runs, so the rig would measure a boot no user gets. `HOME` alone isolates userData (`<fixture>/.config/youcoded`), the hook socket is per-process (`main.ts:191`), and the port offset moves every port — the profile adds nothing but a blind spot.
- **Measure what the user gets:** the fixture turns remote access ON (`<fixture>/.claude/youcoded-remote.json`, default is off) so the remote-server chore is real, not ~0.
- **Network-bound phases are flagged, never ranked as code cost:** `announcements` (GitHub fetch at boot, `announcement-service.ts:76`) and the release check (`ipc-handlers.ts:1716`) vary with WiFi. Reports carry them; the findings doc marks them `network`.
- **Xvfb has no GPU.** Anything paint-heavy is measured on a slow software path, so rankings of renderer-paint work can be backwards. Any experiment touching paint/blur/animation/compositing REQUIRES an on-screen spot-check by Destin before it counts — flag it, don't script it (CLAUDE.md: final-stage visual verification is his).
- **Blank window is a hard-reject metric:** `startup.blankWindowMs` = first contentful paint − window creation. The window is created visible today (`main.ts:612`); an experiment that shows it earlier but paints later makes the user stare at a blank box longer, and settled screenshots can't see that.
- **Repetition everywhere a number can veto:** cold start ×5 (7 for baseline), history ×5 inside one boot, workload ×3 inside one boot. `compare.mjs` reads the spread from those runs for every PRIMARY metric.
- **Budget:** a rig run aborts after `--max-minutes 45`; an autonomous session runs at most 8 experiments before reporting; the loop ends when Destin's approved card list is exhausted.
- **No official numbers from dev mode.** Every reported number comes from `release/linux-unpacked/youcoded` (packaged; `app.isPackaged === true`).
- **Zero visible UX/UI change** in product code. Screenshot parity gate rejects any pixel diff > 0.05% unless the ledger entry is tagged `ux-bugfix` for Destin's review.
- **Product changes stay cross-platform** (Windows/macOS/Linux). Rig may be Linux-only.
- **One PR.** All product work on `youcoded` branch `perf/optimization-pass`, worktree `worktrees/perf-lab/`. One commit per kept experiment, before/after numbers in the message.
- **Ship gates per experiment:** `bash scripts/verify.sh perf-lab` green → rig run → keep only if target metric median improves ≥ 5% AND beyond baseline spread AND no other primary metric regresses > 3% AND screenshots match. (Thresholds are Destin's to change; defaults chosen at plan time.)
- **Two human gates:** (1) after Round 0, the ranked findings + proposed experiment cards go to Destin, who approves/vetoes/reorders before any product code changes; (2) any `ux-bugfix` PAUSES the loop — the session reports the diff PNGs and waits, it does not carry the branch forward on top of a visible change.
- **Reports are JSON; screenshots are not committed** except the baseline set and any `ux-bugfix` pair under `perf-reports/review/`. `perf-reports/shots/` is gitignored.
- **Every non-trivial product edit carries a WHY comment** (Destin reads code through comments).
- **Node built-ins only** in `scripts/perf-lab/` — the workspace root has no `package.json` and must not gain one.
- Fixed constants (use exactly): profile `perf`, CDP port `9555`, diff-engine Chrome CDP port `9556`, Xvfb display `:99` at `1600x1000x24`, fixture root `<workspace>/scratch/perf-lab/` (gitignored via `scratch/`), perf log `<fixture>/perf-marks.jsonl`.

### Corrections that supersede the block above

**1. Xvfb needs no sudo, and the "Destin installs Xvfb" prerequisite is void.**
The plan (Task 0, Step 1) made a `sudo pacman -S --needed xorg-server-xvfb` by Destin a
hard prerequisite. On this machine that install **failed** — the local package DB still
listed `21.1.23-1.1` while the repos had moved on, so every mirror 404'd. It was never
needed. The rig vendors its own Xvfb, extracted into a user prefix with no root:

```
scratch/perf-lab/assets/xvfb-prefix/usr/bin/Xvfb
```

`resolveXvfbBin()` in `scripts/perf-lab/launch.mjs` resolves in this order: `$XVFB_BIN`
→ `Xvfb` on `PATH` → the vendored copy. So a real system install silently takes over if
one ever lands, and nothing here changes when it does. **Never ask Destin for sudo to run
the rig.** (`xdpyinfo` does need to be on `PATH`; it already is.)

**2. There is no `perf` profile — there is no Electron profile at all.**
The fixed-constants bullet says "profile `perf`". Ignore that one word. The rig
deliberately leaves `YOUCODED_PROFILE` **unset**, because a profile makes `main.ts` skip
the install-hooks chore that every real launch runs — the rig would then be measuring a
boot no user ever gets. Isolation comes from `HOME` pointing at the fixture plus
`YOUCODED_PORT_OFFSET=100`. **Everything else in that bullet still stands exactly as
written:** CDP `9555`, diff-engine Chrome `9556`, Xvfb `:99` at `1600x1000x24`, fixture
root `<workspace>/scratch/perf-lab/`, perf log `<fixture>/perf-marks.jsonl`
(`fixture.mjs:342`).

**3. The line numbers inside that block predate the instrumentation commits.** The four
`perfMark` commits on `perf/optimization-pass` shifted `main.ts` by tens of lines. The
*claims* still hold; the *citations* have moved. Re-checked on 2026-08-26 against
`worktrees/perf-lab`:

| As written in the block | Current | Claim still true? |
|---|---|---|
| `main.ts:1339` — a profile skips install-hooks | **`main.ts:1371`** (`if (!process.env.YOUCODED_PROFILE) {`), log at `:1394` | yes |
| `main.ts:191` — the hook socket is per-process | **`main.ts:208`** (`claude-desktop-hooks-${process.pid}.sock`) | yes |
| `main.ts:612` — the window is created visible | still `main.ts:612` (`new BrowserWindow({`), `show:` at `:626` | yes |

Treat every line number in this manual the same way: **grep the symbol, do not trust the
number.**

Everything else in the Global Constraints block is current and binding.

---

## 2. Per-experiment procedure (the loop)

Run these steps in order, every time, for every card. Do not skip a step because the
change "is obviously safe" — the whole point of the rig is that intuition about
performance is wrong roughly half the time.

### a. Take the next approved card

Take the next card from **Destin's APPROVED list at the top of `perf-reports/LEDGER.md`**.
Never run a card that is not on that list, and never reorder it yourself — he set the
order at the Round-0 gate. Add a new row to the ledger table before you touch any code:

```
| <n> | 2026-MM-DD | E<k> <short name> | <target metric path> | <one-line hypothesis> | — | — | running | — |
```

### b. Make the change

In `worktrees/perf-lab` only. Rules that apply to every edit:

- **Every non-trivial edit carries a WHY comment.** Destin reads code through comments.
- **Product code stays cross-platform** — Windows, macOS, Linux. The rig may be Linux-only; the app may not.
- **Zero visible UX/UI change.** If your change alters what the user sees, it is not a perf experiment, it is a product change, and it needs Destin (see step g).

### c. Gate on `verify.sh`

```bash
cd /home/destin/youcoded-dev
bash scripts/verify.sh perf-lab
```

Must exit 0. This runs `tsc --noEmit`, `knip`, `eslint`, `vitest related` on your changed
files, and the ast-grep invariant scan against the worktree. **Fix it or abandon the card
— never skip it and never measure a red tree.** `--full` forces the whole test suite
(E1 asks for this explicitly). Note the scope it prints on exit: this covers
`youcoded/desktop` only.

### d. Measure

```bash
node scripts/perf-lab/run.mjs --runs 5 --label exp-<n>
```

Run from the workspace root, on an idle machine, with nothing else of yours running. It
builds if the tree changed, boots the packaged app 5 times cold, runs one scenario boot
for history + workload + screenshots, and writes
`perf-reports/<date>-<time>-<sha7>-exp-<n>.{json,md}`. It aborts itself at
`--max-minutes 45` (exit 3). A run takes roughly 30–45 minutes.

**Exit codes matter here.** 0 = clean report. 2 = something failed. 3 = over budget. 4 =
the report is missing numbers a requested phase owed — the report is written but stamped
`incomplete`, and **you must not rank or judge anything from it**. Anything but 0 means go
to section 3, not to step e.

**Never start two rig runs at once.** They fight over CDP port 9555, the fixture HOME and
the Xvfb display, and both results are then garbage.

### e. Judge

```bash
node scripts/perf-lab/compare.mjs perf-reports/<baseline>.json perf-reports/<...-exp-<n>>.json --target <metric path>
```

`<baseline>` is the Round-0 baseline for your first experiment, and thereafter **the last
KEPT report** (see step f). `--target` is the card's target metric path, exactly as the
card writes it. Exit 0 = KEEP, exit 1 = REJECT; the verdict line and the reasons print to
stdout.

The KEEP rule, as `compare.mjs` actually implements it (`verdict()`), is all four of:

1. the target improved by **≥ 5%** (`improveMinPct`), **and** that delta is **larger than
   the baseline's own run-to-run spread** on that same path — a win inside the noise band
   is not a win;
2. **no other** metric in `PRIMARY` regressed by more than **3% plus its own spread**;
3. **every screenshot comparison passed** (unless you pass `--ux-bugfix`, which is step g,
   not a shortcut);
4. the candidate logged **no more `desktop.log` ERROR lines than the baseline**.

Any single failure is a REJECT and the reason is printed. Do not argue with it, and do not
re-run hoping for a better sample.

### f. Keep or revert

**KEEP** — commit exactly one commit for this experiment, in `worktrees/perf-lab`, with
the before/after numbers in the message:

```
perf(<area>): <what changed> — <target> <base>→<cand> (<Δ%>), screens ok
```

Update the ledger row: fill `base → cand (Δ%)`, `screens`, verdict `KEEP`, and the commit
sha. **This report is now the baseline for the next experiment.** You may delete
`perf-reports/shots/<older stems>/` you no longer need — they are untracked working files
— but never delete a `.json` or `.md` report.

**REJECT** — revert completely, in the worktree:

```bash
cd /home/destin/youcoded-dev/worktrees/perf-lab
git checkout -- . && git clean -fd
```

Record the numbers and the reason in the ledger row (verdict `REJECT`). A rejected idea is
data, not failure — write down what it actually cost. **Never retry the same idea with a
tweak more than once.** Two attempts and it is done; move to the next card.

### g. A screenshot differs — STOP

If a screenshot comparison fails and you believe the difference is an **obvious bug fix**
rather than a regression:

1. tag the ledger row `ux-bugfix`;
2. copy the baseline and candidate PNG pair to `perf-reports/review/exp-<n>/`;
3. commit **only** the ledger row and the review PNGs;
4. **STOP THE LOOP.** Report to Destin with the two images and wait for his answer.

Do not run the next card on top of a visible change. Do not silently keep one. Do not
decide for yourself that a visible difference is fine. The screenshot gate exists because
a metric cannot see the screen.

### h. Paint-related cards need Destin's eyes before KEEP

Anything touching blur, animation, compositing, CSS effects or GPU-accelerated paint:
**the rig's numbers may rank backwards.** Xvfb has no GPU, so everything renders through
software rasterisation, and removing a `backdrop-filter` can look like a win here and be
invisible or a loss on Destin's actual hardware.

Before you KEEP such a card, stop and ask him for a 30-second on-screen look:

```bash
bash scripts/run-dev.sh perf-lab --label "Perf: <card>"
```

His eyes decide, not the number. **Do not script the visual check** — CLAUDE.md is
explicit that final-stage visual verification is his, and building a rig for it wastes a
session. Shut the dev instance down when he has answered.

### i. Budget

**At most 8 experiments per session.** After the 8th — or when the approved list is
exhausted, whichever comes first — write a session summary at the bottom of `LEDGER.md`
(what was kept, what was rejected, what is still open, the current baseline report
filename) and stop. Do not start a ninth.

---

## 3. When numbers look wrong

Most of what goes wrong here produces a *plausible* number rather than an error. Work
through this list before you believe a surprising result.

### Failures that announce themselves

**The noise gate refuses / the run stalls before booting.** The rig will not take official
numbers unless the 1-minute load average is under 4 and the machine is under 10% busy over
3 s. It waits 30 s and retries up to 5 times, counting every discard into the report. Fix
it by leaving the machine idle — close your own builds, your dev servers, your browser
tabs. Do not lower the gate. Every accepted run's worst load/busy reading is in the
report's `noise` block; if `discardedRuns` is non-zero, say so when you report the result.

**A `—` in the Markdown summary, or `null` in the JSON.** A `—` means the value was
missing or non-finite — most often *a timing mark disappeared*, because someone moved or
renamed the code the mark sat next to. The marks are pinned by tests; run them:

```bash
cd /home/destin/youcoded-dev/worktrees/perf-lab/desktop
npx vitest run tests/perf-marks-placement.test.ts tests/perf-marks-renderer.test.ts tests/perf-marks.test.ts
```

(equivalently `npx vitest run tests/perf-marks-*.test.ts` — the three files are
`perf-marks.test.ts`, `perf-marks-placement.test.ts`, `perf-marks-renderer.test.ts`.) A
failure there names the mark you broke. Exit 4 from `run.mjs` is the same problem caught
by the rig itself: the run validates its report against `compare.mjs`'s `PRIMARY` list and
refuses to exit 0 when a metric a requested phase owed came back missing — **or came back
with a median but no per-run samples behind it**, which would make the spread look like 0%
and let pure jitter through the gate as a proven win.

**Non-zero ERROR lines.** The report counts `"level":"ERROR"` lines in each boot's
`desktop.log`. Read the archived copies:

```bash
ls /home/destin/youcoded-dev/scratch/perf-lab/logs/
grep '"level":"ERROR"' /home/destin/youcoded-dev/scratch/perf-lab/logs/<stem>-<boot>.log
```

**An erroring boot is not a baseline and not a candidate.** Understand the error first. A
phase that logged errors must not be ranked, and `compare.mjs` will refuse a KEEP if the
candidate logged more errors than the baseline.

**Native session never produces a first token.** Same logs. Look for engine errors — the
local engine (llama-server) runs on port **10020** in the fixture and serves a 260K-param
toy model (`stories260K.gguf`). Both the engine and the model are provisioned into
`scratch/perf-lab/assets/` on first use, from the version and sha256 pinned in the app's
own `engine-pin.ts`. If the pin moved, the rig re-downloads; if the download failed you
will see it in the run's stderr, not in a timing number.

**Something is already on :9555.** `launch.mjs` sweeps rig-owned processes first, and then
**refuses to attach** if something it does not own is still answering — it throws with the
port number rather than measuring a stranger's browser. Find out what it is:

```bash
ss -ltnp | grep 9555
```

If it is a leftover from a killed run, it will match a `scratch/perf-lab` or
`worktrees/perf-lab` path and the next sweep clears it. **If it is anything else, do not
kill it blindly** — Destin's live app must never be signalled.

**A run hangs.** `cdp.mjs` now rejects every in-flight request when its CDP target dies,
so this should fail loudly. If it still hangs, `--max-minutes` kills the process family
and exits 3.

### Traps that produce believable but wrong numbers

These are the dangerous ones. Each has already bitten this project once.

**A stale build.** The rig skips the build when the tree fingerprint is unchanged. That
fingerprint (`build.mjs → treeFingerprint`) is `HEAD` sha + a hash of `git status
--porcelain` + `git diff HEAD` + the contents of untracked files. It therefore **does not
see**: a change to `node_modules` (an `npm ci`, an upgraded dep), a change to a
**gitignored** file, or a content edit inside an untracked *directory* that already
existed. If any of those happened, the "candidate" you just measured is the old binary
with a new label. Force it:

```bash
node scripts/perf-lab/run.mjs --runs 5 --label exp-<n> --force-build
```

When in doubt, force. A wasted 2-minute build is cheaper than a wasted 40-minute run.

**Marks that measure something other than their name.** Two `*-start` marks originally
fired at module *end*, not module start — ESM hoists imports above every statement, and
the CommonJS emit puts all 46 `require()` calls above the first line of the body. The
whole bundle-evaluation cost sat *outside* the instrumented window while the mark name
claimed the opposite, and the rig could not detect it. The marks are now named for what
they measure (`yc:modules-evaluated`, `main:imports-done`). **If you add a mark, name it
after the instant it actually fires**, and pin it in `tests/perf-marks-placement.test.ts`.

**Chore durations that include work belonging to no chore.** Every `chores.*` number is
derived as `mark[n] − mark[n−1]`, so *everything* between two marks is charged to the
later chore. Three gaps once carried substantial foreign work (`installHooks` was also
paying for analytics, `getGPUInfo` and first-run detection). Two extra marks
(`main:chore:prelude:done`, `main:chore:ipc-prefs:done`) fixed the known cases. **The
order of the chore list is load-bearing**: if you reorder chores (E1, E2 both do), the
`chores.*` attribution changes meaning even where the code did not, so read chore
comparisons across a reorder with suspicion and lean on the end-to-end metrics
(`sessionsListed`, `firstContentfulPaint`) instead. This is the one error class the
source-pinning tests structurally cannot catch.

**A "0.00%" screenshot pass.** The pixel diff rounds `pct` to two decimals, so anything
under ~0.0128% of the frame (≈205 pixels at 1600×1000) reports `0.00` and passes. The raw
`differing` pixel count rides along in the result — check it before calling a screen
identical. Related: the diff once passed a *resized* window because it padded mismatched
dimensions with transparent pixels and compared RGB only; it now compares alpha and
returns `sizeMatch`.

**A screen that was never captured.** Screenshot failures do not abort the numeric phases
— they land in `screens.failures` and turn into exit 4. **A screen that was not captured
is UNREVIEWED, never "unchanged".** Never report it as fine.

**Selectors that silently count zero.** Three selector guesses in the original plan did
not exist in the app and would each have produced a plausible wrong number: there is no
`data-message-id` anywhere in the renderer (timeline entries are
`.chat-scroll .timeline-entry`, and the count must exclude entries inside
`[aria-hidden="true"]` because a `ChatView` stays mounted for *every* open session);
`data-session-idx` is on the session pill **and** on the overflow dropdown rows, so scope
any query to `.session-strip`; `window.claude.native.listModels` does not exist. If you
add an in-page measurement, assert it is non-zero before trusting it.

**`window.claude.session.switch(id)` does nothing on desktop.** It is a parity stub that
returns `{ ok: true }` and switches nothing. Timing it reports a ~0 ms switch that never
happened. The workload scenario drives `window.__perfLab.switchTo(...)` instead, which
clicks the real pill and reports `ok` only when the visible pane moved.

**Warm cache by construction.** History repeats 2..N read a file the OS page cache is
already holding. Those are warm-cache costs, not cold-disk costs. Do not present them as
first-open latency.

**Network-bound phases are not code cost.** `chores.announcements` (a GitHub fetch at
boot) and `postWindowDone` (the release check lives inside it) move with WiFi. The report
lists them under `network`. **Never rank them, and never claim a win on them.**

**No GPU.** Repeated because it matters: every paint number on this rig comes from
software rasterisation. See step h.

**Never take numbers from dev mode.** `main.ts` picks `loadFile` vs the Vite dev URL on
`app.isPackaged`, and dev mode loads hundreds of unbundled modules. Its startup numbers
are fiction. The rig always builds and runs `release/linux-unpacked/youcoded`; `run-dev.sh`
is for Destin's eyes only, never for a number.

**The main checkout's `node_modules` is stale.** `youcoded/desktop/node_modules` was
missing `zod`, `ulid`, `diff`, `@codemirror/*` and more, so `npx tsc --noEmit` reported 135
errors on master. The perf worktree was fixed with its own `npm ci`. If you ever typecheck
or build `youcoded/desktop` **directly**, run `npm ci` there first. Never symlink or
junction `node_modules` between worktrees — `npm ci` follows the link and empties the
shared copy.

**Run the rig's own unit tests with the glob, not the directory:**

```bash
node --test scripts/perf-lab/tests/*.test.mjs
```

`node --test scripts/perf-lab/tests/` **fails on this Node** (26.4.0) with a bare
`'test failed'` — it tries to `require()` the directory. A bare `node --test` from the
workspace root recurses into the sub-repos' `node_modules` and hangs. `run-report.test.mjs`
is the one to keep green above all others: it asserts every `compare.mjs` `PRIMARY` path
resolves and has samples behind it, and it is the only thing standing between you and a
keep/reject gate that has quietly gone blind.

---

## 4. Experiment cards

**Two rules before any card.**

1. **`perf-reports/LEDGER.md` is the only authority on which cards may run.** Destin's
   approved list sits at the top of that file. He approved, vetoed and reordered these at
   the Round-0 human gate. A card printed below is a *description*, not a permission. If a
   card is not on his list, you do not run it — not even a "quick" one.
2. **The baseline decides the order: attack the largest measured phase first.** The cards
   are numbered E1–E8 for reference, not priority. Read the Round-0 baseline findings doc,
   sort by where the time actually is, and run the approved cards in the order Destin
   recorded.

Every card below was re-verified against the `perf/optimization-pass` worktree on
2026-08-26 (`main.ts` at commit `4256ade`). **Where the original plan's premise no longer
holds, the card says so.** Line numbers move — always re-grep the symbol before editing.

### The one measured fact to read these against

From the corrected rig on this build (sha `4256ade`, 5 cold starts, zero
`desktop.log` ERROR lines). All figures are milliseconds since the rig spawned the process:

| metric | ms from spawn |
|---|---|
| `whenReady` | ~655 |
| `createWindowAt` | ~685 |
| `createWindow` (duration) | ~30 |
| `didFinishLoad` | ~963 |
| `modulesEvaluated` | ~953 |
| `appMounted` | ~988 |
| `sessionsListed` | ~980 |
| `blankWindowMs` | **~350** |
| idle PSS | ~450 MB |
| all sixteen boot chores, together | **~29 ms** |

**READ THIS BEFORE TRUSTING ANY EARLIER NUMBER.** An earlier version of this table
reported `firstContentfulPaint` 4002 ms and `blankWindowMs` 3321 ms. **Those were an
artefact of the rig, not a property of the app**, and they are wrong by an order of
magnitude.

The cause is worth knowing, because it is the exact shape of mistake this loop must not
repeat. On a normal (setup-complete) boot the renderer gates its entire UI on
`window.claude.firstRun.getState()` (`App.tsx:472-488`) and renders an EMPTY div until it
resolves (`App.tsx:2669-2672`). That IPC's main-process handler calls `detectAuth()`
(`main.ts:887` → `prerequisite-installer.ts:457`), which shells out to `claude auth status`
and awaits its stdout. The fixture's fake `claude` originally ignored argv and idled
forever, so the call never returned and the app fell through to its own 3-second safety
timeout on **every** boot. Diagnosis that settled it: first-paint at 148 ms, React mounted
at 276 ms, first-contentful-paint at 3300 ms — with only **61 ms of long tasks** in
between. The renderer was not working. It was waiting on the rig.

`fake-claude.cjs` now answers `auth status` and exits, and the measured blank window fell
from ~3330 ms to **~350 ms**. Every pre-fix report was discarded to
`scratch/perf-lab/discarded/` rather than kept, so nothing can be baselined against them.

**What the corrected numbers plainly imply:**

- **Chore-level startup work is not where the time is.** Twenty-nine milliseconds out of a
  ~1-second boot is under 3%. **E2 (parallelize chores) is targeting ~29 ms** and must be
  ranked accordingly — even a perfect result is invisible.
- **E1 has lost most of its rationale.** It existed to attack a multi-second gap between
  window creation and painted content. That gap is ~350 ms. Do not spend a card on it
  without re-deriving the case from the Round-0 baseline.
- **Startup is no longer the interesting phase.** The two large, reproducible costs are
  both in the renderer under load: resuming a 50,000-message conversation freezes the main
  thread for **~126 seconds** (`loadHistory` returns in 243 ms, so it is entirely render
  cost), and PSS goes from ~450 MB idle to **~2.5 GB** with six sessions open.

**The standing caveat.** These are software-rendered on Xvfb with no GPU, which is
precisely what this rig measures worst. Confirm against the Round-0 baseline (7 runs), and
confirm any paint-related figure against Destin's own eyes on a real screen before keeping
a paint-related change.

**And the general lesson, which cost a day:** a number being *reproducible* says nothing
about whether it measures what you think. `blankWindowMs` varied by 0.4% across six boots
— it was stable precisely *because* it was a fixed timeout. Stability is not validity.
When a figure is surprisingly large, find the mechanism before ranking it.

---

### E1 — Window before chores

**Target:** `startup.median.firstContentfulPaint`
**Status:** premise holds; the plan's chore list is incomplete and partly misordered.

Move `createWindow(...)` ahead of the boot chores the window's first paint does not need.
`hookRelay.start()` and `registerThemeProtocol()` must stay **before** it (sessions need
the relay, theme URLs need the protocol) — verified: they are at `main.ts:1399` and
`main.ts:1559`, both before `createWindow` at `main.ts:1583`.

**Correction — use this chore list, not the plan's.** The plan named nine chores and
omitted six. The authoritative sequence is the `perfMark` calls inside `app.whenReady()`
(`main.ts:1304`), in file order:

`rotate-log` (1307) · `prelude` (1358) · `install-hooks` (1396) · `hook-relay` (1403) ·
`legacy-cleanup` (1421) · `hook-reconcile` (1436) · `prompt-suggestion` (1451) ·
`retention-default` (1463) · `symlink-cleanup` (1479) · `stale-downloads` (1489) ·
`reconcile-mcp` (1503) · `announcements` (1511) · `remote-server` (1518) · `ipc-prefs`
(1557) · `theme-protocol` (1560) · `accounts` (1580) → **`createWindow` (1583)** →
`post-window:done` (2044).

The plan's list omitted `prelude`, `hook-relay`, `announcements`, `ipc-prefs`,
`theme-protocol` and `accounts`. `announcements` is `network` — never rank it.

**The window is created visible — confirmed.** `main.ts:626` inside `createAppWindow` reads
`show: !opts?.inactive && !opts?.buddy`, and `createWindow` (`main.ts:800`) passes neither,
so `show: true`. There is no `ready-to-show` handler for the main window anywhere; the only
deferred-show path is `opts.inactive` (tear-off windows). This is why `blankWindowMs` means
what it means.

**Risks.** IPC handlers registered inside `createWindow` may reference services started
later — run `bash scripts/verify.sh perf-lab --full` (not the default) and read the boot's
`desktop.log` for new errors. And an earlier window must not mean a **longer** blank box:
`startup.median.blankWindowMs` is a PRIMARY metric and exists to reject exactly that
outcome. The `welcome` screenshot only proves the settled state — it cannot see a longer
blank window.

**If the honest fix is `show: false` + `ready-to-show`, stop.** That is a behavior change,
not a perf change, and it needs Destin's approval.

Given the measured numbers above, note what E1 can and cannot buy: the chores it would skip
past are worth ~29 ms in total, so E1 only pays if moving window creation earlier also moves
*first contentful paint* earlier. Measure `firstContentfulPaint`, not `createWindowAt`.

### E2 — Parallelize independent chores

**Target:** `startup.median.sessionsListed`
**Status:** partially stale, and **the measurement says the ceiling is ~29 ms**. Rank it low
unless the baseline contradicts that.

The plan proposed `Promise.all` over `reconcileMcp()`, `remoteServer.start()`,
`startAnnouncementService()` and "the sync cleanups wrapped in `setImmediate`". Verified
against source:

- `rotateLog` genuinely is first (`main.ts:1306`, `await rotateLog()`), and must stay first
  — it truncates the file the other chores append to. **Confirmed, keep it.**
- `reconcileMcp()` — `main.ts:1498`, `await`ed sequentially. Parallelizable.
- `remoteServer.start()` — `main.ts:1514`, `await`ed sequentially. Parallelizable.
- `startAnnouncementService()` — `main.ts:1507`. **Already fire-and-forget** (a synchronous
  call, not awaited). Parallelizing it buys nothing. It is also the `network` chore.
- **"the sync cleanups wrapped in `setImmediate`" is stale.** There is exactly one
  `setImmediate` in `main.ts` — line 2025, the legacy slug-symlink sweep, which runs
  *after* window creation. None of the boot chores are wrapped in `setImmediate`; they are
  plain synchronous calls on the `whenReady` stack.

So the genuinely parallelizable set is `{ reconcileMcp, remoteServer.start }`. The
synchronous chores would each need `setImmediate`/worker treatment first — that is a bigger
change than the card describes, for a phase measured at 29 ms.

### E3 — Defer chatsearch startup scan

**Target:** `idle.cpuPct.median` / `startup.median.postWindowDone`
**Status:** the file and line are right; **the "in the boot path" premise no longer holds**.

`chatsearch-index/index-service.ts:271` is `export function startChatsearchIndex(): void {`
— the declaration, not the scan. The scan kicks off at `index-service.ts:277`
(`void refreshFromLiveState();`, worker at `:182`).

**Correction:** its only caller is `main.ts:2039`, which is **after** `createWindow`
(`main.ts:1583`) and five lines before `main:post-window:done` (`main.ts:2044`). It is
already deferred past window creation and is *not* blocking first paint. It is still on the
same `whenReady` continuation with no `setImmediate` or idle wrapper, so it does still
compete with the renderer's first load — which is a real but much smaller claim than the
card makes. Also remember `postWindowDone` contains the release check and is therefore
`network`-contaminated; judge this card on `idle.cpuPct.median`.

### E4 — Tail-read `loadHistory` for small counts

**Target:** `history.huge.ipcLast10Ms`
**Status:** premise holds. Line reference is still accurate.

`session-browser.ts:660` is `export async function loadHistory(` with
`(sessionId, projectSlug, count = 10, all = false)`. It reads the whole file even for
`count = 10` — `session-browser.ts:671`, `content = await fs.promises.readFile(jsonlPath, 'utf8')`.
Note it is **already async** (`fs.promises`), so this card is about bytes read, not about
blocking.

The fix: read the last ~256 KB, parse from the last full newline, extend backwards until
`count` messages are found.

**Two semantics a tail-read must preserve, or it will return the wrong conversation:**

- **Dedup by uuid, last occurrence wins** — `session-browser.ts:680–688`
  (`lastParsedByUuid.set(parsed.uuid, parsed)`). Claude Code rewrites same-uuid lines as
  assistant text grows, so a tail-read can miss an earlier line whose uuid is rewritten
  later, or the reverse.
- **`messages.slice(-count)` at `session-browser.ts:720` is applied after dedup and
  filtering**, so N transcript lines is not N messages. A naive byte-tail must over-read
  and re-check.

Add a vitest with a duplicated uuid straddling the tail boundary. Real caller chain:
`ipc-handlers.ts:1619` → `App.tsx:2405`
(`session.loadHistory(claudeSessionId, projectSlug, 10, false)`).

### E5 — Async + cached transcript replay

**Target:** `history.huge.resumeStableMs`
**Status:** premise holds. Line range corrected.

`transcript-watcher.ts:451–488` (the plan said 451–489), `getHistory(desktopSessionId)`.
Still fully synchronous: `fs.existsSync` at `:463`, then
`raw = fs.readFileSync(session.jsonlPath, 'utf8')` at `:465`, then a full `raw.split('\n')`
with `parseTranscriptLine` per line (`:467–470`). **No cache exists** — the only `cache*`
identifiers in the file are `cacheReadTokens` / `cacheCreationTokens` (`:223–224`), which
are unrelated token counters.

Make it async and cache the parsed result keyed by `(path, size, mtimeMs)`, invalidated by
the existing incremental tail.

**Constraint the cache must respect:** a fresh `SubagentIndex()` and a fresh `seenUuids`
set are rebuilt on every call (`:455`, `:462`), and the comment at `:455` says why —
"Fresh, throwaway index so replay doesn't corrupt live correlation". A cache that shares
that index across calls will corrupt live subagent correlation. Cache the *parsed events*,
not the index. Caller: `ipc-handlers.ts:2489`.

### E6 — Renderer code-splitting

**Target:** `startup.median.appMounted` and `idle.pssMb.median`
**Status:** premise holds completely. Nothing named is split, and the config is bare.

`vite.config.ts` (43 lines) has **no `manualChunks` and no `rollupOptions`** — its whole
build block is `build: { outDir: '../../dist/renderer' }`. All five components named in the
card are statically imported in `App.tsx`:

| component | import |
|---|---|
| `GamePanel` | `App.tsx:20` |
| `SettingsPanel` | `App.tsx:52` |
| `ResumeBrowser` | `App.tsx:53` |
| `MarketplaceScreen` | `App.tsx:62` |
| `ProjectView` | `App.tsx:68` |

**Reuse the existing precedent rather than inventing one.** The artifact viewers are already
lazily loaded: `components/artifact-views/RendererRegistry.ts:18,22,23,24`
(`PdfView`, `CodeEditorView`, `DocxView`, `XlsxView` via `lazy(() => import(...))`), with a
purpose-built `ViewerErrorBoundary.tsx` for chunk-load failure. Copy that shape, including
the error boundary — a failed chunk load must not be a blank screen.

**Preload the chunks during idle after `sessions-listed`** so first open never shows a
spinner. The `settings-open` screenshot must come out identical, and the screenshot gate
will catch you if it does not.

Given the measured numbers, this card is aimed at the right region: `modulesEvaluated` is
944 ms from spawn and the bundle-evaluation cost is `modulesEvaluated − documentStart`.

### E7 — Unmount the always-mounted settings drawer

**Target:** `idle.pssMb.median`
**Status:** **code premise holds; the plan's `ROADMAP:409` citation is stale — drop it.**

The drawer really is always mounted. `App.tsx:3170` renders `<SettingsPanel open={settingsOpen} …>`
with **no `&&` guard**, unlike its neighbours. `SettingsPanel` (`SettingsPanel.tsx:185`) has
**no top-level `if (!open) return null`** — the `if (!open) return null;` at `:159` belongs
to the nested `ShortcutsPopup` (`:158`), which is a different component; do not be fooled by
it. The drawer is hidden by transform only (`SettingsPanel.tsx:237–239`,
`open ? 'translate-x-0' : '-translate-x-full'`), and the entire body including
`<DesktopSettings open={open} …>` mounts unconditionally at `SettingsPanel.tsx:280`. Only the
scrim is gated (`scrimVisible`, `:203`, used `:209`).

**Do not lump the siblings in — they are already gated.** `ResumeBrowser` self-gates at
`ResumeBrowser.tsx:718` (`if (!open) return null;`), and `MarketplaceScreen` is guarded by
`App.tsx:3316` (`{(activeView === 'marketplace' || activeView === 'library') && (`).

**ROADMAP correction.** `ROADMAP.md` does not exist in the worktree (it lives in the
workspace repo only). Line 409 is an unrelated **done** item about auditioning sound presets.
There is **no open ROADMAP item asking to unmount the settings drawer.** The mechanism is
recorded in two places, neither of which is a live request:

- `ROADMAP.md:413` — the body of a **`[x]` done** item headed at `:412` (Settings
  "Backup & Sync" row freeze, shipped in PR #254). It states the mechanism verbatim, but its
  own inner line references (`SettingsPanel.tsx:242,270`) are themselves stale — now `:237`
  and `:280`.
- `ROADMAP.md:318` — the body of the **open `[ ]`** item headed at `:315`
  ("Window-resize lag has a SECOND cause, unidentified", `#perf`), which lists "two
  always-mounted chrome paths" but names `SessionStrip.tsx:741` and
  `HeaderBar.tsx:121/321/384` — **not** the settings drawer.

So: keep the code fix, cite `ROADMAP.md:315` as the nearest live perf item, and delete the
`ROADMAP:409` reference wherever you find it. Keep the open-state transition identical — the
`settings-open` screenshot must not move.

### E8 — Window-switch long tasks

**Target:** `workload.median.probe.longtaskTotalMs`
**Status:** **stale as written** — the memoization the card proposes already exists, and the
reducer it proposes to batch is not on the render path.

`App.tsx` is 3,658 lines with five `useMemo` sites. Verified:

- **The session-status derivation is already memoized** — `App.tsx:768`,
  `const sessionStatuses = useMemo(…)` with deps `[sessionAttention]`, fed by
  `useSessionAttention(sessions, viewedSessions, sessionId)` at `:767`. The other memos are
  `gameConnection` (`:753`) and `settingsDangerBadge` (`:1896`).
- **"Batch reducer dispatches" has no obvious target.** `useReducer` is imported
  (`App.tsx:6`) and `dispatch` / `dispatchArtifact` / `gameDispatch` are in use, but chat
  state is deliberately kept off the render path via `chatStateMapRef` plus a store
  subscription (documented at `App.tsx:2536–2539`). The session list is plain `useState`
  (`App.tsx:176`), so there is no reducer behind it at all.

**What the un-memoized work actually is** — repeated linear scans over `sessions` on every
render: `App.tsx:2526` (`const currentSession = sessions.find((s) => s.id === sessionId);`),
plus the same pattern at `:507`, `:1921`, `:2470` and `:3221`. And the per-session render
fan-out at `App.tsx:2815` (`{sessions.map((s) => (`) mounts one `<ChatView>` per open session
with `visible={s.id === sessionId && …}` at `:2820`, so **every** session stays mounted
across a window switch.

This card is a measurement exercise by design: use the probe's `longtask` timestamps against
its `mark` entries to find *which* switch step blocks, then fix that. Do not implement the
card's suggested fixes as written — one is already done and the other has no target. Related
work already landed: `ROADMAP.md:316`, commit `81c9562d`, `ChatView.tsx:706` ("take inactive
sessions out of layout during resize").

---

## 5. Finishing

When Destin's approved list is exhausted, or he tells you to stop, or you hit the
eight-experiment budget:

1. **Rebase onto current master.**

   ```bash
   cd /home/destin/youcoded-dev/youcoded && git fetch origin
   cd /home/destin/youcoded-dev/worktrees/perf-lab
   git rebase origin/master
   ```

   Resolve conflicts carefully — every kept commit must survive intact, with its
   before/after numbers still true of what the commit now contains.

2. **Re-measure the whole branch once more, seven runs.**

   ```bash
   cd /home/destin/youcoded-dev
   node scripts/perf-lab/run.mjs --runs 7 --label final
   ```

   Seven, not five — this is the number that goes in the PR, and it must carry a real
   spread. Machine idle. Expect it to run past the default budget; raise `--max-minutes`
   if it aborts with exit 3.

3. **Confirm the branch still wins.** Compare the final report against the **Round-0
   baseline** — not against the last intermediate — once per kept target:

   ```bash
   node scripts/perf-lab/compare.mjs perf-reports/<round-0-baseline>.json perf-reports/<...-final>.json --target <target of kept experiment>
   ```

   Every kept target must still improve, and **no PRIMARY metric may regress**. If a target
   no longer wins after the rebase, say so in the PR body — do not quietly drop it, and do
   not re-run hoping for a better sample.

4. **Generate the PR body from `perf-reports/LEDGER.md`.** The mapping is fixed:

   | Ledger rows | PR section |
   |---|---|
   | verdict `KEEP` | **Changes** — one line each, with the target metric and Δ% |
   | verdict `REJECT` | **Tried and reverted** — the idea, the number it actually produced, why it failed the gate |
   | tagged `ux-bugfix` | **Needs Destin's eyes** — link the PNG pair under `perf-reports/review/` |
   | the Round-0 baseline and the final report filenames | **Evidence** |

5. **Open the PR** on `itsdestin/youcoded` from `perf/optimization-pass` into `master`.
   Opening a PR needs Destin's confirmation first (CLAUDE.md) — ask, then open.

6. **STOP. Do not merge.** Not after CI goes green, not if it looks obviously fine, not if
   Destin said the experiments were good. Merging is a separate decision he makes with the
   PR in front of him.

Also commit and push the workspace-side artifacts to `youcoded-dev`: every
`perf-reports/*.json` and `*.md` report, the updated `LEDGER.md`, any
`perf-reports/review/` PNG pairs, and this manual with `status:` flipped if the loop is
done. `perf-reports/shots/` is gitignored and stays that way.
