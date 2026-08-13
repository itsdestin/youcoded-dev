---
status: draft
date: 2026-08-13
spec: docs/active/specs/2026-08-13-dismiss-ends-turn-design.md
tags: [native-runtime, harness-tools, permissions, askuserquestion, chat-ux]
repos: [youcoded, youcoded-dev]
---

# Dismiss Ends The Turn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In native sessions, clicking **Dismiss** on an `AskUserQuestion` card ends the turn and returns control to the user, instead of handing the model a "continue with your best judgment" note and running another step.

**Architecture:** The driver's interactive branch returns a driver-private `{ kind: 'end-turn', payload }` wrapper instead of a bare tool result. The tool loop records that result, back-fills any un-executed sibling calls in the same step, and `break turnLoop`s into the existing `turn-complete` emit with `stopReason: 'question_dismissed'` — the same orderly-stop path `max_steps` already uses. The renderer adds one entry to its stop-reason copy map.

**Tech Stack:** TypeScript, Electron main process (`src/main/harness/`), React renderer (`src/renderer/components/`), Vitest, Testing Library.

## Global Constraints

- **Repos:** code + depth docs in `youcoded/`; rules + lifecycle docs in `youcoded-dev/`. Never mix the two in one commit.
- **Verification gate:** `bash scripts/verify.sh <worktree>` from the workspace root before claiming any task done. It covers `youcoded/desktop` only, which is the entire code surface of this plan.
- **Tool-call/result pairing is absolute.** Every collected tool-call gets a matching tool-result in `history` AND a matching `tool-result` transcript event. A dangling tool_call is rejected by provider APIs with a 400 on the *next* send and persists in history — the session is bricked, not degraded.
- **Emit surface is FROZEN.** No new `TranscriptEventType`. This change adds a new `stopReason` *value* on the existing `turn-complete` event, nothing more.
- **Exact copy strings** (byte-for-byte, including the em-dash `—` in the footer):
  - Model-facing dismissal: `The user closed this question without answering and took over. Stop here and wait for their next message.`
  - Sibling back-fill: `Not run: the turn ended when the user closed the question.`
  - stopReason value: `question_dismissed`
  - User-facing footer: `Question closed — waiting for you.`
- **Button label stays `Dismiss`.** Destin's call, 2026-08-13. No change to `ToolCard.tsx`.
- **WHY comments are required** on every non-trivial edit (workspace `CLAUDE.md`). Destin is a non-developer and reads comments to understand changes.
- **Never write a misleading error message.** In particular, the sibling back-fill must NOT reuse `CANCELED_TOOL_TEXT` ("the user interrupted this action") — the user did not interrupt.

## File Structure

| File | Repo | Responsibility | Change |
|---|---|---|---|
| `desktop/src/main/harness/harness-session.ts` | youcoded | The turn driver: tool loop, permission sequencing, turn-end emits | Modify — 3 new constants, `runOneTool` return type, interactive branch, loop call site |
| `desktop/tests/harness-session-loop.test.ts` | youcoded | Contract tests for the tool loop | Modify — rewrite 1 test (behavior change), add 2 |
| `desktop/src/renderer/components/AssistantTurnBubble.tsx` | youcoded | Turn rendering incl. stop-reason footer | Modify — 1 map entry |
| `desktop/src/renderer/components/AssistantTurnBubble.test.tsx` | youcoded | Bubble render tests | Modify — add a 2-test describe block |
| `desktop/src/main/harness/specialists/child-ask-policy.ts` | youcoded | Auto-denies asks raised by sub-agent children | Modify — comment only (its reasoning goes stale) |
| `desktop/docs/../docs/native-runtime.md` (`youcoded/docs/native-runtime.md`) | youcoded | Depth doc for the native runtime | Modify — ask-pauses-turn section |
| `.claude/rules/native-runtime.md` | youcoded-dev | Path-scoped rule, tool-loop invariants | Modify — 1 bullet |
| `.claude/rules/harness-tools.md` | youcoded-dev | Path-scoped rule, AskUserQuestion bullet | Modify — 1 bullet |

