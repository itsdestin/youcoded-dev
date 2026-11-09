# Harness performance lab

**Current workstream status:** [148-current-state.md](../../docs/active/plans/148-current-state.md) records measured results, stopped/deferred coverage, the completed targeted A/A calibration, continuation detector, budget and next priorities. Older qualification receipts are historical, not current run status.

A small dev-only lab: the **production `createRuntime` / `NativeSessionHost`**, an SDK-attempt ledger, offline paired reports, and a Harbor custom agent. No new app UI, database, or hosted service. Nothing here contacts the running app. Execution is POSIX-only in this first version; Windows is explicitly refused until process-tree timeout cleanup is implemented. Use Linux Harbor containers for comparisons.

**Everyday development loop:** start with [TARGETED.md](TARGETED.md). `targeted-plan.mjs` previews a two-build, one-model comparison on 1–3 development tasks: 2–6 smoke trials or 6–18 confirmation trials. It exports selected fixtures and fingerprints without credentials or paid execution. Broad benchmarks are optional studies, not the default after each edit.

**Broader suite build:** see [SUITE-EXPANSION.md](SUITE-EXPANSION.md) for 13 static cases, three native conversation scenarios, interaction metrics, model panel and explicit readiness gaps. `node scripts/harness-lab/suite-readiness.mjs` reports what still blocks a comprehensive multi-model run; it never launches one.

**Stalled follow-through:** [CONTINUATION.md](CONTINUATION.md) documents the no-nudge continuation metric and offline runtime regression cases. Reports automatically flag missing delivery or missing required follow-up, with unknown diagnostic stages kept explicit; no user diagnosis is required.

**Scoring:** [SCORING.md](SCORING.md) defines the separate quality/safety/supervision/resource axes and evidence contract. `node scripts/harness-lab/evaluation-report.mjs scripts/harness-lab/scoring-example.json` produces a concise synthetic example; `--json` retains the full evidence. No model calls are made.

**Execution:** [EXECUTION.md](EXECUTION.md) documents the new OpenRouter shared-budget gateway, stateful client adapters and native safety/lifecycle smoke profiles. Transport safety and native execution are offline-tested; real client/route canaries and full evaluation readiness are explicitly separate.

## What works without credentials

From the workspace root:

```bash
# App backend must be built from this checkout first.
(cd youcoded/desktop && npm run build:main)
node --test scripts/harness-lab/*.test.mjs youcoded/desktop/test-engine/lab-*.test.mjs

# A scripted model drives the REAL production host and Write tool. It is NOT a model benchmark.
mkdir -p /tmp/yc-lab-task
node youcoded/desktop/test-engine/lab-runner.mjs --smoke --cwd /tmp/yc-lab-task --out /tmp/yc-lab-smoke.json
node scripts/harness-lab/report.mjs /tmp/yc-lab-smoke.json

# Export three public pilot tasks; refuses to overwrite an existing directory.
node scripts/harness-lab/suite.mjs /tmp/yc-lab-tasks
```

The pilot tasks check doing a requested file operation rather than merely promising it, fixing a Python function, and reconciling conflicting supplied sources into a decision file and brief. Each verifier rejects the untouched fixture and accepts its reference solution in offline tests. These easy public tasks validate plumbing and regressions; they are **not** a representative benchmark or suitable evidence for competitive claims.

## Files and responsibilities

| File | Responsibility |
|---|---|
| `youcoded/desktop/test-engine/lab-runner.mjs` | Launch one process with private HOME/config, finite timeout, explicit live opt-in and credentials supplied by file/stdin |
| `…/lab-worker.mjs` | Construct the production runtime; run a task; capture native events and model attempts |
| `…/lab-observer.mjs` | Observe SDK calls without changing chunks; count retries/children/summaries separately; preserve unknown usage |
| `metrics.mjs` / `report.mjs` | Offline all-attempt summaries and paired comparisons; no model calls |
| `suite.mjs` | Export pilot task workspaces and independent Harbor verifiers |
| `harbor_adapter.py` | Run YouCoded inside Harbor's task container; retain native result and expose known totals |
| `harbor-import.mjs` | Normalize explicit Harbor trial mappings for common reports |
| `evaluation-import.mjs` / `activity-normalize.mjs` | Shared raw-native/ATIF evidence adapter used by actual targeted loading and evaluation scorecards; content-free versioned export |
| `activity-timeline.mjs` / `activity-evidence.schema.json` | Aligned interval union/overlap and explicit historical coverage schema; no inferred thinking/idle |
| `targeted_report.py` | Reconcile journal/results/rewards/ledger, import raw activity and print all 13 grouped metric families with limitations |

## Harbor integration

Adapter API checked against **Harbor 0.24.0** (`requirements.txt`). A credential-free synthetic run also passed through actual Docker setup, the production host, result capture and an independent verifier. This verifies integration, not real-model quality. Install in a separate virtual environment, not the app's dependencies:

```bash
uv venv /tmp/yc-harbor
uv pip install --python /tmp/yc-harbor/bin/python -r scripts/harness-lab/requirements.txt
PYTHONPATH=scripts/harness-lab /tmp/yc-harbor/bin/python -m unittest discover -s scripts/harness-lab -p 'test_*.py'
```

Custom agent import path: `harbor_adapter:YouCodedAgent` (put this folder on `PYTHONPATH`). Parameters:

