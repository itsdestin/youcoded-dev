---
status: active
---
# Waiting-notice build design: adversarial review 2 (2026-11-26)

Scope: only "Revision 1" of `docs/active/plans/2026-11-26-waiting-notice-build.md`, checked against
`youcoded/desktop/src` on `session/waiting-notice`. Paths below are under `youcoded/desktop/src/`.
Round-1 findings that the revision fixes are not repeated. Unconfirmed items were dropped.

Fixes that hold up (checked, no finding): `useStreamingGate` idiom and predicate (`renderer/hooks/useStreamingGate.ts:40-57`,
`TURN_IS_OVER`); `store.getSession` / `subscribeSession` exist (`renderer/state/chat-context.ts:54-55`);
`appendAbovePending` plus keeping the card through `SESSION_FILL_RESET` is a one-filter change at
`renderer/state/chat-reducer.ts:1035-1040`; `PageCreateDialog` `screen` override is a one-line change at
`renderer/components/pages/PageCreateDialog.tsx:82` (the request type has no such field yet, trivial to add).

## Blockers

### B1. The red dot (T2) will not show on the computer's own windows
- Problem: the revision feeds `unseenFailureIds` into `mergeSummaryStatuses`. That function returns `base`
  untouched when `summaries` is null (`renderer/hooks/useSessionAttention.ts:68`: `if (!summaries) return base;`),
  and `summaries` is null on every desktop window: `useSessionSummaries(isRemoteMode(), ...)` is disabled there
  (`renderer/App.tsx:993`, `renderer/hooks/useSessionSummaries.ts:24`, and the comment at `App.tsx:990-992`
  "Null on the computer's own windows"). The merge only does anything on a phone/remote screen. So on the
  desktop, the main place a person sits, a failure raised for another chat would mark nothing. The table test
  extension would still pass because it feeds summaries.
- Fix: apply the unseen-failure overlay as its own step after both merges, outside the summaries guard (a
  small pure function `withUnseenFailures(map, ids, activeId)` called at `App.tsx:1028` on the result of
  `mergeSummaryStatuses`, and tested with `summaries: null` as well as with summaries). Say in T2 that
  desktop and phone take the same path.

## Should-fix

### S1. "No interval" leaves a held-back notice stuck on the Android app's own runtime
- Problem: the revision drops the 1 s poll because `screen-input-store` gets a `subscribe`. But that store is the
  verdict only where `capabilities.sessionRecord` is true. On a host with no record (the Android own runtime) the
  gate reads the live terminal text directly (`renderer/state/pty-input-gate.ts:92-100`:
  `readInputFocus(getVisibleScreenText(sessionId))`), which never touches the store or chat state. A pop-up that
  closes there fires no signal the strip listens to, so the "held back" row stays up until something else changes.
  Round 1 offered the interval as a fallback for this; the revision removed it.
- Fix: keep a 1 s interval only for notices with `stillTrue` AND `!getCapabilities().sessionRecord`, running only
  while the strip shows such a notice in the chat view (perf rule 2). Or say that host re-checks on the prompt
  detector's scan (`renderer/hooks/usePromptDetector.ts:222`) and test it.

### S2. Two floating slots draw at the same spot
- Problem: `Toast` global variant is `fixed left-1/2 -translate-x-1/2` at `bottom: var(--toast-clearance)`, layer 4
  (`renderer/components/ui/Toast.tsx:84-110`). The revision keeps the routine slot "never waits" and adds a second
  "needs you" slot, but says nothing about where the second one sits when both are up. Two toasts at one
  position stack on top of each other: a 3 s "Copied" would hide the Dismiss / action buttons of a notice that
  has no timer, and the later-mounted one wins. Also `useToastClearance` publishes one offset only.
- Fix: state the layout. Simplest: render one `Toast` for the "needs you" slot and let the routine one sit above
  it (a second offset, or a wrapper that stacks both in a column), and test with both up on the phone width.

### S3. T5 "from the dispatcher's own table" does not exist; the "every case is classified" test has nothing to read
- Evidence: the dispatcher is a `switch` (`renderer/state/slash-command-dispatcher.ts:151-349`), not a table;
  `main/youcoded-commands.ts:1-4` only says "keep in sync" in a comment. Whether a youcoded command works in a
  native chat is decided per call by `routeSlashResult` (`renderer/state/native-slash-actions.ts:222-231`):
  native only when the result carries a `nativeAction`, else `none-native-no-pty`. So a per-command `runsIn`
  must be worked out by running each case, and the test needs a case list the dispatcher exports.
- Fix: export a `DISPATCHER_COMMANDS` (names it handles) from the dispatcher file and derive both the switch
  guard and `youcoded-commands.ts` classification from it, or make the test call `dispatchSlashCommand` for each
  entry with a native session and assert the route. State which, so it is buildable as written.

## Notes

- N1. `screen-input-store.subscribe` should notify only when the value actually changes (and from
  `clearScreenInputBlocks`, `renderer/state/screen-input-store.ts:14-34`); `setScreenInputBlock` is called for every
  `session:live` input-block message (`renderer/state/apply-session-live.ts:26`), so an unconditional notify makes
  every strip re-evaluate on each message.
- N2. The red dot is renderer-local, as the revision says. On the computer this also means a failure raised in one
  window does not mark the same chat in another window's list, because the cross-window feed carries each window's
  own derived colours (`App.tsx:1010-1027`). Say so; it is acceptable only if one window per chat is the norm.
- N3. `viewedSessions` is added to only when the open chat changes (`App.tsx:2124-2133`) and by the buddy
  (`App.tsx:1150`). Clearing `unseenFailureIds` "where viewedSessions is set" should therefore also clear on the
  buddy's seen callback, or a failure opened in the buddy keeps its red dot.

## Verdict
Revision 1 fixes most round-1 findings, but the red dot as written does not work on desktop (B1), and the dropped poll (S1), the two overlapping toast slots (S2) and the unreadable dispatcher table (S3) need a line each before building.

## Triage
All 1 blocker, 3 should-fix and 3 notes accepted; applied as "Revision 2" in the build design.