No new files. The change is small and lives entirely inside existing, well-bounded units.

---

### Task 0: Isolated worktree

**Files:** none (environment setup)

**Interfaces:**
- Consumes: nothing
- Produces: a worktree path used by every later task's `verify.sh` invocation

- [ ] **Step 1: Sync master first**

```bash
cd /home/destin/youcoded-dev/youcoded && git fetch origin && git pull origin master
```

- [ ] **Step 2: Create the worktree and branch**

```bash
cd /home/destin/youcoded-dev/youcoded
git worktree add ../worktrees/dismiss-ends-turn -b feat/dismiss-ends-turn
```

- [ ] **Step 3: Copy node_modules with hardlinks — NEVER symlink or junction**

```bash
cp -al /home/destin/youcoded-dev/youcoded/desktop/node_modules \
       /home/destin/youcoded-dev/worktrees/dismiss-ends-turn/desktop/node_modules
```

A symlink or junction here is destructive, not merely wrong: `npm ci` and `git worktree remove` both follow it and empty the **main checkout's** deps (verified 2026-08-13, six worktrees wiped at once). It also makes `verify.sh` silently skip suites — Vite resolves the real path, sees it outside the worktree root, and fails them at load with `Denied ID …?inline` while the summary still reads "1 check failed". `cp -al` is near-instant and has neither failure mode.

- [ ] **Step 4: Confirm the baseline is green before changing anything**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/dismiss-ends-turn
```

Expected: all checks pass. If the baseline is already red, stop and report — do not build on top of it.

---

### Task 1: The driver ends the turn on a dismissed question

**Files:**
- Modify: `youcoded/desktop/src/main/harness/harness-session.ts:318` (constants), `:1955` (signature), `:1993-1999` (interactive branch), `:1495-1531` (loop call site)
- Test: `youcoded/desktop/tests/harness-session-loop.test.ts:655` (rewrite), `:690` (insert two new tests after)

**Interfaces:**
- Consumes: `ToolResultPayload` (`src/main/harness/tools/types.ts:108`) — verified to have no `kind` property, so `'kind' in payload` narrows cleanly; the existing `'interrupted'` sentinel and labelled `turnLoop`; `this.toolResultPart(call, text)`; `this.emitEvent(type, data)`.
- Produces: `stopReason: 'question_dismissed'` on the `turn-complete` transcript event — Task 2 renders it. Module-private constants `DISMISSED_TOOL_TEXT`, `NOT_RUN_TOOL_TEXT`, `DISMISSED_STOP_REASON` (not exported; tests assert the literal strings).

- [ ] **Step 1: Rewrite the test that pins the OLD behavior**

`tests/harness-session-loop.test.ts:655` currently asserts the behavior we are deleting — its name literally ends "loop continues". Replace that whole `it(...)` block with:

```ts
    it('deny (dismissal) → records the result, ends the turn as question_dismissed, takes NO further step', async () => {
      const ask = fakeInteractive();
      const askUser = vi.fn(async (): Promise<AskDecision> => ({ behavior: 'deny' }));
      const seen: any[] = [];
      const model = scriptedModel([
        stream(toolCallChunk('c1', 'AskUserQuestion', oneQuestion()), finishChunk('tool-calls')),
        // If the loop wrongly continued it would consume this second step and
        // emit its text — which is exactly the guessing behavior this change removes.
        stream(...textChunks('b', 'GUESSED ANYWAY'), finishChunk('stop')),
      ], seen);
      const session = new HarnessSession(makeOpts({ tools: [ask], decide: async () => ALLOW, askUser }), async () => model as any);
      const events = collect(session);
      await session.send('go');

      // The dismissal is a REAL tool result on the real call id — pairing holds.
      const res = events.find((e) => e.type === 'tool-result')!;
      expect(res.data.toolUseId).toBe('c1');
      expect(res.data.isError).toBe(true);
      expect(res.data.toolResult).toBe('The user closed this question without answering and took over. Stop here and wait for their next message.');
      // The loop STOPPED: the model was consulted exactly once.
      expect(seen).toHaveLength(1);
      expect(events.some((e) => e.type === 'assistant-text' && e.data.text === 'GUESSED ANYWAY')).toBe(false);
      // ORDERLY end — turn-complete with the new reason, never a user-interrupt.
      const done = events.find((e) => e.type === 'turn-complete')!;
      expect(done.data.stopReason).toBe('question_dismissed');
      expect(events.some((e) => e.type === 'user-interrupt')).toBe(false);
    });
