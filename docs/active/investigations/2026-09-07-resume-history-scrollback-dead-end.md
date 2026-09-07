---
date: 2026-09-07
status: active
type: investigation
topic: Resumed conversations sometimes load only recent messages with no way to scroll further back — a race between two first-page requests, one of which does not know which transcript file to read
---

# Resumed conversations dead-end at the top of the scroll

**Symptom (Destin, 2026-09-07).** "On resume some sessions don't allow me to actually scroll all the
way back through the chat history. They only load the most recent messages, and earlier messages are
unloadable even when scrolled to the top of the screen."

**Status.** Root cause identified by code tracing plus a reader test over all 916 real transcripts.
**Not yet reproduced in a running app** — no dev-window run has been done. No code has been changed.

---

## How history is supposed to load

Opening a conversation renders only its most recent ~30 exchanges (`PAGE_TURNS`, transcript-page.ts).
A 1px invisible sentinel sits above the first entry; when it scrolls into view the app fetches the
previous 30. The sentinel is rendered **only when `history.hasMore` is true**
(`ChatView.tsx:959`), and the observer that watches it also requires a saved reading position
(`history.cursor`, `ChatView.tsx:351`).

So if the app ever records "there is nothing above this," the sentinel is never drawn, no further
request is ever made, and the rest of the conversation is unreachable for the life of that session in
that window. There is no spinner, no error and no recovery path.

## What actually happens on resume

Two first-page requests are fired for the same conversation:

| | Origin | Carries the file location? |
|---|---|---|
| **A** | The generic "every session in the list gets its first page" effect (`App.tsx:1817`) | **No** |
| **B** | The resume handler itself (`App.tsx:2640`, and `:2610` for native) | Yes (`claudeSessionId` + `projectSlug`) |

`loadFirstPage` enforces **once per session** via the `firstPageAsked` ref (`App.tsx:1771`). Whichever
request arrives first claims the slot; the other returns immediately and its locator is discarded.

