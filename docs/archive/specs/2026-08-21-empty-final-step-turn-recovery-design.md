---
status: shipped
date: 2026-08-21
kind: spec
scope: youcoded/desktop — native harness turn loop, empty-final-step recovery
related:
  - ROADMAP.md → Bugs → "Native turns go silent for ~3min after a tool result…" (added 2026-08-21)
  - youcoded `28d3f82e` — the 2026-08-16 stalled-turn park fix (parent defect family)
  - `.claude/rules/native-runtime.md` — Stall watchdog & the park (guard: harness-stall-watchdog.test.ts)
---

# Empty Final Step → Bounded Retry and an Honest Turn End

**Status:** ACTIVE — reviewed against master `a3f38fcd` on 2026-08-21 (second session);
all code anchors re-verified. The three open questions at the bottom were resolved to
the recommended defaults (Destin unavailable; flagged for post-hoc review).

**Corrected 2026-08-21 (third session), after two independent adversarial reviews of
PR #324:** the review found the as-built Part 3/decision-4 rendering was dead code
(ChatView/BubbleFeed drop segment-less turns upstream of the bubble), plus eight
smaller defects. This document now describes the CORRECTED design as shipped on the
branch; §11 records what changed and why.

---

## 1. Problem statement (as experienced)

Three times in one live session (2026-08-20/21), a native session in Full Auto went
unresponsive immediately after a tool result: the timeline showed the finished tool
card and then nothing — no text, no thinking, no new tool call — for roughly three
minutes, until Destin manually interrupted with "continue." From inside the app it
reads as an infinite spinner. From the assistant's side the experience is invisible:
the turn simply ends and no error ever arrives.

## 2. Evidence — transcript forensics (corrected)

Source: `~/.youcoded/sessions/-home-destin-youcoded-dev/dd55e932-fb00-4265-aa83-a15d0c92ea6e.jsonl`.
All timestamps verified programmatically. A second-session survey (2026-08-21) of all
August transcripts confirmed the pattern is **model-correlated, not app-correlated**:
`stealth/ox-alpha` (15 nudges, 5+ multi-minute voids across 9 sessions) and
`qwen/qwen3.8-max` (8 nudges, 6 voids across 2 sessions) account for essentially all
instances, while ~20 `deepseek-v4-flash` / `glm-5.3` / `gpt-5.6-luna` sessions through
the identical OpenRouter path show near-zero. Provider-side trigger; harness-side gap.

**Correction of the record:** an earlier ROADMAP version claimed the stalled turns'
`turn-complete` payloads were *empty*. That was wrong — the extraction script read the
wrong JSON level. The payloads are **fully valid**, which changes the diagnosis: this
is a degenerate model response, not bookkeeping loss.

### The fingerprint (all three stalls identical)

| # | Last event before void | Void length | turn-complete payload | Content produced |
|---|---|---|---|---|
| A | `tool-result` (Glob, canceled) | **182.7 s** | valid — `end_turn`, ox-alpha, full usage | **none** |
| B | `tool-result` (Read) | **~187 s** | valid — `end_turn`, full usage | **none** |
| C | `tool-result` (Grep) | ~180 s (observed live) | valid (per A/B pattern) | **none** |

Zero events of any kind during each void — no `assistant-thinking`, no
`assistant-text`, no stall-warning transcript events (those are display-only and
never persisted, per the SessionStore invariant — their absence from JSONL is
expected, not diagnostic). Every healthy turn in the same file shows
thinking → text/tool-use within seconds of the preceding tool result.

Two consequences:

1. **The turn state machine COMPLETED normally each time** — 25–130 s before Destin
   nudged. Nothing was hung. The user-perceived "infinite spin" was the gap between
   a turn that ended with no visible output and a human deciding it was dead.
2. **The model's final step produced zero content** — no text, no tool calls — yet
   reported an orderly `finishReason: 'stop'`.

## 3. Root cause (code walk, master @ a3f38fcd)

All anchors in `desktop/src/main/harness/harness-session.ts`:

```ts
// L1711 — an empty step pushes NO history (deliberate, correct):
if (step.text || step.toolCalls.length > 0) {
  this.history.push(this.assistantMessage(step.text, step.toolCalls));
}

// L1715–1719 — ANY step with no tool calls ends the turn as a natural stop,
// INCLUDING a step with no text either. There is no emptiness check:
if (step.toolCalls.length === 0) {
  stopReason = mapStopReason(step.finishReason);   // 'stop' → 'end_turn'
  break;
}
```

