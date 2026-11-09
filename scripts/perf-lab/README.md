# perf-lab

**What this is for:** a repeatable stress suite that catches performance regressions
**per app surface** — you run one command per app version (`run.mjs`; `ab.mjs` runs it for two versions and compares), it drives the real packaged app through a
fixed set of journeys, and it writes numbers you can put next to last week's numbers.
It started life as a one-off optimization rig; it is now the permanent measurement
that stops each freeze, stall or memory jump we have already found from quietly coming
back.

Every finding becomes a scenario, so the next regression on that surface is *caught by
running a command* instead of being re-investigated from scratch. What is not a
scenario is not measured — see the coverage table, and read it as the honest list it
is.

> **Read coverage without launching anything:** `node scripts/perf-lab/coverage.mjs`.
> Runtime lanes have different display and ownership requirements: the standard
> runner uses an isolated virtual display; hardware-virtual and explicitly enabled
> real-display diagnostics are separate. Their existence is not permission to run
> them or attach to the working app. Follow the lane's safety review and ownership
> requirements; never experiment on the production app.

> **Terms, once.** *Main process* — the single background process that owns the app's
> files, IPC and windows; there is exactly one, shared by every open session.
> *Renderer* — the process that draws a window (the web page). *IPC* — the messages the
> window sends the main process to get anything done. *Long task* — a stretch of ≥50 ms
> where a thread was too busy to respond. *PSS* — a memory figure that counts shared
> memory fairly, so six windows don't each get billed for the same megabyte.

---

## Surface coverage — the honest list

**Use `coverage.mjs` as the source-backed inventory.** Its JSON and Markdown come
from one contract: purpose, entry points, existing command/API, implementation,
integration, review state, requested versus actual capability, bounds and gaps.
Implemented is not integrated; integrated is not runtime-observed; observed is not
accepted. No supplied report means **runtime evidence not imported**, not no issues.

```bash
# Read-only: these commands do not build, launch, attach, read sensors or scan reports.
node scripts/perf-lab/coverage.mjs
node scripts/perf-lab/coverage.mjs --format markdown
# Import only an explicit existing workspace-local JSON file (replace the placeholder path;
# no perf-reports/example.json exists).
node scripts/perf-lab/coverage.mjs --format markdown --report documents=<path-to-an-existing-report.json>
```

The last command is a format template: substitute a real report path.
Repeated `--report lane=path` imports at most 32 selected files, each at most 5 MiB.
Paths must remain inside this workspace; symlinks and non-regular files are refused.
The importer follows no nested paths, screenshots, traces or source references in a
report. SHA-256 identifies only the bytes actually read, **not** an independently
attested build. Missing/unreadable/oversized files are unavailable. Unsupported or
stale schemas are not silently treated as current measurements. Exit status describes
import/CLI execution, never performance acceptance; inspect each evidence status.

The standard and document validators are reused for contract-level observations;
valid document budget breaches remain **measured-slow**. Most diagnostic formats
remain **unreviewed**, even if their own status says measured. Revision-5 renderer-only
settling is the narrow exception: raw checkpoints, identities, deltas, control roles,
requested counts and workload steps are revalidated as **measured-renderer-only**;
whole-app memory remains not collected and standard acceptance stays false. Source profiles listed
in the inventory are instructions for an independently authorized runtime run, not
commands executed by coverage. Image and background-cost APIs have no runner command.

### Quick source-only checks and explicit diagnostic profile

These three existing-runner plan commands **do not launch, build or calibrate**:

```bash
node scripts/perf-lab/run.mjs --checkout youcoded --only native-stream --check
node scripts/perf-lab/run.mjs --checkout youcoded --only native-stream --stream-completion-diagnostics --native-stream-repeats 1 --cached-only --check
node scripts/perf-lab/run.mjs --checkout youcoded --only artifacts --document-cases csv-rows-64kib --check
```

After separate runtime approval, remove `--check`, choose an isolated `--checkout`,
label and output folder. `--stream-completion-diagnostics` is accepted only with
`--only native-stream` (at most three repeats). It invokes the existing reviewed
`completionDiagnostics` API, retains every repeat/leg, and uses a **plain fixture**,
not the standard Markdown performance workload. Its executed manifest option,
measurement descriptor and instrument hashes distinguish it from standard baselines.
Even a valid diagnostic report cannot earn KEEP through PRIMARY comparison: its
manifest/descriptor differs. Standard defaults remain unchanged.

For no-rebuild approval, keep **`--cached-only` on the actual runtime command**, not
just its `--check` preflight. It conflicts with `--force-build`. At execution the
build API re-reads the current checkout fingerprint and rejects stale/missing/invalid
stamps, non-regular paths and symlink ancestors before disk-allocation checks or any
build command. It never fixes a stamp or falls back to building. Cached-only `--check`
uses the same validator and exits nonzero if reuse is refused, but cannot certify a
later execution. This verifies source/stamp identity, not packaged-byte attestation.
Without `--cached-only`, the runner's ordinary build-on-stale behavior is unchanged.

The completion-diagnostic fixture is explicitly model-free (`seedEngine: false`),
with all three required journey transcripts (4/8/12 turns for small/medium/huge),
no decoys, and the fake provider. Missing local model/engine assets are not provisioned.
Those three histories are required by the six-session journey even though this is
not a history-size stress profile. Standard native-stream fixtures remain unchanged.

The diagnostic checks producer writes, exact owned-session bridge receipt and
terminal event, then full output after revealing the hidden session. Reducer queue
is unavailable; post-reveal timing is not hidden reducer drain. Existing fixed settle
fields retain their legacy meaning and are not completion proof. Validation also
requires all eight actual alternating switch rows, with exact index/name/target
identity, successful finite paint timings and `duringStream: true`; planned counts
or filtered summary statistics cannot substitute for an executed transition.
Calibration controls
for documents run through the existing artifacts path; image diagnostics remain an
opt-in owned-harness API, not a new CLI/launcher or standard image phase.

### Whole-app memory by process role (role accounting revision 1; offline-tested, runtime pending)

Full-domain lifecycle checkpoints now add `roles` beside the existing PSS fields (checkpoint and
descriptor revisions are unchanged on purpose: comparability gates key on them; the new block
carries its own `revision: 1`, also in `descriptor.roleAccounting`). Renderer-only checkpoints
read no processes and have no `roles`. Reports without `roles` are **legacy**: roles unknown,
never inferred.

- **Identity** is `(pid, starttime)`, written `pid:starttime`; a reused pid is churn, not continuity.
- **Role** comes from `/proc/<pid>/cmdline` only as an allowlisted label: `main`, `renderer`, `gpu`,
  `utility` or `utility:<sub-type>`, `zygote`, other `--type=` words, `node-helper`, `llama-server`,
  `crashpad`, `unknown`. No argv, paths, URLs or environment are stored.
- **Per member**: PSS, RSS and private kB from `smaps_rollup`. Read order is stat, cmdline, smaps,
  stat again. A member that vanishes is `exited-during-read` (never zero); unreadable, missing
  Pss and starttime change are separate incomplete statuses. Snapshot `valid` means every
  enumerated member was measured. An unmeasured member voids its own role total and the whole
  total; one that vanished before its role was read voids every role total (cannot be placed).
- **Comparison** (`compareRoleSnapshots`): members present in both are matched per role; added and
  removed members are listed with roles; the whole-family delta exists only when membership is
  identical and both snapshots are valid, otherwise only matched-member totals plus churn are
  reported. Natural and forced-GC trajectories are never mixed. Summed PSS/RSS is over an
  incompletely discovered family: not unique memory, no leak verdict.

`summariseCycles(...).roleAccounting` holds the per-cycle block. The comparison layer
(`compare.mjs`, not yet changed) can adopt these arrays, one entry per cycle, `null` = no valid
role data (`lifecycleRolePaths(cycles, {policy})` in `process-roles.mjs`; `<key>` = role label with
non-alphanumerics turned to `-`):

| Path | Meaning |
|---|---|
| `lifecycle.role.<key>.pssMiB` / `.count` | role PSS total (only when the role is complete) / member count |
| `lifecycle.role.all.pssMiB` / `.count` | whole-family total (only when every member measured) / members |
| `lifecycle.roleSnapshotValid` | every enumerated member measured |
| `lifecycle.roleChurn.added` / `.removed` | identities that appeared / left vs the previous cycle |
| `lifecycle.roleMatched.<key>.deltaPssMiB`, `.all.deltaPssMiB` | change over members present in both cycles |
| `lifecycle.roleFamilyComparable` | whole-family delta allowed (identical membership, all valid) |
| `lifecycle.forcedGc.*` | the same, from forced-GC samples; kept separate |

Offline re-analysis of an existing report (read-only, prints, writes nothing):
`node scripts/perf-lab/role-reanalysis.mjs <report.json>`. On
`scratch/perf-lab/lifecycle-merged-once-grhuby4a/report.json` it shows identity-exact churn and
matched-member change but cannot name roles (cmdline was never recorded). Acceptance needs one
future merged-baseline three-cycle runtime run with every snapshot valid and per-role tables.

### Model downloads and the quiet-machine wait (offline-tested)

