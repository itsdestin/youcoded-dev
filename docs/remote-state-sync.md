# Remote access state sync — depth for the renderer rule

Depth behind the "Remote access state sync" section of `.claude/rules/react-renderer.md`. The rule keeps one line per invariant; the full wording, with the files and tests that pin each, lives here. Added by one-core (youcoded#604, R5/R6).

## Every screen is filled by `session:open`

A phone, a torn-off window and a reconnecting phone all open a session the same way: the computer answers from its record with the newest page, its recent past (`before`) and what only memory holds (`after`), or only the events a reconnect missed (`have: {epoch, seq}`). `state/session-fill.ts` applies it through the SAME handlers a live push reaches — never a second set of rules for "drawing a filled session". Backfill new state by making it a numbered event or a record fact, not by copying a window's reducer. While a screen is filled its pushes for that session are held (`main/audience-fill.ts`). Files: `main/session-open.ts`, `state/session-fill.ts`.

## A phone is sent only the conversations it watches (one-core R5-3)

`session:open` starts a watch, `session:unwatch` ends it (`hooks/useRemoteWatch.ts`, `state/watch-set.ts`: the one on screen + two). Everything else reaches it as `session:summary` only, so a phone's dots, attention sound and "finished" chime read the summary (`statusFromSummary`; blue stays per-screen). A push a phone must hear for ANY conversation (a tag or note change) is `publish(..., {everyPhone: true})`; never rely on a phone having an unwatched conversation's events. The computer's windows are unaffected: they receive by ownership.

## Shared lines and live facts are the host's, not each screen's (one-core R5-4a)

The queue of messages waiting on the computer, the model label, the "Model switched to ..." and "Conversation cleared" dividers, the compaction spinner and the terminal prompt cards arrive as numbered `session:live` events (`shared/session-live-types.ts`; Claude Code ones are read once in `main/session-live.ts`), are applied through `routeSessionLive` (the frame batcher, so order matches the transcript) and are held in the record for a screen that opens later. A screen must NOT also infer them: `capabilities.sessionRecord` is true everywhere except the Android app's own runtime, which has no record and still draws its own. The permission mode of a Claude Code session is likewise read in main (`session:permission-mode`), never scanned per screen. A card, and the "may be stuck" reading, are found by the COMPUTER's own headless copy of each running terminal (`main/session-screens.ts`, one-core R5-4b), so they are right with no computer window open and nothing a screen sends can create one (the R5-4a `session:prompt-report` channel is gone); only a host with no record keeps reading in its renderer (`useAttentionClassifier`, `usePromptDetector`, both over the shared `shared/stuck-tracker.ts` / `shared/prompt-card-reader.ts`). A host that sends no `sessionRecord` capability means false: that screen keeps inferring. Pinned by `tests/session-live-two-screens.test.ts` and, against the real captures, `tests/session-screens.test.ts`.

## "May be stuck" has one writer

The computer's main process (a numbered `session:live` `attention` event; `attentionMap` in `status:data` still carries a window's relayed state for the status bar). A screen must NOT run its own classifier wherever `capabilities.sessionRecord` is true. App's `statusData` handler's `attentionMap` diff is load-bearing.

## A message the screen sends carries an id (one-core R5-4b)

`session:input` and `native:send` carry `sendId`; the computer's record notes the ids it received, and after a drop `hooks/useSendReconcile.ts` asks it (`session:send-outcomes`) about every bubble still waiting for its echo and says so ON the bubble ("Not sure this was sent" / "This didn't send" + Send again; a received one clears itself). Nothing is ever resent automatically. A new send path must go through `state/submit-outgoing.ts`. Pinned by `tests/send-reconcile.test.tsx`.

## A phone's buttons answer at once (one-core R6-2)

Stop, a permission answer (Yes / No / Always allow), Close, a native Send into an idle conversation and the permission-mode chip draw their change before the computer replies, all through the one helper `state/pending-action.ts` (`runPending`): the change is marked waiting; the computer's yes (a reply, or the record's own published state) drops the mark; a refusal undoes the change and says so in the computer's own words; a reply that never came leaves it WAITING until the reconnect's fills (`reconcilePending`) show what the record has. The helper holds only what this screen did and has not had confirmed, never a copy of session state, and never resends. Only where `isRemoteMode()`: the computer's own window and Android's own runtime keep the direct path. A new instant button goes through it. A drawn answer must not be drawn again by the computer's re-announce of the same ask (`state/permission-answer.ts`). Pinned by `tests/instant-buttons.test.tsx`.

## One transcript listener for the main window and the buddy

Main window and buddy attach through ONE listener (`attachTranscriptFeed`, `state/screen-feed.ts`); the buddy skips no event type, and a live native `context-clear` only resets the turn ("Conversation cleared" comes once from the record's `session:live` `clear`). Rule: `.claude/rules/chat-reducer.md`.
