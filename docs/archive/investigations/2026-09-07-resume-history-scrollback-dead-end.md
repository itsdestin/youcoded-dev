---
date: 2026-09-07
status: shipped
type: investigation
topic: Scrolling back through a resumed conversation dead-ended after the first batch — every page request after the first had no way to locate the transcript file, and "I cannot find it" was the same answer as "this is the beginning"
---

# Scroll-back dead-ends after the first batch of messages

**Symptom (Destin, 2026-09-07).** "On resume some sessions don't allow me to actually scroll all the
way back through the chat history." Refined: *"the first handful of messages from a resumed
conversation load fine, but then nothing before those loads"* — and inconsistent across
conversations.

**Status.** Shipped — youcoded#441, merged `1a020a13`. Diagnosed by code tracing and
pinned by tests; **never reproduced in a running app** — no dev-window run was done.

---

## How paging works

Opening a conversation renders only its most recent ~30 exchanges (`PAGE_TURNS`,
`transcript-page.ts`). A 1px invisible sentinel sits above the first entry; crossing it fetches the
previous 30. The sentinel is rendered only while `history.hasMore` (`ChatView.tsx:959`), and its
observer also needs a saved position (`history.cursor`, `ChatView.tsx:351`).

So if the app ever records "there is nothing above this," the sentinel is never drawn again, no
further request is made, and the rest of the conversation is unreachable for the life of that
session in that window. No spinner, no error, no recovery path.

## What was wrong

**Only the FIRST page request could locate the transcript file.** `handleResumeSession` has the ids
and passes them (`App.tsx:2640`). Every later request carries only a cursor — the scroll-up sentinel
(`ChatView.tsx:334`) and the buddy floater (`BubbleFeed.tsx`). The cursor already carried the file's
own path (`transcript-page.ts:186`); the handler never looked at it.

Main resolves a page through `transcriptWatcher.pageSourceFor`, which answers only for a session it
is actively tailing. It cannot answer at **three** ordinary moments:

1. Between resuming a Claude Code session and CC's `SessionStart` hook reporting the transcript path
   (`ipc-handlers.ts:3505`) — a second or two.
2. **After the session's process exits.** `session-exit` calls `teardownSessionWatchers`
   (`ipc-handlers.ts:3542`) while the conversation stays on screen and scrollable. Deterministic.
3. In the buddy floater, which never watched the session.

In all three, a locator-less request got `{events: [], cursor: null, hasMore: false}` — byte-for-byte
the answer for "you have reached the beginning of the conversation". The reducer recorded it
(`chat-reducer.ts:2471`), dropped the cursor, and stopped rendering the sentinel. Permanently.

**Why it felt inconsistent.** The sentinel's observer uses `rootMargin: '400px 0px'`, so a first
batch that renders SHORT — "a handful of messages" — puts the sentinel in range the instant it
paints and fires a locator-less request milliseconds later, well before the hook lands. A batch that
renders tall is not asked for until the user actually scrolls, seconds later, by which time the
watcher is up. The variable is page height, not chance.

## What shipped

1. **Main remembers where each session's transcript is** (`transcript-page-source.ts`), from
   whichever source spoke first: a validated request locator, or the authoritative path read back
   from the watcher when the hook starts it. Any later request resolves from memory. Read back
   rather than re-derived from our cwd, which can name a different directory through a symlink.
   Dropped on `SESSION_DESTROY`, deliberately **not** on session-exit — case 2 above is exactly the
   one that must survive it.

2. **`TranscriptPageResult.unresolved`** separates "I could not locate the transcript" from "this is
   the beginning of the conversation", on both answering surfaces — `ipc-handlers.ts` and
   `remote-server.ts`, since the same React renderer runs over the remote bridge. Callers retry
   instead of recording it: `ChatView` with a bounded backoff (at the top of the list there is no
   scroll gesture left that would re-trigger the sentinel, so it must heal on a timer);
   `App.loadFirstPage` and the buddy floater through `decideFirstPage` (`first-page-retry.ts`).

3. **An unresolved answer no longer spends the tear-off read-to-EOF mark.**
   `consumeInheritedByTransfer` is a one-shot; with longer retries, an attempt that served nothing
   would have spent it, and the attempt that finally succeeded would have rendered the conversation
   frozen at the moment the session was resumed.

Guards: `tests/transcript-page-locator.test.ts` (handler, end to end against a fixture home),
`tests/first-page-retry.test.ts`, new cases in `tests/chatview-history-sentinel.test.tsx`, and a
surface-parity assertion in `tests/transcript-page-channel-parity.test.ts` so desktop and the remote
bridge cannot drift apart on the distinction.

## Ruled out

- **The page reader.** `readTranscriptPage` was run against the 60 largest of 916 real transcripts
  under `~/.claude/projects`, walking each cursor chain back to the start. Every chain terminated at
  byte 0. (`hasMore` is `startByte > 0` by construction, so termination means "reached the start".)
  The probe was temporary and was deleted after the run — it cannot be re-checked.
- **Resume does not fork the transcript.** Every file's internal `sessionId` equals its filename;
  `--resume` appends to the same file.
- **Entry folding.** `use-entry-folding.ts` swaps off-screen content for a measured-height spacer;
  it never touches the reducer or the cursor.
- **`/clear`.** It does start a new transcript file, which would wall off scroll-back at the seam by
  design — but Destin confirmed the affected conversations had none.

## Dropped, not fixed

**The blank-conversation branch.** Two requests race for the once-per-session load slot
(`firstPageAsked`, `App.tsx:1771`): the generic "every session gets its first page" effect, which
carries no locator, and the resume handler, which does. `session:created` reaches the renderer
before the create call's reply — `session:created` is forwarded on `process.nextTick`, which drains
before the invoke reply's microtask, and the CC create path has no intervening await
(`ipc-handlers.ts:788`) — so the uninformed request very likely claims the slot every time. When it
does and the hook has not landed within the retry budget, the conversation comes up **empty**, and
the slot is never released.

The code comment at `App.tsx:1815` asserts the opposite ("the explicit resume calls below … win the
race and this skips them"). That comment is wrong about the ordering.

**Dropped by Destin, 2026-09-07: never encountered in real use.** Not filed as a roadmap item. The
`unresolved` flag now means this would surface as a retry rather than a recorded dead end, which is
the cheap half of a fix; releasing the slot when nothing was delivered is the rest, if the symptom
ever appears.

## Related, not filed

Even fully fixed, the largest transcript here (112 MB) needs ~59 separate scroll-to-top loads to
reach its first message, and the prepend anchor holds the reading position after each one, so the
user must scroll up again every time. If reading back to the beginning is a real workflow it needs
its own answer — a jump-to-start, or growing page sizes further back. Not filed: nobody has asked
for it.

## Evidence and scope

- Worktree: `worktrees/sessions/chat-scrollback` (session key `chat-scrollback`), youcoded branched
  from `origin/master` `ccbf4211`.
- `bash scripts/verify.sh` green: types, tests in `tests/`, the FULL desktop suite, knip, eslint,
  ast-grep. Android and the marketplace worker are not covered — Android does not implement
  `transcript:page` at all (`transcript-page-channel-parity.test.ts` records why).
- Not done: any live-app reproduction, before or after.
