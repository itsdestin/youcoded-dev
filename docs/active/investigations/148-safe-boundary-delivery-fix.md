---
status: active
work_item: 148
---
# Safe-boundary delivery: approved fix evidence

Contract and plan: `docs/active/plans/148-safe-boundary-delivery.md`.
Historical baseline is preserved unchanged in `148-native-delivery-offline-reproduction.md`, `/tmp/148-delivery-repeat-{1,2,3}.log`, and `/tmp/148-delivery-final-red.log`.

## Implementation scope

All paths below are relative to the session workspace.

- `youcoded/desktop/src/main/harness/harness-session.ts`: host-owned callback at completed response, first empty-response retry, complete tool batch and completed superseded batch. Narrowly permit history-only notices during that callback, never a reentrant `send` or a split tool-call/result group. Synthetic notices retain `markAppGenerated`; only actual human absorption resets the approval-step counter. New context takes the existing next-request context-fit/compaction path.
- `youcoded/desktop/src/main/harness/native-session-host.ts`: inject both result lanes before the next user-directed dispatch; keep Stop-held splicing distinct from active boundary splicing. Atomic shell-batch claims permit newer context before human correction even inside an active notice turn. Both lane producers increment an arrival version, preventing stale-null hint deletion and final-return lost wake. Failed claims retain the hint, but unchanged failures do not self-schedule or busy-spin. Check generation/Stop/quiesce after awaited preparation/marker work. Prepare before stamping; clear only positively uninjected markers in the current live generation. Observe genuine injected IDs for live dedupe, including compound marker/confirmation write failure. On restart, reconcile correlated durable transcript receipts before replay/confirmation; unreadable transcript is not treated as empty. Update resumed-child ledger tool-call identity so run two is not mistaken for run one.
- `youcoded/desktop/tests/native-session-host-delivery.test.ts`: 19 always-on real-host/scripted-runtime tests, no environment switch hiding desired failures. Includes filesystem-verified Write followup, Stop during drain and marker persistence, storage failure retry bound, nested shell/human context, marked/unmarked restart, duplicate prevention and first empty-response retry.
- `youcoded/desktop/tests/native-session-host.test.ts`: narrowly update existing delivery spies for turn-vs-boundary modes, assert resumed child's new tool ID, and wait for actual first model request in a stale-running-shell-mark test (scheduled `inFlight` was not proof the stream had begun). Existing pre-task lab edits remain present; no whole-file replacement or cleanup.
- `youcoded/desktop/tests/specialist-run.test.ts`: update old idle-only expectation to the approved completed-response boundary; adapt a release-claim failure spy to the delivery seam.
- `youcoded/desktop/test-engine/lab-continuation.mjs` and `.test.mjs`: additive `boundary` delivery mode is active continuation, not Stop-held `splice`; all existing collector tests retained.

No IPC protocol changes or platform-specific backend fork. Android uses this backend but its build/tests were not run. No production/live instance interaction, provider calls, paid evaluation, dependency installation, manual commits, merges or rebases. No other worker was launched. Parent owns canonical current-state and independent review.

## Before → after

