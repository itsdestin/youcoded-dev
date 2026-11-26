---
status: active
---
# Waiting-notice build design: adversarial review 1 (2026-11-26)

Reviewed: `docs/active/plans/2026-11-26-waiting-notice-build.md` against the code in
`youcoded/desktop/src/renderer` (branch `session/waiting-notice`). Paths below are relative to that
folder. Anything I could not confirm is left out.

## Blockers

### B1. T5 "hide Claude Code-only commands in native chats" cannot be done from the command list data
- Problem: the list has no notion of which runtime a command works in. `CommandEntry` is only
  `{name, description, source, clickable, disabledReason, aliases}` (`../shared/types.ts:1063-1070`).
  Whether a command works in a native chat is decided per call, at run time, in the dispatcher
  (`state/native-slash-actions.ts:213-233`: `alsoSendToPty` with no `nativeAction` becomes
  `none-native-no-pty`; `slash-command-dispatcher.ts:179,209,276` show the shapes). Skills/plugin
  commands (`source: 'filesystem'`) are decided by an `invoke-skill` action (`slash-command-dispatcher.ts:378`)
  and the "can't start from here" toast (`App.tsx:2576`). Also, every `cc-builtin` entry is already
  `clickable:false` with the text "Please run /x in Terminal View" (`../main/cc-builtin-commands.ts:21-33`),
  which is wrong advice in a native chat (it has no terminal view). So today a native user sees those
  greyed with misleading text, and "hide them" has nothing to key on.
- Fix: add one field to `CommandEntry` (e.g. `runsIn?: 'claude-code' | 'both'`), set it in
  `cc-builtin-commands.ts` (all `claude-code`) and `youcoded-commands.ts` (derived from the same table the
  dispatcher uses, with a test that every dispatcher case is classified, so the two cannot drift), and filter in
  `CommandDrawer` / slash completion by the chat's provider. Keep the typed-anyway path (strip) because
  filesystem commands stay unknown until run. Say so in T5; as written it reads as a filter of existing data.

### B2. The strip cannot "re-evaluate on chat-state change" without breaking performance rules 2 and 3
- Problem: `stillTrue` needs the chat's state (`sendBlock(session, sid)`, `pty-input-gate.ts:153`). The strip
  reads only its own store (`components/ChatNoticeStrip.tsx:13-17`). Reading it with `useChatState(id)`
  (`state/chat-context.ts:184`) re-renders on every streamed word (`hooks/useStreamingGate.ts:40-57` says exactly
  this about InputBar), which is rule 3. And the other half of `sendBlock`, the screen verdict, does not come
  through chat state at all: it is the module store `state/screen-input-store.ts` (filled from `session:live`),
  which has no subscribe function (`screen-input-store.ts:13-34`). A block that clears because the pop-up
  closed would never trigger a chat-state re-check; only the 1 s poll would catch it.
- Evidence the poll works on every host: `screenInputBlock` (`pty-input-gate.ts:92-100`) reads the published
  store wherever `sessionRecord` is true (desktop windows and phones/remote) and only the Android own-runtime
  reads its terminal text locally. No PTY access is needed; this part of the design IS buildable.
- Fix: (a) give `screen-input-store` a tiny `subscribe` (notify in `setScreenInputBlock`/clear) and evaluate on
  that plus `store.subscribeSession` with a derived-boolean snapshot (the `useStreamingGate` idiom), not
  `useChatState`; (b) evaluate `stillTrue` in a plain function against `store.getSession(id)`, not through
  render; (c) keep the 1 s interval only as a fallback, or drop it once (a) exists. Add the
  `busy-app-render-budget` check that a streamed reply causes zero strip renders when no notice shows.

### B3. A toast queue that blocks routine toasts silently deletes feedback, and extras beyond 3 are lost
- Problem: T3 says routine timed toasts "show only when no `untilClosed` one is up", and `untilClosed` extras
  past 3 are "logged". App has about 26 `setToast`/`announce` call sites (`rg -c`), and many are the only
  confirmation of an action ("Copied", refusals at `App.tsx:2753,2762,2791,2802,4190`). While an
  `untilClosed` notice sits open (it has no timer, by design, `App.tsx:670`) every one of those vanishes with
  no trace. A dropped fourth `untilClosed` notice (e.g. office save failed) is a failure the user never sees.