`session:created` is forwarded to the renderer on `process.nextTick`, which for a Claude Code session
drains **before** the `session.create` invoke reply (the CC create path "runs straight through with no
intervening await" — `ipc-handlers.ts:788`). So A's trigger reaches the renderer first. Whether A's
React effect actually *runs* before B's `await` resolves is scheduler-dependent — a genuine coin flip.

**This coin flip is the "some sessions."**

When A wins:

1. Main's `TRANSCRIPT_PAGE` handler calls `transcriptWatcher.pageSourceFor(sessionId)` — null, because
   the watcher only starts when Claude Code's `SessionStart` hook reports the transcript path
   (`ipc-handlers.ts:3505`).
2. No locator was supplied, so the handler returns `{ events: [], cursor: null, hasMore: false }`
   (`ipc-handlers.ts:2900`).
3. `loadFirstPage` retries — **3 attempts, 400 ms apart, ~0.8 s total** (`App.tsx:85-86`).
4. If Claude Code has not fired its hook inside that window, the final attempt dispatches
   `HISTORY_PAGE_LOADED` with `hasMore: false` (`App.tsx:1790`).
5. The sentinel is never rendered, `firstPageAsked` blocks any re-ask, and the live tailer starts at
   end-of-file — so only messages produced **after** the resume ever appear.

There are therefore **two dice rolls**: which request wins the slot, and whether Claude Code boots
inside 0.8 s.

### A contradiction the code already contains

`App.tsx:1815` states the resume calls "win the race and this skips them." `ipc-handlers.ts:788` and
`session-manager.ts:201` state the created event is sent before create/resume completes. Both cannot
be true for the CC resume path.

## What was ruled out

- **The page reader is not at fault.** `readTranscriptPage` was run against all 916 transcripts under
  `~/.claude/projects`, walking each cursor chain backwards to the beginning. Every chain terminated
  at byte 0. (`hasMore` is `startByte > 0` by construction, so termination always means "reached the
  start.")
- **Resume does not fork the transcript.** Every file's internal `sessionId` equals its filename and
  each begins at its own first prompt; `--resume` appends to the same file.
- **Entry folding is not at fault.** `use-entry-folding.ts` swaps off-screen content for a
  measured-height spacer and unfolds on approach; it never touches the reducer or the cursor.
- **`SESSION_INIT` double-dispatch is harmless.** It is dispatched from inside a `setSessions`
  updater (impure), but the reducer case is idempotent (`chat-reducer.ts:781`).

---

## Fixes considered

### ✗ Let the informed request through as well (rejected)

Allowing both A and B to complete means two history loads for one conversation.

- Duplicate entries: **safe** — `HISTORY_PAGE_LOADED` seeds its scratch replay from the live session's
  `seenUuids`, so a repeat page is deduped away (`chat-reducer.ts:2445`).
- Doubled tokens/cost: **safe** — `addTurnUsage` is guarded by the same `alreadyCounted` uuid check
  (`chat-reducer.ts:1907`), so `mergeTotals` receives zeros on a repeat.
- **`history.cursor`/`hasMore` is last-writer-wins** (`chat-reducer.ts:2471`). A slow empty answer
  landing after a good one restores the dead end — intermittently.
- **`firstPageAsked` is load-bearing for a second contract.** The tear-off path depends on it to
  guarantee the first page is applied *before* `replayLiveState` runs, because replay-complete reaps
  tool cards the history left `running` (`App.tsx:1950-1959`). Loosening the guard breaks
  drag-into-new-window.

### ✗ "Make scrolling to the top retry" (does not work as stated)

The sentinel requires `history.hasMore`, and the observer additionally requires `history.cursor`
(`ChatView.tsx:351`). In this failure both are false/null, so there is nothing to scroll into and
nothing to retry. This fix would change nothing.

Making it work would require main to distinguish *"genuinely no history"* from *"could not locate the
file yet"* — today both return `{events: [], cursor: null, hasMore: false}` — plus a new retry
trigger, mirrored across `ipc-handlers.ts`, `remote-server.ts:1698` and the shared
`TranscriptPageResult` type. Larger surface, and it fixes recovery rather than cause.

### ✗ Raise the retry budget (rejected as the primary fix)

Nothing renders `history.loading` — grep confirms `ChatView.tsx` is its only reader and it drives no
UI — so a longer budget would be invisible to the user and would make the bug much rarer. But it is a
timeout guess, it does nothing for the buddy floater (see below), and a wrong guess still leaves a
permanent dead end.

### ✓ Recommended: let main resolve the transcript itself

Main is handed `resumeSessionId` at create time and passes it straight to the CLI (`--resume`,
`session-manager.ts:244-245`); nothing durable records it. `sessionIdMap` is only written from the
hook (`ipc-handlers.ts:3486`).

**Change:** record the requested CC session id at create time in a small provisional map, and have
`TRANSCRIPT_PAGE`'s fallback use it (plus `sessionManager.getSession(id).cwd`) when
`pageSourceFor` returns null.

Why this is the better lever:

- The coin flip stops mattering instead of being re-weighted. Either request is answered correctly.
- `firstPageAsked` is untouched → the tear-off ordering contract is untouched.
- Exactly one load still happens → none of the cursor/counter risks above.
- **Fixes the buddy floater too**, which is worse off today: `BubbleFeed.tsx:319` makes a single
  `beforeCursor: null` request with **no retries at all** and no scroll-up sentinel, so a resumed
  session's floater feed can silently start mid-conversation.
- Scroll-back keeps working even if Claude Code dies, because file resolution no longer depends on the
  hook arriving.

## Consequences to handle in that fix

1. **Slug derivation can be wrong through symlinks.** `ccProjectSlug(cwd)` (`slug-encoding.ts:44`) is
   derived from our `cwd`; the hook path deliberately prefers CC's post-realpath `payload.cwd` for
   exactly this reason (`ipc-handlers.ts:3502`). Handling: try the derived path, and on miss scan the
   ~15 dirs under `~/.claude/projects` for `<ccId>.jsonl` — the same approach `remote-server.ts:1719`
   already uses.
2. **Drop the provisional id once the hook maps the session**, so `/clear` (which rotates the CC id
   mid-conversation) does not leave paging pointed at the old file.
3. **Keep `SAFE_ID_RE` validation** before the id shapes a filesystem path (`ipc-handlers.ts:2903`).
4. **Close the fallback gap.** A fallback page reads to EOF (`startOffset` 0 → `endOffset` null); the
   tailer later starts at the file size *at hook time*. Anything written between belongs to neither —
   a hole mid-conversation. In practice CC writes nothing before announcing itself, so the window is
   empty today, but this fix makes the fallback the normal path. Handling: have `startWatching` begin
   at the lowest offset any first page was served to. Over-delivery is safe (uuid dedup);
   under-delivery is not.
5. **`consumeInheritedByTransfer` is a one-shot consumed by any `beforeCursor: null` request**
   (`ipc-handlers.ts:2879`). Three retries can fire and only the first sees it; harmless today because
   the first succeeds when the session is watched, but fragile — the mark exists to stop a torn-off
   window showing a conversation frozen at the resume point (Destin, 2026-09-03). Consume it only when
   a page is actually served.
6. **Remote/phone parity.** `remote-server.ts:1698` is a separate implementation with the same
   ambiguity and no `startOffset`/inherited concept. The desktop fix does not reach it; deciding
   whether to mirror is a separate call.

## Related, not a bug

Even fully fixed, the largest transcript here (112 MB) needs **59 separate scroll-to-top loads** to
reach its first message, and the prepend anchor holds the reading position after each one, so the user
must scroll up again every time. If reading back to the beginning is a real workflow it needs its own
answer — a jump-to-start, or growing page sizes further back.

## Evidence and scope

- Worktree: `worktrees/sessions/chat-scrollback` (session key `chat-scrollback`), youcoded at
  `origin/master` `ccbf4211`.
- Reader verification: temporary vitest probe driving `readTranscriptPage` over the 60 largest of 916
  transcripts; removed after the run. No repo files were modified.
- Not done: live reproduction, any code change, any test.
