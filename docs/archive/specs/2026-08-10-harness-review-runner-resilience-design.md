---
status: shipped
---

# Harness review runner: finish the run, or say why not

The battery runner (`desktop/src/main/harness/review/`) works when a model
cooperates. Round 5 (2026-08-10, 8 models) proved it has no answer for a model
that doesn't: **1 of 8 produced a review, and that one was fabricated.**

This spec covers the six runner defects that round exposed. It does not change
the battery prompt, the fixture, or any harness tool.

## What round 5 actually did

| Model | Calls | Outcome |
|---|---|---|
| Qwen 3.6 35B A3B | 14 | "succeeded" — review describes tools it never called |
| Qwen 3.6 27B | 2 | `end_turn`, no final text |
| Qwen 3.5 122B A10B | 127 | `max_steps`, no final text |
| Qwen 3.8 Max | 157 | `max_steps`, no final text |
| Deepseek v4 flash 0731 | ? | 900s timeout, **no transcript written** |
| Grok 4.5 | ? | 900s timeout, **no transcript written** |
| GPT 5.6 Luna | ? | 900s timeout, **no transcript written** |
| Claude Opus 5 | ? | 900s timeout, **no transcript written** |

Verified from `docs/active/investigations/harness-review-runs/2026-08-10/` —
that directory holds only four transcripts stamped inside round 5's window
(04:55–05:09). The `grok`/`gpt`/`opus` files there are stamped 02:10–02:19 and
belong to an earlier A/B run.

The trigger was external. Identical code (`eba51705`), same model, 4.5 hours
apart: 58 calls / 232 thinking events / 230s / success, then 88 calls / 1,691
thinking events / 755s / no completion. Tool execution totalled 0.4s across
those 88 calls — the harness was never the bottleneck. Provider-side reasoning
volume rose, context filled, compaction ran, and models restarted the battery.

**The point of this spec is not to prevent that.** It's to make the runner
produce a usable artifact when it happens again.

## Design

### 1. The wrap-up turn (defects 1, 3, 5)

Budget exhaustion, a restarting model, and a blown deadline all mean the same
thing: *stop testing, tell me what you found.* One mechanism, three triggers.

**Triggers**

- **Budget exhausted** — `stepGates > STEP_GATE_ALLOWANCE`.
- **Restart detected** — the same `(toolName, JSON.stringify(input))` pair
  observed more than `REPEAT_LIMIT = 5` times across the whole run, not
  necessarily consecutively. `doom_loop` (`harness-session.ts:1432`) already
  owns the consecutive case and is unchanged; this catches the non-consecutive
  shape — Qwen 3.8 Max issued `Glob **/*` fourteen times, which is the battery
  being started over, not a stuck tool. Five identical calls with byte-identical
  input is past any legitimate re-check.
- **Wall clock** — `BATTERY_TIMEOUT_MS` elapses during the testing turn.

**Mechanism**

`session.interrupt()` (`harness-session.ts:1608`) ends the in-flight turn
cleanly; `send()` then resolves with everything gathered rather than being
abandoned by a `Promise.race`. The runner then issues a second `send()` on the
**same session**, so the model retains its full history:

> Your testing budget is spent. Do not run any more tools. Write your review of
> the harness now.

A `wrappingUp` flag on the run makes `decide` return `{ action: 'deny' }` for
every tool call and `askUser` deny every `max_steps` gate for the duration of
that turn. The model answers in prose or not at all — it cannot resume testing.
Note that `PermissionDecision` (`shared/permission-types.ts:17`) carries only
`action` and `denyListed`; there is no message field, so the denial reaches the
model as the generic tool-denial result. The wrap-up prompt itself is what tells
it why.

The wrap-up turn carries its own `WRAP_UP_TIMEOUT_MS = 120_000` ceiling. If it
blows that, the runner takes whatever text exists and records
`outcome: 'wrapped-up'` regardless.

**How each trigger is observed.** The budget trigger is read off the
`turn-complete` event's `stopReason === 'max_steps'` after `send()` resolves —
not off the `askUser` deny, because a denied gate and a genuinely finished turn
are indistinguishable at the callback. The restart trigger is evaluated inside
the existing `transcript-event` listener as `tool-use` events arrive, and must
call `session.interrupt()` itself, since the turn is still in flight. The
wall-clock trigger replaces today's `Promise.race` rejection with a timer that
calls `session.interrupt()` and lets `send()` resolve normally.

**Where the review comes from with two turns.** The existing extractor takes
assistant text after the last `tool-result` event. That still holds in a
wrap-up run — denied tool calls do produce `tool-result` events, so the last
one still precedes the wrap-up prose. But the extractor must run over the
events of the wrap-up turn only: record the event-array length at the moment
wrap-up is issued and slice from there. Otherwise a testing turn that emitted
trailing narration before being interrupted would leak into the review, which
is the exact defect the "after the last tool result" rule was written to fix.

**Budget constants**

| | Today | Proposed |
|---|---|---|
| `maxSteps` | 25 / 50, chosen by model tier | `BATTERY_STEP_BUDGET = 100`, uniform |
| `STEP_GATE_ALLOWANCE` | 4 | 1 |
| Effective ceiling | 125 / 250 steps, then the turn dies | 200 steps, then wrap-up |
| `BATTERY_TIMEOUT_MS` | 900_000 | 1_200_000 |

`harness-session.ts:1008` reads
`this.opts.harness.limits?.maxSteps ?? stepBudgetFor(this.binding.modelId)`, so
setting `maxSteps` on `BATTERY_HARNESS` is sufficient — the same layering
already used for `BATTERY_MAX_OUTPUT_TOKENS`, and equally confined to the
runner's own copy of `ASSISTANT_PRESET`.

