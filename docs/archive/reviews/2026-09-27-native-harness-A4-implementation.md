---
status: shipped
---

# Task A4 — automatic retry attempt retraction

Status: implemented in the isolated A1/A2/A3 worktree; no commit, push, live-app access or paid request.

## Interface and behavior

`HarnessSession.withRetry` now hands its callback an attempt-retraction registrar. `consumeStep` passes that registrar to `runStreamOnce`, which registers one closure per provider attempt. The retry layer calls the latest closure **only after** its existing transient/budget/abort guard elects to retry, and **before** its existing delay. The closure is also used by manual Retry and silent-stall retry. It clears `reportPartial`, clears preparing cards, emits the existing `dropPart` for text and reasoning, and abandons accepted capture. A non-retried failure keeps its truthful partial. This does not reset step history, execute completed calls again, expand retry budgets, or add IPC/event/UI types. Earlier A1/A2/A3 uncommitted edits remain intact.

## Red / green evidence

- Red before production edits: `cd youcoded/desktop && node node_modules/vitest/vitest.mjs run tests/harness-session-loop.test.ts tests/harness-stall-watchdog.test.ts tests/session-store.test.ts tests/harness-accepted-history.test.ts` → **exit 1; 5 failed, 224 passed (229 tests; 1 failed / 3 passed files)**. Three failures for 503/429/ECONNRESET missing drop, one replacement-before-text, one exhaustion.
- Initial green: same four-file command → **exit 0; 229 passed (4 files)**.
- Extended green: `node node_modules/vitest/vitest.mjs run tests/harness-session-loop.test.ts tests/harness-stall-watchdog.test.ts tests/session-store.test.ts tests/harness-accepted-history.test.ts tests/chat-reducer.test.ts tests/attention-reducer.test.ts` → **exit 0; 354 passed (6 files)**.
- `npm run typecheck` → **exit 0** after correcting nullable test assertions. An earlier invocation failed on two test-only nullable accesses, which were corrected.

The standalone `tests/native-retry-audit-probe.test.ts` was removed only after owning-loop regression coverage became green. Existing watchdog manual-Retry and reducer drop-part tests remain green. Store regression confirms that a drop tombstone precedes replacement on durable replay (reasoning can flush older raw JSONL bytes; the *effective* replay drops them). Accepted-history regression confirms old UUIDs and text are not accepted and a tool from a previous step executes once. A final exhausted attempt still retains its partial and session error.

## Files and concerns

A4 changed `youcoded/desktop/src/main/harness/harness-session.ts`, `tests/harness-session-loop.test.ts`, `tests/harness-accepted-history.test.ts`, `tests/session-store.test.ts`; removed `tests/native-retry-audit-probe.test.ts`. Existing A1/A2/A3 edits in the same files are not attributed to A4. No store/reducer implementation change was necessary: the existing drop tombstone consumer provides effective replay. Workspace verification: `bash /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926/scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926/youcoded` → log `/tmp/a4-verify.log`: `PASS types`, `PASS types in tests/`, `PASS tests (related)`, `PASS dead code (knip)`, `PASS lint (oxlint)`, `PASS design lint`, `PASS invariants (ast-grep)`, `OK — all checks passed`. Its output explicitly says Android and marketplace Worker are not covered. No Android/Worker sources were edited.
