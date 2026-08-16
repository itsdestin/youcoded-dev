---
status: shipped
date: 2026-08-13
tags: [native-runtime, harness-tools, permissions, askuserquestion, chat-ux]
repos: [youcoded]
---

# Dismissing a question ends the turn

**Problem in one line:** in native sessions, dismissing an `AskUserQuestion`
card hands the model a "continue with your best judgment" note and the turn
keeps running — so the one gesture that means *stop, I'll tell you what I want*
is the gesture that makes the assistant guess and press on.

## Current behavior (verified against master, 2026-08-13)

1. `AskUserQuestionCard` renders the options plus **Submit** and **Dismiss**
   (`desktop/src/renderer/components/ToolCard.tsx:918-941`).
2. Dismiss sends `{ decision: { behavior: 'deny' } }` over the shared
   `permission:respond` channel (`ToolCard.tsx:824-840`).
3. `PermissionBroker.respond` normalizes anything non-`allow` to `deny` and
   resolves the pending ask (`desktop/src/main/harness/permission-broker.ts:80-108`).
4. The driver's interactive branch turns that into a tool result and **returns
   to the loop**, which runs the next step
   (`desktop/src/main/harness/harness-session.ts:1993-1999`):

   > The user dismissed the question without answering. Continue with your best
   > judgment, or ask differently in plain text.

The model reads that as a licence to guess. Nothing about the turn ends.

## Desired behavior

Dismiss closes the question **and ends the turn**. The thinking indicator
stops, the input box is the user's, and the assistant takes no further step
until the user sends a message.

## Scope

- **Native sessions only.** The Claude Code path routes its asks through
  `hook-relay` into the CC CLI, which owns the post-deny behavior; the app
  cannot change it. `AskUserQuestionCard` is shared, so the *card* is shared,
  but only the native driver's interpretation of `deny` changes. *(As shipped,
  narrower still: only a deny that came through `PermissionBroker.respond` —
  i.e. a human's — see the correction under "Known side effects".)*
- **Desktop only.** Native sessions have no Android implementation (M8), and
  `remote-shim.ts:1534` hardcodes `supported: false` inside its `native` block,
  so the remote browser never drives one either. No cross-platform parity work.
- **Interactive tools only.** Denying an ordinary permission ask (Bash, Write,
  external-directory) keeps its current meaning — the model reads "the user
  declined this action" and may try a different approach
  (`harness-session.ts:2034`). That path is untouched.
- **The button keeps the label "Dismiss."** Destin's call, 2026-08-13. The
  new meaning is carried by the footer copy below, not a relabel.

## Design

### 1. The driver ends the turn instead of continuing

`runOneTool`'s interactive branch (`harness-session.ts:1993-1999`) currently
returns a plain `ToolResultPayload` on a non-`allow`, non-`canceled` decision.
It must instead signal *this result, then stop*.

**Constraint:** the mechanism must not be reachable by an ordinary tool.
`ToolResultPayload` is the type every tool returns; putting an `endsTurn` flag
on it would let any tool end a turn, which is a far larger promise than this
change makes. Use a driver-private discriminated return instead — the same
shape the existing `'interrupted'` sentinel already establishes:

```
Promise<ToolResultPayload | 'interrupted' | { kind: 'end-turn'; payload: ToolResultPayload }>
```

Only the interactive branch may produce `kind: 'end-turn'`.

The model-facing text changes to state the outcome rather than invite a guess:

> The user closed this question without answering and took over. Stop here and
> wait for their next message.

`canceled` still returns `'interrupted'`, unchanged — ESC is not Dismiss.

### 2. The tool loop unwinds cleanly

At the call site (`harness-session.ts:1495-1531`), an `end-turn` result:

1. Emits the `tool-result` event and pushes the result part for **this** call —
   the real dismissal text, not a synthetic one.
2. Back-fills every **remaining un-executed call in the same step** with a
   not-run result, exactly as the `'interrupted'` branch does at lines
   1510-1514, but with its own text: `NOT_RUN_TOOL_TEXT = 'Not run: the turn
   ended when the user closed the question.'` Reusing `CANCELED_TOOL_TEXT`
   ("the user interrupted this action") would be a misleading error message —
   the user did not interrupt.
3. Pushes `{ role: 'tool', content: resultParts }`.
4. Emits **`turn-complete`**, not `user-interrupt`, with
   `stopReason: 'question_dismissed'`.

**Why `turn-complete` and not `user-interrupt`:** an interrupted turn is a
different state — it skips the usage payload, and the reducer stamps
`stopReason: 'interrupted'` (`chat-reducer.ts:1267-1279`). A dismissal is an
orderly end: usage should be reported, and any messages the user queued while
the turn ran should drain, because typing during the turn *is* taking over.
`max_steps` is the existing precedent for a driver-decided orderly stop
(`harness-session.ts:1543-1548`).

**Why the tool result must exist at all:** tool-call/result pairing holds
everywhere in this engine — driver, `rebuildHistory`, `fitToContext`. A dangling
tool_call is rejected by provider APIs with a 400 on the *next* send, and the bad
message persists in history, so the session is bricked rather than degraded. This
is the single hardest invariant in the change.

