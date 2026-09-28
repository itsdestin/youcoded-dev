---
status: draft
---

# Native harness instruction lifecycle implementation plan

> **For agentic workers:** use `superpowers:subagent-driven-development` or `superpowers:executing-plans`, one task per red/green/review boundary, after contract sign-off.

**Goal:** deliver the approved ancestor instructions and project rules at the right time, keep their loaded state consistent with model context, and report what was actually loaded.

**Architecture:** distinguish two roots: instruction FILE ancestry reaches filesystem root; path-scoped project RULE ancestry stops at the nearest Git project root. Capture startup instructions once, label each source and fit the aggregate budget. Retain the fixed system prompt; later rules are history messages. A first-write guidance barrier defers unexecuted calls with paired results so the model genuinely replans before any governed change.

**Tech stack:** TypeScript, Node filesystem promises, existing prompt/injection fitters and available frontmatter/glob utilities, Vitest, shared React context panel.

## Scope

Authority: `docs/active/design/2026-09-26-native-harness/native-harness.decisions.md`. Covers Q-3, Q-4, Q-5, Q-18 and Q-19. Workspace/app paths and source revision are recorded in the master plan. Dedicated global instruction locations, imports, eager/unscoped rules, arbitrary Bash-path analysis and hot reloading the full prompt are not authorized additions. The unreadable-preferred-file fallback edge R05 is not a separate approved repair.

## File responsibilities

- `src/main/harness/prompt-assembly.ts`: fixed prompt composition from a selected instruction inventory; no second independently assembled prompt.
- A focused `src/main/harness/injection/project-instructions.ts` if separation is needed: async ancestor discovery, one file per directory, stable source inventory and aggregate fitting. Avoid making the already-large host own traversal algorithms.
- `src/main/harness/injection/path-triggers.ts`: rule owner roots, nested file discovery and matching; not permission enforcement.
- `src/main/harness/harness-session.ts`: history visibility/deduplication and the first-write replan boundary.
- `src/main/harness/native-session-host.ts`: prepare immutable startup inventory for root create/resume and specialist construction; publish that same inventory to session-context reporting.
- `src/shared/types.ts`, `src/renderer/components/SessionContextPopup.tsx`, `session-context-facts.ts`: accurate multi-file facts using the existing Project tab and file-row presentation, with single-file compatibility for existing/Claude Code records.

## Task B1 — Full instruction-file ancestry with a truthful snapshot

**Tests:** `prompt-assembly.test.ts`, `injection-budget.test.ts`, `session-context.test.ts`, `session-context-panel.test.tsx`, `claude-code-context.test.ts`, `native-session-host.test.ts`.

**Interfaces:** represent each selected startup file as `{ path, name, full, text, truncated, note? }`, with ordered inventory held by the session/prompt assembly. Production discovery is async before session construction; prompt assembly consumes the snapshot synchronously. The aggregate project prompt part remains `id: 'project'` for existing consumers. Add an optional `projectInstructionFiles` summary array to SessionContext; old `projectInstructions` stays readable for old/Claude Code records. Existing `sessionContextText(sessionId, 'project', id?)` can select only a file from that session's captured inventory; no new arbitrary-file read capability.

