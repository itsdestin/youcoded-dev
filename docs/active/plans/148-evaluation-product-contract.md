---
status: active
work_item: 148
---
# Repeatable evaluation modes and complete reports

## Authority and correction

Destin explicitly requested repair of the evaluation/report infrastructure after the delivered compact report omitted much of the agreed analysis. This contract supersedes the narrow targeted-report acceptance boundary; existing benchmark evidence and failures remain immutable. Implementing scoring modules does not satisfy a measurement requirement: collection, normalization, analysis, visible reporting and end-to-end verification must all be connected.

The user requires message/tool-call burden, edit sequences, tool durations, repeated failed calls, clarification/nudge burden, false waiting, recovery, and time between calls or outside observed thinking/writing. These are not optional follow-on work. Missing historical evidence must remain visible; it cannot be fabricated or silently omitted.

Implementation and offline verification are authorized. New paid runs remain separately scoped under the existing cumulative USD15 guard. No production-app experiments, commits, shipping, or broad benchmark restart.

## Run modes

The public names below are the intended operator-facing vocabulary. Preserve existing commands as compatibility entry points where safe.

| Mode | Arms | Workload | Purpose |
|---|---|---|---|
| `basic` | Explicit YouCoded baseline build versus candidate build | Small selected development task set; reuse the existing bounded smoke/confirmation profiles | Fast daily before/after iteration |
| `compare` | Explicit YouCoded build versus pinned Claude Code version | Exactly three reviewed, substantial, resettable development tasks | Explain practical harness gaps without running the whole matrix |
| `thorough` | Every registered supported harness adapter, each pinned | Wider versioned task suite including separately frozen evaluation-only tasks | Broader post-optimization evaluation and evidence for narrowly supportable external claims |

Mode is separate from repetition profile, concurrency, model/provider and network regime. Show planned task/arm/repetition counts, settings, budget and expected evidence coverage before execution. Never silently shrink a selected mode when an adapter or task is unavailable. Block or explicitly mark missing cells; an incomplete run is not a comprehensive one. Do not expand `basic` into a cross-harness matrix.

### Three-task comparison workload contract

The three tasks collectively exercise substantial repository understanding, meaningful sequences of reads/writes/edits, web search/research, multi-step reasoning and functional outputs independently verified by executable tests. Use scoped modifications to a realistic pinned repository, not tiny unrelated text transformations relabeled as large-repository work. Preserve protected files and include relevant negative controls. Do not force gratuitous tool calls or treat disclosed reasoning tokens as thought quality.

Each task needs a written goal, repository snapshot identity, allowed changes, research dependency, explicit final outputs, independent hidden acceptance tests, protected-state checks, reset procedure and failure taxonomy. Reset must restore identical input hashes into a fresh disposable environment without destroying previous attempts. Verify resets and reference solutions offline. No task completion can be inferred from final prose.

Web modes must be named: controlled replay/frozen research supports repeatability; live web tests actual changing search/retrieval behavior. Never present a local search substitute as verified live WebSearch parity. Record source/query/result provenance and limitations. Task design audit will identify concrete implementation choices before fixtures are written.

## Required report sections in every mode

