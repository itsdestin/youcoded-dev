---
status: draft
---

# Native harness turn lifecycle implementation plan

> **For agentic workers:** use `superpowers:subagent-driven-development` or `superpowers:executing-plans` after contract sign-off. Work task-by-task with red/green evidence and a fresh review before integration.

**Goal:** keep history valid after permission errors, deliver ordinary queued input at safe in-turn boundaries, and retract abandoned retry output consistently.

**Architecture:** the host remains the sole owner of the user-message FIFO and receipt IDs. The driver can claim ready queued input at explicit safe boundaries without starting another turn. Accepted tool groups always receive one result per call before a user/instruction message is inserted. A common pending-call finalization seam also supports the approved pre-write instruction barrier in Batch B.

**Tech stack:** TypeScript, existing AI SDK stream loop and ModelMessage history, host EventEmitter transport, SessionStore/accepted-history capture, Vitest scripted models.

## Scope and constraints specific to this work

Authority: `docs/active/design/2026-09-26-native-harness/native-harness.decisions.md`, including the latest direct instruction simplifying Q-16. Covers Q-1, Q-2, Q-12 and Q-16/Q-17.

One send flow only. A busy message appears queued, then is delivered automatically as soon as safe. **No After this finishes choice, mode picker, Send now, new Stop and send, or automatic backgrounding on message arrival.** Preserve queued Edit/Cancel and existing Stop's survival of submitted messages. A running action or unanswered approval is not implicitly interrupted/answered by new text. No concurrent root turn. Root user messages are real persisted user events with attachments, not history-only specialist `<steer>` messages.

## Task A1 — Contain permission failures without dangling tool calls

**Files:** `youcoded/desktop/src/main/harness/harness-session.ts` (`runOneTool`, accepted-step result loop, error exit); tests `harness-session-loop.test.ts`, `harness-history-rebuild.test.ts`, `native-session-host.test.ts`.

**Interfaces:** introduce an internal result-group finalization helper only if it removes duplicated load-bearing logic. It consumes announced calls, completed real results/origins and a reason for remaining not-run calls; it emits exactly one result for each remaining call, appends one tool message and records origins. Distinguish permission-system failure from human denial/cancellation and from an action that already started. It does not execute tools or approve anything.

- [ ] Convert `native-permission-audit-probe.test.ts`'s permission case into owning-suite assertions requiring two accepted calls to have two results, an accurate permission-storage error, zero tool execution, and a subsequent send that reaches the fake model normally.
- [ ] Repeat with a prior successful call followed by a decision rejection; preserve the successful result and mark only unstarted calls not run. Test throwing `decide`, broker failure before approval, and interruption separately so a store error is not mislabeled user denial.
- [ ] Run from `youcoded/desktop`: `node node_modules/vitest/vitest.mjs run tests/harness-session-loop.test.ts tests/harness-history-rebuild.test.ts`; retain the failing regression output.
- [ ] Contain the permission-decision exception at the driver boundary. Finalize the current accepted call group before emitting the session error/settling. Keep the actual failure detail, not an invented cause. Do not replay an earlier completed action or append partial assistant text twice on the outer catch.
- [ ] Rerun the tests, plus relevant host/store suites. Compare live history and rebuilt history; valid events on screen alone are not sufficient.

## Task A2 — Host delivery reaches stable idle and preserves acknowledgement order

**Files:** `src/main/harness/native-session-host.ts` (`send`, queue ownership, `runTurns`, idle-delivery pass); tests `native-session-host.test.ts`, `native-send.test.ts`, `native-send-unconfirmed.test.tsx`.

**Interfaces:** preserve public `NativeSendResult`, existing queue IDs, limits and removeQueued return semantics. Queue entries need an explicit delivery-readiness boundary so neither the host drainer nor the driver's future claim callback can emit a user-message before its send acknowledgement. Use the existing deferred-dispatch intent, not a speculative timeout. A synchronous claim removes only a ready FIFO head; an unready head cannot be bypassed by later messages. The scheduling/readiness transition must itself trigger eventual progress if the session settled while the head was unready.

