---
status: shipped
date: 2026-08-16
shipped: 2026-08-16 (youcoded merge `28d3f82e`)
type: plan
repos: [youcoded]
spec: docs/archive/specs/2026-08-16-stalled-turn-never-dies-design.md
tags: [native-runtime, harness, chat-ui, attention, error-handling]
---

# A stalled turn waits for you — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the native harness' streaming watchdog would end a turn mid-stream, it instead parks the turn on a red "Provider may have stalled" card with **Retry** and **Stop**, and the turn ends only when the model responds or the user acts.

**Architecture:** The change is local to `HarnessSession.runStreamOnce`. Today the watchdog's second stage resolves a race with `'stall'`, which tears down the stream reader and throws. After this change, that timer instead *emits a display-only heartbeat and returns without resolving anything* — the `while(true)` loop keeps awaiting the same read, so a chunk arriving minutes later still lands and the turn continues. A fourth racer (`retryPromise`) gives the user's Retry button a way to break that wait without going through the interrupt signal, which would end the whole turn. Everything downstream (reducer state, attention dot, the card) hangs off one new boolean on the existing `assistant-thinking` heartbeat.

**Tech Stack:** TypeScript, Electron (main + preload + renderer), React 18, Vitest, Vercel AI SDK v7 (`streamText` / `fullStream`), Kotlin (Android parity stub only).

## Global Constraints

- **Repo:** all code changes land in `youcoded/desktop/` except one Kotlin string in `youcoded/app/`. Nothing in this plan touches the workspace repo.
- **Worktree:** do this work in a git worktree (`git worktree add ../stalled-turn feat/stalled-turn-never-dies`). Copy `node_modules` with `cp -al`, **never** a symlink or junction.
- **No watchdog constant may change.** `STALL_WARNING_MS = 60_000` and `STALL_RETRY_COUNTDOWN_MS = 15_000` (`harness-session.ts:437-438`) stay exactly as they are. If a diff touches those numbers, the task is wrong.
- **Clock 1 (prefill) keeps its ending** except for the one carve-out in Task 2 (a step the user has already retried after a park never dies on its own). `tests/prefill-watchdog.test.ts` must stay green **unchanged** at every commit.
- **Error copy rule:** the card says `Provider may have stalled — no response for <elapsed>` and never names a cause. Per `docs/error-message-standards.md`, general + non-committal + paired with actions.
- **Verification gate for every task:** `bash scripts/verify.sh <worktree>` from the workspace root must pass before the commit. It runs `tsc --noEmit`, affected Vitest, `knip`, `eslint`, and the ast-grep scan.
- **Never run the built app.** Any visual check happens in `bash scripts/run-workbench.sh` or `bash scripts/run-dev.sh <branch> --label "Stalled Turn"`.

## File Structure

| File | Responsibility in this change |
|---|---|
| `src/shared/types.ts` | Two new display-only fields on the `assistant-thinking` event data (`stalled`, `dropPart`); `'stalled'` joins the `AttentionState` union; `NATIVE_RETRY` channel constant |
| `src/main/harness/harness-session.ts` | Park instead of throw; the retry racer; `retryStalledStep()`; part-drop emit |
| `src/main/harness/session-store.ts` | `dropPart` discards the buffered open part; `stalled` heartbeat stays display-only |
| `src/main/harness/native-session-host.ts` | `retryStalledStep(sessionId)` routing |
| `src/main/ipc-handlers.ts`, `src/main/preload.ts`, `src/renderer/remote-shim.ts`, `src/main/remote-server.ts`, `app/.../SessionService.kt` | `native:retry` on all five surfaces |
| `src/renderer/state/chat-types.ts` | `stalledSince` session field, heartbeat action fields, drop-part action, snapshot serialize/deserialize |
| `src/renderer/state/chat-reducer.ts` | Sets/clears `stalled` attention state + `stalledSince`; drops parts on retry |
| `src/renderer/App.tsx`, `src/renderer/components/buddy/BubbleFeed.tsx` | Forward the two new heartbeat fields (these two MUST stay mirrored) |
| `src/renderer/components/AttentionBanner.tsx` | The card: copy, count-up, Retry + Stop |
| `src/renderer/components/ChatView.tsx` | Render the card and wire its two actions |
| `src/renderer/hooks/useSessionAttention.ts` | Red dot for `stalled` (Task 8); the amber→red move for `session-died`/`error` (Task 9, separate commit) |

---

### Task 1: The turn parks instead of dying

**Files:**
- Modify: `src/main/harness/harness-session.ts` (add field near `rearmStallWatchdog` at :1152; edit `armWatchdog` at :1960-1968; edit the `finally` at :2161)
- Modify: `src/shared/types.ts` (add `stalled` beside `stallWarning` at :246)
- Test: `tests/harness-stall-watchdog.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: transcript event `assistant-thinking` with `data.stalled === true`, emitted exactly once per park. `HarnessSession` gains `private turnEverParked: boolean`, consumed by Task 2.

- [ ] **Step 1: Add the event field**

In `src/shared/types.ts`, immediately after the `stallWarning` field (:246):

```ts
    /**
     * Native runtime only. The mid-stream watchdog gave up waiting and the turn
     * is now PARKED: the stream reader is still open, nothing has been torn
     * down, and the turn ends only when a chunk arrives or the user presses
     * Retry / Stop. Display-only (no text, no partId) so SessionStore drops it.
     *
     * Deliberately a bare `true` and not a timestamp: the renderer stamps its
     * own clock on first receipt, so a remote client counting up never inherits
     * clock skew from the host.
     */
    stalled?: true;
```

- [ ] **Step 2: Write the failing tests**

Add to `tests/harness-stall-watchdog.test.ts`. First a helper, placed just below `stallWarnings` (:100) — a parked turn means `send()` no longer resolves on a stall, so every test from here on starts the send, waits for the event, then ends the turn itself:

```ts
const stalledCards = (events: TranscriptEvent[]) =>
  events.filter((e) => e.type === 'assistant-thinking' && e.data.stalled === true);

// A parked turn's send() promise stays pending BY DESIGN — that is the whole
// feature. Poll the collected events instead of awaiting send(), then end the
// turn explicitly so the promise settles and the test can finish.
async function waitForEvent(
  events: TranscriptEvent[],
  pred: (e: TranscriptEvent) => boolean,
  timeoutMs = 30_000,
): Promise<TranscriptEvent> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = events.find(pred);
    if (hit) return hit;
    if (Date.now() > deadline) throw new Error('timed out waiting for event');
    await new Promise((r) => setTimeout(r, 5));
  }
}
```

Then replace the body of the existing test `'stall AFTER content already streamed: does NOT retry (would duplicate), errors immediately'` — rename it and invert the ending:

```ts
  it('stall AFTER content already streamed: PARKS the turn instead of erroring', async () => {
    // One text delta lands, THEN the stream goes silent. This used to be a
    // session-error that ended the turn; now it raises the stalled card and the
    // turn stays alive with the reader still open.
    const model = modelFromStreams([() => hangingStream(...textChunks('a', 'partial answer'))]);
    const session = new HarnessSession(makeOpts({}), async () => model as any);
    const events = collect(session);
    const sent = session.send('go');

    await waitForEvent(events, (e) => e.type === 'assistant-thinking' && e.data.stalled === true);
    // The partial text is still on screen, the warning did NOT promise a retry,
    // and NOTHING has ended the turn.
    expect(events.find((e) => e.type === 'assistant-text')?.data.text).toBe('partial answer');
    expect(stallWarnings(events)).toHaveLength(1);
    expect(stallWarnings(events)[0].data.stallWarning!.willRetry).toBe(false);
    expect(stalledCards(events)).toHaveLength(1);
    expect(types(events)).not.toContain('session-error');
    expect(types(events)).not.toContain('turn-complete');

    // Only the user ends it.
    session.interrupt();
    await sent;
    expect(types(events)).toContain('user-interrupt');
  });