- **No download without opt-in.** Phases that seed the local model/engine (everything except
  `artifacts` and the plain `native-stream` diagnostic) refuse to run when the ~490 MB
  `qwen2.5-0.5b-instruct-q4_k_m.gguf` or the llama.cpp engine archive is missing, before the build
  and before any app launch. Choices: `--allow-asset-download` (or `PERF_LAB_ALLOW_ASSET_DOWNLOAD=1`)
  on `run.mjs` / `ab.mjs`, or select model-free phases. Already-present, verified assets are used with
  no network. `--check` prints `model assets` as present+verified, MISSING (would refuse) or download AUTHORIZED.
- **Separate quiet-wait bound.** `--max-quiet-wait-minutes <n>` (default 20) bounds the wait for load < 4
  and CPU < 10%. That waiting is credited back to `--max-minutes`, which now means measurement time only.
  A first gate runs before the first boot; past the bound the run stops with exit 4, the report records
  `noise.neverQuiet` ("machine never became quiet: load X") and is INCOMPLETE. The report also carries
  `noise.quietWaitMs` and `noise.loadAvgAfter` (one reading at the end of the run).

### Consolidated source-only unit selection

`tests/offline-unit-manifest.json` is the explicitly audited selection for this
package. Do **not** replace it with `tests/*.test.mjs`: the folder contains automatic
headless Chrome, local HTTP/socket, process-supervisor and temporary-git-commit tests.
Revision 2 classifies all 65 changed/new lab test entrypoints at this checkpoint:
52 perf-lab units, 3 DOM units, 1 separate read-only-Git test, 1 injected Python gate
test, 1 separate local fake-HTTP test and 7 effectful exclusions. Each included test
has a source-boundary audit note; the saved verification below binds actual test bytes.
This is **not the complete lab suite**. No runtime or hardware pass is implied by green.

```bash
# Explicit manifest selection, including the separately identified read-only-Git test.
# No glob expansion; no Git commits, app/browser launch, model or sensor execution.
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {spawnSync} from "node:child_process"; const m=JSON.parse(readFileSync("scripts/perf-lab/tests/offline-unit-manifest.json","utf8")); const files=[...m.files.map(f=>"scripts/perf-lab/tests/"+f),...m.uiFiles,...m.readOnlyGitFiles.map(f=>"scripts/perf-lab/tests/"+f)]; const r=spawnSync(process.execPath,["--test","--test-concurrency=2",...files],{stdio:"inherit"}); process.exitCode=r.status??1;'
python3 -B scripts/perf-lab/tests/supervised-exec-gate.test.py
python3 -B scripts/perf-lab/tests/supervised-compositor-proofs.test.py
# Separate offline-local suite: fake server bound to 127.0.0.1, no outside connections.
node --test scripts/perf-lab/tests/fake-provider.test.mjs
```

Real Chrome, hardware, process/exec-gate synthetic integrations and temporary-Git-commit
`build.test.mjs` are deliberately excluded, not counted as skipped successes. The
selected-checkout source test inspects real registered Git metadata without writing it;
it is machine-specific. Fixture tests now use `seedEngine:false`; the old blanket claim
that `fixture.test.mjs` necessarily downloads a model no longer describes this source.

### Standard integration (not a runtime pass)

The eleven phases below are integrated in `run.mjs`; the inventory records their
specific limits. Historic claims that individual metrics currently equal zero or
that the machine always uses one renderer are deliberately not coverage evidence.

| family | existing integration | scope limit |
|---|---|---|
| startup/history/workload/shots | `run.mjs` and scenario modules | Fixed packaged journeys, repeats and named captures; not all product screens |
| stall | `scenario-replay-stall.mjs` | Raw response tails and renderer evidence, not inferred main occupancy |
| artifacts/documents | Legacy files panel plus nine selectable revision-3 document smoke cases | Selected cases only; not all viewers, full reads or larger ladders |
| projects/terminal/native-stream/native-resume | Existing surface scenarios | Fixed steps; hidden session is not hidden window; detached IPC is not full multi-window presentation |
| scrollback | `scenario-scrollback.mjs`, `late-content.mjs` | History ceiling/blank-content evidence only when every required size completes |
| optional diagnostics | See `coverage.mjs`: lifecycle, DOM growth, sensors, images, GPU cost, realism, presentation, idle overhead | Separate command/API and review boundaries; no standard acceptance by presence |
| missing broad coverage | Queue/drain, OS-hidden windows, mobile, physical display, app energy; marketplace/sync/buddy journeys | Unmeasured/unsupported, not healthy |

**All eleven phases are reachable from the CLI.** `run.mjs`'s phase list is
`PHASES = ['startup', 'history', 'workload', 'shots', 'stall', 'artifacts', 'projects', 'terminal', 'native-stream', 'native-resume', 'scrollback']`
— pick any subset with `--only`. (`terminal` added 2026-09-10; `native-stream` and
`native-resume` added 2026-09-16.) (This paragraph previously said the list was four
phases and that `stall` and `artifacts` were unreachable; that stopped being true when
they were wired in, and the doc did not follow. Corrected 2026-09-03 against the code.)

### Opt-in natural settle + no-work controls (offline-tested; runtime pending review)

`short-lifecycle.mjs --settle-checkpoints` uses descriptor revision 5 only for this
option; default runs and older reports retain their existing meanings. Requires
`--model-free --supervised`, an explicit cached `--app-dir`, fresh `--out`, and
explicit `--max-minutes` (1..5), `--max-rss-mb`, `--cleanup-reserve-ms` caps. At most
three **workload cycles including the first warmup**; incompatible with `--post-gc`
and `--resource-checkpoints`. No build, provisioning or sensor path is added.

Optional `--settle-domain renderer` collects only renderer checkpoints; omitted or
`--settle-domain full` preserves the existing process-inclusive behavior. The domain
flag requires `--settle-checkpoints`. Renderer-only checkpoint revision 3 uses one
CDP metrics response bracketed by document epoch/URL reads, the same source/run/target
identity and finite counters. It does **not** invoke family discovery, process start
or PSS readers. Checkpoints separately expose `renderer` validity/read brackets and
`process` availability/gaps; renderer-only process/PSS status is `not-collected`, not
missing or zero. Full checkpoints retain revision 2 and existing comparison rules.
Independent supervisor ownership, RSS caps, historical memory gaps and cleanup
requirements are unchanged; RSS safety is not a PSS measurement.

A complete renderer-only settle summary is `measured-renderer-only`, with process
status `not-collected`. Overall lifecycle status remains `incomplete` (CLI exit 2),
standard acceptance remains false, and no aggregate PSS trend is emitted. Coverage
imports retain these separate observations without declaring measured whole-app
memory or health. Observer overhead still needs actual runtime measurement; a
shorter measurement path is not evidence of a measured overhead reduction.

One boot and one anchor, explicitly: **control 1 → workload 1 → restore anchor /
settle 1 → control 2 → workload 2 → restore / settle 2 → control 3 → workload 3 →
restore / settle 3** (truncate to requested cycles). Each control and each restored
workload gets the same four reads at planned **0, 250, 1000, 3000 ms** from its
verified anchor boundary: maximum 24 settle/control points. Controls never create,
send, destroy or switch sessions, and are not cycles or warmup. A later control also
observes the period after the previous workload, not a fresh-process baseline.
The anchor setup/teardown remains outside these phases.

No forced GC. These Chromium instance counts are not connected-DOM counts and do
not guarantee collection occurred. Boundary state/visibility checks use the existing
pane/pill mapping; no listeners or polling instrument is installed. `actualMs`,
`latenessMs`, checkpoint `observerMs` and `readWallMs` record measured timing.
Absolute monotonic scheduling includes read overhead; lateness over 100 ms, missing
reads, failed restoration, renderer epoch/source/run/target changes or counter
resets stop continuation. Full-domain checkpoints also stop for shared PID reuse. The schedule must fit before the existing
run deadline minus the explicit cleanup reserve (at least 12 s); no late catch-up
burst. Family churn can retain renderer observations but cannot produce aggregate
PSS retention: scope remains enumerated marker processes, not proven whole-app PSS.

`sampleSettlePhase` and `summariseSettle` in `natural-settle.mjs` expose raw phases,
within-phase changes and same-planned-offset raw workload-minus-control differences
with actual timestamps. Sequential windows are not causal subtraction or calibrated
observer overhead. Missing points are incomplete, never healthy. The existing
immediate `natural` slot remains the first released read; delayed trajectories use
their own samples rather than copying global cumulative totals. Existing preserved
failed/current-merged evidence is not rewritten or made comparable by this option.
Reports still use the existing 10,000-record / 5 MiB bounded serializer; cap overflow
is explicitly incomplete, not truncated into successful evidence. No runtime was
performed for this instrument revision.

Offline check:
`node --test scripts/perf-lab/tests/natural-settle.test.mjs scripts/perf-lab/tests/resource-checkpoint.test.mjs scripts/perf-lab/tests/short-lifecycle.test.mjs scripts/perf-lab/tests/coverage.test.mjs scripts/perf-lab/tests/proc-forensics.test.mjs`

### Runtime observations versus source inventory