- [ ] Promote `native-host-audit-probe.test.ts` into a regression requiring an accepted follow-up during the background-notice tail to execute before the host becomes idle. Include an idle-started notice pass, a user-started pass, and several arrivals during delivery.
- [ ] Add acknowledgement-before-transcript ordering for both initially idle and busy sends. Explicitly test a queued head becoming ready after the final drain check, Cancel/Edit before readiness, Cancel/Edit before claim, and too-late removal after claim.
- [ ] Add arrivals while Stop holds background reports, queue-cap refusal, failed notice delivery, teardown replacement of a captured entry, and empty→nonempty transitions. Preserve Stop's current behavior and the existing quiesce fence.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/native-session-host.test.ts tests/native-send.test.ts tests/native-send-unconfirmed.test.tsx`; show stranded-tail and ordering failures red.
- [ ] Make `runTurns` alternate serial queued-user dispatch and host-notice draining until no ready work remains, with a reliable kick for newly ready queued work. Recheck liveness after awaits. Clear `inFlight` only at a boundary that cannot strand an accepted head.
- [ ] Do not fold unapproved teardown R01 or model-switch R02 changes into this task beyond safety checks required at the new callback. If new tests prove an unavoidable dependency, explicitly report it before widening scope.
- [ ] Rerun suites and confirm cancellation/removal IDs still drive the current queue strip correctly.

## Task A3 — Ordinary busy input joins the ongoing turn safely

**Dependency:** A1 paired-result finalization and A2 ready FIFO ownership.

**Files:** `src/main/harness/harness-session.ts` (`HarnessSessionOpts`, turn loop, user-event/history append helper); `src/main/harness/native-session-host.ts` (root wiring and claim callback); renderer reducer only where real mid-turn user events require correct queue/bubble behavior. Tests: `harness-session-loop.test.ts`, `native-session-host.test.ts`, `harness-accepted-history.test.ts`, `harness-history-rebuild.test.ts`, `native-image-attachments.test.ts`, `chat-reducer.test.ts`, `native-send.test.ts`.

**Internal interface:** optional synchronous `takeReadyBusyMessage(): { id: string; text: string; attachments: string[] } | undefined` on root session options, or an equivalently narrow named interface. Host implementation checks the captured live entry, readiness, FIFO and quiesce state, then claims one head atomically. It performs no disk read or model call. This is not a new IPC method or a new UI send mode.

**Acceptance helper:** factor the existing beginning-of-turn user event/history bookkeeping into a helper usable without re-entering `send()`: unchanged user text and attachment paths → real `user-message` event → matching ModelMessage/image parts → event UUID and history origin/capture update. Preserve ordinary human provenance; do not mark it app-generated. Do not reset the running turn's abort, spent steps, usage, tool state or safety budgets.

### Boundary policy

- While provider text is streaming: leave the input queued; the current request cannot be retroactively changed.
- Once a response is complete, before executing its announced tool calls: if ready user input exists, pair all those unexecuted calls with truthful not-run results, append the user message and request the model again.
- While a tool or permission wait is active: do not interrupt or imply consent. Once that call resolves, record its result; **before starting another unexecuted call**, check the queue. If ready, finalize remaining calls as not run, append the input and replan. There is no reason to run an entire remaining multi-call group merely because its calls were already announced.
- Before emitting final turn-complete: claim a ready message and continue the model loop if one exists. No await between an empty final check and turn-complete. Later arrivals use A2's ordinary host drain/readiness kick.
- Interrupt/error/dismissed-question exits settle normally; surviving queued messages then use the host's next-turn path rather than resurrecting the interrupted turn.