| Case | Preserved baseline | After approved fix |
|---|---|---|
| Busy report + two accepted human FIFO inputs | Report injected only after both later user turns; four parent requests | Report is in history before first later human dispatch/request; three parent requests in the controlled fixture |
| Completed tool batch | No explicit prior pin; reports only at host tail | Both Glob call/result pairs complete before shell/helper injection; next request contains both; genuine Write creates `continued.txt` = `FOLLOWUP-OK\n`; three requests total |
| Final drain-return interleaving | Idle, delivered false, pending hint true, zero injections; later root input recovers | Exactly one injection/confirmed delivery without another input; later input does not duplicate |
| Empty-claim interleaving | Newly queued hint deleted; later user input still does not deliver | New arrival retained and delivered once; later input does not duplicate |
| Formatting failure after claim | Marker stamped before failure; permanently excluded | Formatting before marker; failure leaves uninjected/unmarked report pending; next user-directed dispatch splices it before its request |
| Marker committed without injection receipt | Seeded/new-host case previously excluded forever | Successful complete durable-transcript read proves no correlated receipt; marker released and report replays once |
| Injection observed, confirmation write failed | Marker-only protection normally prevented replay | Marker preserved; live receipt also protects compound marker+confirm failure. Durable receipt on restart confirms bookkeeping without another model request/injection |
| Shell completion during specialist notice response | Idle with shell notice pending; requires later user boundary | Delivered once at that response's safe boundary. If a human correction is queued, shell context precedes its dispatch/request |
| First orderly empty response | Silent retry could precede ready result | Ready results are supplied before the first retry request |
| Stop / quiesce | Intentional hold/refusal | Preserved; Stop during draining parks remaining results, then already queued/new human dispatch receives context with no extra synthetic turn. Quiesced control never wakes |
| Persistent claim outage | Empty-claim fallback could drop pending hint | Exactly one failed claim on the tested idle boundary; remains idle/durable; next externally driven boundary retries successfully |

Final-drain and empty-claim cases still use **controlled promise-boundary widening**; formatting/storage failures are explicit **fault injection**. Restart tests replace a real host on isolated disk, not kill a process. Shell notices are synthetic inputs at the production queue seam; no shell process is launched by the new suite. None establishes the live incident's cause or frequency.

## TDD evidence

Before production edits:

```bash
# from youcoded/desktop
npx vitest run tests/native-session-host-delivery.test.ts > /tmp/148-safe-boundary-red.log 2>&1
```

Exit 1:

```text
Test Files  1 failed (1)
     Tests  6 failed | 4 passed (10)
```

Busy/FIFO, useful tool-batch followup, final drain, empty claim, pre-injection formatting failure and shell-lane tests went red. No production fixes were present for this run.

Additional focused red logs, followed by corrected implementations:

- `/tmp/148-safe-boundary-collector-red.log`: boundary mode was not recognized as active delivery.
- `/tmp/148-safe-boundary-extra-red.log`: durable pending hint lost after persistent claim failure (1 failed/11 passed).
- `/tmp/148-safe-boundary-dedupe-red.log`: compound marker/confirmation failure duplicated a genuine report.
- `/tmp/148-safe-boundary-nested-red.log`: late shell context arrived after an absorbed human correction inside a notice turn.
- `/tmp/148-safe-boundary-empty-red.log`: first orderly empty response retried without ready result context.
- `/tmp/148-safe-boundary-quiesce-red.log`: quiesce during awaited pre-dispatch marker work allowed a previously captured human request past the flush; post-await generation/quiesce guard now prevents it.

Compatibility failures were diagnosed rather than labeled flaky: old tests assumed idle-only report delivery/spied only `runNotice`; a scheduled parent was not necessarily already inside its gated provider stream; resumed child ledger retained its old tool-call identity. Assertions/spies were updated narrowly and the identity bug corrected.

The first combined verification (`/tmp/148-safe-boundary-verify.log`) failed source line budgets. No budget was raised. Superseded/repetitive delivery commentary in the edited functions was replaced with concise current invariants and WHY comments, preserving code paths and existing checks. Final verification below passes.

## Final verification commands and actual output

From `youcoded/desktop`:

```bash
for n in 1 2 3; do
  npx vitest run tests/native-session-host-delivery.test.ts > "/tmp/148-safe-boundary-repeat-$n.log" 2>&1
  rc=$?
  printf 'repeat_%s_exit=%s\n' "$n" "$rc"
  if [ "$rc" != 0 ]; then break; fi
done
git diff --check
```

Actual output:

```text
repeat_1_exit=0
repeat_2_exit=0
repeat_3_exit=0
```

Each log:

```text
Test Files  1 passed (1)
     Tests  19 passed (19)
```

