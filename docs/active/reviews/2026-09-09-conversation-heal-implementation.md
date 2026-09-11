# Conversation heal safety implementation — 2026-09-09

Implemented in `youcoded/desktop/src/main/conversations/conversation-store.ts`; regression tests in `youcoded/desktop/tests/conversation-store.test.ts`. No setters/remove edits, commits, live data or cloud calls. Parent owns full verify and fresh review.

- Rejected/unreadable originals and old claims remain in place. Each accepted candidate, including recovered claims, gets a fresh PID+UUID path and its actual claimed bytes are revalidated.
- Validated records retain their path association. Only their private paths are unlinked, after awaited canonical persistence. Failed reads/commits/unlinks retain retryable evidence.
- Heal-only canonical validation runs inside the locked callback on `onDisk !== null`, rejecting malformed/empty/wrong-identity canonical bytes without replacement.
- Shared `originalConflictName` keeps heal/list discovery consistent for `.healing-` inside device labels, stripping claim suffixes only after `.json`. List-first copies-only tests cover ordinary and claimed names. Remove remains unchanged (its pre-existing marker-label limitation is outside this patch).
- Follow-up TDD: `npx vitest run tests/conversation-store.test.ts -t 'heal recognizes marker text'` before shared list discovery returned `Tests 2 failed | 51 skipped (53)`; after the fix the full focused command returned `Test Files 2 passed (2)`, `Tests 87 passed (87)`, `Duration 6.35s`.

## Verification (commands from youcoded/desktop)

Initial TDD, before implementation:
`npx vitest run tests/conversation-store.test.ts tests/conversation-store-core.test.ts`
```text
Test Files  1 failed | 1 passed (2)
Tests  10 failed | 65 passed (75)
```

Disable strict canonical guard, then:
`npx vitest run tests/conversation-store.test.ts -t 'heal preserves invalid canonical'`
```text
Test Files  1 failed (1)
Tests  5 failed | 48 skipped (53)
```
Restore guard; temporarily use PID-only claim destinations, then:
`npx vitest run tests/conversation-store.test.ts -t 'heal revalidates replaced claimed bytes'`
```text
Test Files  1 failed (1)
Tests  4 failed | 49 skipped (53)
```
Both mutations restored. Final:
`npx vitest run tests/conversation-store.test.ts tests/conversation-store-core.test.ts`
```text
✓ tests/conversation-store-core.test.ts (34 tests) 10ms
✓ tests/conversation-store.test.ts (53 tests) 6091ms
Test Files  2 passed (2)
Tests  87 passed (87)
Duration  6.31s
```
`git diff --check`: no output. Read the complete owned-file diff back. Logs: `/tmp/heal-{red,mutation,nonce-mutation,final}.log`; diff: `/tmp/heal-final.diff`.

Coverage includes original/post-claim transient read retry; invalid/identity-mismatched originals and claims; replaced claimed bytes with valid sibling persistence before cleanup; retained same-PID evidence and nonce paths; canonical read/rename failure and unlink retry; deterministic barrier recovering an already-read claim while preserving a recreated original; existing stale recovery, fold, copies-only, provider isolation, lock-timeout availability and remove tests.

Parent added explicit upsert strict-abort/preservation assertions for all five invalid canonical fixtures; focused suite87 passed, evidence scratch/heal-parent-tests.log. Fresh reviewer28 PASS after list discovery fix, verified concurrency test and validated path cleanup. Initial desktop verify passed scratch/heal-verify.log; final rerun after added assertions sh-067c/scratch/heal-final-verify.log pending.

Remaining test gaps versus the full plan: dedicated not-yet-read concurrent claim ENOENT barrier; canonical alteration while waiting for the lock; explicit lock-timeout evidence/retry assertions (existing test checks get/list availability); separate writeFile failure (rename failure covered); explicit upsert strict-abort assertion (parent reviewer adding). No claim that these scenarios were independently tested here. Full verify/types/lint remain parent checks.
