---
status: active
work_item: 148
---

# Native delivery boundaries: isolated offline reproduction

## Scope

Investigation only, authorized steps 1–3. New test:
`youcoded/desktop/tests/native-session-host-delivery.test.ts`.
No production source fixes, provider calls, live-app interaction, manual commits or merges.
Existing lab files and the modified `native-session-host.test.ts` were not edited.

Uses the real `NativeSessionHost`, `HarnessSession`, `SessionStore`, and durable ledger in disposable temp directories, with `MockLanguageModelV4` streams. Promise gates control scheduling; no sleeps synchronize tests. `fetch` throws if called and is asserted unused. Mock requests are inspected for the synthetic report token, not merely for a UI/card update. No actual background shell process is launched.

The primary symptom is delayed delivery across turns; permanent loss is a separate possibility. These experiments do **not** identify the cause or frequency of a live incident. Installed-build identity is independently investigated by the parent; this report makes no identity claim.

## Observed cases

All nine characterization tests pass against the unchanged host. Passing here means **observed behavior reproduced**, not that delivery is correct.

| Case | Observed outcome | Intervention / limits |
|---|---|---|
| Idle parent control | Completion → queue → specialist injection → one parent request, with report token; delivered confirmed, no root send | Genuine background child through scripted offline provider |
| Busy parent + FIFO control | Completion queues while first parent turn is gated. Second and third accepted user turns run before report injection; four parent requests total | Provider gate controls a legal busy interval; demonstrates cross-turn priority delay, not a lost wake |
| Stop control | Child survives Stop; no injection or automatic request. Next explicit user send receives a spliced report before its own message; exactly one parent request | Delivery mode `splice` / held; scorer ineligible |
| Quiesce control | Queued completed report does not wake parent; sends refused | Seeded durable report after quiesce, because quiesce intentionally destroys actual running children; scorer cancelled/ineligible |
| Final drain-return boundary | Report queues while parent still owns `inFlight`; pass ends idle with pending specialist true, delivered false and zero report injections. A later root input recovers it | **Controlled widening**: wrapper awaits a gate after real `drainDeliveries` returns, before `runTurns` resumes. This is not an ungated natural-race reproduction |
| Awaited empty claim boundary | Real ledger claim returns null, held at its return boundary; child then completes and queues. Stale null consumption deletes the new pending hint. Parent idle, report durable/undelivered, pending specialist false; a later user turn still does not inject | **Controlled widening** of real empty-claim promise. Initial empty pass is explicitly kicked by the test. No spontaneous occurrence/frequency claim |
| Unmarked restart control | Completed held/unmarked report survives destroy and is injected once by a new host on resume; one request contains report | Real host replacement on same isolated disk, not a process crash |
| Marker-before-injection fault | Injected one-shot formatting failure occurs after durable marker. No injection/request for report. Later user boundary and new-host resume do not reclaim it; marker true, delivered false; persisted transcript has zero report injections | **Explicit fault injection**, not a naturally observed formatting error or actual crash |
| Shell notice during specialist drain | Specialist report is injected and its parent model request is gated. Synthetic shell completion queues at `queueHostNotice`. After specialist turn settles, parent is idle but shell notice remains pending/uninjected. Later user boundary delivers it; subsequent request contains shell token | No drain/claim override or thrown fault in this case: ordinary provider wait, synthetic shell enqueue at the actual seam. Not end-to-end shell completion testing |

### Stable ordering evidence from the run

`input:*` below is transcript dispatch; input timestamps supplied to the scorer are separately captured at **host send acceptance**, so already-accepted FIFO inputs are not mislabeled as later nudges.

```text
idle:
completion -> queue -> injected:specialist-report -> parent-request

busy/FIFO:
input:first -> parent-request -> completion -> queue -> input:second
-> parent-request -> input:third -> parent-request
-> injected:specialist-report -> parent-request

Stop:
completion -> queue -> injected:specialist-report
-> input:explicit-resume -> parent-request

controlled final-drain, before recovery:
input:first -> parent-request -> completion -> queue
pendingSpecialist=true, injections=[], requests=1

controlled final-drain, after recovery:
input:first -> parent-request -> completion -> queue
-> input:later-boundary -> parent-request
-> injected:specialist-report -> parent-request

controlled empty claim, after later user boundary:
queue -> completion -> queue -> input:later-boundary -> parent-request
pendingSpecialist=false, injections=[]

controlled marker failure, after later user boundary:
completion -> queue -> input:later-boundary -> parent-request
injections=[]

synthetic shell while specialist turn drains:
completion -> queue -> injected:specialist-report -> parent-request
pendingShell=true, injections=[specialist-report], requests=1
```

## Source boundaries verified in this checkout

Paths below are relative to `youcoded/desktop/`:

- `src/main/harness/native-session-host.ts:1616–1640`: queue sets pending hint, kick refuses a non-idle parent; eligible idle wake sets `inFlight` synchronously.
- `:4271–4297`: accepted ready human FIFO turns run before delivery tail. This can delay reports across multiple actual parent turns; it does not imply completion has not happened. The loop does not promise delivery fairness before the ready FIFO empties.
- `:4300–4308`: final delivery await, then only human queue checked; `finally` clears `inFlight` without pending-lane recheck.
- `:4337–4373`: host-notice lane drained before specialist lane. It is not revisited merely because a shell notice arrives during later awaited specialist work.
- `:4441–4445`, `:4571–4572`: awaited claim can yield empty; absent fallback deletes the pending hint.
- `:4485–4506`: marker persisted before formatting and actual delivery; `:4530–4554` catch releases lease but will not retry stamped record.
- `src/main/harness/specialists/delegation-ledger.ts:533–535`: all claims exclude `injectionAttempted`; `:573–574` writes that flag.

