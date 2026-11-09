---
status: active
work_item: 148
---
# Harness performance lab implementation plan

## Current-state pointer

This is the original implementation plan and authorization record. Subsequent authorized qualification, partial benchmarking, targeted workflow delivery and tiny live A/A calibration are recorded in [148-current-state.md](148-current-state.md). Its current status supersedes old phase-specific pending/no-paid-run wording below; original evidence is retained. The live specialist-stall incident remains unproven/unfixed, although a no-nudge regression detector is now implemented.

## Approved direction
Destin approved building the simplest reusable performance lab after the investigation: production-runtime isolation and truthful accounting first, Harbor integration and a small outcome-driven suite, then evidence-driven optimization. No paid runs, shipping, or live-app changes are authorized. No new app UI or hosted dashboard is needed.

## Architecture
Keep offline analysis in workspace `scripts/harness-lab/` using Node built-ins. A separate app `desktop/test-engine/` runner invokes production NativeSessionHost in a private process/home and exports native events plus normalized measurements. A thin Python Harbor custom agent invokes that runner inside the task sandbox; Harbor owns containers and verification. Retain raw measurements and missing-data flags. Do not rewrite the existing evaluator or add overlapping frameworks.

## Deliverables and sequence
1. Diagnose specialist resume/notification/list transitions with existing host tests. A worker owns only lifecycle fixes/tests. Do not force automatic model continuation based on prose regexes; fix only a demonstrated code defect.
2. Add dependency-free request accounting and paired result reporting in `scripts/harness-lab/`. Tests first: duplicate request rejection, unknown usage propagation, parent/child/summary separation, failed-run inclusion, matched-task/repetition pairing, no success-only selection bias. Run `node --test scripts/harness-lab/*.test.mjs`.
3. Add isolated production session runner under app `desktop/test-engine/`. Reuse NativeSessionHost constructors and provider/profile resolution; avoid Electron and live config. Input by stdin, explicit credentials by file, finite timeout and explicit request/spend controls. Preserve incomplete records on failure and deny unsupported setup rather than faking parity. Scripted fake-model smoke must exercise production host, not eval/runCase.
4. Add Harbor custom adapter and small deterministic task fixtures. Pin supported adapter API expectations; tests with fake environments verify commands, missing telemetry and failure propagation. Do not claim a live Harbor benchmark from a fake smoke.
5. Document commands, fidelity boundary, measurement schema, limitations, candidate optimization checklist, and manual quality review rubric. Offline smoke/report commands must work without credentials. Human clarity review complements deterministic outcome verification; no invented clarity scores.
6. Fresh review, relevant offline tests, and workspace verify for app changes. No commits/merge/push unless asked. Preserve other worktrees and shared dependency inodes.

## Measurement contract
A run has a stable task ID, repetition, arm, model/config identity, status, independent success verdict (nullable until verified), elapsed milliseconds, final text, and request ledger. Ledger records are unique per physical request/attempt and identify role (main/specialist/compaction/judge), model, timing and nullable usage. Input includes cached input; cache fields are subsets/diagnostics, never added again. Reasoning is a subset of output when normalized. Missing accounting remains unknown and observed partial sums are separately labeled. Agent totals exclude judges. Failed requests remain represented even when usage is unavailable.

Reports show all-attempt success and resource coverage, not only successful runs. Paired deltas require matching task/repetition and compatible model/config declarations; list missing pairs. No public ranking from synthetic fixtures or incomplete telemetry. Confidence estimates must use task-level grouping if added; the first version reports paired raw differences and denominators rather than pretending small samples are conclusive.

## Safety and scope
Private HOME alone is not an OS sandbox: standalone model runs must be explicitly sandboxed (Harbor) or require an explicit unsafe-local opt-in. No inherited credentials/config or app IPC/CDP. Secrets stay out of argv/logs; output traces may contain task content and remain private by default. No speculative cache/prompt/pruning changes before baseline. Existing cards #69/#71/#19 cover related cost, specialist and evaluator follow-ups.

## First implementation checkpoint
Built the isolated production runner, request observer, dependency-free reports and Harbor result import, custom Harbor 0.24.0 adapter, and three public verifier-backed pilot tasks. Added native lifecycle regression coverage; no original lifecycle defect was reproduced, so production behavior was not speculatively changed. Review corrections cover pending report delivery, final-answer retry retraction, output flushing and explicit Windows refusal.

Docker integration and the separately authorized Haiku-only live pilot are now exercised; see `docs/active/investigations/2026-10-17-haiku-harness-pilot.md` for all attempts and budget accounting. Remaining gates: common cross-competitor Haiku/spend enforcement, representative/held-out task expansion, multi-turn/resume adapter support, statistical uncertainty and human quality calibration before public claims. V1 preserves native logs, not ATIF; clean headless profile omits Browser and personal plugins. Spending reservations rely on a declared per-attempt maximum and an independently provider-capped key, not a guaranteed price prediction. These are disclosed boundaries, not completed competitive evaluations.

## Acceptance
Offline tests cover accounting and lifecycle contracts; scripted production smoke produces a saved run and an honest report; Harbor adapter and task fixtures have offline validation. Live provider accuracy, comparative performance and human communication quality remain unmeasured until separately authorized capped evaluations. This plan's first implementation is infrastructure, not a competitive performance claim.