- [ ] Add scripted two-call tests proving input ready before the group causes zero executions and two paired not-run results before the real user message. The following model request sees the correction in the same turn.
- [ ] Add input during the first call: first call completes once, second call is not started, its paired result explains the supersession, and the next request sees the correction. Repeat with approval pending and then allowed/denied; mere text never resolves the approval.
- [ ] Add no-tool final-response, last-check race, several FIFO messages, unchanged text duplicates, empty text with attachment, image-capable/non-vision models, queue Edit/Cancel and failed append/claim error paths. Claims must not silently lose input if acceptance fails; preflight or explicit failed-delivery handling is required.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/harness-session-loop.test.ts tests/native-session-host.test.ts tests/native-image-attachments.test.ts`; observe the in-turn timing regressions red.
- [ ] Wire the callback for normal root create/resume. Preserve specialist `postSteer` ownership and durability behavior; do not turn child steering into ordinary parent-send queue consumption.
- [ ] Implement the user-message acceptance helper and boundaries using A1 result finalization. Synthesize not-run results with a distinct truthful reason, not a false human denial or a claim that an action was canceled after it ran.
- [ ] Verify history/store/renderer composition with `node node_modules/vitest/vitest.mjs run tests/harness-accepted-history.test.ts tests/harness-history-rebuild.test.ts tests/session-store.test.ts tests/chat-reducer.test.ts tests/native-send.test.ts tests/native-send-unconfirmed.test.tsx`. A resumed transcript and accepted-history checkpoint must agree about every in-turn human message and tool result.
- [ ] Preserve the familiar queue presentation. No additional delivery-status mode or controls are authorized. Make only any correctness-required reducer adjustments so delivered messages leave the queue and appear once at the correct point.

## Task A4 — Retract abandoned automatic retry attempts consistently

**Files:** `src/main/harness/harness-session.ts` (`runStreamOnce`, `consumeStep`, `withRetry`); existing SessionStore/drop-part consumer only if a gap is demonstrated. Tests `harness-session-loop.test.ts`, `harness-stall-watchdog.test.ts`, `session-store.test.ts`, `harness-accepted-history.test.ts`, reducer drop-part tests.

**Interfaces:** share an attempt-local output-retraction operation with manual retry. The transient retry layer invokes it only when it has decided to replay that attempt, before the retry delay/request. It clears the partial-text callback, withdraws preparing cards, drops emitted text/reasoning parts from UI/persistence and abandons capture provenance. Do not blanket-retract the final failed attempt when no retry will happen; preserve existing truthful partial-error behavior.

- [ ] Convert `native-retry-audit-probe.test.ts` into assertions requiring abandoned text to be absent from effective display, durable replay and accepted model history after text→503→successful replacement.
- [ ] Repeat for 429 and ECONNRESET, reasoning/preparing parts, replacement failure before new text, retry exhaustion, and manual retry. Verify completed tool side effects from prior steps are never repeated.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/harness-session-loop.test.ts tests/harness-stall-watchdog.test.ts tests/session-store.test.ts tests/harness-accepted-history.test.ts`; observe missing retraction red.
- [ ] Extract/reuse the existing manual retry's coordinated teardown, scoped to one provider attempt. Feed the automatic retry decision through that operation before replay. Preserve existing stop/cancel and usage-reporting semantics; do not expand the retry count or paid-request budget.
- [ ] Rerun suites, checking both emitted events and effective replay after drop-part tombstones. A drop notice on screen without disk/history agreement is not complete.

## Integration checks for this batch

- [ ] Exercise the composition of queued user input, new path rules (Batch B), a permission error and an automatic retry, using a deterministic scripted model rather than paid inference.
- [ ] Fresh reviewer checks every accepted-call exit, idle/readiness transitions, event-before-ack ordering, cancel IDs, image persistence and capture provenance.
- [ ] Verify the same queued-message view in isolated dev tooling: it looks queued until receipt and sends at a safe point with no extra controls. A live interaction review is for timing, not a new design-choice round.
- [ ] Update native-runtime depth documentation for the approved timing change without inventing sandbox or interruption promises.
- [ ] Run the full desktop verification after all approved batches, using the master plan's exact command. Keep paid harness evaluation optional and separately authorized.
