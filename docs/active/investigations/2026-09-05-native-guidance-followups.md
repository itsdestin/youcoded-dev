---
status: active
---
# Native guidance follow-ups — deferred 2026-09-05

Destin approved removing the workspace's retired search integration and cleaning up active guidance now; runtime changes below are roadmap-only. This records requirements, not an approved implementation design.

## Source observations

- Native rule discovery exists in `youcoded/desktop/src/main/harness/injection/path-triggers.ts`: nested project instructions and path-scoped rules share an index. It is distinct from running external command hooks.
- `harness-session.ts` appends tool results and then calls `this.injectPathTriggers(step.toolCalls)`. Rules discovered by the first write are therefore delivered after that write. The rule enters model history, not a pre-execution reconsideration step.
- Workspace `.claude/settings.json` registers command hooks for `SessionStart`, `PreToolUse`, `PostToolUse`, and `InstructionsLoaded`. Source inspection found native rule injection but no corresponding native command-hook dispatcher; re-check the current implementation before building compatibility.

<!-- claim: {"path":"youcoded/desktop/src/main/harness/harness-session.ts","contains":"this\\.injectPathTriggers\\(step\\.toolCalls\\)"} -->
<!-- claim: {"path":".claude/settings.json","contains":"InstructionsLoaded"} -->

## Deferred requirements

### Command hooks and safe execution

Support approved command hooks for startup context, before-tool checks, after-tool feedback and instruction-load notifications. Resolve configuration sources and precedence explicitly. Define event/tool matchers, JSON input, working-directory/environment compatibility, exit-code handling and output delivery. Existing workspace examples are context-inject.sh, glob-guard.py, roadmap-edit-check.mjs and instructions-log.sh.

Approval must cover executable configuration and invalidate when it changes. Bound execution time/output, support cancellation and avoid leaking secrets. Distinguish advisory failures from blocking guard failures; neither may silently look successful. Hooks cannot elevate session permissions. Opening a repository alone must not authorize arbitrary commands. Test lifecycle ordering, denial, changed approval, timeout, cancellation and feedback delivery. Full Claude Code compatibility is not assumed.

### Rules before first write

If a proposed write discovers unseen governing instructions, return those instructions to the model and allow it to reconsider before the mutation. Merely inserting text without another model decision is insufficient. Preserve tool-call/result consistency and once-per-trigger behavior. Test direct first writes, prior reads, batched calls, retries, resumed sessions and worktree-relative paths. Bash writes need an explicit scope decision; this does not claim to solve the separately filed shell-write discovery problem.

### Accurate capability summary

Generate compact session facts from actual runtime state: active runtime, exposed tools, loaded instruction sources and hook enabled/disabled/failed/unsupported status. Do not assert that startup context was delivered solely because a config file exists. Keep failures distinct from empty results and avoid redundant context on every turn.

### Instruction provenance

Extend the existing context-and-knowledge roadmap idea with bounded diagnostics: source, trigger, load time, skipped/truncated status and reason. Verify resume, rule changes and worktree switching. This is diagnostic provenance, not another always-injected log or a duplicate full request recorder.

### Workflow routing

Complete a cross-procedure consistency pass over brainstorming, design decks, implementation, audit and wrap-up: one entry route, explicit precedence, available-skill checks and read-only versus editing versus shipping authorization. The core wording cleanup is immediate; changing procedures and adding mechanical availability/routing checks remains deferred. In particular, wrap-up's existing instruction to ask about merging conflicts with the standing no-merge-suggestion rule; the core rule continues to win.

## Deduplication

The original context-and-knowledge outline remains at `docs/archive/specs/2026-07-28-context-knowledge-app-features-outline.md`.

The context-and-knowledge product-surface item already covers "this rule loaded because…"; extend that item rather than add a competing provenance project. Native full-request recording, context truncation UI, native skills-home work and the workspace's shell-edit rule discovery are related but different and remain intact. Hook compatibility, first-write timing and capability truth are recorded as separate user-visible needs.
