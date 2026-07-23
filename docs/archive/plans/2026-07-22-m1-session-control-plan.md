---
status: shipped
created: 2026-07-22
type: plan
program: docs/active/plans/2026-07-22-native-runtime-parity-program.md (§2 — Milestone M1)
---

# M1 Session Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native-session chat mechanics feel identical to Claude Code sessions — sends queue during a live turn with honest acks, a visible stop button works on both providers, PTY sends stop lying for native sessions, CC-only affordances hide, and the native timeline renders truthfully.

**Architecture:** A per-session FIFO queue lives in `NativeSessionHost` (main process), draining on `HarnessSession.send()` promise settle. `NATIVE_SEND` converts from fire-and-forget to invoke returning `{status, reason?}` on both desktop IPC and the remote WebSocket bridge. The renderer moves the optimistic user bubble behind the ack, fixes the bubble-attribution defect in `splitIntoBubbles`, and gains provider-aware guards.

**Tech Stack:** Electron IPC (`ipcMain.handle`/`ipcRenderer.invoke`), React renderer + chat reducer, Vitest (`npm test` in `youcoded/desktop`).

## Global Constraints

Copied from the program doc + `.claude/rules/` (all paths relative to the `youcoded` repo unless noted):

- **The native send string MUST equal `buildOutgoingMessage(...).content`** or the optimistic-bubble dedup fails (`native-runtime.md`; `native-send.ts:12-17`). Never alter how the send text is built.
- **`HarnessSession`'s emit surface is FROZEN** — no new `TranscriptEventType`s. Queue state never rides the transcript pipe.
- **`NativeSessionHost.send()` must never throw or reject** — callers include the remote server with no global rejection handler.
- **A permission ask PAUSES a turn, it does not end it** — `HarnessSession.send()`'s promise stays unsettled across an ask. The queue drains ONLY on `send()` settling (never on intermediate events), which satisfies this automatically.
- **Interrupt-vs-queue semantics (pinned, Destin 2026-07-22):** interrupt aborts the current turn only; the queue still drains.
- **IPC channel strings stay byte-identical** across `desktop/src/shared/types.ts`, `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts`, `app/.../SessionService.kt` (`ipc-bridge.md`; pinned by `desktop/tests/ipc-channels.test.ts`).
- **Return failures, don't throw them:** the main handler returns `{status:'failed', reason}` on both transports (desktop-throws vs remote-`{ok:false}` is a documented parity gap — don't widen it).
- **Reducer invariants** (`chat-reducer.md`): `pending`-flag dedup predicate (`pending === true && content ===`) must survive untouched; all turn-ending paths route through `endTurn()`; `TRANSCRIPT_TOOL_USE` stays idempotent by `toolUseId`.
- **Every button goes through `<Button>`** (`react-renderer.md`); render-path state reads use `useChatState(id)`, never `chatStateMapRef` in a component body.
- **User-facing failure copy follows `docs/error-message-standards.md`** (workspace) — specific and accurate, never a guessed cause.
- **Annotate non-trivial edits with a WHY comment** (Destin is a non-developer).
- Work in a git worktree on branch `feat/m1-session-control`; one PR to `youcoded` master at the end.

## File Structure

| File | Responsibility in this plan |
|---|---|
| `desktop/src/shared/types.ts` | `NativeSendResult` type (channel strings unchanged) |
| `desktop/src/main/harness/native-session-host.ts` | FIFO queue on `LiveEntry`, sync `send(): NativeSendResult`, drain loop |
| `desktop/src/main/ipc-handlers.ts` | `NATIVE_SEND` `on` → `handle` |
| `desktop/src/main/preload.ts` | `native.send` `send` → `invoke` |
| `desktop/src/renderer/remote-shim.ts` | `native:send` `fire` → `invoke` |
| `desktop/src/main/remote-server.ts` | `native:send` moves to the request/response block |
| `desktop/src/renderer/components/native-send.ts` | native branch returns the ack promise |
| `desktop/src/renderer/components/InputBar.tsx` | bubble-after-ack, queued flag, failure toast |
| `desktop/src/renderer/state/chat-reducer.ts` + `chat-types.ts` | `USER_PROMPT` queued variant (no turn-state resets) |
| `desktop/src/renderer/App.tsx` | honest `guardedPtySend`, hide `/sync` + `/config` for native |
| `desktop/src/renderer/state/pty-input-gate.ts` | new pure `canPtySend` helper (testable guard core) |
| `desktop/src/renderer/components/PreferencesPopup.tsx` | `showAdvanced` prop |
| `desktop/src/renderer/components/ChatView.tsx` | stop button beside `ThinkingIndicator` |
| `desktop/src/renderer/components/AssistantTurnBubble.tsx` | BUG A fix in `splitIntoBubbles` |
| Tests | `desktop/tests/native-session-host.test.ts`, `desktop/tests/ipc-channels.test.ts`, `desktop/src/renderer/state/__tests__/chat-reducer.test.ts`, `desktop/src/renderer/components/AssistantTurnBubble.test.tsx`, new `desktop/src/renderer/state/__tests__/pty-input-gate.test.ts` additions |
| `.claude/rules/native-runtime.md` (youcoded repo) | contract updates (send result shape, queue, invoke) |

Verified anchors (2026-07-22, master `79ac5802`): `native-session-host.ts:372-382` (send), `:50-58` (`LiveEntry`), `:384-392` (interrupt); `harness-session.ts:270-272` (re-entrancy throw), `:415-417` (finally clears `abort`); `ipc-handlers.ts:2077-2085`; `preload.ts:1112-1130`; `remote-shim.ts:1465-1478`; `remote-server.ts:1925-1943` (fire-and-forget block), `:761-767` (request/response pattern); `native-send.ts:19-35`; `InputBar.tsx:264-354`; `chat-reducer.ts:315-348` (`USER_PROMPT`), `:524-583` (`TRANSCRIPT_USER_MESSAGE`), `:635`/`:675` (`currentGroupId` resets); `App.tsx:510-524` (guard), `:2742-2747` (onRunSync), `:3012-3020` (onOpenAdvanced), `:2292-2318` (ESC handler); `ChatView.tsx:729-746`; `AssistantTurnBubble.tsx:182-251` (`splitIntoBubbles`), `:226-237` (defective branch).

