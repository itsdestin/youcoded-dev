---
status: active
work_item: 148
---
# Finite comparison scope and release gates

## Objective core

The next numerical report should separate:
1. Same-model, first-party Haiku across the five harnesses.
2. Five-model panel under fixed YouCoded runtime/configuration.
3. Diagnostic lifecycle probes, reported independently rather than pooled into a quality ranking.

The six frozen evaluation-only cases are the held-out workload. Thirteen development cases remain separately labeled regression evidence. Three repetitions per independently defined task are planned; repeated trials do not substitute for task diversity. Gemini's failed qualification stays in evidence and does not justify dropping the model or selectively rerunning until it passes.

## What is qualified

- All five harnesses: basic same-session editing and between-turn external-edit preservation, verified by controller-owned evidence and independent files.
- Native model panel: transport/tool execution qualified; Gemini's final-file outcome failed, others passed the small task.
- Native-only actual background helper/report/parent continuation and exact-question oracle test passed. The latter is not spontaneous clarification or real human intervention.
- Native controlled-window retention passed with observed runtime window and automatic compaction. Pi/Hermes/Claude completed the same long-history workload and passed files; native Pi and Claude compaction markers were observed. Their requested controls do not establish matched capacities or trigger policies. OpenCode's corrected-config run also passed all15 turns and file verification, with an auto:true native compaction part and completed summary message. Its original zero-call configuration failure remains preserved.

## Explicit exclusions from comparative claims

- False-waiting rates without complete same-checkpoint work-state snapshots.
- Cross-client native clarification-tool equivalence or semantic necessity scores.
- Synchronized within-turn Read/Edit race parity (between-turn preservation is a separate measured condition).
- Equal context-window/compaction-policy claims not supported by runtime evidence.
- Human-calibrated communication quality. Objective checks are primary; subjective model scores stay provisional.

These remain unknown or unsupported cells, not zero scores. A report covering the objective core may be useful, but must not be called comprehensive coverage of all originally requested behavior.

## Request-setting telemetry verified

The gateway now stores allowlisted actual upstream controls in each new reservation: protocol; requested/effective output caps; temperature/top_p; nested reasoning enabled/effort/token budget; distinct top-level reasoning_effort; native thinking type/budget; output-config effort; pinned model/provider. Known none/adaptive values are retained; unset/unsupported values remain null. No prompts, tools, headers, arbitrary field values or credentials are recorded. Tests pin clamping, distinct conflicting effort fields and secret-canary exclusion. This instrumentation does not retroactively fill missing controls in older trials.

The original objective plan contained570trials:180held-out primary trials and390development/regression trials. Its illustrative estimates wereUSD4.52/USD7.91 at50k/100k processed input tokens per trial, before overhead. Those were planning assumptions, not measured costs or current headroom. The390development combinations are now deferred; the remaining model-panel cells are stopped/unmeasured. Budget admission remains authoritative. See `148-current-state.md` for current exposure and exact coverage.

## Final execution gate

Before the full paid batch, freeze actual model/provider revisions, reasoning settings, effective output caps, task/verifier hashes, harness versions, image identity, permission settings, cache/order conditions and request/elapsed budgets. Current qualification profiles vary in output/reasoning defaults and must not silently become matched controls. Audit those differences against captured requests, not declarations alone. The USD15 shared accounting limit remains in force; the key's separate USD20 limit grants no additional spending.

The user subsequently authorized proceeding after a final self-review: “check your own work one more time for anything that may cause issues for us. then you may proceed as you see fit”. This authorizes the proposed objective batch within the existing cumulative USD15 ceiling; it does not authorize shipping or additional spending. Launch still depends on technical checks, not another generic approval request.

Prelaunch review reproduced and corrected two defects: SSE parsing wrongly bounded entire transport chunks, and text-mode preservation checks normalized line endings. Regression tests now cover chunk-grouping invariance and CRLF mutations of every preserved held-out input. The corrected `coverage-v3-heldout-frozen` changes only six verifier files; instructions/fixtures and the complete historical v2 export remain untouched (`heldout-v3-provenance.json`).

The preserved original execution manifest is `scratch/harness-lab/objective-comparison-v3/manifest.json`:570 scoped trial grants,20 physical requests/trial,8192 gateway output ceiling,180-second agent timeout,5GiB minimum free space,USD0.15 pre-trial headroom stop. All570 commands passed offline validation. This is a system-as-configured comparison with native prompt/tool/reasoning defaults retained and measured, not an isolated equal-reasoning harness-overhead experiment. The actual manifest records snapshots, order, route metadata and these limitations.

The runner review additionally found incomplete timeout cleanup and unhashed executable Python-cache admission. Both were fixed and re-reviewed; parent verification passed72Python and144Node tests. A real offline Docker cleanup check stopped the exact target and preserved the unrelated control container. The superseded v2 candidate was never launched. The v3 reviewed source copies and every manifest file hash were checked before starting `run.sh` under the approved cumulative cap. Execution log: `/tmp/yc-objective-v3-run.log`; durable progress and outcomes: `objective-comparison-v3/events.jsonl`. A started batch is not a completed comparison.

## Reduced held-out baseline and iteration-loop priority

After discussing runtime and workflow purpose, the user delegated proceeding with the recommended smaller baseline. The390development-regression combinations are deferred, not deleted. Original serial execution plus continuation-1 recorded97attempts:91passes,4verification failures and2infrastructure failures. All90held-out harness comparisons are recorded. The DeepSeek model cells encountered an upstream503 and then a separate180-second timeout; these attempts remain, and its16unstarted held-out cells are explicitly unmeasured rather than scored zero or retried.

`scratch/harness-lab/heldout-parallel-v1/manifest.json` schedules the67remaining non-DeepSeek held-out model cells with2workers under the same cumulative USD15 budget. It preserves the native build, fixtures, model adapter and gateway policy bytes, but uses the reviewed future-run coordinator/cleanup source and a new contention-affected timing cohort. Serial and parallel elapsed times must not be pooled. `coverage-decision.json` records blocked/deferred coverage. This parallel cohort stopped after4attempts: Haiku passed, Gemini failed verification, Qwen had a stream-processing failure, and another Qwen trial was canceled by the coordinator. Cleanup was confirmed; no further broad run is active. The final Qwen stream cause remains unknown. The completed90-trial harness baseline is analyzed in `148-heldout-harness-baseline.md`:87passes/3verification failures. Across original+continuation+parallel,101study attempts are preserved:92passes,5verification failures,4infrastructure/interruption outcomes;79held-out cells remain unattempted, plus390deferred development cells. The broad570trial plan remains optional, not the default development loop. The targeted serial A/A workflow has since passed its separate2trial live calibration.