So a contentless final step: skips the history push (L1711), trips the
natural-stop branch (L1715), reports `end_turn`, and the turn completes having
rendered nothing new. The renderer's bubble-footer gate filters `'end_turn'` as the
normal case (`AssistantTurnBubble.tsx:32`, `stopReasonCopy`), so nothing unusual is
surfaced either. **The system accepted "the model said nothing" as a legitimate
ending. It never is.**

Note this also covers *mid-turn* emptiness: any empty step breaks the loop today,
because the emptiness and the no-tool-calls checks are the same check.

### What a step can and cannot see (verified against `StepResult`, L239–248)

`StepResult` is `{ text, toolCalls, usage, finishReason, interrupted, generationMs }`.
**There is no reasoning field.** `reasoning-delta` parts (L2210–2219) set
`emittedAny = true`, add to `outputChars`, and emit persisted
`assistant-thinking {text, partId}` events — but their text is never returned to the
loop. So a step where the model *thinks and then says nothing* is indistinguishable,
at the loop level, from a fully silent step. See §4 Part 1 for how the design treats
that case (deliberately: as empty).

### Why the watchdog didn't catch it — the park worked as designed

`28d3f82e` (2026-08-16) handles *silence*: Clock 2 (streamed, then quiet ≥
`STALL_WARNING_MS`=60 s + `STALL_RETRY_COUNTDOWN_MS`=15 s grace) **parks** — the
stall race is left unresolved, the stream reader stays open, a red "Provider may
have stalled" card counts up, and a chunk arriving minutes later still lands in the
loop. That is exactly what happened: each void ran ~3 min, then the late completion
landed and the turn continued to its (empty) conclusion. The park kept the turn
alive through the void; **it has no opinion about what the model says when it
finally speaks.** "It spoke, and the something was empty" is the uncovered case.

## 4. Design

Four parts. Parts 1–3 are the fix; Part 4 is a small triage follow-up.

### Part 1 — Detect the empty step (main process, one site)

In the `turnLoop`, immediately after `consumeStep` resolves and BEFORE the
natural-stop branch (between L1711's history push and L1715's break), classify:

```ts
const isEmptyStep =
  !step.interrupted &&
  step.toolCalls.length === 0 &&
  (!step.text || step.text.trim().length === 0);
```

**Reasoning-only steps count as empty — by decision, not omission.** A step that
streams thinking and then stops delivered no reply and pushed nothing to history
(L1711 gates on text/toolCalls only), so the user-facing outcome is identical to
total silence. The retry is *history-safe* for it (see Part 2), and the visible cost
is benign: the dead attempt's thinking stays on screen and a fresh attempt streams
its own. One caveat to carry into the implementation: when a provider omits stream
part ids, reasoning falls back to partId `'reasoning-0'` (L2217), so a retry's
thinking would coalesce into the prior attempt's block under the SessionStore
same-partId rule — cosmetic (concatenated thinking text), accepted.

**A truncated tool call is also caught.** A stream that emits `tool-input-start` /
`tool-input-delta` but dies before the completed `tool-call` part leaves
`toolCalls` empty (fragments are deliberately discarded, L2241–2262) — that step
satisfies the predicate and gets the retry, which is exactly right: nothing
executed. CORRECTION (review round 2): the earlier claim that the next attempt
"replaces" the leftover "preparing" card was wrong — the retry's cards carry
different ids, and endTurn's reaping only fires at turn end, so the orphan would
spin beside them for the rest of the turn. `StepResult` therefore carries
`pendingPreparing` (started-but-never-completed call ids) out of the stream, and
the retry emits `toolPreparing {cleared: true}` for each before re-running — the
same withdrawal the manual-Retry and stall-retry paths already perform. The
`empty_response` break needs no withdrawal (the turn ends there; endTurn reaps).

**Whitespace-only text counts as empty — and must ALSO not be pushed to history**
(review round 1). The push gate at L1711 used truthiness (`step.text`) while the
predicate trims; a `'\n\n'` step would have been pushed AND retried, so the
re-run's request ended in a dangling whitespace assistant message (Anthropic-shaped
endpoints reject that with a 400), falsifying the history-untouched invariant. One
shared `stepHasText` predicate now feeds both gates; the interrupt path's partial
push trims for the same reason. Known cosmetic residual: the whitespace deltas
still stream and persist as `assistant-text` events, so `rebuildHistory` coalesces
them into the retry step's text on resume — a live-vs-rebuilt divergence smaller
than pre-fix, deliberately left for a follow-up (ROADMAP `#harness`).

