<!-- first run of the 2026-09-04 feature flow's code reviewer (scripts/ui-review/code-reviewer.md), on a pre-flow branch: data for the 'measure after three features' roadmap item -->

> **Triage (implementing session, 2026-09-04): F1–F11 all accepted. Fix: youcoded 0e2fd9cd. Merged 2026-09-05.**

# Code review — chore/specialists-stage-two-probes (2026-09-04)

Repo: /home/destin/youcoded-dev/worktrees/stage-two-probes, commit 863c28aa vs origin/master.
Files: desktop/test-engine/probe-parallel.mjs (edit), probe-prefix-fanout.mjs (new),
probe-plan-grammar.mjs (new), docs/engine-dependencies.md (+102 lines). No server was
started or contacted; every finding comes from reading the code, running the scripts with
no arguments, compiling the Ajv schema offline, and arithmetic on the doc's own numbers.

## verify.sh

```
verify: /home/destin/youcoded-dev/worktrees/stage-two-probes (base master)
  tests: none — no changed TS/JS files under desktop/
PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)
OK — all checks passed.
   NOTE: no test ran. Nothing changed under desktop/.
   Not covered: Android (./gradlew test), marketplace worker.
```

(verify.sh does not count `test-engine/*.mjs` as changed TS/JS, so nothing ran; there is
nothing unit-testable here anyway.)

Checks the task asked for, with the result:
- Ajv under the repo's module setup: `desktop/package.json` is `"type": "commonjs"`, ajv in
  node_modules is 8.20.0 (`main: dist/ajv.js`). `import Ajv from 'ajv'` in an `.mjs` resolves
  to the class; the probe's exact schema (lines 39-66) compiles under `strict: true`, accepts
  a valid nested plan (`repeat` → `$ref` recursion included) and rejects the
  `{name, description}` shape the doc says gemma emitted. Confirmed by running an extracted
  copy of the schema with the same `new Ajv({ strict: true, allErrors: true })`. **But see F2.**
- Rule `engine-local-models.md` ("any new probe MUST pass `--models-dir`"): both new probes'
  launch comments include `--models-dir <cacheDir>`. OK.
- "Harness's local-engine shape" claim in probe-plan-grammar.mjs: `parallel_tool_calls:false`
  is real (provider-registry.ts:252). The harness never sends `tool_choice` at all
  (`rg tool_choice src/main` → nothing); `auto` is the server default, so equivalent. Not a finding.
- Bare-argument runs: all three print a usage line and exit 2. OK (but see F6).
- Dead code: every field each probe returns is printed or used, except the pre-existing
  `promptMs`/`predictedMs` in probe-parallel's `chat()`, which this branch did not add.

## Findings (most severe first)

