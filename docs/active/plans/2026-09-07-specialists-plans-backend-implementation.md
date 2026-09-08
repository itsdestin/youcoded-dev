---
date: 2026-09-07
status: active
type: plan
topic: specialists stage two — backend implementation
branch: feat/specialists-plans-ui
contract: docs/active/design/2026-09-05-specialists-plans/specialists-plans.contract.json
design: docs/active/design/2026-09-07-specialists-plans-backend-design.md
---

# Specialists plans backend — implementation plan

## Global constraints

- The signed 18-row contract is fixed. Contradiction requires a reopen deck, never a silent UI change.
- Call child sessions **specialists** everywhere. Plans and duties remain separate words. This work does not build duties or Autonomous Assistants.
- `propose_plan` is offered on every cloud model and on reviewed local models from the 9B class up; local models below that and specialist children never receive it.
- The production plan schema must match the completed grammar probe's nested strict shape: `goal`, recursive step objects with `id/kind/specialist/task/budget_tokens`, kind fields (`items`, `of`, `max_iterations`, `until`, `steps`), and app-side semantic validation. Do not rerun probes.
- Four is the maximum simultaneous specialist count. Local children share one context pool and every first/restarting child is charged a full prefill.
- Budgets are hard authorization stops. There are no unreserved transmissions, hidden retries, compaction/summarization calls, or warn-and-continue paths in plan children.
- A visible paused/interrupted/stopped plan has no running child, process, timer, slot, reservation, or lease. Waiting is free.
- Resume reads committed results from disk and never reruns a finished step. A safe restarted specialist pays one fresh prompt. Ambiguous transmitted/effectful work pauses rather than replaying automatically.
- The seven request channels are exactly `plans:approve`, `plans:comment`, `plans:add-budget`, `plans:resume`, `plans:stop`, `plans:get-auto-approve`, `plans:set-auto-approve`; add `plans:event` as the push channel. Wire main, preload, remote shim/server, and `SessionService.kt`, then remove all seven methods from `MOCK_ONLY`.
- Shared renderer code must remain browser-only and Android-safe. Remote restart hydration uses `chat:hydrate`; local Electron hydration uses `session:replay-live-state` after the first transcript page.
- Every behavior change is TDD: write the focused test, run it and record the expected red failure, add minimal code, rerun green. Non-trivial edits receive WHY comments.

## Task 1 — Schema, semantic validator, eligibility, and `propose_plan`

**Create/modify**
- `desktop/src/main/harness/plans/schema.ts` — exact model-facing Zod/JSON schema and TypeScript document types.
- `desktop/src/main/harness/plans/validator.ts` — kind rules, ids/references, roster resolution, bounded ceiling derivation.
- `desktop/src/main/harness/plans/eligibility.ts` — cloud/local-9B capability decision, ready to consume concurrent model-information metadata.
- `desktop/src/main/harness/tools/propose-plan.ts` — conditionally attached tool, structural `ToolServices.plans.propose` callback.
- `desktop/src/main/harness/harness-session.ts`, `tools/types.ts` — attach/gate tool and one-repair lifecycle; never on child sessions.
- tests: `desktop/tests/plan-schema.test.ts`, `plan-tool.test.ts`, `plan-eligibility.test.ts`.

**Required tests**
- Exact probe-compatible valid map→verify→combine and nested repeat documents pass; extra keys, wrong kind fields, nested repeat, duplicate/forward ids, unknown specialists, invalid bounds fail.
- Derived fan-out/ceiling includes every item and maximum repeat iteration.
- Every cloud provider type qualifies when the session supports tools; reviewed 9B+ locals qualify; 2B/unknown local/tool-less/child does not.
- Invalid arguments get one repair opportunity only; exhausted repair creates no durable proposal and leaves no writing state.
- Tool-input start creates a stable writing projection; success replaces it; abort/invalid/truncated input terminates it and keeps tool-call/result pairing.

## Task 2 — Strict durable journal and plan service

**Create/modify**
- `desktop/src/main/harness/plans/plan-journal.ts` — strict raw read, quarantine, lock-guarded mutations, fencing epochs, projection/event chokepoint.
- `desktop/src/main/harness/plans/plan-service.ts` — propose/action/settings API, trusted revision token, manifest freeze and drift checks.
- `desktop/src/main/harness/plans/types.ts` — internal records/result discriminants.
- `desktop/src/main/native-home.ts` only for a narrow strict/raw or atomic helper; do not weaken existing contracts.
- tests: `desktop/tests/plan-journal.test.ts`, `plan-service.test.ts`.

**Required tests**
- Missing initializes lazily; malformed/unsupported files preserve/quarantine bytes and refuse overwrite.
- Atomic CAS lease/fence rejects stale executors; live foreign lease cannot be stolen; dead/expired recovery becomes interrupted.
- Every mutation increments seq and emits one projected `PlanView`; committed reports stay immutable.
- Proposal freezes model/pricing/specialist/permission fingerprints; drift blocks approve/resume.
- Comment writes and later atomically consumes the trusted revision token; unrelated proposals and repeated comments cannot mislink.
- Auto-approve defaults off, validates non-negative integer limits, persists through `NativeHome`, and marks/runs only an under-limit proposal.
- Action/settings result discriminants include explicit unsupported/error forms.

## Task 3 — Budget adapter and plan-child request mode