The source's claim-before-injection recovery comments must not be read as covering **marker-before-injection** failure. The unmarked and marked restart controls deliberately distinguish these states. No guidance/source wording was changed during this investigation.

## Collector / automatic scorer integration

The new test uses existing `desktop/test-engine/lab-continuation.mjs` and, when present, workspace `scripts/harness-lab/continuation-metrics.mjs`; neither existing file was edited. Standalone component checkouts without the workspace scorer explicitly report scoring unavailable rather than failing transport characterization.

Each evidence line includes correlated child/tool IDs, completion callback receipt, actual queue seam timestamp, genuine injected transcript receipt with turn/splice mode, actual mock provider request-start callback, terminal receipt, and ordered metadata-only stage receipts on one `performance.now()` timebase. No timing threshold is asserted.

All emitted continuation verdicts are **unknown**, deliberately: these are transport fixtures, not fixture-verified useful work; progress coverage is false, complete scheduler-state intervals are absent, and observations are not extended with sleeps to manufacture a one-second deadline result. Stop and quiesce snapshots are additionally ineligible. Request start or scripted assistant text is never counted as useful progress, and later scripted user input is never counted as autonomous success. Scoring of the shell-notice case refers only to its correlated specialist episode, **not** shell behavior.

## Commands and actual outcomes

Run from `youcoded/desktop/`:

```bash
for n in 1 2 3; do
  npx vitest run tests/native-session-host-delivery.test.ts > "/tmp/148-delivery-repeat-$n.log" 2>&1
  rc=$?
  printf 'repeat_%s_exit=%s\n' "$n" "$rc"
  if [ "$rc" != 0 ]; then break; fi
done
YOUCODED_CONTINUATION_EXPECT_FIXED=1 npx vitest run tests/native-session-host-delivery.test.ts > /tmp/148-delivery-final-red.log 2>&1
printf 'expected_red_exit=%s\n' "$?"
```

Actual command output:

```text
repeat_1_exit=0
repeat_2_exit=0
repeat_3_exit=0
expected_red_exit=1
```

Each ordinary run's summary:

```text
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

The opt-in desired no-loss contract goes red against the unchanged host:

```text
 Test Files  1 failed (1)
      Tests  4 failed | 5 passed (9)
```

The four failures are final drain-return, empty claim, pre-injection marker failure, and shell notice during specialist drain. Each reports:

```text
AssertionError: expected [] to have a length of 1 but got +0
```

This opt-in run switches only assertions, not production behavior. It is intentionally red evidence, not a claim that the normal test suite is failing or that any fix has been implemented.

From workspace root:

```bash
bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/148-harness-performance-lab/youcoded --base HEAD > /tmp/148-delivery-verify-final.log 2>&1
```

Actual final output:

```text
verify: /home/destin/youcoded-dev/worktrees/sessions/148-harness-performance-lab/youcoded (base HEAD)
  tests: related to 19 changed file(s) + 79 source-scanning guards + 1 naming a changed/deleted data file

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

Related-test log summary: `Test Files 80 passed | 1 skipped (81)`; `Tests 2405 passed | 36 skipped (2441)`. Lint reports `Found 0 warnings and 0 errors.` Design lint passes its ratchet but reports `Found 469 warnings and 0 errors.` Knip passes its configured gates while printing non-gating findings; PASS does not imply warning-free.

`--base HEAD` deliberately verifies this preserved branch's current uncommitted lab changes, not hundreds of newer upstream commits; it includes the pre-existing modified host test and other lab files. Full check logs: `scratch/verify-20261021-001918-1862266/`. Nine raw receipt snapshots were extracted without model transcript export to `/tmp/148-delivery-receipts.json`; the three repeat logs and desired-red log above preserve raw evidence outside the app.

Initial authoring failures were retained, not concealed: `/tmp/148-delivery-first.log` had 3 failed/5 passed (observer incorrectly classified a post-completion first input as initial, and an already-resolved queue signal was reused); both observer errors were fixed locally without production changes. `/tmp/148-delivery-verify.log` initially failed new test type inference for a nullable queue timestamp; final verification above passes after correction.

Existing collector/scorer contract tests were also run from workspace root:

```bash
node --test scripts/harness-lab/continuation-metrics.test.mjs youcoded/desktop/test-engine/lab-continuation.test.mjs > /tmp/148-delivery-scorer-tests.log 2>&1
```

Exit 0; actual summary:

```text
ℹ tests 29
ℹ suites 0
ℹ pass 29
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

## Next justified action

Parent can use these results to separate (1) ready-human-FIFO priority delay, (2) controlled scheduler lost-wake/hint-loss windows, (3) marker loss under injected failure, and (4) the ordinary inter-lane shell wait demonstrated here. None establishes which occurred live. A production change needs separate authorization and a delivery/fairness/replay contract preserving Stop/quiesce behavior; no such fix is included. No paid evaluation is needed to reproduce these offline cases.