- Also: every action button does `setToast(null)` (`App.tsx:668`), and `useBlockedSend` dismisses with
  `showToast(null)` (`hooks/useBlockedSend.ts:34`): with a queue, "null" must mean "close the top one", not
  "empty the slot", or one Dismiss discards the rest.
- Fix: do not suppress routine toasts; show them over/after (they are short) or queue them behind with a short
  cap, and never drop an `untilClosed` one: collapse extras into one "N more notices" row or keep an unbounded
  list rendered as a stack. Define the setter contract (`string | state | null`) in T3 and keep string call sites
  working by normalising at the single `setToast` wrapper, not at 26 sites.

## Should-fix

### S1. Red dot via "list row subscribes per row" is the wrong shape for the session list
- Evidence: the dots are one map computed once in App and passed down (`App.tsx:988,1028`, merged by
  `mergeSummaryStatuses` in `hooks/useSessionAttention.ts`; `SessionStrip` reads `sessionStatuses?.get(s.id)` at
  `components/SessionStrip.tsx:2052,2403,2644`). The strip is rendered in three places; a per-row
  `useSyncExternalStore` in each is N subscriptions plus a second source of truth that can disagree with the
  dot colour logic (the file's own header says phone and desktop must give the same colour,
  `tests/session-summary-dots.test.ts`). Perf rules 2/3 are not violated by N small keyed subscriptions, but
  rule 4 ("work does not grow with session count") and the precedent argue for one subscription.
- Fix: one `useSyncExternalStore` in App on a store-level `unseenFailureIds` set (referentially stable, changes only when a
  failure is raised/cleared), fed into `mergeSummaryStatuses` as an input with priority above amber and equal to
  red, with the existing table test extended. Clear on `onSelectSession` where `viewedSessions` is already set (`App.tsx:2123`).
  Note a phone shows only failures raised on that phone (the store is renderer-local); say so or publish it.

### S2. New `TimelineEntry` kind touches many exhaustive consumers; and a fill silently deletes it
- Evidence: the entry union (`state/chat-types.ts:270-285`) is consumed by `timeline-presentation.ts`,
  `first-draw-plan.ts`, `archive-boundary.ts`, `message-time-marks.ts`, `timeline-boundaries.ts`,
  `pty-input-gate.ts`, `stale-sends.ts`, `queue-bubbles.ts`, ChatView, and `serializeChatState` writes
  `timeline` as-is (`chat-types.ts:1309-1315`, used by the remote server). Safe for dedup/pending: the user-entry
  logic only matches `kind==='user'` (`chat-reducer.ts:1039,1095,1520-1526`), but inserting must use
  `appendAbovePending` (`chat-reducer.ts:3502`) so the card never lands under a pending bubble. Precedent that
  on-screen-only markers are fine: the clear divider (`chat-reducer.ts:3485-3502`).
- Problem 1: `SESSION_FILL_RESET` keeps only pending user entries (`chat-reducer.ts:1037-1040`), so any
  reconnect, Refresh or first open also deletes the card, not just a "reopened chat". The design says only the
  reopen case. Say it: after a reconnect the failure card disappears with nothing replacing it (Try again lost).
- Problem 2: the retry closure lives in the card; serialised to a phone it cannot be a function.
- Fix: the entry holds data only (`kind:'control-failure', op:'compact'|'clear', detail?`) and Try again is wired by
  the renderer from `op`; add the kind to every exhaustive switch (tsc will point at them if the union is used
  with `never` checks, add one); keep `appendAbovePending`; decide explicitly that a fill clears it, or have the
  fill keep `control-failure` entries like it keeps pending ones (cheap, one more filter); exclude it from
  `serializeChatState` or handle it in `deserializeChatState`.

