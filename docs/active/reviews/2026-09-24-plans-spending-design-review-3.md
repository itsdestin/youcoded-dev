---
date: 2026-09-24
status: active
type: review
topic: specialists plans spending backend design — adversarial review round 3 (final)
reviewed: docs/active/design/2026-09-24-specialists-plans-spending-backend-design.md ("Revision 2" section)
binding: docs/active/design/2026-09-05-specialists-plans/decision-log.md (decisions 33–37)
code-as-of: feat/specialists-plans-ui, worktrees/specialists-plans/desktop/src, f150552d
---

# Specialists plans spending backend — design review 3 (final)

Scope per instruction: verify Revision 2's E1 (one source for both totals), E2/E3 (local-engine
serialization), E4 (commitReport as the single choke point) against the code, plus anything
genuinely new and blocking. Resolved rounds-1/2 findings (D1–D9, and round 2's D3/D5) are not
re-litigated except where Revision 2's own fix introduces a new gap.

## Findings

- F1 accepted (design "Revision 3") — [severity: high] — **E1 names the wrong function as the construction/wiring site for `planSpend`, for a third time.** By the point `runPlanChild` (`native-session-host.ts:5296`) runs, the
  child's `HarnessSession` — and therefore its `HarnessSessionOpts` (a constructor-only field:
  `constructor(private opts: HarnessSessionOpts, ...)`, `harness-session.ts:1090`, no setter) — has
  already been built. The ONLY places `HarnessSessionOpts.planChild`-equivalent fields are set today
  are inside `buildSpecialistSession` (`native-session-host.ts:3625`, specifically the
  `...(extra.plan ? { planChild: extra.plan.gate, providerType: extra.plan.providerType } : {})`
  spread at line 3649), which is called from `startPlanChild`'s resume branch (`:3582`) and from
  `createChild` (`:3526`+) for a fresh child — both of which run and RETURN before
  `startPlanChild` calls `return this.runPlanChild(input, childId, token)` at `:5290`. `runPlanChild`
  itself only does `entry = this.live.get(childId)!` (`:5297`) — it reads an already-live session, it
  does not construct one. So a `planSpend` object built inside `runPlanChild` can be wired into the
  child's `HarnessSessionOpts` only by retroactively mutating a private constructor field, which the
  class does not expose. Separately, `runPlanChild`'s `finally` block (`:5350–5360`) needs to read
  that SAME object's final running total to call `emitSubagentUsage()` once — but whatever builds
  `planSpend` at the real construction site (`startPlanChild`/`buildSpecialistSession`) has no
  established path back to `runPlanChild`, which is a sibling call reached via `this.live.get()`, not
  a callee. The natural carrier is `LiveEntry` (`wireChildLive`, `:3762`, already threads
  `opts.plan` onto `entry.plan` the same way `entry.plan.gate`/`tag` are threaded today) — but E1
  does not name `wireChildLive`, `buildSpecialistSession`, or `LiveEntry` at all, so this is not
  "the wire," it is still an assertion with no wire, for the third round running (round 1's D1 cited
  the wrong lines; round 2's D1 named the right accumulation site but no mechanism; Revision 2's E1
  names a function that structurally cannot do what it claims). — evidence:
  `desktop/src/main/harness/harness-session.ts:1090`;
  `desktop/src/main/harness/native-session-host.ts:3526,3582,3625,3649,3762,5267,5290,5296-5297,5350-5360`
  — proposed fix: build the `planSpend` object in `startPlanChild` (before either the resume or
  fresh-child branch), thread it through `buildSpecialistSession`'s `extra.plan` into
  `HarnessSessionOpts.planSpend` exactly as `gate`/`providerType`/`tag` are threaded today, AND
  through `wireChildLive`'s `opts` into `LiveEntry.planSpend` so `runPlanChild`'s `finally` block can
  read the same object's total for `emitSubagentUsage()`. Name this explicitly — one object, two
  attachment points (`HarnessSessionOpts` for the harness's `afterReply` calls, `LiveEntry` for
  `runPlanChild`'s chip emission) — or the "single source" claim stays unbuilt going into T1/T2.

- F2 accepted (design "Revision 3") — [severity: medium] — **E4's `spendPending` is specified as a value ("set by launch()"), but a value captured at launch time cannot represent a chain that keeps extending after launch, so `commitReport`'s await can resolve immediately and wait for nothing.** Design §3
  says `plan-spend.ts`'s `afterReply` "chains onto a `pending` promise running ONE
  `journal.mutateFenced`" — i.e. `pending` is reassigned on every reply
  (`pending = pending.then(() => write())`), and a step's turn can span many replies. `launch()`
  (`plan-host-bridge.ts`) runs once, at attempt start, before any reply has happened — at that moment
  the object's `pending` is just its initial resolved value. E4's wording, "`PlanChildHandle` gains
  `spendPending: Promise<void>` (set by launch())," describes a one-time assignment of whatever
  `pending` equals AT LAUNCH, not a live reference to whatever `pending` equals when `commitReport`
  later reads it (after the turn's LAST reply, potentially much later). If built literally as
  written, `commitReport`'s new "await `spendPending` first" (the whole point of E4, and of round
  2's D3 this answers) becomes an await on an already-resolved promise — it returns immediately,
  never observes the last reply's write, and the write-failure routing to recovery that E4 promises
  never fires. `PlanChildHandle` today is a plain object literal built once per `launch()` call
  (`plan-executor.ts:148-157`; no existing field is ever reassigned after construction, e.g.
  `outcome`/`abort`/`dispose` are all fixed at return time), so a builder following the literal
  design text has a natural, silent way to build this wrong — and it would look correct (types check,
  the field exists, `commitReport` awaits *something*) while doing nothing. — evidence: design §3
  "Implementation" paragraph (`pending` reassignment) vs. §Revision 2 E4 ("set by launch()");
  `desktop/src/main/harness/plans/plan-executor.ts:148-157` (`PlanChildHandle`, no live/getter
  fields today) — proposed fix: state explicitly that `spendPending` must be a live accessor into the
  `plan-spend.ts` object's current `pending` chain at READ time (e.g. a getter:
  `get spendPending() { return spend.pending }`, or a function `spendPending(): Promise<void>`), not
  a promise value fixed once at `launch()`; add a `plan-spend.test.ts`/`plan-executor.test.ts` case
  that fails on the naive reading — an `afterReply` write that starts AFTER `launch()` returns must
  still be awaited by `commitReport`.

## Confirmed working (no finding)

- **E2/E3 (local-engine serialization)** holds up, and the task asked where the check would live:
  `plan-executor.ts`'s `walk()` (`:788-794`) runs `plan.document.steps` strictly sequentially
  (`for (const step ...) { ... await this.runStep(...) }`), and `runStep` itself
  (`:850-871`) computes one `width` per step (`const cap = ...maxConcurrent...; const width = writer
  ? 1 : cap;`, `:864-865`) applied to every wave of that step before the next step starts. Since only
  one step's wave is ever live at a time, forcing `width = 1` whenever that step's frozen manifest
  binding (`plan.manifest.steps[step.id].binding`, once T4 lands — `manifest.specialists[...]` is
  the equivalent field read at `:1058` today) is the local engine is sufficient, with no cross-step
  bookkeeping, to guarantee at most one local-engine plan specialist runs at a time across the WHOLE
  run — exactly E2/E3's claim, and cloud steps are genuinely unaffected since they keep reading
  `cap` from `maxConcurrent` untouched. This also resolves round 2's finding that the cap was keyed
  to the parent's own profile: that path is now irrelevant for local concurrency, since local
  concurrency no longer goes through `maxConcurrent` at all.
- **E4's three call sites** (`plan-executor.ts:720, 1129, 1475`) are correctly identified as the
  only paths into `commitReport` (`:1336`), and two of the three (`memberEnd` at `:1129`, `settle`
  at `:1475`) have a `LiveChild` (with `.handle`) in scope to pass a handle-derived value in; the
  third (`recoverAttempt` at `:720`, crash recovery before this process's run exists) has no live
  handle at all, which is correct and consistent with design §3's "crash safety" story (nothing to
  await there — the promise died with the crashed process) — `commitReport`'s new parameter should
  simply be optional, undefined at that one call site. This part of E4 is solid; only the value's
  liveness (F2) is not.
- **E5 (PlanCard removal list)** — every line E5/round 2 names (`:151,154,343,370,442,448,499,737,
  748`) matches the current file exactly; nothing further to add.

## Verdict

Not ready to break into build tasks yet. E2/E3 (local-engine serialization) and E4's call-site
identification are both solid and match the code exactly — those can be treated as settled. But E1,
the design's answer to the single-most-repeated finding across all three rounds (one source of truth
for the plan total and the chip), still does not name a mechanism that works against the actual
class structure: `HarnessSessionOpts` is a constructor-only field with no setter, `runPlanChild`
reads an already-constructed session rather than building one, and nothing connects the object it
would need back to the function that actually constructs sessions (`buildSpecialistSession`/
`startPlanChild`/`wireChildLive`). And E4's `spendPending`, as literally written ("set by
launch()"), is a plausible-looking implementation that would silently do nothing, because a value
captured before any reply happens cannot represent a promise chain that keeps growing after launch.
Both are one-paragraph fixes to state precisely (F1: name the two attachment points; F2: say "live
accessor," not "set by launch()") — but until they're stated, a builder following the design text as
written would ship both without the safety property they exist to provide, and no test in §10 as
currently described is guaranteed to catch either (F2's naive form still type-checks and still
"awaits something"). Recommend one more narrow revision to close F1/F2 specifically — not a fourth
full adversarial round — before task breakdown.