---

### Task 1: Send queue + rich result in `NativeSessionHost`

**Files:**
- Modify: `desktop/src/shared/types.ts` (new type, near `SessionProvider` at `:35`)
- Modify: `desktop/src/main/harness/native-session-host.ts:50-58, 364-392`
- Test: `desktop/tests/native-session-host.test.ts`

**Interfaces:**
- Consumes: `HarnessSession.send(text): Promise<void>` (throws on re-entrancy; settles only after `turn-complete`/`session-error`/`user-interrupt` and `abort` cleared).
- Produces: `NativeSendResult = { status: 'sent'|'queued'|'failed'; reason?: 'not-live'|'queue-full' }`; `NativeSessionHost.send(sessionId, text): NativeSendResult` (now **synchronous** — 'sent' means the turn was dispatched, not completed; later turn failures surface as `session-error` transcript events, which the renderer already renders). Tasks 2–3 rely on these exact names.

- [ ] **Step 1: Write the failing tests** (append to `desktop/tests/native-session-host.test.ts`, reusing that file's existing `factory`/`delayedFactory` helpers):

```ts
describe('send queue (M1)', () => {
  it('send to an unknown session returns failed/not-live', async () => {
    expect(host.send('ghost', 'x')).toEqual({ status: 'failed', reason: 'not-live' });
  });

  it('overlapping send queues FIFO and both turns complete in order', async () => {
    // delayedFactory: first turn streams slowly so the second send arrives mid-turn
    const events: string[] = [];
    host.on('transcript-event', (e) => { if (e.type === 'user-message') events.push(e.data.text); });
    const r1 = host.send(id, 'first');
    const r2 = host.send(id, 'second');
    expect(r1).toEqual({ status: 'sent' });
    expect(r2).toEqual({ status: 'queued' });
    await waitForTurnComplete(2); // helper: resolve after N turn-complete events
    expect(events).toEqual(['first', 'second']); // user-message for 'second' fires only when drained
  });

  it('refuses honestly past the queue cap', () => {
    host.send(id, 'turn'); // in flight
    for (let i = 0; i < 10; i++) expect(host.send(id, `q${i}`).status).toBe('queued');
    expect(host.send(id, 'overflow')).toEqual({ status: 'failed', reason: 'queue-full' });
  });

  it('interrupt aborts the current turn only — the queue still drains (pinned semantics)', async () => {
    host.send(id, 'long');           // delayedFactory turn
    host.send(id, 'queued-survivor');
    host.interrupt(id);
    await waitForTurnComplete(1);    // survivor's turn
    // transcript contains user-interrupt for turn 1, then user-message 'queued-survivor'
  });

  it('a failed turn (factory throw) does not strand the queue', async () => {
    // throwOnceFactory: first turn's factory throws (session-error), second succeeds
    host.send(id, 'doomed');
    host.send(id, 'after-error');
    await waitForTurnComplete(1);
    // 'after-error' produced a turn-complete despite turn 1 erroring
  });

  it('destroy mid-turn drops queued sends without unhandled rejection', async () => {
    host.send(id, 'long');
    host.send(id, 'never-sent');
    await host.destroy(id);
    // no throw, no user-message for 'never-sent'
  });
});
```

Write `waitForTurnComplete` and `throwOnceFactory` as local helpers in the test file (mirror the existing `delayedFactory` shape at `:42-54`).

- [ ] **Step 2: Run to verify failure** — `cd desktop && npx vitest run tests/native-session-host.test.ts`. Expected: FAIL (`send` returns a Promise<boolean> today, `.toEqual({status:...})` mismatches).

- [ ] **Step 3: Implement.** In `desktop/src/shared/types.ts` next to `SessionProvider`:

```ts
// M1: ack shape for native:send — 'sent' = turn dispatched now, 'queued' = FIFO'd
// behind the in-flight turn, 'failed' = refused (reason says why, exactly).
export type NativeSendResult =
  | { status: 'sent' | 'queued' }
  | { status: 'failed'; reason: 'not-live' | 'queue-full' };
```

In `native-session-host.ts` — extend `LiveEntry` and replace `send` (keep the existing doc comment, updated):

```ts
const SEND_QUEUE_LIMIT = 10; // bounded per program §2.1 — refuse honestly past this

interface LiveEntry {
  session: HarnessSession;
  cwd: string;
  appendChain: Promise<void>;
  // M1 send queue: FIFO of user messages that arrived while a turn was in
  // flight. Drained one at a time by runTurns; dropped with the entry on destroy.
  queue: string[];
  // True from dispatch until runTurns finishes the last queued turn. Host-owned
  // (HarnessSession's in-flight state is private); safe because Node is single-threaded.
  inFlight: boolean;
}

send(sessionId: string, text: string): NativeSendResult {
  const entry = this.live.get(sessionId);
  if (!entry) return { status: 'failed', reason: 'not-live' };
  if (entry.inFlight) {
    if (entry.queue.length >= SEND_QUEUE_LIMIT) return { status: 'failed', reason: 'queue-full' };
    entry.queue.push(text);
    return { status: 'queued' };
  }
  entry.inFlight = true;
  // Fire the turn loop without awaiting: 'sent' means dispatched. Turn failures
  // surface as session-error transcript events, not through this return value.
  void this.runTurns(sessionId, entry, text);
  return { status: 'sent' };
}

// Runs the dispatched turn, then drains the queue turn-by-turn. send() settling
// is the ONLY drain trigger — it settles strictly after turn-complete /
// session-error / user-interrupt, and stays unsettled across a permission ask
// (an ask pauses the turn; draining on it would hard-throw re-entrancy).
private async runTurns(sessionId: string, entry: LiveEntry, first: string): Promise<void> {
  let next: string | undefined = first;
  while (next !== undefined) {
    try {
      await entry.session.send(next);
    } catch (err) {
      log('ERROR', 'NativeSessionHost', 'send failed', { sessionId, error: String(err) });
    }
    // Destroy() may have removed/replaced the entry mid-turn — stop draining then.
    if (this.live.get(sessionId) !== entry) return;
    next = entry.queue.shift();
  }
  entry.inFlight = false;
}
```

Update the `wire()` entry literal (`:236`) to `{ session, cwd, appendChain: Promise.resolve(), queue: [], inFlight: false }`. Do NOT change `interrupt()` — the pinned semantics (queue survives interrupt) fall out of `runTurns` continuing after the interrupted `send()` settles.

- [ ] **Step 4: Fix the two pre-existing assertions** in `native-session-host.test.ts` that pin the old contract: `'send to an unknown session returns false'` (`:105`) and `'overlapping send() does not reject: second resolves false'` (`:109`) — the new Step-1 tests replace their intent; update them to the `NativeSendResult` shape (or delete if fully superseded, keeping coverage).

- [ ] **Step 5: Run** `npx vitest run tests/native-session-host.test.ts` — Expected: PASS. Also `npx vitest run tests/harness-session.test.ts` (untouched, must stay green).

- [ ] **Step 6: Commit** — `feat(native): per-session FIFO send queue with honest sent/queued/failed results`

### Task 2: `NATIVE_SEND` fire-and-forget → invoke (desktop + remote)

**Files:**
- Modify: `desktop/src/main/ipc-handlers.ts:2080-2082`, `desktop/src/main/preload.ts:1115`, `desktop/src/renderer/remote-shim.ts:1469`, `desktop/src/main/remote-server.ts:1929-1935` (+ new case near `:761`)
- Test: `desktop/tests/ipc-channels.test.ts:675-714`

**Interfaces:**
- Consumes: `nativeHost.send(sessionId, text): NativeSendResult` (Task 1).
- Produces: `window.claude.native.send(sessionId, text): Promise<NativeSendResult>` on BOTH preload and remote-shim (identical shape — Task 3 relies on it). Channel string `'native:send'` unchanged everywhere.

- [ ] **Step 1: Add the failing convention test** — in `ipc-channels.test.ts`'s `native:*/provider:* channel parity` block, mirror the existing `native:get-permission-mode` remote-server assertion (`:710-713`) for `native:send`:

```ts
it('native:send is answered by remote-server (request/response, not fire-and-forget)', () => {
  const src = read('src/main/remote-server.ts');
  const caseBlock = src.slice(src.indexOf(`case 'native:send'`));
  expect(caseBlock.slice(0, 400)).toContain('this.respond(');
});
```

- [ ] **Step 2: Run** `npx vitest run tests/ipc-channels.test.ts` — Expected: FAIL (`native:send` sits in the fire-and-forget block with no `respond`).

- [ ] **Step 3: Implement all four surfaces.**

`ipc-handlers.ts` (replace the `ipcMain.on` at `:2080-2082`; leave `NATIVE_INTERRUPT` as `on`):
```ts
// M1: invoke — returns {status:'sent'|'queued'|'failed', reason?} so the renderer
// can render truthful bubbles. send() is sync and never throws (host contract).
ipcMain.handle(IPC.NATIVE_SEND, (_e, { sessionId, text }: { sessionId: string; text: string }) =>
  nativeHost.send(sessionId, text));
```

`preload.ts:1115` (keep the `{sessionId, text}` object shape — the handler destructures it):
```ts
send: (sessionId: string, text: string) => ipcRenderer.invoke(IPC.NATIVE_SEND, { sessionId, text }),
```

`remote-shim.ts:1469`:
```ts
send: (sessionId: string, text: string) => invoke('native:send', { sessionId, text }),
```

`remote-server.ts` — DELETE the `case 'native:send'` from the fire-and-forget block (`:1929-1935`) and add to the request/response block (beside `native:get-permission-mode` at `:761`):
```ts
case 'native:send': {
  // M1: mirrors the desktop invoke — return the result, never throw, so desktop
  // and remote agree on failure shape (see native-runtime rule on transport parity).
  const result = this.nativeRuntime
    ? this.nativeRuntime.nativeHost.send(payload.sessionId, payload.text)
    : { status: 'failed', reason: 'not-live' };
  this.respond(client.ws, type, id, result);
  break;
}
```

- [ ] **Step 4: Run** `npx vitest run tests/ipc-channels.test.ts` — Expected: PASS (channel strings unchanged, new assertion satisfied). No Android change: the SessionService stub replies `not-implemented-on-mobile` to id-carrying messages, and remote/Android renderers have `native.supported === false` so never call this.

- [ ] **Step 5: Commit** — `feat(ipc): native:send returns {status,reason} over desktop IPC and remote WS`

### Task 3: Bubble-after-ack in the renderer (queued bubbles, failure toast, BUG C)

**Files:**
- Modify: `desktop/src/renderer/components/native-send.ts:19-35`, `desktop/src/renderer/components/InputBar.tsx:264-354`, `desktop/src/renderer/state/chat-types.ts:110-116`, `desktop/src/renderer/state/chat-reducer.ts:315-348, 524-583`
- Test: `desktop/src/renderer/state/__tests__/chat-reducer.test.ts`

**Interfaces:**
- Consumes: `window.claude.native.send → Promise<NativeSendResult>` (Task 2); reducer `USER_PROMPT` / `TRANSCRIPT_USER_MESSAGE`.
- Produces: `USER_PROMPT` action gains optional `queued?: boolean`; user `TimelineEntry` gains optional `queued?: boolean`; `sendChatMessage` native branch returns `Promise<NativeSendResult>`.

- [ ] **Step 1: Write the failing reducer tests** (in `chat-reducer.test.ts`):

```ts
it('queued USER_PROMPT does not reset the streaming turn (BUG C pin)', () => {
  // seed: a native turn is streaming (currentTurnId set via TRANSCRIPT_ASSISTANT_TEXT)
  let s = withStreamingTurn(); // helper: state with currentTurnId 't1', currentGroupId 'g1', isThinking true
  s = chatReducer(s, { type: 'USER_PROMPT', sessionId: SID, content: 'next msg', timestamp: 1, queued: true });
  const sess = s.get(SID)!;
  expect(sess.currentTurnId).toBe('t1');       // NOT nulled — later deltas keep merging into the live turn
  expect(sess.currentGroupId).toBe('g1');      // NOT nulled — tool grouping unaffected
  const entry = sess.timeline.at(-1)!;
  expect(entry).toMatchObject({ kind: 'user', pending: true, queued: true });
});

it('TRANSCRIPT_USER_MESSAGE confirms a queued bubble and clears the queued flag', () => {
  let s = withQueuedBubble('next msg');
  s = chatReducer(s, { type: 'TRANSCRIPT_USER_MESSAGE', sessionId: SID, text: 'next msg', timestamp: 2 });
  const entry = s.get(SID)!.timeline.find((e) => e.kind === 'user' && e.message.content === 'next msg')!;
  expect(entry.pending).toBe(false);
  expect((entry as any).queued).toBeUndefined();
});
```

(Write `withStreamingTurn`/`withQueuedBubble` helpers in the test file from the existing test setup patterns at `:177-213`.)

- [ ] **Step 2: Run** `npx vitest run src/renderer/state/__tests__/chat-reducer.test.ts` — Expected: FAIL (`queued` unknown; `USER_PROMPT` always nulls `currentTurnId`).

- [ ] **Step 3: Implement reducer + types.** `chat-types.ts` user entry: add `queued?: boolean` beside `pending?: boolean`. `chat-reducer.ts` `USER_PROMPT` (`:315-348`) — branch on `action.queued`:

```ts
// M1: a QUEUED send must not disturb the still-streaming prior turn — appending
// the bubble is fine (the open turn entry keeps merging in place), but nulling
// currentTurnId/currentGroupId here would fork the live turn (see BUG C in the
// M1 plan). isThinking is already true while a turn streams.
if (action.queued) {
  return update(state, action.sessionId, (session) => ({
    ...session,
    timeline: [...session.timeline, { kind: 'user', message, pending: true, queued: true }],
  }));
}
// non-queued path: existing behavior (append pending bubble, isThinking:true,
// currentGroupId/currentTurnId reset) — unchanged
```

`TRANSCRIPT_USER_MESSAGE` confirm-side rebuild (`:552-570`): when rebuilding the confirmed entry with `pending: false`, also drop `queued` (omit the key). The dedup predicate (`entry.pending === true && entry.message.content === action.text`) is untouched — queued bubbles are `pending: true`, so they dedup exactly like today's optimistic ones.

- [ ] **Step 4: Run the reducer tests** — Expected: PASS, including the pre-existing dedup tests at `:196-213` (they must stay green — the predicate is unchanged).

- [ ] **Step 5: Rewire InputBar.** In `sendMessage` (`InputBar.tsx:264-354`): move the `USER_PROMPT` dispatch (`:335-344`) so the CC path keeps dispatching before send (unchanged), and the native branch (`:351-354`) becomes:

```ts
if (provider === 'native') {
  // M1: bubble AFTER the ack — the bubble appears when the message is actually
  // sent (or queued), and a refused send shows a toast instead of a phantom bubble.
  void (async () => {
    const result = await sendChatMessage('native', sessionId, outgoing.ptyText, files.map((f) => f.path));
    if (!result || result.status === 'failed') {
      showToast(sendFailureCopy(result));
      return;
    }
    dispatch({
      type: 'USER_PROMPT', sessionId, content: outgoing.content,
      timestamp: Date.now(), attachments: files.map((f) => f.path),
      queued: result.status === 'queued',
    });
  })();
  return true;
}
```

with, in the same file (copy follows `docs/error-message-standards.md` — each reason maps to its real cause, no guessing):

```ts
function sendFailureCopy(result: NativeSendResult | undefined): string {
  if (result?.status === 'failed' && result.reason === 'queue-full') {
    return 'Send queue is full (10 messages waiting). Wait for the current turn to finish.';
  }
  if (result?.status === 'failed' && result.reason === 'not-live') {
    return 'This session is no longer running. Start or resume it to send messages.';
  }
  return 'The message could not be sent — no response from the session host.';
}
```

`native-send.ts` native branch: `return window.claude.native.send(sessionId, text) as Promise<NativeSendResult>;` (function return type becomes `Promise<NativeSendResult> | void`; CC path still returns nothing). Reuse InputBar's existing toast mechanism (the one used at `:312-315` for the native `alsoSendToPty` toast) as `showToast`.

- [ ] **Step 6: Queued badge.** Locate the user-bubble render (`grep -rn "pending" desktop/src/renderer/components/BubbleFeed.tsx desktop/src/renderer/components/ChatView.tsx` — the component that renders `kind === 'user'` entries; pending bubbles likely already render dimmed). Add a small "Queued" label when `entry.queued && entry.pending` (muted text, no new colors — theme tokens only per `react-renderer.md`).

- [ ] **Step 7: Full renderer test run** — `npx vitest run src/renderer` — Expected: PASS.

- [ ] **Step 8: Commit** — `feat(renderer): native bubbles appear on send ack — queued marker, honest failure toast`

### Task 4: Honest `guardedPtySend`

**Files:**
- Modify: `desktop/src/renderer/state/pty-input-gate.ts` (new pure helper), `desktop/src/renderer/App.tsx:510-524`
- Test: `desktop/src/renderer/state/__tests__/pty-input-gate.test.ts` (extend the existing test file for that module; create if absent)

**Interfaces:**
- Produces: `canPtySend(session: { provider?: string } | undefined, chat: { attentionState?: string } | undefined): boolean` in `pty-input-gate.ts` — pure, exported. `guardedPtySend` composes it with the existing `notifyIfPtyBlocked`.

- [ ] **Step 1: Failing tests:**

```ts
describe('canPtySend (M1 honest guard)', () => {
  it('refuses when the session does not exist', () => expect(canPtySend(undefined, undefined)).toBe(false));
  it('refuses native sessions — they have no PTY worker', () =>
    expect(canPtySend({ provider: 'native' }, { attentionState: 'ok' })).toBe(false));
  it('refuses dead sessions', () =>
    expect(canPtySend({ provider: 'claude' }, { attentionState: 'session-died' })).toBe(false));
  it('allows a live claude session', () =>
    expect(canPtySend({ provider: 'claude' }, { attentionState: 'ok' })).toBe(true));
  it('allows when chat state has not materialized yet (boot window)', () =>
    expect(canPtySend({ provider: 'claude' }, undefined)).toBe(true));
});
```

- [ ] **Step 2: Run** — Expected: FAIL (no export).

- [ ] **Step 3: Implement** in `pty-input-gate.ts`:

```ts
// M1: PTY sends must only reach Claude Code sessions that still exist — for a
// native or destroyed session, SessionManager.sendInput no-ops, so callers that
// trusted guardedPtySend's `true` wrote phantom bubbles (program doc §2.3).
export function canPtySend(
  session: { provider?: string } | undefined,
  chat: { attentionState?: string } | undefined,
): boolean {
  if (!session) return false;
  if (session.provider === 'native') return false;
  if (chat?.attentionState === 'session-died') return false;
  return true;
}
```

And in `App.tsx:520-524`:

```ts
const guardedPtySend = useCallback((sid: string, text: string): boolean => {
  // Honest guard (M1): refuse before sending, so callers' `if (!guardedPtySend)`
  // bails actually fire for native/destroyed sessions and skip optimistic writes.
  if (!canPtySend(sessionsRef.current.find((x) => x.id === sid), chatStateMapRef.current.get(sid))) return false;
  if (notifyIfPtyBlocked(sid)) return false;
  window.claude.session.sendInput(sid, text);
  return true;
}, [notifyIfPtyBlocked]);
```

(`sessionsRef`/`chatStateMapRef` are refs — no dependency-array change.) Import `canPtySend` alongside the existing `hasPendingInteraction` import at `App.tsx:37`.

No call-site edits needed: the six gated sites (`:1792, :2003, :2059, :2745, :3030, :3045`) already skip their optimistic writes on `false`; the fire-and-forget sites (`:1991, :2044, :2782, :2961`) become clean no-ops for native (previously dead `sendInput` calls). The `/config` site (`:3012-3020`) is removed for native in Task 5.

- [ ] **Step 4: Run** `npx vitest run src/renderer/state` then the full suite `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** — `fix(renderer): guardedPtySend refuses native/destroyed sessions — ends phantom bubbles`

### Task 5: Hide genuinely-CC-only affordances for native

**Files:**
- Modify: `desktop/src/renderer/App.tsx:2742-2747, 3012-3020` (+ the `PreferencesPopup` render site ~`:3010`), `desktop/src/renderer/components/PreferencesPopup.tsx:20-24, 246-260`

**Interfaces:**
- Consumes: `isNativeSession` (already computed at `App.tsx:2349`) / `currentSession?.provider` (in scope at the popup render site, used at `:3046`).
- Produces: `PreferencesPopup` prop `showAdvanced?: boolean` (default `true`).

- [ ] **Step 1: StatusBar `/sync`** — wire `onRunSync` to `undefined` for native (the sync-warnings pill already handles a falsy handler; primary click is `onOpenSync`, which stays — sync settings are app-level, only the `/sync` PTY command is CC-only):

```ts
onRunSync={!trustGateActive && sessionId && !isNativeSession ? () => { ... existing body ... } : undefined}
```

- [ ] **Step 2: Preferences `/config`** — `PreferencesPopup.tsx`: add `showAdvanced?: boolean` to Props; wrap the Advanced button block (`:246-260`) in `{showAdvanced !== false && ( ... )}` with a WHY comment ("/config drives Claude Code's own terminal config UI — native sessions have no such surface, ever (program §2.5)"). In App.tsx pass `showAdvanced={currentSession?.provider !== 'native'}`.

- [ ] **Step 3: Manual check via sandbox/dev instance is NOT required here** — DOM-level assertion is enough: run `npm test`; if a PreferencesPopup test file exists, add a render test asserting the Advanced button absent when `showAdvanced={false}`.

- [ ] **Step 4: Commit** — `fix(renderer): hide /sync and /config affordances for native sessions — they control Claude Code itself`

### Task 6: Visible stop button (both providers)

**Files:**
- Modify: `desktop/src/renderer/components/ChatView.tsx:729-746` (+ its props if `provider` needs threading — it already receives `provider` at `:85`)

**Interfaces:**
- Consumes: `state.isThinking`, `state.attentionState` (via the `useChatState(sessionId)` already at `ChatView.tsx:86`); `window.claude.native.interrupt` / `window.claude.session.sendInput(sid, '\x1b')` (the ESC-handler pattern at `App.tsx:2302-2312`).

- [ ] **Step 1: Implement** — beside the `<ThinkingIndicator>` render (`ChatView.tsx:737-746`):

```tsx
{thinkingArea && state.attentionState === 'ok' && (
  <Button
    size="icon"
    aria-label="Stop generating"
    onClick={() => {
      // Same split as the ESC handler (App.tsx:2302-2312): native has no PTY,
      // so interrupt the harness stream; CC treats a single ESC byte as interrupt.
      if (provider === 'native') window.claude.native.interrupt(sessionId);
      else window.claude.session.sendInput(sessionId, '\x1b');
    }}
    className="shrink-0"
  >
    {/* square stop glyph, currentColor */}
  </Button>
)}
```

Render it in the same flex row as the ThinkingIndicator; `<Button>` primitive only, theme tokens only, no new colors. This gives touch/phone-remote users their first interrupt affordance (ESC-only today).

- [ ] **Step 2: Test** — if ChatView has a test file, add: renders the stop button when `isThinking && attentionState==='ok'`, hides it otherwise; clicking with `provider='native'` calls `native.interrupt` (mock `window.claude`). Otherwise cover via a new small test file.

- [ ] **Step 3: FLAG FOR DESTIN (per program §2.4 and the CLAUDE.md verification rule):** placement/size/glyph is his eyeball call. Note in the PR: "stop button placement = beside the thinking indicator; Destin to eyeball in `bash scripts/run-dev.sh` and move if wanted." Do NOT build a CDP rig for this.

- [ ] **Step 4: Commit** — `feat(renderer): visible stop button during streaming turns, both providers`

### Task 7: BUG A — tool cards attach to the wrong bubble

**Files:**
- Modify: `desktop/src/renderer/components/AssistantTurnBubble.tsx:226-237` (`splitIntoBubbles`)
- Test: `desktop/src/renderer/components/AssistantTurnBubble.test.tsx`

Root cause (verified 2026-07-22 against master): reasoning parts stream live but tool-use events are batched after each step's stream (`harness-session.ts:348-350`), so a multi-step native turn produces segments like `[text₁, toolGroupA, reasoning₂, toolGroupB]`. In `splitIntoBubbles`, the tool-group branch (`:228` `if (!current)`) only opens a new bubble when NO bubble is open — with `text₁`'s bubble still open it pushes `toolGroupB` onto it (`:236`) and strands `reasoning₂` into a trailing bubble. The reducer's segment order is correct; this is purely a view-layer split defect.

- [ ] **Step 1: Failing test** (in `AssistantTurnBubble.test.tsx`, exporting `splitIntoBubbles` from the module if not already exported):

```ts
it('a tool group after interleaved reasoning starts a NEW bubble carrying that reasoning (BUG A pin)', () => {
  const segments = [
    seg.text('t1', 'Let me look'),          // step 1 text
    seg.toolGroup('A'),                      // step 1 tool (batched after stream)
    seg.reasoning('r1', 'thinking about B'), // step 2 reasoning
    seg.toolGroup('B'),                      // step 2 tool
  ];
  const bubbles = splitIntoBubbles(segments);
  expect(bubbles).toHaveLength(2);
  expect(bubbles[0].toolGroupIds).toEqual(['A']);   // B must NOT land here
  expect(bubbles[1].toolGroupIds).toEqual(['B']);
  expect(bubbles[1]).toHaveReasoning('thinking about B'); // reasoning attached to ITS tool's bubble, not trailing
});
```

Build the `seg.*` fixture helpers to match the real segment shapes used by `splitIntoBubbles` (read the type doc at `AssistantTurnBubble.tsx:170-180` when writing them; the design intent "reasoning attaches to the next bubble" is stated there).

- [ ] **Step 2: Run** — Expected: FAIL — one bubble gets `['A','B']` and the reasoning trails.

- [ ] **Step 3: Fix the branch** at `:226-237` — a tool group must start a new bubble not only when no bubble is open, but also when reasoning has streamed since the open bubble began:

```ts
} else {
  // Tool-group segment. Fix (M1 BUG A): if reasoning streamed since `current`
  // opened, this tool belongs to a NEW bubble that carries that reasoning —
  // appending it to the prior text bubble mis-attributes the card (the exact
  // dogfood bug: tool calls landing on the previous message).
  if (!current || pendingReasoning) {
    if (current) bubbles.push(current);
    current = makeBubble({ reasoning: pendingReasoning, toolGroupIds: [seg.groupId] });
    pendingReasoning = null;
  } else {
    current.toolGroupIds.push(seg.groupId);
  }
}
```

(Adapt `makeBubble` to however the existing `!current` arm at `:228-235` constructs its bubble — reuse that construction verbatim so the two arms cannot drift.)

- [ ] **Step 4: Run** the file's full test suite (`Skill extraction` + memo comparator tests must stay green) — Expected: PASS.

- [ ] **Step 5: Commit** — `fix(renderer): tool groups after interleaved reasoning open a new bubble (mis-attribution bug)`

### Task 8: BUG B — pin tool-group collapse semantics; heartbeat guard

**Files:**
- Test: `desktop/src/renderer/state/__tests__/chat-reducer.test.ts`
- Possibly modify: `desktop/src/renderer/state/chat-reducer.ts` (heartbeat handler only)

The mechanism (verified): collapse is per tool-group; group membership breaks whenever `currentGroupId` resets. Text deltas (`:635`) and reasoning deltas (`:675`) reset it — the reasoning reset is arguably CORRECT bubble semantics after Task 7 (a tool following its own reasoning renders under that reasoning, not merged into the previous group). So do NOT change `:675` in this plan. What must be pinned, and the one plausible spurious-split source to check:

- [ ] **Step 1: Pinning tests** for intended grouping semantics:

```ts
it('tools batched in one step share a group (collapse works)', () => {
  // TOOL_USE x3 with no text/reasoning between → one group id across all three
});
it('a reasoning delta between tools starts a new group (intended bubble semantics)', () => {
  // TOOL_USE, REASONING delta, TOOL_USE → two distinct group ids
});
it('a thinking HEARTBEAT between tools does NOT split the group (spurious-split guard)', () => {
  // TOOL_USE, TRANSCRIPT_THINKING_HEARTBEAT, TOOL_USE → ONE group id.
  // Heartbeats (empty assistant-thinking, incl. stall warnings) carry no content
  // and must never break collapse grouping.
});
```

- [ ] **Step 2: Run.** If the heartbeat test FAILS, fix `TRANSCRIPT_THINKING_HEARTBEAT` in `chat-reducer.ts` to leave `currentGroupId`/`currentTurnId` untouched (WHY comment: heartbeats are liveness signals, not content — resetting grouping on them splits collapse randomly, which matches the "inconsistent" dogfood report). If it PASSES, the reducer is correct and BUG B's remaining symptom is expected to be Task 7's mis-attribution — note that in the PR.

- [ ] **Step 3: Hand the residual to Destin:** after this branch ships, he re-dogfoods collapse behavior. If cards still fail to collapse when they should, that's a NEW repro against a now-pinned baseline → systematic-debugging with real evidence, not this plan.

- [ ] **Step 4: Commit** — `test(reducer): pin tool-group collapse semantics; heartbeats must not split groups` (+ fix if Step 2 found one)

### Task 9: Rule updates + full verification + PR

**Files:**
- Modify: `youcoded/.claude/rules/native-runtime.md` (the repo-local rule, NOT the workspace one)

- [ ] **Step 1: Update the three stale invariant lines** in `native-runtime.md` (keep additions minimal — the rule is already over word budget; M6.1 owns the trim):
  - "`NativeSessionHost.send()` never throws" → still true; now returns `NativeSendResult` synchronously ('sent' = dispatched; turn failures arrive as `session-error` events).
  - "`native:send` is fire-and-forget (no msg.id) on desktop" → now an invoke on all transports, same result shape on desktop and remote (no throw-vs-`{ok:false}` divergence).
  - Add one line: "Send queue: per-session FIFO (cap 10) in the host, drains ONLY on `send()` settle; interrupt aborts the current turn only — the queue still drains (pinned: `native-session-host.test.ts` M1 block)."

- [ ] **Step 2: Full verification** (superpowers:verification-before-completion — run these and read the output before claiming green):

```bash
cd desktop && npm test          # full suite
npm run build                   # type-check + bundle
```

- [ ] **Step 3: Runtime smoke** — `bash scripts/run-dev.sh` (workspace root): in a native session, send two messages back-to-back (second shows Queued, then confirms), press stop mid-turn (turn ends, queued message still sends), check a multi-step tool turn attributes cards correctly. Shut the dev instance down afterward per the workspace rule.

- [ ] **Step 4: PR** to `itsdestin/youcoded` master from `feat/m1-session-control`, body listing the six M1 items + the Destin-eyeball note for stop-button placement. After merge: archive this plan per the workspace document lifecycle and flip program §2 status in the same session.

### Task 10: Move the stop button into the input bar (Destin feedback, 2026-07-22)

Destin's ruling on Task 6's placement: the stop control belongs **inside the chat input area, immediately left of the send button** — not beside the thinking indicator.

**Files:**
- Modify: `desktop/src/renderer/components/InputBar.tsx` (render `<StopButton>` left of the send button in the composer form), `desktop/src/renderer/components/ChatView.tsx` (remove both `<StopButton>` render sites and now-unused imports/wrappers)
- Test: extend `desktop/src/renderer/components/InputBar.test.tsx` (stop visible while thinking, hidden when idle, click calls the right IPC per provider); `StopButton.test.tsx` unchanged (component behavior identical)

**Interfaces:**
- Consumes: the existing `StopButton` component as-is; `useChatState(sessionId)` (the cached per-session selector — the react-renderer rule requires it over map reads in render).
- Visibility predicate: `state.isThinking && state.attentionState === 'ok'` — same gate as before, now evaluated in InputBar. InputBar renders for both providers; the button must too (CC path sends the ESC byte).
- The send button itself stays fully functional while streaming (sending queues — that's the point of M1); stop appears BESIDE it, `shrink-0`, same `size="icon"` scale.

- [ ] Steps: failing InputBar test (stop hidden idle / visible thinking / click→interrupt) → RED → move the render site → GREEN → full suite + tsc → commit `feat(renderer): stop button moves into the input bar, left of send (Destin placement ruling)`.

### Task 11: Cancel/edit queued messages (Destin feedback, 2026-07-22)

A queued message must be cancelable and editable before it sends. Design: **edit = cancel + refill the input box** (no in-place editing).

**Files:**
- Modify: `desktop/src/shared/types.ts` (queued ack gains `queueId`; new channel const `NATIVE_QUEUE_REMOVE: 'native:queue-remove'`), `desktop/src/main/harness/native-session-host.ts` (queue holds `{id, text}`; `removeQueued`), `desktop/src/main/ipc-handlers.ts`, `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts`, `desktop/src/main/remote-server.ts` (fourth transport), `app/…/SessionService.kt` (stub string only, matching the existing `native:*` stub list), `desktop/tests/ipc-channels.test.ts` (parity pins for the new channel), `desktop/src/renderer/state/chat-types.ts` + `chat-reducer.ts` (`queueId` on the queued user entry; `QUEUED_PROMPT_CANCELED` action), `desktop/src/renderer/components/UserMessage.tsx` (Cancel/Edit affordances on queued bubbles), InputBar/App wiring for the edit-refill path.
- Test: `desktop/tests/native-session-host.test.ts` (removeQueued semantics incl. races), reducer tests (cancel action), UserMessage or InputBar test for the affordances.

**Interfaces:**
- `NativeSendResult` queued arm becomes `{ status: 'queued'; queueId: string }` (host mints `randomUUID()` per enqueue). `'sent'`/`'failed'` arms unchanged.
- `NativeSessionHost.removeQueued(sessionId: string, queueId: string): boolean` — sync; false when the session isn't live or the id is no longer queued (already draining/sent). Never throws.
- New invoke `native:queue-remove` `{sessionId, queueId}` → `boolean`, all four transports (remote mirrors desktop; SessionService keeps the shared not-implemented stub — add the literal to the stub's `when` list so the parity test holds).
- Reducer: queued `USER_PROMPT` stores `queueId`; `QUEUED_PROMPT_CANCELED {sessionId, queueId}` removes the matching `pending && queued` entry (no-op if already confirmed — the race where the drain won); `TRANSCRIPT_USER_MESSAGE` confirm drops `queueId` with the other queued fields.
- UI: on a queued bubble, two small `<Button size="icon">` affordances (Cancel ✕, Edit ✎ — theme tokens, `aria-label`s). Cancel: invoke remove → on `true` dispatch `QUEUED_PROMPT_CANCELED`; on `false` toast "Already sending — too late to cancel." Edit: invoke remove → on `true` dispatch the cancel action AND put the text into the input box; if the input currently has a non-empty draft, refuse with a toast ("Finish or clear your current draft first, then edit the queued message.") BEFORE removing from the queue (never destroy the queued message when the refill can't land); on `false` same too-late toast. For the refill mechanism, follow whatever existing idiom lets external surfaces inject input-bar text (search for how quick chips/compose flows set drafts); if none exists, lift a `draftInjection` state to the InputBar's parent and note it in the report.
- Race invariant: `removeQueued` must be checked-and-removed atomically in the host (single-threaded sync method — a simple `findIndex`+`splice` suffices); the drain loop must re-check the queue only via `shift()` so a removed entry can never send.

- [ ] Steps: host tests (remove queued mid-queue; remove already-drained id → false; remove on dead session → false; canceled entry never emits user-message) → RED → host impl → IPC surfaces + parity pins → reducer tests (cancel removes only pending+queued match; confirm still clears) → RED → reducer impl → UI affordances + refill wiring → full suite + tsc → commit `feat(native): cancel and edit queued messages before they send`.

### Task 12: Queued messages leave the timeline — docked strip + true-position confirm (Destin feedback, 2026-07-22)

**Destin's ruling:** a queued message must (a) render "tied to the bottom of the chat window" while waiting — NOT as a timeline entry — and (b) enter the timeline only at the point it actually reached the assistant. The Task 3 design (queued `USER_PROMPT` appended at enqueue time, confirmed in place) is wrong: the prior turn's entry is created lazily on its first streamed delta, so content arriving after the enqueue renders BELOW the queued bubble, and the in-place confirm freezes that position ("assistant responding to itself").

**Files:**
- Modify: `desktop/src/renderer/state/chat-types.ts` + `chat-reducer.ts` (replace the timeline-based queued mechanics with a per-session `queuedMessages` list), `desktop/src/renderer/components/InputBar.tsx` (queued ack → list action, not `USER_PROMPT`), `desktop/src/renderer/components/UserMessage.tsx` (remove the now-dead queued badge + affordances), `desktop/src/renderer/components/ChatView.tsx` (render the docked strip), new `desktop/src/renderer/components/QueuedMessagesStrip.tsx`, App.tsx wiring (move the cancel/edit handlers to the strip).
- Host/IPC: NO changes — the queue, `queueId`, and `native:queue-remove` are already correct.
- Test: reducer tests (replace Task 3's queued-variant pins with list pins + a true-position pin), a `QueuedMessagesStrip` component test (reuse the UserMessage affordance test's mocking), InputBar test updates.

**Interfaces:**
- `SessionChatState` gains `queuedMessages: Array<{ queueId: string; content: string; timestamp: number }>` (content = the same display string the bubble showed). New actions: `QUEUED_MESSAGE_ADDED {sessionId, queueId, content, timestamp}`, `QUEUED_MESSAGE_REMOVED {sessionId, queueId}` (replaces `QUEUED_PROMPT_CANCELED`). Neither touches timeline or turn state.
- On a `queued` ack, InputBar dispatches `QUEUED_MESSAGE_ADDED` (no timeline entry). On a `sent` ack, behavior is unchanged (optimistic pending bubble + exact-content confirm — nothing is streaming, so its position is correct).
- **Drain-side removal:** when the queue drains, the host emits the frozen `user-message` transcript event (no queueId — the emit surface must not change). In `TRANSCRIPT_USER_MESSAGE`, when no pending timeline bubble matches (the queued case — there is no bubble anymore), the existing fallback already appends a confirmed entry at the END — the true position; additionally remove the OLDEST `queuedMessages` entry whose `content === action.text` (the same oldest-content discipline as the bubble dedup). The frozen pending-bubble dedup predicate for `sent` messages is untouched.
- Timeline entry type: remove `queued`/`queueId` from the user entry (no writer remains); confirm-side rebuild no longer drops them. The `USER_PROMPT` queued variant is deleted (no caller).
- UI: `QueuedMessagesStrip` renders the active session's `queuedMessages` docked at the BOTTOM of the chat area (below the timeline/thinking row, above the InputBar — visually tied to the input), each row: truncated content, "Queued" label, ✕ Cancel and ✎ Edit `<Button size="icon">` affordances reusing the exact Task 11 handlers (invoke `native:queue-remove` → on `true` dispatch `QUEUED_MESSAGE_REMOVED` (+ `fillDraft` for edit, same non-empty-draft refusal BEFORE removal); on `false` the too-late toast — and on the too-late path also dispatch `QUEUED_MESSAGE_REMOVED` so the strip row doesn't linger next to its just-confirmed timeline entry). Theme tokens only.
- Known accepted limits (note in code where relevant): the strip is renderer-local (a reload loses the strip display while the host still drains — confirms still land correctly; rehydration from the host queue is a possible later nicety); remote clients that didn't enqueue don't see the strip.

- [ ] Steps: reducer tests first (ADDED/REMOVED list mechanics; drain-confirm appends at END and removes oldest content match from the list; `sent`-path dedup untouched; timeline never contains a queued entry) → RED → reducer + types → InputBar rewire + UserMessage cleanup → strip component + ChatView/App wiring + component test → full suite + tsc → commit `feat(renderer): queued messages dock at the bottom and join the timeline only when actually sent`.

## Self-Review (done at write time)

- **Spec coverage vs program §2:** item 1 (queue) → Task 1; item 2 (acks + remote shim) → Tasks 2–3; item 3 (guardedPtySend + caller audit) → Task 4; item 4 (stop) → Task 6; item 5 (hide /sync + /config) → Task 5; item 6a → Task 7; 6b → Task 8; 6c → Task 3 (queued variant + BUG C pin test). Gap check: none.
- **Placeholder scan:** Step 6 of Task 3 (queued badge) and the `seg.*`/`makeBubble` fixtures in Task 7 intentionally direct the implementer to read the adjacent real shapes rather than transcribe them here — the construction must be copied from the sibling arm verbatim, which a transcription could silently drift from. All other steps carry complete code.
- **Type consistency:** `NativeSendResult` defined once (Task 1) and consumed by name in Tasks 2–3; `canPtySend` signature matches its App.tsx call; `queued` flag named identically in action, entry, and confirm-side rebuild.