- [ ] Add temp-directory root→parent→cwd tests that load every relevant ancestor, crossing `.git` directory AND worktree-file boundaries for instruction files. At each directory choose AGENTS.md if present, otherwise CLAUDE.md. Assert deterministic broad-to-narrow order and source labels.
- [ ] Add no dedicated `~/.claude/CLAUDE.md` lookup/import expansion, same-source dedupe, missing-file handling, and bounded aggregate-chain tests. Do not multiply the old per-file instruction budget by the number of ancestors. Preserve heading-aware shortening and identify every shortened/omitted source honestly.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/prompt-assembly.test.ts tests/injection-budget.test.ts`; observe chain/budget cases fail on the old nearest-only behavior.
- [ ] Introduce async inventory preparation and pass it through all production prompt construction paths found by repository-wide call-site search, including create, resume, specialist create/resume and evaluator fixture construction if it uses the same assembly. Do not silently use real home instruction files in tests.
- [ ] Keep the system prefix fixed for the life of the constructed session. Do not refresh or refit startup content on an unrelated model switch in this batch.
- [ ] Make `buildSessionContext` and project text retrieval use the captured fitted/full content, not a fresh file walk that may disagree with what the model received. Return summaries initially, bodies on demand. A post-start file edit must not be represented as already loaded.
- [ ] Teach the existing Project tab to present multiple captured sources using its established file rows; preserve single-file records and Claude Code's independent facts. No new settings or general instruction manager. If this necessary factual extension changes layout beyond repeated existing rows, show the prescribed Before/After deck rather than silently inventing UI.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/session-context.test.ts tests/session-context-panel.test.tsx tests/claude-code-context.test.ts tests/native-session-host.test.ts tests/ipc-channels.test.ts`. Verify optional project selection IDs pass through desktop and remote APIs without changing unsupported Android behavior.

## Task B2 — Inherited project rules and correct matching

**Files:** `src/main/harness/injection/path-triggers.ts`; reuse an already-declared YAML/glob library if suitable rather than adding a new dependency without need. **Tests:** `path-triggers.test.ts`, `rule-injection.test.ts`, `specialist-run.test.ts`.

**Interfaces:** preserve `TriggerIndex.match(touchedPath): PathTrigger[]` externally if possible. Internal rule records retain an absolute owning directory independently of session cwd. `PathTrigger.id` identifies its source, while `source` gives the model an accurate readable path. Git-root discovery accepts either a `.git` directory or file; rule discovery stops at that root even though B1's instruction-file ancestry does not.

- [ ] Add Git-root→cwd rule files that govern a file from two owner directories; assert each glob resolves against its own owner and only applicable rules are returned. Repeat for a child specialist whose cwd is narrowed beneath the project root.
- [ ] Add ordinary repo and linked-worktree fixtures, external-file negative cases, duplicate-source suppression and unchanged unscoped-rule exclusion.
- [ ] Add the actual audit cases: a quoted `paths` list entry with an inline comment must match `src/a.ts`; `**/src/**` must not match `notsrc/a.ts` but must match `src/a.ts` and `pkg/src/a.ts`. Test single-star non-crossing, zero/multiple-directory globstars, question marks and existing supported forms. Treat invalid patterns as nonmatching rather than throwing through every tool call.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/path-triggers.test.ts tests/rule-injection.test.ts` and record red cases.
- [ ] Implement structured frontmatter reading using the supported grammar; do not treat a trailing comment as pattern bytes. Keep no-usable-paths rules skipped. Implement segment-aware globstar translation or reuse an existing appropriate matcher; the Bash grant matcher is not appropriate because its separator semantics differ.
- [ ] Index rule folders between project root and cwd. Preserve the existing nested-instruction discovery bounds beneath cwd; exclude instruction files already present in B1's startup inventory. No project-wide recursive scan on every model step.
- [ ] Rerun suites and child-context tests. Retain source provenance and least-to-most-specific ordering without claiming that prose order is enforced permission precedence.

## Task B3 — Loaded-rule state follows retained context

**Files:** `src/main/harness/harness-session.ts` (`injectedTriggerIds`, clear/seed/summary/prune boundaries). **Tests:** `rule-injection.test.ts`, `harness-compaction.test.ts`, `native-compact.test.ts`, `native-clear-barrier.test.ts`, `harness-accepted-history.test.ts`.

**Interfaces:** use one reset/reconciliation helper for rule visibility. Do not reset only servedSkills/servedReads while leaving rule IDs behind. Rebuild dedupe from retained source-labelled injection messages when practical; otherwise rearm discovery at successful history-discard boundaries. A failed summary that never changes history must not pretend content disappeared.

- [ ] Convert the clear reproduction into a desired assertion: inject once, clear, touch the path again, then require a new rule message in the next model request.
- [ ] Test successful automatic/manual summary retiring the rule; retained recent rule; failed summary; resume seeded history; pruning; and ordinary repeated turns that must not spam unchanged rules.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/rule-injection.test.ts tests/harness-compaction.test.ts tests/native-compact.test.ts tests/native-clear-barrier.test.ts tests/harness-accepted-history.test.ts`; show the clear case red.
- [ ] Apply visibility reset/reconciliation only after committed replacement or actual clear/seed. Deduplicate an accepted-history restore already containing a rule when possible; never infer present content solely from a stale session-lifetime ID set.
- [ ] Rerun tests. Preserve read-before-write registry and skill reset semantics without broadening this task into skill catalog refresh.