Session coordination reported a partial DOM-growth run (cap reached after revealing
550 of 2000 rows, with tab-reset proof) and a sensor-only run with EACCES/truncated
discovery. These were initially requester-provided observations; the explicit current
snapshot below now imports and hashes those reports. The first does not establish
saturation, and the second does not establish app energy. Import exact local reports
to retain identities and raw reasons; do not turn these notes into machine defaults.
Lifecycle checkpoint implementation is reviewed but runtime acceptance remains
pending. One small PNG image diagnostic was reported by coordination and its saved
report is available below, but coverage imports it conservatively as **unreviewed**:
producer-declared revisions/step statuses are not independent revalidation of current
revision-3 input, image policy, seven-step proof or visual acceptance. Images remain
API-only, not standard-runner image integration. GPU cost runtime and realism `display=gpu` run ONLY on the
supervised private compositor (see "Supervised GPU binding" below) and are refused unless the renderer is hardware; software realism and native presentation remain separate
existing lanes, not executed by this inventory work. Background-cost
is an API, not a workload lane. The broad diagnostic goal is therefore **not done**.

Saved session examples (read-only imports, no discovery or nested file following):

```bash
node scripts/perf-lab/coverage.mjs --format markdown \
  --report documents=scratch/document-stalls-runtime-jNljbL/runtime-report.json \
  --report images=scratch/image-stalls-runtime-wSQUqA/runtime-report.json \
  --report dom-growth=scratch/dom-growth-runtime-jidlo1wg/report.json \
  --report sensors=scratch/sensor-runs/preflight-20261020T221551Z-16573/report.json
```

These are optional explicit paths from this session, not portable fixtures or default
healthy claims. Missing files remain unavailable. Native completion reports use
`--report stream-completion=<saved-run.json>`; importing them as `native-stream`
does not turn the plain diagnostic into standard Markdown timing evidence.

### Integrated current evidence checkpoint (read-only)

`scratch/perf-lab/integrated-coverage-current-i7kgIdgv/reports-manifest.json` selects
seven exact reports; `coverage.json` and `coverage.md` are generated from that manifest,
with actual byte lengths/SHA-256 and reported source identities. No automatic scratch
discovery, nested-file following, rerun or packaged-byte attestation is performed.

- **Current reported app source:** renderer-only report
  `scratch/perf-lab/renderer-settle-4zJItHUf/report.json` names
  `254ff9983aa3657a937dfd65011beb3c6e6508c9`, dirty fingerprint `3c937cd909bc`.
  Coverage revalidates 24/24 points, three completed workloads/six exact replies and
  alternating control/workload roles in one source/run/target/document epoch.
  Result: **measured-renderer-only**; process/PSS **not-collected**, outer lifecycle
  **incomplete**, original CLI exit **2** is intentional, standard acceptance **false**.
  Control listener levels were 331/639/1395; workload within-window listener changes
  +19/+40/+19. Cycle-3 workload began at Nodes 455/listeners 294/heap 16125456 bytes,
  versus its control's 656/1395/18157548. This counter drop is **not GC proof**.
- **Same current reported app source, different diagnostic:**
  `scratch/perf-lab/lifecycle-merged-once-grhuby4a/report.json` completed three cycles
  but remains incomplete because family composition changed in cycles 1/3. No aggregate
  PSS retention trend follows. It is not interchangeable with renderer-only settling.
- **Historical app source:** the selected CSV and PNG reports name
  `bc9e43752d0c9d2bb49eeff1e50ee70800668f27`, dirty `331dbfcbbf58`, not current 254ff.
  They stay separately labeled owned-attempt/unreviewed diagnostics. The explicitly
  imported plain-stream report at `scratch/stream-completion-runtime-BPiBTZ/2026-10-21-0034-bc9e437-stream-completion.json`
  also reports old bc9 source. Its completion evidence revalidates, but remains
  unreviewed diagnostic evidence, not current-source or standard Markdown acceptance.
- **Separate domains:** DOM growth: the historical run was incomplete at its old 10-checkpoint cap (550/2000 rows; the cap is now 60 so a run reaches all 2000 rows,
  reset proven); sensor preflight retains EACCES/truncated discovery, not app energy.

App fixes were merged in app PR **665**, supporting sources/docs in workspace PR
**289** (coordination references). This unfinished lab is **not merged**. Imported
source/stamp fields are reported identities, not independently attested builds.

Verification logs in that same fresh evidence folder preserve the initial manifest
revision-guard failure and its repair, then the consolidated final selection:
**690/690 Node tests** (51 files), **8/8 separate offline-local tests**, and **4/4 Python
gate tests**. Zero skips in the Node selections; no complete-suite/runtime claim.

For an independently authorized future renderer-only run, the existing cached/model-free
entrypoint is below. This is an argv template, **not permission or a command run here**;
all paths must be absolute and the output fresh. There is no build fallback.

```bash
node scripts/perf-lab/short-lifecycle.mjs --checkout <isolated-app-worktree> \
  --app-dir <cached-linux-unpacked> --model-free --supervised \
  --settle-checkpoints --settle-domain renderer --cycles 3 --max-minutes 5 \
  --max-rss-mb 2048 --cleanup-reserve-ms 20000 --out <fresh-report.json>
```

GPU-cost runtime and realism GPU display are enabled only through the supervised private compositor
(see "Supervised GPU binding"); app-attributable energy remains **unsupported**. Full-surface graphics implementation,
queue conservation/drain and OS-hidden-window coverage are still missing. These reports
do not establish a generally complete or accepted diagnostic lab.

---

## Running it

```bash
node scripts/perf-lab/run.mjs [--checkout <dir>] [--runs 5] [--history-repeats 5] \
  [--workload-repeats 3] [--terminal-repeats 3] [--only startup,history,workload,shots] [--force-build] \
  [--label <text>] [--out perf-reports/] [--max-minutes 90] [--dry-run]
```

(`--help` lists every `--*-repeats` flag.) **A default-run baseline taken before the
`terminal` phase existed (before 2026-09-10) fails CLOSED against a newer default run**
on its two `terminal.*` PRIMARY paths — compare.mjs judges a phase only one report ran
as unjudgeable, by design. Re-take the baseline, or compare with `--only` phases both ran.

It builds the **packaged** app, boots it repeatedly against a throwaway fixture HOME
under a virtual X display, and writes **one JSON report** (plus a Markdown summary)
that `compare.mjs` can later use to judge a code change as KEEP, REJECT or INCONCLUSIVE.

The point is not "get a number". It is to get a number you can *defend* — measured on
a quiet machine, repeated enough times to know its own noise band, taken against a
build that is byte-identical to what ships, with every boot's error log counted.

### Comparing two app versions

