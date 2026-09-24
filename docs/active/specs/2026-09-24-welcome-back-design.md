---
date: 2026-09-24
status: active
type: spec
topic: Welcome back — offer the sessions open at last shutdown; in-app quit warning
---

# Welcome back — technical design

Approved UI (the backend's contract): decks in `docs/active/design/2026-09-24-welcome-back/`
(questions, review, review-2 + answers). Supersedes the 2026-09-01 investigation's
store-flag sketch (`docs/active/investigations/2026-09-01-resume-on-startup-welcome-back.md`).
Mockup code is on `session/session-resume-20260924` in youcoded: `ResumeBrowser` welcome-back
mode, `QuitSessionsPrompt`, `state/welcome-back.ts`, App wiring, workbench scenario
`welcome-back`, four MOCK_ONLY channels.

## Decisions carried in from the decks

- Only sessions with at least one message, or opened as a resume, are remembered (S-sent).
- A session's own X removes it (S-x). Every other end — crash, power loss, OS shutdown, menu
  quit, SIGTERM — keeps it (S-other-quit). Closing a window that owns sessions asks in-app,
  "Resume on Next Launch?" switch starts OFF (Q-quit ask-at-quit, Q-default unticked, B-quit).
- This install only (S-device). Desktop only; Android and remote browsers never show it (S-phone).
- Leftover rows are forgotten when the screen is left (Q-leftover).

## 1. Where the list lives: a per-install file, not the Conversation Store

`<userData>/welcome-back.json` — NOT a synced store flag. WHY (reversing the investigation's
sketch): the fact is per-install by definition, so syncing it only adds a key every other
device must ignore forever (stale `open:<installId>` keys accumulate per dead install); the
store is OFF for a whole launch without a personal sync space (`service.ts:174-180`), which
would silently disable the feature; and userData is already per-install (dev instance and
built app differ), which is exactly S-device. It carries only ids + provider — titles, folders
and models still come from `session.browse()`, so there is no second source of conversation
metadata (the old attempt's real fault).

```json
{ "version": 1,
  "open":  { "<desktopSessionId>": { "conversationId": "…", "provider": "claude" | "native" } },
  "offer": [ { "conversationId": "…", "provider": "…" } ] }
```

- `open` = this run's strip (tracked sessions). `offer` = what the Welcome back screen shows.
- **At startup** (main, before any window loads): `offer := dedupe(offer ∪ values(open))`,
  `open := {}`, persist. Union, not replace: if the app dies again before Destin answers the
  screen, the un-answered offer survives.
- `session:forget-reopen(ids)` removes those conversation ids from `offer`.
- Writes: in-memory state, coalesced async write (~200 ms), temp-file + rename. Never `*Sync`
  on a hot path (performance rule 1; `main-blocking-calls.test.ts`). The startup read is one
  `fs.promises.readFile` started in `app.whenReady()` before `createWindow()` is called; a
  missing/corrupt file = empty (never throws). **The store exposes a `ready` promise and every
  handler (`reopen-list`, `forget-reopen`, track/untrack) awaits it** (review 1, D5) — no
  reliance on boot timing; `createWindow()` builds the window synchronously first.
- `app.on('before-quit')` / shutdown path: flush pending write (awaited, bounded 1 s) so a menu
  quit right after a first message still records it.

New module `desktop/src/main/welcome-back-store.ts` (pure state + injected fs, unit-tested).

## 2. When a session enters and leaves `open`

Keyed by DESKTOP session id; the conversation id is updated whenever the mapping changes
(`/clear` rotation, in-session `/resume`, SessionStart remap — `sessionIdMap.set` at
`ipc-handlers.ts:853/957/4090`).

| Event | Where | Effect |
|---|---|---|
| Created with `resumeSessionId` | `createSession`, after `sessionIdMap.set` (:853) | `track(desktopId, resumeId, provider)` |
| First user-message transcript event | Claude feed (:2653), native feed (:3164) | `track` if not tracked (id from `sessionIdMap`) |
| Mapping changes for a tracked id | :4090 remap | update its `conversationId` |
| Explicit X | `IPC.SESSION_DESTROY` handler; remote `case 'session:destroy'` (`remote-server.ts:1805`) | `untrack(desktopId)` |
| Window close answered "don't resume" | main close handler (§4) | `untrack` each owned id |
| `destroySession`, `session-exit`, `destroyAll`, crash | — | **nothing** (that is the point) |

`untrack` must NOT live in `SessionManager.destroySession` or the `session-exit` handler —
both run on quit too (explore report: every path ends in `destroySession`, exit code 0).

**Holder takeover untracks (review 1, D1).** `conversations/takeover.ts:141` and `:225-232`
call `sessionManager.destroySession` directly, bypassing `SESSION_DESTROY`. The conversation
now lives on another device, so it is not "open here": add `untrack(desktopId)` at those
call sites (injected dep), with a test that a takeover-destroyed id leaves `open` while a
crash-exit id stays. The renderer's pending-handoff cleanup (`App.tsx:355`) goes through
`session.destroy` → `SESSION_DESTROY` and untracks like an X — correct, the conversation was
handed off. A process that died on its own (exit) stays tracked: it was open in the strip.

## 3. IPC surface

| Channel | Shape | Desktop | remote-shim | Android |
|---|---|---|---|---|
| `session:reopen-list` | `() → string[]` (conversation ids of `offer`) | handler | invoke; **renderer skips in remote mode** | `SessionService.kt` answers `[]` |
| `session:forget-reopen` | `(ids: string[]) → {ok}` | handler | invoke | answers `{ok:true}` |
| `window:close-request` (push, main→renderer) | `{ requestId, sessions: number }` | `webContents.send` | none (Electron-only `window` ns) | — |
| `window:answer-close` | `{ requestId, close, reopen? }` | handler | none | — |
| `window:close-request-cancelled` (push) | `{ requestId }` | `webContents.send` | none | — |

`window.claude.window` is the documented Electron-only namespace (PITFALLS: IPC parity), so the
close pair lives there and needs no shim/Android twin. Names byte-identical across files;
`ipc-channels.test.ts` guards. Remove the four MOCK_ONLY rows when real.

The renderer's `session.reopenList` returns ids only; the screen already matches them against
`browse()` rows (rows whose transcript/folder is missing here are shown unticked-disabled by
the existing `missingProject`/`notSyncedYet` fields; ids with no row at all simply don't show).

## 4. The in-app quit warning

`main.ts` `win.on('close')` (:945) today awaits `dialog.showMessageBox`. Replace with:

1. `ev.preventDefault()`; send `window:close-request {requestId, sessions: owned.length}` to
   THAT window's webContents.
2. Await `window:answer-close` for that requestId, **timeout 5 s** (B-quit risk card: a frozen
   renderer cannot draw it). Timeout → run the SAME destroy + `releaseSession` loop and close,
   but skip `untrack` — sessions stay tracked, as after a crash (review 1, D4: no orphaned
   processes behind a closed window).
3. `close:false` → nothing. `close:true` → if `!reopen`, `untrack` each owned id; then the
   existing destroy + `releaseSession` loop + `confirmedClose = true; win.close()`.
4. A second close press while a request is pending re-uses the pending request (no stacking).
5. **Whole-app quit wins over a pending prompt (review 1, D2).** `before-quit` fires before
   any window's `close` and runs `shutdownApp()` → `destroyAll()`. So: the close handler
   returns immediately (lets the window close, asks nothing) once `shuttingDown` is set; and
   `before-quit` first settles every pending close request as "keep tracked" (resolve with
   `{close:true, reopen:true}` semantics — no `untrack`) and pushes
   `window:close-request-cancelled {requestId}` so the renderer drops its prompt. A late
   answer for a settled request is ignored. Menu quit / SIGTERM / OS shutdown therefore never
   downgrade to "don't resume" (S-other-quit).

Renderer (already mocked): `App.tsx` subscribes to `window.onCloseRequest`, renders
`QuitSessionsPrompt`, answers via `window.answerClose`; ✕/Escape = `{close:false}`. The
renderer must answer even if unmounted mid-request → main's timeout covers it.

The last window closing still goes `window-all-closed → before-quit → shutdownApp` with the
sessions already destroyed by step 3; `open` is correct by then.

## 5. Renderer gating (mostly built)

- Ask `reopenList` once, when `isFirstRun === false && sessionListLoaded && !remoteCatchingUp`
  and the strip is empty. **Launch-blocking (review 1, D3):** skip in remote mode
  (`isRemoteMode()`), on Android, and in any window whose id is not the directory's
  `leaderWindowId` (detached windows, buddy). Only one window may show Welcome back; the
  mockup's effect has no such check yet.
- Batch resume reuses `handleResumeSession`; native rows need a binding from
  `resolveNativeBinding` (prefill rule), else they are left for a manual Resume (picker).
- `onDone` → `forgetReopen(ids)` with the ids shown.
- `welcome-back.ts` drops its `as any` once preload types the two session channels.

## 6. Tests (each seen red first)

- `welcome-back-store.test.ts`: startup union; track/untrack/remap; forget; corrupt file;
  coalesced write; flush.
- IPC: `ipc-channels.test.ts` parity (automatic); handler test that `SESSION_DESTROY` untracks
  and `destroySession` alone does not.
- Close flow: `main` close handler unit (answer false/true/reopen, timeout keeps tracked).
- Renderer: `ResumeBrowser` welcome mode — seeds all resumable ticked; complete unticks;
  Escape/scrim don't close; footer label counts; `needsModel` note; list closes when empty.
  `QuitSessionsPrompt` copy + switch default off. App gating (remote/non-leader skip).
- Performance: `main-blocking-calls.test.ts` stays green; the Welcome back list is bounded by
  what was open (no chunked-reveal pin needed — it inherits ResumeBrowser's).

## Out of scope

Android and remote browsers (S-phone). Cross-device offers (S-device). The pre-existing
findings the UX tester raised outside this feature (U4–U7).