## Task B4 — Guidance before the first file modification

**Dependency:** Batch A's safe-boundary/pending-tool finalization helper, B2 matching and B3 visibility state.

**Files:** `harness-session.ts` and its small tool-step helper if extracted for Batch A. **Tests:** `rule-injection.test.ts`, `harness-session-loop.test.ts`, `harness-history-rebuild.test.ts`, `harness-accepted-history.test.ts`.

**Interfaces:** before starting a validated Write/Edit call, collect newly relevant triggers. If none, preserve the fast path. If any, finish this accepted tool group truthfully: retain completed real results, mark this and remaining unexecuted calls as not run because newly relevant instructions need review, append the grouped results, then append fitted guidance as history messages. Loop to a NEW model request; do not execute the already-generated Write/Edit after merely inserting text. Never rewrite the system prompt.

- [ ] Script first-call Write/Edit with a rule that changes what should be written; assert zero execution before a subsequent request contains that guidance. Only a newly emitted/revised action may execute. If the model elects not to write, disk stays unchanged.
- [ ] Cover a Write after earlier successful calls in the same step, multiple pending modifications, original permission denial, no-new-rule path, malformed arguments, cancel while reconsidering, and a simultaneously ready user message. Finalize each announced call exactly once with truthful provenance.
- [ ] Preserve post-read injection for Read and other existing path-subject tools. Test that Bash, Skill, Task and web subjects do not activate file-path rules.
- [ ] Check a combined group of newly applicable rules against request budget: each has a source and truncation notice, and aggregate content cannot bypass the normal context fitting. Do not silently drop governing sources or introduce an endless replan loop when a body is shortened.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/rule-injection.test.ts tests/harness-session-loop.test.ts tests/harness-history-rebuild.test.ts tests/harness-accepted-history.test.ts` and observe pre-change zero-write expectations fail.
- [ ] Implement the barrier using shared paired-result finalization. Validate arguments before matching their file subject; keep existing path guards and permission evaluation for the newly issued call. A rule is guidance, not permission approval or a sandbox.
- [ ] Rerun the suites with the busy-message arrival cases from Batch A. The user correction and new rules both precede the next model request, no completed action is replayed, and transcript rebuild produces the same grouped tool history.

## Completion evidence

- [ ] Required regressions fail before implementation and pass after; replace this session's obsolete defect-expecting probes only when equivalent desired assertions exist.
- [ ] Fresh review checks ancestor scope, aggregate budgets, snapshot honesty, first-write timing and pairing.
- [ ] Review the existing context panel with multiple sources in isolated renderer tooling; never inspect the running built app.
- [ ] Update native-runtime reference claims that explicitly describe nearest-only discovery, post-write timing or lifetime-only rule dedupe, within the authorized changed subsystem. Do not edit unrelated guidance or the user's actual instruction files.
- [ ] Run the full desktop verification and IPC/shared-renderer tests as specified by the master plan. Offer a separately approved harness evaluation after deterministic verification; no paid calls without authorization.