`ab.mjs` runs the SAME selected work against candidate A and then candidate B (one at a
time, in one process, through `run.mjs`'s own `main()`), and writes one comparison. Each
candidate is a **stamped checkout** (a build in `desktop/release/` plus its
`.perf-lab-build.json`); a bare package directory is not accepted because it has no
verifiable source identity. By default only cached builds are used — a stale or missing
build is refused, not silently rebuilt (`--build` allows a rebuild).

```bash
# 1. Preflight: both candidates' identities, cached-build validity, work, boots, bounds. Launches nothing.
node scripts/perf-lab/ab.mjs --a <checkoutA> --b <checkoutB> --check
# 2. Quick targeted run (default mode: startup + history, 3 samples each)
node scripts/perf-lab/ab.mjs --a <checkoutA> --b <checkoutB>
#    ... or choose the phases:   --only terminal,native-stream      ... or everything: --mode full
# 3. Expose the lab's own noise: A, B, then A again, plus an A1-vs-A2 table
node scripts/perf-lab/ab.mjs --a <checkoutA> --b <checkoutB> --repeat-a
# 4. Known-change control: inject a 400 ms delay into B's terminal scenario; it must show as regressed
node scripts/perf-lab/ab.mjs --a <checkoutA> --b <checkoutA> --only terminal --control-b-delay-ms 400
```

Output: `perf-reports/ab/<date>-<time>-<shaA>-vs-<shaB>[-CONTROL][-label][-N]/` holding both
run reports (`a`, `b`, `a2`), `comparison.md` / `comparison.json`, and
`noise-a1-vs-a2.md` with `--repeat-a`. A new comparison never overwrites an old one, and
neither does a rerun of `run.mjs` in the same minute (it gets a `-2`, `-3` suffix). Only
one run may measure at a time: `scratch/perf-lab/run.lock` records the holder's pid and
start time and a second run is refused (a lock is reclaimed only when that process is
provably gone; nothing is ever killed).

Reading `comparison.md`: every PRIMARY path (and document case) shows A, B, absolute and
percent change, each side's run-to-run spread, each side's worst repeat, and a status —
`improved` / `regressed` (change larger than both sides' spreads added together),
`inconclusive` (inside that noise, or fewer than 2 samples), `missing` (absent on a side;
never read as zero) or `incomparable`. There is no overall score; a failed lane is listed
under "Required-lane failures". Reports now carry `identity` (hashes of the lab source,
fixture options, the executable and `app.asar`, and every repeat count); two reports
whose instrument source, fixture or execution options differ — or that predate `identity`
— are marked incomparable and must be re-measured with the current lab. The
`--control-b-delay-ms` control (env `PERF_LAB_CONTROL_TERMINAL_DELAY_MS`, off by default)
is recorded in `identity.control` and in the file name. Durations of real A/B runs have
not been measured yet; do not rely on a time estimate. Unit tests only — no A/B has been
run end to end against real builds.

### Launch it with `bg-run.sh`, not by hand

```bash
bash scripts/perf-lab/bg-run.sh --label cycle3-eviction        # a full run
bash scripts/perf-lab/bg-run.sh --only history --history-repeats 1 --label probe
```

A full default run has more boots than the ~26-minute run this section was first written
for, and its current duration has not been re-measured; it is longer than an agent turn,
and there are three ways to lose one that have all actually happened:

- a `run_in_background` Bash task running the rig is **killed ~15–25 s after launch**
  with no user action — `setsid nohup` survives, a plain `&` does not;
- the log redirect and `--out` resolve against the **shell's cwd**, so a session whose
  cwd had drifted into a worktree launched a run that died instantly with its log
  written where nobody looked;
- a watcher that greps only for *progress* lines is **silent through a hang**, and
  silence is indistinguishable from "still running".

`bg-run.sh` wraps `run.mjs` only (it is not a wrapper for `ab.mjs`, and `run.mjs` is not the
only measuring command any more — see the next section). It handles all three: it cds to the workspace root, launches detached, and
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
| 2 | error (build failed, the machine stayed busy for 20 minutes, a scenario threw) |
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

### Comparing reports

`node scripts/perf-lab/compare.mjs <baseline.json> <candidate.json> --target <PRIMARY-path>`
prints `VERDICT: KEEP`, `REJECT`, or `INCONCLUSIVE`. Only KEEP exits 0;
REJECT and INCONCLUSIVE exit nonzero. `verdict()` also returns `keep`, `status`
and `comparability: { comparable, reasons, warnings }`. Numeric spread, missing
PRIMARY metrics, screens and error gates still apply; an inconclusive report
**cannot** certify a win even if the target improves.

Comparisons require complete, non-aborted reports with valid machine identity
(CPU, RAM, kernel, Node and the actual GL renderer, acceleration and compositing
mode), acceptable pre-boot noise readings and matching measured scenario
descriptors. Unknown/failed GPU readings, changed software/GPU lanes, or missing
provenance return INCONCLUSIVE. Historical JSON lacking this provenance remains
readable but cannot prove KEEP. The comparison requires exact known identity;
it does not infer equivalence across runtime or driver revisions. `--only`
phases neither report ran stay out of scope, as before.

**Limit:** the runner's noise samples are taken before boots, not during the
timed measurements. A green noise summary does *not* prove there was no midrun
interference; investigate suspicious numbers and repeat matched runs. The app's
own `cpuDuringPct` is not a measure of external background load.

### Waiting for a quiet machine

Every phase, and every repeat, passes an idle gate: load average under 4 and CPU
under 10% measured over 3 seconds. Busy means **wait**, polling every 30 s for up
to 20 minutes, printing how long it has been waiting so a queued run is never
mistaken for a hung one. Only after that does it give up (exit 2).

It used to stop after five polls — 2.5 minutes — and because the gate runs AFTER
the build, giving up threw the whole build away. On 2026-09-09 that happened twice
in one session while the load average was still coming down from other work
(12.1 → 15.6 → 10.0 → 6.4 → 4.4 across the five polls, quiet a minute later), and
both times the workaround was an external script doing exactly this wait. The
budget is capped by the run's own `--max-minutes`, so a gate can never push a run
past the deadline its caller set. Pinned by `run-report.test.mjs` → "the
machine-idle gate".

**Your own parallel agents count as "busy".** Do not start the rig while this session's
subagents are running `verify.sh` or vitest — on 2026-09-23/24 five runs were lost to the
20-minute gate that way (and to other sessions' screenshot sweeps). Run it after they finish,
and run before/after back to back so both see the same machine.

### Asking a report which STEP produced a number

```
node scripts/perf-lab/explain.mjs <report.json> --phase artifacts --run 2
```

Ranks every step in a run by what it cost, main-process stall and renderer
long-tasks side by side, with the scenario's own verdict for who froze:

```
artifacts#2 — steps by main-process stall
  step                           main stall   worst  renderer   worst  who
  open.mdLarge                         1312    1362      1360     743  renderer
  open.mdSmall                          279     329       833     421  renderer
```

A phase total says a run stalled for 1.6 s; it does not say where, and where is
what decides whether a change is to blame. That example is real: it cleared a
branch that had not touched the markdown viewer. `--by renderer` re-ranks by
renderer cost — a disagreement between the two orderings is itself the signal,
because work moved off the main thread is not work removed.

### Asking WHICH FUNCTIONS made a step slow

```
node scripts/perf-lab/profile-open.mjs --file mdLarge --top 20
```

`explain.mjs` stops at the step. This takes a real V8 CPU profile across one
artifact open in the real app — on Xvfb, like every rig run, so nothing appears
on the desktop — and ranks functions by **self** time, bucketed by subsystem:

```
================ open mdLarge — 939 ms wall, 1037 ms sampled ================
  by subsystem:
    our app code                                     714 ms   69%
    V8 / GC / runtime                                210 ms   20%
```

It writes the `.cpuprofile` too, so it can be opened in Chrome DevTools when the
buckets are not enough. Build a different tree with `--checkout <path>`; it
defaults to this worktree's `youcoded/`.

**Why it exists.** On 2026-09-09 a small Markdown file measured 570 ms against
117 ms for a code file twenty times its size, and three fixes were filed against
the Markdown renderer — which turns that same file into a page in ~30 ms. Half a
second was being attributed to code that was not running. The profile found it in
the probe, not the app (next section). A step number that surprises you is worth
one profile before it is worth a plan.

### A probe that reads layout charges the app for its own cost

`viewerState()`'s `tail` calls `innerText`, which forces a synchronous layout of
the pane — and `waitForViewer` polled it every 50 ms *while timing an open*. The
more document there was to lay out, the more the probe billed, which reads
exactly like "markdown is slow" and is why the 570 ms above was believed. The
tail is now opt-in: off in the polling loop, on when a wait times out and the
app's own error copy is worth a reflow. Pinned by two tests in
`scenario-artifacts.test.mjs`.

Two consequences worth knowing. Artifacts-phase numbers recorded **before
2026-09-10 are not comparable** with later ones — they include the probe. And the
general rule: anything a poll touches must not force style, layout or text
serialisation. `innerText`, `offsetHeight`, `getBoundingClientRect` and
`getComputedStyle` all do.

### The first run of a new scenario is a shakedown, not a baseline

When a scenario runs against the real app for the first time — which is true *today*
for `scenario-replay-stall` and `scenario-artifacts` — expect it to fail on selectors,
waits and timing, not to produce numbers. Both are written to fail loudly with the real
cause rather than return a plausible zero, which is the behaviour you want on a
shakedown. Fix what breaks, run it again, and only then record the result as a
baseline. Ranking anything from a first run is how the rig ends up measuring itself
(see *Reference numbers* → the retracted 3.3-second startup).

Two more traps from 2026-10-04. **A fix can pass a timing leg without engaging at all**:
the fence leg once reported a long-code-block fix as working while the fix was never used.
Assert the mechanism (a non-zero count of the pieces the fix creates; the leg now fails on
zero), not just the time. **A fake producer that does not behave like the real program
produces false findings**: swallowed write errors, a blocking write loop that never reads
stdin, and frames wider than the 80-column terminal gave three false findings in one night.
When the app looks guilty, instrument the producer first.

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
(`main/ipc/ui.ts, the platform:get entry`) — zero work — so every millisecond it reports is
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

**At real scale: `real-scale-startup.mjs`** (standalone, not a `run.mjs` phase). The fixture
above is ~600 tiny transcripts; launch and Resume costs only show at the size of a real
history. This boots the same packaged app against a `cp --reflink` COPY of this machine's
history (never the real folders — the launch repair moves files; no sync remote; plugin
registry paths rewritten into the copy) and reports every `bg:*` mark (store start, slug
repair and its stages, reconcile, materialize, each Resume scan split into native list /
transcripts / store), first and settled Resume opens, and main-process stalls from a 100 ms
IPC heartbeat. `--profile` records a whole launch instead (main CPU profile from its first
line via `--inspect-brk`, window profile, long tasks, frame gaps, idle CPU by process type,
running animations, programs started); `--real-look` adds the real theme and plugins;
`--profile-browse` profiles a settled open. Needs btrfs (reflink). Results and numbers:
`docs/active/investigations/2026-09-26-startup-resume-real-scale.md`.

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

### `scenario-scrollback.mjs` — the memory CEILING *(own boot, runs last)*
Every other memory number in this rig is a **floor**. Since cycle 2 a conversation
opens at its last 30 turns, and no other scenario ever scrolls back — so
`workload.median.pssAfterMb` describes six sessions with nothing read back.
Scrolling up prepends a page and **nothing removes it** (`chat-reducer.ts`
`HISTORY_PAGE_LOADED`; there is no eviction), and every open session's ChatView stays
mounted (`App.tsx` renders `sessions.map(<ChatView>)`). Six long conversations read to
the top rebuild the pre-paging working set, gradually.

This phase opens the **same six sessions the workload phase opens** (shared
`openJourneySessions`, so floor and ceiling are comparable numbers), scrolls each
resumed conversation to its beginning one at a time, and reads PSS, CDP
`JSHeapUsedSize` and DOM node count at both ends, post-GC.

**Look first at `ceilingPssMb`** — the number cycle 3 exists to bound. Then the split,
which is the point of the phase:

| metric | what it is | which change frees it |
|---|---|---|
| `deltaJsHeapMb` | reducer state + React fibers | **eviction** only |
| `deltaNonJsMb` | PSS rise the heap does not explain: DOM, layout, paint | **parking a hidden view** |
| `releasedMb` | what switching away + a forced GC gives back | ~0 today; the metric a cycle-3 change must move |

`releasedMb` is deliberately **not** a PRIMARY metric — it is higher-is-better and the
gate reads every PRIMARY path as lower-is-better, so gating on it would score the
cycle-3 win as a regression.

A leg that does not reach the beginning of its conversation FAILS the report rather
than reporting a smaller ceiling: a ceiling measured half-way is a floor, and a median
cannot say so. Same for a missing heap reading — an unattributable rise would point
cycle 3 at the wrong change.

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

### `scenario-projects.mjs` — the Projects view *(own boot; added 2026-09-09)*
Seeds a second saved project of ~1,600 generated files in 40 folders (45 % code, 25 %
markdown, 12 % HTML, 10 % PNG, 8 % JSON — every card-preview kind), lists it and the
transcript project in `~/.claude/youcoded-folders.json`, then: opens Projects from the
header button, **types seven real key events** into the file search, flips the grid to
flat mode with the "Code & configs" type filter, scrolls that grid to the bottom so every
card crosses the viewport (previews are IntersectionObserver-gated), switches to list
view, switches projects both ways, opens the Conversations tab, closes and reopens — both
probes over every step.

**Look first at `open.openMs` versus `open.countsMs`** ("when do I see cards" versus
"when do the numbers land"), then `filter.codeMs` beside `filter.fileCards` (the cost of
mounting the matching files as cards — since 2026-09-18 the flat grid draws 50 at a time as
you scroll, so `fileCards` reads 50, not every match), then
`scrollFlat.longtaskTotalMs` (the per-card preview fetch + render as cards scroll in),
then `search.keystroke.p95Ms` (the per-keystroke re-filter/re-sort). A step whose
`stall.verdict` is `main` is the backend fan-out, not the renderer. Judged in `PRIMARY`:
`thrash.ipcStallMs`, `open.openMs`, and since 2026-09-18 `conversations.ms` and
`thrash.toConversations.medianMs` — the Conversations tab drew all 700 seeded cards per
click (174.8 / 181.6 ms median) until it drew 50 at a time (58.6 / 65.2 ms).

**Blind to, by construction:** the per-card `backdrop-filter` blur that wallpaper themes
put on every `.layer-surface` card — the fixture boots the stock theme (no wallpaper), and
under llvmpipe a blur is software-rasterised anyway. That cost is real on Destin's
display and this scenario says nothing about it. Also blind to a project over the
2,000-file discovery cap. (The big project carries 700 one-turn conversations, so the
Conversations tab IS measured at Destin's scale; the transcript project has three.)

### `scenario-terminal.mjs` — switching sessions in terminal view *(one boot per repeat; added 2026-09-10)*
Opens the workload's same six sessions, puts the four Claude Code sessions into
terminal view (Ctrl+`), fills each terminal with 2,000 lines of mixed glyphs, then
makes 40 switches between those four, one a second — both probes over every switch,
plus the app's own counter `window.__terminalRegistry.atlasClears` read around each.

**Why:** every hidden -> visible terminal clears the glyph atlas that ALL open
terminals share (TerminalView's heal), so each switch re-rasterises every terminal.
**Look first at `atlasClearsPerSwitch`** — about 1 proves the heal engaged; well below
means the timings do not describe it, well above means resize heals fire on switches
too. `clearsOutsideSlots` counts clears the settled totals saw but no switch's
one-second slot did (the few-ms gaps between slots and the settle after the last), so a
non-zero value means a clear landed after its switch's slot closed. Then
`switchPaintedMedianMs` (click -> the other terminal on screen, next to the workload's
chat-view switch), `longtaskMaxMs` and `ipc.totalStallMs`. `renderer` on each run says
whether xterm got WebGL or the DOM fallback, where the clear is only a repaint.

**How the IPC stall is measured:** each switch owns a one-second slot. The IPC probe
(a ping every 50 ms) is installed at the slot's start and read just before the next
switch, so the time between switches is probed, not just the click. A ping still in
flight when a slot closes counts its wait so far beyond the ping interval
(`ipc.openStalls` counts those slots), and a slot whose reading failed is counted in
`ipc.readErrors` and named in a warning — the total is then a floor. Still unprobed: the
few ms of CDP round trips between slots, and each slot's first 50 ms (probe-ipc's first
ping fires one interval after install).

**Glyph fill:** the terminal shows the fake `claude`'s PTY, not a shell, so there is no
`seq`. `fake-claude.cjs` answers one typed line, `perf-lab-glyphs <n>` (surrounding
whitespace ignored, anything else on the line is not), with n lines of ASCII plus Claude
Code's box-drawing glyphs in seven colours (bold every fifth line) and a sentinel the
scenario waits for. Every other line is echoed as before.

**A default run now depends on this phase working.** Like every other phase (projects
included), a throw here aborts the whole run with exit 2, and `scrollback`, which runs
after it, never runs. Shake it down with `--only terminal` before trusting a default run.

### `scenario-native-stream.mjs` — a native reply at cloud-model speed *(one boot per repeat; added 2026-09-16)*
Opens the workload's same six sessions, but binds the two native ones to the
**perf-lab fake endpoint** (`fake-provider.mjs`, below) instead of the local engine, then
streams three replies of 3,000 deltas at **150 deltas a second** — the rate of a cloud
model, not the ~12/s the local model manages here:

| leg | what is on screen | what it measures |
|---|---|---|
| `visible` | the streaming session | the renderer main thread's busy time over the stream (the cost a user feels as jank reading a reply as it arrives), DOM commits and layouts against frames, IPC stall |
| `switching` | huge <-> the streaming session, 8 switches 2 s apart | click -> messages on screen, counted only for switches made while deltas were still arriving (the fake server says when the stream ended) |
| `hidden` | the huge conversation | what the stream costs a window that is not showing it — a per-delta shell redraw shows here in full |

**Look first at `visible.taskMs`** (and its `taskPct`, the share of the window the thread
was busy), then `switching.switchPaintedMedianMs` — both PRIMARY — then `hidden.taskMs`,
which is reported but NOT gated: it is ~1 s over a 21 s window and moved ±0.5 s with
background load on its first day (+29 % on a branch a CPU profile then showed running
less code, +43 % on a branch that never touches the renderer). **Busy time, not long tasks, on purpose:** the first shakedown streamed 3,000
deltas into 1,202 commits at 60 fps with a long-task total of exactly 0 ms, because the
long-task observer counts only stretches over 50 ms and per-frame work under that never
registers. The long-task figures stay in the row, read by eye. `visible.commits` beside `framesPerSec`
is the mechanism check: the transcript batcher coalesces deltas to one commit per frame,
so commits ≈ frames is the healthy shape and commits far above frames means it is not
engaging. `turnEndSignal` says whether the app's own Stop button was seen ending the
turn or the server's completion plus a settle stood in.

**Why a fake endpoint and not the engine binary.** The app supports a user-added
"Custom endpoint (OpenAI-compatible)" provider (`provider-registry.ts:390-399`): a row in
`~/.youcoded/providers.json` with a `baseUrl` and no key is `ready` at once, and a native
session bound to it sends `POST <baseUrl>/chat/completions` with `stream: true` through
the AI SDK's openai-compatible client, which turns every SSE frame's `delta.content` into
one `assistant-text` event — the unit the renderer pays per. The fixture writes that row
only when asked (`buildFixture(root, { fakeProvider: true })`), so every other phase's
fixture is byte-for-byte what it always was. The server runs inside the rig's own
process, paces deltas by the wall clock (a late tick catches up, so the average rate
holds under load) and records what it actually sent; its content is the transcript
generator's realistic markdown, byte-identical between baseline and candidate.

**Blind to, by construction:** the real engine (the fake answers at once, so
`firstResponseMs` is the app's send path, not prefill); tool calls, thinking blocks and
attachments; the buddy window; GPU paint. The local model's own rate is deliberately not
a factor — this phase is about the renderer.

**Asking WHICH FUNCTIONS a leg's busy time went to.** `PERF_LAB_PROFILE_LEGS=hidden`
(any of `visible,switching,hidden`) in the rig's environment takes a V8 CPU profile
over that leg and writes it to `scratch/perf-lab/profiles/`; `PERF_LAB_PROFILE_TAG`
names the file. Then `node scripts/perf-lab/summarise-profile.mjs <file>` ranks it by
self time with the same subsystem buckets `profile-open.mjs` uses. A profiled run's
busy time includes the sampler, so it is a diagnostic and its report carries a warning
saying so — never a baseline. Built for the first A/B on this phase (2026-09-16), where
Batch A cut the visible stream's busy time 25 % and raised the hidden stream's 29 %,
and the counters alone could not say why.

### `scenario-native-resume.mjs` — the native session journey *(one boot per repeat; added 2026-09-16)*
The fixture seeds **100 native session files** under `~/.youcoded/sessions/<slug>/`
(`buildFixture(root, { nativeSessions: true })`: 99 of three turns, one of 400 turns of
realistic markdown, mtimes staggered so the list order is identical run to run), and the
scenario walks the doors the main process opens on a click, with the IPC ping probe
armed over every step:

| step | what happens | clock |
|---|---|---|
| `browse` | All Sessions menu -> Resume | click -> the list heading and its first rows |
| `reveal` | scroll the list to its end | until the row count stops growing |
| `resume` | the 400-turn native session, through the app's own `youcoded:resume-session` event with its binding (the picker never opens) | dispatch -> entries on screen and still |
| `pageUp` | scroll to the top of the resumed conversation | -> one more history page on screen |
| `turn` | a 300-delta reply from the fake endpoint | send -> Stop button gone |
| `tearoff` | `detach.openDetached` | -> the pill gone from this window, a second window on CDP |
| `detachedTurn` | a reply into the detached session | this window's own IPC latency while the other window receives the stream |

**Look first at `ipcSumOfSteps.totalStallMs`** — how long the whole app was unresponsive
across the journey — then each step's `stall.verdict` (`main` = the app-wide freeze),
then `browse.openMs` and `resume.paintedMs`. Those three are PRIMARY. A fresh Claude Code
session is created first so the window survives the tear-off (the app auto-closes an
emptied window, and the CDP target is that window).

**Blind to, by construction:** the detached window's own rendering (one CDP target); the
Resume list's preview pane and search; Claude Code resumes (scenario-history); a native
session whose title-bearing message sits past the 256 KB head-read window.

**Blind to, by construction:** the GPU re-upload cost — the rig is llvmpipe under Xvfb,
so WebGL may not initialise and the clear is then only a DOM repaint; wallpaper themes;
switching through native sessions or toggling views (both resize every terminal); and
whether glyphs stay correct after sleep/resume, which needs a human on real hardware.
The app build must carry the counter: against an older build `atlasClearsPerSwitch` is
null and the report is refused (exit 4).

---

### `switch-pingpong.mjs` — session switching the way a person does it *(standalone, one boot per configuration; added 2026-10-05)*

```
node scripts/perf-lab/switch-pingpong.mjs --checkout <worktree>/youcoded   # or --app-dir <linux-unpacked>
  [--pairs small-huge,huge-huge,idle-streaming,idle-caughtup,term-term,term-flood2,term-flood20]
  [--sessions 6|16|6,16] [--only a,b400,b250,b150,c,d,e,f,ctrl,noop,late,probe,profile] [--probe-reps 4] [--out dir] [--tag x]
node scripts/perf-lab/switch-table.mjs scratch/perf-lab/switch/*.json      # the headline table
```

It never builds (it reads the package stamp, like `gpu-theme.mjs`) and waits for a quiet machine and for other perf-lab runs to end.
Use `bg-run.sh`-style detachment (`setsid nohup`) for a full matrix: one configuration is ~7 minutes.

**What it measures that the old switch clock did not.** REAL input through the browser's input path (mouse press/release on the
pill; the app's own hold-Shift switcher), not `el.click()`; the page's event timestamp as t0; *first frame at which the destination is the
visible pane* and the frame after it; *settled* (no change in that pane for 150 ms: DOM changes and layout shifts in chat, buffer / output
changes in terminal); every frame gap over 1.5x the frame period (not only over 40 ms); long animation frames with script attribution;
main-process IPC pings across the sequence; and the work that lands AFTER arrival (CDP metric deltas, `late`). Sequences: `a` spaced 1 s,
`b400/b250/b150` human ping-pong, `c` burst (10 clicks 40 ms apart across 4 sessions), `d` interrupted (second click 60 ms later), `e` the keyboard
switcher, `f` hidden-work arrival (a streamed reply / a terminal flood landed while hidden), `probe` typing and a wheel tick at +50/150/300/600 ms.

**Controls — read these before any number.** `ctrl`: the same switch with a known 200 ms main-thread block injected right after each click
must move first paint by ~200 ms (it did: +185 to +197 ms). `noop`: clicking the already-active session must report "no switch", never 0 ms.
Every switch is checked against the intended session (chat: `data-chat-session-id`; terminal: terminal order); a click that landed on another pill,
or never reached the page, is DROPPED and counted (`dropped` in each summary), never averaged in.

**Traps this leg already hit.**
- *The pill row moves.* The active pill grows and the others shrink, so coordinates read once go stale (at 150 ms spacing 31 of 40 clicks missed).
  Each click now reads ONE pill's rectangle just before the click (a layout flush just before t0, outside the timed window); runs are labelled.
- *After a pill click, keyboard focus is on the pill button*, not the composer: typed keys go nowhere unless the app moves focus. The key probe
  forces focus (so it measures main-thread availability) and reports the natural focus (`naturalFocusAfterClick`).
- *Machine load.* Every sequence records `/proc/loadavg` at start and end; `loadHigh` / the table's `[LOAD n]` marks a sequence run above load 8. Repeat those.
- *Cold visit.* The pill-position pass shows each of the four sessions once before timing; "cold" means the first TIMED visit, not a first-ever render.
- *Settle is never before first paint*, and is not reported (null, `n/a-streaming`) for a destination that is streaming (it never goes quiet).

**Limits.** Software GL on Xvfb; frames are not the physical panel; fake Claude Code producer; fixture sizes (50 / 2,500 / 3,500 turns) not the owner's histories;
the leg runs the PACKAGED build (React production mode) while owner hand tests ran a Vite dev build. Results: `docs/archive/investigations/2026-10-05-session-switch-measurement.md`.

### `realism.mjs` — the "real-use" lab: does the lab feel what Destin feels? *(added 2026-10-07; findings in `docs/archive/investigations/2026-10-05-lab-realism.md`)*

**GPU display is currently BLOCKED**, including GPU-default presets and direct `runBoot` imports, before
package copies, history/fixture preparation, fake providers, environment mutation or port probing. The new
app-only supervisor does not enable KWin/D-Bus descendant containment. Software (`--display xvfb`) behavior
is unchanged, not newly runtime accepted.

```
# historical GPU command — currently returns unsupported without preparation:
node scripts/perf-lab/realism.mjs --preset real-use-storm --checkout <worktree>/youcoded --boots 3 --seqs fresh,warm,busy
# the closest to his dev-build hand test: add  --build dev --pick newest --deep on
node scripts/perf-lab/realism-table.mjs scratch/perf-lab/realism/out/<dir>        # one table from the result files
```

Every realism factor is a flag, so a gap is explained by switching ONE factor at a time: `--build packaged|dev`, `--history fixture|real`
(`--pick ladder|newest|biggest`, `--deep on` scrolls each chat back through its older pages first), `--theme stock|heavy`, `--display xvfb|gpu`
(gpu = historical private KWin lane, now refused BEFORE launch pending supervisor integration),
`--sessions 2..20`, `--busy off|on|heavy|gpu|both` (on = light background load; heavy = every core saturated, machine load ~35; gpu = a browser page filling the graphics chip).
Presets: `real-use`, `real-use-storm`, `cheap`. One boot runs `fresh` (right after opening the sessions), then a warm-up + census, `warm`, optionally `soak`, `busy`, and the controls `ctrl` and `noop`.

**What it measures.** The same three numbers the owner's hitch recorder logs for a click (browser Event Timing): input delay, handler time, presentation delay, plus
click-to-paint, for pointerdown/pointerup/click, with human timing (150-600 ms gaps, a 60-140 ms press, pointer arrives first, occasional wheel / typing / the Shift switcher) and the pill position read fresh before each click.
Also long animation frames, CPU and (gpu display) per-process GPU engine time, and the right-pane check 450 ms after each press.
**Content census** per session is counts only (entries, folded, tool cards, code blocks, tables, images, DOM elements). **Controls:** `ctrl` = a 200 ms handler injected on every pill press must read ~+200 ms (it does: 220-270);
`noop` = clicking the active session changes nothing.

**Privacy.** `--history real` COPIES (copy-on-write, `cp --reflink=always`) transcripts into a scratch fixture HOME and never opens the originals for writing; only file sizes and dates of the originals and DOM counts of the copies are read, never conversation text.
The fixture is deleted at the end of every boot (`fixtureDeleted` in the result). Do not commit or paste result files from `--history real` runs without checking they hold only sizes and counts (they do by construction).

**Limits.** The invisible compositor does not scan out: no real vblank, VRR or panel timing. Machine contention is a factor of its own: runs that start at load > 8 from OTHER work are excluded from the quiet columns.

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
an IPC handler (`main/ipc/session.ts, the session:history entry`). The main process is single-threaded and serves
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
| six sessions open, pre-paging | **~7,000 MB** |
| six sessions open, after cycle 2 | **~1,720 MB** |

`ChatView.tsx` keeps a ChatView **mounted for every open session**
(`content-visibility: hidden`, deliberately not `display: none`, for resize
performance). This matches the "worse with more sessions" report exactly.

**Read the 1,720 MB as a FLOOR, not a bound.** It is six sessions with nothing
scrolled back. Paging moved where a conversation starts, not how large it can get —
see the `scrollback` phase above for the ceiling, and
`docs/archive/handoffs/2026-08-28-perf-cycle-3-handoff.md` §2 for why this distinction
already caused one mis-sized plan.

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

## `native-chat` diffs mean nothing on their own

Its message body is generated by the real local model and is resampled every run.
**Measured 2026-08-28 on the identical baseline commit twice: 14.79% different**, in
the message-body box — larger than the 6.38% a real change produced against the same
baseline. The other four screens were 0%, 0%, 0% and 0.004% across those same runs.

Before treating a `native-chat` diff as a finding, run the baseline against ITSELF and
compare the two percentages. Then READ THE IMAGE — cycle 2's real duplicate-bubble bug
showed here as 14.04%, which no percentage rule could have separated from this noise.
`NONDETERMINISTIC_SCREENS` in `screenshots.mjs` names it.

## Two rules for measuring a LAZY change

Both were learned the expensive way on 2026-08-28/09-03 (perf cycle 3), where three
separate bugs each presented as the identical number and two candidate runs reported a
REGRESSION for a change that turned out to be a 58% win.

**1. Measure that the mechanism ENGAGED, not just the outcome.** An optimisation that
reacts to the viewport, to idle time, or to a cache can fail to run at all — and a
memory or timing number cannot tell "it ran and did not help" from "it never ran".
Cycle 3 spent three full measurement cycles on that ambiguity. What resolved it was a
direct count of the thing itself (`window.__perfScroll.folded()` → folded entries per
pane), which answered it in one run. **Per-pane, not aggregate:** the aggregate read
~730 of 12,100 for three different causes; the split (433/7000, 294/5000, 1/100) named
the cause immediately. This is the same rule the UI review rig already enforces — every
shot must prove it opened — applied to perf.

**2. Settle before you read, and collect AFTER the work has run.** A lazy change does
its work when the app goes idle. Reading straight after the last scroll measures the
app mid-transition, and running a GC *before* that work leaves its freed nodes
uncollected at the instant of the reading. Both push the number the wrong way.
`CEILING_SETTLE_MS` / `LEG_SETTLE_MS` in `scenario-scrollback.mjs` exist for this and
must stay above any in-app idle timer (the app's entry-folding idle is 800 ms).

**And re-run the BASELINE whenever you change the instrument.** Adding a settle window
or a new reading changes what the number means, so an old report is no longer a fair
comparison — a candidate measured on the new rig against a baseline measured on the old
one is not an A/B. Cycle 3's shipped figures come from a baseline re-run at the
candidate's own parent commit, on the same rig, 3 repeats each.

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
| perf-lab fake endpoint | **9558** | `fake-provider.mjs`, in the rig's own process; the fixture's provider row points at it (only when built with `fakeProvider: true`) |
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

## The three instruments added on 2026-09-03

All three exist because measurement failed us in perf cycle 3, not because they seemed
nice. Read this before trusting any perf number about smoothness.

### Which renderer did the rig get? — `gpu.mjs`

`report.machine.renderer` now records what Chromium actually rendered with, read from
CDP `SystemInfo.getInfo` on the browser target (WebGL `UNMASKED_RENDERER_WEBGL` is the
fallback). It is captured once, on the first successful boot of a run.

**The answer, measured 2026-09-03:** the rig is **software-rendered**.

```
ANGLE (Mesa, llvmpipe (LLVM 22.1.6 256 bits), OpenGL 4.6 (Core Profile) Mesa 26.1.3-arch3.1)
gpu_compositing = unavailable_off      rasterization = unavailable_off
```

So the "the rig is blind to GPU" line in five scenarios' `blindTo` lists is **correct** —
it is now a measurement rather than an assumption, and every future report carries its
own copy. Note that Chromium *sees* the NVIDIA device (`vendorId 4318`) and declines to
use it: `/dev/dri/renderD128` being world-readable is not sufficient, because the app
runs under Xvfb, which offers no hardware GL. Anything that would change this (a real
display, a compositor) changes the numbers, so check this field before comparing two
reports.

### Layouts per streamed token — `layout-cost.mjs`

Cycle 1's defect was one forced document layout per streamed token. Timing it needs a
native stream and is hostage to local-model speed; **counting** it is not. CDP's
`Performance` domain exposes `LayoutCount` and `RecalcStyleCount` as monotonic
integers — confirmed empirically, not from the docs: 200 forced layouts read back as
exactly `LayoutCount = 200`.

Reported as `workload.median.nativeLayoutCost`, measured over a 3 s window on the
**native** leg (the only real per-delta stream the rig has — the Claude Code streamer
appends whole turns, so measuring there proves nothing). Read `verdict`:

| verdict | meaning |
|---|---|
| `coalesced` | layouts track painted frames — the healthy shape, and the only pass |
| `per-delta-forced-layout` | ~1 layout per render commit while commits outrun frames — **the cycle-1 defect** |
| `forced-layout` | layouts far outrun frames, but not once per commit |
| `stream-too-slow` | fewer deltas than frames, so the two shapes are indistinguishable — **not a pass** |
| `no-stream` / `unmeasured` | nothing was measured — **not a pass** |

**Expect `stream-too-slow` on this machine today.** Measured against master on
2026-09-03, the local model emitted 35 deltas in 3 s against 181 frames. At that rate
`layoutsPerCommit` is 1.0 — which is both the defect's signature and what a healthy
renderer does when each commit lands in its own frame. Getting a conclusive reading
needs a faster local model or a longer window; reporting `coalesced` there would have
been a pass the data does not support.

This is what re-gates cycle 1, and it is the detector the unfixed buddy-window twin
(`BubbleFeed.tsx`) needs. It does **not** cover buddy windows yet: no scenario opens one.

### Is anything late to the screen? — `late-content.mjs`

The class that hid cycle 3's pop-in through three clean runs. Every other number in
`scrollback` is taken while the app is **still**, and a lazy renderer is correct when
still and wrong while moving.

After all memory readings, the huge conversation is scrolled downward **at a fixed
human pixel rate** (1,500 px/s for 8 s ≈ 12,000 px) while counting, every frame,
`.timeline-entry` elements inside the viewport that are still rendering as a spacer.
Reported as `scrollback.median.lateContent`. **The passing value is zero:** one blank
frame is the pop-in a user sees.

`clean` is the only pass. Verdicts, worst first: `blank-at-rest` (blank while standing
still — worse than any scrolling result), `late-content`, `no-folding` (nothing was ever
a spacer, so nothing was tested), `unmeasured`, `clean`.

**This instrument needed three corrections before its readings meant anything, and each
one turned a confident finding into an artefact of the rig.** They are worth knowing,
because all three are traps any "measure it while it moves" probe will hit:

| # | the artefact | the reading it produced | the fix |
|---|---|---|---|
| 1 | Crossed the whole document in a fixed time. On the huge fixture that is 4,504,187 px in 6 s — **745,000 px/s, ~500× a human scroll** | blank content on **214 of 216 frames** | scroll at a fixed human PIXEL RATE (1,500 px/s); the reading now carries `pxPerSecond` and `scrolledPx` so it can be judged |
| 2 | Seeked to the start and sampled one frame later. No user teleports | **4 blanks on 8 frames**, every one at `scrollTop 0` | settle at rest first, and report a failure to settle as its own, worse verdict (`blank-at-rest`) |
| 3 | Counted frames where the chat pane pinned ITSELF to the bottom | **3 blanks on 1 frame**, at `scrollTop 4,504,200` while the pass had travelled 12,003 px | compare actual scrollTop to commanded each frame; skip and count those frames (`jumpedFrames`) — an auto-scroll is a different thing from late content |

Every one of those was found by looking at the number and asking whether the app could
possibly have done that, not by a test going red. **A measurement instrument's first
finding is usually about the instrument.**

`clean` is the only pass. `no-folding` means nothing was ever a spacer during the
scroll — the mechanism under test never engaged, so nothing was proven. A spacer is
defined structurally (occupies height, renders nothing), so this generalises past
folding to any lazy render.

**Both verdicts are rolled up across repeats by WORST, not median** — `median()` sorts
with `x - y`, which on a verdict string is `NaN`, so two clean repeats could otherwise
bury the one that caught the defect.

Each instrument has a **live proof** in its test file: a real headless Chromium is
driven through both the healthy and the defective shape, and the test asserts the
verdicts differ. Unit tests over fixtures the author wrote cannot show that an
instrument can see the thing it was built for.

---

### Real-GPU cost without a visible window — `gpu-cost.mjs` (added 2026-10-05)

**Runtime: supervised path only (2026-10-21; see "Supervised GPU binding" at the end of this section).** This
optional diagnostic previously launched a private `kwin_wayland --virtual` and a packaged app unsupervised; that
direct path stays removed. A returned D-Bus child handle, marker match or process-group
signal does not establish containment of detached compositor descendants. The CLI and exported compositor
entry now refuse runtime before environment mutation, port/sensor probes or app launch. Enabling it needs the
separate supervisor-owned app exec gate/CDP ownership and compositor containment work; no physical-display
or hardware claim is established by current offline checks. Existing AMDGPU `fdinfo` engine units are unchanged.

`--check` is source/package/dependency readiness only: explicit canonical `--checkout`, `--app-dir` and
scratch GPU `--out` are required. It uses `buildApp({cachedOnly:true})`, never builds/downloads, and validates
the standard parent release stamp against the current worktree. Arbitrary preserved package copies or
internal-only stamps are explicitly unsupported, not guessed fresh. Dependency checks search executable
paths for `dbus-run-session`, `kwin_wayland`, `kscreen-doctor`, `wayland-info`; they execute none of them.
No GPU sensor, process table, compositor, display, socket or browser is probed by this check. The cached-only
source fingerprint may invoke git commands; it is not a no-subprocess or hard-I/O-deadline guarantee.

Defaults describe one cheap cell: `--suite themes --cells midnight --scene welcome --repeats 1 --seconds 2`.
Strict options allow only `control|themes`, `welcome|chat|stream`, <=4 cells, <=3 repeats and finite positive
windows <=30s. Welcome fixtures disable engine seeding, use 12 history turns/zero decoys, and need no fake
provider. Chat/stream require explicit local fake-provider binding and also disable engine seeding.
`--keep-compositor` is rejected. Parsing creates no directories.

Tracing has separate <=10s demand, <=10000 RETAINED events (only the three event names the parser reads; other events are scalar-validated and dropped under a separate 400000 raw-event cap so animated scenes fit) / 2MiB retained projection, and bounded connection
acquisition/start/end/completion waits. A late acquired connection is closed through its retained handle;
never-resolving acquisition is failed/unverified, not claimed cleaned. Data loss, missing completion and
overflow fail closed; cleanup-end errors remain alongside the primary failure. Empty/irrelevant-only completed
traces are incomplete, not measured frame windows: at least two usable draw events and an interval/FPS are
required. Theme traces request `--trace-seconds` (default 8, 1-10) separately from `sampleWindowSeconds` (default 2 seconds); both
window durations are recorded and must not be conflated. CDP listeners/connection are removed even on failure. Only the trace parser's required scalar/state/local-id fields are retained, not a full trace.
Browser protocol deserialization and uninterruptible OS I/O are not bounded by these retention limits.
Tests are offline with fake child/CDP/files.

#### Supervised GPU binding (`gpu-bind.mjs`, `gpu-bind-run.mjs`; added 2026-10-21)

`acquireGpuBinding()` starts the supervised private compositor, requires a verified fixed 2560x1600 **60 Hz** virtual
output (owner decision; the laptop's 180 Hz is not measured) and a uniquely owned socket with the SO_PEERCRED proof,
then `binding.launchApp({ fixture })` starts the app candidate through a fresh launch supervisor whose plan carries that
socket and proof (`--ozone-platform=wayland`, `WAYLAND_DISPLAY` = the private path, no `DISPLAY`, no session bus; the
launch worker re-checks inode, live peer and start time right before releasing the app). `gpu-cost.mjs` (non-`--check`)
and `realism.mjs --display gpu` use only this path. `gpu-bind-run.mjs` is the one-launch CLI: compositor, app, renderer
read, app stop, compositor stop, then a read-only cleanup proof (retirement receipts, recorded pids absent from /proc,
nothing still naming the run's paths, `getcap /usr/bin/kwin_wayland` unchanged).

**A binding is not GPU evidence by itself.** `gpuEvidence()` classifies the Chromium SystemInfo reading: only a
Radeon/AMD renderer with GPU compositing and rasterization enabled counts (`countsAsGpuEvidence`); llvmpipe,
SwiftShader, unknown or non-SystemInfo readings are refused (gpu-cost reports the renderer and no numbers). Still
refused: the dev build, a busy-desktop browser on the private compositor, and a workload whose budget cannot fit the
maximum compositor lifetime (20 min) or one app's 600 s launch-supervisor cap.

**Compositor lifetime is an explicit bounded parameter** (`wallMs` in the fixed compositor plan; 60 s default, 1200 s
maximum). `gpuLifetimeFor()` (gpu-bind.mjs) derives it from the requested workload: 25 s start-up + workload + 30 s margin +
the core's 8 s cleanup reserve; each app gets its own `appWallMs` (workload + 62 s, i.e. margin, app cleanup reserve and 20 s to first window; 120-600 s). `gpu-cost.mjs`
computes the workload in `gpuWorkloadBudget()` and records `report.lifetime`; `realism.mjs --display gpu` uses
`--max-minutes`. An over-long request is refused before anything starts, never clamped.

**Animated workload, no model:** `gpu-cost.mjs --suite control --only animated` runs `spin-cadence` (a compositor-only CSS
animation) and `bubbles-canvas-n10` (animated canvas under glass boxes) from `gpu-control/control.html`. A trace window
without at least two compositor frames is `incomplete` with `compositorFps: null`, never a measured 0 fps, and an
incomplete variant makes the whole report `incomplete`. Frame metrics per variant: frame interval median/p95/max, draw-and-swap
p95, long intervals, dropped pipeline frames.

**Cleanup re-read rule (owner decision 2026-10-21):** during cleanup/retirement scans ONLY (`OwnedProcesses.cleanup`),
a malformed/truncated `/proc/<pid>/stat|status` read is re-read within 4 x 5 ms (`readProcForCleanup`). A re-read that is
ENOENT/ESRCH, or shows a different start time (pid reused), records the original identity as `exited-during-read`
(in the cleanup receipt's `exitedDuringRead`) and counts it gone; the newcomer is reported absent from that read, so it is
never adopted or signalled. A malformed read that persists for the same (pid, starttime) stays fatal. Forensics and
ownership proofs call `readProc` directly and still fail closed (pinned by proc-forensics.test.mjs). Limits: virtual 60 Hz presentation, not physical scanout/vblank/VRR; compositor
cleanup is polling-based and fails closed (see the 2026-10-21 `Malformed proc status` race in the report).
Historical method/readings: `docs/archive/investigations/2026-10-05-theme-gpu-measurement.md`.

## Lane F — workload breadth and the original JPEG (`--only workloads`)

Opt-in, alone, never in the default or `full` selection. `node scripts/perf-lab/run.mjs --only workloads --checkout <stamped checkout> --cached-only`
(overnight: `queues/overnight-1.json`; A/B: `ab.mjs --mode workloads`). One app boot per family per pass (13 families x `--workloads-repeats`,
default 3); a rung that kills the app is recorded and the rungs it never reached run in a fresh boot (max 3 boots per family).

- **Rungs**: CSV (64 KiB-3 MiB, three shapes), XLSX, DOCX, HTML, PNG and JPEG 1024x768 / 2048x1536 / 4096x3072, the owner's original JPEG
  (`image-jpeg-original-wealth-game`, a byte copy made read-only in the fixture area, SHA-256 pinned in `workload-lane.mjs`; the source file is never opened by the
  app), plus four workloads: `csv-fullread-5120kib` (open a 5 MiB CSV, click "Load the whole file"), `path-list-*` (a long path list shown in a chat message through
  the transcript -> UserMessage -> FilepathToken path), `large-diff-*` (a big Edit shown in the tool card's diff view) and `background-index-large-history`
  (the app's chat-history search-index refresh after a session ends; the app has no project-file-tree indexer).
- **Status per rung**: `measured`, `slow` (a named threshold in `WORKLOAD_THRESHOLDS` was breached; the breach is kept), `failed:<reason>` or
  `unsupported-by-candidate` (the candidate's source lacks the feature; evidence = files/patterns looked for; never a zero). Failures that are findings
  (`failed:timeout`, `failed:memory-limit`, `failed:memory-bound`, `failed:viewer`) do not void the report; instrument failures (`INSTRUMENT_REASONS`) do.
- **Memory bound**: fixture generation, image read-back and the original copy run in child processes under `systemd-run --user --scope -p MemoryMax=...`
  (swap off), falling back to `prlimit --as` (looser: address-space cap); the report records which applied (`workloads.memoryBound`). A bound kill is a
  `failed:memory-bound` row. Nothing is installed or reconfigured.
- **Interference**: each family window carries a clean/disturbed/unknown verdict (owner decision Q-6); a disturbed one makes the report INCOMPLETE.
- **Compare**: `workloads.median.rungs.<id>.{operationMs,rendererMaxDelayMs,mainMaxDelayMs}` (`WORKLOAD_PATHS` in `compare.mjs`); samples at `workloads.runs[].rungs`.
- **Not measured**: GPU paint (software rendering), composer typing/paste of paths, the cold OS disk cache.

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
that returns `{ ok: true }` and switches nothing (`main/ipc/session.ts, the session:switch entry` — "Switch
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
| `docs/archive/investigations/2026-08-26-perf-lab-plan-corrections.md` | the 18 verified corrections, each with its mechanism |
| `docs/archive/handoffs/2026-08-26-perf-loop-operating-manual.md` | operating the measure → change → re-measure loop |
| `docs/archive/plans/2026-08-23-perf-lab-and-optimization-loop.md` | the original plan — **history, not truth**; several of its specifics were wrong about this machine and this app |
