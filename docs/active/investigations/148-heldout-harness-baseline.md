---
status: active
work_item: 148
---
# Heldout harness baseline: original 90 completed attempts

## Scope and conclusion

Offline analysis of **90 completed harnessComparison attempts: 87 verified passes, 3 verified failures**, five harnesses × six evaluation-only tasks × three repetitions. YouCoded and Claude Code each passed 18/18; Hermes, OpenCode and Pi each passed 17/18. All three failures concern the shift-schedule task. This is a small, system-as-configured baseline, **not a universal harness ranking or an equal-reasoning overhead experiment**.

The other parallel model cohort is excluded. No new provider calls, baseline reruns, source optimizations, app source edits, gateway configuration/process changes or commits were performed by this analysis. Original errors and results are preserved.

Machine-readable report: `scratch/harness-lab/heldout-harness-analysis-v1.json`. Bounded offline helper: `scratch/harness-lab/analyze-heldout-harness-v1.py`.

## Evidence and selection

- Original manifest: `scratch/harness-lab/objective-comparison-v3/manifest.json`.
- Journal: `scratch/harness-lab/objective-comparison-v3/events.jsonl`. The inspected journal contains 93 started/outcome pairs, of which exactly 90 outcomes have `JSON.parse(trialKey)[0] == "harnessComparison"`. Selection uses these completed outcome `jobId`s, **not every harness trial in the much larger manifest**. Three model outcomes are not analyzed.
- Only those 90 job directories were inspected: `scratch/harness-lab/objective-comparison-v3/jobs/<jobId>/<trial>/result.json`, `verifier/reward.txt`, `agent/client-timing.json`, and the three failed jobs' `verifier/test-stdout.txt`. No broad transcript sweep.
- Results, journal rewards and verifier reward files agree on all 90 outcomes. The JSON retains per-job evidence paths, checksums, client spans, request IDs, journal errors and failure text; `evidenceSha256` pins every selected evidence file read. It includes the source manifest hash and the journal's launch-manifest hashes without assuming they are identical.
- Private budget source: `/home/destin/.local/share/youcoded-harness-lab/router-estimated-ledger.json`, read only through a shell filter for the 90 IDs. No other private files, keys or configs were read. The report includes an allowlisted content-free snapshot of those 345 request records and its SHA-256; no global live-cohort budget totals are imported. No parent-exported ledger snapshot was supplied with the task.

## Verified outcomes and client elapsed

In the following table, each cell is **repetitions 0/1/2; median client seconds**. P = verified pass, F = verified failure. These medians include failed attempts; success-only timing would favor incomplete work.

| Task | Claude Code | Hermes | OpenCode | Pi | YouCoded |
|---|---:|---:|---:|---:|---:|
| correspondence-triage-actions | PPP; 14.92 | PPP; 39.26 | PPP; 16.02 | PPP; 10.86 | PPP; 11.77 |
| offset-aware-shift-schedule | PPP; 45.88 | PFP; 59.44 | PFP; 25.23 | PPF; 34.85 | PPP; 35.55 |
| privacy-safe-release | PPP; 12.52 | PPP; 34.10 | PPP; 12.69 | PPP; 7.72 | PPP; 9.62 |
| reimbursement-policy-decisions | PPP; 12.68 | PPP; 37.54 | PPP; 12.00 | PPP; 7.37 | PPP; 9.71 |
| service-contingency-decision | PPP; 10.42 | PPP; 36.59 | PPP; 10.26 | PPP; 8.43 | PPP; 8.17 |
| stock-allocation-with-reserve | PPP; 8.89 | PPP; 32.83 | PPP; 10.83 | PPP; 7.36 | PPP; 8.19 |
| **Passes / attempts; overall median** | **18/18; 12.60** | **17/18; 37.60** | **17/18; 12.48** | **17/18; 8.03** | **18/18; 9.86** |

Timing coverage is **90/90**. Actual schema is a list of spans with `startedAt`, `endedAt`, `seconds`, `completed`, `scope`; every selected span is completed with scope `client-command-excluding-post-run-export`. Sum `seconds` within each attempt. This excludes Harbor environment/agent setup and post-run export, but includes client-command startup. It is not pure model latency. Harbor execution and whole-trial durations are retained separately, not substituted. All 345 request `createdAt` timestamps fall within their job's Harbor agent-execution window; none was silently dropped as setup. No timings from the parallel model cohort are pooled.

