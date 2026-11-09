---
status: active
work_item: 148
---
# Bounded future activity collection and verifier containment

This delivers the collection unit in `148-activity-collection.md`, not the full evaluation-product contract. No paid/provider calls, production-app access, dependency installations, container experiments, commits or merges occurred.

## Delivered path

- Native: `lab-activity.mjs` records a unique process monotonic clock and explicit worker observation window. `lab-observer.mjs` preserves stream chunks/backpressure/cancellation while recording SDK requests, first observed chunk, and actual reasoning/text/tool-input phase kinds without text. Empty phase declarations/heartbeats do not become observed reasoning.
- Optional runtime seam: `harness/activity-diagnostics.ts`, wired by the host into root/child sessions, brackets actual `tool.execute` awaits and driver asks. Callback exceptions do not control execution/permissions; absent callbacks perform no diagnostic I/O, clock reads or transcript emission. Native worker uses execution diagnostics plus authoritative `PermissionRequest`/`PermissionResolved` hook receipts for all permission/clarification asks, deduplicating re-announcements and not double-counting the narrower driver ask seam.
- Launcher: independent spawn-to-close monotonic envelope includes runtime startup/worker export. It is separate from the worker clock, not subtracted from it.
- Shared gateway: `gateway-activity.mjs` observes OpenAI-chat and Anthropic-Messages phase kinds; reservation-ID mapping and open observation metadata are durable before upstream dispatch. Final diagnostics retain complete/incomplete/failed/interrupted status. Request end is recorded before post-stream charge persistence. Existing per-line SSE bounds, response bytes, usage settlement, backpressure and failure retention remain tested. No whole-network-chunk limit was added.
- Analysis/report: `activity-receipts.mjs` validates receipt identity/order/status, makes same-clock scoped intervals, request gaps and endpoint-split unions/overlap/unknown time. Targeted loading selects native and ledger activity by reconciled trial/request identity. Actual execution, queue/preparation/ask latency, first-chunk delays, inter-request gaps, phase envelopes and receipt/window coverage print in the existing shared report path. Native tool latency now prefers correlated monotonic receipts, avoiding coarse wall-clock latency mixed with sub-ms execution duration.
- Schemas: `activity-capture.schema.json` defines raw content-free receipts; optional collected fields extend `activity-evidence.schema.json` version 1. Source/subset hashes accompany reports.

## Exact offline artifacts

Final new collection demonstration:

`scratch/harness-lab/activity-collection-offline-v3/`

Files: `native-scripted-run.json`, `gateway-scripted-receipts.json`, `activity.json`, `summary.json`, `source-hashes.json`, `report.md`. Earlier v1/v2 derived examples remain preserved. The final Markdown was read back.

Executed:

```sh
node scripts/harness-lab/activity-collection-example.mjs /home/destin/youcoded-dev/worktrees/sessions/148-harness-performance-lab/scratch/harness-lab/activity-collection-offline-v3
```

Actual output:

```json
{"providerCalls":0,"synthetic":true,"nativeWriteVerified":true,"nativeReceipts":26,"gatewayReceipts":12,"out":"/home/destin/youcoded-dev/worktrees/sessions/148-harness-performance-lab/scratch/harness-lab/activity-collection-offline-v3"}
```

These are independent scripted native and local gateway controls, not paired model-performance measurements. The native profile uses the actual SDK parser, permission broker and production Write tool with external fetch forbidden; only its exact known Write can receive scripted approval. Independent filesystem verification checked `production host smoke\n`. The gateway uses an injected local transport stub and no provider/billing transport.

Measured native sample (milliseconds; descriptive fixture values, not thresholds): submission-to-result **5.045543**, actual `tool.execute` **2.479420**, submission-to-execution **2.426060**, observed reasoning delivery envelope **1.289273**, answer envelope **0.168826**, argument envelope **0.324948**, approval wait **0.118081**. Launcher spawn-to-close **610.837078**. All native tool durations use the same declared worker clock. Gateway independently observed reasoning/text/argument envelopes on its own clock.

Before: historical native/ATIF records had no execution/approval/stream-phase boundaries and only event-envelope timing. After: future native captures measure the observed seams above, while future gateway captures measure protocol delivery envelopes and per-request status for every client using that shared transport. Missing historical signals remain missing; the original A/A evidence was reprocessed into fresh `scratch/harness-lab/targeted-live-aa-v2-enriched-evidence-v5/`, still with `collectedActivity:null` for both trials.

Validation using the existing Harbor Python environment and `jsonschema` passed both raw capture schemas, the derived evidence schema, every recorded source hash, all historical raw/analyzer hashes, all 13 rendered family headings, and payload/key canary absence from aggregates. No validator was installed.