- F1 — desktop/test-engine/probe-parallel.mjs:29,66-93 — the new N-list argument breaks whenever the list does not contain `1` (e.g. `2,4,8`) or filters to empty (`a,b`): `singleAvg` stays `null`, so `null * r.n` = 0 makes every row print `Infinity%` and `serialized`, then line 93 throws `Cannot read properties of null (reading 'toFixed')`. The one documented invocation (`1,2,4,8`) happens to work. — Confirmed by reading the diff (only line 29 and the loop at 69 changed; the `if (n === 1) singleAvg = r.avg` baseline assumption at line 77 was not) plus JS semantics; not run against a server. Fix: require 1 in the list (or measure the baseline once before the loop).
- F2 — desktop/test-engine/probe-plan-grammar.mjs:33 — `ajv` is not a declared dependency of `desktop/`; it resolves only because `@modelcontextprotocol/sdk` and `electron-builder` pull `ajv@8.20.0` transitively, while `eslint` pulls `ajv@6.15.0`. A future lockfile change that changes hoisting silently swaps the version under the probe (ajv 6 has no `strict` option and no `$defs`). verify.sh's knip step stayed green because `unlisted` is not one of the gated categories. — Confirmed: `rg -i ajv desktop/package.json` → no match (rc=1); `npm ls ajv` shows only transitive paths; `npx knip --include unlisted` → `Unlisted dependencies (1) ajv test-engine/probe-plan-grammar.mjs:33:17`. Fix: add `ajv` to devDependencies.
- F3 — desktop/test-engine/probe-prefix-fanout.mjs:75-83 — `coldPrefixReq` is a copy of `chat()` (lines 44-61) minus the `res.ok` check. On an HTTP error the cold request calls `res.json()` on the error body: a non-JSON body surfaces as a bare `SyntaxError: Unexpected token …`; llama-server's JSON `{error:…}` body is accepted, the row prints `n/a`, `coldN` falls to `1` (line 97), and the script prints a confident `VERDICT: NO REUSE ACROSS SLOTS` with percentages like `215100% of cold`. — Confirmed by reading; `chat(userContent, prefix = PREFIX)` removes both the copy and the gap.
- F4 — desktop/test-engine/probe-prefix-fanout.mjs:96-111 — a response with no `timings` produces the wrong verdict instead of an error: `avg()` counts `null` as 0, so missing timings on the wave requests give `w1 = 0` → `REUSE SURVIVES FAN-OUT`; missing timings on the cold request give `coldN = 1` → `NO REUSE ACROSS SLOTS`. The row printer already knows how to say `n/a`; the verdict should refuse when any `promptN` is null. — Confirmed by reading the `?? 0` / `?? 1` fallbacks; the doc's thresholds (25% / 75%) do match the code at lines 108-111.
- F5 — docs/engine-dependencies.md:406-411 — the Probe 1 table does not match what `probe-parallel.mjs` prints, which is the branch's stated promise: the `vs N×single` column is dropped, and the `classification` column holds hand-written words the script never emits. With the table's own numbers and the thresholds at probe-parallel.mjs:88, N=1 prints `batched` (doc: `baseline`) and N=8 prints `partial` (1890 ms is neither ≤ 475×1.5 nor ≥ 475×8×0.7 = 2660; doc: `two waves: …`). — Confirmed by arithmetic on the doc's figures against line 88. Either print the script's column and put the interpretation in prose, or add the two-wave classification to the script.
- F6 — desktop/test-engine/probe-parallel.mjs:30 — usage string still reads `<baseURL> <modelId>` while the header (line 24) and the doc advertise the new `[N,N,...]` argument. — Confirmed by running the script with no arguments.
- F7 — desktop/test-engine/probe-prefix-fanout.mjs:33 and probe-plan-grammar.mjs:37 — `Number(nArg ?? 4)` / `Number(trialsArg ?? 3)` accept `NaN`, `0` and negatives: `N=abc` runs zero-length waves, `avg` is `0/0 = NaN`, every comparison is false and the verdict falls through to `NO REUSE ACROSS SLOTS`; `trials=abc` prints `0/NaN schema-valid`. probe-parallel.mjs:29 validates its list; these two do not. — Confirmed by reading; not run.
- F8 — desktop/test-engine/probe-plan-grammar.mjs:100-104 — a 200 response with no `choices` (or an `{error}` body served with 200) is scored `NO TOOL CALL` with empty text, the same label the doc reads as "answered in prose and never called the tool"; it should be its own outcome that prints the raw body. Also, if `call.function` is absent, the `catch` at line 104 itself throws on `call.function.arguments.slice` (uncaught TypeError). [PLAUSIBLE] — llama-server's OpenAI-compatible shape always includes both fields, so neither path was observed; confirmed by reading only.
- F9 — desktop/test-engine/probe-plan-grammar.mjs:104 — a tool call cut off by `max_tokens` (the doc says this happened on the 2B) is reported as `ARGS NOT JSON`, indistinguishable from real garbage; `json.choices[0].finish_reason` is in the response and never printed. — Confirmed by reading; the doc's "ran out of output budget" diagnosis had to be inferred from `raw`.
- F10 — desktop/test-engine/probe-prefix-fanout.mjs:13-28 — two header comments disagree with the code and the doc under them: (a) lines 24-28 tell a re-runner to launch with `--parallel 4` "so N is meaningful", but the doc section this same branch adds (Probe 1, finding 2) establishes `total_slots = 4` in the app's real shape too, that the two shapes have different KV semantics (unified pool vs per-slot quarters), and says not to adopt `--parallel`; the recommended launch is the one the doc says the app must not use, and the app-shape row in the doc cannot be reproduced from the comment. (b) Line 15 says wave 0 is "one request with P — the cold prefill", but the code (72-88) does an untimed warm-up with P and then times a different prefix `COLD`. — Confirmed by reading both files.
- F11 — desktop/test-engine/probe-plan-grammar.mjs:109-112 — the sense check inspects only the first `map` step (`find`), so a plan with three `map` steps of one item each — a fair reading of "one helper per file" — scores `map has 1 items, expected 3`. [PLAUSIBLE] that the 2B's "mapped over one file" trial in the doc was this shape; sum `items` across map steps instead.

Pre-existing, not this branch: probe-parallel.mjs `chat()` returns `promptMs`/`predictedMs` that nothing reads (unchanged lines); `desktop/test-engine/README.md` lists only probe-health/models/chat and none of parallel/prefix-cache/prefix-fanout/plan-grammar/tools.

## Not covered

- No script was run against a llama-server (forbidden for this review), so the doc's measured numbers were not reproduced; only their consistency with the scripts' thresholds and column names was checked.
- The `propose_plan` schema's fidelity to "spec §4" was not checked — the spec was not an input.
- Whether `total_slots`/`/props?model=` (the side finding in the doc) is right for b10665 belongs to the `fix/engine-slot-count-field` branch, not this one.

One line on design: the branch's contract is "doc matches script output"; F5 is the only place that contract is broken, and the cheaper fix is to make the script print the two-wave classification the doc already wants.