### Three failure reasons (not infrastructure failures)

1. **Hermes, shift schedule, repetition 1**, job `oc-bfec9baca5ef66a6d25d7ee3`: verifier progressed to line 46 and failed reading `/app/schedule-summary.json` with `FileNotFoundError`. This establishes a missing required summary, not an inferred model/provider failure. Evidence: `scratch/harness-lab/objective-comparison-v3/jobs/oc-bfec9baca5ef66a6d25d7ee3/offset-aware-shift-schedule__CnU6GCq/verifier/test-stdout.txt`.
2. **OpenCode, shift schedule, repetition 1**, job `oc-4cc3e7e59e350d93b064869e`: verifier line 45, `AssertionError: schedule must minimize delay before applying the declared tie-breaks`. Evidence: `scratch/harness-lab/objective-comparison-v3/jobs/oc-4cc3e7e59e350d93b064869e/offset-aware-shift-schedule__dVQf4dh/verifier/test-stdout.txt`.
3. **Pi, shift schedule, repetition 2**, job `oc-edd4c2fd450cbb6144905b45`: same line-45 optimization assertion. Evidence: `scratch/harness-lab/objective-comparison-v3/jobs/oc-edd4c2fd450cbb6144905b45/offset-aware-shift-schedule__qxz4uoS/verifier/test-stdout.txt`.

The verifier text identifies the failed contract, not a deeper behavioral cause. No failed output was repaired or rerun. All selected Harbor `exception_info` values are null and journal infrastructure/runner/cleanup/interruption error flags are empty/false; request-level upstream failures below still remain in accounting.

## Physical requests, tokens and cost

**345 recorded physical gateway requests**, comprising 326 settled, six upstream-error and 13 unknown. These are recorded upstream dispatch reservations, not logical assistant turns. Hidden provider retries and pre-dispatch rejections are not reconstructed; complete provider-internal physical-request counts are unavailable.

Input and output values below are observed token totals, **not complete totals when coverage is partial**. Input already includes cache-read/write tokens; do not add cache again. Reasoning is included in output, not added to it.

| Harness | Requests | Input | Output | Cache read | Cache write | Input/output/cache coverage | Reasoning observed; coverage |
|---|---:|---:|---:|---:|---:|---:|---:|
| Claude Code | 72 | 2,638,619 | 56,205 | 2,348,930 | 289,545 | 72/72 | unknown; 0/72 |
| Hermes | 75 | 893,877 | 34,069 | 0 | 0 | 62/75 | 17,586; 62/75 |
| OpenCode | 80 | 759,005 | 34,276 | 649,049 | 109,724 | 80/80 | 14,755; 80/80 |
| Pi | 59 | 172,523 | 29,266 | 0 | 0 | 53/59 | 14,451; 53/59 |
| YouCoded | 59 | 847,849 | 42,711 | 654,028 | 193,667 | 59/59 | 25,384; 59/59 |
| **Observed subtotal** | **345** | **5,311,873** | **196,527** | **3,652,007** | **592,936** | **326/345** | **72,176; 254/345** |

