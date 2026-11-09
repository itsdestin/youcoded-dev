# Targeted development checks

Use this workflow for a concrete YouCoded change. Do not expand every edit into the full harness/model benchmark.

## Normal loop

1. **Free checks first:** relevant unit tests, verifiers and deterministic runtime tests.
2. **Preview a smoke comparison:** one model, explicit baseline/candidate build directories, one to three development tasks, one repetition. This yields2–6trials, not570.
3. **Inspect and approve execution separately:** verify the task selection, matching settings, snapshot hashes, provider route, existing cumulative ledger and budget. The planner does not perform this step or spend money.
4. **Confirm a promising change:** same selected tasks with three repetitions, yielding6–18trials. Check verified correctness and safety before interpreting cost, requests, tokens or time.
5. **Occasional broad benchmark:** refresh competitors/model choices when that is the actual question, not after every change.

The assistant handles these commands. A useful request is: “Preview a smoke comparison of this change against the frozen baseline on these two development tasks; do not spend yet.” No desktop UI or automatic CI paid run is installed.

## Offline planner

```bash
node scripts/harness-lab/targeted-plan.mjs INPUT.json NEW_OUTPUT_DIR
node scripts/harness-lab/targeted-plan.mjs --help
```

Example input (replace the two build paths with actual built desktop directories):

```json
{
  "baselineDesktopDir": "/absolute/baseline/desktop",
  "candidateDesktopDir": "/absolute/candidate/desktop",
  "model": "anthropic/claude-haiku-5.5",
  "pinnedProvider": "anthropic",
  "tasks": ["coherent-record-update", "source-data-injection-resistance"],
  "profile": "smoke",
  "assumedInputTokens": 50000,
  "assumedOutputTokens": 3000,
  "budgetUsd": 0.5
}
```

`profile` is `smoke` or `confirmation`. Task IDs must be one to three distinct entries from the13development cases listed by `--help`; held-out and unknown tasks are refused. Provider labels are explicit but not checked online. Token assumptions are cumulative per-trial planning assumptions, not actual request caps. Catalog prices and the resulting estimate are illustrative; cache creation, context tiers, retries, setup and auxiliary calls may change billed cost. `budgetUsd` is a proposed experiment planning ceiling, not spending approval and never a replacement for the existing cumulative budget guard.

The output directory must not exist. It contains:
- `plan.json`: paired cells, rotated arm order, build/task fingerprints, explicit assumptions, warnings and illustrative cost.
- `tasks/`: only selected exported fixtures and separate verifier files. Oracle solution objects are not exported. Verifier files must not be mounted into the agent environment.

Build files are **hashed in place**, not copied or frozen. Dependencies and future execution settings are not validated by the preview. Recheck hashes and prepare immutable execution snapshots before live use. Plans always have `canRun:false` and `executionAuthorized:false`; there is no paid-execution option in this command. This is the preview/export piece. The `targeted_workflow.py` command below handles preparation, an explicitly authorized execution handoff and reporting. Its offline implementation and focused safety review are complete; parent verification passed130Python tests and247combined workspace/native-lab Node tests. A subsequent serial two-trial live A/A calibration passed after fixing a generated-token prefix mismatch; the actual-adapter regression brought the Python suite to131passing tests. See the live receipt below.

## Preparation, execution and report entry point

The assistant operates these stages; they are not commands the user needs to type:

```bash
python3 -B scripts/harness-lab/targeted_workflow.py prepare --plan /absolute/plan/plan.json --settings /absolute/settings.json --out /absolute/new-experiment
python3 -B scripts/harness-lab/targeted_workflow.py check --manifest /absolute/new-experiment/prepared-manifest.json
python3 -B scripts/harness-lab/targeted_workflow.py run --manifest /absolute/new-experiment/prepared-manifest.json --execute --authorization /absolute/approved-receipt.json --key-file /absolute/private-provider-key
python3 -B scripts/harness-lab/targeted_workflow.py report --manifest /absolute/new-experiment/execution-manifest.json --out /absolute/new-report
```

Preparation is offline. It revalidates the original plan, copies and hashes both builds, exports only the selected tasks, creates scoped opaque gateway tokens, and writes an **unapproved** authorization template. Required settings are `sourceDir` (current lab source), executable `harbor`, pinned `image`, existing `sharedLedgerPath`, explicit `gatePolicy`, `workers` (1–8), and `stopMarginUsd`. Optional settings are `expectedImageID` (required when the image reference is not digest-pinned) and `synthetic` (labels offline test evidence, not an execution-safety bypass). The policy requires model/provider, context limit, output limit8192, conservative prompt/cache-write/completion prices, and reservation amount. Runtime request/time limits remain20requests and180seconds.

The run command requires both `--execute` and an exact approval receipt with `approved:true`, `preparedManifestSha256`, `scopeID`, `experimentLimitUsd`, and `sharedLimitUsd`. The assistant creates that approved receipt only after the user's separate paid-run authorization. Approval is bound to the prepared manifest and caps; drift is refused before Docker/key handling. Always pass the prepared manifest to `run`, including on resume. The generated execution manifest is used for completed or partial reporting.

