---
status: active
---
# Waiting-notice: build design

Approved UI: the growing deck `docs/active/design/2026-11-22-waiting-notice/waiting-notice.json`
(before-build walkthrough pages P-b1..P-b5, all ticked 2026-11-26) with its answers files. Every
row of `W-asked` must be traceable to code. Per-notice placement and wording: lists `L-sort-failed`,
`L-sort-cant`, `R-unsure` (rows' `call` = new wording, `why` = placement), overridden by `R-fyi`,
`R-remote`, `R-screen` (yes). Independent review: `docs/active/reviews/2026-11-25-waiting-notice-final-review.md`.
App branch `session/waiting-notice` in `worktrees/sessions/waiting-notice/youcoded`.

Already built: `state/chat-notice-store.ts`, `components/ChatNoticeStrip.tsx`, StatusStrip error tone,
Toast timer fix + `dismissible`, `announce(..., {untilClosed})`, Enter/chat-switch/close clearing,
`announceFailed` 5 s.

## T1. Strip core
- **Derived conditions, not stored hopes (review B3).** A `ChatNotice` gains optional
  `stillTrue?: () => boolean`. The strip re-evaluates it on chat-state change and on a 1 s interval
  *only while a notice with `stillTrue` is showing in the visible chat* (perf rule 2); false → clear.
  Used by: held back (`sendBlock(session)` still blocks), busy (`compact-busy`, `clear-busy`,
  `skill-busy`: chat still mid-reply), not-live (`*-not-live`: chat still not running),
  `finish-current-transfer`, `takeover-failed`/`handoff-unconfirmed` only if they stay in the strip
  (they move to their own screen per R-screen, see T3).
- **Held back moves to the strip**: `useBlockedSend` / `blocked-send-toast.ts` raise
  `showChatNotice(sid, {key:'held', tone:'warn', leave:'resolved', stillTrue, actions:[Show card, Send anyway(primary)]})`.
  Switch App and BuddyChat callers together (review C3).
- **Buttons**: Stop (busy rows), Browse skills (`skill-not-a-skill`), Try again (rows that say so).
- **Phone (R-phone)**: `actionBelow` on `StatusStrip` when `useNarrowViewport()`.
- **A11y (C1)**: error tone → `role="alert"`.

## T2. Routing and words
- `utils/notice-words.ts`: the shared sentences (`didntGoThrough(what)`, `cantTell(what, advice)`,
  `notHere(what, instead)`), one place. Detail sentence only when it changes what you do (R-words).
- Every can't-do / before-send / unsure notice in the lists calls `showChatNotice(<owning session id>, …)`
  instead of `setToast`/`announce`. The owning id is the chat the action was for, never "the chat on
  screen at reply time".
- **Raw text never shown (A5)**: `claude-control.ts`, `conversation-queue-actions.ts` map rejected
  results to the shared sentences; raw message → `console.warn`.
- **Red dot (R-elsewhere)**: an error-tone notice raised for a chat that is not the visible one marks
  it in the session list (existing attention-dot styling); opening the chat clears the mark.
  Store exposes `hasUnseenFailure(id)` + subscribe; the list row subscribes per row.

## T3. Floating notices
- **Take turns (R-queue, A3)**: App's toast slot keeps a queue of `untilClosed` notices (max 3,
  extras logged). Routine timed toasts show only when no `untilClosed` one is up; they never replace it.
  Toast restart on identical message (B8): counter in state, used as `key`.
- **K-7 call sites → `untilClosed`**: plugin turned off, settings repaired, saved password expired /
  tailscale-only (`remote-gate.tsx`), office save failed (`OfficeAlerts.tsx` → through `announce`),
  resume-failed, model-switch-failed (Try again) and -again (Report bug).
- **R-remote**: `RemoteUnsupportedNotice` → short floating via `announce`, line
  "<Thing> only works on the computer running YouCoded for now."
- **R-fyi**: `attachments-ignored`, `no-response-to-copy` → short floating.
- **R-screen**: `live-handoff-unavailable`, `finish-current-transfer`, `resume-failed` (when raised from
  the resume list) show inside that screen; `takeover-failed`/`handoff-unconfirmed` use
  `PendingHandoffView`'s own Retry, sentence only (S4).
