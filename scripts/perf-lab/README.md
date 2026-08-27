# perf-lab

A headless measurement rig for the YouCoded desktop app. It builds the **packaged**
app, boots it repeatedly against a throwaway fixture HOME under a virtual X display,
and writes **one JSON report** (plus a Markdown summary) that `compare.mjs` can later
use to judge a code change as KEEP or REJECT.

The point is not "get a number". It is to get a number you can *defend* — measured on
a quiet machine, repeated enough times to know its own noise band, taken against a
build that is byte-identical to what ships, with every boot's error log counted.

```bash
node scripts/perf-lab/run.mjs [--checkout <dir>] [--runs 5] [--history-repeats 5] \
  [--workload-repeats 3] [--only startup,history,workload,shots] [--force-build] \
  [--label <text>] [--out perf-reports/] [--max-minutes 45] [--dry-run]
```

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

---

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

---

## Environment and ports

Every boot runs with `HOME` pointed at the fixture, so everything the app touches
under `~` lands in a throwaway directory.

| Thing | Value | Why |
|---|---|---|
| Fixture HOME | `scratch/perf-lab/home` | wiped + rebuilt per boot; holds `.claude/`, `.youcoded/`, `.config/youcoded/`, the toy model and the fake `claude` binary |
| `XDG_CONFIG_HOME` etc. | **deleted** from the child env | on Linux Electron's userData is `(XDG_CONFIG_HOME \|\| $HOME/.config)/youcoded`; an inherited value would send the run into the **real** profile |
| `YOUCODED_PROFILE` | **unset** | a profile skips the install-hooks chore (`main.ts:1339`) and renames the remote config file — we must measure the boot users actually get |
| `YOUCODED_PORT_OFFSET` | `100` | shifts every port in `shared/ports.ts` clear of the live app |
| Remote server | **10000** | `REMOTE_SERVER_DEFAULT_PORT = 9900 + offset` |
| Local engine (llama-server) | **10020** | `ENGINE_PORT = 9920 + offset` |
| App CDP | **9555** | `--remote-debugging-port`; the rig refuses to attach if something it does not own is already there |
| Pixel-diff Chrome | **9556**, else OS-assigned | each diff gets its own port *and* its own throwaway profile — see troubleshooting |
| Xvfb display | `:99` at **1600x1000x24** | reused between runs if already up |
| `YOUCODED_NATIVE` | `1` | enables the native harness so the workload journey can create native sessions |

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

**Idle** — after a 10 s settle, CPU is sampled over 15 s across the whole process
family and PSS (proportional set size, the honest shared-memory-aware number) is read
from `/proc/<pid>/smaps_rollup`.

**History** — how long a conversation takes to come back, split so you know *which
side* to optimise. `ipcLast10Ms` / `ipcAllMs` are main-process cost (read the `.jsonl`,
parse it, ship it over IPC). `resumeFirstMessageMs` / `resumeStableMs` are renderer
cost (first bubble on screen / timeline stopped growing). Measured at three transcript
sizes: small ≈ 60 KB, medium ≈ 3 MB, huge ≈ 30 MB. A run that never stabilised reports
`resumeStableMs: null` — **never 0** — and emits a warning that the Markdown surfaces.

**Workload** — the "real use" journey: 6 mixed sessions (4 Claude Code, 2 native),
three transcripts being appended to continuously, and 40 session switches, while an
in-page probe records long tasks and frame gaps. `switchP95Ms` is the tail latency a
user actually notices; `probe.longtaskTotalMs` is total main-thread blocking;
`cpuDuringPct` and `pssAfterMb` are the cost of holding all that open.

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
provisions for itself under `scratch/perf-lab/assets/xvfb-prefix/` (no root needed);
`resolveXvfbBin()` prefers `$XVFB_BIN`, then `Xvfb` on `PATH`, then the vendored one.
`xdpyinfo` must also be present (`sudo pacman -S --needed xorg-xdpyinfo`) — without it
the rig cannot tell whether the display came up, and a missing Xvfb would surface 90
seconds later as an unexplained CDP timeout instead of a clear message.

**The engine and toy model provision themselves.** The plan assumed a pre-downloaded
llama.cpp engine and a GGUF in a HuggingFace cache. Neither existed. `fixture.mjs` now
downloads both into `scratch/perf-lab/assets/` on first use — the engine version, its
URL and its sha256 are read straight out of the app's own `engine-pin.ts`, and the
archive is verified against the same hash the app checks. Bump the pin and the rig
follows with no edit here. First run costs ~40 MB of download; afterwards it is a
hardlink copy (`cp -al`) into the fixture, which is near-instant.

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
  so an unfiltered count sums all of them.
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
renders the other branch has no such button.

**A run hangs.** `cdp.mjs` now rejects every in-flight request when its target dies, so
this should fail loudly instead. If it still hangs, `--max-minutes` kills the family and
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

## Known limits — read before ranking anything visual

**Xvfb has no GPU.** Everything renders through software rasterisation. Any measurement
that depends on paint, blur, compositing or GPU-accelerated effects can **rank
backwards** here: an experiment that removes a `backdrop-filter` may look like a win on
this rig and be invisible (or a loss) on real hardware, and vice versa. Treat those
results as a hypothesis and confirm them with a human looking at a real window.

**The pixel gate is coarse by design.** `pct` rounds to 2 dp, so under ~0.0128% of the
frame (≈205 px at 1600×1000) reports `0.00` and passes. The raw `differing` count rides
along in the result so a "0%" pass stays auditable.

**Warm cache by construction.** History repeats 2..N read a file the OS page cache is
already holding, so those are warm-cache costs.

**Medians, not means, throughout** — and `compare.mjs` judges every claimed win against
the baseline's own run-to-run spread, so a single fast run can neither prove nor veto
anything. That is why `--runs` and the sample arrays behind every median matter, and why
a report that lost its samples is rejected rather than published.
