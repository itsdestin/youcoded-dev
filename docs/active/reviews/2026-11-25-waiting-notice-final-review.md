# Waiting-notice: independent final review (2026-11-25)

Scope: `git diff origin/master...HEAD -- desktop/src` in `youcoded/` (branch session/waiting-notice), the deck answers (rounds 3 and 4), and `notices.json`. Read-only review; no source edited. Paths below are relative to `youcoded/desktop/src/renderer/` unless stated. Every claim was checked against the code.

Counts: 5 bugs, 7 risks, 4 simplifications.

## A. Bugs in code already written

**A1. BUG. Pressing Enter does not clear the strip notice (only the Send button does).**
`components/InputBar.tsx:1006-1011` clears the notice in `handleSubmit`, which only the form's submit (Send button) reaches. The Enter key calls `send()` directly (`InputBar.tsx:1371`, plus the global key path at `:528`, the compose-comments path at `:760` and the "Send anyway" retry at `:811`). None of them pass through `handleSubmit`.
User sees: a "held back" strip (leaves only when answered or you send) stays on screen after they answer the card and press Enter. This is a smaller version of the original stuck-notice bug. The deck promise ("leaves once ... you send") is broken for the most common way of sending.
Fix: move `clearChatNotice(sessionId)` into `send()` (or at the top of `sendMessage`), before the gate runs, so every path clears it and a refusal simply raises a fresh one. Keep the call in the touch-terminal branch too.

