---
date: 2026-09-24
status: active
type: review
topic: specialists plans spending backend design — adversarial review round 2
reviewed: docs/active/design/2026-09-24-specialists-plans-spending-backend-design.md ("Revision 1" section)
binding: docs/active/design/2026-09-05-specialists-plans/decision-log.md (decisions 33–37)
code-as-of: feat/specialists-plans-ui, worktrees/specialists-plans/desktop/src
---

# Specialists plans spending backend — design review 2

Scope: does Revision 1 actually work against the code, and what did it introduce or miss. Round 1
findings D1–D9 that Revision 1 answered are not repeated except where the answer itself doesn't
hold up.

## Findings

- accepted (design "Revision 2") — [severity: high] — **D1's fix names the wrong call sites and has no wire to carry per-step usage
  from `harness-session.ts` to `runPlanChild`'s chip accumulator.** Revision 1 cites
  `harness-session.ts:1409-1415, 2160, 2412` as where `afterReply` hooks in — those are all
  `priceSummaryUsage`, called only from `maybeCompact`/`compactNow`, and BOTH are already
  short-circuited for plan children (`harness-session.ts:3022` `if (!this.opts.planChild) { await
  this.maybeCompact(...) }`; `compactNow` returns `{ok:false, reason:'plan-child'}` at line 2364) —
  a fact the current code itself documents (`native-session-host.ts:5311-5316`: "Plan specialists
  never compact, so compact-summary never carries spend"). The REAL per-step accumulation site is
  `harness-session.ts:3111-3115` (`turnUsage.inputTokens += step.usage.inputTokens...`), which the
  design's own body text cites correctly elsewhere but Revision 1's D1 doesn't reference. More
  fundamentally: `runPlanChild` (`native-session-host.ts:5296`) only ever learns about a child's
  usage via `entry.session.on('transcript-event', onEvent)` — an event-stream listener, not a
  function call — and its handler only reads `turn-complete`/`session-error`/`user-interrupt`
  usage (`:5316-5326`). For `afterReply` to also drive that same accumulator (so it can "stop
  summing turn-complete/... for plan children"), harness-session.ts needs a new way to signal
  native-session-host.ts per step — but the emit surface is explicitly documented FROZEN in two
  places (`harness-session.ts:11-12`; `native-session-host.ts:138-139`, "the frozen
  TranscriptEventType surface means assistant-thinking must stay one Set member"), and the one
  per-step usage-bearing event that exists today (`assistant-thinking`'s `usageProgress`) is
  explicitly gated OFF for every specialist/plan child (`!this.opts.isSpecialistChild` at
  `harness-session.ts:3134-3148`, and `isSpecialistChild: true` is set for every plan child via
  `buildSpecialistSession`). D1 asserts the two totals will be fed from "the SAME events" but names
  no mechanism that gets a per-step event past that gate to `runPlanChild` at all. — evidence:
  `desktop/src/main/harness/harness-session.ts:11-12,2364,3022,3111-3115,3134-3148`;
  `desktop/src/main/harness/native-session-host.ts:138-139,5296-5328` — proposed fix: before T2,
  pick one concrete mechanism (e.g., a constructor-supplied callback `opts.planSpend.afterReply`
  called directly from the step loop, bypassing the transcript-event/frozen-surface path entirely,
  since `planSpend` is already a new `HarnessSessionOpts` field with no compatibility burden) and
  have `runPlanChild` stop calling `addSpend` for plan children in favor of a running total kept by
  that same `plan-spend.ts` object — then the chip and the journal genuinely read one number, not
  two things asserted to match.

- accepted (design "Revision 2") — [severity: high] — **D2's "per-slot window read from `/props`" is not what `/props` reports under
  the app's actual llama-server spawn, so the compaction fix it promises doesn't happen.**
  `EngineManager.effectiveContextWindow()` (`engine-manager.ts:1471-1577`) reads `/props` once and
  its own comment states plainly: under the app's real spawn (no `--parallel` flag — confirmed not
  passed anywhere the engine is launched, `engine-pin.ts` only lists `--parallel` in a flag-name
  mapping table) the reported context figure is "the FULL `-c` shared by all slots — 16384 with 4
  slots, measured; only an explicit `--parallel N` splits it into `-c` / N"
  (`engine-manager.ts:1491-1494`). That pool-total value flows straight into each session's
  `contextLength`/compaction window (`native-session-host.ts:2636,4906-4910`) with no division by
  slot count anywhere downstream. So a local plan child's compaction window is, and remains, the
  FULL shared pool — not "the per-slot window" D2 claims — meaning compaction triggers exactly as
  late as it does today regardless of how many local specialists run concurrently; the design's
  stated reason this "triggers correctly" doesn't hold under the code as written. — evidence:
  `desktop/src/main/engine/engine-manager.ts:1471-1494,1531,1536-1548`;
  `desktop/src/main/harness/native-session-host.ts:2636,4906-4910` — proposed fix: either have the
  design state explicitly that per-slot windowing needs `--parallel N` (a real engine-spawn change,
  not just a read), or drop the "so compaction triggers correctly" claim and accept that concurrent
  local specialists share one compaction budget exactly as before.

- accepted (design "Revision 2") — [severity: high] — **D2's "host's slot reservation... extended to count local-engine children
  against the engine's slot count" is keyed to the PARENT conversation's own model, not to the
  plan step's specialist model — so it doesn't bound local-engine plan concurrency in the case
  that matters.** The wave-width cap the executor uses (`plan-executor.ts:865`,
  `this.runner.maxConcurrent(run.ref)`) is wired to
  `native-session-host.ts:5196: maxConcurrent: (sessionId) => this.maxSpecialistsFor(sessionId)`,
  and `maxSpecialistsFor(parentId)` (`:634-641`) reads
  `this.live.get(parentId)?.session.profileSnapshot.maxConcurrentSpecialists` — the CapabilityProfile
  resolved for the PARENT conversation's own binding, falling back to the flat
  `HOSTED_MAX_CONCURRENT_SPECIALISTS` only if the parent isn't live. `capability-profile.ts:481`
  only derives a local-engine-aware `maxConcurrentSpecialists` (`localSlotCap(d.totalSlots)`) when
  the session doing the resolving is ITSELF on a local model. A plan's specialists resolve their
  OWN, usually different, model per `plan-host-bridge.ts`'s `bindingFor()` (tier-based default,
  decision 35.4 — "models default to each specialist type's existing default", not the parent's).
  So the ordinary case this design exists to serve — a cloud-model conversation (Claude/GPT parent)
  proposing a plan whose steps run on a cheap local model — gets the flat HOSTED cap, computed from
  a session that never touches the local engine at all, with no relationship to the local engine's
  real slot count. Concurrent local-engine plan specialists can still collectively exceed the
  shared pool the way round 1's original D2 finding described; Revision 1's fix only actually
  applies to the narrower case where the PARENT itself also happens to run on that same local
  engine. — evidence: `desktop/src/main/harness/plans/plan-executor.ts:865`;
  `desktop/src/main/harness/native-session-host.ts:634-641,5196`;
  `desktop/src/main/harness/capability-profile.ts:335-337,481`;
  `desktop/src/main/harness/plans/plan-host-bridge.ts` `bindingFor()` (~642-661) — proposed fix:
  size the wave cap off the STEP's frozen specialist binding (`manifest.specialists[step.specialist]`
  / `manifest.steps[id].binding` in the new per-step manifest), not off the parent session's
  profile — e.g. a `localPoolTokens`-successor keyed on the step's own resolved provider/model,
  computed once at manifest-freeze time alongside `pricing`.

- accepted (design "Revision 2") — [severity: medium] — **D3's "the executor awaits the attempt's `pending` before committing" has
  no single choke point to attach to, and none of the plumbing it implies exists yet.** Three
  independent call sites reach `commitReport`/`commitAttempt`: `prepare()` → `recoverAttempt()` →
  `commitReport` at start-of-run crash recovery (`plan-executor.ts:701,720`); `memberEnd()` →
  `commitReport` on the ordinary live-completion path (`:1129`); and `settle()` → `commitReport` on
  the halt/drain teardown path (`:1475`). Each would independently need the new await — there is no
  shared upstream function all three pass through. Neither `PlanChildHandle` (`:148-157`) nor
  `LiveChild` (`:338-347`) carries any field today for a per-attempt write-promise; `ActiveRun`
  (`:349-366`) has no `spendWriteFailed` or `limitReached` field (both new). `settle()`'s one
  existing per-child await, `Promise.all(run.live.map((c) => c.commit))` (`:1470`), is a DIFFERENT
  promise (the `commitReport` result itself, set in `memberEnd`) than the proposed spend-write
  `pending` — so "fits the executor's settle flow" describes a resemblance, not a reuse; the actual
  wiring is new work in three places, any one of which being missed reopens exactly the unhandled-
  rejection risk round 1 raised. — evidence: `desktop/src/main/harness/plans/plan-executor.ts:349-366,701-720,1129,1336-1352,1428-1475`
  — proposed fix: give `PlanChildHandle` a `spendPending: Promise<void>` field, populated by
  `launch()`, and make `commitReport` itself (the one function all three sites already call) await
  it before writing — that's the one real choke point available, not `settle`.

- accepted (design "Revision 2") — [severity: medium] — **D5 gives an exact file list for removing `plans:add-budget` from the IPC
  bridge, but the list omits the renderer component that actually surfaces the feature to the
  user.** `desktop/src/renderer/components/plans/PlanCard.tsx` has ~10 live references: the
  `addBudget()` handler (`:442`, calling `b.addBudget(...)`), a button gated on
  `recommendation.action === 'add_budget'` (`:737`), the amount-entry panel
  (`data-testid="plan-add-budget"`, `:742-748`), and — separately from anything D5's list would
  catch — a hardcoded `fallbackActions()` function (`:151-154`) that returns `['add_budget',
  'stop']` whenever `plan.paused?.actions` is absent, i.e. a silent default that keeps offering
  "Add budget" even if a caller ever gets an unversioned/old paused shape. None of this is in D5's
  named list (`PlansBridge.kt`, `SessionService.kt`, `remote-shim.ts`, `remote-server.ts`,
  `preload.ts`, `ipc-handlers.ts`, `plan-requests.ts`, `shared/types.ts`, `mock-shim.ts`, "every
  test naming it"). It IS covered by the base design's vaguer T7 line ("renderer stops reading
  ceilings/Add budget"), so this isn't unaddressed — but D5 specifically exists to give the kind of
  concrete, can't-miss-it file list round 1 asked for on the removal side, and the one file where a
  miss produces a user-visible dead button (not just dead code) isn't in it. Also worth a note for
  whoever builds T7: `ipc-channels.test.ts`'s plans-parity block hardcodes the count "eight" in its
  `describe` title and comments (not just a `REQUESTS` array entry), so removing the channel there
  is a multi-line edit, not a deletion; and the string `add_budget` also appears, unrelated, as a
  `PlanPauseAction`/`recommend_plan_action` enum value already scheduled for removal by the base
  design's §1/§9 — a repo-wide grep for "every test naming it" will hit both and should not treat
  them as the same fix. — evidence: `desktop/src/renderer/components/plans/PlanCard.tsx:151-154,343,370,442,448,499,737,742,748`
  — proposed fix: add `PlanCard.tsx` to D5's file list by name, including the `fallbackActions`
  default; call out the `ipc-channels.test.ts` "eight" edit and the enum/channel name collision
  explicitly so T7 doesn't grep-and-delete the wrong nine hits.

## Verdict

Revision 1 answers round 1's structural worries (task ordering, drain semantics, recovery test
naming, history cache bounds, images, the retry blind-spot comment) in ways that do hold up against
the code. But its two headline claims don't: D1 points at the wrong lines and never states how a
per-step usage number gets from `harness-session.ts` to `runPlanChild`'s chip accumulator without
either breaking the explicitly-documented frozen transcript-event surface or duplicating counting
logic in two places, and D2's "per-slot window" and "extended slot reservation" both rest on facts
the code contradicts — `/props` reports the whole shared pool under the app's real spawn config,
and the existing concurrency cap is keyed to the parent conversation's own model, not the plan
step's. Those two need to be re-solved, concretely, against the call sites named above before this
goes to build; D3's commit-ordering fix and D5's IPC-removal list are each one file-list addition
away from solid.
