---
status: shipped
---

# Native harness A2 implementation review (2026-09-27)

Scope: host FIFO delivery/readiness only. No driver in-turn claim (A3), IPC, UI, commits, live-app access or paid calls. A1's uncommitted driver/finalization edits were preserved.

## Change and boundary for A3

`youcoded/desktop/src/main/harness/native-session-host.ts` now stores an optional `ready` flag on each live FIFO entry. Busy sends enter with `ready: false`; the existing `setImmediate` dispatch boundary opens readiness and kicks a host pass if the earlier pass already settled. The host drains ready heads only; an unready head blocks all successors. The first idle send retains its own deferred dispatch and the existing public `NativeSendResult`, IDs, queue cap and `removeQueued` contract are unchanged. `runTurns` alternates queued dispatch and notice delivery to stable idle, rechecking generation after awaits. Stop's report hold and takeover quiesce remain separate gates. A3 should use only the synchronous ready FIFO head, checking captured live generation/quiesce before removing it; never claim an unready head or send another root turn concurrently. The `ready` field is optional to keep startup-held entries compatible.

The owning regression tests are in `youcoded/desktop/tests/native-session-host.test.ts`; the observational `native-host-audit-probe.test.ts` was removed after they passed. Existing `native-send.test.ts` and `native-send-unconfirmed.test.tsx` stay unchanged.

## Red / green evidence

- RED: `cd youcoded/desktop && node node_modules/vitest/vitest.mjs run tests/native-session-host.test.ts -t 'delivers FIFO sends accepted during'` — exit 1, **2 failed**: idle-notice and user-turn-tail both expected `['one','two','three']`, received no follow-ups (user turn showed only `opening`). Saved output `/tmp/a2-red.log`.
- GREEN after fix: same command — **2 passed, 207 skipped**, exit 0.
- GREEN: `cd youcoded/desktop && node node_modules/vitest/vitest.mjs run tests/native-session-host.test.ts tests/native-send.test.ts tests/native-send-unconfirmed.test.tsx` — **218 passed (3 files)**, exit 0 (before adding the failed-notice regression).
- GREEN after failed-notice regression: `cd youcoded/desktop && node node_modules/vitest/vitest.mjs run tests/native-session-host.test.ts -t 'continues queued user dispatch' && npm run typecheck` — **1 passed, 212 skipped**; both TypeScript projects completed, exit 0.
- First `bash scripts/verify.sh` from workspace root: types/knip/lint/design lint/ast-grep passed; related tests **1 failed, 124 passed, 1 skipped** due solely to `line-budgets.test.ts`: `native-session-host.ts: 5149 lines, budget 5122 (+27)`. Condensed existing implementation comments without changing their behavior.
- Final `cd /home/destin/youcoded-dev/worktrees/sessions/native-harness-audit-20260926 && bash scripts/verify.sh` — **PASS types, types in tests, related tests, knip, lint, design lint, ast-grep; OK — all checks passed**. Output `/tmp/a2-verify-final2.log`; line count after final edit: 5102 / 5122. Android and marketplace worker not covered (desktop-only change). `git -C youcoded diff --check` exited 0.

## Remaining concerns

The A3 in-turn callback has not been wired or tested here. The queue readiness boundary is host-local and not an extra IPC acknowledgment. Existing Stop/quiesce and generation-replacement tests ran as part of the host suite; the new tests pin tail arrivals, readiness ordering, cancellation IDs, ack/event order and failed notices. No model/provider paid calls were made.