**A2. BUG (planned behaviour missing). "Leaves on chat switch" is not wired anywhere.**
`state/chat-notice-store.ts:71` doc says next-action notices leave on "typing, send, or chat switch", and the owner approved that wording (K-3, L-drawn "cant"). A repo search finds only two callers of `chatNoticeUserActed`: typing (`InputBar.tsx:1246`) and nothing else. Voice dictation also fills the box without going through `onChange`, so it leaves the notice up too.
User sees: "Can't compact while..." still there when they come back to that chat an hour later, with nothing they did in between clearing it.
Fix: call `chatNoticeUserActed(previousSessionId)` when the active session changes (one effect in InputBar keyed on `sessionId`, or in App's tab-switch handler), and from the voice insert path.

**A3. BUG/RISK. One floating slot means a "stays until closed" notice can be silently replaced and then vanish.**
`App.tsx:~655` holds a single `toast` state. K-7 sets `durationMs: null` (`App.tsx:669`), but any later `setToast`/`announce` (a "Copied to clipboard", a failed save) replaces it, and the replacement times out in 3 seconds, taking the K-7 notice with it. The user never pressed Dismiss or the action. Also two start-up K-7 notices can collide: `PluginTurnedOffNotice.tsx:22` and `SettingsRepairNotice.tsx:18` both announce on mount; the second wipes the first (today the 30 s timer hid this less visibly; once both are "until closed", one is simply lost).
Fix: while a K-7 notice is up, hold routine toasts in a short queue (or drop them) and show queued K-7s one after another. About 15 lines in the `APP_NOTICE_EVENT` handler.

**A4. BUG (latent). Other notice surfaces ignore the K-7 flag.**
Three notices in the inventory's K-7 list do not go through `announce()`, so `untilClosed` cannot reach them:
- `office-save-failed` (a document could not be saved, the one with the most data-loss weight) draws its own `<Toast durationMs={10_000}>` in `components/office/OfficeAlerts.tsx:21-27`.
- `remote-unsupported` is its own component with its own 6 s timer (`components/RemoteUnsupportedNotice.tsx:16,43`).
- `saved-password-*` / `tailscale-only` use `announce(..., 8000)` in `remote-gate.tsx:353,361` (fine, but they are one-line edits that are not on the K-7 to-do).
Both own-surface notices also draw at the same screen position as the App toast, so they can overlap it.
Fix: give OfficeAlerts `durationMs={null} dismissible`; route RemoteUnsupportedNotice through `announce` (see S2).

**A5. BUG (standards). Raw internal strings reach the toast and are missing from the inventory.**
`state/claude-control.ts:30,41,54` show `result.message` straight from the main process for Clear, Stop and commands. Main supplies, for example, "Control incarnation ended before invocation", "Stop target is no longer active", "Invalid control operation", "Module queue is full" (`main/claude-control-plugin.ts:80,82,95,144`), "Conversation queue is still starting." and "Unsupported queue operation." (`main/claude-queue-runtime.ts:228,285`), arbitrary `error.message` (`:286`), and up to 2048 characters of plugin text (`claude-control-plugin.ts:98`). `state/conversation-queue-actions.ts:23` does the same with `e.message` (e.g. "Edit acknowledgement unconfirmed"). `notices.json` lists only the fixed fallback sentences, so the sort never saw these. The project's rule (error-message-standards: plain words, never an invented or leaked cause) is broken.
User sees: engineer text in a pop-up when Stop or Clear is refused.
Fix: map `rejected` statuses to one of two plain sentences ("didn't go through" / "can't tell if it went through; check the chat"), log the raw message to the console.

## B. Risks and omissions in the sorting

**B1. RISK. The 20 "not sure it went through" notices were never sorted one by one.**
The owner picked "floating, timed" for K-2 (round 3), but his K-4 note then set the rule: blocked before the message is sent goes to the strip; blocked after it is recorded goes in the chat. `L-sort-failed` and `L-sort-cant` sort 36 notices; the 20 in `L-ref-unsure` (and 13 in `L-ref-held`) were not run through the rule. Concrete misfits: `send-failed-generic` ("The message could not be sent."), `lost-send-restored` (message put back in the box) and `queue-refused`-type notices are before-send failures, so by his rule belong in the strip. The most dangerous ones ("check the conversation before sending it again", double-send risk) currently get the shortest life, 3 s.
Fix: sort them with a third list (L-sort-unsure) before building, or state that the K-2 pick stands for all 20.

**B2. RISK. Some items in `L-sort-cant` / `L-sort-failed` break the owner's own rule or cannot work.**
- `open-conversation-first` (`App.tsx:4187`) happens when there is no chat; the strip needs a `sessionId` (`ChatNoticeStrip.tsx:18` returns null). Sorted as floating, which is right; but the prevention note ("the button opens a new chat itself") creates a chat as a side effect of a button. That is a visible behaviour change that could leave stray empty chats; confirm with the owner before building.
- `attachments-ignored` and `no-response-to-copy` are FYIs, not blocks: the command ran. His rule says non-blocking floats briefly. They are sorted into the strip (with a Dismiss button to press for nothing).
- `remove-from-list`, `save-tag-change`, `save-note`, `save-change` are marked chat-specific, but they act on a row in the session list, which can be a different chat from the open one (`SessionDrawer.tsx:640`, `hooks/useSessionMeta.ts:162-195`). They are floating in the sort, so no harm; just correct `chatSpecific` in the inventory so nobody routes them to the strip later.
- `remote-unsupported` ("Theme browsing isn't available via remote access yet") is in the K-7 "needs you" list but nothing can be done about it. As "until closed" it adds a button to press for a known limit and can reappear on each new screen that touches an unbridged feature.
- `live-handoff-unavailable` and `finish-current-transfer` come from the resume browser (`App.tsx:2748,2757`), not from composing in a chat; the strip is under whichever chat happens to be open, which may be unrelated. Same for `resume-failed` (no chat exists yet).

**B3. RISK. The held-back notice should be derived, not stored.**
Planned: "held back" lives in the store as `leave: 'resolved'`, cleared by whatever code notices the card was answered. The block comes from `sendBlock()` (`state/pty-input-gate.ts`), which also reads the live terminal screen, and there is no event when a terminal-only pop-up closes. If nobody calls clear, the strip sticks, the same bug the owner reported, now sitting above the box.
Fix: render the held-back strip from `sendBlock(session)` directly (a computed condition re-checked on state changes and a short interval while shown), with the draft check; only the Dismiss flag is stored. Same for `compact-busy`, `clear-busy`, `skill-busy` ("leaves when the reply ends") and `*-not-live`: compute from chat state instead of storing and hoping a caller clears it.

**B4. RISK. In-chat failure cards (compact, clear, 6 notices).**
The picture says "stays". Open questions: is the card saved to the transcript or just on screen (reload/resume and Android show different things)? What happens after Try again succeeds: the failure card must turn into the success state or disappear, or the chat keeps a stale "Couldn't compact" above a compacted chat. `/clear` and `/compact` are not user messages recorded in the transcript, so "after the message is recorded" does not clearly apply; confirm the owner meant these. Also the timeline is shared with Android, so the card needs a reducer action, not renderer-only state.

**B5. RISK. Failed-kind strip bypasses `<ErrorState>`.**
Project rule (`CLAUDE.md`, `docs/error-message-standards.md`): failures use `ErrorState`. `ChatNoticeStrip.tsx` + `StatusStrip.tsx:22-30` draw a new red-dot strip instead. The owner approved the picture (L-drawn "failed"), so this is allowed, but the guide and any adoption test do not say so. Either use `ErrorState` (compact) inside the strip wrapper for the error tone, or record the exception in the design guide so the next session does not "fix" it back.

**B6. RISK. Phone width.** `ChatNoticeStrip.tsx` puts up to three buttons beside the words (Dismiss, Send anyway, Show card). `StatusStrip.tsx` itself documents (`actionBelow`) that this squeezes the text on phones (review P-1, owner: "dont like the button styling or wrapped copy"). Fix: pass `actionBelow` when there are two or more actions (or on narrow widths). Not checked on a phone screenshot; this is from the code and the existing comment.

**B7. RISK. Button-failure toasts are still 3 seconds.** K-5 was approved as "floating, 5 seconds" and `L-sort-failed` says "Floating, 5 seconds", but `components/ui/Toast.tsx:55` default is still 3000 and `announceFailed` (`utils/announce.ts`) passes no duration. About 39 notices. Fix: `announceFailed` passes 5000 (confirmations in K-6 stay 3000).

**B8. RISK (low). Same message shown twice does not restart the timer.** `Toast.tsx:64-70` re-arms only when `message` or `durationMs` changes, so a second identical toast while the first is up just inherits the first one's remaining time (for example Save fails twice in 2 s: second pop-up lasts 1 s). Partly softened by `report-failure.ts` de-duping. Fix: give `setToast` a counter and use it in the effect's dependencies (`LikeButton.tsx:36-41` already does this with a nonce).

## C. Smaller code points

**C1. Accessibility (low).** `ChatNoticeStrip.tsx:20` puts `role="status"` on a wrapper that is created at the same moment as its text; several screen readers ignore text inside a live region that did not exist beforehand. Same pattern in `Toast.tsx` (`role="status"`, pre-existing). Failures would be better as `role="alert"`. Fix: keep a permanently mounted empty live region and fill it, or use `role="alert"` for the error tone.

**C2. Store never pruned.** `chat-notice-store.ts:36`: the `notices` Map keeps an entry for each closed chat until the app quits. Harmless in size; but if a chat id is reused on resume, an old "held back" notice would reappear. Fix: `clearChatNotice(id)` when a session closes.

**C3. Remote/Android parity.** The store and strip are plain renderer code, so Android and the remote web view get them. One gap: the buddy window is a separate renderer with its own module state and its own `<Toast>` (`components/buddy/BuddyChat.tsx:144,201`). When `useBlockedSend` moves to the strip, both callers (`App.tsx:808`, `BuddyChat.tsx:146`) must be switched together or the buddy keeps the floating notice. The buddy's "Show card" falls back to opening the main window, which is correct.

## D. Consolidation and omissions

**S1. SIMPLIFICATION. Many wordings for three ideas.** About 30 inventory notices say one of: "didn't go through", "can't tell if it went through, check the chat", "can't do that here". Examples for the same event (a Stop that wasn't confirmed): `stop-not-confirmed`, `stop-outcome-unknown`, `stop-unconfirmed-phone`, `stop-refused`, `stop-not-sent-offline` (5 sentences); Clear: `clear-not-confirmed`, `clear-outcome-unknown`, `clear-failed`, `clear-error-detail`; sends: `send-unconfirmed`, `queue-maybe-not-sent`, `queue-outcome-unknown`, `queue-availability-changed`, `maybe-lost-send-restored`, `claude-did-not-confirm`, `control-unconfirmed`. Suggest two shared sentence templates ("X didn't go through." / "Can't tell if X went through. Check the chat before trying again.") with X filled in, used by desktop and phone. Fewer things for users to learn and one place to fix wording.

**S2. SIMPLIFICATION. One floating surface instead of five.** Floating notices are drawn by the App toast, `OfficeAlerts` (own Toast), `RemoteUnsupportedNotice` (own timer), `LikeButton` and `ReportReviewButton` (own local toasts; `ReportReviewButton.tsx:50-68` and its message "Sign in to report reviews" are not in the inventory), and `BuddyChat`. Each has its own timing and none can be told "until closed". Fold the first three into `announce()` with the new options; the anchored ones can stay.

**S3. SIMPLIFICATION. Near-duplicate "not available in YouCoded-runtime" sentences.** `not-in-native-runtime` is built at `App.tsx:862`, `:2511` (`${entry.name}`), `:4202` and `InputBar.tsx:862`; `not-in-terminal-session` once; `skill-cant-start-native`, `skill-not-a-skill` and `live-handoff-unavailable` say the same idea in different words. One builder function ("<thing> works only in <kind of chat>. <what to do instead>") would also give the owner's "better explained known limitation".

**S4. SIMPLIFICATION. Duplicate buttons on the handoff screen.** `takeover-failed` and `handoff-unconfirmed` plan a strip with Dismiss and Try again on the pending-handoff tab, but `PendingHandoffView` (`App.tsx:3650`) already has its own Retry / Continue buttons. Two sets of buttons for the same failure; the strip should only carry the sentence, or be dropped there.

**Omissions in the inventory (found by search):** `ReportReviewButton.tsx:267` "Sign in to report reviews"; `conversation-queue-actions.ts:26-49` (about 9 sentences: "Already sending — too late to cancel.", "Finish or clear your current draft first.", "Your draft changed. It was not overwritten.", "Send now was not confirmed.", a 15 s "Edit transfer was not confirmed" with Try again, and the dynamic `e.message`); the dynamic strings in A5; `App.tsx:2788` `onWarn(message)` (dynamic, inventory has only the handoff example).

## Answers on the planned-but-unbuilt items
- Held-back send path: see B3 (derive, do not store) and C3 (buddy).
- Can't-do / before-send routing: needs the owning chat's id at each call site; `announce()` has no session parameter, and several are async (`claude-control.ts` replies can arrive after the user changed chats; with the strip they go to the right chat, but the user is not looking at it, so a failure in a chat you left is never seen until you return. Consider also marking that chat in the session list).
- K-7 call sites: see A3, A4, B2 (remote-unsupported).
- In-chat cards: see B4.
