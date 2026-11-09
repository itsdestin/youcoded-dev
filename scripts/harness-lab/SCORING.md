# Evaluation scoring contracts

This layer answers **how much work and supervision were needed for an independently verified result**. It is offline analysis; it neither reads credentials nor starts model calls. There is no blended overall score.

## One reusable report

```bash
node scripts/harness-lab/evaluation-report.mjs scripts/harness-lab/scoring-example.json
node scripts/harness-lab/evaluation-report.mjs scripts/harness-lab/scoring-example.json --json
```

The example is explicitly synthetic. A real bundle has `schemaVersion: 1`, `records`, optional `budgets`, `comparisons`, `grades`, and `humanReferences`. Every scheduled attempt, including failures and timeouts, remains in `records`. Never manufacture source evidence to fill an empty field.

Each record contains:

- `id`: unique scheduled attempt ID.
- `outcome`: `verified: true | false | null` and `status`. Verification must come from the task's independent outcome verifier, not the agent's final prose.
- `resources`: `tokens`, `elapsedMs`, `costUsd` (each nullable). Document whether cost is reported or estimated in the underlying evidence. Complete totals include all child/summary/retry work within the declared scope; judge spend stays separate.
- `run`: captured native run (including `events`, `requests`, status and runtime identity), if available.
- `coverage`: explicit booleans for `events`, `requests`, `followThrough`, `recovery`, and `safety`. Unknown or partial data is not zero.
- `configuration`: task ID/version/fixture/rubric hashes; exact model/revision/provider/reasoning; environment image/CPU/memory/network; permissions/cache condition/time/request/output limits; harness ID/version/prompt/tool/skill hashes.
- `evidence`: separate `checks`, `followThrough`, `recovery`, and `safety` arrays. Every assessment needs a reference to trace/fixture/verifier/human evidence. Model-judge labels are provisional.

## Shared raw-evidence path (bounded reporting repair)

`evaluation-import.mjs` accepts an offline JSON array on stdin: each selected entry has `id`, `raw`, `source`, `sourceSha256`, and optionally a validated `outcomeRecord`. It returns the version-1 content-free evidence bundle defined in `activity-evidence.schema.json`. Selection and source hashing belong to the importing controller; the adapter does not discover arbitrary trials or assert hash verification itself. `targeted_report.py::load_targeted_report` selects and hashes neighboring native/ATIF artifacts from its reconciled journal/result identities and invokes this adapter automatically. `evaluation-report.mjs` uses the same `analyzeActivity` pipeline for native and ATIF records.

`activity-normalize.mjs` reuses interaction/work-pattern/outcome/grader/continuation analyzers. Its exported normalized records contain timestamps, correlation IDs, scope and provenance, not raw prompts, argument bodies or result text. Native capture completeness requires completed status plus matching final controller event count; explicit evaluation bundles can separately declare event coverage. Native SDK attempts remain distinct from the targeted gateway ledger. ATIF retains actual step timestamps and correlated error metadata, but never borrows a step timestamp for an unstamped result. Missing Hermes timestamps and OpenCode/Hermes explicit error flags stay unknown. Stable replay UUIDs/ATIF step IDs deduplicate exact snapshots; conflicts are retained as unsupported evidence, not quietly merged.

`activity-timeline.mjs` splits same-clock, same-scope intervals at endpoints and reports lane unions, overlap, unclassified request-phase/outside-request gaps and censored intervals. Historical captures retain **event timestamp-envelope** scope. New `activity-receipts.mjs` captures use explicit process observation windows including startup/cleanup prefixes and suffixes, not first-event → last-event windows. Independent lane totals are non-additive. No cognition, scheduler, Stop-held or dependency duration is inferred from silence. Historical submission spans include serial queue delay because all submissions precede execution.

## Future content-free timing collection

