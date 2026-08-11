---
paths:
  - "youcoded/desktop/src/main/harness/review/**"
  - "youcoded/desktop/test-engine/review-harness.mjs"
  - "youcoded/desktop/test-engine/review-roster.json"
  # Also fires on the code the battery EVALUATES, not just the runner — the person
  # changing a tool is the one who should be offered an eval. Four live rounds found
  # nine defects here that 4,500 passing tests missed, because every test drives a
  # scripted fake model and none of them spend a real turn deciding what to do next.
  - "youcoded/desktop/src/main/harness/tools/**"
last_verified: 2026-08-10
verify:
  - path: youcoded/desktop/src/main/harness/review/run-battery.ts
    contains: "askUser: async"
  - path: youcoded/desktop/src/main/harness/review/run-battery.ts
    contains: "STEP_GATE_ALLOWANCE = 1"
  - path: youcoded/desktop/src/main/harness/review/run-battery.ts
    contains: "WRAP_UP_PROMPT"
  - path: youcoded/desktop/src/main/harness/review/run-battery.ts
    contains: "BATTERY_STEP_BUDGET"
  - path: youcoded/desktop/src/main/harness/review/run-facts.ts
    contains: "MIN_TOOL_CALLS"
  - path: youcoded/desktop/src/main/harness/review/append-review.ts
  - path: youcoded/desktop/src/main/harness/review/battery.ts
  - path: youcoded/desktop/src/main/harness/review/fixture-workspace.ts
  - path: youcoded/desktop/test-engine/review-harness.mjs
  - test: youcoded/desktop/tests/harness-review-fixture.test.ts
  - test: youcoded/desktop/tests/harness-review-runner.test.ts
---

# Harness review runner (`test-engine/review-harness.mjs`)

Runs a battery of agentic tool tasks against the native harness across an OpenRouter
model roster, in a disposable fixture: `npm run build:main &&
OPENROUTER_API_KEY=sk-... node test-engine/review-harness.mjs`.

- **The fixture jail is held by `askUser`, not `decide`.** `decide` is fully permissive;
  `askUser` denies every ask that isn't a genuine `AskUserQuestion` — including
  `external_directory`, `doom_loop`, and `max_steps`. A prior version blanket-allowed all
  three (Critical). Guard: `harness-review-runner.test.ts` → "denies a Write outside the
  fixture instead of rubber-stamping it (Critical fix)".

- **The battery sets its own uniform step budget, not the app's per-model chat tiers.**
  `BATTERY_STEP_BUDGET = 100` overrides `stepBudgetFor`'s 25/50 tiers, which cut a
  40–80-call battery short. `STEP_GATE_ALLOWANCE = 1` (down from 4) gives one
  continuation before the gate denies. Guard: the `battery step budget` describe block.

- **A cut-short run ends in a wrap-up turn, not a dead one.** Budget exhaustion, a
  restarted battery (`REPEAT_LIMIT = 5` non-consecutive repeats), or the wall clock
  interrupt the testing turn and send a second turn carrying `WRAP_UP_PROMPT` with every
  tool call denied — including a genuine `AskUserQuestion`, which is `interactive: true`
  and so bypasses `decide()` entirely; `askUser` denies it explicitly during wrap-up so
  the prompt's claim holds for that tool too. Guard: the `wrap-up turn` describe block.

- **`runBattery` never throws for a run that produced events** — it returns `outcome`,
  `error`, and `metrics` instead. Round 5 lost four transcripts to a rejected promise.
  Guard: the `runBattery salvage` describe block.

- **Two engine quirks this file leans on:** `session.send()` never rejects on a mid-run
  provider error — `HarnessSession` emits `'session-error'` and resolves, so `runBattery`
  scopes its scan per-`send()` (unscoped, a wrap-up mislabels a recovered run as errored).
  And `tool-use` fires before `decide()`, so `metrics.toolsUsed` records *attempted*
  calls; wrap-up's denials are excluded. Guard: none — candidate.

- **Every appended review carries its run facts; a claimed tool the transcript never
  shows gets a warning above it.** `collectRunFacts` diffs claimed tool names against
  `metrics.toolsUsed`; `MIN_TOOL_CALLS = 10` flags a run too short to have covered the
  battery. Written after a 14-call run described Edit tests it never ran. Guard: the
  `renderRunFacts` describe block.

- **`OPENROUTER_API_KEY` is the only credential; the CLI deletes it from `process.env`
  before any battery runs.** The battery prompt invites `env`/`printenv`, which would
  land the key in the saved transcript — `makeOpenRouterFactory` takes the key as a plain
  argument instead.

- **`appendReview` is pure** — `(docText, run, runAtISO) => string`, no I/O — making
  "never disturbs other models' reviews" unit-testable. Headings carry minute precision
  plus a build SHA. Guard: "leaves every existing review byte-identical".

- **`runBattery` sends an explicit output ceiling.** `BATTERY_MAX_OUTPUT_TOKENS = 32_000`
  overrides the unset `limits.maxTokens` on a battery-only copy of `ASSISTANT_PRESET` —
  unset, OpenRouter reserves the model's full hosted max (Opus 5 hit 65,536).

- **The review is the text after the last tool result, not every `assistant-text`
  delta.** Deltas stream all run; joining them glued narration onto the review (Kimi K3:
  36% commentary). The wrap-up window falls back to the whole window only when that
  anchored slice is empty — the model answered, then made one last denied call.

- **The fixture must be byte-identical across runs, so reviews stay comparable.**
  `seedFixtureWorkspace()` writes the same bytes every call, including a seeded
  contradiction (`config/settings.toml` vs `config/app.toml` disagree on `port`) giving a
  model reason to call `AskUserQuestion` — don't "fix" it. Guard:
  `harness-review-fixture.test.ts` → "produces byte-identical trees across runs".

- **Offer the battery after changing a harness tool; never run it unasked.** ~$1.50 a
  roster — `--dry-run` is free, `--only "<label>"` is one model.

Depth: `docs/archive/plans/2026-08-06-harness-review-runner.md`,
`docs/archive/specs/2026-08-10-harness-review-runner-resilience-design.md`.