Cache zeros are explicitly reported by observed records, not filled for missing requests. Nineteen requests lack all five token metrics; another 72 (Claude Code's Anthropic Messages records) lack reasoning telemetry. Therefore all-cohort complete token totals remain null. The JSON carries completeTotal/observedSubtotal/knownRequests/missingRequests for each field at attempt, harness and cohort levels.

| Harness | Confirmed provider-reported USD | Cost coverage | Unknown-request estimate USD (not actual) |
|---|---:|---:|---:|
| Claude Code | 0.087799325 | 72/72 | none |
| Hermes | 0.106422200 | 62/75 | 0.521055625 |
| OpenCode | 0.037367190 | 80/80 | none |
| Pi | 0.031885300 | 53/59 | 0.193162500 |
| YouCoded | 0.066644580 | 59/59 | none |
| **Total** | **0.330118595** | **326/345** | **0.714218125 across 19** |

“Confirmed” means `actualCostUsd` recorded from provider-reported usage, **not independent invoice reconciliation**. Unknown estimates equal retained reservations in these records; they are not observed charges and are not added to confirmed cost to claim a precise bill. Complete cohort cost is unknown. Harness-local Harbor cost/token exports are intentionally not used for cross-client totals: they have different conventions (including Hermes's exported token zeros) and do not replace gateway evidence.

### Schema basis

`normalizeAnthropicUsage` and `normalizeOpenRouterUsage` in `scripts/harness-lab/openrouter-policy.mjs` establish these semantics:

- Messages input = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`; reasoning telemetry is null.
- Chat input = `prompt_tokens`; cache fields come from prompt details; reasoning from completion details. Omitted values remain null.
- `createdAt`/`settledAt` are ISO strings, not the older report's numeric `startedAt`. No `usageComplete` flag exists in this ledger schema.

`comparison_report.py` was inspected but **not executed**: it requires `trials.json`/`protocol.json`, older timestamp/cache fields and a different ledger schema. Reusing its totals would be invalid. `evaluation-audit.mjs` requires a fully declared matched-configuration object (reasoning, environment, cache condition and fingerprints); this evidence was not coerced into a passing equality audit. Actual wire controls below demonstrate a system-as-configured comparison instead.

## Actual request controls: same route, different settings

All 345 rows record model `anthropic/claude-haiku-5.5`, provider `anthropic` (the same first-party Haiku route), and effective maximum output **8192**. Shared request cap 20/task and timeout 180 seconds are manifest declarations; context capacities/compaction are explicitly unmatched. Protocol and reasoning settings differ:

| Harness | Protocol | Requested output limit | Reasoning/output controls, request counts |
|---|---|---:|---|
| Claude Code | anthropic-messages | 8192 | `outputConfigEffort=high` on 72/72; thinking type/budget absent |
| Hermes | openai-chat | absent | `topLevelReasoningEffort=medium` on 57/75, `none` on 18/75 |
| OpenCode | openai-chat | 32000 | nested `reasoningEffort=none` on 18/80, absent on 62/80 |
| Pi | openai-chat | 16384 | captured reasoning controls absent on 59/59 |
| YouCoded | openai-chat | 16000 | captured reasoning controls absent on 59/59 |

Temperature, top_p, reasoningEnabled, reasoningMaxTokens, thinkingType and thinkingBudgetTokens are null throughout. **Null does not mean disabled.** In particular, absent reasoning controls coexist with measured reasoning output; a `none` field on one request class does not establish that the whole client ran without reasoning. The report preserves every complete control variant and its frequency rather than collapsing it to a single “equal settings” claim.

## Paired descriptive comparisons and uncertainty

Existing `scripts/harness-lab/paired-stats.mjs::pairedTaskStats` was used directly: pair by task and repetition, average repetitions within each task, equal task weight, 10,000 task-cluster percentile bootstrap samples, seed 148. All comparisons have 18 pairs across six tasks, no missing pairs. Full JSON contains all ten harness pairs for pass outcome and client seconds, plus individual deltas.

Here, differences are **other harness minus YouCoded**; positive seconds mean the other harness took longer. These are mean paired deltas, not differences between pooled medians.

| Other harness | Mean client seconds delta | Descriptive 95% interval | Mean pass-rate delta | Descriptive 95% interval |
|---|---:|---:|---:|---:|
| Claude Code | +2.99 | +1.77 to +4.61 | 0 | 0 to 0 |
| Hermes | +26.15 | +24.61 to +27.43 | −0.0556 | −0.1667 to 0 |
| OpenCode | +0.62 | −3.17 to +2.82 | −0.0556 | −0.1667 to 0 |
| Pi | −2.27 | −4.17 to −0.84 | −0.0556 | −0.1667 to 0 |

The zero-width pass interval for Claude Code is a consequence of identical observed outcomes, **not evidence of true equivalence or perfect reliability**. Only six task templates were sampled; repeats do not add independent task diversity. Templates may be related; bootstrap assumptions, multiple comparisons, model drift and native-setting/order/cache confounds prevent population or causal claims. No multiplicity correction or significance badges. Pi's shorter observed times include a failed schedule; OpenCode's very short schedule median likewise includes a failed attempt. Neither is a quality-adjusted speed advantage.

## Candidates for a next targeted experiment (not implemented)

1. **Reduce repeated prompt/tool payload without weakening safeguards.** YouCoded used the same 59 gateway requests as Pi but observed inclusive input was 847,849 versus Pi's partial 172,523; YouCoded also wrote 193,667 cache tokens. Claude Code's much larger input and caching further show that request count alone does not explain payload. Candidate: measure a capability-gated tool-description/prompt assembly variant against untouched YouCoded. Do not remove permission, read-before-edit, untrusted-content, verification or delegation safeguards. Capture content-free prompt/tool byte attribution before assigning causality; Pi's six missing usages and different tool coverage prohibit claiming a fivefold achievable reduction.
2. **Make reasoning policy explicit before testing a narrower effort budget.** YouCoded recorded 25,384 reasoning tokens versus OpenCode's 14,755, and output totals 42,711 versus 34,276, with different control shapes. Candidate: separately test an explicit, provider-supported reasoning policy, preserving output/request/time ceilings and measuring correctness, token coverage and elapsed. Do not infer that absent controls mean off or that reducing reasoning preserves the schedule optimization success. Keep model, route, task pairs and safety policy fixed; do not merge results into this baseline.
3. **Completion/constraint validation as a safety gate for efficiency experiments.** All three failures were scheduling-contract violations (missing summary or nonoptimal schedule). Before optimizing multi-file workflows, test a bounded user-requirement checklist/output-presence and objective-validation step on calibration tasks, not by installing heldout answers or changing the verifier. Preserve all raw errors and count the added requests/time. This may cost more per attempt but avoid false speed gains from incomplete work. YouCoded already passed all three schedule repetitions, so no observed defect in YouCoded is asserted.

Any future paid experiment needs separate authorization. Do not change the active gateway, live app, current cohort or original results to perform it. Next integration/run decisions belong to the parent session; no rerun is required to consume this report.

## Additional offline payload attribution

Parent inspection of the18completed YouCoded jobs found content-free `requestShape` fields for all59SDK attempts. Each recorded6753system bytes and30377tool-schema bytes; history ranged560–7080bytes. Summed across attempts:398427system bytes,1792243tool bytes,156606history bytes. Tool schemas account for76.35%of these recorded payload bytes. Two system/tool hash pairs were observed despite equal byte lengths.

These are serialized request-shape bytes, not provider token counts, network traffic measurements, or avoidable billing. Caching and required capabilities matter. This narrows the next offline investigation to tool-schema composition; it does not justify removing tools or safeguards, or claiming76%cost savings. No model call was needed for this attribution.

## Verification record

- `python3 scratch/harness-lab/analyze-heldout-harness-v1.py > /tmp/148-heldout-analysis-output.json` completed successfully, generating the JSON and enforcing 90 unique attempts, five agents, six tasks, repetitions 0/1/2 in every cell, reward agreement and valid timing spans.
- `node --test scripts/harness-lab/paired-stats.test.mjs scripts/harness-lab/openrouter-policy.test.mjs scripts/harness-lab/evaluation-audit.test.mjs` → `tests 15`, `pass 15`, `fail 0`, `skipped 0` (exit 0).
- Independent JSON/count/hash assertions → `PASS: 90 unique attempts = 87 passes + 3 failures; 345 allowlisted requests; 20 paired analyses; all selected evidence hashes unchanged.` Token coverage was 326/345; reasoning coverage 254/345. Incomplete token telemetry affects 10 Hermes attempts and six Pi attempts.
- Per-harness status reconciliation: Hermes has 62 settled, six upstream-error and seven unknown requests; Pi has 53 settled and six unknown. Other harnesses are entirely settled. No error records were erased.
- New-file diff reviewed with `git diff --no-index -- /dev/null docs/active/investigations/148-heldout-harness-baseline.md` (exit 1 means differences, as expected for a new file). Scratch files are ignored by Git but exist on disk. Desktop `scripts/verify.sh` is not appropriate here: no desktop code changed. No paid evaluator was run.
