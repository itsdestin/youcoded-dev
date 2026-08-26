# Plan 1c — Native Specialists (chat UI backend + definitions from files + Settings) — SDD progress ledger

Plan: /home/destin/youcoded-dev/docs/archive/plans/2026-08-16-native-specialists-plan-1c-implementation.md
SDD artifacts (briefs, reports, review packages): /tmp/claude-1000/-home-destin-youcoded-dev/8c00354b-7f86-4254-843f-9cac85ef3562/scratchpad/sdd
Global constraints file: <that dir>/global-constraints.md

## Worktrees / branches
- **Integration:** `worktrees/specialists-1c` on `feat/specialists-1c-ui`.
  Merged `origin/master` (3a06dde0) in as **ec955caa** — one conflict in `chat-reducer.ts`
  resolved by keeping BOTH (branch's specialist-report fold-in early-return, then master's
  `suppressBubble` compact-echo line). A rebase was attempted first and abandoned: 11 commits
  re-conflicting on the same file. Branch has NO remote yet.
- **Task 0:** `worktrees/perm-ask-replay` on `fix/permission-ask-replay` off `origin/master`.
- **Defs lane (Tasks 2–3):** `worktrees/specialists-1c-defs` on `feat/specialists-1c-defs`,
  branched from ec955caa. Merges back into the integration branch before Task 4.
- node_modules in every worktree is a `cp -al` HARDLINK copy, never a symlink.

## Wave plan
- W1 (parallel): Task 0 (perm-ask-replay) ‖ Task 1 (integration) ‖ Task 2 (defs lane)
- W2 (parallel): Task 3 (defs lane) ‖ Task 5 (integration)
- W3: merge defs lane → integration; Task 4 (integration)
- W4: merge Task 0's master merge into the branch; Task 6 → Task 7 (integration)
- W5: Task 8 → Task 9 (integration)
- W6: Task 10 → 11 → 12 → 13 (integration). **STOP for Destin at Task 13 Step 4.**
- W7: Task 14 (integration, dev instance) ‖ Task 15 Steps 1–2 (workspace repo).
  **STOP for Destin at Task 14's hands-on items (3, 6, 9c, 10, 11, 12).**

## Review bases (use these with `review-package BASE HEAD`, never HEAD~1)
- Task 0: `3a06dde0` (origin/master) in worktrees/perm-ask-replay
- Task 1: `ec955caa` in worktrees/specialists-1c
- Task 2: `ec955caa` in worktrees/specialists-1c-defs

## Completed
Task 0: complete (commit 2a255239, review Approved). PR #322 open, CI running — **merge it before Task 6**,
then merge origin/master into the integration branch again.
Task 1: complete (commit a02bd61c, review Approved, 0 Critical/Important). 2 Minors folded into
Task 5's dispatch (both in `delegation-ledger.ts`): `mutate()` doc comment overclaims "no-op write
reports nothing" → should read "a write that matches no record"; `DelegationRecord.model` duplicates
the `SpecialistRunView['model']` literal instead of referencing it (drift risk).
Task 2: complete (commits ef3925d0 + fix 3c84d02f, re-review Approved). Fixed in the fix pass: a
blank `tools:` line silently produced a tool-less specialist; an explicit `id:` was silently
slugified (now warns, naming both values); CC empty-body test; the "using the default (parent)"
warning now glosses what "parent" means.
Task 5: implemented 9b502808, review "Needs fixes" — 1 Important (note cap missing on the
ASSISTANT steer path). **The plan contradicts itself**: Global Constraints say a flat "note cap
2,000 characters", the Task 5 snippet shows `steerSpecialist` building the note with no cap. Ruled
in favor of the Global Constraint. Fix pass running: clamp the RECORDED note only, never the text
DELIVERED to the helper, and `steerFromUser` keeps REJECTING (a user who typed too much is told,
not silently cut).
Task 5: complete (commits 9b502808 + fix 1ab9fc8c, re-review Approved). 3 Minors → final triage:
  (a) no test pins the PARKED branch keeping `missedSteers` unclamped while `note.text` is clamped;
  (b) the clamp slice can split a UTF-16 surrogate pair (emoji) mid-character — cosmetic;
  (c) **design point:** `missedSteers` still stores unclamped text in the same read-modify-write-whole
      ledger file, so a model repeatedly steering a non-live child reopens the growth concern the
      note cap just closed. Deliberate (the fix brief said leave `missedSteers` alone) — ROADMAP it.
Task 7: complete (commit 9e11ecc5, review Approved — 0 Critical/Important/Minor).
Task 3: complete (commits a1fe16e3 + 2bdca0b0, review Approved). 3 Minors → final triage:
  catalog.ts is 387 lines vs the plan's "~200" estimate (WHY blocks + types, not duplicated logic);
  `roster()`/`snapshot()` recompute `resolveOffered` per call (pure, cheap — matters only if a hot
  per-tool-call loop ever calls it); `snapshot().folders.claudeUser` is `''` when that source is off.
