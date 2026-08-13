---
paths:
  - "youcoded/desktop/src/main/harness/eval/**"
  - "youcoded/desktop/test-engine/harness-eval.mjs"
  - "youcoded/desktop/test-engine/harness-eval-worker.mjs"
  - "youcoded/desktop/test-engine/eval-plans/**"
  - "youcoded/desktop/test-engine/review-harness.mjs"
  - "youcoded/desktop/test-engine/review-roster.json"
  # Also fires on the code the evaluator EVALUATES, not just the evaluator — the person
  # changing a tool is the one who should be offered a run. Four live rounds found nine
  # defects here that 4,500 passing tests missed, because every test drives a scripted
  # fake model and none of them spend a real turn deciding what to do next.
  - "youcoded/desktop/src/main/harness/tools/**"
last_verified: 2026-08-13
verify:
  - path: youcoded/desktop/src/main/harness/eval/run-case.ts
    contains: "askUser: async"
  - path: youcoded/desktop/src/main/harness/eval/run-case.ts
    contains: "STEP_GATE_ALLOWANCE = 1"
  - path: youcoded/desktop/src/main/harness/eval/run-case.ts
    contains: "WRAP_UP_PROMPT"
  - path: youcoded/desktop/src/main/harness/eval/paths.ts
    contains: "export function graderRoot"
  - path: youcoded/desktop/src/main/harness/eval/run-facts.ts
    contains: "MIN_TOOL_CALLS"
  - path: youcoded/desktop/src/main/harness/eval/fixture-workspace.ts
    contains: "FIXTURE_MANIFEST"
  - path: youcoded/desktop/src/main/harness/eval/cases/index.ts
  - path: youcoded/desktop/src/main/harness/eval/assertions.ts
  - path: youcoded/desktop/src/main/harness/eval/judge.ts
  - path: youcoded/desktop/src/main/harness/eval/matrix.ts
  - path: youcoded/desktop/test-engine/harness-eval.mjs
    contains: "OPENROUTER_API_KEY"
  - test: youcoded/desktop/tests/harness-eval-key-leak.test.ts
  - test: youcoded/desktop/tests/harness-eval-assertions.test.ts
  - test: youcoded/desktop/tests/harness-eval-judge.test.ts
  - test: youcoded/desktop/tests/harness-eval-matrix.test.ts
  - test: youcoded/desktop/tests/harness-eval-report.test.ts
  - test: youcoded/desktop/tests/harness-review-fixture.test.ts
  - test: youcoded/desktop/tests/harness-review-runner.test.ts
---

# Harness evaluator (`test-engine/harness-eval.mjs`)

Runs a **case** (a task plus a rubric and mechanical checks) across a matrix of **code
version × instruction file × model**, each cell in its own disposable fixture, grading
every run twice: free checks read off the event stream, and an LLM judge. `--dry-run` is
free and needs no key; a real run needs `--key-file`.

- **The credential arrives by file or not at all.** `harness-eval.mjs` **refuses to start**
  if `OPENROUTER_API_KEY` is in its environment, and passes worker config over **stdin** —
  never argv, never env. `delete process.env.X` is `unsetenv`: in-heap only, it never
  rewrites `/proc/<pid>/environ`, which every same-uid descendant — including a Bash call
  the model makes — can read. **`review-harness.mjs` still has the bug** (ROADMAP). Guard:
  `harness-eval-key-leak.test.ts`, whose negative control must report LEAKED.

- **The grader always loads from the orchestrator's own build; only the worker loads the
  cell's `dist`** — else a branch-vs-master run silently compares two *graders* too.
  `paths.ts`: `graderRoot()` (ignores its argument on purpose) vs `harnessRoot(cell)`.
  Guard: `harness-eval-orchestrator.test.ts`.

- **A check has three states, and `never-ran` is not `passed`** — nothing was measured, and
  the report must render it visibly differently. The first version keyed it on an empty
  event list, unreachable in production, so a provider billing failure scored as a model
  failure. Guards: `harness-eval-assertions.test.ts` (discrimination-tested),
  `harness-eval-report.test.ts`.

- **Every judge grade must quote the answer verbatim or be discarded**, and contradiction
  warnings only warn — never adjust a score. They match tool ids, not prose; keying them on
  free text made a check that passed by proving a tool was *never* used register as proof
  it was. Guard: `harness-eval-judge.test.ts`.

- **The fixture jail is held by `askUser`, not `decide`.** `decide` is fully permissive;
  `askUser` denies every ask that isn't a genuine `AskUserQuestion` — `external_directory`,
  `doom_loop`, `max_steps`. **One path is exempt by design:** Bash's spill root
  (`tools/spill-paths.ts`) is `ok`, so a model can read back its own truncated output.
  Guard: `harness-review-runner.test.ts` → "denies a Write outside the fixture".

- **Uniform step budget, not the app's chat tiers** (25/50 cuts a 40–80-call run short),
  and **never end a run on a heuristic**: a repeat-counting trigger was deleted 2026-08-11
  after truncating 13 paid runs, because cwd-persistence and read-before-edit REQUIRE
  repeats.

- **Every run ends in an answer or a labelled failure** — three FACT triggers each send a
  second `WRAP_UP_PROMPT` turn with every tool denied. Scope per-turn scans to the
  *testing* turn; an unscoped scan sees the wrap-up and mislabels a run that recovered.
  `runCase` never throws for a run that produced events — round 5 lost four transcripts to
  a rejected promise.

- **The fixture is byte-identical across runs, so results stay comparable** — including a
  seeded `port` disagreement between `config/settings.toml` and `config/app.toml`; don't
  "fix" it, four cases depend on it. **`notes/pristine.md` is reserved for the read-gate
  negative test** — point anything else at it and that test silently inverts into a passing
  Edit. Guard: `harness-review-fixture.test.ts`.

- **There is no resume, and the estimate is deliberately high.** A stopped run re-pays for
  every finished cell. `estimate.ts` prices from the MAX of a case's samples, never the
  mean — under-predicting spends money nobody agreed to — so it reads **~2.2×** the real
  bill (~$0.25 a cell, 2026-08-13). **A case with no measured row is priced as a 40–63-call
  battery run**; the CLI names those rows as battery-priced. Treat them as HIGH.

- **Offer a run after changing a harness tool; never run the paid path unasked.**
  `--dry-run` is free; `--max-spend <usd>` is a hard cap re-checked against OpenRouter's
  own billing between cells.

Changing the evaluator itself: `youcoded/docs/harness-evaluator-internals.md`. History:
`docs/archive/specs/2026-08-12-harness-evaluator-design.md`.