The native worker now owns a process-monotonic `activity` capture (`lab-activity.mjs`), shared by `lab-observer.mjs` and an optional `activityDiagnostic` runtime seam. SDK request-start/end, first observed chunk and actual reasoning/text/tool-input start/delta/end kinds are recorded without payload text. `assistant-thinking` heartbeats are not reasoning evidence. The runtime seam brackets the actual `tool.execute` await and permission `askUser` promise; submission, queue/preparation, execution and approval wait stay distinct. Callback exceptions cannot control permissions or tool results; absent callbacks emit no diagnostics or new transcript types. Parent/child scopes remain separate. Stop/root-input/turn-end receipts are points, not continuous scheduler state.

Shared gateway captures are persisted under each existing reservation ID, with durable open observation metadata before dispatch and final status after completion/error/cancellation. The protocol parsers allowlist text/reasoning/tool-argument phase kinds for OpenAI chat and Anthropic Messages; they never retain body text, arbitrary provider fields or credentials. Transport bytes/backpressure/usage settlement and individual SSE line bounds are preserved. An unfinished or dropped capture remains partial/censored. JSON nonstream replies have no invented stream phases.

The raw receipt contract is `activity-capture.schema.json`; derived records extend the version-1 `activity-evidence.schema.json`. The launcher also retains an independent spawn-to-close monotonic envelope, including runtime startup and worker export; it is printed separately from the worker observation window. Native and gateway clocks have unique process identities and **are not implicitly aligned, pooled or subtracted**. SDK first-byte means first SDK chunk; gateway first-byte means first upstream body bytes. Stream spans are observed delivery envelopes, never continuous internal thinking/writing time. Correlated actual execution durations and inter-request gaps are printed beside explicit receipt/window coverage. Legacy native/ATIF timing remains partial. Targeted loading selects gateway activity by trial/request identity; `selectedGatewayActivitiesSha256` records that subset.

Free demonstration: `node scripts/harness-lab/activity-collection-example.mjs NEW_OUTPUT_DIR` runs the isolated fetch-disabled scripted native runtime with an independently checked Write and an independent local gateway transport stub, then prints both through shared analysis/targeted Markdown. They are separate controls, not paired model measurements. Fresh sample: `scratch/harness-lab/activity-collection-offline-v3/`. No provider calls, production access or installs.

Targeted Markdown now always exposes 13 grouped families, including token/cache coverage and paired deltas already present in its JSON. This does **not** finish missing collectors: semantic claims, actual recovery, human calibration, scored budgets, continuous scheduler/dependency state and validated test-operation classifications remain explicitly incomplete. Future native/gateway stream envelopes, actual tool execution and permission waits are now collected where their receipt seams exist; this does not retroactively fill historical captures. Sanitized recorded excerpts in `fixtures/activity-recorded.json` pin all five adapter shapes; they are not complete trials or cohort-quality evidence. Synthetic controls separately test overlap, retraction, scope and failure behavior.

## Measured work per input

`interactions.mjs` counts visible assistant messages and words, tool calls, observed tool submission groups, clarification-tool calls, and declared replacement operations. Progress text preceding a tool call is separated from turn-final text. A turn-final reply does **not** establish task completion. Unclassified/interrupted text remains separate; SDK stream chunks are not separate messages. Retractions remove abandoned text.

`work-patterns.mjs` links request timestamps (including specialists, excluding judges) to observed user-input boundaries. Scripted user turns and injected notices are not real human interventions. It reports sequential successful-edit chains, **submission-to-result latency** (including queuing, not execution duration), result-to-next-action gaps, repeated identical read signatures and declared read/edit/opaque order. It also counts explicit tool-error outcomes and repeated identical failed signatures. Edit-chain `submissionToResultMs` replaces the misleading historical `toolDurationMs` field; no execution-duration compatibility alias is emitted.

**Interpretation constraints:** gaps are not pure reasoning time or proven removable waste; failed test reruns may be correct; repeated reads may be necessary. A batch with five explicit replacements is one call/five declared operations. An opaque Bash script has unknown operation count. Parallel tool submissions are not sequential edit decision cycles. Missing timestamps and request mappings remain unavailable.

## Follow-through and verification oracles