```

- [ ] **Step 2: Add the sibling back-fill test**

Insert immediately after the test from Step 1:

```ts
    it('multi-call step, dismissal on the FIRST call → sibling marked not-run, both paired, turn ends', async () => {
      // A step with two tool-calls where the first is the question. The sibling
      // must still get a tool-result or it dangles → provider 400 on the next
      // send. It must NOT get the interrupt copy: the user did not interrupt.
      const ask = fakeInteractive();
      const read = fakeTool('Read');
      const askUser = async (): Promise<AskDecision> => ({ behavior: 'deny' });
      const model = scriptedModel([
        stream(
          toolCallChunk('c1', 'AskUserQuestion', oneQuestion()),
          toolCallChunk('c2', 'Read', { file_path: 'x.ts' }),
          finishChunk('tool-calls'),
        ),
        stream(...textChunks('b', 'unreached'), finishChunk('stop')),
      ]);
      const session = new HarnessSession(makeOpts({ tools: [ask, read], decide: async () => ALLOW, askUser }), async () => model as any);
      const events = collect(session);
      await session.send('go');

      const results = events.filter((e) => e.type === 'tool-result');
      expect(results.map((e) => e.data.toolUseId)).toEqual(['c1', 'c2']);
      expect(results[1].data.toolResult).toBe('Not run: the turn ended when the user closed the question.');
      expect(results[1].data.toolResult).not.toMatch(/interrupted/i);
      expect(results[1].data.isError).toBe(true);
      expect((read as any).calls).toHaveLength(0);   // sibling never executed

      // Pairing invariant: every tool-call in history has a matching tool-result.
      const history = (session as any).history as any[];
      const callIds = new Set<string>(); const resultIds = new Set<string>();
      for (const m of history) {
        if (!Array.isArray(m.content)) continue;
        for (const part of m.content) {
          if (part?.type === 'tool-call') callIds.add(part.toolCallId);
          if (part?.type === 'tool-result') resultIds.add(part.toolCallId);
        }
      }
      expect([...callIds].sort()).toEqual(['c1', 'c2']);
      expect([...resultIds].sort()).toEqual(['c1', 'c2']);
      expect(events.find((e) => e.type === 'turn-complete')!.data.stopReason).toBe('question_dismissed');
    });
```

- [ ] **Step 3: Run the two tests to verify they FAIL**

```bash
cd /home/destin/youcoded-dev/worktrees/dismiss-ends-turn/desktop
npx vitest run tests/harness-session-loop.test.ts -t 'dismissal' 2>&1 | tail -30
```

Expected: both FAIL. Step 1's test fails on `expect(seen).toHaveLength(1)` (currently 2 — the loop runs another step) or on the `toolResult` string. Step 2's test fails because no second `tool-result` is emitted at all.

If either test *passes* here, stop — the test is not exercising the behavior it claims.

- [ ] **Step 4: Add the three constants**

In `src/main/harness/harness-session.ts`, immediately after `CANCELED_TOOL_TEXT` (line 318):

```ts
// Returned to the model when the user closes an AskUserQuestion card without
// answering. The OLD copy ("Continue with your best judgment") invited the model
// to guess and keep working — which is the behavior this replaces. This states
// the outcome instead: the user has taken the turn back. It is a real tool
// result (pairing holds); the driver stops the loop right after recording it.
// Spec: youcoded-dev/docs/active/specs/2026-08-13-dismiss-ends-turn-design.md
const DISMISSED_TOOL_TEXT =
  'The user closed this question without answering and took over. Stop here and wait for their next message.';