### S3. T1 names "Show card" action and `hasUnseenFailure` but the held-back move has callers beyond the two listed
- Evidence: `showBlockedSend` is also reached by `notifyIfPtyBlocked` (`hooks/useBlockedSend.ts:38-43`) from
  `guardedPtySend` and the Shift+Tab chip (`App.tsx:3165`), which have no retry (no Send anyway), and the
  toast is dismissed through `showToast(null)`. Moving to `showChatNotice(sid,…)` is fine, but the sid is the
  chat the action was FOR; `notifyIfPtyBlocked(sid)` can be called for a non-visible session (a background
  writer), which with a per-chat strip now shows nothing until the user switches, and the red-dot design says
  only error tone marks the list, not warn. Result: a refused background write is invisible.
- Fix: for held-back raised on a non-visible chat, also mark the dot (amber) or keep a short floating toast; test
  both. Keep the blocked-send test updated (`utils/blocked-send-toast.ts` consumers incl. BuddyChat `components/buddy/BuddyChat.tsx:150`).

### S4. Theme button popup contradicts the table row it relies on
- Evidence: `PageCreateDialog` is exported and takes `{title, initialInput, subtitle, cwd}`
  (`components/pages/PageCreateDialog.tsx:18-27`), so the dialog part is buildable. But today the theme button
  goes through `onRunCommand` -> `dispatchSlashCommand` (`App.tsx:4188-4207`), not Pages; the dialog's
  `screen` name is derived from the title (`PageCreateDialog.tsx:82`, `startsWith('Edit ')` else `pages/create`),
  so "Build a new theme" would be photographed and journey-tested under the page-create screen name. Also its
  subtitle default says "which model builds it" (page wording) and `onCreated` is page-specific.
- Fix: pass a `subtitle`, give the dialog a `screen` override or a new screen id, and verify `onCreated`
  opens a normal chat (not a page). Confirm with Destin that the dialog is the approved P-b screen (the
  design cites it only by name).

### S5. `stillTrue` for "not live"/"busy" notices can resurrect or loop
- Problem: `stillTrue` evaluating "chat still mid-reply" for busy rows clears when the turn ends, which is
  intended, but `isThinking` is set on `USER_PROMPT` and "stays true forever in the lost-message state"
  (`pty-input-gate.ts` comment on `canRetrySubmit`). A busy notice would then never leave. Use the same
  gate `useStreamingGate` uses (`isThinking && !TURN_IS_OVER`, `hooks/useStreamingGate.ts:40-45`), not raw `isThinking`.
- Fix: name the exact predicate per notice in T1 and test with the lost-message state.

## Notes

- N1. Existing: `ChatNoticeStrip` hardwires `role="status"` (`components/ChatNoticeStrip.tsx:19`); the C1 item
  (error tone -> `role="alert"`) is still to do, as T1 says. `StatusStrip` already has `actionBelow`, so R-phone
  is only the `useNarrowViewport()` pass-through.
- N2. The strip is one instance for the visible chat (`App.tsx` mounts a single `ChatInputBar` keyed by `sessionId`;
  also BuddyChat), so "only while showing in the visible chat" is satisfied; but in terminal view the bottom bar is
  `inert`/hidden yet still mounted (`App.tsx:3777-3781`), so tie the interval to `currentViewMode==='chat'`.
- N3. T5 "terminal sessions: Claude Code commands not offered": a shell session draws no composer or drawer at all
  (`App.tsx:3781-3789` `!isShellSession`), so there is nothing to hide; drop the clause. The shell-only toast at
  `App.tsx:860-865` is then reachable only from the settings command button.
- N4. T3 R-fyi/R-remote use `announce`, which already only reaches App's single slot (`App.tsx:665-671`); with the
  queue from B3 these should be timed, not queued.
- N5. T2 "owning id is the chat the action was for": `claude-control.ts` and `conversation-queue-actions.ts`
  currently take a toast callback, not a session id (`state/claude-control.ts` 6 call sites); add the id to their
  option objects and update the `toast: setToast` wiring at `App.tsx:888`.

## Verdict
Needs revision before building: three blockers (command-list metadata does not exist, strip re-evaluation as specified breaks the render rules and has no signal for screen unblocking, toast queue drops feedback); the held-back, sendBlock and error-strip parts are buildable on every host as designed.

## Triage
All 3 blockers, 5 should-fix and 5 notes accepted; applied as "Revision 1" in the build design.