### Part 2 — Respond: one bounded silent retry, then an honest end

**Gate on finishReason first.** The retry ladder applies ONLY when the empty step's
`finishReason` is `'stop'`, `undefined`, `'unknown'`, `'other'`, or — CORRECTED,
review round 1 — `'tool-calls'` (with zero parsed calls it means every announced
call was dropped as malformed/truncated: the exact truncated-tool-call shape Part 1
promises to retry, which the original four-value list contradicted; it previously
fell through to the meaningless raw passthrough stopReason `'tool-calls'`). The
list lives as `ORDERLY_EMPTY_FINISHES`, a const NEXT TO `mapStopReason`, so the two
finishReason vocabularies stay one list. Any other reason keeps today's exact
behavior (`mapStopReason` at the break site): an empty step with `'length'` must
still report `max_tokens` (truncation, not degeneracy — a retry would hit the same
limit), and `'content-filter'` must keep its own mapping. Without this gate the
retry masks real stop reasons behind `empty_response`.

Then, mirroring the existing first-attempt auto-retry philosophy (`willRetry =
!emittedAny && isFirstAttempt`, ~L2017):

1. **First consecutive empty step → one silent automatic re-run.** `continue
   turnLoop`, guarded by a `consecutiveEmptySteps` counter: incremented on an empty
   step, reset to 0 by any non-empty step, retry allowed only at count 1. Per-turn
   worst case stays bounded — each additional retry requires a real (budgeted)
   step in between, and an all-empty turn is exactly two provider calls. Log one
   main-process line (`console.error('[harness] empty step, retrying once …')`) so
   the retry is diagnosable from logs without touching the frozen emit surface.
   Safety properties, each verified against the current code:
   - **History is untouched** (this is the load-bearing one — NOT "nothing was
     emitted," which is false for reasoning-only steps): L1711 pushed nothing for
     the empty step, so the re-run's request body is byte-identical, and the last
     tool result remains paired with its call from the *prior* step — the
     tool-call/result pairing invariant holds everywhere (driver, `rebuildHistory`,
     `fitToContext`).
   - Usage was already accumulated into `turnUsage` (L1694–1699) before the
     classification point, so both attempts bill and report honestly.
   - Steers/compaction run at the top of the loop; the re-run simply takes the
     next iteration. `stepsSinceApproval` / `maxSteps` are NOT incremented by an
     empty step (that happens in the tool-execution branch, L1806), which is fine:
     the consecutive-counter bounds the retry on its own.
   - Interrupted-mid-retry → the existing interrupt path wins (checked at L1703,
     before the predicate; the predicate also requires `!step.interrupted`).
   - Specialist children get the same bounded retry: the never-park rule is about
     the watchdog park leaving a child's `send()` unsettled; a synchronous capped
     re-run settles normally. Pin with a test.
2. **Second consecutive empty step → end the turn honestly** with a NEW stopReason
   value: `'empty_response'`.
   - This is an orderly completion: normal `turn-complete`, usage covering both
     attempts, no `session-error` (that path means a thrown exception and would
     misreport telemetry), no empty history push, no dangling pairing.
   - `mapStopReason` is untouched; the constant is set directly at the break site,
     with a WHY comment pointing at this spec.

### Part 3 — Renderer: surface the honest end

- `AssistantTurnBubble.stopReasonCopy` (L32) gains an `'empty_response'` entry.
  Copy (error-message standards: general, non-committal, actionable):
  **"The model returned an empty response. Retrying may help."**
- Graceful even without this: `stopReasonCopy` already falls back to
  ``Response ended: ${reason}.`` for unknown reasons, so the map entry is polish,
  not a correctness dependency. Because non-`'end_turn'` reasons already render
  distinctly in the footer, this is additive — one map entry plus its test. No new
  emit types (the emit surface stays frozen), no new IPC channels (the string rides
  the existing `turn-complete` payload; Android consumes the same shared React
  bundle).
- **Kotlin passthrough — verified 2026-08-21:** Android code DOES read
  `stop_reason` strings, but only when parsing Claude Code CLI transcripts
  (`SessionBrowser.kt:200`, `parser/TranscriptWatcher.kt:381`) — the native path
  carries `stopReason` opaquely (`ManagedSession.kt:300`,
  `TranscriptSerializer.kt:94`). A new value flows through untouched; no Kotlin
  change. (An `rg stopReason app/src/main` WILL return hits — don't mistake the
  CC-transcript parsers for native consumers.)
- Deferred (Destin's call, on his return): extending the post-turn Retry
  affordance to `empty_response` turns the way it exists for errored ones. Not in
  this branch.

### Part 4 — Triage follow-up: was the park card even visible?

UNVERIFIED: Destin reported "spinning," but the park ships a red counting card.
Whether it rendered in his surface (ChatView vs buddy) during these stalls is
unknown. Action: reproduce in the dev instance; if the card rendered, tune its copy
("Waiting for the model… you can Stop or Retry"); if it did NOT render, file that
separately as a renderer bug — it would mean the one honest signal the park built
never reached him. Not part of this branch.

## 5. Invariants respected (rule `.claude/rules/native-runtime.md`)

| Invariant | How this design honors it |
|---|---|
| Emit surface frozen | New state expresses itself as an existing event's payload field (`stopReason` string) — no new `TranscriptEventType`s |
| Tool-call/result pairing everywhere | Empty step pushes no history; retry re-runs cleanly; final failure adds no records |
| Ask pauses, never ends | Unrelated path — untouched |
| Children never park | Design adds no parking; bounded sync retry settles `send()` normally (pinned test) |
| `send()` never throws | No change to the send contract |
| Retry erases in three places | Not triggered: the empty-step retry never re-streams over prior partIds with content to erase — the empty step contributed no text parts, and reasoning-only coalescing is append-only (Part 1 caveat) |
| Stall clocks byte-identical | `STALL_WARNING_MS` / countdown / park-guard expression untouched — fix lives entirely after `consumeStep` resolves |

## 6. Testing plan (new cases, `harness-session-loop.test.ts` family)

1. Empty final step once (finish `'stop'`) → silent re-run → real content → turn
   completes `end_turn`; exactly one extra model call observed; history contains no
   empty assistant message.
2. Empty twice consecutively → `turn-complete` with `stopReason: 'empty_response'`;
   usage sums BOTH attempts; history contains neither empty step.
3. Empty → recovered with content → much later ANOTHER empty step → counter had
   reset, so the second empty ALSO gets one retry (consecutive semantics pinned).
4. First-step empty (no tools all turn) → same ladder.
5. Reasoning-only step (thinking deltas, then finish `'stop'`, no text/tool calls)
   → classified empty, retried; history untouched.
6. finishReason gate: empty step with `'length'` → NO retry, turn ends
   `max_tokens` exactly as today.
7. Interrupt during the retry window → `user-interrupt` wins, no `empty_response`.
8. Specialist child: empty-then-content and empty-twice paths settle `send()` in
   both cases.
9. `AssistantTurnBubble`: `'empty_response'` renders the new copy; `'end_turn'`
   still filtered.
10. Existing suite green: park-guard expressions, stall timing byte-identical
    (`harness-stall-watchdog.test.ts` untouched and passing).
11. Fully-silent turn (decision 4): (a) reducer — `TRANSCRIPT_TURN_COMPLETE`
    with `currentTurnId` null + abnormal stopReason creates the turn and stamps
    metadata; same event with `end_turn` still skips (today's behavior pinned);
    (b) bubble — a turn with `empty_response` and zero segments renders the
    footer copy and nothing else.

## 7. Non-goals

- Fixing the provider (upstream; out of reach — the retry bounds the damage instead).
- Touching Clock 1, the park guard, or either stall constant.
- Permission asks, compaction, queueing.
- CC (PTY) sessions — different runtime; not observed affected.
- The post-turn Retry affordance and the park-card visibility triage (Parts 3/4
  deferred items).

## 8. Decisions taken 2026-08-21 (defaults adopted in Destin's absence — revisit freely)

1. **Silent-once retry: YES** — the retry announces nothing (matches the existing
   first-attempt stall retry's philosophy; one log line for diagnosability).
2. **Footer copy:** "The model returned an empty response. Retrying may help."
3. **Retry affordance on the finished bubble: DEFERRED** — not in this branch.
4. **Fully-silent turns get the footer too** (independent plan review, 2026-08-21).
   The renderer creates assistant turns lazily — only assistant *content* creates
   one — so a turn whose every step was contentless would carry `empty_response`
   on an event nobody renders: the worst-case shape of this very bug would still
   end in unexplained silence. Adopted fix, two small halves: (a) the reducer's
   `TRANSCRIPT_TURN_COMPLETE` creates the turn when `currentTurnId` is null AND
   the arriving `stopReason` is abnormal (non-null, ≠ `end_turn`) — normal CC/
   native completions keep today's skip; (b) `AssistantTurnBubble` renders a
   footer-only row for a turn with an abnormal stopReason and zero bubbles
   (today that turn renders literally nothing). Both halves are additive and
   inert for every existing state. NOTE: `TRANSCRIPT_INTERRUPT` has the same
   latent gap and is deliberately NOT changed — an interrupt is user-initiated,
   so its silence is self-explanatory; scope stays minimal. The buddy feed's
   parallel reducer is also untouched (cosmetic surface, out of scope). This is
   a review-driven scope addition, isolated in its own commit for easy reversal.

## 8b. Post-review corrections (2026-08-21, third session — PR #324)

Two independent adversarial reviews (one of the PR, one of the fix commits) drove
these changes to the as-built design; each is inlined above at its section:

1. **The rendered fix was dead code** — ChatView (L793) and buddy BubbleFeed (L393)
   drop segment-less turns before `AssistantTurnBubble` mounts, and every shipped
   test sat below that boundary. Fixed with a shared `shouldRenderAssistantTurn` /
   `abnormalStopReason` pair in `chat-types.ts` (used by the reducer's mint gate,
   the bubble's two footer gates, and both timeline gates), pinned by a test that
   mounts ChatView itself. **Visible side effects, flagged for Destin:** a turn
   interrupted while still "preparing" a tool call now renders an "Interrupted."
   footer where it previously vanished; a thinking-only CC turn ending
   `max_tokens`/`pause_turn` now renders its footer where there was silence
   (`pause_turn`'s standing row while CC continues in a new turn is the jarring
   one — revisit if it annoys).
2. **The decision-4 mint broke turn-complete's absorb contract** — watcher re-emits
   and re-dock replay would append a ghost segment-less turn per delivery
   (content actions are uuid-deduped, so replayed completes arrive with
   `currentTurnId` null). Abnormal completions now record `action.uuid` in
   `seenUuids` (both stamp and mint paths) and the mint checks it; minted turns
   take the EVENT timestamp, and the two metadata-stamp sites merged into one
   (they had already diverged on `model`). Residual, pre-existing: the STAMP path
   itself is still not uuid-idempotent when a new turn is live at replay time.
3. **Whitespace-only steps** and **`'tool-calls'` empties** — see the corrected
   Part 1/Part 2 text above.
4. **Orphaned preparing cards** on the retry — see the corrected Part 1 text.
5. **Diagnosability** — the retry logs via structured `log()` to
   `~/.claude/desktop.log`; `console.error` reaches nobody in a packaged build.
6. **Copy** — "The model returned an empty response twice. Retrying may help."
   ("twice" is the verified fact; "may help" refers to a later manual nudge,
   which recovered all three live incidents — distinct from the failed immediate
   auto-retry).
7. **`docs/chat-reducer.md`** updated in the same PR: stopReason is an open set
   including `empty_response`, and segment-less turns exist.

## 9. Prior art — opencode v1.18.21 (checked 2026-08-21, same day)

opencode shipped "continue unknown finish responses" (`anomalyco/opencode`
PR #43892, commit `57fa34f2`) hours before this branch was built — a sibling
defect in the same family, corroborating the provider-side trigger (the same
release also patches their ox-alpha model id). Their fix and ours do NOT cover
the same case: theirs continues the loop when the stream ends with an
UNRECOGNIZED finish reason (`'unknown'`), regardless of content; our observed
fingerprint was a VALID `'stop'` finish with zero content, which their exit
condition still treats as final. Their continuation is also unbounded by
default (`agent.steps ?? Infinity`) and adds no user-facing state; ours is
capped at one retry and ends with the labeled `empty_response` footer. Their
partial-content/abnormal-finish case is covered on our side by different
machinery (stream-error retry via `withRetry`, the park + manual Retry, and the
`stopReasonCopy` fallback), so no design change was adopted from the
comparison.

## 10. Implementation sketch (anchor map)

| Change | Site |
|---|---|
| Predicate + finishReason gate + consecutive counter + honest break | `harness-session.ts` turnLoop, between L1711 and L1715 |
| `'empty_response'` constant + WHY comment | same file, near `mapStopReason` (L259) |
| Footer copy | `components/AssistantTurnBubble.tsx:32` (`stopReasonCopy`) |
| Tests | `tests/harness-session-loop.test.ts` family + `AssistantTurnBubble.test.tsx` |

Effort estimate: half a session including tests and `bash scripts/verify.sh`.
