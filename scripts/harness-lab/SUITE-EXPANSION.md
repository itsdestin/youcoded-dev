# Broader evaluation suite — build-first stage

This records the suite-expansion design and its coverage. Subsequent separately authorized runs completed the90-trial held-out harness baseline and11model attempts; no comprehensive570-trial result exists. See [current state](../../docs/active/plans/148-current-state.md). The old three-task result remains a pilot, not comprehensive evidence. No production optimization was applied.

## What is implemented

- **13 exportable deterministic filesystem cases:** three original pilot cases, two coherent-work cases, eight additional data/research/coding/recovery/injection/read-only cases. Each has a fixture and independently executed acceptance checker. Positive/negative controls include unchanged input, reference completion, wrong output and protection of unrelated files where required. Graders must not demand arbitrary reference wording or accept zero discovered tests.
- **Six separate evaluation-only candidate workloads:** reimbursement policy, offset-aware scheduling, correspondence triage, privacy-safe release, contingency selection, and constrained stock allocation. They use independent reference/counterexample controls and export through `--heldout`; they are not included in development exports. The reviewed first-evaluation set is frozen locally, with drift checks over definitions and exported task files. This is not live validation or a runtime/model configuration freeze. Correspondence uses supplied templates; operational rationale and summaries use verifiable structured facts rather than keyword-based prose grading.
- **Between-turn external-state scenario:** descriptor-safe controller mutation preserves expected-before checks and records before/after hashes, without adding a user message or agent tool. The native production-host scripted path, competitor sequencing, and an isolated network-free container mutation are tested. Live between-turn preservation subsequently passed across all5harnesses. This is not a synchronized within-turn Read/Edit race; that parity remains unmeasured.
- **Long-history retention generator:** reproducible archive batches, binding constraints and a later amendment, without restating answers in the final prompt. Generated size and repeated-history cost are estimates. Qualification requires actual per-request occupancy and matching context-window settings; threshold-compaction claims also require runtime event evidence. All5harnesses subsequently passed the15-turn real-model retention qualification; native compaction evidence exists for4, while Hermes compression remains unobserved. Requested context controls are not matched observed capacities. See `148-competitor-retention-qualification.md`.
- **Three conversation scenario definitions:** retain a brevity correction, update requirements across turns, retain binding constraints across manual compaction. Native runner supports declared user/compact steps in one actual production session, captures each step's output and status, and stops on failure. Scripted production-host smoke exercises multiple turns and a real summary/continuation path with a fake model, no network. This proves plumbing, not real-model memory quality.
- **Interaction accounting:** native streamed parts are coalesced; retracted text and child display copies excluded from parent verbosity. Counts user-visible messages/words, tool calls, observed tool groups, clarification calls and explicit batch replacements separately. Arbitrary Bash operations remain unknown. Physical requests come only from a request ledger. Failed/partial captures are separately labeled observed, not complete. Runner user inputs are scripted, not real humans.
- **Portable trajectory support:** ATIF adapter can analyze visible text/tool calls, but user roles may include injected context and progress may be omitted. It does not invent physical request counts or verified human actions from those steps.
- **Statistics:** reproducible paired task-cluster bootstrap helper weights independent task means equally instead of treating repetitions as independent tasks. It never declares public-claim readiness from a sample count alone.
- **Multi-model planning:** public OpenRouter catalog shortlist plus offline matrix planner. Unsupported model/client and capability combinations stay in the report. Prices are illustrative catalog rates, not a bound on a live bill.
- **OpenRouter guarded transport:** exact model/provider routing, no paid plugins/fallbacks/premium tiers, protocol-specific usage normalization, and a USD15 estimate-based spending ledger with provider billing checks. All five clients passed a tiny two-turn file canary, on explicitly different model/settings combinations; this is not whole-panel qualification or a performance ranking.
- **Agent-facing grading:** deterministic outcomes and measurable efficiency are primary. The user delegated rubric choice rather than rating stylistic alternatives. Subjective model grades remain provisional and separate; no human rating or human-comprehension validation is invented. Personal style calibration is not a prerequisite for objective reports.

## Commands (no model calls)

