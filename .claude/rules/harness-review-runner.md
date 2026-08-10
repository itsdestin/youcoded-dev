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
    contains: "STEP_GATE_ALLOWANCE = 4"
  - path: youcoded/desktop/src/main/harness/review/append-review.ts
  - path: youcoded/desktop/src/main/harness/review/battery.ts
  - path: youcoded/desktop/src/main/harness/review/fixture-workspace.ts
  - path: youcoded/desktop/test-engine/review-harness.mjs
  - test: youcoded/desktop/tests/harness-review-fixture.test.ts
  - test: youcoded/desktop/tests/harness-review-runner.test.ts
---

# Harness review runner (`test-engine/review-harness.mjs`)

Shipped on `youcoded` master (`eba51705`, "Merge harness tool honesty + review runner").
One command runs a battery of agentic tool tasks against the native harness across an
OpenRouter model roster, in a disposable fixture: `npm run build:main &&
OPENROUTER_API_KEY=sk-... node test-engine/review-harness.mjs`.

- **The battery runs in a disposable `os.tmpdir()` fixture, never a real repo — and the
  fixture jail is held by `askUser`, not by `decide`.** `decide` is fully permissive
  (`{ action: 'allow' }`); the real containment is `askUser` **denying every ask that
  isn't a genuine `AskUserQuestion`**. `HarnessSession` routes three unrelated ask kinds
  through that one callback — the forced `external_directory` guard (Write/Read/Edit
  pointed outside the fixture root), `doom_loop`, and `max_steps` — none of which carry a
  `questions` field, so `askUser` denies anything without one. An earlier version
  blanket-allowed these, letting a model write outside the fixture (Critical finding) —
  the single most important invariant here. Guard: `tests/harness-review-runner.test.ts`
  → "denies a Write outside the fixture instead of rubber-stamping it (Critical fix)".

- **`max_steps` alone gets bounded continuations, not a flat deny.** Unlike `doom_loop`
  (which fails only the one repeated call), a non-`allow` answer to `max_steps` ends the
  WHOLE turn — a flat deny cost a paid Opus 5 run its entire review at 80 tool calls, as
  the battery legitimately needs more than one step-budget window. `STEP_GATE_ALLOWANCE
  = 4`. Guard: same file → "survives the max_steps gate up to STEP_GATE_ALLOWANCE".

- **`OPENROUTER_API_KEY` is the only credential; the CLI deletes it from `process.env`
  before any battery runs.** Bash spawns subprocesses with `env: process.env`, and the
  battery prompt asks models to test "env var persistence" — an invitation to run
  `env`/`printenv`, which would land the key in the saved transcript JSON.
  `makeOpenRouterFactory` takes the key as a plain argument, so nothing downstream needs
  it in the environment.

- **`appendReview` is pure** — `(docText, run, runAtISO) => string`, no I/O — which makes
  "never disturbs other models' reviews" unit-testable. Headings carry minute precision
  plus a build SHA (CLI resolves both via `git`); day-granularity alone produced
  indistinguishable same-day sections. Guard: `harness-review-runner.test.ts` → "leaves
  every existing review byte-identical".

- **`runBattery` sends an explicit output ceiling.** `BATTERY_MAX_OUTPUT_TOKENS = 32_000`
  flows through `BATTERY_HARNESS`, a copy of `ASSISTANT_PRESET` overriding only
  `limits.maxTokens` — app sessions keep the untouched preset. Unset, OpenRouter reserves
  the model's full hosted max and rejects the call (Opus 5 reserved 65,536 it never used).
  Guard: same file → "runBattery output ceiling (2026-08-10 incident)".

- **The review is the model's FINAL assistant message — text after the last tool
  result — never the join of every `assistant-text` event.** Those are streaming deltas
  emitted throughout the run; joining all of them glued turn-by-turn narration onto the
  real review (confirmed on a live Kimi K3 run: 36% pre-review commentary). Guard:
  `tests/harness-review-runner.test.ts` → "review is the FINAL assistant message, not
  every assistant-text delta in the run".

- **The fixture must be byte-identical across runs, or reviews aren't comparable.**
  `seedFixtureWorkspace()` writes the same bytes every call — deliberately, including a
  seeded contradiction (`config/settings.toml` vs `config/app.toml` disagree on `port`)
  that gives a model a genuine reason to call `AskUserQuestion`; do not "fix" it. Guard:
  `tests/harness-review-fixture.test.ts` → "produces byte-identical trees across runs".

- **Offer the battery after changing a harness tool; never run the paid path unasked.**
  ~$1.50 a roster, so it is Destin's call — but say the option exists. `--dry-run` is
  free; `--only "<label>"` is one model.

No depth doc — `docs/archive/plans/2026-08-06-harness-review-runner.md` and
`youcoded/desktop/test-engine/README.md` → "Review harness" cover the rest.