**Defs lane MERGED into the integration branch as ed17fb2d** — one conflict, `limits.ts`, three tasks
each appending their own constant; kept all three. `tsc --noEmit` clean, 311/311 specialist tests pass
post-merge. Lane branch `feat/specialists-1c-defs` + `worktrees/specialists-1c-defs` still exist —
delete after the final merge.
Task 4: complete (commits 077cf65b + fix f20038b7, re-review Approved). The review caught a real one:
the turn-start `ensureFresh` sat at the top of `runTurns` under a comment claiming children "never
reach it by construction" — false. `runSpecialist`'s `runTurn` closure calls `this.send(childId,…)`,
and `send()` dispatches into `runTurns` for ANY id, so every helper turn re-read and permanently
cached a roster entry (`this.projects` has no eviction) that nothing ever reads. Fixed by gating on
`!entry.parentSessionId`; comment rewritten to be true. 2 Minors → final triage: the R12 test drives
`spawnSpecialist` directly rather than the model→Task→spawn path; the WHY block is now two stacked
comments.
**origin/master merged into the branch as `5222a66f`** (brings Task 0 in). One trivial conflict — a
type import both sides added to `native-session-host.ts`. tsc clean, 269/269 on the key suites.

## Second lane opened for Task 8
`worktrees/specialists-1c-ipc` on `feat/specialists-1c-ipc`, branched from `5222a66f`. Task 8 does not
depend on Task 6, and the two touch `native-session-host.ts` in different regions (Task 6 = the
child-ask-router wiring; Task 8 = delegated-model getters/setters), so they run concurrently and merge.
Task 6: complete (commit c3a011f3, review Approved — 0 Critical/Important/Minor). The Task 0 Minor is
  closed: `hookEventFor` now builds all three hook events (live announce, hold flip, replay); the
  reviewer confirmed the refactor is byte-identical and that `cancelOne`'s `PermissionExpired` was
  correctly left out. Emit ordering is guaranteed by real JS semantics, not test luck.
Task 8: complete (commit c009ddf0, review Approved). All three self-flagged deviations held up under
  independent check: the 5-surface parity test is real (not vacuous) and its 6th case actually pins
  the push channel's absence from Kotlin — going further than the `native:model-state` precedent it
  was cloned from; `setDelegatedModel`'s refusal genuinely never writes; the `mock-only.ts` trim was
  forced by the pinned contract test. 3 Minors → 1 folded into Task 10 (below), 2 to final triage:
  the `SpecialistsSection` CC label change was under-described in the report; the ipc-handlers arm of
  the parity check is a substring match on the constant name, so a stray comment would pass it
  (inherited from the permissions precedent, not new).
**IPC lane MERGED as `9faa2c71`** — auto-merged, zero conflicts. tsc clean, 413/413 on the key suites.
  Lane branch `feat/specialists-1c-ipc` + worktree still exist; delete after the final merge.

## Third lane opened — Tasks 9 and 10 run in parallel (disjoint: `src/main/**` vs `src/renderer/**`)
`worktrees/specialists-1c-ui2` on `feat/specialists-1c-renderer`, branched from `9faa2c71`.
Task 9: implemented b3e8ae13 (planned) + 978e9cc7 (the extra remote-buffer fix), review "Needs fixes".
  Planned work Approved: bounding real, ordering traced through the broker, zero renderer touches.
  **The EXTRA fix I authorized exposed a pre-existing defect much more widely, so I am fixing it too.**
  Traced end to end by the reviewer: `emitAnnouncement` fires `PermissionRequest` on EVERY ask, not
  just on timeout; `respond()` emits nothing on resolution and nothing evicts the buffer (10,000-event
  cap = nothing rolls off in a session). So a reconnecting phone replays already-answered asks as
  cards with live Yes/No buttons; tapping one returns false through both the broker and the legacy
  relay, the renderer reads that as failure, and the card says *"Permission request expired — socket
  closed before a response was sent"* — a specifically WRONG cause. Fails safe (no double grant, no
  crash) but it is exactly the misleading-error class this project bans.
  The "it mirrors the legacy buffers" defence is factually true and does NOT absolve it: mirroring
  licensed the plumbing, not the misleading control, and native is the default runtime now, so this
  moved a legacy-only edge case onto the main phone-reconnect path.
  **Fixed in 760efbc5, re-review Approved.** `removeEntry()` is now the ONLY place `pending` loses an
  entry (reviewer re-derived the grep independently: 1 `set`, 1 `delete`, 3 former call sites — no
  fourth route); it emits `PermissionResolved`, and `bufferHookEvent` treats that as a purge signal
  keyed by request id, dropping the Request+Held pair for that session only. `PermissionResolved`
  returns BEFORE the buffer push, so it is never itself buffered — no swapped-in smaller leak. The
  still-open held-ask replay is pinned by a SEPARATE test from the purge test, so neither subsumes
  the other. `cancelOne` emits Resolved before Expired, with an ordering test. No renderer change was
  needed: `hook-dispatcher`'s `default: return null` makes the new type a true no-op. The one
  rewritten pre-existing test filters by type before indexing, reproducing the original index
  semantics exactly — reviewer hand-traced the emitted array AND checked all 23 other `emitted[N]`
  uses in the file were unaffected.
  2 Minors → final triage: a SECOND load-sensitive test smell (`steerSpecialist appends the note…`,
  fixed 20ms delay) — ROADMAP it alongside the first; `specialistRunsFor` slices the FIRST 30 rather
  than the most recent 30 (provably unreachable — the spawn budget gates `recordStart` first).