```bash
node scripts/harness-lab/suite.mjs /tmp/new-comprehensive-fixtures --comprehensive
node scripts/harness-lab/suite.mjs /tmp/new-evaluation-candidates --heldout
node scripts/harness-lab/evaluation-freeze.mjs /tmp/new-frozen-evaluation-set
node scripts/harness-lab/evaluation-freeze.mjs --verify /tmp/new-frozen-evaluation-set
node scripts/harness-lab/suite.mjs /tmp/new-between-turn-case --behavior
node scripts/harness-lab/suite.mjs /tmp/new-retention-probe --retention
node scripts/harness-lab/suite-readiness.mjs > /tmp/suite-readiness.json
node scripts/harness-lab/interactions.mjs /path/to/native-run-or-atif.json
node --test scripts/harness-lab/*.test.mjs youcoded/desktop/test-engine/lab-*.test.mjs
```

The native runner accepts `--scenario-file` pointing to a JSON array of declared steps, e.g.:

```json
[
  {"kind":"user","label":"initial","text":"Perform the initial task."},
  {"kind":"user","label":"correction","text":"Keep subsequent replies concise."},
  {"kind":"compact"},
  {"kind":"user","label":"followup","text":"Continue using our earlier constraints."}
]
```

Use this with `--smoke` for infrastructure checks; live runs still require explicit authorization, credentials and limits. Manual compaction is not a true context-threshold test. `scenario-checks.mjs` requires explicit execution completeness and actual successful compaction when declared; final output prose cannot establish artifact correctness. Human rubrics remain separate from mechanical word-count checks.

## Model panel

Fetched from the public OpenRouter model catalog on 2026-10-18:

| Model | Input USD/M | Output USD/M | Role |
|---|---:|---:|---|
| anthropic/claude-haiku-5.5 | 0.10 | 0.50 | Haiku control |
| openai/gpt-6-luna | 0.10 | 0.50 | OpenAI budget family |
| deepseek/deepseek-v4.1-flash | 0.04 | 0.144 | DeepSeek budget family |
| qwen/qwen3.8-flash | 0.15 | 0.47 | Additional near-Haiku-price family |
| google/gemini-3.5-flash-lite | 0.30 | 2.50 | Higher-cost budget control, explicitly separate |

These are catalog prices, not guaranteed endpoint rates. Do not silently replace the DeepSeek alias with its more expensive dated snapshot; choose and record the route/snapshot explicitly. No batch model variants in latency comparisons. Add another family only if it answers a distinct question; five models already multiply evaluation cost and analysis burden.

Use two distinct tracks:
1. Same-model comparison across clients that natively support that model/transport.
2. Model comparison under fixed YouCoded harness/configuration.

Claude Code is a Claude-model control, not a fictional all-model adapter. Differences in reasoning options, provider routes, cold/warm cache, permissions, plugins and project guidance must be controlled or disclosed. A Haiku-only, disabled-thinking gate cannot be reused unchanged for Luna/DeepSeek/Qwen/Gemini.

## Readiness gates still open — do not call the next run comprehensive yet

| Gate | What remains |
|---|---|
| OpenRouter shared budget transport | Implemented and locally HTTP-tested; independently verify endpoint context/tier/cache rates and run bounded real-client transport canaries before comparative use (see EXECUTION.md) |
| Cross-client conversations | Basic live continuity/file verification passed on all five clients; new external-state scenario and remaining feature/model combinations still need live qualification |
| Background follow-through | Native scripted production-host helper completion and automatic continuation now pass; real-model choices and equivalent competitor state evidence remain unmeasured |
| Stale-file race | Native synchronized external mutation now proves actual Edit rejection/preservation offline; equivalent competitor barriers remain to validate |
| True long context | Native automatic threshold trigger now exercised with synthetic occupancy; real-model constraint retention across long histories remains unmeasured |
| Interactive clarification | Root-session-scoped declared answer oracle now handles actual native AskUserQuestion; other permissions remain denied; competitor question interfaces and semantic necessity grading remain |
| Coverage/independence | More independently authored held-out tasks, not renamed variants of the same easy fixture; diversity by real product workload |
| Communication grading | Objective concision/instruction checks and progress accounting; subjective model grades remain provisional. Personal style calibration is not required for the agent-facing tool; no human-comprehension claims without validation |

The readiness CLI reports these gaps and refuses to grant live/public-comparison readiness. Filling arbitrary case counts is not sufficient. The next numerical report must show per-domain results, incomplete cells, paired uncertainty and total overhead including specialists/judges/retries without double counting.

## Optimization experiments (after credible measurements)

Current versus safe multi-edit; current versus approved leaner procedures; direct versus delegated work; same tasks/model/quality requirements. Reduce unnecessary model decisions, tool calls and user-visible messages **subject to correct completion and preserved safety**, not as independent targets that reward doing less work. No production optimization was applied in this expansion.
