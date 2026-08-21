---
status: active
date: 2026-08-21
kind: plan
spec: docs/active/specs/2026-08-21-empty-final-step-turn-recovery-design.md
---

# Empty Final Step → Bounded Retry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a model's step produces no text and no tool calls yet claims an orderly finish, silently re-run it once; if it happens twice in a row, end the turn honestly with `stopReason: 'empty_response'` and a footer explaining it — instead of today's silent `end_turn` that looks like the assistant never answered.

**Architecture:** One classification block in the `turnLoop` of `harness-session.ts` (predicate + finishReason gate + `consecutiveEmptySteps` counter + `'empty_response'` break + one `console.error` line), one map entry in the renderer's `stopReasonCopy`, and one new test helper (`reasoningChunks`). Nothing else. The spec (path in frontmatter) is the authority on WHAT; this plan is the HOW.

**Tech Stack:** TypeScript, vitest, `ai/test` MockLanguageModelV4 scripted streams, React Testing Library (bubble test).

## Conflicts found

None. Every spec anchor was re-verified against the worktree at `a3f38fcd` and matched (see "Verification notes" at the bottom for the three minor discoveries — none contradicts the spec).

## Global Constraints

- **Worktree:** all edits in `/home/destin/youcoded-dev/worktrees/empty-step-recovery` (branch `fix/empty-final-step-recovery`). All paths below are relative to that root unless absolute.
- **Frozen emit surface:** NO new `TranscriptEventType`s, NO new IPC channels. The new state rides the existing `turn-complete` payload's `stopReason` string. The diagnostic is a `console.error` in the main process only.
- **Scope is exactly:** predicate + finishReason gate + counter + `'empty_response'` break in `harness-session.ts`; one `stopReasonCopy` entry; one log line; the tests; the `reasoningChunks` test helper; PLUS the review-driven Task 6 (spec decision 4 — fully-silent-turn rendering: one reducer guard + one footer-only render path, isolated in its own commit for easy reversal). **Anything more is scope creep — reject it.** Specifically out of scope (spec §7): `mapStopReason` changes, stall-clock constants, the park guard, a post-turn Retry affordance, Kotlin changes (verified: native Android carries `stopReason` opaquely), any renderer change beyond the one map entry.
- **finishReason gate values (verbatim from spec §4 Part 2):** retry ladder applies ONLY when the empty step's `finishReason` is `'stop'`, `undefined`, `'unknown'`, or `'other'`. Any other reason keeps today's exact `mapStopReason` behavior.
- **Footer copy (verbatim, spec §8):** `The model returned an empty response. Retrying may help.`
- **WHY comments** on every non-trivial production edit (repo convention — Destin is a non-developer).
- **`desktop/tests/harness-stall-watchdog.test.ts` must remain byte-identical and green.**
- Commit after each task, on the worktree branch. End commit messages with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Spec §6 test-case → test map

| Spec case | Test name | File |
|---|---|---|
| 1 | `case 1: empty final step after a tool result → ONE silent re-run → real content → end_turn` | `desktop/tests/harness-session-loop.test.ts` |
| 2 | `case 2: empty twice consecutively → empty_response; usage sums BOTH attempts; no empty history` | same |
| 3 | `case 3: counter resets on a non-empty step — a later empty step gets its own retry` | same |
| 4 | `case 4: first-step empty (no tools all turn) → same ladder` | same |
| 5 | `case 5: reasoning-only step is classified empty and retried; history untouched` | same |
| 6 | `case 6: empty step with finishReason length → NO retry, ends max_tokens` | same |
| 7 | `case 7: interrupt during the retry attempt → user-interrupt wins, no turn-complete` | same |
| 8 | `case 8a/8b: specialist child — empty-then-content and empty-twice both settle send()` (two tests) | same |
| 9 | `renders the empty-response copy for stopReason empty_response` + `end_turn never renders the empty-response copy` | `desktop/src/renderer/components/AssistantTurnBubble.test.tsx` |
| 10 | existing suites unchanged — Task 5 runs `harness-stall-watchdog.test.ts` explicitly + full `verify.sh` | Task 6 (final gate moved there) |
| 11 (spec decision 4) | `creates a footer-only turn when turn-complete carries an abnormal stopReason and no content streamed` + `end_turn with no content still creates no turn` (reducer) · `renders a footer-only row for an empty_response turn with no segments` (bubble) | `desktop/src/renderer/state/__tests__/chat-reducer.test.ts` + `AssistantTurnBubble.test.tsx` |

## Verified anchors (do not re-derive)

All in the worktree, verified 2026-08-21. Line numbers are orientation only — **anchor edits by the quoted snippets**, lines may drift.