Uniform rather than tier-based because `stepBudgetFor`'s 25/50 split
(`model-step-budget.ts`) is tuned for interactive chat. The battery is the same
size of job whichever model runs it. 100 sits above every healthy run ever
measured — round 4: Kimi K3 56, Deepseek 47, Grok 37, GPT 47, Opus 80 — so the
first gate becomes signal instead of routine, which is why the allowance can
drop from 4 to 1.

The timeout rises to 1,200s for a reason worth stating: at the A/B run's
measured 8.6s/step, 900s buys roughly 105 steps, so **today the timeout, not
the step budget, is the binding constraint.** Making the deadline a wrap-up
trigger rather than a kill is the actual fix; the raise just leaves real testing
room before wrap-up, and the wrap-up turn itself is cheap.

### 2. Salvage and metrics (defects 2, 6)

`runBattery` stops throwing for any run that produced events. `BatteryRun`
gains:

```ts
outcome: 'complete' | 'wrapped-up' | 'no-review' | 'error';
error?: string;
metrics: {
  wallClockMs: number;
  toolCalls: number;
  asks: number;
  stepGates: number;
  thinkingEvents: number;
  inputTokens: number;
  outputTokens: number;
  stopReasons: string[];                        // one per turn-complete
  toolsUsed: string[];                          // distinct, sorted
  repeats: { key: string; count: number }[];    // pairs over REPEAT_LIMIT
};
```

Outcome semantics: `complete` — the testing turn ended on its own and left a
non-empty review. `wrapped-up` — a trigger fired and the wrap-up turn produced
a review. `no-review` — the run finished (either way) with empty final text.
`error` — the provider or session threw; `error` carries the real message,
never a substitute (`docs/error-message-standards.md`).

A mid-run provider error is caught, recorded, and returned with everything
gathered so far. `runBattery` throws only when it cannot seed the fixture or
construct the session — i.e. when there is nothing to salvage.

Token figures sum `turn-complete`'s `data.usage` across turns. `thinkingEvents`
is a **count of `assistant-thinking` events, not a token figure** —
`StepUsage` (`harness-session.ts:109`) has no reasoning field. It is still the
number that would have made the A/B provider shift visible in one line
(232 → 1,691).

The CLI (`test-engine/review-harness.mjs`) then writes a transcript for **every**
roster entry, unconditionally, including failures — which alone converts round
5's four silent timeouts into four diagnosable runs. It appends to the doc only
when `review` is non-empty, and prints outcome plus one metrics line per model,
replacing today's single `N tool calls, N asks, N step-gate hits` line:

```
=== Qwen 3.8 Max (qwen/qwen3.8-max) ===
  wrapped-up (restart) · 118 calls · 3 asks · 1 gate · 942 thinking · 11m04s
  tools: Bash Edit Glob Grep Read WebFetch Write
  → review appended
```

A failed entry still prints its metrics line and still names its transcript
path; only the last line changes to the real error.

### 3. Run facts (defect 4)

A new pure module `review/run-facts.ts`, sibling to `append-review.ts`:

- `collectRunFacts(run: BatteryRun): RunFacts` — the metrics above plus warnings
- `claimedTools(reviewText: string): string[]` — whole-word matches against the
  `CORE_TOOLS` names
- `renderRunFacts(facts: RunFacts): string` — a markdown block

Two warnings:

- **`unbacked-claims`** — a tool named in the review that never appears in
  `toolsUsed`. Qwen 3.6 35B A3B's review described `Edit` duplicate-string
  tests, `replace_all`, and a `sleep 15` timeout with exit 124, against a
  transcript of 13 `Read`s, one `Glob`, and one `Bash pwd && ls -la`.
- **`below-floor`** — `toolCalls < MIN_TOOL_CALLS` (10). Qwen 3.6 27B made two
  calls; whatever text follows two calls is not a review of ten tools.

Both **flag, neither judges.** A review that honestly says "I never reached
Edit" trips `unbacked-claims`, and a reader resolves that in two seconds. The
alternative — refusing to append — spends real money and then discards the
result on a heuristic.

Every appended review carries the facts block under its heading, not only
suspect ones. Warnings render as a blockquote above it. `appendReview` stays
pure and takes the rendered facts as an additional input; it does not learn
about `BatteryRun`.

## Testing

All of it runs against scripted fake models in the existing vitest suites. No
new dependency on a live paid run.

- **Wrap-up triggers** — a fake model that never stops calling tools (budget
  trigger), one that repeats a single call six times (restart trigger), and one
  that stalls past the deadline (wall-clock trigger). Each asserts the wrap-up
  turn ran, that tool calls were denied during it, and that
  `outcome === 'wrapped-up'`.
- **Salvage** — a fake model that throws mid-run asserts a `BatteryRun` is still
  returned, with `error` carrying the thrown message and `events` non-empty.
- **Budget** — assert `BATTERY_HARNESS.limits.maxSteps === BATTERY_STEP_BUDGET`
  and that a frontier-tier `modelId` no longer changes the effective budget.
- **`run-facts`** — unit tests on synthetic runs, including the exact Qwen shape
  (review naming `Edit`, transcript containing none) and a two-call run.
- **`append-review`** — extend the existing purity tests to cover the facts
  block and the warning blockquote.

## Out of scope

- Rotating the OpenRouter key, merging `feat/bash-env-persistence`, and running
  round 6. Follow-ons, tracked separately.
- The battery prompt, the fixture tree, and the ten `CORE_TOOLS` themselves.
- `stepBudgetFor`'s tier split for real app sessions — untouched.