```

**Leave `'stall on BOTH the first attempt and the retry: second warning is non-retry, ends in session-error'` COMPLETELY UNCHANGED.** Its model is `hangingStream()` — it never emits a single part, so both attempts are on the FIRST-BYTE clock (Clock 1), which §8 of the spec leaves alone. It must still end in `session-error` with the "didn't begin responding" wording. If your guard makes this test park, the guard is wrong: it has stopped distinguishing the two clocks, and Clock 1 is out of scope for this work.

Add one new test asserting the reader was never released — this is the assertion that proves "waits for you" is real and not cosmetic:

```ts
  it('a chunk arriving AFTER the card clears it and the turn completes normally', async () => {
    // A stream that emits, goes quiet past warn+countdown, then wakes up.
    let controller: ReadableStreamDefaultController<any>;
    const wakeable = new ReadableStream({
      start(c) {
        controller = c;
        for (const chunk of [{ type: 'stream-start', warnings: [] }, ...textChunks('a', 'half ')]) c.enqueue(chunk);
      },
    });
    const model = new MockLanguageModelV4({ doStream: async () => ({ stream: wakeable }) });
    const session = new HarnessSession(makeOpts({}), async () => model as any);
    const events = collect(session);
    const sent = session.send('go');

    await waitForEvent(events, (e) => e.type === 'assistant-thinking' && e.data.stalled === true);
    // The provider wakes up on the SAME connection.
    for (const c of stream(...textChunks('a', 'a sentence'), finishChunk('stop'))) controller!.enqueue(c);
    controller!.close();

    await sent;
    expect(types(events)).toContain('turn-complete');
    expect(types(events)).not.toContain('session-error');
    // The clearing heartbeat (no stalled, no stallWarning) followed the card.
    const cardIdx = events.findIndex((e) => e.type === 'assistant-thinking' && e.data.stalled === true);
    const cleared = events.slice(cardIdx + 1).find(
      (e) => e.type === 'assistant-thinking' && !e.data.stalled && !e.data.stallWarning && !e.data.text,
    );
    expect(cleared).toBeDefined();
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd youcoded/desktop && npx vitest run tests/harness-stall-watchdog.test.ts`
Expected: FAIL — the two rewritten tests time out in `waitForEvent` (no `stalled` event exists yet) and the new test fails the same way.

- [ ] **Step 4: Add the turn-scoped park flag**

In `src/main/harness/harness-session.ts`, immediately after the `rearmStallWatchdog` declaration (:1152):

```ts
  /** True once THIS turn has parked on a stall the user was told about.
   *  WHY it outlives the step: a manual Retry re-runs the step from the top,
   *  which lands back on the FIRST-BYTE clock (Clock 1). Without this flag a
   *  retry against a dead provider would sit for the full prefill budget and
   *  then kill the turn with Clock 1's "didn't begin responding" error — the
   *  exact ending this design exists to remove, arriving four minutes after the
   *  user asked for the opposite. Cleared at the start of every turn. */
  private turnEverParked = false;
```

- [ ] **Step 5: Clear it at turn start**

In `send()`, on the line immediately after `this.abort = new AbortController();` (:1580):

```ts
    this.turnEverParked = false;
```

- [ ] **Step 6: Park in the watchdog's second stage**

Replace the inner `setTimeout` inside `armWatchdog` (:1966) so the second stage decides between ending and parking:

```ts
    const armWatchdog = () => {
      clearTimeout(stageTimer);
      stageTimer = setTimeout(() => {
        warned = true;
        // willRetry: we can safely re-run only if nothing streamed AND this is
        // the first attempt — otherwise the countdown ends in a park, not a retry.
        const willRetry = !emittedAny && isFirstAttempt;
        this.emitEvent('assistant-thinking', { stallWarning: { retryInMs: countdownMs, willRetry } });
        stageTimer = setTimeout(() => {
          // PARK (Clock 2, or any step the user already retried after a park):
          // do NOT resolve the stall race. Nothing is torn down, the reader
          // stays open, and a chunk arriving minutes later still lands in the
          // loop below and continues the turn. This return IS the feature.
          if ((sawFirstChunk || this.turnEverParked) && !willRetry) {
            parked = true;
            this.turnEverParked = true;
            this.emitEvent('assistant-thinking', { stalled: true });
            return;
          }
          resolveStall('stall');
        }, countdownMs);
      }, sawFirstChunk ? warnMs : firstChunkMs);
    };
```

- [ ] **Step 7: Declare the park local**

Directly above `const armWatchdog = () => {` (:1960), beside `let warned = false;`:

```ts
    let parked = false;
```

- [ ] **Step 8: Un-park when a chunk arrives**

In the "A real chunk arrived" block (:2054), extend the existing clear:

```ts
        // A real chunk arrived → clear any shown warning/card and re-arm.
        if (warned || parked) {
          warned = false;
          parked = false;
          this.emitEvent('assistant-thinking', {});
        }
        armWatchdog();
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/harness-stall-watchdog.test.ts tests/prefill-watchdog.test.ts`
Expected: PASS — all watchdog tests green, `prefill-watchdog.test.ts` green **without edits**.

- [ ] **Step 10: Verify and commit**

Run: `bash scripts/verify.sh ../stalled-turn`
Expected: `verify.sh` reports all checks passed.

```bash
git add src/shared/types.ts src/main/harness/harness-session.ts tests/harness-stall-watchdog.test.ts
git commit -m "feat(harness): a mid-stream stall parks the turn instead of ending it"
```

---

### Task 2: Retry re-runs the step and erases what the dead attempt wrote

**Files:**
- Modify: `src/main/harness/harness-session.ts`
- Modify: `src/shared/types.ts` (add `dropPart` beside `stalled`)
- Test: `tests/harness-stall-watchdog.test.ts`

**Interfaces:**
- Consumes: `turnEverParked` (private field) and the `parked` local from Task 1, and Task 1's park branch inside `armWatchdog`, which this task extends.
- Produces: `HarnessSession.retryStalledStep(): boolean` — public, returns `false` when nothing is parked. Transcript event `assistant-thinking` with `data.dropPart: { partIds: string[] }`, consumed by Tasks 3 and 4.

- [ ] **Step 1: Add the event field**

In `src/shared/types.ts`, directly below the `stalled` field from Task 1:

```ts
    /**
     * Native runtime only. Discard these streaming parts — the attempt that
     * wrote them is being abandoned by a manual Retry, and the re-run would
     * otherwise APPEND to the same bubble (the SDK's part id falls back to the
     * literal 'text-0', so a repeat is the likely case, not a corner case).
     * This is why the automatic retry has always refused to run after content
     * streamed; the manual one is allowed to, because it erases first.
     * Display-only (no text, no partId) — never persisted.
     */
    dropPart?: { partIds: string[] };
```

- [ ] **Step 2: Write the failing tests**

Add to `tests/harness-stall-watchdog.test.ts`:

```ts
  it('Retry erases the abandoned text, re-runs the step, and completes', async () => {
    const model = modelFromStreams([
      () => hangingStream(...textChunks('a', 'Now I will dispatch')),          // stalls mid-sentence
      () => completingStream(...textChunks('a', 'recovered'), finishChunk('stop')),
    ]);
    const session = new HarnessSession(makeOpts({}), async () => model as any);
    const events = collect(session);
    const sent = session.send('go');

    await waitForEvent(events, (e) => e.type === 'assistant-thinking' && e.data.stalled === true);
    expect(session.retryStalledStep()).toBe(true);
    await sent;

    // The abandoned part was explicitly dropped before the re-run...
    const drop = events.find((e) => e.type === 'assistant-thinking' && e.data.dropPart);
    expect(drop).toBeDefined();
    expect(drop!.data.dropPart!.partIds).toContain('a');
    // ...and the drop came BEFORE the retry's first text, or the renderer would
    // erase the new answer instead of the old one.
    const dropIdx = events.indexOf(drop!);
    const recoveredIdx = events.findIndex((e) => e.type === 'assistant-text' && e.data.text === 'recovered');
    expect(dropIdx).toBeLessThan(recoveredIdx);
    expect(types(events)).toContain('turn-complete');
    expect(types(events)).not.toContain('session-error');
  });

  it('Retry is a no-op when nothing is parked', async () => {
    const model = modelFromStreams([() => completingStream(...textChunks('a', 'fine'), finishChunk('stop'))]);
    const session = new HarnessSession(makeOpts({}), async () => model as any);
    await session.send('go');
    expect(session.retryStalledStep()).toBe(false);
  });

  it('a retried step that stalls again PARKS again — it never dies on its own', async () => {
    // Both attempts hang AFTER emitting, so willRetry is false on both, and the
    // second attempt is a first-byte (Clock 1) wait. turnEverParked forces the
    // park anyway: once the user has seen the card, the step stops being able
    // to end the turn by itself.
    const model = modelFromStreams([
      () => hangingStream(...textChunks('a', 'first try')),
      () => hangingStream(),
    ]);
    const session = new HarnessSession(makeOpts({ prefillWarningMs: STALL_MS }), async () => model as any);
    const events = collect(session);
    const sent = session.send('go');

    await waitForEvent(events, (e) => e.type === 'assistant-thinking' && e.data.stalled === true);
    session.retryStalledStep();
    await waitForEvent(events, (e) => e.type === 'assistant-thinking' && e.data.stalled === true
      && events.indexOf(e) > events.findIndex((x) => x.type === 'assistant-thinking' && x.data.dropPart));
    expect(stalledCards(events).length).toBeGreaterThanOrEqual(2);
    expect(types(events)).not.toContain('session-error');

    session.interrupt();
    await sent;
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd youcoded/desktop && npx vitest run tests/harness-stall-watchdog.test.ts`
Expected: FAIL with `session.retryStalledStep is not a function`.

- [ ] **Step 4: Track which parts this attempt wrote**

In `runStreamOnce`, beside `const preparing = new Map(...)` (:1990):

```ts
    // Every streaming part id THIS attempt has written. A manual Retry hands
    // these to the renderer and the store so the abandoned text is removed
    // rather than appended to.
    const emittedPartIds = new Set<string>();
```

In the `'text-delta'` case (:2069), directly above the `emitEvent`:

```ts
            emittedPartIds.add(part.id ?? 'text-0');
```

In the `'reasoning-delta'` case (:2079), directly above its `emitEvent`:

```ts
            emittedPartIds.add(part.id ?? 'reasoning-0');
```

- [ ] **Step 5: Add the retry racer and its branch**

Declare the resolver field directly below `turnEverParked`:

```ts
  /** Resolver for the CURRENT step's manual-retry signal, installed when the
   *  step parks and cleared the moment it un-parks or the step ends. Null means
   *  nothing is parked, which is the entire race guard for the Retry button. */
  private resolveRetry: (() => void) | null = null;
```

Declare the racer locals beside Task 1's `let parked = false;`:

```ts
    // Manual-retry racer — a SEPARATE signal from abortSignal on purpose: abort
    // ends the whole turn, which is the opposite of what Retry means.
    let signalRetry!: () => void;
    const retryPromise = new Promise<'retry'>((resolve) => { signalRetry = () => resolve('retry'); });
```

Install it in Task 1's park branch, directly above its `emitEvent`:

```ts
            this.resolveRetry = signalRetry;
```

Clear it in Task 1's un-park block, beside `parked = false;`:

```ts
          this.resolveRetry = null;
```

…and in the `finally` at :2161, after `this.rearmStallWatchdog = null;`:

```ts
      // A step that has ended can never be retried — drop the resolver so a
      // late click on a card the renderer has not torn down yet is a no-op.
      this.resolveRetry = null;
```

Extend the race (:1996):

```ts
        const chunk = await Promise.race([nextPromise, abortPromise, stallPromise, retryPromise]);
```

Add this branch immediately **above** the existing `if (chunk === 'stall')` block (:2007):

```ts
        if (chunk === 'retry') {
          // Manual Retry from the stalled card. Same teardown as the stall path
          // — the reader really is dead this time, the user said so.
          nextPromise.catch(() => {});
          iterator.return?.().catch(() => {});
          void Promise.resolve(result.usage).catch(() => {});
          void Promise.resolve(result.finishReason).catch(() => {});
          this.resolveRetry = null;
          parked = false;
          // Withdraw any preparing card: the step re-runs INSIDE the same turn,
          // so endTurn's reaping never fires and the card would spin forever
          // beside the one the re-run mints. (Same reason as the auto-retry path.)
          for (const [prepId, entry] of preparing) {
            this.emitEvent('assistant-thinking', {
              toolPreparing: { toolCallId: prepId, toolName: entry.toolName, chars: entry.chars, cleared: true },
            });
          }
          // Erase what the abandoned attempt put on screen BEFORE re-running.
          if (emittedPartIds.size > 0) {
            this.emitEvent('assistant-thinking', { dropPart: { partIds: [...emittedPartIds] } });
          }
          return STALL_RETRY;
        }
```

- [ ] **Step 6: Add the public method**

Directly below `interrupt()` in `HarnessSession`:

```ts
  /** Manual Retry from the stalled card. Re-runs the PARKED step — it does not
   *  re-send the user's message, so every completed tool call and its result
   *  earlier in this turn stays exactly where it is.
   *
   *  Returns false when nothing is parked: the stream resumed between the click
   *  and this call, so the card is already gone and the click means nothing.
   *  That is the whole race guard — a parked step is either still listening
   *  (the resolver is live) or has moved on (the resolver is null). */
  retryStalledStep(): boolean {
    const resolve = this.resolveRetry;
    if (!resolve) return false;
    this.resolveRetry = null;
    resolve();
    return true;
  }
```

- [ ] **Step 7: Correct the now-false comment on consumeStep's loop**

Replace the comment block above the `for (let attempt = 0; ; attempt++)` loop (:1839-1843):

```ts
    // Attempt 0 stalls with nothing streamed → runStreamOnce returns
    // STALL_RETRY → we re-run. That AUTOMATIC retry is available once per step:
    // every attempt after the first passes isFirstAttempt=false, so a later
    // silent stall parks instead of re-running behind the user's back.
    // The loop is no longer bounded at two iterations — a MANUAL Retry also
    // returns STALL_RETRY, and the user may press it as often as they like.
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/harness-stall-watchdog.test.ts tests/prefill-watchdog.test.ts`
Expected: PASS.

- [ ] **Step 9: Verify and commit**

Run: `bash scripts/verify.sh ../stalled-turn`

```bash
git add src/shared/types.ts src/main/harness/harness-session.ts tests/harness-stall-watchdog.test.ts
git commit -m "feat(harness): Retry re-runs the parked step after erasing the abandoned text"
```

---

### Task 3: The store keeps its hands off a parked turn

**Files:**
- Modify: `src/main/harness/session-store.ts` (the `append` filter block at :80-92)
- Test: `tests/session-store.test.ts`

**Interfaces:**
- Consumes: `dropPart` and `stalled` event fields from Tasks 1-2.
- Produces: nothing.

- [ ] **Step 1: Write the failing tests**

Add to `tests/session-store.test.ts`, directly after the existing `'a stall-warning heartbeat does NOT flush the open streaming part'` test (:83):

```ts
  // The parked-turn card is display-only in exactly the same way the stall
  // warning is: not persisted, and NOT a turn boundary. This matters more than
  // it did before — a parked turn's stream may still resume into the same part.
  it('a stalled card heartbeat is not persisted and does NOT flush the open part', async () => {
    await store.create(HEADER);
    await store.append(HEADER.cwd, ev('assistant-text', { text: 'Hel', partId: 'p1' }, 'a1') as any);
    await store.append(HEADER.cwd, ev('assistant-thinking', { stalled: true }, 'w1') as any);
    await store.append(HEADER.cwd, ev('assistant-text', { text: 'lo!', partId: 'p1' }, 'a2') as any);
    await store.append(HEADER.cwd, ev('turn-complete', { stopReason: 'end_turn' }, 't1') as any);
    const events = store.readEvents('s-1', HEADER.cwd);
    expect(events.map((e: any) => e.type)).toEqual(['assistant-text', 'turn-complete']);
    expect((events[0] as any).data).toMatchObject({ text: 'Hello!', partId: 'p1' });
  });

  it('dropPart discards the buffered open part instead of writing it', async () => {
    // Manual Retry: the abandoned half-sentence must never reach the JSONL, or
    // a resume would replay text the user watched disappear.
    //
    // The re-run reuses the SAME partId on purpose. That is not incidental —
    // it is the whole defect. The SDK's part id falls back to the literal
    // 'text-0', so a retry's first delta normally arrives under the id the
    // abandoned attempt was using; the store's coalescer matches it against the
    // still-buffered entry and CONCATENATES, persisting "Now I willrecovered".
    // A version of this test that gave the re-run a fresh partId would pass
    // against the broken store and prove nothing.
    await store.create(HEADER);
    await store.append(HEADER.cwd, ev('assistant-text', { text: 'Now I will', partId: 'p1' }, 'a1') as any);
    await store.append(HEADER.cwd, ev('assistant-thinking', { dropPart: { partIds: ['p1'] } }, 'd1') as any);
    await store.append(HEADER.cwd, ev('assistant-text', { text: 'recovered', partId: 'p1' }, 'a2') as any);
    await store.append(HEADER.cwd, ev('turn-complete', { stopReason: 'end_turn' }, 't1') as any);
    const events = store.readEvents('s-1', HEADER.cwd);
    expect(events.map((e: any) => e.type)).toEqual(['assistant-text', 'turn-complete']);
    expect((events[0] as any).data).toMatchObject({ text: 'recovered', partId: 'p1' });
  });

  it('dropPart for a DIFFERENT partId leaves the open part alone', async () => {
    await store.create(HEADER);
    await store.append(HEADER.cwd, ev('assistant-text', { text: 'keep me', partId: 'p1' }, 'a1') as any);
    await store.append(HEADER.cwd, ev('assistant-thinking', { dropPart: { partIds: ['other'] } }, 'd1') as any);
    await store.append(HEADER.cwd, ev('turn-complete', { stopReason: 'end_turn' }, 't1') as any);
    const events = store.readEvents('s-1', HEADER.cwd);
    expect(events.map((e: any) => e.type)).toEqual(['assistant-text', 'turn-complete']);
    expect((events[0] as any).data).toMatchObject({ text: 'keep me', partId: 'p1' });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd youcoded/desktop && npx vitest run tests/session-store.test.ts`
Expected: the first new test PASSES already (the existing text-less/partId-less filter covers it — that is why it is worth pinning), the two `dropPart` tests FAIL because the abandoned part is still written.

- [ ] **Step 3: Handle dropPart before the display-only filter**

In `src/main/harness/session-store.ts`, insert directly **above** the existing "Streaming-watchdog heartbeats" filter (:80):

```ts
    // Manual stall Retry: the attempt that wrote these parts is being abandoned
    // and its text is being erased on screen. Discard the buffer WITHOUT
    // writing it — this is the only path that drops a buffered part instead of
    // flushing it, and it must run BEFORE the display-only filter below, which
    // would otherwise return early and leave the abandoned text to be flushed
    // by the next event.
    if (event.type === 'assistant-thinking' && event.data?.dropPart) {
      const open = this.open.get(event.sessionId);
      if (open && event.data.dropPart.partIds.includes(String(open.event.data?.partId))) {
        this.open.delete(event.sessionId);
      }
      return;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/session-store.test.ts`
Expected: PASS — all cases, including the two pre-existing stall-warning tests **unmodified**.

- [ ] **Step 5: Verify and commit**

Run: `bash scripts/verify.sh ../stalled-turn`

```bash
git add src/main/harness/session-store.ts tests/session-store.test.ts
git commit -m "feat(harness): a dropped part is discarded, never flushed to the transcript"
```

---

### Task 4: Renderer state — the `stalled` attention state

**Files:**
- Modify: `src/shared/types.ts` (`AttentionState` union at :711)
- Modify: `src/renderer/state/chat-types.ts` (session field :203, heartbeat action :437, new action, serialize :729, deserialize :762)
- Modify: `src/renderer/state/chat-reducer.ts` (initial state :337, heartbeat case :724, text case :951, and the drop-part case)
- Test: `tests/attention-reducer.test.ts`

**Interfaces:**
- Consumes: the `stalled` / `dropPart` event fields.
- Produces: `SessionChatState.stalledSince: number | null`; `AttentionState` gains `'stalled'`; `ChatAction` gains `NATIVE_PARTS_DROPPED { sessionId, partIds }` and `TRANSCRIPT_THINKING_HEARTBEAT.stalled?: true`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/attention-reducer.test.ts`:

```ts
describe('stalled turn', () => {
  let state: ChatState;
  beforeEach(() => { state = initState(); });

  it('a stalled heartbeat sets attentionState "stalled" and stamps stalledSince', () => {
    state = dispatch(state, { type: 'TRANSCRIPT_THINKING_HEARTBEAT', sessionId: SESSION, stalled: true });
    const s = state.get(SESSION)!;
    expect(s.attentionState).toBe('stalled');
    expect(typeof s.stalledSince).toBe('number');
  });

  it('repeat stalled heartbeats do NOT restart the elapsed clock', () => {
    state = dispatch(state, { type: 'TRANSCRIPT_THINKING_HEARTBEAT', sessionId: SESSION, stalled: true });
    const first = state.get(SESSION)!.stalledSince;
    state = dispatch(state, { type: 'TRANSCRIPT_THINKING_HEARTBEAT', sessionId: SESSION, stalled: true });
    expect(state.get(SESSION)!.stalledSince).toBe(first);
  });

  it('a plain heartbeat clears the stall (the stream resumed)', () => {
    state = dispatch(state, { type: 'TRANSCRIPT_THINKING_HEARTBEAT', sessionId: SESSION, stalled: true });
    state = dispatch(state, { type: 'TRANSCRIPT_THINKING_HEARTBEAT', sessionId: SESSION });
    const s = state.get(SESSION)!;
    expect(s.attentionState).toBe('ok');
    expect(s.stalledSince).toBeNull();
  });

  it('a stall warning does NOT assert health — the dot must not go green', () => {
    // Regression: the warning heartbeat used to set attentionState 'ok', so the
    // dot stayed GREEN for the whole countdown while the UI said it may be hanging.
    state = dispatch(state, {
      type: 'TRANSCRIPT_THINKING_HEARTBEAT', sessionId: SESSION,
      stallWarning: { retryInMs: 15_000, willRetry: false },
    });
    expect(state.get(SESSION)!.attentionState).not.toBe('ok');
  });

  it('NATIVE_PARTS_DROPPED removes the abandoned segments from the current turn', () => {
    state = dispatch(state, { type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: SESSION, text: 'Now I will', partId: 'p1' } as any);
    state = dispatch(state, { type: 'NATIVE_PARTS_DROPPED', sessionId: SESSION, partIds: ['p1'] });
    const s = state.get(SESSION)!;
    const turn = s.assistantTurns.get(s.currentTurnId!)!;
    expect(turn.segments.filter((seg: any) => seg.partId === 'p1')).toHaveLength(0);
  });

  it('NATIVE_PARTS_DROPPED leaves segments from other parts alone', () => {
    state = dispatch(state, { type: 'TRANSCRIPT_ASSISTANT_TEXT', sessionId: SESSION, text: 'keep', partId: 'keep-me' } as any);
    state = dispatch(state, { type: 'NATIVE_PARTS_DROPPED', sessionId: SESSION, partIds: ['p1'] });
    const s = state.get(SESSION)!;
    const turn = s.assistantTurns.get(s.currentTurnId!)!;
    expect(turn.segments).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd youcoded/desktop && npx vitest run tests/attention-reducer.test.ts`
Expected: FAIL — `stalled` is not an `AttentionState`, `stalledSince` does not exist, `NATIVE_PARTS_DROPPED` is unhandled.

- [ ] **Step 3: Extend the AttentionState union**

In `src/shared/types.ts` (:711), add the member and its comment:

```ts
export type AttentionState =
  | 'ok'              // Default — indicator renders if isThinking
  | 'stuck'           // Spinner glyph stale ≥ 10s OR no spinner ≥ 20s while thinking
  | 'session-died'    // Process exited mid-turn
  // Native-runtime provider/stream failure (dispatcher: NATIVE_SESSION_ERROR,
  // fed by the 'session-error' transcript event). CC sessions never enter it.
  | 'error'
  // Native runtime only. The mid-stream watchdog gave up waiting but the turn
  // is STILL ALIVE and still holding its stream open — unlike every other
  // non-ok state here, which are all endings. The user chooses: Retry, Stop,
  // or wait. Dispatcher: TRANSCRIPT_THINKING_HEARTBEAT with `stalled: true`.
  | 'stalled';
```

- [ ] **Step 4: Extend the renderer state and actions**

In `src/renderer/state/chat-types.ts`, after the `stallWarning` field (:203):

```ts
  /** When the stalled card was first shown, on THIS client's clock — the
   *  count-up's origin. Null whenever the turn is not parked. Stamped on the
   *  first `stalled` heartbeat and left alone by later ones, so the elapsed
   *  time never resets while the card is up. */
  stalledSince: number | null;
```

In the initial-state literal (:306), beside `stallWarning: null`:

```ts
    stalledSince: null,
```

In the `TRANSCRIPT_THINKING_HEARTBEAT` action (:437), beside `stallWarning`:

```ts
      // Native watchdog stage 2: the turn is PARKED. Absent → a normal
      // heartbeat that clears the park (the stream resumed).
      stalled?: true;
```

Add a new action to the `ChatAction` union, directly after the `TRANSCRIPT_THINKING_HEARTBEAT` member:

```ts
  | {
      // Native runtime only. A manual stall Retry abandoned an attempt: remove
      // the segments it wrote from the current turn, or the re-run's deltas
      // merge into the same bubble and the user reads the sentence twice.
      type: 'NATIVE_PARTS_DROPPED';
      sessionId: string;
      partIds: string[];
    }
```

In `SerializedSessionChatState` (after the `stallWarning` field, :684):

```ts
  // Optional so a pre-field snapshot from an older host still deserializes.
  // Serialized (unlike promptProcessing) because a parked turn is a condition
  // of the HOST that outlives any one client — a phone reconnecting to a
  // stalled desktop session must still see the card. Cross-device clock skew
  // makes the elapsed number approximate on remote; that is accepted.
  stalledSince?: number | null;
```

In `serializeChatState` (:729), beside `stallWarning: s.stallWarning,`:

```ts
        stalledSince: s.stalledSince,
```

In `deserializeChatState` (:762), beside the `stallWarning` default:

```ts
      // Older hosts predate stalledSince — default null so a pre-field snapshot hydrates.
      stalledSince: ser.stalledSince ?? null,
```

- [ ] **Step 5: Teach the reducer**

In `src/renderer/state/chat-reducer.ts`, initial state (:337) beside `stallWarning: null`:

```ts
    stalledSince: null,
```

Replace the `TRANSCRIPT_THINKING_HEARTBEAT` case body (:724-745):

```ts
    case 'TRANSCRIPT_THINKING_HEARTBEAT': {
      const session = next.get(action.sessionId);
      if (!session) return state;
      // Three heartbeat shapes, in descending severity:
      //   stalled     → the turn is parked. RED dot, card on screen.
      //   stallWarning→ stage 1, "may be wrong, I don't know". AMBER dot.
      //   plain       → activity resumed. Clears both.
      //
      // Fix (2026-08-16): the warning branch used to set 'ok', so the dot stayed
      // GREEN for the whole countdown — the app asserting health while telling
      // the user it may be hanging. 'stuck' is the state that means exactly
      // "something may be wrong and I don't know", which is what a warning is.
      const attentionState = action.stalled ? 'stalled'
        : action.stallWarning ? 'stuck'
        : 'ok';
      next.set(action.sessionId, {
        ...session,
        lastActivityAt: Date.now(),
        attentionState,
        stallWarning: action.stallWarning ?? null,
        // Stamped once and held: a repeat heartbeat must not restart the count-up.
        stalledSince: action.stalled ? (session.stalledSince ?? Date.now()) : null,
        // Same lifetime rule as stallWarning: present on the announcing heartbeat,
        // cleared by the next plain one (which the first real chunk triggers).
        //
        // EXCEPT when this heartbeat is a stall warning or the stalled card:
        // neither carries promptProcessing of its own, and nulling it there
        // wiped the progress readout mid-prefill, so the percentage appeared to
        // reset itself (Destin, 2026-07-26). A stall means "still waiting", not
        // "prefill ended" — the reading it was showing is still the truth.
        promptProcessing: action.promptProcessing
          ?? ((action.stallWarning || action.stalled) ? session.promptProcessing : null),
      });
      return next;
    }
```

Add the drop case directly below it:

```ts
    // Manual stall Retry: erase the abandoned attempt's segments from the
    // current turn BEFORE its re-run streams. Without this the re-run's deltas
    // merge into the same segment by partId and the user reads the half
    // sentence twice — which is exactly why the AUTOMATIC retry has always
    // refused to run after content streamed.
    case 'NATIVE_PARTS_DROPPED': {
      const session = next.get(action.sessionId);
      if (!session || !session.currentTurnId) return state;
      const turn = session.assistantTurns.get(session.currentTurnId);
      if (!turn) return state;
      const drop = new Set(action.partIds);
      const segments = turn.segments.filter((seg) => !(seg.partId && drop.has(seg.partId)));
      if (segments.length === turn.segments.length) return state;
      const assistantTurns = new Map(session.assistantTurns);
      assistantTurns.set(session.currentTurnId, { ...turn, segments });
      next.set(action.sessionId, { ...session, assistantTurns });
      return next;
    }
```

Finally, every place that already resets `stallWarning: null` must reset `stalledSince: null` too — the turn cannot be parked once real output or a turn boundary lands. Add `stalledSince: null,` beside `stallWarning: null,` at lines 536, 951, 1000 and 1290 (four sites; `rg -n "stallWarning: null" src/renderer/state/chat-reducer.ts` lists them — the one at :337 is the initial state you already did).

- [ ] **Step 6: Run to verify pass**

Run: `cd youcoded/desktop && npx vitest run tests/attention-reducer.test.ts tests/chat-reducer.test.ts tests/transcript-reducer.test.ts tests/thinking-indicator-semantics.test.tsx`
Expected: PASS. If `thinking-indicator-semantics.test.tsx` fails on the warning-now-being-`stuck` change, that is a genuine assertion to update — the indicator itself is unchanged.

- [ ] **Step 7: Verify and commit**

Run: `bash scripts/verify.sh ../stalled-turn`

```bash
git add src/shared/types.ts src/renderer/state/chat-types.ts src/renderer/state/chat-reducer.ts tests/attention-reducer.test.ts
git commit -m "feat(chat): a parked turn is its own attention state, and a stall warning stops claiming health"
```

---

### Task 5: Forward the new fields to both windows

**Files:**
- Modify: `src/renderer/App.tsx` (:1251-1258)
- Modify: `src/renderer/components/buddy/BubbleFeed.tsx` (:215-221)
- Test: `tests/transcript-reducer.test.ts`

**Interfaces:**
- Consumes: Task 4's action shapes.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

`App.tsx` and `BubbleFeed.tsx` are two hand-mirrored copies of the same forwarding switch, and they have drifted before. Pin the mirror with a source-text check rather than a render test. Add to `tests/transcript-reducer.test.ts`:

```ts
// App.tsx (main window) and BubbleFeed.tsx (buddy window) each hand-forward the
// native heartbeat's fields onto TRANSCRIPT_THINKING_HEARTBEAT. They are copies,
// and a field added to one and not the other makes the two windows disagree
// about whether a turn is stalled. Pinned as source text because the buddy
// window has no test harness of its own.
describe('native heartbeat forwarding parity', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const APP = read('src', 'renderer', 'App.tsx');
  const BUDDY = read('src', 'renderer', 'components', 'buddy', 'BubbleFeed.tsx');

  for (const field of ['stallWarning', 'stalled', 'dropPart']) {
    it(`both windows forward ${field}`, () => {
      expect(APP).toContain(`event.data?.${field}`);
      expect(BUDDY).toContain(`event.data?.${field}`);
    });
  }
});
```

Add `import fs from 'fs';` and `import path from 'path';` at the top of that file if not already present.

- [ ] **Step 2: Run to verify failure**

Run: `cd youcoded/desktop && npx vitest run tests/transcript-reducer.test.ts`
Expected: FAIL on `stalled` and `dropPart`.

- [ ] **Step 3: Forward in App.tsx**

Replace the heartbeat dispatch (:1251-1258):

```ts
            if (event.data?.dropPart) {
              batchTranscriptDispatch({
                type: 'NATIVE_PARTS_DROPPED',
                sessionId: event.sessionId,
                partIds: event.data.dropPart.partIds,
              });
            }
            batchTranscriptDispatch({
              type: 'TRANSCRIPT_THINKING_HEARTBEAT',
              sessionId: event.sessionId,
              // Native watchdog: a stall-warning payload drives the countdown,
              // `stalled` parks the turn, a plain heartbeat clears both.
              // MUST mirror BubbleFeed.tsx.
              stallWarning: event.data?.stallWarning,
              stalled: event.data?.stalled,
              promptProcessing: event.data?.promptProcessing,
            });
```

- [ ] **Step 4: Forward in BubbleFeed.tsx**

Replace its heartbeat dispatch (:215-221):

```ts
            if (event.data?.dropPart) {
              batchDispatch({
                type: 'NATIVE_PARTS_DROPPED',
                sessionId: event.sessionId,
                partIds: event.data.dropPart.partIds,
              });
            }
            batchDispatch({
              type: 'TRANSCRIPT_THINKING_HEARTBEAT',
              sessionId: event.sessionId,
              // Native watchdog stall countdown + parked turn — payload sets,
              // absence clears. MUST mirror App.tsx or the two windows diverge.
              stallWarning: event.data?.stallWarning,
              stalled: event.data?.stalled,
            });
```

- [ ] **Step 5: Run to verify pass**

Run: `cd youcoded/desktop && npx vitest run tests/transcript-reducer.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

Run: `bash scripts/verify.sh ../stalled-turn`

```bash
git add src/renderer/App.tsx src/renderer/components/buddy/BubbleFeed.tsx tests/transcript-reducer.test.ts
git commit -m "feat(chat): both windows forward the parked-turn and part-drop heartbeats"
```

---

### Task 6: The card

**Files:**
- Modify: `src/renderer/components/AttentionBanner.tsx`
- Modify: `src/renderer/components/ChatView.tsx` (:914-958)
- Test: `tests/attention-banner.test.tsx`

**Interfaces:**
- Consumes: `attentionState === 'stalled'`, `stalledSince` from Task 4.
- Produces: `AttentionBanner` props `stalledSince?: number | null`, `onRetry?: () => void`, `onStop?: () => void`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/attention-banner.test.tsx`:

```ts
function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined ?? null;
}

describe('AttentionBanner — the stalled card', () => {
  afterEach(() => cleanup());

  it('says the provider MAY have stalled and never names a cause', () => {
    const { container } = render(<AttentionBanner state="stalled" stalledSince={Date.now() - 134_000} />);
    expect(container.textContent).toMatch(/may have stalled/i);
    expect(container.textContent).not.toMatch(/openrouter/i);
    expect(container.textContent).not.toMatch(/network|internet|connection/i);
  });

  it('counts UP from stalledSince', () => {
    const { container } = render(<AttentionBanner state="stalled" stalledSince={Date.now() - 134_000} />);
    expect(container.textContent).toMatch(/2m 14s/);
  });

  it('offers BOTH Retry and Stop, and fires each handler', () => {
    const onRetry = vi.fn();
    const onStop = vi.fn();
    const { container } = render(
      <AttentionBanner state="stalled" stalledSince={Date.now()} onRetry={onRetry} onStop={onStop} />,
    );
    const retry = buttonByText(container, 'Retry');
    const stop = buttonByText(container, 'Stop');
    expect(retry).not.toBeNull();
    expect(stop).not.toBeNull();
    fireEvent.click(retry!);
    fireEvent.click(stop!);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('renders as a destructive (red) card', () => {
    const { container } = render(<AttentionBanner state="stalled" stalledSince={Date.now()} />);
    expect(container.querySelector('.ring-\\[var\\(--destructive\\)\\]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd youcoded/desktop && npx vitest run tests/attention-banner.test.tsx`
Expected: FAIL — `state="stalled"` is not assignable and no copy/buttons exist.

- [ ] **Step 3: Extend AttentionBanner**

Add the props (after `onRetry` in the `Props` interface):

```ts
  /** When the turn parked, on this client's clock. Drives the count-up. */
  stalledSince?: number | null;
  /** Stalled card only: end the turn, keeping everything written so far.
   *  Identical to ESC — see ChatView, which wires it to the same handler. */
  onStop?: () => void;
```

Update the `onRetry` doc comment (it currently describes the abandoned "re-send the last user message" plan):

```ts
  /** Stalled card only: re-run the parked step. NOT a re-send of the user's
   *  message — every completed tool call earlier in the turn stays put. */
  onRetry?: () => void;
```

Add the copy entry to `COPY`:

```ts
  // Deliberately non-committal: a hung upstream and a dead socket are
  // indistinguishable from inside the app and always will be, so the copy
  // states the observation and pairs it with two actions rather than guessing
  // a cause (docs/error-message-standards.md).
  'stalled': 'Provider may have stalled',
```

Add `'stalled'` to the destructive list:

```ts
const DESTRUCTIVE: Props['state'][] = ['session-died', 'error', 'stalled'];
```

Add the count-up. At the top of the component body, before any conditional return:

```ts
  // Ticks once a second while parked. `stalledSince` is this client's own clock
  // (the host never sends a timestamp), so no clock skew can make it negative.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (state !== 'stalled' || stalledSince == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state, stalledSince]);
```

And a formatter above the component:

```ts
/** "45s" / "2m 14s" / "1h 3m". Whole seconds only — a stalled turn is measured
 *  in minutes and a jittering decimal reads as broken. */
function elapsedLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  if (m < 60) return `${m}m ${total % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
```

Then extend the three derived flags in the component body. Replace them as a group:

```ts
  // Show the spinner while Claude might still be working ('stuck') AND while a
  // turn is parked — a parked turn's stream is still open and the model may yet
  // answer, which is exactly what the spinner means. session-died and error are
  // endings, so they stay still.
  const showSpinner = state === 'stuck' || state === 'stalled';
  const showRequestId = (state === 'session-died' || state === 'error') && !!anthropicRequestId;
  // Parked turns append a live count-up to the copy. `stalledSince` is this
  // client's own clock, so no skew can make it negative.
  const line = state === 'error' && errorMessage
    ? errorMessage
    : state === 'stalled' && stalledSince != null
      ? `${COPY.stalled} — no response for ${elapsedLabel(now - stalledSince)}`
      : COPY[state];
  // Retry is now the stalled card's action. The 'error' banner keeps its own
  // (still-unwired) Try again button; the two are separate affordances.
  const showRetry = (state === 'error' || state === 'stalled') && !!onRetry;
  const showStop = state === 'stalled' && !!onStop;
  const showOpenSettings =
    state === 'error' && !!onOpenProviderSettings && isProviderConfigError(errorMessage);
```

Rename the existing `showRetry` button's label so the two actions read as what they do, and add Stop beside it. Replace the `{showRetry && (…)}` block:

```tsx
        {showRetry && (
          <Button
            size="sm"
            onClick={onRetry}
            className={state === 'stalled' ? 'ml-auto shrink-0' : undefined}
          >
            {state === 'stalled' ? 'Retry' : 'Try again'}
          </Button>
        )}
        {showStop && (
          // Stop is ESC in visible form. Secondary, because "wait for it" and
          // "retry" are the hopeful answers and this is the one that gives up —
          // but it is a real button, because against a dead provider Retry as
          // the only option costs a full conversation re-send per press.
          <Button size="sm" variant="secondary" onClick={onStop} className="shrink-0">
            Stop
          </Button>
        )}
```

(`Button` and `BrailleSpinner` are already imported in this file; `React` must be imported for the hooks — add `import React from 'react';` if the file does not already have it.)

- [ ] **Step 4: Run to verify pass**

Run: `cd youcoded/desktop && npx vitest run tests/attention-banner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Render it from ChatView**

Two edits in `src/renderer/components/ChatView.tsx`.

First, the gate at :915 — a stall that lands while the model is composing tool arguments has a **preparing card on screen with `status: 'running'`**, which makes `thinkingArea` false and would hide the card in exactly the 2026-08-12 incident shape. `stalled` must render like the terminal states do:

```ts
              const thinkingArea = state.isThinking && !hasAwaitingApproval && !hasRunningTools;
              // 'stalled' joins the terminal states in this gate — NOT because
              // it is terminal (the turn is alive), but because it must render
              // even when a preparing tool card is up. A stall while the model
              // is writing tool arguments leaves a card with status 'running',
              // which turns thinkingArea false; without this the red card would
              // be invisible in precisely the mid-tool stall this design exists
              // for (2026-08-12 incident).
              const terminalAttention =
                state.attentionState === 'error'
                || state.attentionState === 'session-died'
                || state.attentionState === 'stalled';
```

Second, the `AttentionBanner` call (:946-957) — replace the `TODO(Task 12)` comment with the real wiring:

```tsx
                  <AttentionBanner
                    state={state.attentionState}
                    anthropicRequestId={lastTurnRequestId}
                    errorMessage={state.errorMessage}
                    stalledSince={state.stalledSince}
                    // Provider-config errors (missing/disabled key) show an
                    // "Open Settings" button that deep-links to Model Providers.
                    onOpenProviderSettings={onOpenProviderSettings}
                    // Stalled card only. Retry re-runs the PARKED STEP — it is
                    // deliberately NOT the native-send helper the old TODO here
                    // pointed at, which sends a new user message and would fork
                    // the conversation mid-turn.
                    onRetry={state.attentionState === 'stalled'
                      ? () => window.claude.native.retry(sessionId)
                      : undefined}
                    // Stop is ESC: the existing interrupt path, which already
                    // ends the turn cleanly and flushes the partial text to disk.
                    onStop={state.attentionState === 'stalled'
                      ? () => window.claude.native.interrupt(sessionId)
                      : undefined}
                  />
```

- [ ] **Step 6: Make it visible in the workbench**

The workbench replays JSONL fixtures through the real reducer, so a parked turn needs one new fixture block type.

In `src/renderer/dev/workbench/fixture-loader.ts`, add a branch directly after the `assistant_text` branch (:87-96):

```ts
      } else if (parsed.type === 'stalled') {
        // Parks the turn so the stalled card can be looked at in the workbench.
        // No backend involved — this is the same action the native heartbeat
        // produces, replayed through the real reducer.
        const action: ChatAction = {
          type: 'TRANSCRIPT_THINKING_HEARTBEAT',
          sessionId,
          stalled: true,
        };
        state = chatReducer(state, action);
        actions.push(action);
```

Then append one line to `src/renderer/dev/workbench/fixtures/conversations/native.jsonl`:

```json
{"type":"stalled"}
```

And add `'stalled'` to the `KNOWN_KINDS` allowlist in `tests/workbench-fixture-actions.test.ts`. That test independently pins which fixture line kinds may exist, so a new kind fails there until it is listed — the failure is the guard working, not a mistake.

The mock bridge auto-stubs unknown members (`mock-shim.ts`'s namespace proxy), so `native.retry` needs no fake and no `MOCK_ONLY` entry — the real backend exists as of Task 7.

Run: `bash scripts/run-workbench.sh` and look at the `wb-2` (native) session.
Then: `node scripts/workbench-boot-check.mjs`
Expected: all seven routes load with no console error.

**Do not** script an interactive verification of hover/click behaviour — hand that to Destin.

- [ ] **Step 7: Verify and commit**

Run: `bash scripts/verify.sh ../stalled-turn`

```bash
git add src/renderer/components/AttentionBanner.tsx src/renderer/components/ChatView.tsx src/renderer/dev/workbench/fixture-loader.ts src/renderer/dev/workbench/fixtures/conversations/native.jsonl tests/attention-banner.test.tsx
git commit -m "feat(chat): the stalled card — counts up, Retry re-runs the step, Stop keeps the work"
```

---

### Task 7: `native:retry` across all five surfaces

**Files:**
- Modify: `src/shared/types.ts` (`IPC` const at :1299), `src/main/preload.ts` (:323, :1177), `src/main/ipc-handlers.ts` (:2531), `src/renderer/remote-shim.ts` (:1542), `src/main/remote-server.ts` (:2114), `src/main/harness/native-session-host.ts` (after `interrupt` at :3348)
- Modify: `../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (:3705 list)
- Modify: `src/renderer/hooks/useIpc.ts:266` (the typed `window.claude.native` contract)
- Test: `tests/ipc-channels.test.ts`

**Interfaces:**
- Consumes: `HarnessSession.retryStalledStep()` from Task 2.
- Produces: `window.claude.native.retry(sessionId: string): void`; `NativeSessionHost.retryStalledStep(sessionId: string): boolean`.

- [ ] **Step 1: Write the failing parity test**

Add to `tests/ipc-channels.test.ts`, modelled on the existing `terminal:get-screen-text` block (:214):

```ts
// Regression net for native:retry (stalled-turn design, 2026-08-16). Five
// surfaces must carry identical type strings — drift would leave the stalled
// card's Retry button dead on one platform, and a dead Retry on a red card is
// worse than no card at all.
describe('native:retry channel parity', () => {
  const CHANNEL = 'native:retry';
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

  it('is declared in shared/types.ts', () => {
    expect(read('src', 'shared', 'types.ts')).toContain(`'${CHANNEL}'`);
  });
  it('is declared in preload.ts', () => {
    expect(read('src', 'main', 'preload.ts')).toContain(`'${CHANNEL}'`);
  });
  it('is handled in ipc-handlers.ts', () => {
    expect(read('src', 'main', 'ipc-handlers.ts')).toContain('NATIVE_RETRY');
  });
  it('is referenced in remote-shim.ts', () => {
    expect(read('src', 'renderer', 'remote-shim.ts')).toContain(`'${CHANNEL}'`);
  });
  it('is handled in remote-server.ts', () => {
    expect(read('src', 'main', 'remote-server.ts')).toContain(`'${CHANNEL}'`);
  });
  it('is answered not-implemented by SessionService.kt (Android)', () => {
    const src = fs.readFileSync(path.join(
      __dirname, '..', '..', 'app', 'src', 'main', 'kotlin',
      'com', 'youcoded', 'app', 'runtime', 'SessionService.kt',
    ), 'utf8');
    expect(src).toContain(`"${CHANNEL}"`);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts`
Expected: FAIL — six failures.

- [ ] **Step 3: Host method**

In `src/main/harness/native-session-host.ts`, directly after `interrupt()` (ends :3387):

```ts
  /** Manual Retry from the stalled card. Unlike interrupt(), this does NOT
   *  cascade to specialist children and does NOT cancel pending asks: only the
   *  ONE parked step re-runs, and everything else about the turn is untouched.
   *  Returns false when nothing was parked (the stream resumed first). */
  retryStalledStep(sessionId: string): boolean {
    return this.live.get(sessionId)?.session.retryStalledStep() ?? false;
  }
```

- [ ] **Step 4: Channel constant and main handler**

`src/shared/types.ts`, in the `IPC` object beside `NATIVE_INTERRUPT` (:1299):

```ts
  NATIVE_RETRY: 'native:retry',
```

`src/main/preload.ts` — the `IPC` const (:323):

```ts
  NATIVE_RETRY: 'native:retry',
```

…and the `native` namespace (:1177, below `interrupt`):

```ts
    // Fire-and-forget like interrupt: the stalled card needs no answer — either
    // the step re-runs (the card clears itself) or nothing was parked (the card
    // is already gone).
    retry: (sessionId: string) => ipcRenderer.send(IPC.NATIVE_RETRY, { sessionId }),
```

`src/main/ipc-handlers.ts`, beside the interrupt handler (:2531):

```ts
  ipcMain.on(IPC.NATIVE_RETRY, (_e, { sessionId }: { sessionId: string }) => {
    nativeHost.retryStalledStep(sessionId);
  });
```

`src/renderer/remote-shim.ts` (:1542, below `interrupt`):

```ts
      retry: (sessionId: string) => fire('native:retry', { sessionId }),
```

`src/main/remote-server.ts` (:2114, beside the interrupt case):

```ts
      case 'native:retry': {
        this.nativeRuntime?.nativeHost.retryStalledStep(payload.sessionId);
        break;
      }
```

Android — `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`, in the not-implemented list beside `"native:interrupt"` (:3710):

```kotlin
            // Stalled-turn Retry. Fire-and-forget (no msg.id) exactly like
            // native:send / native:interrupt, so this is a correct no-op here:
            // Android hosts Claude Code sessions only and has no streaming
            // watchdog to park.
            "native:retry",
```

`src/renderer/hooks/useIpc.ts`, directly below `interrupt` (:266):

```ts
        retry: (sessionId: string) => void;
```

- [ ] **Step 5: Run to verify pass**

Run: `cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

Run: `bash scripts/verify.sh ../stalled-turn`

```bash
git add src/shared/types.ts src/main/preload.ts src/main/ipc-handlers.ts src/renderer/hooks/useIpc.ts src/renderer/remote-shim.ts src/main/remote-server.ts src/main/harness/native-session-host.ts ../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt tests/ipc-channels.test.ts
git commit -m "feat(ipc): native:retry on all five surfaces"
```

---

### Task 8: A parked turn lights the dot red

**Files:**
- Modify: `src/renderer/hooks/useSessionAttention.ts` (:58-70)
- Create: `tests/session-attention-dot.test.ts`

**Interfaces:**
- Consumes: `AttentionState` from Task 4.
- Produces: `export function attentionDotColor(state: AttentionState): 'red' | 'amber' | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/session-attention-dot.test.ts`:

```ts
// The dot's colour rule in one pure function, so it can be pinned without
// mounting the hook. Destin's rule (2026-08-16): AMBER means "this is taking a
// while and something may be wrong, but I don't know"; RED means "something
// definitely needs your attention".
import { describe, it, expect } from 'vitest';
import { attentionDotColor } from '../src/renderer/hooks/useSessionAttention';

describe('attention dot colour', () => {
  it('a parked turn is RED — the user has to choose', () => {
    expect(attentionDotColor('stalled')).toBe('red');
  });
  it('"stuck" stays AMBER — it is the "I do not know" state', () => {
    expect(attentionDotColor('stuck')).toBe('amber');
  });
  it('"ok" contributes no colour', () => {
    expect(attentionDotColor('ok')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd youcoded/desktop && npx vitest run tests/session-attention-dot.test.ts`
Expected: FAIL — `attentionDotColor` is not exported.

- [ ] **Step 3: Extract the rule and use it**

In `src/renderer/hooks/useSessionAttention.ts`, above the hook:

```ts
// Attention states that mean "act now" get the same red the permission prompt
// uses. Amber is reserved for the one state that genuinely means "I don't know"
// (Destin's rule, 2026-08-16). Extracted as a pure function so the mapping is
// unit-testable without mounting the hook.
const RED_ATTENTION = new Set<AttentionState>(['stalled']);

export function attentionDotColor(state: AttentionState): 'red' | 'amber' | null {
  if (state === 'ok') return null;
  return RED_ATTENTION.has(state) ? 'red' : 'amber';
}
```

Replace the priority expression (:65-69):

```ts
      // Priority: red (permission prompt OR a state that needs a decision) →
      // amber ("something may be wrong, I don't know") → green (working) →
      // blue (unseen activity) → gray (idle).
      const attentionColor = attentionDotColor(chatState.attentionState);
      const status: SessionStatusColor = hasAwaiting ? 'red'
        : attentionColor ?? (
          (chatState.isThinking || hasRunning) ? 'green'
          : (chatState.timeline.length > 0 && !viewedSessions.has(s.id) && s.id !== activeSessionId) ? 'blue'
          : 'gray'
        );
```

- [ ] **Step 4: Run to verify pass**

Run: `cd youcoded/desktop && npx vitest run tests/session-attention-dot.test.ts tests/attention-reducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `bash scripts/verify.sh ../stalled-turn`

```bash
git add src/renderer/hooks/useSessionAttention.ts tests/session-attention-dot.test.ts
git commit -m "feat(chat): a parked turn lights the session dot red"
```

---

### Task 9: Separate — `session-died` and `error` become red

**Files:**
- Modify: `src/renderer/hooks/useSessionAttention.ts` (the `RED_ATTENTION` set from Task 8)
- Test: `tests/session-attention-dot.test.ts`

**Interfaces:** none new.

This is a **standalone commit on purpose** (spec §10b). It is correct — `AttentionBanner` already draws a red destructive ring around both states while the dot says amber — but it has nothing to do with stalls, and bundling it means two dots change colour for reasons that cannot be traced to the feature Destin asked for. It also stands alone if he wants it dropped.

- [ ] **Step 1: Write the failing tests**

Add to `tests/session-attention-dot.test.ts`:

```ts
  it('a dead session is RED — the turn is over and the user must act', () => {
    expect(attentionDotColor('session-died')).toBe('red');
  });
  it('a provider error is RED for the same reason', () => {
    expect(attentionDotColor('error')).toBe('red');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd youcoded/desktop && npx vitest run tests/session-attention-dot.test.ts`
Expected: FAIL — both return `'amber'`.

- [ ] **Step 3: Move them**

```ts
// 'session-died' and 'error' moved here 2026-08-16: AttentionBanner has always
// drawn its red destructive ring around both (its DESTRUCTIVE list) while the
// dot rendered amber — the banner and the dot disagreed about the same event.
// Both mean "the turn is over, act now", which is what red means.
const RED_ATTENTION = new Set<AttentionState>(['stalled', 'session-died', 'error']);
```

- [ ] **Step 4: Run to verify pass**

Run: `cd youcoded/desktop && npx vitest run tests/session-attention-dot.test.ts`
Expected: PASS. Exactly one amber state remains: `stuck`.

- [ ] **Step 5: Verify and commit**

Run: `bash scripts/verify.sh ../stalled-turn`

```bash
git add src/renderer/hooks/useSessionAttention.ts tests/session-attention-dot.test.ts
git commit -m "fix(chat): a dead session's dot is red, matching the banner it already shows"
```

---

## Final gate before merge

- [ ] `bash scripts/verify.sh ../stalled-turn --full` — the whole desktop suite, not just affected tests.
- [ ] `cd youcoded/desktop && npx vitest run tests/prefill-watchdog.test.ts` — must be green with **zero edits** to that file. An edit there means the work leaked into Clock 1.
- [ ] `git diff master -- src/main/harness/harness-session.ts | rg "STALL_WARNING_MS|STALL_RETRY_COUNTDOWN_MS"` — must print nothing but context lines. No constant changed.
- [ ] `cd youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug` — the Kotlin string change compiles.
- [ ] Hand off to Destin for the interactive look: `bash scripts/run-dev.sh feat/stalled-turn-never-dies --label "Stalled Turn"`, then tell him what to try (a stalled card is easiest to force by pointing a native session at an unreachable OpenRouter model, or by temporarily shortening `STALL_WARNING_MS` **in the dev worktree only** and reverting before commit).
- [ ] Move the spec and this plan to `docs/archive/`, flip the ROADMAP item, in the same session as the merge.

## Known behaviour this plan deliberately leaves alone

- **Quitting the app while a turn is parked loses the trailing partial text.** Spec §6 names this. Stop saves it; quitting does not. The general fix (flush open parts on app shutdown) is separable.
- **The send queue is untouched.** A message typed during a stall queues, shows in the docked strip with cancel/edit, and delivers when the turn resumes or ends.
- **Clock 1 still ends a turn** at its prefill budget on a *fresh* step. Only a step the user has already retried after a park is exempt (Task 2).