The turn-usage accumulation and `contextUsedTokens` publication that already run
per step are unaffected; the `turn-complete` emit reuses the existing payload
builder at lines 1555-1575.

### 3. The renderer names what happened

`stopReasonCopy` (`desktop/src/renderer/components/AssistantTurnBubble.tsx:32-42`)
gains one entry:

```
question_dismissed: 'Question closed — waiting for you.'
```

It renders through the existing `StopReasonFooter` — grey italic, left rule,
`role="status"`, once per turn on the last bubble
(`AssistantTurnBubble.tsx:417-422`). No new component, no new styling.

The copy is deliberately provider-neutral (no `assistantName()` interpolation):
the sentence is about the user's own action, not about the assistant.

**Why a footer is required, not optional:** without it, a dismissed turn is
visually identical to a session that silently died. The app already has a
distinct failure state for that (`AttentionBanner`, `'session-died'`), and a
user who cannot tell "it stopped because I told it to" from "it crashed" loses
the ability to trust either signal.

### 4. What the card does

Nothing changes. `handleDeny` already sets `responding`, sends the deny, and
calls `onResponded`, which resolves the card to its answered state. The
`delivered === false` and `catch` paths (`ToolCard.tsx:830-839`) still surface a
failed delivery via `onFailed`.

## Testing

| Claim | Guard |
|---|---|
| A dismissed interactive ask produces a paired tool result AND stops the loop | `tests/harness-session-loop.test.ts` — new case: two-step script where step 2 would run if the loop continued; assert it never does, and that history's last two messages are `assistant(tool-call)` / `tool(result)` |
| Sibling calls in the same step get not-run results | same suite — a step with `AskUserQuestion` plus a second call; assert both `tool-result` events fire and `resultParts.length === 2` |
| The turn ends as `turn-complete` with `question_dismissed`, not `user-interrupt` | same suite — assert emitted event types and `stopReason` |
| ESC during a question still interrupts (`canceled` → `user-interrupt`) | same suite — discrimination test; without it a wrong sentinel passes both cases |
| The footer copy renders for the new reason | `tests/` renderer suite covering `AssistantTurnBubble` stop reasons |
| An ordinary permission deny still continues the loop | `tests/harness-session-loop.test.ts` — regression guard; this is the behavior we are *not* changing |

## Docs and rules to update in the same change

Two shipped invariants are amended by this work and must not be left stale:

- `.claude/rules/native-runtime.md` → "An ask PAUSES the turn, not ends it."
  Still true for permission asks; now carries an explicit carve-out for a
  dismissed interactive ask.
- `.claude/rules/harness-tools.md` → the `AskUserQuestion` bullet, which
  currently describes only the `updatedInput` threading and `formatAnswers`
  totality.
- `youcoded/docs/native-runtime.md` — depth for both bullets.

## Known side effects

> **CORRECTED 2026-08-15, at implementation.** Both paragraphs below described
> the *first* design, in which any `deny` ended the turn. That design was wrong
> and `harness-review-runner.test.ts:775` caught it: the evaluator's wrap-up
> deny is not a user closing a card, it is a policy telling the model *stop
> asking and answer* — ending the turn there discarded `run.review` entirely,
> so the eval returned nothing. The shipped design therefore keys the end-of-turn
> on a broker-stamped `dismissed: true`, which only `PermissionBroker.respond()`
> sets and only a human reaches. **Net effect: neither side effect below
> happened.** Both call sites deny programmatically, never through the broker,
> so both keep their pre-existing continue-anyway behavior — bit-for-bit. Kept
> verbatim as the record of what the analysis missed.

**Specialist children.** `childAskPolicy()`
(`desktop/src/main/harness/specialists/child-ask-policy.ts`) auto-denies every
ask a child raises, and its header comment reasons explicitly about what each
deny does downstream. `AskUserQuestion` is absent from every child's
`allowedTools` — verified: `rg -c "AskUserQuestion" specialists/builtins.ts`
returns no matches across all four definitions (`builtins.ts:115,126,137,148`),
and `builtins.ts` is the only file that populates the field for children — so
the interactive branch is unreachable today. But the comment
becomes wrong the moment this ships and must be updated: a hypothetical
interactive ask would now end the child's turn cleanly rather than return
corrective text. That is a strict improvement over the "prevents hanging"
guarantee the comment claims.

*(As shipped: the child's deny is a bare deny with no `dismissed` flag, so the
turn does NOT end. The header comment was updated instead to carry the new
invariant — it MUST STAY a bare deny.)*

**Harness evaluator.** `run-case.ts:586` denies `AskUserQuestion` during the
wrap-up turn. That turn will now end at the deny instead of continuing. It is
already the final turn of a run, so scores should not move — but a small shift
in eval results after this ships has this as its first suspect.

*(As shipped: zero change to eval code and zero change to eval behavior. The
"scores should not move" reasoning was doubly wrong — the deny is not the final
turn's last act, it is what makes the model produce the review at all.)*

## Out of scope

- Any change to the Claude Code path's post-deny behavior.
- A second negative button ("skip the question, carry on"). Considered and
  rejected 2026-08-13: three buttons on every question card, two of them
  similar-sounding negatives, for a path the user can reach in one typed
  sentence.
- Re-opening a dismissed question. The ask is resolved; the user types instead.
