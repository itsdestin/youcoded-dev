# Waiting-notice code review (fresh reviewer), 2026-11-26

Branch `session/waiting-notice` in `youcoded/`, diffed `origin/master...HEAD` (77 files, +3168/-382).

## verify.sh summary
`bash scripts/verify.sh <worktree>`: PASS types, PASS types in tests/, PASS dead code (knip), PASS lint, PASS design lint, PASS ast-grep invariants, PASS silent catches.
Tests (related): FAIL flag, but 603 files / 11109 tests passed, 0 failed. The only error was one "Unhandled Rejection" (`sessionManager.getSession is not a function` from `src/main/update-service.ts` timer, surfaced during `tests/ipc-handlers.test.ts`) under load 35 on 32 threads; the harness then said "could not tell which test files failed". I re-ran `tests/ipc-handlers.test.ts` alone: 54/54 pass. The branch touches neither file, so I judge it a load flake outside this work (see F8; per workspace rule it should still be fixed, not filed).
Android not run (walkthrough row k-android says skip).

## Findings (most severe first)

- F1 — desktop/src/renderer/state/native-slash-actions.ts:164-181 — "Try again" on the skill notices (`skill-unreadable`, `skill-failed`) re-runs the skill but never clears its own strip notice, so after a successful retry the red "Couldn't run /x" stays until you type or send (it is `next-action`, and running a skill is neither). Read: `retry.onClick` only calls `runNativeSkill`; the `ok` path returns before any `clearChatNotice`; only `raiseWhichSkill` clears itself. Compare the compact/clear card, which clears on success.
- F2 — desktop/src/renderer/state/floating-notices.ts:3-12 and `showNeedsYou` — walkthrough row c-queue says "Up to three 'needs you' notices wait in line; any more are dropped and written to the log". The code never caps or logs; `tests/floating-notices.test.tsx:40` asserts the opposite ("none is dropped with four waiting"). Either the row is stale (the design later chose "never drop") or the cap is missing. Confirmed by reading `showNeedsYou` and the test. The after-build row must be reworded or the cap built.
- F3 — desktop/src/renderer/App.tsx (model-switch effect, `announce(modelSwitchFailed(wanted)…, {untilClosed:true})`) — the failed-model-switch notice is app-wide floating, not tied to its chat, which contradicts the "stuck: tied to a specific chat" ask for the one notice that is about one chat. Switch chats and it still sits there, and its Try again targets `failedSid`, not the chat you are looking at. PLAUSIBLE (the deck row says "stays until closed", so this may be intended; the mismatch is the chat-tie, not the lifetime).
- F4 — desktop/src/renderer/state/conversation-queue-actions.ts:27,54 — the native-chat branches still use the floating `o.toast` with old, un-shared sentences ("Already sending — too late to cancel.", "Send now was not confirmed.") while the non-native branch of the same actions now uses the strip + `QUEUE_ACTION_UNSURE`. So the same failure reads two ways and the native one shows in whichever chat is on screen (walkthrough W-behind b3 and "same meaning, same sentence"). Confirmed by diff: only the `failure(...)` calls were converted.
- F5 — desktop/src/renderer/state/phone-session-actions.ts:40-43 — a refused close still appends the computer's own `reason.detail` to the floating sentence (`Couldn't close X: <detail>`), which is the technical text row b4 / W-asked "words" says never shows. Read from the diff: only the "unsure" branch was changed to `closeUnconfirmed`.
- F6 — desktop/src/renderer/state/chat-notice-store.ts `showChatNotice` (lines ~91-99) — a late failure for a chat that has already closed creates a notice and a red-dot entry for an id nobody lists (`withFailureDots` hides the dot, but the Map entries and `unseenFailures` entry leak, and a resumed chat that reuses the id is only cleaned at the two App.tsx `clearChatNotice` calls on create/resume). Row b5 says closing "throws away its notice", true only for notices raised before the close. PLAUSIBLE (needs a failure answer landing after close; not reproduced).
- F7 — desktop/src/renderer/state/chat-notice-store.ts `showChatNotice` — replacing an error notice with a warn notice leaves the chat's red dot on (the dot is dropped only when the notice is cleared, not replaced), so a chat can show a red dot with no red notice behind it until it is opened. Read-through; minor.
- F8 — verify run: `tests/ipc-handlers.test.ts` leaked an unhandled rejection from a `update-service.ts:660` timer firing after the test ended (`getSession` missing on a test double). Not caused by this branch, passes alone; per workspace rule a flake is fixed when found, so someone should add the missing stub or cancel the timer in teardown.
- F9 — desktop/src/renderer/components/ChatTimelineRow.tsx (control-failure case) — `onTryAgain` calls `retryControlFailure(sessionId, op, act.dispatch)` with no `getSession`, so if the retry is refused as "still working", `raiseBusy` has no state to read and its Stop notice will not leave when the reply ends (it waits for your next action instead). Harmless but inconsistent with the typed-command path. Read from the call.
- F10 — desktop/src/renderer/components/ControlFailureCard.tsx / chat-reducer `CONTROL_FAILURE_CARD` — `detail` (the computer's own reason) is shown under "Details". The code comment calls this the one approved place; the W-asked "words" row says "No technical text ever shows" with no exception. Say so on the after-walkthrough row. Not a code bug.

Performance/render checks: the strip subscribes per-session and only attaches listeners/timer while a notice with `stillTrue` is up; `setScreenInputBlock` now ignores unchanged readings; `useBlockedSend` uses no new subscription. I found no violation of `performance.md` in the diff. `ControlFailureCard` is memoised but handed a fresh `onTryAgain` closure each render (trivial, one rare card).

## Your standing question: simplify / consolidate message and error types, bugs, omissions

Consolidation opportunities:
- Five delivery channels now exist for "something to tell you": chat strip, routine floating toast, needs-you floating list, `ScreenNotice` (resume/handoff screens), and the in-chat `ErrorState` card. The strip and `ScreenNotice` draw the same band with the same button order in two near-identical components (`ChatNoticeStrip` NoticeBody vs `ScreenNotice`); one shared "notice band" component would stop them drifting.
- `announce()` still takes four positional arguments plus a separate `announceFailed`; callers now pass `{untilClosed:true}` or tone through the 4th. A single object argument would be clearer and closer to `ChatNotice`.
- Three raisers (`raiseCant`, `raiseFailed`, `raiseUnsureNextAction`) do the same thing (warn/error + next-action); only tone and name differ, so `raiseCant` and `raiseUnsureNextAction` are identical bodies. Collapse to one with a tone argument.
- Sentences still outside `notice-words.ts`: five `sendFailureCopy` strings in `native-send-copy.ts`, the two "This chat couldn't take your message…" and "Claude Code isn't answering…" strings in `submit-outgoing.ts`, the shell-session sentence in App.tsx, the "Live handoff is available…" and "Couldn't take over…" strings. They were not moved, so the "one sentence per meaning" file is not yet the one place.
- `sendFailureCopy` is now module-private but `HELD_REASONS` duplicates its switch cases; a missed reason would fall into the "unsure" strip silently. Derive the set from the switch.
- Two ways to say "busy/not running" exist: `raiseBusy`/`raiseNotRunning` (with live tests) and the `isTurnBusy`-based copy in `blocked-send`; fine, but keep one definition of "reason gone" (done well in `isTurnBusy`).

Omissions: F1, F2, F3, F4, F5 above. Also: `setNoticeViewer('main', …)` treats a chat as "seen" whenever the main view is chat, even when a full-screen panel (Settings, Marketplace) covers its strip, so a failure raised then gets no red dot and no floating notice. PLAUSIBLE, not reproduced.

## Walkthrough rows traced (W-asked/W-behind/W-choices)
Implemented and tested: held-back in strip, leaves via `stillTrue` (`tests/send-blocked-by-popup.test.tsx`, `chat-notice-strip.test.tsx`); Dismiss left/outlined, primary right (strip, Toast, FloatingNotices, ScreenNotice); per-chat keying; red dot; failure card; two-skills-same-name question; unreadable mark; command drawer filtering; theme builder popup; known-limits floating sentence. Broken or stale: c-queue (F2). Not verified here: pictures and the after-build deck (not my input).

## Not covered
Android/phone build (skipped by design); the Android-only `recheckEverySecond` timer path (`getCapabilities().sessionRecord` false) not exercised; workbench screen pictures; `skill-scanner` "unreadable" for a plugin skill folder with no SKILL.md (now flagged unreadable and greyed; I did not check whether such folders exist in the wild); main-process IPC parity (no channel added, none checked).

## Disagreement with the approved design (one line)
The red strip exception to "every failure uses the error card" will make two red failure looks in one chat; fine as approved.

## Triage (implementing session)
- F1 accepted — a successful retry clears its own skill notice.
- F2 accepted as a record change, not code — the build design (Revision 1, B3) chose "never drop; show the first with '1 more'". The after-build walkthrough lists this under "What changed while building" so Destin sees it.
- F3 rejected — the floating, stays-until-closed placement for a failed model switch is the approved K-7 row; Try again correctly targets the chat whose switch failed (`failedSid`). Noted on the after-build row.
- F4 accepted — native queue branches move to the strip with the shared sentences.
- F5 accepted — refused close drops the technical detail (to `console.warn`).
- F6 accepted — notices for a chat that is already closed are ignored.
- F7 accepted — replacing an error notice with a non-error one drops the red dot.
- F8 accepted — fix the `ipc-handlers` timer leak.
- F9 accepted — the card's Try again passes `getSession`.
- F10 accepted as a record change — the after-build "words" row states the one exception (Details on the in-chat card).
- Consolidation: one raiser with a tone argument — accepted. Remaining sentences into `notice-words.ts` with no wording change — accepted. `HELD_REASONS` derived from the switch — accepted. One shared notice band for strip and `ScreenNotice` — accepted, pictures must stay identical. `announce()` single options object — accepted. A chat covered by a full-screen panel is not "seen" — accepted (investigate; fix if real).