// Back-filled into the still-un-executed calls of a step that ended because the
// user dismissed a question. Deliberately NOT CANCELED_TOOL_TEXT: that says "the
// user interrupted this action", and the user did not interrupt — a wrong cause
// in a message the model reads is worse than a vague one.
const NOT_RUN_TOOL_TEXT = 'Not run: the turn ended when the user closed the question.';

// stopReason for that orderly stop. AssistantTurnBubble maps it to the
// "Question closed — waiting for you." footer, so a dismissed turn can't be
// mistaken for a session that silently died.
const DISMISSED_STOP_REASON = 'question_dismissed';
```

- [ ] **Step 5: Widen `runOneTool`'s return type**

Immediately above the `runOneTool` doc comment (line 1951), add:

```ts
/** Driver-private "record this result, THEN end the turn" wrapper.
 *
 *  WHY this is not a flag on ToolResultPayload: that type is what EVERY tool
 *  returns, so an `endsTurn` field there would let any tool end a turn — a far
 *  bigger promise than this change makes. Only runOneTool's interactive branch
 *  constructs this, and ToolResultPayload has no `kind` property, so the loop
 *  can narrow on `'kind' in payload` with no ambiguity. */
type EndTurnResult = { kind: 'end-turn'; payload: ToolResultPayload };
```

Then change the signature on line 1955 from:

```ts
  private async runOneTool(call: ToolCall, recentCalls: string[]): Promise<ToolResultPayload | 'interrupted'> {
```

to:

```ts
  private async runOneTool(call: ToolCall, recentCalls: string[]): Promise<ToolResultPayload | 'interrupted' | EndTurnResult> {
```

Also extend the doc comment's last sentence (line 1953-1954) from "except a user cancel which returns the 'interrupted' sentinel so the loop can unwind" to:

```ts
   *  a user cancel which returns the 'interrupted' sentinel, and a dismissed
   *  question which returns EndTurnResult — both let the loop unwind. */
```

- [ ] **Step 6: Change the interactive branch to end the turn**

In `runOneTool`, replace the non-allow line inside `if (tool.interactive)` (line 1997):

```ts
      if (d.behavior !== 'allow') return { text: 'The user dismissed the question without answering. Continue with your best judgment, or ask differently in plain text.', isError: true };
```

with:

```ts
      // Dismissal ENDS THE TURN. Closing a question is the user taking the turn
      // back, not permission to guess. Still a real tool result so call/result
      // pairing holds — the loop stops immediately after recording it.
      if (d.behavior !== 'allow') return { kind: 'end-turn', payload: { text: DISMISSED_TOOL_TEXT, isError: true } };
```

- [ ] **Step 7: Handle the new result in the tool loop**

In `send()`'s tool-execution loop, immediately AFTER the closing brace of the `if (payload === 'interrupted') { ... }` block (line 1518) and BEFORE the `resolveToolImages` call (line 1522), insert:

```ts
          // The user dismissed a question → end the turn ORDERLY. Record THIS
          // call's real result, then mark every remaining un-executed call in the
          // step as not-run (same dangling-tool_call hazard the interrupt branch
          // above guards against). `turn-complete` rather than `user-interrupt`
          // on purpose: usage should be reported, and anything the user queued
          // while the turn ran should drain — typing during the turn IS taking
          // over. `max_steps` below is the existing precedent for a
          // driver-decided orderly stop.
          if ('kind' in payload) {
            this.emitEvent('tool-result', {
              toolUseId: call.toolCallId, toolName: call.toolName,
              toolResult: payload.payload.text, isError: true,
            });
            resultParts.push(this.toolResultPart(call, payload.payload.text));
            for (let j = i + 1; j < step.toolCalls.length; j++) {
              const rem = step.toolCalls[j];
              this.emitEvent('tool-result', { toolUseId: rem.toolCallId, toolName: rem.toolName, toolResult: NOT_RUN_TOOL_TEXT, isError: true });
              resultParts.push(this.toolResultPart(rem, NOT_RUN_TOOL_TEXT));
            }
            this.history.push({ role: 'tool', content: resultParts });
            stopReason = DISMISSED_STOP_REASON;
            break turnLoop;
          }
```

`break turnLoop` exits both the inner `for` and the outer step loop, landing on the existing `turn-complete` emit — so usage accumulation, the generation-time denominator, and `contextUsedTokens` all keep working with no duplication. `injectPathTriggers` and the `max_steps` gate are correctly skipped: the turn is over.

- [ ] **Step 8: Run the loop suite in full**

```bash
cd /home/destin/youcoded-dev/worktrees/dismiss-ends-turn/desktop
npx vitest run tests/harness-session-loop.test.ts 2>&1 | tail -30
```

Expected: PASS, every test. Three existing tests are load-bearing discrimination guards and must still pass **unchanged** — if any needed editing, the implementation is wrong:

- `canceled (interrupt) → back-filled canceled result + user-interrupt, no turn-complete` (line ~673) — proves ESC and Dismiss produce *different* outcomes.
- `multi-call step, interactive cancel on the FIRST call → BOTH calls back-filled canceled + user-interrupt` (line ~692) — proves the interrupt back-fill still uses the interrupt copy.
- The ordinary-permission-deny test (line ~130, `decide: async () => ({ action: 'deny', ... })`) — proves a declined Bash/Write still lets the model try something else.

- [ ] **Step 9: Full verification gate**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/dismiss-ends-turn
```

Expected: all checks pass (tsc, affected vitest, knip, eslint, ast-grep).

- [ ] **Step 10: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/dismiss-ends-turn
git add desktop/src/main/harness/harness-session.ts desktop/tests/harness-session-loop.test.ts
git commit -m "feat(harness): dismissing a question ends the native turn

Closing an AskUserQuestion card handed the model 'continue with your best
judgment' and ran another step, so the one gesture meaning 'stop, I'll tell
you what I want' was the gesture that made it guess.

The interactive branch now returns a driver-private end-turn wrapper. The
loop records the real result, back-fills un-executed siblings with their own
not-run text (NOT the interrupt copy — the user did not interrupt), and
breaks to turn-complete with stopReason question_dismissed. Orderly, not an
interrupt: usage is reported and queued messages drain.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The renderer names what happened

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/AssistantTurnBubble.tsx:32-42`
- Test: `youcoded/desktop/src/renderer/components/AssistantTurnBubble.test.tsx` (append a describe block)

**Interfaces:**
- Consumes: `stopReason: 'question_dismissed'` from Task 1, arriving via `App.tsx:1201` (`stopReason: event.data.stopReason ?? null`) into `AssistantTurn.stopReason`. The existing `StopReasonFooter` and its render gate (`AssistantTurnBubble.tsx:422`) are reused as-is.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the two failing tests**

Append to `src/renderer/components/AssistantTurnBubble.test.tsx`. It reuses the file's existing `renderTurn` helper (defined at line ~98) and the `AssistantTurn` shape used throughout:

```tsx
describe('AssistantTurnBubble — stop reason footer', () => {
  beforeEach(() => cleanup());

  // The turn shape the reducer produces; only stopReason varies between the two
  // cases, which is what makes the pair a real discrimination test.
  function dismissedTurn(stopReason: string | null): AssistantTurn {
    return {
      id: 'turn_dismissed',
      segments: [{ type: 'text', content: 'Which one did you want?', messageId: 'm1' }],
      timestamp: 0,
      stopReason,
      model: null,
      usage: null,
      anthropicRequestId: null,
    };
  }

  it('names a dismissed question so it cannot be mistaken for a dead session', () => {
    const { container } = renderTurn({
      turn: dismissedTurn('question_dismissed'),
      toolGroups: new Map(),
      toolCalls: new Map(),
    });
    expect(container.textContent).toContain('Question closed — waiting for you.');
  });

  it('says nothing for a normal completion', () => {
    // Without this, a footer that renders unconditionally passes the test above.
    const { container } = renderTurn({
      turn: dismissedTurn('end_turn'),
      toolGroups: new Map(),
      toolCalls: new Map(),
    });
    expect(container.textContent).not.toContain('Question closed');
  });
});
```

If `AssistantTurn` is not already imported in this file, add it to the existing type import from `../state/chat-types`.

- [ ] **Step 2: Run the tests to verify the first FAILS**

```bash
cd /home/destin/youcoded-dev/worktrees/dismiss-ends-turn/desktop
npx vitest run src/renderer/components/AssistantTurnBubble.test.tsx -t 'stop reason footer' 2>&1 | tail -30
```

Expected: the first test FAILS — the fallback copy renders `Response ended: question_dismissed.` instead. The second test PASSES already (nothing renders for `end_turn`); that is correct and expected.

- [ ] **Step 3: Add the copy entry**

In `src/renderer/components/AssistantTurnBubble.tsx`, add one line to the `map` inside `stopReasonCopy` (after the `interrupted` entry, line 39):

```ts
    // Deliberately provider-neutral (no assistantName interpolation): this
    // sentence is about the user's own action, not about the assistant. Without
    // it a dismissed turn is visually identical to a session that silently died,
    // and the user can't trust either signal.
    question_dismissed: 'Question closed — waiting for you.',
```

- [ ] **Step 4: Run the tests to verify both PASS**

```bash
cd /home/destin/youcoded-dev/worktrees/dismiss-ends-turn/desktop
npx vitest run src/renderer/components/AssistantTurnBubble.test.tsx -t 'stop reason footer' 2>&1 | tail -20
```

Expected: 2 passed.

- [ ] **Step 5: Full verification gate**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/dismiss-ends-turn
```

Expected: all checks pass.

- [ ] **Step 6: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/dismiss-ends-turn
git add desktop/src/renderer/components/AssistantTurnBubble.tsx desktop/src/renderer/components/AssistantTurnBubble.test.tsx
git commit -m "feat(chat): footer names a turn that ended on a dismissed question

Without it, dismissing looks identical to a session that silently died — and
the app has a real failure banner for that, so an ambiguous signal costs the
user the ability to trust either one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Correct the docs and comments this change falsifies

**Files:**
- Modify: `youcoded/desktop/src/main/harness/specialists/child-ask-policy.ts:8-22`
- Modify: `youcoded/docs/native-runtime.md`
- Modify: `youcoded-dev/.claude/rules/native-runtime.md`
- Modify: `youcoded-dev/.claude/rules/harness-tools.md`

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1 and 2.
- Produces: nothing consumed by later tasks.

Three shipped statements become wrong the moment Task 1 merges. The workspace rule is fix-on-sight; leaving them turns a correct change into a source of future wrong decisions.

- [ ] **Step 1: Fix the sub-agent ask-policy comment**

`child-ask-policy.ts`'s header comment enumerates what a deny does for each ask kind. Replace its `interactive AskUserQuestion` bullet (lines 15-17):

```
 * - interactive AskUserQuestion (line 1817): belt-and-suspenders — AskUserQuestion
 *   is never in allowedTools for a child, so this ask never surfaces; a deny here
 *   prevents any hypothetical interactive tool from hanging a child.
```

with:

```
 * - interactive AskUserQuestion: belt-and-suspenders — AskUserQuestion is in no
 *   child's allowedTools (verified: zero matches in specialists/builtins.ts, the
 *   only file that populates the field), so this ask never surfaces. Since
 *   2026-08-13 a deny on an interactive tool ENDS THE TURN rather than returning
 *   corrective text, so a hypothetical interactive tool would stop a child
 *   cleanly instead of hanging it — still the outcome this policy wants.
```

Note the stale `(line 1817)` / `(line 1424)` / `(line 1800)` line references throughout that comment are already drifted. Update only the bullet above; wholesale renumbering is out of scope.

- [ ] **Step 2: Fix the workspace rule bullets**

In `youcoded-dev/.claude/rules/native-runtime.md`, under `## Tool loop`, replace:

```
- **An ask PAUSES the turn, not ends it** — no re-`send()` while open; **`PERMISSION_RESPOND` tries the `native-`-prefixed broker first**, then hookRelay.
```

with:

```
- **An ask PAUSES the turn, not ends it** — no re-`send()` while open; **`PERMISSION_RESPOND` tries the `native-`-prefixed broker first**, then hookRelay. **ONE carve-out: a dismissed INTERACTIVE ask (AskUserQuestion deny) ends the turn** — orderly `turn-complete` with `stopReason: 'question_dismissed'`, never `user-interrupt`; siblings back-fill with `NOT_RUN_TOOL_TEXT`, not the interrupt copy — guard: `harness-session-loop` ("dismissal").
```

In `youcoded-dev/.claude/rules/harness-tools.md`, under `## Web tools (Plan B)`, replace the AskUserQuestion bullet:

```
- **AskUserQuestion rides the permission-ask rail** — the broker threads `decision.updatedInput`; `formatAnswers` is TOTAL (a throw = dangling tool_call = bricked session) — guards: `native-permission-broker`/`ask-user-question-tool`.
```

with:

```
- **AskUserQuestion rides the permission-ask rail** — the broker threads `decision.updatedInput`; `formatAnswers` is TOTAL (a throw = dangling tool_call = bricked session). **A DENY ends the turn** (`question_dismissed`), unlike an ordinary permission deny which the model may work around — guards: `native-permission-broker`/`ask-user-question-tool`/`harness-session-loop`.
```

- [ ] **Step 3: Add the depth-doc paragraph**

In `youcoded/docs/native-runtime.md`, find the section covering the tool loop's ask semantics (search for `PAUSES` or `askUser`) and add:

```markdown
**A dismissed question ends the turn (2026-08-13).** Denying an ordinary
permission ask returns "the user declined this action" and the model may try a
different approach — that is still true. An interactive ask is different: the
user closing an `AskUserQuestion` card is them taking the turn back, so the
driver records `DISMISSED_TOOL_TEXT` as that call's real result, back-fills any
un-executed siblings in the step with `NOT_RUN_TOOL_TEXT`, and `break turnLoop`s
to `turn-complete` with `stopReason: 'question_dismissed'`.

Three things are load-bearing. It is `turn-complete`, not `user-interrupt`: an
interrupted turn skips the usage payload and the reducer stamps
`stopReason: 'interrupted'`, and a dismissal should report usage and let queued
messages drain (typing during the turn IS taking over). The sibling copy is its
own string, because `CANCELED_TOOL_TEXT` names a cause — "the user interrupted
this action" — that did not happen. And the signal is a driver-private
`EndTurnResult` wrapper rather than a field on `ToolResultPayload`, so an
ordinary tool cannot end a turn.
```

- [ ] **Step 4: Verify the rule anchors still resolve**

```bash
cd /home/destin/youcoded-dev && node scripts/audit-anchors.mjs 2>&1 | tail -20
```

Expected: no new failures versus the pre-change run. This checks the `verify:` blocks in the rules you just edited still point at real files and real regexes.

- [ ] **Step 5: Commit the code-repo half**

```bash
cd /home/destin/youcoded-dev/worktrees/dismiss-ends-turn
git add desktop/src/main/harness/specialists/child-ask-policy.ts docs/native-runtime.md
git commit -m "docs(native): a dismissed question now ends the turn

Both statements were true until this branch and are wrong after it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Commit the workspace-repo half separately**

Rules live in `youcoded-dev`, code lives in `youcoded` — never one commit.

```bash
cd /home/destin/youcoded-dev
git add .claude/rules/native-runtime.md .claude/rules/harness-tools.md
git commit -m "docs(rules): carve out the dismissed-ask exception to ask-pauses-turn

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Ship

**Files:** none (integration)

**Interfaces:**
- Consumes: the three commits on `feat/dismiss-ends-turn` plus the workspace-repo commit.
- Produces: merged master, archived spec/plan.

- [ ] **Step 1: Final full verification**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh worktrees/dismiss-ends-turn --full
```

Expected: all checks pass. `--full` (not the default affected-tests mode) because this touches the driver every native session runs through.

- [ ] **Step 2: Hand the visual check to Destin, do NOT script it**

Ask Destin to run `bash scripts/run-dev.sh dismiss-ends-turn --label "Dismiss Ends Turn"`, start a native session, get the assistant to ask a question, and click Dismiss. He is looking for: the turn stops, the footer reads *"Question closed — waiting for you."*, and typing a follow-up works normally.

Workspace rule: final-stage interactive verification goes to Destin rather than a scripted rig — he can eyeball it in 30 seconds. Do not build a CDP harness for this.

- [ ] **Step 3: Offer a harness eval run — do NOT run it unasked**

This changes a native harness tool's behavior, which is the documented trigger for offering the evaluator. Tell Destin: `--dry-run` is free; a real run is measured at ~$0.25 per cell and needs `--key-file`. Note the spec's flagged side effect — `run-case.ts:586` denies `AskUserQuestion` during wrap-up, so that turn now ends a beat earlier and small eval shifts have this as their first suspect. **Let him decide.**

- [ ] **Step 4: Merge and push both repos**

```bash
cd /home/destin/youcoded-dev/youcoded
git checkout master && git pull origin master
git merge --no-ff feat/dismiss-ends-turn
git push origin master

cd /home/destin/youcoded-dev && git push origin master
```

- [ ] **Step 5: Confirm the commit landed before cleanup**

```bash
cd /home/destin/youcoded-dev/youcoded && git branch --contains $(git rev-parse feat/dismiss-ends-turn)
```

Expected: `master` is listed. Do not proceed to Step 6 until it is.

- [ ] **Step 6: Clean up the worktree and branch**

```bash
cd /home/destin/youcoded-dev/youcoded
git worktree remove ../worktrees/dismiss-ends-turn
git branch -D feat/dismiss-ends-turn
git push origin --delete feat/dismiss-ends-turn
```

`-D` not `-d`: a `--no-ff` merge leaves the tip non-ancestral. If a dev server was started for Step 2, shut it down now — an orphaned Vite server holds port 5223 and breaks the next session's launch.

- [ ] **Step 7: Archive the lifecycle docs in the same session**

```bash
cd /home/destin/youcoded-dev
sed -i 's/^status: draft$/status: shipped/' docs/active/specs/2026-08-13-dismiss-ends-turn-design.md docs/active/plans/2026-08-13-dismiss-ends-turn.md
git mv docs/active/specs/2026-08-13-dismiss-ends-turn-design.md docs/archive/specs/
git mv docs/active/plans/2026-08-13-dismiss-ends-turn.md docs/archive/plans/
git commit -m "docs: archive the dismiss-ends-turn spec and plan

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin master
```

"Merge means merge AND push AND archive the docs." No ROADMAP item exists for this work (it went spec → plan → build in one session), so there is nothing to flip.

---

## Self-review

**Spec coverage.** Every spec section maps to a task: driver ends the turn → Task 1 Steps 4-7; loop unwinds cleanly with sibling back-fill → Task 1 Step 7 + its test in Step 2; renderer names it → Task 2; card unchanged → no task, asserted by the absence of `ToolCard.tsx` from the file table; the six-row testing table → Task 1 Steps 1-2 and 8 (three existing tests named as must-pass-unchanged) plus Task 2 Step 1; docs and rules → Task 3; the two known side effects → Task 3 Step 1 (sub-agents) and Task 4 Step 3 (harness evaluator).

**Type consistency.** `EndTurnResult`, `DISMISSED_TOOL_TEXT`, `NOT_RUN_TOOL_TEXT`, `DISMISSED_STOP_REASON`, and the literal `'question_dismissed'` are spelled identically in every task and in every test assertion. The narrowing predicate is `'kind' in payload` throughout — valid because `ToolResultPayload` (`tools/types.ts:108-122`) has no `kind` property, verified against source.

**Scope.** One subsystem, four tasks, no decomposition needed.
