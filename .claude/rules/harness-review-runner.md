---
paths:
  - "youcoded/desktop/src/main/harness/review/**"
  - "youcoded/desktop/test-engine/review-harness.mjs"
  - "youcoded/desktop/test-engine/review-roster.json"
last_verified: 2026-08-10
---

# Harness review runner (`test-engine/review-harness.mjs`)

**Not yet on `youcoded` master** as of 2026-08-10 — ships on `feat/harness-review-runner`,
hardened further on the in-flight `integration/harness-spec` branch (worktree
`youcoded/worktrees/harness-integration`). `verify:` anchors are deliberately omitted here
until that merge lands, since a path/test anchor for an unmerged file fails `/audit` on the
daily cron — add them (below) once merged. One command runs a battery of agentic tool
tasks against the native harness across an OpenRouter model roster, in a disposable
fixture: `npm run build:main && OPENROUTER_API_KEY=sk-... node test-engine/review-harness.mjs`.

- **The battery runs in a disposable `os.tmpdir()` fixture, never a real repo — and the
  fixture jail is held by `askUser`, not by `decide`.** `decide` is fully permissive
  (`{ action: 'allow' }`); the actual containment is `askUser` **denying every ask that is
  not a genuine `AskUserQuestion`**. `HarnessSession` routes three unrelated ask kinds
  through that one callback: the forced `external_directory` guard (Write/Read/Edit
  pointed outside the fixture root), the `doom_loop` guard, and the `max_steps` guard —
  none of them carry a `questions` field, so `askUser` denies anything without one. An
  earlier version answered all of these with a blanket `allow`, which let a model write
  outside the fixture (a Critical finding). This is the single most important invariant in
  the runner. Guard: `tests/harness-review-runner.test.ts` → "denies a Write outside the
  fixture instead of rubber-stamping it (Critical fix)".

- **`max_steps` alone gets a bounded number of allowed continuations, not a flat deny.**
  Unlike `doom_loop` (which only fails the one repeated call and lets the run continue), a
  non-`allow` answer to `max_steps` ends the WHOLE turn — a flat deny cost a paid Claude
  Opus 5 run its entire review at 80 tool calls (2026-08-09 incident) because the battery
  legitimately needs more than one step-budget window. `STEP_GATE_ALLOWANCE = 4`
  (`run-battery.ts`) grants up to 4 continuations before denying. Guard:
  `tests/harness-review-runner.test.ts` → "survives the max_steps gate up to
  STEP_GATE_ALLOWANCE" / "denies ... once STEP_GATE_ALLOWANCE is exhausted".

- **`OPENROUTER_API_KEY` is the only credential; the CLI deletes it from `process.env`
  before any battery runs.** The Bash tool spawns subprocesses with `env: process.env`,
  and the battery prompt asks models to test "env var persistence" — an open invitation to
  run `env`/`printenv`, and any such result lands in the saved transcript JSON.
  `makeOpenRouterFactory` takes the key as a plain argument, so nothing downstream needs it
  to still be in the environment.

- **`appendReview` is a pure function** — `(docText, run, runAtISO) => string`, no I/O —
  which makes "never disturbs other models' reviews" unit-testable rather than a habit the
  runner is trusted to keep; the CLI does the actual read/write. Guard:
  `tests/harness-review-runner.test.ts` → "leaves every existing review byte-identical".

- **The review is the model's FINAL assistant message — text after the last tool
  result — never the join of every `assistant-text` event.** `assistant-text` events are
  streaming deltas emitted throughout the whole run; joining all of them glued turn-by-turn
  narration onto the front of the real review (confirmed on a live Kimi K3 run: 36% of the
  joined text was pre-review commentary). Guard: `tests/harness-review-runner.test.ts` →
  "review is the FINAL assistant message, not every assistant-text delta".

- **The fixture must be byte-identical across runs, or reviews are not comparable.**
  `seedFixtureWorkspace()` writes the same bytes every call — deliberately, including one
  seeded internal contradiction (`config/settings.toml` vs `config/app.toml` disagree on
  `port`) that exists specifically to give a model a genuine reason to call
  `AskUserQuestion`; do not "fix" that inconsistency. Guard: `tests/harness-review-fixture.test.ts`
  → "produces byte-identical trees across runs".

**Once merged**, add a `verify:` block anchoring `src/main/harness/review/{fixture-workspace,
battery,run-battery,append-review,openrouter-factory}.ts`, `test-engine/review-harness.mjs`,
and both test files, and re-run `/audit`.

No depth doc — `docs/archive/plans/2026-08-06-harness-review-runner.md` and
`youcoded/desktop/test-engine/README.md` → "Review harness" cover the rest.
