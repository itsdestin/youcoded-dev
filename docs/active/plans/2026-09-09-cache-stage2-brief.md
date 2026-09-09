---
status: active
date: 2026-09-09
---
# Stage 2 implementer brief: append-only specialist snapshots

Authority: approved `../specs/2026-09-08-chatgpt-cache-efficiency-design.md` section 2; umbrella plan `2026-09-09-chatgpt-cache-efficiency.md`.

Work only in this session workspace and its app worktree. No commits, real model calls, production app/config access or UI/IPC changes. Preserve Stage 1 diagnostics edits. Tests before implementation, observed red then green; WHY comments. Read current instructions/rules (`native-runtime`, `native-specialists`, test hygiene).

## Current source seams

`youcoded/desktop/src/main/harness/harness-session.ts`: opts.specialistStatus and setSpecialistStatus currently return string|null. beginTurn finds the old `<specialists-status>` user message, splices it, invokes callback in try/catch, appends rendered replacement. Change that block only to append-on-structured-change. Callback failure means unknown and must preserve previous state.

`youcoded/desktop/src/main/harness/native-session-host.ts`: buildSpecialistStatus reads ledger.listFor, filters !delivered, formats running elapsed seconds, completed/failed pending reports and interrupted no-report message. Keep reporting semantics but return normalized structured records. Capture taskId/childId according to actual DelegationRecord type; don't guess the stable identity. Include status, delivered, stale, title/type and report/failure changes. Sort by stable ID. Elapsed time must not enter equality.

## Required behavior/tests

1. Two ordinary turns while specialist unchanged preserve all previous history messages byte-for-byte; only one status exists.
2. A meaningful lifecycle/report/failure/delivery/stale change appends a fresh compact snapshot explicitly superseding all earlier statuses.
3. No reportable state after a prior nonempty snapshot appends exactly one clearing message. Completed/failed undelivered records are reportable; none running is not empty.
4. Thrown ledger reads produce no append/clear and keep memory, without breaking turn.
5. /clear resets remembered snapshot and old model history; next known state is introduced again.
6. seedHistory/resume and compaction either recover retained snapshot or reset and introduce current authoritative snapshot; no ordinary-turn rewrite.
7. Stable ID sorting means ledger iteration order alone does not produce a new snapshot.
8. Preserve tool-call/result pairing and existing completed background report delivery.

Create pure `harness/specialists/status-snapshot.ts` helper and `tests/specialist-status-snapshot.test.ts`; extend actual harness/host tests to prove integration rather than helper alone. Update existing tests expecting replacement to the approved append-only contract. Run affected specialist/harness/native-host tests and tsc. Report exact red/green commands/results and file list in `../investigations/2026-09-09-cache-stage2-report.md`. No durability or SDK continuation implementation in this stage.