- `desktop/src/main/harness/harness-session.ts`
  - `turnLoop: while (true) {` — L1656.
  - Turn locals: `let stepsSinceApproval = 0;` / `let stopReason = 'end_turn';` — L1622–1623 (counter declaration goes here).
  - Interrupt check `if (step.interrupted || this.interrupted || this.abort.signal.aborted)` — L1703 (runs BEFORE our new block; that plus the predicate's `!step.interrupted` is spec case 7's safety).
  - History push gate `if (step.text || step.toolCalls.length > 0)` — L1711 (an empty step pushes nothing → retry request is byte-identical).
  - The break we're intercepting: `if (step.toolCalls.length === 0) { … stopReason = mapStopReason(step.finishReason); break; }` — L1715–1719.
  - Usage accumulation into `turnUsage` — L1694–1699, ABOVE the new block, so both attempts bill (spec's honesty property needs no code).
  - `mapStopReason` — L259 (UNTOUCHED; the constant is set at the break site).
  - `StepResult { text, toolCalls, usage, finishReason, interrupted, generationMs }` — L239–247. No reasoning field, confirming spec §3.
  - `turn-complete` emit with `stopReason` + summed usage — L1822.
- `desktop/src/renderer/components/AssistantTurnBubble.tsx` — `stopReasonCopy` L32–47; unknown reasons already fall back to `` `Response ended: ${reason}.` `` so the map entry is polish, as the spec says.
- **Bubble test location:** `desktop/src/renderer/components/AssistantTurnBubble.test.tsx` (NOT `desktop/tests/`). Its `stop reason footer` describe (≈L351) has `turnWithStopReason(stopReason)` and `renderTurn({ turn, toolGroups, toolCalls })` helpers — reuse both.
- `desktop/tests/helpers/scripted-model.ts` exports (exact signatures):
  `textChunks(id: string, text: string)`, `multiDeltaTextChunks(id, ...texts)`, `toolCallChunk(toolCallId, toolName, input)`, `toolInputChunks(toolCallId, toolName, ...deltas)`, `finishChunk(reason: string, inTok = 1, outTok = 1)`, `stream(...chunks)`, `scriptedModel(scripts: any[][], seenPrompts?: any[])`.
  - `stream(finishChunk('stop'))` scripts a fully empty step.
  - `scriptedModel` replays script `Math.min(call, scripts.length - 1)` — **it repeats the LAST script forever**, which case 8b exploits; `seenPrompts.length` is the model-call counter.
  - **No reasoning helper exists** — Task 2 adds one. Raw shape verified against `@ai-sdk/provider` typings: `{ type: 'reasoning-start', id }` / `{ type: 'reasoning-delta', id, delta }` / `{ type: 'reasoning-end', id }` (mirrors `textChunks` framing).
- `desktop/tests/helpers/harness-fakes.ts` exports: `HARNESS`, `makeOpts(over: Partial<HarnessSessionOpts>)`, `fakeTool(name, over = {})` (records `(t as any).calls`), `makeSession`, `scriptModel(steps: ScriptStep[])`, `drainTurn`. `makeOpts({ isSpecialistChild: true })` is the exact child construction `harness-stall-watchdog.test.ts` (≈L248) already uses.
- `desktop/tests/harness-session-loop.test.ts` local helpers: `collect(session)` returns the event array, `types(events)` maps to type strings, `ALLOW` is an allow decision. The direct-`MockLanguageModelV4`-with-side-effect pattern for case 7 is at ≈L1504 (the postSteer test).
- Existing assertion patterns to copy: stopReason via `events.find((e) => e.type === 'turn-complete')!.data.stopReason` (≈L285); usage summing via `done.data.usage` + `toMatchObject` (≈L302–313).
- No other main-process consumer branches on stopReason values except `'max_steps'` in `native-session-host.ts` (≈L1581, L1609) — `'empty_response'` flows through opaquely, as the spec claims.

---

### Task 1: Failing tests — root-session ladder (spec cases 1–4, 6, 7)

**Files:**
- Modify: `desktop/tests/harness-session-loop.test.ts` (append a new top-level `describe` at the end of the file)

**Interfaces:**
- Consumes: existing imports already at the top of this file (`scriptedModel`, `stream`, `textChunks`, `toolCallChunk`, `finishChunk`, `makeOpts`, `fakeTool`, `HarnessSession`, `MockLanguageModelV4`, `simulateReadableStream`, plus local `collect`/`types`/`ALLOW`). No new imports needed for this task.
- Produces: the six test names Task 4 must turn green.

- [ ] **Step 1: Append the describe block with six tests**

```ts
// Empty-step recovery (spec: docs/active/specs/2026-08-21-empty-final-step-
// turn-recovery-design.md, §6). A step with no text and no tool calls that
// claims an orderly finish gets ONE silent re-run; a second consecutive empty
// step ends the turn honestly as 'empty_response'. History must never gain an
// empty assistant message, and usage must bill every attempt.
describe('HarnessSession — empty final step recovery', () => {
  it('case 1: empty final step after a tool result → ONE silent re-run → real content → end_turn', async () => {
    const read = fakeTool('Read');
    const seen: any[] = [];
    const model = scriptedModel([
      stream(...textChunks('a', 'reading'), toolCallChunk('c1', 'Read', { file_path: 'x.ts' }), finishChunk('tool-calls')),
      stream(finishChunk('stop')),                                  // the degenerate empty step
      stream(...textChunks('b', 'recovered'), finishChunk('stop')), // the silent re-run's real answer
    ], seen);
    const session = new HarnessSession(makeOpts({ tools: [read], decide: async () => ALLOW }), async () => model as any);
    const events = collect(session);
    await session.send('go');

    expect(seen).toHaveLength(3);   // exactly ONE extra model call
    const done = events.find((e) => e.type === 'turn-complete')!;
    expect(done.data.stopReason).toBe('end_turn');
    expect(events.filter((e) => e.type === 'assistant-text').map((e) => e.data.text)).toEqual(['reading', 'recovered']);
    // History is exactly user / assistant(text+call) / tool / assistant(text) —
    // the empty step contributed NOTHING (that is what makes the re-run safe).
    const history = (session as any).history as any[];
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(JSON.stringify(history.at(-1))).toContain('recovered');
  });

  it('case 2: empty twice consecutively → empty_response; usage sums BOTH attempts; no empty history', async () => {
    const seen: any[] = [];
    const model = scriptedModel([
      stream(finishChunk('stop', 10, 2)),
      stream(finishChunk('stop', 11, 3)),
    ], seen);
    const session = new HarnessSession(makeOpts({}), async () => model as any);
    const events = collect(session);
    await session.send('go');

    expect(seen).toHaveLength(2);   // bounded: two attempts, never a third
    const done = events.find((e) => e.type === 'turn-complete')!;
    expect(done.data.stopReason).toBe('empty_response');
    expect(done.data.usage).toMatchObject({ inputTokens: 21, outputTokens: 5 }); // both attempts billed
    // Neither empty step pushed an assistant message.
    expect(((session as any).history as any[]).map((m) => m.role)).toEqual(['user']);
  });

  it('case 3: counter resets on a non-empty step — a later empty step gets its own retry', async () => {
    const read = fakeTool('Read');
    const seen: any[] = [];
    const model = scriptedModel([
      stream(finishChunk('stop')),                                  // empty #1 → retry
      stream(...textChunks('a', 'ok'), toolCallChunk('c1', 'Read', { file_path: 'x.ts' }), finishChunk('tool-calls')), // real step → counter resets
      stream(finishChunk('stop')),                                  // empty #2 → retry AGAIN (consecutive semantics)
      stream(...textChunks('b', 'done'), finishChunk('stop')),
    ], seen);
    const session = new HarnessSession(makeOpts({ tools: [read], decide: async () => ALLOW }), async () => model as any);
    const events = collect(session);
    await session.send('go');

    expect(seen).toHaveLength(4);   // both empties retried — the counter reset in between
    expect(events.find((e) => e.type === 'turn-complete')!.data.stopReason).toBe('end_turn');
    expect((read as any).calls).toHaveLength(1);
  });

  it('case 4: first-step empty (no tools all turn) → same ladder', async () => {
    const seen: any[] = [];
    const model = scriptedModel([
      stream(finishChunk('stop')),
      stream(...textChunks('a', 'hello'), finishChunk('stop')),
    ], seen);
    const session = new HarnessSession(makeOpts({}), async () => model as any);
    const events = collect(session);
    await session.send('go');

    expect(seen).toHaveLength(2);
    const done = events.find((e) => e.type === 'turn-complete')!;
    expect(done.data.stopReason).toBe('end_turn');
    expect(events.filter((e) => e.type === 'assistant-text').map((e) => e.data.text)).toEqual(['hello']);
  });

  it('case 6: empty step with finishReason length → NO retry, ends max_tokens', async () => {
    // The finishReason gate: 'length' means truncation — a retry would hit the
    // same output limit, so today's mapStopReason path must be kept EXACTLY.
    // NOTE: this test passes BEFORE the production change too — it is the
    // regression pin that proves the new code does not widen past the gate.
    const seen: any[] = [];
    const model = scriptedModel([stream(finishChunk('length'))], seen);
    const session = new HarnessSession(makeOpts({}), async () => model as any);
    const events = collect(session);
    await session.send('go');

    expect(seen).toHaveLength(1);   // no retry
    expect(events.find((e) => e.type === 'turn-complete')!.data.stopReason).toBe('max_tokens');
  });

  it('case 7: interrupt during the retry attempt → user-interrupt wins, no turn-complete', async () => {
    // Same direct-mock pattern as the postSteer tests above (including the
    // `let session!:` definite-assignment declaration): a per-call side effect
    // fires the interrupt while the RETRY attempt (call 2) is running.
    let session!: HarnessSession;
    let call = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        call++;
        if (call === 2) session.interrupt();
        return { stream: simulateReadableStream({ chunks: stream(finishChunk('stop')) }) };
      },
    });
    session = new HarnessSession(makeOpts({}), async () => model as any);
    const events = collect(session);
    await session.send('go');

    expect(call).toBe(2);           // the retry attempt DID start…
    expect(types(events)).toContain('user-interrupt');          // …but the interrupt won
    expect(types(events)).not.toContain('turn-complete');       // never 'empty_response'
  });
});
```

- [ ] **Step 2: Run the new tests and confirm the expected failures**

Run: `cd /home/destin/youcoded-dev/worktrees/empty-step-recovery/desktop && npx vitest run tests/harness-session-loop.test.ts -t 'empty final step recovery'`

Expected: cases 1–4 and 7 FAIL (today an empty step ends the turn `end_turn` after one call — e.g. case 1 sees `seen.length === 2` not 3; case 2 sees `stopReason 'end_turn'`; case 7 sees `call === 1` and a `turn-complete`). Case 6 PASSES (it pins today's behavior — that is its job). Any OTHER failure shape means a broken test: fix the test, not the code.

- [ ] **Step 3: Confirm the rest of the suite still passes** (same command without `-t`): `npx vitest run tests/harness-session-loop.test.ts` — only the five new failures.

- [ ] **Step 4: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/empty-step-recovery
git add desktop/tests/harness-session-loop.test.ts
git commit -m "test(harness): failing tests for empty-final-step recovery ladder (spec cases 1-4, 6, 7)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `reasoningChunks` helper + failing test for the reasoning-only step (spec case 5)

**Files:**
- Modify: `desktop/tests/helpers/scripted-model.ts` (append one export)
- Modify: `desktop/tests/harness-session-loop.test.ts` (one test inside the Task 1 describe; extend the helper import)

**Interfaces:**
- Produces: `reasoningChunks(id: string, text: string): object[]` — raw LanguageModelV4 reasoning framing, mirroring `textChunks`.

- [ ] **Step 1: Add the helper to `scripted-model.ts`** (after `multiDeltaTextChunks`)

```ts
/** reasoning-start/delta/end framing for one reasoning (thinking) block —
 *  mirrors textChunks. Raw LanguageModelV4 part shape verified against
 *  @ai-sdk/provider typings: { type: 'reasoning-delta', id, delta }.
 *  Added for the empty-step-recovery suite: a step that THINKS and then says
 *  nothing must classify as empty (spec 2026-08-21, §4 Part 1). */
export function reasoningChunks(id: string, text: string) {
  return [
    { type: 'reasoning-start', id },
    { type: 'reasoning-delta', id, delta: text },
    { type: 'reasoning-end', id },
  ];
}
```

- [ ] **Step 2: Extend the import in `harness-session-loop.test.ts`**

Change the existing line
`import { textChunks, toolCallChunk, toolInputChunks, finishChunk, stream, scriptedModel } from './helpers/scripted-model';`
to also name `reasoningChunks`.

- [ ] **Step 3: Add the test inside the Task 1 describe (after case 4)**

```ts
  it('case 5: reasoning-only step is classified empty and retried; history untouched', async () => {
    // StepResult has NO reasoning field (spec §3) — a step that thinks and then
    // stops is loop-indistinguishable from total silence, and BY DESIGN gets the
    // same retry: nothing was pushed to history, so the re-run is history-safe.
    const seen: any[] = [];
    const model = scriptedModel([
      stream(...reasoningChunks('r1', 'pondering'), finishChunk('stop')),
      stream(...textChunks('a', 'answer'), finishChunk('stop')),
    ], seen);
    const session = new HarnessSession(makeOpts({}), async () => model as any);
    const events = collect(session);
    await session.send('go');

    expect(seen).toHaveLength(2);   // retried despite having streamed thinking
    // The thinking WAS emitted to the transcript (stays on screen — accepted cost).
    expect(events.some((e) => e.type === 'assistant-thinking' && e.data.text === 'pondering')).toBe(true);
    const done = events.find((e) => e.type === 'turn-complete')!;
    expect(done.data.stopReason).toBe('end_turn');
    // History: user + the ONE real assistant answer. The reasoning-only attempt
    // pushed nothing (L1711 gates on text/toolCalls only).
    const history = (session as any).history as any[];
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(JSON.stringify(history[1])).toContain('answer');
  });
```

- [ ] **Step 4: Run and confirm it fails the right way**

Run: `cd /home/destin/youcoded-dev/worktrees/empty-step-recovery/desktop && npx vitest run tests/harness-session-loop.test.ts -t 'case 5'`
Expected: FAIL on `expect(seen).toHaveLength(2)` (today: 1 call, turn ends `end_turn` after the reasoning-only step). The `assistant-thinking` assertion should already hold — if IT fails, the helper's part shape is wrong; fix the helper, not the code.

- [ ] **Step 5: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/empty-step-recovery
git add desktop/tests/helpers/scripted-model.ts desktop/tests/harness-session-loop.test.ts
git commit -m "test(harness): reasoningChunks scripted-stream helper + failing reasoning-only-step test (spec case 5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Failing tests — specialist child (spec case 8)

**Files:**
- Modify: `desktop/tests/harness-session-loop.test.ts` (two tests inside the Task 1 describe)

- [ ] **Step 1: Add the two child tests (after case 7)**

```ts
  // Spec case 8 — a specialist child gets the SAME bounded retry. The child
  // never-park rule (harness-stall-watchdog.test.ts) is about the watchdog
  // leaving send() unsettled; a synchronous capped re-run settles normally.
  // `await child.send()` completing IS the settle assertion — a regression to an
  // unbounded loop trips this file's test timeout instead of hanging a parent.
  it('case 8a: specialist child — empty then content settles send() with end_turn', async () => {
    const seen: any[] = [];
    const model = scriptedModel([
      stream(finishChunk('stop')),
      stream(...textChunks('a', 'report'), finishChunk('stop')),
    ], seen);
    const child = new HarnessSession(makeOpts({ isSpecialistChild: true }), async () => model as any);
    const events = collect(child);
    await child.send('go');

    expect(seen).toHaveLength(2);
    expect(events.find((e) => e.type === 'turn-complete')!.data.stopReason).toBe('end_turn');
    expect(events.filter((e) => e.type === 'assistant-text').map((e) => e.data.text)).toEqual(['report']);
  });

  it('case 8b: specialist child — empty twice settles send() with empty_response', async () => {
    // scriptedModel REPLAYS its last script when calls outrun it, so this one
    // empty script feeds every attempt — the assertion that only TWO calls
    // happened is what pins the bound (an unbounded retry would spin here).
    const seen: any[] = [];
    const model = scriptedModel([stream(finishChunk('stop'))], seen);
    const child = new HarnessSession(makeOpts({ isSpecialistChild: true }), async () => model as any);
    const events = collect(child);
    await child.send('go');

    expect(seen).toHaveLength(2);
    expect(events.find((e) => e.type === 'turn-complete')!.data.stopReason).toBe('empty_response');
  });
```

- [ ] **Step 2: Run and confirm both fail** (`npx vitest run tests/harness-session-loop.test.ts -t 'case 8'`) — 8a fails on `seen.length` (1 today) and missing text; 8b fails on `seen.length`/stopReason (`end_turn` after one call today). Both `send()`s settle even today, so no timeout.

- [ ] **Step 3: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/empty-step-recovery
git add desktop/tests/harness-session-loop.test.ts
git commit -m "test(harness): failing specialist-child empty-step tests (spec case 8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: The production change — turnLoop classification block

**Files:**
- Modify: `desktop/src/main/harness/harness-session.ts` (two edit sites, both in `send()`'s turn machinery)

This is the ENTIRE production change on the main-process side. `mapStopReason` (L259) is untouched. No emit-surface change: the only new output is one `console.error`.

- [ ] **Step 1: Declare the counter with the other turn locals**

Anchor — find (≈L1622):

```ts
    let stepsSinceApproval = 0;
    let stopReason = 'end_turn';
```

Insert between those two lines:

```ts
    // Consecutive contentless steps (empty-step recovery, spec 2026-08-21).
    // The single silent retry is allowed only at count 1; any real step resets
    // it, so an all-empty turn costs exactly two provider calls.
    let consecutiveEmptySteps = 0;
```

- [ ] **Step 2: Insert the classification block between the history push and the natural-stop break**

Anchor — find (≈L1709–1720; the exact current text):

```ts
        // Record the assistant message (text + any tool-call parts). Skip an
        // empty one (no text and no calls) so we never push a content-less turn.
        if (step.text || step.toolCalls.length > 0) {
          this.history.push(this.assistantMessage(step.text, step.toolCalls));
        }

        if (step.toolCalls.length === 0) {
          // Natural stop. finishReason 'length' (truncated output, including a
          // truncated tool-call) collapses to 'max_tokens' via mapStopReason.
          stopReason = mapStopReason(step.finishReason);
          break;
        }
```

Replace with (the history-push lines are unchanged; the new block sits between the push and the break):

```ts
        // Record the assistant message (text + any tool-call parts). Skip an
        // empty one (no text and no calls) so we never push a content-less turn.
        if (step.text || step.toolCalls.length > 0) {
          this.history.push(this.assistantMessage(step.text, step.toolCalls));
        }

        // Empty-step recovery (spec: docs/active/specs/2026-08-21-empty-final-
        // step-turn-recovery-design.md). A degenerate step — no text, no tool
        // calls, yet an orderly finish — used to fall straight into the natural-
        // stop break below and end the turn as a silent 'end_turn', which the
        // user experiences as the assistant simply never answering (observed
        // 3x live, 2026-08-20/21). Re-run it ONCE silently: the push above
        // skipped an empty step, so history gained nothing and the re-run sends
        // the same conversation (modulo a compaction the loop top may run
        // either way — tool-call/result pairing holds through both).
        // A SECOND consecutive empty step ends the turn honestly instead.
        // Reasoning-only steps count as empty BY DECISION (StepResult carries
        // no reasoning; the user-visible outcome is identical to silence).
        const isEmptyStep =
          !step.interrupted &&
          step.toolCalls.length === 0 &&
          (!step.text || step.text.trim().length === 0);
        // Gate on the "provider claims an orderly finish" shapes ONLY. An empty
        // step that finished 'length' is truncation (a retry would hit the same
        // limit and must still report max_tokens); 'content-filter' must keep
        // its refusal mapping. Without this gate the retry would mask real
        // stop reasons behind 'empty_response'.
        const orderlyFinish = step.finishReason === undefined
          || ['stop', 'unknown', 'other'].includes(step.finishReason);
        if (isEmptyStep && orderlyFinish) {
          consecutiveEmptySteps++;
          if (consecutiveEmptySteps === 1) {
            // One main-process log line so the silent retry is diagnosable —
            // deliberately NOT a transcript event (the emit surface is frozen).
            console.error(`[harness] empty step (no text, no tool calls, finishReason: ${step.finishReason ?? 'undefined'}) — retrying once`);
            continue turnLoop;
          }
          // Second consecutive empty step: an orderly completion with an honest
          // reason. Set HERE, not in mapStopReason — 'empty_response' is a
          // loop-level judgment about two steps, not a mapping of one
          // provider finishReason.
          stopReason = 'empty_response';
          break;
        }
        consecutiveEmptySteps = 0;   // any real step re-arms the single retry

        if (step.toolCalls.length === 0) {
          // Natural stop. finishReason 'length' (truncated output, including a
          // truncated tool-call) collapses to 'max_tokens' via mapStopReason.
          stopReason = mapStopReason(step.finishReason);
          break;
        }
```

Notes for the implementer (all spec-verified, don't re-litigate):
- The block sits AFTER usage accumulation (L1694–1699) → both attempts bill; AFTER the interrupt return (L1703) → interrupt wins (case 7); the predicate's `!step.interrupted` is belt-and-suspenders.
- `continue turnLoop` re-enters at the loop top (steers/compaction) — intended per spec §4 Part 2. The label already exists (`break turnLoop` at ≈L1813 proves it).
- `stepsSinceApproval`/`maxSteps` are incremented only in the tool-execution branch — an empty step correctly doesn't consume step budget; the consecutive counter bounds the retry on its own.
- **Specialist nudge stacking (review finding 3, accepted):** `runSpecialist` (`native-session-host.ts` ~L1581–1614) already re-prompts a child that produced no report (`EMPTY_REPORT_NUDGE`) unless the stop was `'max_steps'`. With this ladder, an all-empty specialist costs up to 4 provider calls (2 per turn × initial + nudge) before the honest failure — bounded composition, not a conflict. Do not "fix" it.
- **Gate arms `'unknown'`/`undefined` are dead against ai@7** (review finding 4): the installed SDK's FinishReason has no `'unknown'`, and `undefined` only arises on the interrupted path the predicate already excludes. They stay — spec-mandated belt-and-suspenders against SDK drift — but don't mistake them for exercised paths.

- [ ] **Step 3: Run the whole loop suite — all new tests green, nothing else broken**

Run: `cd /home/destin/youcoded-dev/worktrees/empty-step-recovery/desktop && npx vitest run tests/harness-session-loop.test.ts`
Expected: PASS (including all 9 new tests).

- [ ] **Step 4: Spec case 10 (harness half) — stall watchdog suite untouched and green**

Run: `git -C /home/destin/youcoded-dev/worktrees/empty-step-recovery diff --stat -- desktop/tests/harness-stall-watchdog.test.ts` → empty output (file untouched).
Run: `cd /home/destin/youcoded-dev/worktrees/empty-step-recovery/desktop && npx vitest run tests/harness-stall-watchdog.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/empty-step-recovery
git add desktop/src/main/harness/harness-session.ts
git commit -m "fix(harness): bounded silent retry for empty final steps; honest 'empty_response' turn end

A step with no text and no tool calls yet an orderly finishReason used to end
the turn as a silent end_turn — experienced as ~3min of nothing after a tool
result (spec 2026-08-21-empty-final-step-turn-recovery-design.md). Now: one
silent re-run (history untouched, both attempts billed), then an honest
'empty_response' stop. finishReason-gated so 'length'/'content-filter' keep
today's exact behavior. No new events or IPC; one console.error for diagnosis.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Renderer footer copy (spec case 9) + full verification

**Files:**
- Modify: `desktop/src/renderer/components/AssistantTurnBubble.test.tsx` (two tests in the existing `stop reason footer` describe)
- Modify: `desktop/src/renderer/components/AssistantTurnBubble.tsx` (one map entry + one stale-comment fix)

- [ ] **Step 1: Write the failing tests** — inside `describe('AssistantTurnBubble — stop reason footer', …)` (≈L351), after the existing `says nothing for a normal completion` test, reusing its `turnWithStopReason` and `renderTurn` helpers:

```ts
  it('renders the empty-response copy for stopReason empty_response', () => {
    // Empty-step recovery (spec 2026-08-21): the harness already retried once
    // silently — this footer is the honest end after a SECOND contentless step.
    const { container } = renderTurn({
      turn: turnWithStopReason('empty_response'),
      toolGroups: new Map(),
      toolCalls: new Map(),
    });
    expect(container.textContent).toContain('The model returned an empty response. Retrying may help.');
  });

  it('end_turn never renders the empty-response copy', () => {
    const { container } = renderTurn({
      turn: turnWithStopReason('end_turn'),
      toolGroups: new Map(),
      toolCalls: new Map(),
    });
    expect(container.textContent).not.toContain('empty response');
  });
```

- [ ] **Step 2: Run and confirm the first fails the right way**

Run: `cd /home/destin/youcoded-dev/worktrees/empty-step-recovery/desktop && npx vitest run src/renderer/components/AssistantTurnBubble.test.tsx`
Expected: the first new test FAILS showing the fallback `Response ended: empty_response.` (proof the fallback already covers unknown reasons, per spec — the map entry is polish). The second PASSES (end_turn is filtered at the render gate).

- [ ] **Step 3: Add the map entry** in `stopReasonCopy` (`AssistantTurnBubble.tsx` ≈L32). Anchor — find the `question_dismissed` entry ending the map:

```ts
    question_dismissed: 'Question closed — waiting for you.',
  };
```

Replace with:

```ts
    question_dismissed: 'Question closed — waiting for you.',
    // Empty-step recovery (spec 2026-08-21): the harness already retried once
    // silently; this is the honest end after a SECOND contentless step.
    // Deliberately provider-neutral ("The model") — per the error-message
    // standards this is general + non-committal, and the failure belongs to
    // the model, not the assistant persona.
    empty_response: 'The model returned an empty response. Retrying may help.',
  };
```

Also fix-on-sight the stale count in the comment ABOVE the function (it says "four keys" over a map that had six entries before this edit and seven after): change `// The four keys below are the` to `// The keys below are the`. Nothing else in that comment changes.

- [ ] **Step 4: Re-run the bubble suite** — same command as Step 2. Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Full branch verification (required final gate)**

Run from the WORKSPACE root:

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh empty-step-recovery
```

Expected: green — one exit code covering `tsc --noEmit`, `vitest related` on the changed files, `knip`, `eslint`, and the ast-grep invariant scan. **This covers `youcoded/desktop` ONLY** (it says so on exit); no Android/worker step is needed here because the change is desktop-main + shared-React only, and the Kotlin native path carries `stopReason` opaquely (verified in the spec, §4 Part 3 — `ManagedSession.kt:300`, `TranscriptSerializer.kt:94`; the `stop_reason` hits in `SessionBrowser.kt`/`TranscriptWatcher.kt` are CC-transcript parsers, not native consumers). If verify.sh reports anything red, fix it before committing — do not rationalize a red check.

- [ ] **Step 6: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/empty-step-recovery
git add desktop/src/renderer/components/AssistantTurnBubble.tsx desktop/src/renderer/components/AssistantTurnBubble.test.tsx
git commit -m "feat(renderer): footer copy for the new 'empty_response' turn end (spec case 9)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Fully-silent turn rendering (spec decision 4 / review finding 1) + final verification

**Why this exists:** the independent plan review found that a turn whose every step
was contentless never creates an assistant turn in the renderer (`getOrCreateTurn`,
`chat-reducer.ts` ~L84, is only called by content actions), and the
`TRANSCRIPT_TURN_COMPLETE` handler (~L1405) skips metadata when `currentTurnId` is
null — AND the bubble renders footers per-bubble (`isLastBubble` gate, ~L430), so
even a created-but-empty turn would render nothing. Without this task the
worst-case shape of the bug still ends in unexplained silence. Two halves, both
additive, isolated in ONE commit for easy reversal (flagged for Destin's review).

**Files:**
- Modify: `desktop/src/renderer/state/__tests__/chat-reducer.test.ts` (two tests)
- Modify: `desktop/src/renderer/state/chat-reducer.ts` (`TRANSCRIPT_TURN_COMPLETE` case)
- Modify: `desktop/src/renderer/components/AssistantTurnBubble.test.tsx` (one test)
- Modify: `desktop/src/renderer/components/AssistantTurnBubble.tsx` (footer-only render path)

- [ ] **Step 1: Failing reducer tests** — use the file's existing conventions
  (`initState()` via `createSessionChatState()`, raw action objects `as any`):
  - `creates a footer-only turn when turn-complete carries an abnormal stopReason and no content streamed`:
    dispatch `TRANSCRIPT_TURN_COMPLETE` with `stopReason: 'empty_response'` (+ model/usage)
    on a fresh session → expect ONE `assistantTurns` entry with `segments: []`,
    `stopReason 'empty_response'`, stamped model/usage, a matching timeline entry,
    and `currentTurnId` null afterwards (endTurn still ran).
  - `end_turn with no content still creates no turn`: same dispatch with
    `stopReason: 'end_turn'` → `assistantTurns.size === 0`, timeline unchanged
    (pins today's skip so normal CC/native completions never grow ghost turns).
- [ ] **Step 2: Reducer change** — in the `TRANSCRIPT_TURN_COMPLETE` case, when
  `completingTurnId` is null AND `action.stopReason` is truthy and `!== 'end_turn'`,
  call `getOrCreateTurn(session)` first and stamp the metadata on the created turn,
  then fall through to the existing `endTurn` call. WHY comment citing spec
  decision 4. Do NOT touch `TRANSCRIPT_INTERRUPT` (user-initiated silence is
  self-explanatory — deliberate non-goal).
- [ ] **Step 3: Failing bubble test** — a turn with `stopReason: 'empty_response'`
  and NO segments renders the footer copy (reuse `turnWithStopReason` but empty its
  segments, or build the turn literal).
- [ ] **Step 4: Bubble change** — when a turn has zero bubbles and an abnormal
  stopReason (`stopReason && stopReason !== 'end_turn'`), render the
  `StopReasonFooter` (plus metadata strip if `showTurnMetadata`) as a footer-only
  row instead of returning nothing. Keep it inert for zero-bubble turns WITHOUT an
  abnormal stopReason (today's no-render stays).
- [ ] **Step 5: Run both suites** — reducer + bubble tests green; then the moved
  final gate: `cd /home/destin/youcoded-dev && bash scripts/verify.sh empty-step-recovery`
  (green, desktop-only caveat noted) and the Task 4 Step 4 stall-watchdog checks
  still hold.
- [ ] **Step 6: Commit** (its own commit):

```bash
cd /home/destin/youcoded-dev/worktrees/empty-step-recovery
git add desktop/src/renderer/state/chat-reducer.ts desktop/src/renderer/state/__tests__/chat-reducer.test.ts desktop/src/renderer/components/AssistantTurnBubble.tsx desktop/src/renderer/components/AssistantTurnBubble.test.tsx
git commit -m "feat(renderer): render the empty_response footer even when the turn streamed nothing (spec decision 4)

Review-driven addition: content-creating actions are what mint assistant turns,
so a fully-contentless empty_response turn had nothing to attach its honest
footer to — the worst-case shape of the bug stayed silent. Reducer now creates
the turn on abnormal-stopReason turn-complete; the bubble renders a footer-only
row for it. end_turn/interrupt behavior unchanged.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## After the plan (not tasks — session hygiene)

- Do NOT merge, push, or open a PR unprompted — report the branch state and stop (iteration-mode convention). The deferred items (post-turn Retry affordance, park-card visibility triage — spec Parts 3/4) stay deferred; do not implement them.
- When the branch DOES merge later: archive the spec + this plan to `docs/archive/`, flip the ROADMAP bug entry, remove the worktree per workspace rules.

## Verification notes (what differed from expectations — none contradict the spec)

1. **Bubble test location:** `AssistantTurnBubble.test.tsx` lives at `desktop/src/renderer/components/`, NOT `desktop/tests/`. The spec named the file without a path; this plan uses the real one.
2. **No reasoning-chunk scripting helper existed** in `tests/helpers/scripted-model.ts` — Task 2 adds `reasoningChunks`, with the raw part shape verified against `@ai-sdk/provider` typings (`{ type: 'reasoning-delta', id, delta }`).
3. **Stale comment found at the renderer edit site:** the `stopReasonCopy` header comment says "four keys" over a six-entry map. Fixed on sight in Task 5 (one-word edit), per the workspace "doc contradicting code → fix on sight" rule.
4. All spec line anchors re-verified at the quoted lines on the worktree (`mapStopReason` L259, `StepResult` L239–247, turnLoop L1656, push L1711, break L1715, `willRetry` expression L2017, reasoning fallback partId L2217, `stopReasonCopy` L32, `turn-complete` emit L1822). `'empty_response'` has no other main-process consumer to update: the only value-branching consumer of `stopReason` outside `harness-session.ts` is the `'max_steps'` check in `native-session-host.ts` (≈L1581/L1609), which correctly treats any other string as a natural finish.