- `close-unconfirmed` floating 5 s.

## T4. In-chat compact/clear failure card (R-card)
- Reducer action `CONTROL_FAILURE_CARD {sessionId, kind:'compact'|'clear', detail?}` appends an
  on-screen-only timeline entry (not written to transcript; Android/remote get it through the same
  reducer since the renderer is shared, but it is not part of `session:open` fill — a reopened chat
  shows none). Rendered with `ErrorState` (Details + Try again). Removed by
  `CONTROL_FAILURE_CLEARED` when the retry succeeds or the chat's next turn starts.

## T5. Prevention
- Native (YouCoded-runtime) chats: Claude Code–only commands not offered in the command drawer /
  slash completion; terminal sessions: Claude Code commands not offered. Typed anyway → strip.
- Skills that can't start in this chat: greyed in the list with a one-line reason.
- Skill with unreadable instructions: marked in the list.
- Two skills with one name: the drawer asks which one (instead of failing).
- Theme button with no chat open → `PageCreateDialog` (title "Build a new theme",
  initialInput `/theme-builder `). Card #57 ("Your Assistant" project) will become its default folder.

## T6. Records
- Design guide: the red strip is a recorded exception to "failures use ErrorState".
- Workbench screens for every new state (strip variants, red dot, in-chat card, phone strip,
  queued notices, theme popup), photographed for the after-build walkthrough.

## Order
T1 → T2 → T3 → T4 → T5 → T6. Each task: tests first where behaviour is testable, WHY comments,
`verify.sh` green, commit onto `session/waiting-notice`.

## Revision 1 (after review 1 — every finding accepted)
- **T5 commands (B1):** add `runsIn?: 'claude-code' | 'both'` to `CommandEntry`; set it in
  `cc-builtin-commands.ts` (all `claude-code`) and `youcoded-commands.ts` from the dispatcher's own table,
  with a test that every dispatcher case is classified. The drawer/completion filters by the chat's
  provider; in a native chat the misleading "run in Terminal View" rows are hidden. Filesystem commands
  stay unknown until run, so the typed-anyway strip stays. Drop the "terminal sessions" clause (N3: a
  shell session has no composer).
- **T1 re-check (B2, S5, N2):** `screen-input-store` gains `subscribe`; the strip evaluates `stillTrue`
  as a plain function against `store.getSession(id)` on `store.subscribeSession` + the screen-input
  subscribe, through a derived-boolean snapshot (the `useStreamingGate` idiom) — never `useChatState`.
  No interval. Busy predicate = `isThinking && !TURN_IS_OVER` as `useStreamingGate`; tested in the
  lost-message state. Busy-app render-budget check: a streamed reply causes zero strip renders.
- **T3 floating (B3, N4):** two slots. The routine slot is unchanged (string/state/null, normalised at
  the one `setToast` wrapper) and never waits. "Needs you" notices go to their own list: the first shows
  with "1 more" when others wait; none is ever dropped; Dismiss/action closes only that one.
  `setToast(null)` touches only the routine slot.
- **T1 held back on a chat you're not in (S3):** the strip of that chat, plus a short floating notice
  naming the chat (the old behaviour, so a background refusal is never invisible). All callers of
  `showBlockedSend`/`notifyIfPtyBlocked` and BuddyChat switched together.
- **T2 red dot (S1, N5):** store-level `unseenFailureIds` set read by ONE subscription in App, fed into
  `mergeSummaryStatuses` with red priority; cleared where `viewedSessions` is set; table test extended.
  Renderer-local: a phone shows failures raised on that phone. `claude-control.ts` /
  `conversation-queue-actions.ts` take the session id in their options.
- **T4 card (S2):** data-only entry `{kind:'control-failure', op, detail?}`, inserted with
  `appendAbovePending`, Try again wired by the renderer from `op`; added to every exhaustive consumer
  (with a `never` check); kept through `SESSION_FILL_RESET` like pending entries; excluded from
  `serializeChatState`.
- **Theme popup (S4):** `PageCreateDialog` gets a `screen` override (`settings/theme-new-chat`) and a
  theme subtitle; verify it opens a normal chat with `/theme-builder ` waiting.