## Failing-first and final verification

Red logs preserve the gaps before implementation:
- `/tmp/activity-collection-observer-red.log`: streaming phase receipts absent.
- `/tmp/activity-runtime-red.log`: actual native smoke lacked execution capture.
- `/tmp/activity-render-red.log`: collected stream evidence was not consumed/printed.
- `/tmp/activity-profile-red.log`: reasoning/tool-argument production-driver fixture unsupported.
- `/tmp/activity-approval-red.log`: actual approval lane absent in that fixture.
- `/tmp/activity-monotonic-tool-red.log`: future tool latency still used coarse historical timestamps.

One new arithmetic expectation initially counted six unknown request milliseconds where the controlled receipt timestamps establish four; the test expectation was corrected. A new gateway-cohort check initially read before final diagnostic persistence; it now awaits the actual gateway drain signal, not a sleep. The first desktop verification caught an eight-line host-driver budget overage; adjacent verbose comments were shortened rather than raising the budget. No test failure was dismissed as flaky.

Final commands and actual output:

```sh
node --test scripts/harness-lab/*.test.mjs youcoded/desktop/test-engine/lab-*.test.mjs
```

`/tmp/activity-accepted-node.log`: **284 tests, 284 pass, 0 fail, 0 skipped**.

```sh
PYTHONPATH=scripts/harness-lab /tmp/yc-harbor-check-148/bin/python -m unittest discover -s scripts/harness-lab -p 'test_*.py'
```

`/tmp/activity-accepted-python.log`:

```text
Ran 148 tests in 92.374s
OK
```

```sh
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/148-harness-performance-lab/youcoded
```

`/tmp/activity-accepted-desktop.log`: types, test types, related tests, knip, lint, design lint and ast-grep all **PASS**; `OK — all checks passed.` Related detail: **144 passed / 1 skipped files; 3882 passed / 36 skipped tests**. Full logs: `scratch/verify-20261021-114202-3215862/`. Android and Worker checks were not run.

## Verifier review containment and narrow corrections

The requested specialist report path was absent at read time; the concrete parent steer supplied the findings. Reproductions ran against disposable files only.

- `/tmp/comparison-verifier-security-red.log` reproduces plain early exit, forged-success stdout and a temporary-file tamper probe reaching submitted code and exiting zero; the public Python API also spawned that code before correction.
- Default `comparison-verify.cjs` invocation and public `comparison_tasks.verify_against` now fail closed before loading/running submitted code. Exported verifier shells have no trusted-fixture flag, and regression tests prove forged success/early exit yields reward **0**.
- The old local helper `comparison_tasks.verify` is retained ONLY for known trusted developer/reference fixtures. It calls the explicitly named `qualify_trusted_fixture_against` and passes `--trusted-fixture-qualification`; positive results explicitly say `submissionAcceptance:false`. This is a trust declaration, not a secure sandbox or real-submission acceptance path. Do not use it on arbitrary submissions, or add its flag to exported shells.
- `/tmp/comparison-size-hash-red.log` proves removing either SHA or size verification passed the former trusted qualification checks. Independent same-length tampering and a genuinely signed wrong-size/correct-digest manifest now pin those gates separately.
- `/tmp/comparison-loader-review-red.log` proves ordinary multiline/namespace/default-plus-named imports were rejected. The trusted compatibility loader now supports the tested pinned syntax variants; it is not a full TS compiler or a security boundary.
- Parent-owned `evaluation_workflow.py` and `test_evaluation_workflow.py` were not edited. The parent's schema-2 whole-matrix admission block remains intact and tested. No qualification bypass or provider orchestration was added.

## Remaining boundaries

Measured phase spans are delivery envelopes, **not cognition**. OpenAI-chat has delta/terminal rather than native per-channel phase lifecycle; its envelopes are bounded by observed payload/terminal receipts, not hidden provider-compute boundaries. SDK first-byte means first SDK chunk; gateway first-byte means upstream body bytes. Independent clocks are not implicitly aligned; gateway cohort gaps exclude client startup/finalization. Outside-request gaps stay unknown under censored/dropped/invalid coverage. Stop receipts are points, not continuous Stop-held/idle state.

Actual native execution measures the awaited `tool.execute` function, not an independently running background shell's entire lifetime. Continuous scheduler/dependency/background-lifetime coverage, validated semantic false-wait/test claims, actual recovery, human calibration and the full modes/report bridge remain incomplete. Historical captures are not retroactively upgraded. Whole-matrix no-provider adapter/build/image/mount qualification and a genuinely isolated untrusted-execution/trusted-acceptance design are still blockers; real schema-2 execution must remain disabled. This unit does not complete the entire evaluator contract.