- `desktop_dir`: absolute host path to the built `youcoded/desktop` checkout.
- `key_file`: private host file containing a **dedicated provider-budget-limited key**; never put a key in config, argv or environment.
- `provider`: `openrouter`, `anthropic`, or `openai`; `model` is Harbor's selected model identifier, passed unchanged.
- `max_spend_usd`, `max_request_usd`: explicit positive reservation budget and conservative reservation per physical SDK attempt.
- `max_requests`, `timeout_sec`: default 30 / 300; include delegated requests.
- `task_id`, `repetition`, `comparison_key`: stable experiment identity; specify per trial or normalize from the authoritative Harbor manifest afterward.
- `synthetic_smoke=true`: credential-free infrastructure check only. Uses the scripted model, writes `lab-smoke.txt`, does not attempt the supplied task, and stamps `synthetic: true` in Harbor metadata. Never include these runs in model-quality comparisons.

The adapter uploads compiled runtime files, installs lockfile production dependencies inside the container, then runs the launcher. Task images need Node 22+, npm, and their task dependencies. The generated pilot images provide these. Setup time is not inference execution time. The uploaded key is deleted before the model starts. All interactive permission exceptions/questions are denied in this first unattended profile; disclose this policy on every comparison.

**No automatic live runs.** Build and offline tests do not require keys. Before any live comparison, authorize a budget and configure a provider-side spending cap. `max_request_usd` is a CALLER-DECLARED reservation, not measured provider pricing or a guaranteed maximum bill; the runner reserves it before each SDK attempt and never releases reservations. A falsely low reservation can understate spend. Only the independently enforced provider key limit can bound actual billing. SDK/provider-internal retries may be unobservable; do not claim a complete provider bill.

The adapter deliberately advertises **neither ATIF nor resume** yet. It stores the richer native result and normalized request ledger. Full multi-step/resume studies require an adapter extension, not a silently reset session. Unsupported Browser integration and inherited user plugins are not enabled. This is the production runtime in an explicitly clean, headless profile, not a clone of a user's installation.

## Comparing runs

```bash
node scripts/harness-lab/report.mjs --compare baseline candidate baseline.json candidate.json
```

Each run has `schemaVersion: 1`, `arm`, `taskId`, `repetition`, `comparisonKey`, `model`, `status`, `success` (`true`, `false`, or `null`), `wallClockMs`, `finalText`, and `requests`.

- Match cells by task ID + repetition. Reject duplicates and different comparison declarations. The declaration must include the study's model/settings/task-version/budget policy; it is not an automatic equivalence proof.
- A completed agent turn has **no success verdict** until an independent verifier grades the files/state. The runner leaves `success: null` intentionally.
- Preserve unsuccessful attempts and unavailable measurements. Do not compare each arm's different set of successful tasks.
- Reports show all-attempt totals plus paired differences and common-success pairs. They are descriptive, **not statistical significance claims**. Add task-clustered uncertainty and power planning before public rankings.
- Input includes cached input. Cache fields are subsets, not extra tokens. Reasoning is included in output. Do not double-count either.
- The SDK ledger excludes judge usage from agent totals. Events also contain usage, but must NOT be added to the request ledger again.
- Missing fields remain unknown; observed partial sums are separately labeled. Provider cost is retained only where reported; no inferred bill is presented as actual.

For competitors, create a manifest mapping actual Harbor results (paths relative to the manifest):

```json
[
  {"path":"jobs/trial/result.json","arm":"pi","taskId":"repair-average","repetition":0,"comparisonKey":"matched-model-pilot-v1"}
]
```

```bash
node scripts/harness-lab/harbor-import.mjs manifest.json imported.json
node scripts/harness-lab/report.mjs imported.json
```

Harbor imports are explicitly labeled **adapter-run-total**, not invented per-request records. Cost may be adapter-estimated. Only binary `rewards.reward` values 0/1 are interpreted; other grading schemes stay ungraded. Exceptions remain failed attempts; absent timings remain unavailable. Preserve the original job configuration, checksums, result files and native logs. Compare ALL products through Harbor execution timings; do not mix native launcher timings and Harbor timings without a declared methodology.

## Quality and communication

Use file/state verification for correctness and completion. Separately blind and randomize output presentation for human review of completeness, clarity, concision and usability. Answer word count is descriptive, not a quality grade. Count user nudges and false claims that background work remains. In comprehension tests, check that readers can locate the answer and apply it—not just whether a judge likes the writing. No automatic clarity or verbosity score is claimed by this version.

## Optimization queue

| Experiment | Primary measurement | Must not regress |
|---|---|---|
| Follow-through / task lifecycle | false waiting claims, lost reports, user nudges | real running-work status; delivery exactly once |
| Parallel independent reads | verified completion time | permissions, ordering, cancellation, correct results |
| Smaller/discoverable catalogs | tokens, cache reuse, discovery turns | needed tools remain discoverable; clarification behavior |
| Summary cache shaping | compaction cost/time and continuation success | retained facts/constraints; failure leaves history unchanged |
| Delegation policy | parent + child total cost/time | output quality, usable partial reports, no silent false stops |
| Tool reliability | repair turns, errors, final file correctness | no fuzzy edits to the wrong location |
| Concise narration | reading burden, comprehension, user preference | completeness and necessary caveats |

One change per arm; same task/model/settings; randomize execution order; hold out independently authored tasks. Run cheap deterministic checks before requesting model spend. The three-task pilot is only the first plumbing/regression slice; broad workloads, genuine long-context tests and a publishable scorecard still need live evidence.

## Privacy and isolation

Native logs contain task text, tool inputs/outputs and generated files. Keep them private; sanitize before sharing. Worker HOME, user data and environment are private, secrets are encrypted with a process-only key, and the launcher redacts the supplied provider key from records. This is not general secret detection. **Private HOME is not an OS sandbox.** Live runs require a container marker or explicit `--unsafe-local`; the marker is an operational guard, not a security proof. Use dedicated containers and narrow provider keys. Do not mount personal files, credentials, Docker socket, or the running app's profile into tasks.
