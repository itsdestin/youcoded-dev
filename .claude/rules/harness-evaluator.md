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
last_verified: 2026-08-11
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
  three (Critical). **One path is exempt by design:** Bash's spill root
  (`tools/spill-paths.ts`) is `ok`, not an `external_directory` ask, so a model can read
  back its own truncated output. Guard: `harness-review-runner.test.ts` → "denies a Write
  outside the fixture instead of rubber-stamping it (Critical fix)".

- **The battery sets its own uniform step budget, not the app's per-model chat tiers.**
  `BATTERY_STEP_BUDGET = 100` overrides `stepBudgetFor`'s 25/50 tiers, which cut a
  40–80-call battery short. `STEP_GATE_ALLOWANCE = 1` (down from 4) gives one
  continuation before the gate denies. Guard: the `battery step budget` describe block.

- **Every run ends in a review or a labelled failure — three triggers, each a FACT.**
  Budget exhaustion, the wall clock, and `stopped-early` (the turn ended on its own with
  no text after the last tool result) each send a second turn carrying `WRAP_UP_PROMPT`
  with every tool call denied — including a genuine `AskUserQuestion`, which is
  `interactive: true` and so bypasses `decide()`; `askUser` denies it during wrap-up so
  the prompt's claim holds. Guard: the `wrap-up turn` describe block.

- **Do NOT add a heuristic trigger.** A 'restart' trigger counting repeated identical
  calls was deleted 2026-08-11 after truncating 8 paid runs at threshold 5 and 5 more at
  12 — every trip exactly one over, because the battery ("verify cwd persistence across
  calls") and read-before-edit both REQUIRE repeats. Repeats are reported
  (`REPEAT_REPORT_FLOOR`), never acted on. Guard: `repeat reporting (diagnostic only)`.

- **`runBattery` never throws for a run that produced events** — it returns `outcome`,
  `error`, and `metrics` instead. Round 5 lost four transcripts to a rejected promise.
  Guard: the `runBattery salvage` describe block.

- **Every appended review carries its run facts; a claimed tool the transcript never
  shows gets a warning above it.** `collectRunFacts` diffs claims against
  `metrics.toolsUsed`; `MIN_TOOL_CALLS = 10` flags a run too short to have covered the
  battery. Written after a 14-call run described Edit tests it never ran. Guard:
  `renderRunFacts`.

- **`review-harness.mjs`'s `delete process.env.OPENROUTER_API_KEY` does NOT stop the model
  reading the key** (measured 2026-08-12; ROADMAP → Bugs). `delete` is `unsetenv` — in-heap
  only, never rewrites `/proc/<pid>/environ`, which every same-uid descendant can read. The
  evaluator CLI closes it: `--key-file`, an inherited key REFUSED outright, worker config
  over stdin. Guard: `tests/harness-eval-key-leak.test.ts`, with a negative control that
  must report LEAKED.

- **The fixture is byte-identical across runs, so reviews stay comparable** — including a
  seeded contradiction (`config/settings.toml` vs `config/app.toml` disagree on `port`)
  giving a model reason to call `AskUserQuestion`; don't "fix" it. **`notes/pristine.md`
  is reserved for area 4's read-gate negative test** — point any other area at it and that
  test silently inverts into a passing Edit (it did, yielding a false "the read gate is
  inconsistent" finding). Guard: `harness-review-fixture.test.ts`.

- **Offer the battery after changing a harness tool; never run it unasked.** Measured
  2026-08-11: **$10.38 for rounds 6–8, ~$3.46 a roster** — an earlier "~$1.50" came from
  account-lifetime spend; `/api/v1/key` is the per-key figure. `--dry-run` is free,
  `--only "<label>"` is one model.

Changing the runner itself (review extraction, the two `HarnessSession` quirks it leans
on, the `appendReview` purity boundary): `youcoded/docs/harness-review-runner-internals.md`.
History: `docs/archive/plans/2026-08-06-harness-review-runner.md`,
`docs/archive/specs/2026-08-10-harness-review-runner-resilience-design.md`.