`git diff --check` produced no whitespace diagnostics, exit 0.

From workspace root:

```bash
node --test scripts/harness-lab/continuation-metrics.test.mjs youcoded/desktop/test-engine/lab-continuation.test.mjs > /tmp/148-safe-boundary-scorer-root.log 2>&1
```

Exit 0:

```text
ℹ tests 30
ℹ suites 0
ℹ pass 30
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

An earlier invocation from `youcoded/desktop` ran the CLI tests from the wrong working directory (two `MODULE_NOT_FOUND` failures; `/tmp/148-safe-boundary-scorer-final.log`). The documented workspace-root invocation above passes; no evaluator CLI test was weakened.

```bash
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/148-harness-performance-lab/youcoded --base HEAD > /tmp/148-safe-boundary-verify-final.log 2>&1
```

Exit 0:

```text
verify: /home/destin/youcoded-dev/worktrees/sessions/148-harness-performance-lab/youcoded (base HEAD)
  tests: related to 22 changed file(s) + 79 source-scanning guards + 1 naming a changed/deleted data file

PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 0 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
PASS  invariants (ast-grep)

OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

Related-test log actual summary:

```text
Test Files  143 passed | 1 skipped (144)
     Tests  3831 passed | 36 skipped (3867)
```

Full check logs: `scratch/verify-20261021-092016-2113216/`. Includes existing compaction (28 tests), history rebuilding, SDK tool-call contract, native host/specialist suites and blocking-call guards. Lint: zero warnings/errors. Design ratchet: 469 warnings, zero errors (non-gating existing warnings); knip passes configured gates with non-gating findings. `--base HEAD` intentionally checks preserved session changes, not hundreds of newer upstream commits. This is related verification, not the full desktop suite.

## Actual offline timing receipts

`/tmp/148-safe-boundary-receipts.json` contains all metadata-only snapshots from the final three repeats (one `performance.now` timebase per run). The real scripted runtime's tool-batch fixture verifies the output file, not a text acknowledgment or request-start surrogate. Each repeat's automatic scorer reports `noNudgeContinuation: success`, `needsNudge: false`; no later human input was needed.

| Repeat | Completion callback → report injection (ms) | Injection → actual next mock request (ms) | Completion → verified Write (ms) |
|---|---:|---:|---:|
| 1 | 12.34134599999993 | 6.401082999999971 | 25.655859999999848 |
| 2 | 12.30315500000006 | 6.580349000000069 | 24.86800900000003 |
| 3 | 11.055413000000044 | 6.36339299999986 | 24.624504000000115 |

These are measured local mock-provider transport/followup timings, **not** paid model quality, live incident latency or production performance guarantees. Timing is reported, never asserted as a wall-clock unit-test budget. Parent-state intervals are not complete: actionable idle and behavioral diagnosis remain unknown/null. Other transport-only snapshots deliberately retain unknown continuation verdicts; Stop/quiesce snapshots are ineligible. The shell fixture's scorer episode is correlated to the specialist report, not a separate shell-continuation score.

## Remaining limits / review handoff

- No live app experiments, installed-build identity claims or provider evaluations. Parent's independent review is still required.
- Reconciliation relies on a successfully read durable transcript; it does not promise exactly-once external side effects when a process dies after a model/tool action but before its injection receipt persists. Missing/unreadable state is not fabricated as confirmed delivery.
- Persistent storage/formatting failures remain pending for a new real boundary/arrival; there is no self-sustaining idle retry timer. This deliberately bounds retries and avoids busy spin.
- Existing report-budget/context-fit/compaction machinery is reused and covered by related suites; this is not an exhaustive new compaction/crash fault matrix.
- Native IPC surface is unchanged; shared Android backend receives the source fix but Android execution/build remains unverified here.

Next action is the parent's requested independent code review, followed by any review corrections. Nothing is committed, merged or published.