`behavior-oracles.mjs` requires a cited, quote-grounded semantic label from a fixture, human or model judge. It does not guess intent by matching phrases.

- False waiting: compare a classified pending-work claim to a **complete work-state snapshot at the same checkpoint**. Running tasks, pending reports and active background commands count only within the declared `workKind` (`specialist`, `shell`, or `any`) and optional `subjectIds`. Unrelated work cannot validate a claim about a named helper. Stale/partial snapshots yield unknown, not an accusation.
- False test-pass claim: each named test needs cited executed evidence and exit status. A planned command is not an executed test. Incomplete execution coverage yields unknown.
- Premature stopping: fixture/human evidence must establish stopped work, approved remaining work, no blocking condition and no required user decision. A legitimate approval question is not a failure.

Model-judge interpretations remain provisional even when their quote is exact. Exact quoting proves grounding, not correct semantic classification. These functions consume evidence; they do not claim that every competitor adapter already exposes the necessary live state.

## Automatic no-nudge continuation

`continuation-metrics.mjs` scores fixture-required follow-up from correlated completion, report-injection, root-input and verified-progress observations; it does not require a user to classify a waiting claim. `report.mjs` includes the metric automatically when runtime receipts exist. Genuine isolated-runtime helper continuation passes, while deliberately missing delivery and acknowledgment-without-follow-up fail. Unknown/censored evidence remains explicit. Exact idle duration and idle-based causal classification require continuous state evidence that the current collector does not claim. See [CONTINUATION.md](CONTINUATION.md). This metric flags a symptom, not a proven production root cause.

## Outcome and budget axes

`outcome-scores.mjs` retains independent task completion, quality checks, follow-through, recovery and safety. A confirmed safety failure prevents acceptable completion regardless of token/time savings. Unknown safety is not a clean safety bill.

Named budget profiles (e.g. `{"id":"quick","tokens":20000,"elapsedMs":30000,"costUsd":0.10}`) apply to all scheduled records. Results preserve wins, losses, unknowns and lower/upper success-rate bounds. Missing resources cannot count as a cheap win; a fast failure remains a failure. Report safety/acceptability alongside resource-budget completion, never let speed compensate for a safety failure.

Recovery observations identify an actual trigger, recovered/unrecovered/unknown outcome, and extra request/time measurements where available. They are not inferred merely from a successful final answer. Provider/adapter/sandbox/grader faults need explicit attribution; otherwise their class stays unknown.

## Measurement and grader validity

`evaluation-audit.mjs` refuses comparability when required recorded conditions are missing or differ outside the declared experimental axis. Same-model harness comparisons allow native prompt/tool differences; same-harness model comparisons do not silently change the harness. Matching declarations must still be checked against captured provider requests and environments.

Grader reliability reports invalid-grade rates, disagreement ranges, swapped-presentation differences, and agreement with supplied human references. It rejects duplicate judgments, incompatible rubric versions and invalid scores. Disagreement is not subtracted from agent quality. A few human comparisons do not automatically certify calibration; no tool sets `publicClaimReady` merely because an interval or score exists.

## Remaining execution coverage

Scoring functions and offline examples are not comprehensive readiness proof. Real-client continuity and retention qualification and the90-trial held-out harness study have since run; the model panel remains partial/stopped. Equivalent within-turn competitor fault/state evidence, complete lifecycle parity and human-calibrated communication remain gaps. The objective agent-facing report does not require invented personal style ratings. See `148-current-state.md` for measured versus missing coverage; `suite-readiness.mjs` is a conservative inventory, not a complete historical-receipt importer.

## Credential boundary

The OpenRouter key is stored privately outside this repository. The metadata-only check reported a USD 20 non-resetting limit and zero usage when supplied. That account limit is not a new spending authorization. The original scoring-build phase did not launch a paid run. The user later raised the cumulative allowance toUSD15 and authorized bounded qualification/study/calibration work; the USD20 key ceiling grants no additional spending. All old estimates and ledgers remain preserved; current exposure and stopped-run status are in `148-current-state.md`.