Task 9: complete (commits b3e8ae13 + 978e9cc7 + fix 760efbc5).
Task 10: implemented f9379ab9 (review Approved, safety half (b) verified default-closed across ALL
  states) + perf fix 2aaa49c6 + folder fix (running). Three passes, each found a real reachable
  defect — worth recording so nobody "simplifies" these back:
  - pass 1 review: every tool card of ANY kind (Read/Bash/…) triggered a 3-folder disk read and a
    re-render subscription, in every session, hire or not — only `agentId` was gated, not `cwd`.
  - pass 2 review: consolidating Settings' two mount effects removed the double read but silently
    dropped folder self-healing. The roster cache is a module-level Map that is NEVER cleared, so
    after ANY earlier caller warms a key without the ensuring flag, Settings skips ensuring forever —
    and **Open folder stays enabled because its enabled-ness is a computed PATH, not an existence
    check**, so it silently does nothing. Reachable on the plain 2nd open of Settings.
    The implementer's "the alternative would be dead code" defence was true only of the OLD two-effect
    layout, not of the single-effect structure it actually shipped, where `ensureRef.current ||
    !cache.has(key)` preserves both properties. Reviewer proved it.
  Also folding in: `shell.openPath` returns an error string on failure and the click handler `void`s
  it, so any other failure is invisible too.
  - pass 3 review: confirmed resolved, both earlier properties still hold. 1 Minor left: a stale
    `folderError` can survive a later roster failure, leaving a Retry that no-ops (narrow).
  **Renderer lane MERGED as `04f31b1f`.** tsc clean.
  Carries Task 8's Minor — the
  `specialists.list` bridge comment must warn that omitting `cwd` when one IS known silently drops
  project-level helpers (a user's own files just not appearing, with no error).

**Task 0 MERGED to youcoded master as `bf55513e`** (PR #322). Worktree removed, branch deleted local
+ remote. Final CI: ubuntu ✅ macOS ✅ (both were failing before the race fix), Windows ❌ with 3
failures that are ALL pre-existing platform-assumption bugs, unrelated to this work and already red
on master:
  - `task-tool.test.ts` — `expected 'D:/proj' to be '/proj'` / `'read-only:D:/proj'` (POSIX-absolute
    path assumed in the test)
  - a case-sensitivity one — `expected 'roadmap.md' to be 'ROADMAP.md'`
  → **Task 15 must ROADMAP both** as `bug` `#ci`. Desktop CI is red on master for these today.

**ROADMAP note for Task 15:** line 98's `#permissions` item is ALREADY `[x]` — the acute bug was
closed by the 3s heartbeat (`3a06dde0`), and its text says the fix was made "rather than patch the
replay path". That is now stale: the replay path landed too (`bf55513e`), and it is NOT redundant —
`reannounce()` deliberately skips a timed-out entry, so a HELD ask has no heartbeat and only the
replay re-emit brings it back. Task 6 builds `PermissionHeld` on top of it. Amend that line's text.
CI race fix: 514fcef2 on the Task 0 branch, pushed. 6 racy sites found, 6 changed, still
  `toBe(true)` inside a `vi.waitFor` — not a loosened assertion. Verified passing under heavier
  artificial load (32-core box at load ~71-97) than the load that reproduced the failure.
  macOS CI went from FAIL to PASS on this commit; ubuntu/windows still running.

## PLAN ERROR found and verified (affects Tasks 6 and 9)
The plan's Task 6 says "the phone's connect-time `hookBuffers` already replays every recent hook
event, so it gets `PermissionHeld` for free." **This is false.** Verified:
`remote-server.ts:85,452-457` — `hookBuffers` is written ONLY by `onHookEvent`, bound ONLY to
`this.hookRelay.on('hook-event')` (`remote-server.ts:251`) — the legacy CC relay. Native hook events
go `nativeHost.on('hook-event')` → `remoteServer.broadcast()` (`ipc-handlers.ts:2451-2457`), a pure
fan-out to open sockets with zero buffering.
Consequence: a phone reconnecting while an ask is in the HELD state gets nothing — `reannounce()`
deliberately stops heartbeating a timed-out entry, and `PermissionHeld` is one-shot. (A non-held open
ask self-heals within 3s via the heartbeat, so the hole is narrow but real.)
**Decision:** Task 9 already adds a `specialistRunBuffers` map + `replayBuffers` hook to
`remote-server.ts`; buffer native hook events in the same place (~15 lines, symmetric). Task 6 must
NOT write the false claim into a comment. Flagged to Destin, non-blocking.

## CI FAILURE ON PR #322 — ROOT-CAUSED (test-only race, pre-existing)
`beginTurn()` (`harness-session.ts`) emits its transcript event SYNCHRONOUSLY — the host forwards it
with an explicit "not gated on the disk write" comment. `rec.delivered` flips only later, after a
real mkdir-lock write (`confirmDelivered` → `mutateJson` → `mutateFileUnderLock`, 10ms poll, 3s
ceiling). Six assertions in `native-session-host.test.ts` `vi.waitFor` the EVENT and then read
`rec.delivered` one-shot. ~29ms of headroom unloaded; under load the race is lost.
**Reproduced twice on ordinary Linux hardware** under artificial CPU+I/O load, harness unmodified.
Commit 2a255239 did NOT cause it — its diff has zero overlap with the delivery path, and the same
two assertions were already red on master's Windows runner. Ubuntu/macOS newly tripping = runner
noise tipping an already-marginal race. 4 more latent sites of the same shape found.
Fix: test-only, wrap each `delivered` read in its own `vi.waitFor`. NOT a loosened assertion — still
requires `=== true`. Landing as a separate commit on the Task 0 branch so the PR can go green.
Full writeup: `<sdd dir>/ci-failure-investigation.md`.

## (superseded first read — kept so nobody re-derives it) CI failure looked flaky; it is not
First read looked like a flake. It is not: `gh run rerun --failed` reproduced it on ubuntu, macOS
AND Windows. Meanwhile it passes locally — full suite `455 passed | 1 skipped`, 5894 tests, 22s
(CI takes ~145s, ~7x slower). A dedicated debugger is running; findings land in
`<sdd dir>/ci-failure-investigation.md`. **Do not merge #322 until that returns.**
Details of the failure below.

## The failing test (not caused by this work — do NOT "fix" it inside a task)
`tests/native-session-host.test.ts` → describe `restart recovery + subagent-card replay (Task 9,
plan 1b)` → the two `expect(rec.delivered).toBe(true)` assertions ("an undelivered FAILURE notice
from before the restart is also delivered at the first idle boundary", and the sibling case).
- Fails on **master's own** Windows run (lines :3028 / :3440, i.e. pre-Task-0 numbering).
- Failed on PR #322's ubuntu+macos run (lines :3043 / :3497 — same two tests, shifted by Task 0's
  additions). Master's ubuntu+macos run passed, so it looks like a regression and is not.
- Green locally at PR HEAD, both `-t "restart recovery"` and the whole 133-test file.
Conclusion: load/timing-sensitive ("delivered at the first idle boundary"), flaky under CI.
Master's Desktop CI is ALSO red for a separate Windows-only reason: `task-tool.test.ts:211,222`
assert `read-only:/proj` but Windows resolves `D:/proj` — POSIX-absolute path assumptions.
Both belong in ROADMAP as bugs (Task 15), not in a 1c task.

## Final wave: Tasks 11, 12, 13 dispatched IN PARALLEL (base 04f31b1f), disjoint files
Reused the two idle lane worktrees rather than making new ones:
- Task 11 → `worktrees/specialists-1c` (`chat-reducer.ts` + a NEW test file). **Re-scoped:** Task 10
  already deleted the note action and already rebuilds note rows via `reconcileNoteSegments`. What
  genuinely remains: the identical-view short-circuit (absent), the whole test file (absent — the
  branch has ZERO renderer specialist reducer tests), and a judgment call the implementer must
  justify either way: the plan mandates a wholesale REBUILD of note segments (`noteSegmentsFrom`),
  Task 10 shipped an append-by-id MERGE. Both idempotent for append-only notes.
- Task 12 → `worktrees/specialists-1c-ui2` on `feat/specialists-1c-t12` (`SpecialistAskBlock.tsx`,
  `SpecialistActions.tsx`, `useSpecialists.ts`).
- Task 13 → `worktrees/specialists-1c-ipc` on `feat/specialists-1c-t13` (`SpecialistsSection.tsx`).
  **Told to stop before the workbench** — Step 4's visual check is Destin's, and the hand-off is mine
  to make. It may run the HEADLESS boot check; it may not run `run-workbench.sh` or a dev instance.

## AWAITING DESTIN — plan-mandated copy, his call (do not decide it in a subagent)
Task 12's held-ask sentence for a FINISHED helper is specified verbatim by the plan (spec R3):
  `"{first} has finished; a Yes now tells the assistant, which can send them back."`
Reviewer's finding (Important, labeled plan-mandated): "them" has no clean antecedent — the only
other actor in the sentence is "the assistant" (singular, "which"), so a literal reader can parse it
as the assistant sending *itself* back, or as sending the *answer* to a helper that no longer exists.
And "send… back" doesn't say back where or to what effect. Understanding it requires already knowing
the helper-vs-assistant architecture that this card exists to explain.
Reviewer's proposal: `"…which can send {first} out again with your answer."` — same neutral-pronoun
discipline, no ambiguity.
The plan's authorship does not grade its own copy. Batched to Destin with the Task 13 stop.

## Correction to a claim I repeated to several subagents
I told agents "a `SpecialistsChip.tsx` styling test fails pre-existing". Task 12's reviewer grepped
and found **no test file anywhere references `SpecialistsChip`**. The real failures are the generic
style-authority scanners (`callout-authority`, `section-label-authority`) which walk component files.
Characterize it that way from now on, and have the final review confirm whether they are still red.

Task 11: complete (commit ba3da133, review Approved). Found and fixed a REAL bug Task 10 introduced:
  note-row ids keyed on the note's timestamp, so two notes written in the same millisecond collided
  and the second was **silently dropped**. Now index-based, per the plan. The short-circuit uses the
  file's existing key-order-independent `stableStringify`, and the tests assert state-object IDENTITY
  (`.toBe`) over a 4x repeat, so a short-circuit that only worked once would fail.
  Item-2 judgment (merge vs the plan's wholesale rebuild): reviewer independently verified the ledger
  is append-only (`appendNote`/`appendMissedSteers` both spread-and-append, no cap touches `notes`)
  and concluded the plan's rebuild **would have failed the plan's own mandated test** — rebuilding
  from a stale shorter `notes[]` deletes a row already on screen. Merge stands.
  2 Minors → **both for Task 15 / ROADMAP, do not lose them**:
  (a) merge appends new note rows at the array TAIL rather than splicing them by timestamp among
      interleaved tool/text segments (`SubagentTimeline` does no re-sort) — the plan's interface
      asked for positional ordering; needs a one-line WHY addendum naming the trade-off.
  (b) **Real residual risk:** `SPECIALIST_RUN_CHANGED` overwrites the WHOLE `specialistRun` with no
      ordering/version guard — only `notes` is merge-protected. A stale resend landing after a newer
      live update can flip a *completed* card back to "running". Pre-existing (Task 10), out of scope
      here (needs a new monotonic field on `SpecialistRunView`), nothing in the suite catches it.

Task 12: implemented afdeba5a, review "Needs fixes" (2 Important), Enter-key fix landed as 8dae2090.
  - FIXED: the 2,000-char cap guarded only the Send BUTTON's disabled state. `send()` checked only
    for non-empty, and the textarea's Enter handler called it unconditionally — so paste 2,500 chars,
    see "2,500 / 2,000" and a greyed-out button, press Enter, and it sent anyway. The most likely
    input path defeated the whole point of the counter. The plan's own snippet specified only the
    button's `disabled`, so the plan under-specified it.
  - **PENDING DESTIN:** the finished-helper copy (see the AWAITING DESTIN block above).
Task 13: implemented c19f9191, review "Needs fixes" (2 Important). **Session was interrupted; the
  first fix agent's work did NOT land** — worktree was still clean at c19f9191. Re-dispatched.
  - a hand-rolled `<div className="text-danger">` for the tier WRITE error instead of the shared
    component — no `role="alert"`. Plan-mandated violation, and this exact block was rewritten by
    the task (the single error variable was split in two), so it was in scope.
  - the desktop-only takeover has TWO independent signals; only the roster one is tested. The
    tier-call-alone path has a WHY comment calling it out and zero test evidence.
  Reviewer confirmed the pins-vs-drivers split was honest, and judged the tier write-failure COPY
  acceptable (the lead-in disambiguates which of the two pickers failed; the backend text is verbatim).

Task 12: complete (afdeba5a + fix 8dae2090, re-review Approved). Merged as a1746605.
Task 13: complete (c19f9191 + fix 24a17c12, re-review found a NEW regression). Merged as c8279c37.

## THE `text-danger` DISCOVERY — biggest find of the plan (Destin authorised the fix)
Task 13's re-review noticed the tier error's old styling used `text-danger`, and that no `--danger`
token exists. Chased it: **`text-danger` / `border-danger` / `bg-danger` emit ZERO CSS.** Proven by a
real `vite build --mode production` + inspecting the compiled stylesheet — the string "danger"
appears 0 times in the built CSS. `text-destructive-fg` compiles fine, and `globals.css:217` already
says to use it.
Consequence: in FIVE branch components (`SpecialistsChip`, `SpecialistsSection`, `SpecialistReportCard`,
`SpecialistActions`, `RunStatusLine`) every failure/error state rendered in ORDINARY BODY COLOUR.
A helper's "Failed" chip was not red. It shipped through a workbench design approval because you have
to trigger a failure state to see it.
Fixed in `1b4bedfc` (+ `b8b8cec0` dropping FieldError from `primitive-adoption.test.ts`'s
INTENTIONALLY_UNADOPTED, which correctly fired once FieldError gained its first real consumer).
**Then it cascaded, instructively:** `callout-authority.test.tsx` went 1 → 2 tinted blocks in
`SpecialistsChip` — the chip had been slipping past that guard *because its tint wasn't rendering*.
Verified pre-existing at 1 by checking out the pre-fix file and re-running. Resolved in `d269c576`
via the test's own documented exemption (the blocks are `rounded-full` inline state badges inside
`StatusPill`, peers of the untinted Stopped/Finished pills — not a `rounded-lg`/`p-3` Callout
surface). The guard was NOT weakened.
**This also closes the "pre-existing SpecialistsChip styling failure" I had been telling agents to
ignore all session.** `bash scripts/verify.sh worktrees/specialists-1c --full` is now GREEN on all
five checks (types, tests, knip, lint, ast-grep).

## >>> STOPPED FOR DESTIN — Task 13 Step 4 <<<
Branch head `d269c576`. Tasks 0–13 complete. Remaining: 14 (hands-on) and 15 (docs).
Three things awaiting his answer: the finished-helper copy (see AWAITING DESTIN above); the workbench
eyeball of Settings → Specialists in `default` and `no-providers`; and whether the failure states
should use `destructive` (what shipped, per the stylesheet's own prescription) or a hardcoded status
red matching StatusPill's amber/blue siblings — a real coexisting convention in this codebase.

## Minor findings carried to the final review
- Task 0 (`permission-broker.ts`, `pendingEventsFor` vs `emitAnnouncement`): the 4-field HookEvent
  literal is built twice. Task 6 adds a third variant (`PermissionHeld`) — **Task 6's dispatch tells
  it to extract a private `buildEvent(entry, type)` helper instead of adding a third copy.**

---

# ══ SESSION HANDOFF — 2026-08-26, after Destin's decisions ══

## STATE: all 16 tasks implemented + reviewed. Branch `feat/specialists-1c-ui` @ `d092decd`.
NOT merged. NOT rebased. Self-consistent and green as of its own last full check.
Final whole-branch review verdict: **Ready to merge, zero Critical.** Its three Important
items are all FIXED and committed (`d092decd`).
Workspace-repo docs ALREADY COMMITTED to master: `f2eadbe` (hands-on checklist),
`de0d700` (rule + MAP), `b73801e` (ROADMAP). Verified ancestors of workspace master.

## DESTIN'S DECISIONS (2026-08-26) — these change built behaviour, not yet implemented
**D1. ACCEPTED:** a file-defined (external) helper must show a consent card even in
`auto-edit` mode. Today `permission-types.ts` grants `{tool:'Task', action:'allow'}`
pattern-less in auto-edit, so NO card renders and both safety halves are bypassed.
Built-in helpers keep today's behaviour exactly.

**D2. NEW REQUIREMENT — conflicts with what is currently built:** every individual helper
should get an Always-allow option, and that grant should apply **across projects**.
This inverts half (b) of the Global Constraint (the renderer currently SUPPRESSES
Always-allow for any non-builtin hire, deliberately, default-closed) and changes half (a)
(the subject is `${charter}:${workDir}:file:${id}` — work-dir scoped by design).

### The two hazards D2 opens (raised with Destin, awaiting his answer)
1. **The file can change under the grant.** The grant is keyed by helper *id*. A repo's
   `.claude/agents/code-reviewer.md` that you Always-allowed as read-only can later be
   edited to add `Bash` — the id is unchanged, so the standing grant still matches and it
   now runs shell with no prompt. This is the exact reason half (b) exists; the Global
   Constraint spells it out.
2. **Cross-project makes id collision exploitable.** Always-allow `code-reviewer` in repo
   X, then open repo Y which ships a completely different `code-reviewer.md` — same id,
   different file, auto-approved.

### Proposed shape that gives Destin what he wants without either hazard
- Cross-project Always-allow ONLY for helpers from folders **the user controls**:
  `~/.youcoded/specialists/` (source `personal`) and `~/.claude/agents/` (user-level).
  Those are the ones a person actually reuses across projects.
- A helper from a **project's own** `.claude/agents/` gets at most a project-scoped grant
  (or none) — "across projects" is meaningless for it anyway, and it is the untrusted case.
- Optionally also key the grant to a content fingerprint of the definition file so an edit
  that widens its tools invalidates the grant and re-asks. Closes hazard 1 for the user's
  own files too.
**Destin has not yet chosen among these. Do not implement D2 until he does.**

## NEXT STEPS, in order
1. **Rebase/merge onto master — CAREFULLY.** Branch is **89 commits behind**.
   Measured overlap: **30 files changed by BOTH sides**, including the highest-traffic ones
   — `chat-reducer.ts`, `native-session-host.ts`, `ipc-handlers.ts`, `preload.ts`,
   `remote-server.ts`, `App.tsx`, `harness-session.ts`, `useIpc.ts`, `remote-shim.ts`,
   `shared/types.ts`, `SessionService.kt`. Full list: `comm -12` of each side's
   `git diff --name-only $(git merge-base origin/master d092decd) <side>`.
   The danger is the SILENT kind: both sides edit different lines, git merges clean, the
   combination is broken. Re-run `bash scripts/verify.sh worktrees/specialists-1c --full`
   after, and do not trust a clean merge as evidence.
   NOTE: an earlier rebase attempt on this branch was abandoned (11 commits re-conflicting
   on one file) in favour of a merge. Same call may apply again.
2. Implement D1 (+ D2 once its shape is settled).
3. Re-review the D1/D2 diff — it is a permission path, so treat a defect there as Critical.
4. Task 14 Step 3: run the agent-runnable checklist items in a dev instance.
5. Merge, then Task 15 Step 3: flip ROADMAP items 34/36/38 to `[x]` with the real merge sha
   (Task 15 deliberately left them unflipped — no sha existed), archive spec+plan+handoff
   to `docs/archive/`, delete worktrees + branches.

## CLEANUP OWED
- Worktrees still live: `specialists-1c-defs`, `specialists-1c-ipc` (branch
  `feat/specialists-1c-t13`), `specialists-1c-ui2` (branch `feat/specialists-1c-t12`).
  All merged into the integration branch; safe to remove after the final merge.
- A workbench Vite server on port 5233 was started for Destin's visual pass — stop it if
  still running.
- `/home/destin/youcoded-dev/specialists-copy.md` is Destin's copy deck, still untracked.
  His edits are already applied to the code. Delete or keep as he prefers.

## MERGE ONTO MASTER — DONE 2026-08-26 (`a3a7f9aa`)
Merge, not rebase (the earlier rebase attempt on this branch was abandoned; same call).
Branch is now **0 commits behind `origin/master`**.

**4 conflicts, all peripheral — no core app file conflicted.** The 26 other overlapping
files (chat-reducer, native-session-host, ipc-handlers, preload, remote-server, App.tsx,
harness-session, useIpc, remote-shim, shared/types, SessionService.kt) auto-merged.
1. `workbench/fixtures/sessions.ts` — both sides added sessions starting at `wb-3`. Kept
   master's brand-showcase block at wb-3..wb-10; **the specialists demo session moved to
   `wb-11`**. Follow-on edits: `seed-chat.ts` SESSION_FOR, and the hydrate-keys assertion
   in `workbench-fixture-actions.test.ts` (sort is LEXICOGRAPHIC: `wb-1, wb-11, wb-2`).
2. `workbench/mock-shim.ts` — take-both for two import blocks; the return object needed a
   real merge (`specialists, shell` + `skills, marketplace`), not a take-both.
3. `tests/workbench-fixture-actions.test.ts` — KNOWN_KINDS take-both; the per-line count
   needed both semantics combined: branch's held:true double-dispatch reduce AND master's
   `{ includeStalled: true }` load option.
4. `docs/native-runtime.md` — both sides appended a trailing section; kept both.

**Verification run against the MERGED tree (not trusted on the clean merge alone):**
- `scripts/verify.sh --full` → PASS types, PASS full test suite, PASS knip, PASS eslint,
  PASS ast-grep.
- `scripts/workbench-boot-check.mjs` (mandatory, mock-shim changed) → all 12 routes mount.
  NOTE: it needs a live workbench and 5233 was held by the `project-description` worktree's
  server (another session's — left alone); ran on `YOUCODED_PORT_OFFSET=70` → port 5243,
  server stopped afterwards.
- Android: **NOT run — no Android SDK on this machine** (no `local.properties`, no
  `~/Android/Sdk`); Android is a CI-only build here. `SessionService.kt` merged purely
  additively — verified by diff: the five `specialists:*` not-implemented entries sit
  intact alongside master's new channels.
- Both halves of the Global Constraint re-verified present post-merge: `task.ts:257`
  (subject scoping) and `ToolCard.tsx:1209` (Always-allow suppression).

**Still blocked on Destin: the D2 shape.** See DESTIN'S DECISIONS above.

## D1 + D2 IMPLEMENTED 2026-08-26 (`45f292d7`) — Destin approved the recommended shape
His words: "that's fine" to — cross-project Always-allow ONLY for helpers in folders he
owns; a project's own helper capped to that project; PLUS the optional fingerprint so an
edit re-asks. All three built.

**Design that fell out of the existing architecture (no new mechanism):**
`rememberedRuleFor` (harness-session.ts) persists a non-Bash grant as
`{tool, pattern: subject, action:'allow', match:'exact'}` — BYTE-EXACT on the subject.
So the subject shape in `tools/task.ts` IS the entire definition of grant width:
  builtin -> `${charter}:${workDir}`                      (unchanged; no existing grant lost)
  user    -> `${charter}:file:${id}@${fp}`                 no work dir => every project
  project -> `${charter}:${workDir}:file:${id}@${fp}`      work-dir pinned
`fp` = sha256 of the file's exact bytes, first 12 hex (`definitionFingerprint`).

**New field `SpecialistDefinition.grantScope: 'builtin'|'user'|'project'`** — stamped by
the CATALOG, the only thing that knows which of the three folders a file came from.
`source` cannot answer it ('claude-code' spans ~/.claude/agents AND <cwd>/.claude/agents).
`loadClaudeCodeDefinition` now takes grantScope as a REQUIRED param (no default, on
purpose). Flows to the renderer via `SpecialistDefinitionView.grantScope` (toListResult).

**D1:** `rulesForMode('auto-edit')` gains `{tool:'Task', pattern:'*:file:*', action:'ask'}`
AFTER the broad Task allow — last-match-wins beats it for file-defined hires only.

**Half (b) re-aimed, NOT removed:** ToolCard still suppresses Always-allow while the
definition is unknown (default-closed). New `alwaysAllowNote` prop states the width in
words + "you'll be asked again" if the file is edited.

**Verification:** tsc clean; `verify.sh --full` green except ONE pre-existing failure,
`harness-eval-orchestrator.test.ts` "writes the transcript BEFORE grading…" — PROVEN
pre-existing: reproduced 3/3 in isolation on this branch, on the merge commit `a3a7f9aa`,
AND on plain `origin/master` in a detached worktree (since removed). Not caused by this
branch; worth a separate look. NOTE it passed in the first post-merge full run and fails
now, so it is state-sensitive — cause NOT diagnosed, do not guess one.

**An independent adversarial review of `45f292d7` was dispatched** (permission path =>
any defect is Critical). Result not yet folded in at the time of writing.

### Open question the review may settle (raised, not resolved)
The catalog's staleness check is a FOLDER fingerprint of `name:mtimeMs:size`. If a file's
contents change while size AND mtime stay identical, the catalog does not re-read, so the
new content hash is never computed and "editing the file re-asks" would NOT hold for that
case. Verify before claiming the promise is unconditional.

## REVIEW OF 45f292d7 — verdict FIX REQUIRED; fixes landed `a9be1808` (2026-08-26)
- CRITICAL: `task_id` resume has no work_dir → no subject → auto-edit's pattern-less Task
  allow wins → an EDITED definition ran with no card. FIX: ledger records
  `definitionFingerprint` at spawn; `resumeSpecialist` → `{status:'definition-changed'}`;
  Task tool reports it (isError) and tells the model to hire afresh.
- MAJOR check-then-use: two independent `roster.resolve` calls around a possible
  `catalog.reload()`. FIX: per-instance memo in `createTaskTool`.
- MAJOR Settings rendered raw `file:id@hash`. FIX: `describeRule` `filed` branch.
- MAJOR `work_dir` resolved against `process.cwd()`; note used `basename(sessionCwd)`.
  FIX: `createTaskTool(roster, sessionCwd)` from `harness-session.ts`; `grantFolderName`.
- MINOR (open): a builtin whose work dir path contains `:file:` triggers ask (case-insens.).
- MINOR (no change): same-size same-mtime edit not re-read — grant + behaviour equally stale.
- NITs (open): `grantScope` name vs width `GrantScope` type; builtins get no scope note.
16 pinning tests added (16 new; suite 393/393; tsc 0). Report: review-fix-report.md.
Docs: workspace rule bullet rewritten (`6bbb84b`, `28eaf83`, pushed); checklist 9b
rewritten + 9e/9f added + shared-~/.youcoded warning (swept into `f4d7a6f` by another
session's commit); `docs/native-runtime.md` hire-grant paragraph (this worktree).
NEXT: re-review a3a7f9aa..HEAD (permission path), then verify.sh --full, then Task 14 §3.

## REVIEW 2 (a3a7f9aa..10127ff6) — verdict NEEDS FIXES, zero Critical (2026-08-26)
- IMPORTANT 1: "every project" grant NOT delivered — `PermissionStore` is per-cwd-slug only
  (`rulesFor(cwd)`, `remember(cwd)`); host unions `rulesFor(cwd)` per decision. Card/Settings/
  doc promised it falsely. FIX DESIGN (fix2-brief.md): `CROSS_PROJECT_SLUG='all projects'`
  (space ⇒ structurally un-collidable with `nativeStoreSlug` output) + `isCrossProjectRule`
  (`Task` + `^(read-only|read-write):file:`) in shared/permission-types; store routes
  remember/rulesFor through the bucket; host revoke* special-cases the bucket across ALL
  live sessions; Settings renders it first as "All projects".
- IMPORTANT 2: folder→grantScope unpinned; 23 loader-test calls pass 2 args (tsc excludes
  tests/). Fix: update calls, add catalog/loader tests incl. fingerprint.
- MINORS 3–6: describe-rule regex `@[^@]+$`; `grantFolderName` './' '..'; suppress
  Always-allow for a work_dir-less hire; comment distinguishing grantScope vs GrantScope.
- Named-risk checks came back clean: no resume/respawn path bypasses `resumeSpecialist`;
  only `rulesForMode` produces a Task allow. Report: d1d2-review-2.md.
Fixer dispatched on fix2-brief.md. Workspace side done meanwhile: rule bullet (`28eaf83`),
ROADMAP bug for `mcp-startup-wiring` 5s timeout (pre-existing on master — measured 1/5 on
plain master, 0/5 on branch), checklist 9f Settings wording ("All projects" card).
NEXT after fixer: re-review fix2 diff → verify.sh --full → native-permissions rule bullet →
Task 14 §3 (dev instance, non-model checks only) → merge+push → Task 15 §3.

## FIX 2 LANDED `a9e041d7` (2026-08-26) — cross-project bucket + pinning + minors 3–6
16 files, +21 tests (402 across the 9 affected files), tsc clean, verify.sh full suite green
except the known pre-existing `harness-eval-orchestrator` failure (fixer re-proved it on a
stashed clean tree). Note: the width type `GrantScope` lives in `shared/bash-grant-shapes.ts`
(`'exact'|'wide'`), not permission-types — the brief mis-located it; comment names the real
file. Report: fix2-report.md. Review 3 dispatched on 10127ff6..a9e041d7 (d1d2-review-3.md).
Workspace: `51ef2ca` (native-permissions rule bucket invariant, checklist 9f, ROADMAP bug).

## REVIEW 3 (10127ff6..a9e041d7) — APPROVED, zero Critical/Important (2026-08-26)
Three named risks checked by construction (only the fingerprinted exact Task subject can
reach `remember`; `inScope` runs after the union; no other reader interprets the key).
Minors: (1) pre-fix rows not migrated — dev profiles only, under-grants; NOT fixed, noted in
commit; (2) workbench fixture for the bucket — DONE; (3) vacuous fingerprint test — DONE.
Commit for 2+3: see `git log -1`. verify.sh: types/knip/eslint/ast-grep PASS; full suite
6306 pass, only `harness-eval-orchestrator` (2 cases, pre-existing, ROADMAP :108) red.
Workbench boot check on port 5243: 12/12. 
NEXT: Task 14 §3 dev instance (non-model checks) → merge+push → Task 15 §3.

## TASK 14 §3 DONE (partial, by design) + SECOND MERGE FROM MASTER `043c0e50` (2026-08-26)
Dev instance (Electron+Vite, profile specialists-1c, offset 2, CDP 9224): boot OK; real
`specialists.list` → 4 built-ins `grantScope:'builtin'`; real `permissions.list` → 3 real
projects; Settings → Specialists and → Permissions render from real data (screenshots in
scratchpad). Opening Specialists created `~/.youcoded/specialists/example.md` (shared home!)
— deleted afterwards, twice (re-created on dialog reopen). Real-model + project-folder checks
left for Destin per CLAUDE.md (paid, interactive). Recorded in checklist (`0887547`).
Master moved 49 commits since a3a7f9aa; 15 overlapping files; 3 conflicts (all take-both):
AssistantTurnBubble imports, ToolCard P-18 divider + specialist "wants to:" label,
mock-shim return keys (+`folders`). tsc clean; workbench boot check 12/12; verify --full running.
NEXT: verify → merge to master via detached worktree at origin/master (`--no-ff`), push →
Task 15 §3 close-out.
