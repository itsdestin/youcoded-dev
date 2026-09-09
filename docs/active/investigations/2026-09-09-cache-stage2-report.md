---
status: superseded
date: 2026-09-09
---
# Cache efficiency Stage 2 implementation report

> **Superseded — Stage 2 was dropped from `session/chatgpt-cache-efficiency` on 2026-09-09 by
> Destin's decision.** Master PR #456 retired the per-turn `<specialists-status>` block outright,
> replacing it with an on-demand `list: true` option on the Task tool, so the append-only snapshot
> this report describes has nothing left to make append-only. The code and tests it names were
> removed when the branch merged master. Stages 1, 3 and 4 are unaffected. Kept as the record of
> what was built and why it no longer applies.

## Scope completed

Implemented approved design §2 only: append-only specialist status snapshots. Stage 1 diagnostics remain intact. No UI, IPC, SDK continuation, durability, live configuration, or real-model behavior was added.

## Files

App worktree:
- `desktop/src/main/harness/specialists/status-snapshot.ts` (new pure normalize/compare/format/recover helper)
- `desktop/src/main/harness/harness-session.ts`
- `desktop/src/main/harness/native-session-host.ts`
- `desktop/tests/specialist-status-snapshot.test.ts` (new)
- `desktop/tests/harness-session-loop.test.ts`
- `desktop/tests/native-session-host.test.ts`
- `docs/native-runtime.md`

Workspace:
- `docs/active/investigations/2026-09-09-cache-stage2-report.md`

## Behavior pinned

- Unchanged normalized state leaves every prior history message byte-for-byte unchanged and emits no duplicate snapshot.
- Lifecycle, delivery, stale, report/report-path, failure, title, or type changes append an explicitly superseding snapshot.
- Elapsed display time and ledger iteration order do not affect equality; `childId` is the stable ledger task identity and sort key.
- Transition to no reportable records emits one clearing snapshot; completed/failed undelivered records remain reportable.
- Ledger callback failure preserves previous snapshot memory and does not interrupt the turn.
- `/clear` resets history and snapshot memory; the next known state is introduced again.
- `seedHistory` and both compaction paths recover the newest retained encoded snapshot, or reset memory so current state is introduced later.
- Existing status wording is preserved by the new formatter, and completed-background delivery remains on the existing host/ledger path; no transcript event type or IPC changed.

## Test-first red / green evidence

Initial test-first red, before helper implementation:

```text
$ cd youcoded/desktop && npx vitest run tests/specialist-status-snapshot.test.ts
FAIL tests/specialist-status-snapshot.test.ts
Error: Cannot find module '../src/main/harness/specialists/status-snapshot'
Test Files 1 failed (1); exit 1
```

First integration run exposed one obsolete replacement-era assertion after implementation:

```text
$ npx vitest run tests/specialist-status-snapshot.test.ts tests/harness-session-loop.test.ts tests/native-session-host.test.ts
FAIL harness-session-loop: expected history.findIndex to be called
Test Files 1 failed | 2 passed; Tests 1 failed | 298 passed; exit 1
```

The obsolete assertion was updated to the append-only contract (ordinary wired turns intentionally do not scan history).

Green affected integration run:

```text
$ npx vitest run tests/specialist-status-snapshot.test.ts tests/harness-session-loop.test.ts tests/native-session-host.test.ts
Test Files 3 passed (3); Tests 299 passed (299); exit 0
```

Guard mutation: changed `specialistStatusSnapshotsEqual` to always return false. The focused helper and integration unchanged-state tests both failed (2 failed; exit 1), proving the guard detects prefix churn. Restored implementation:

```text
$ npx vitest run tests/specialist-status-snapshot.test.ts tests/harness-session-loop.test.ts -t "ignores elapsed time|unchanged status preserves"
Test Files 2 passed (2); Tests 2 passed | 110 skipped; exit 0
```

Final affected suites:

```text
$ npx vitest run tests/specialist-status-snapshot.test.ts tests/harness-session-loop.test.ts tests/harness-history-rebuild.test.ts tests/harness-compaction.test.ts tests/native-session-host.test.ts tests/specialist-run.test.ts tests/specialist-delegation-ledger.test.ts
Test Files 7 passed (7); Tests 412 passed (412); exit 0
```

TypeScript:

```text
$ npx tsc --noEmit
exit 0
```

Expected stderr from scripted failure-path fixtures appeared (`summary model exploded`, temporary upstream/llama-server errors); all assertions passed.

## Independent review fixes

Fixed the medium compaction-boundary finding. After automatic or manual summarization rewrites history, the harness now recovers a retained authoritative snapshot; if none survived, it immediately reads current normalized state and appends a fresh authoritative snapshot before the next model request. Known empty state can therefore append an explicit clear at this boundary, while a failed read remains unknown and appends nothing.

Added direct normalized/rendered coverage proving completed and failed undelivered records remain reportable, use `finished`/`failed — <real failure>` wording, and both state report delivery is pending. Added an actual automatic-compaction integration test that captures SDK prompts and asserts the immediate post-compaction request contains both the summary and the freshly restored status.

Review test-first evidence:

```text
$ npx vitest run tests/harness-compaction.test.ts -t "immediately restores"
FAIL: expected the immediate post-compaction request to contain <specialists-status>
Test Files 1 failed; Tests 1 failed | 10 skipped; exit 1
```

The first fixture arrangement retained the status and passed, so it was corrected to place the authoritative snapshot inside the summarized span before recording the red result above.

Guard mutations:

```text
$ npx vitest run tests/specialist-status-snapshot.test.ts -t "completed and failed"
FAIL after changing the completed rendering to `completed`; expected `finished — report delivery pending`
Test Files 1 failed; Tests 1 failed | 8 skipped; exit 1

$ npx vitest run tests/harness-compaction.test.ts -t "immediately restores"
FAIL after replacing immediate restoration with recovery-only behavior; the next request lacked <specialists-status>
Test Files 1 failed; Tests 1 failed | 10 skipped; exit 1
```

Restored implementation and final requested suites:

```text
$ npx vitest run tests/specialist-status-snapshot.test.ts tests/harness-compaction.test.ts tests/harness-session-loop.test.ts tests/native-session-host.test.ts
Test Files 4 passed (4); Tests 311 passed (311); exit 0
```

```text
$ npx tsc --noEmit
exit 0
```

The final suite emitted expected stderr from the scripted `summary model exploded` and temporary-upstream failure fixtures; all assertions passed.

## Final hardening review

Hardened retained-snapshot decoding against user-controlled history. Recovery now accepts only a complete version-1 record schema: object records with string identity/title/type, a known lifecycle status, literal `delivered: false`, boolean stale state, finite numeric `startedAt`, an optional 64-character lowercase hex report digest, optional string report path/failure text, and unique child ids. Malformed decoded payloads return `null` before they can enter equality or formatting.

Test-first red:

```text
$ npx vitest run tests/harness-session-loop.test.ts -t "malformed pasted snapshot"
FAIL: expected two <specialists-status> blocks but got one; the malformed `{version:1,records:[null]}` snapshot poisoned remembered state and suppressed the current update
Test Files 1 failed; Tests 1 failed | 104 skipped; exit 1
```

Added helper cases for null/incomplete records, invalid lifecycle status, null timestamp, and non-finite timestamp, plus the actual `HarnessSession.seedHistory` → next-turn integration path. Focused green:

```text
$ npx vitest run tests/specialist-status-snapshot.test.ts tests/harness-session-loop.test.ts -t "malformed|poison|recovers the newest"
Test Files 2 passed (2); Tests 7 passed | 112 skipped; exit 0
```

Final requested suites and typecheck:

```text
$ npx vitest run tests/specialist-status-snapshot.test.ts tests/harness-compaction.test.ts tests/harness-session-loop.test.ts
Test Files 3 passed (3); Tests 130 passed (130); exit 0

$ npx tsc --noEmit
exit 0
```

Expected stderr from scripted `summary model exploded` and temporary-upstream fixtures appeared; all assertions passed.
