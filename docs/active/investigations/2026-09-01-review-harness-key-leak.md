---
date: 2026-09-01
status: active
type: investigation
topic: review-harness.mjs's API-key scrub does not stop the model reading the key — decide whether to retire the script or port the evaluator's fixes
---

# `review-harness.mjs` still leaks `OPENROUTER_API_KEY` to the model it runs

**Claim vs. reality.** `youcoded/desktop/test-engine/review-harness.mjs` reads `OPENROUTER_API_KEY`
into a local and then deletes it from `process.env`, with a comment saying this keeps the key out of
saved transcripts. It does not. `delete` compiles to `unsetenv`, which edits the in-heap environ
array; it never rewrites the `env_start..env_end` region the kernel exposes at `/proc/<pid>/environ`.
Every descendant of the runner can still read the parent's original environment — and the Bash tool
the model drives is exactly such a descendant.
<!-- claim: {"path": "youcoded/desktop/test-engine/review-harness.mjs", "contains": "delete process\\.env\\.OPENROUTER_API_KEY"} -->

**Measured 2026-08-12**, reproducing the runner's exact shape: the child reports `inherited-env: 0`
(the delete does work for the child's own copy) but `parent-environ: 1` from `/proc/$PPID/environ`;
`ps eww -p $PPID` leaks it too. The commonly-checked channels (`env`, `printenv`, `ps -eo args`,
`/proc/self/cmdline`) all read clean, which is why this survived.

**Reachable, not theoretical.** The battery prompt tells the model to "test env var persistence
across calls"; anything it reads lands in `run.events`, written verbatim to the gitignored
`docs/active/investigations/harness-review-runs/`. Blast radius: local disk plus whatever the model
quotes back. Severity moderate — dev-only script, OpenRouter-scoped key, semi-trusted models.

**Already fixed in the successor.** The native evaluator (`test-engine/harness-eval.mjs`, on master
since 2026-08-13) passes the credential over the child's stdin from `--key-file`, refuses to start if
`OPENROUTER_API_KEY` is in its own environment, and allowlists the child environment. Guard:
`youcoded/desktop/tests/harness-eval-key-leak.test.ts`, with a negative control that must report
LEAKED. The false assurance in the rule file was corrected 2026-08-13
(`.claude/rules/harness-evaluator.md`).

**The open decision.** `review-harness.mjs` is otherwise superseded — it imports its runner from
`dist/main/harness/eval/`, and the evaluator's `harness-battery` case runs the same battery. Retire
it, or port the three fixes? Retiring drops its one unique behaviour: appending each model's free-form
review into `docs/active/investigations/`. The file was last touched 2026-09-01 (`ebc59c35`) without
addressing this.

**History.** Filed 2026-08-12; rule corrected 2026-08-13; re-verified 2026-09-01.