1. **Outcome and safety:** independently verified task result, functional checks, protected-state checks, incomplete/infra/timeout categories, observed safety violations and coverage. Task acceptance is not a comprehensive safety certification.
2. **Resources and configuration:** requests, input/output/cache-read/cache-write/reasoning tokens, confirmed reported charges versus retained estimates, model/provider/protocol/effort, build/version fingerprints and cache/order conditions.
3. **Time and activity:** end-to-end and client times; request/tool spans; observed reasoning/output activity; approval and known scheduler waits; completion-to-enqueue/injection/request/progress spans where captured; inter-call gaps and unclassified time. Show totals and distribution/per-task context, not only pooled medians.
4. **Interaction burden:** progress/final/unclassified messages and words, tool calls by tool/category, tool batches and declared edit operations. Distinguish tools from model requests and underlying shell operations.
5. **Work patterns:** sequential edits, read/edit/test ordering, repeated identical reads or failed signatures, explicit tool failures, repair attempts, per-tool duration and result-to-next-action gaps. Repetition is an observation, not automatically waste.
6. **Supervision:** clarification calls and answers, genuine user corrections/approvals/nudges, scripted interventions separately, with provenance and denominators. Do not convert fixtures or notices into human supervision counts.
7. **Follow-through:** required-work completion, premature stop, false waiting, false verification claims, automatic continuation and notification delay, each grounded in fixture/state/trace evidence. Semantic claims require cited validated labels; no phrase-only verdicts.
8. **Recovery:** actual trigger, recovered/unrecovered/unknown, extra calls/tokens/time, subsequent correctness, and fault attribution confidence. A final pass alone does not prove recovery.
9. **Comparison:** per-task paired changes, wins/regressions, uncertainty when supported, configuration mismatches, failed attempts retained. No universal ranking or improvement from a single A/A pair.
10. **Coverage and claim readiness:** every metric family remains present, with measured/partial/unsupported/not-collected/not-applicable status, denominator, source, reason and appropriate remedy. Separate development usefulness from externally supportable claims.

### Timing rules

Use correlated monotonic clocks within a process and explicit alignment/uncertainty across processes. An open request without visible reasoning/text is provider-pending or unclassified, not proven internal thinking or proven wasted idle. Visible text timestamps indicate output observation, not continuous cognitive activity. Tool spans may overlap with provider/child work; union interval accounting prevents totals exceeding wall time, while overlapping component durations remain separately labeled. Missing timestamps cannot become zero durations. Stop-held intervals must not count as actionable-idle failures. Record cutoff/censoring and incomplete capture.

## Output and integration contract

A single run bundle must connect immutable manifest and raw evidence to normalized records, derived metrics, readable report, coverage inventory and per-task details. Keep JSON machine-readable and Markdown human-readable; any visual timeline is an additional view of the same measurements, not a separate fabricated dataset. Display tokens, caches, deltas and coverage already present in historical targeted JSON immediately when the renderer is repaired. Preserve the original report alongside a versioned enriched report.

Bridge the existing interaction, work-pattern, outcome, behavioral-oracle, continuation and comparison modules into the actual mode/report execution path. A schema field, synthetic example or unit-test-only function is not completed live integration. Unsupported adapters must show exactly which signals are missing rather than inheriting native coverage.

Marketing use requires frozen independent evaluation tasks, reproducible configuration and provenance, adequate task diversity/repetitions, uncertainty, failure inclusion and claim-specific comparability. The three development tasks are not held-out evidence after iterative optimization. No automatic public-ready badge from a green test suite or a sample count.

## Acceptance checks

- All three modes resolve exact arms/tasks/settings and reject unexpected scope expansion, missing identities and unauthorized paid execution.
- Three comparison tasks pass reference solutions and fail meaningful incorrect/unchanged/unsafe outputs; reset restores input hashes and preserves historical runs.
- Offline end-to-end fixtures exercise raw adapter evidence through normalization, metrics and every report section, including absent/partial evidence, concurrent intervals, interruptions, failed tools, delayed notices, genuine-versus-scripted input and malformed records.
- Historical reports gain all supported existing metrics without modifying original evidence or calling a provider.
- Every requested metric is mapped to a collector, analyzer, visible report field and test, or remains explicitly incomplete with an evidence-specific reason. A row labeled unknown is honest reporting, not completion of a missing collector.
- Notification fixes are reviewed separately, then their transport/continuation receipts feed this reporting pipeline without conflating scripted timing with live model performance.
- Independent review checks report arithmetic, causal language, timing overlap, task validity, scope guards and public-claim limitations before completion is claimed.

## Current work

Notification implementation is in progress in the isolated app checkout. Read-only audits are mapping the three-task design and metric integration seams. No report-product repair or new mode is claimed complete by this document.