Both arms share the existing ledger. Experiment-scoped reservation admission enforces the plan allowance alongside—not instead of—the cumulative spending ceiling. Failed/unknown reservations remain counted, scope limits cannot silently change, and a trial cannot move to a fresh scope to avoid prior charges. Estimated admission still carries the documented estimation/billing-delay risk; it is not a guaranteed exact bill cap.

The wrapper starts only its dedicated gateway/network, invokes the existing serial or parallel runner, forwards stop signals and records scoped cleanup. Ambiguous creation or cleanup failures require inspection; it does not guess ownership or erase evidence. Resume skips valid completed attempts but refuses interrupted/failed attempts needing review. Parallel timing remains a distinct contention-affected cohort.

The report reconciles journal outcomes with original result/reward files, preserves parent-level parallel failures, and keeps unstarted/pending cost and token totals unknown. It emits `summary.json` and `report.md` in a fresh directory. The same entry point now imports adjacent raw activity through `evaluation-import.mjs` → `activity-normalize.mjs` → shared analyzers; normalized content-free evidence and source hashes are embedded in each trial. Provider-hidden retries and unknown telemetry are not invented.

The expanded Markdown always renders 13 grouped families: verified outcomes; physical requests; settlement/capture coverage; tokens/cache; confirmed cost versus estimates; timing/paired differences; interaction burden; edits/errors/latencies/order; supervision/false claims; continuation; safety/recovery/budgets; configuration/payload attribution/grader/human calibration; activity timeline. Missing collectors have explicit reasons rather than zero counts. Counts are parent-scope observations unless capture completeness is established. Historical native tool spans are **submission-to-result latency including queuing**, never execution time. Native timestamps and ATIF step times do not establish reasoning, writing or idle durations.

This is a bounded reporting/collection repair, not completion of the evaluation product contract or new mode/task planning. New native runs now collect monotonic SDK stream envelopes, actual tool execution and approval waits; gateway ledger rows collect content-free protocol-specific delivery timing for all clients. The shared pipeline prints those measurements and receipt coverage. Separate process clocks are not silently aligned. Historical captures cannot acquire missing data retroactively. Continuous scheduler/dependency state, broader continuation/recovery and semantic episodes, safety/budget assessments and human calibration remain future collection/validation work. See [SCORING.md](SCORING.md) for the versioned evidence schema and adapter limitations. Regenerate into a **new** directory; never replace the original report or raw jobs.

Offline integration tests cover synthetic serial/parallel A/A preparation → execution stub → report, partial/interrupted evidence, scope protection and signal-acquisition gaps. These are plumbing tests, **not live model results**. A separately approved live serial A/A check is now recorded in `docs/active/investigations/148-targeted-live-aa-calibration.md`: two verified passes, six settled requests, USD0.00359775provider-reported cost, successful cleanup, with the initial zero-call infrastructure failure preserved. This qualifies that small serial path, not the full model panel or parallel mode. Cache differences made identical-build arms cost different amounts; do not call that a candidate improvement.

## Offline enriched historical report

The existing serial A/A evidence has been reprocessed without provider calls into `scratch/harness-lab/targeted-live-aa-v2-enriched-evidence-v3/{summary.json,report.md}`. Original jobs and reports are unchanged. Both trials reconcile their native event capture counts, but this does not fill missing phase, safety, recovery or human-calibration collectors. The visible cache difference and A/A warning remain beside the paired deltas. `summary.json` records raw-source hashes, version-1 activity evidence and hashes of the ten analyzer/schema source files.

`activity-baseline-samples-v3/samples.json` under the same scratch root demonstrates the identical pipeline on one existing objective-comparison capture for each of YouCoded, Pi, Claude Code, OpenCode and Hermes. These **five samples are not a cohort-wide completeness audit**. ATIF tool results retain correlation/error availability but have no invented result timestamps. The sample bundle and selected A/A activity records were validated against `activity-evidence.schema.json` offline.

## Verified calibration example

`scratch/harness-lab/targeted-aa-example-input.json` uses the same recorded build for both arms. Its output is `scratch/harness-lab/targeted-aa-example-v1/plan.json`:

- **2 development tasks × 2 arms × 1 repetition = 4 planned trials.**
- Explicit **A/A calibration** warning; no candidate improvement exists in this example.
- Illustrative estimate **USD0.026** against a proposed **USD0.50** planning ceiling, using 50,000 input / 3,000 output tokens per trial and the recorded catalog prices.
- Build fingerprints, exported file hashes and fixture/oracle separation verified offline.
- **Zero paid calls.** The example is not a result or evidence of an improvement.

## What to compare after an authorized run

Report verified pass/fail/infrastructure outcomes first; preserve every attempt. Then report paired request count, known input/output/cache/reasoning tokens, confirmed cost versus unresolved estimates, and elapsed time with its measurement scope. Do not mix parallel-contention timing with serial timing, fill missing usage with zero, or interpret one smoke repetition as reliable improvement. If tool descriptions change, record content-free byte attribution and preserve all permission, read-before-edit, untrusted-data and follow-through requirements.

See [EXECUTION.md](EXECUTION.md) for the gateway and reviewed serial/parallel execution infrastructure, and [SCORING.md](SCORING.md) for outcome/measurement distinctions.