**Create/modify**
- `desktop/src/main/harness/plans/budget-adapter.ts` — conservative complete-request bounds and adapter conformance contract.
- `desktop/src/main/harness/plans/plan-budget.ts` — locked reserve/settle/release arithmetic for tokens, dollars, and local context pool.
- `desktop/src/main/harness/harness-session.ts` — opt-in plan-child mode: one transmission, no SDK/harness retry, compaction, summaries, or auxiliary calls; bounded output.
- provider request wiring only where needed to pass a per-request maximum and disable retries.
- tests: `desktop/tests/plan-budget-adapter.test.ts`, `plan-budget.test.ts`, targeted `harness-session` plan-mode cases.

**Required tests**
- Full messages/tool schema/framing are counted; unsupported binary/image/reasoning input refuses before fetch.
- No provider request occurs without durable reservation; a concurrent wave atomically reserves against `spent + reserved` and local shared context.
- `maxOutputTokens` is the exact remaining authorized amount; zero room sends nothing.
- Plan mode performs no retry/compaction/summary call after stalls/errors/context pressure.
- Silent/interrupted/error usage charges the whole reservation; authoritative lower usage releases the difference; over-bound usage disables execution and pauses.
- Dollar limit uses the frozen highest applicable rate; missing rate is null, local is free without fabricating `$0.00`.
- Add-budget tranche enlarges the paused attempt and includes the next fresh prompt.

## Task 4 — Executor, restart recovery, and host integration

**Create/modify**
- `desktop/src/main/harness/plans/plan-executor.ts` — ordered step engine, waves, repeat decision result, pause/stop settling, resume.
- `desktop/src/main/harness/native-session-host.ts` — `ToolServices.plans`, ordinary specialist spawn/resume plumbing, plan events, hydration projections, teardown.
- existing specialist result/ledger types only as needed to tag plan/step/attempt and recover child transcript outcomes.
- tests: `desktop/tests/plan-executor.test.ts`, focused additions to `native-session-host.test.ts`.

**Required tests**
- map fans in waves up to resolved cap; writers still serialize; verify/combine receive only bounded labelled dependencies.
- Child completion is journalled before successor launch; a fresh executor skips committed attempts and reads reports from disk.
- `prepared` may restart; terminal child transcript is committed without a request; ambiguous request/effect pauses and does not replay.
- Restart charges exactly one fresh prompt for each safely restarting specialist and never a finished step.
- Repeat final leaf requires `{report,repeatSatisfied}`; malformed output pauses; max iterations is hard and included in ceiling.
- One child exhausting/failing enters internal pausing, aborts three streaming/tool siblings, waits only to the deadline, forcibly disposes stragglers, pessimistically settles, releases all resources, then emits paused.
- Stop has the same bounded settle ordering. Destroy/app quit interrupts active plans into recoverable journal state.
- Paused/interrupted/stopped state owns no child/session/process/timer/reservation/lease.

## Task 5 — Renderer events, durable hydration, and real card actions

**Create/modify**
- `desktop/src/shared/types.ts`, `renderer/hooks/useIpc.ts` — typed event/action/settings contracts.
- `desktop/src/renderer/App.tsx`, `state/chat-types.ts`, `state/chat-reducer.ts` — subscribe to `plans:event`, first-page local replay, remote snapshot plan projections.
- `desktop/src/renderer/components/plans/PlanCard.tsx`, `SpecialistsSection.tsx` — replace `any` calls with typed bridge; unsupported behavior; retain signed visuals/copy.
- tests: plan reducer/action tests, `chat-serialization.test.ts`, focused PlanCard/SpecialistsSection tests.

**Required tests**
- Latest seq wins and an unknown card is ignored.
- All first-page startup/resume paths await live-state replay after reduction.
- Plan state round-trips through JSON `chat:hydrate`; post-snapshot deltas still land.
- Seven button/settings methods consume normalized action/read/write results; unsupported Android hides/disables controls and never mutates optimistically.
- All signed card states and copy remain unchanged.

## Task 6 — Desktop/remote/Android transport parity

**Create/modify**
- `desktop/src/main/ipc-handlers.ts`, `preload.ts`, `remote-server.ts`, `renderer/remote-shim.ts`.
- `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`.
- `desktop/tests/ipc-channels.test.ts` and focused IPC/remote tests; Android unit test where available.

**Required tests**
- Exactly seven plan request strings and `plans:event` match across shared surfaces.
- Desktop IPC and remote WS call the same `PlanService` and normalize responses identically.
- `sendLiveOnlyState` reads journal projections for Electron; remote `chat:hydrate` contains journal-backed plan state and has no parallel plan replay buffer.
- Android returns typed `unsupported:true` for all seven calls, including a safe getter shape; no call times out.
- Push events route to the correct session/window and remote clients.

## Task 7 — Mock registry cleanup, docs, and integration coverage

**Create/modify**
- `desktop/src/renderer/dev/workbench/mock-only.ts`, `mock-shim.ts` comments/types only: retain fixture behavior but remove the seven real methods from `MOCK_ONLY`.
- `.claude/rules/native-specialists.md`, `youcoded/docs/native-runtime.md`, workspace `docs/MAP.md` only if entry points/guards need updating.
- integration tests exercising complete plan lifecycles.

**Required tests/checks**
- propose→approve→waves→complete; propose→auto-approve; budget pause→add exact token amount→continue; app restart→interrupted→continue without finished-step replay; comment→trusted revised card; stop during four-child wave.
- `node scripts/workbench-boot-check.mjs` against a serving isolated workbench after shim changes.
- Relevant desktop tests after each task; Android JDK21 test command with `-x bundleWebUi` after Kotlin edits.
- Final command from `/home/destin/youcoded-dev`: `bash scripts/verify.sh worktrees/specialists-plans`.
