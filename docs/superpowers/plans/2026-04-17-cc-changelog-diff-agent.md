# CC Changelog Diff Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenth `/release` review agent that diffs Claude Code's CHANGELOG between the last YouCoded release's CC version and the current CC version, plus the two supporting pieces it relies on: a baseline line in `youcoded/CHANGELOG.md` and a new `youcoded/docs/cc-dependencies.md` spine doc.

**Architecture:** Three additions across two repos held together by a CC version baseline. `/release` Phase 4 writes `**Claude Code CLI baseline:** vX.Y.Z` into each generated `youcoded/CHANGELOG.md` entry; next release, Phase 1 reads it. A new agent dispatched in parallel with the existing nine fetches CC's CHANGELOG (+ npm version list for cross-checks), cross-references against `youcoded/docs/cc-dependencies.md`, and returns `Findings` (block|warn) plus a `Future_work` field that gets appended to `docs/knowledge-debt.md` after user approval in Phase 3.

**Tech Stack:** Markdown-prompt subagents (matches the nine existing agents), `gh api` + `raw.githubusercontent.com` + `npm view`, bash in the release skill, pure docs for the dependency spine.

**Spec:** `docs/superpowers/specs/2026-04-17-cc-changelog-diff-agent-design.md`

---

## Cross-Repo Layout & Worktree Plan

Changes span three locations. Use a separate worktree for each repo that gets non-trivial changes. Workspace-level changes (spec, plan, knowledge-debt.md) go in `youcoded-dev` directly.

| Repo | Branch | Changes |
|---|---|---|
| `youcoded-admin` | `cc-changelog-diff-agent` (worktree) | New agent file, SKILL.md Phase 1/2/3/4 edits, fixtures |
| `youcoded` | `cc-dependencies-doc` (worktree) | New `docs/cc-dependencies.md`, PITFALLS.md update-discipline note |
| `youcoded-dev` | `master` (direct; spec+plan docs only) | Already done for spec; plan written here |

Each worktree is created with `git worktree add ../cc-<name> -b <branch>` from inside that repo, per the "Use worktrees for non-trivial work" rule in `CLAUDE.md`.

---

## File Structure

### youcoded repo

- **Create:** `docs/cc-dependencies.md` — spine doc listing each CC touchpoint (files / depends-on / break-symptom).
- **Modify:** `docs/PITFALLS.md` — add discipline line under Cross-Platform section telling contributors to update `cc-dependencies.md` when adding CC-coupled code.

### youcoded-admin repo

- **Create:** `skills/release/agents/review-cc-changes.md` — the tenth agent's markdown prompt. Follows the exact shape of the existing nine agents (Role / Inputs / Process / Output Format / Guidelines).
- **Create:** `skills/release/agents/__fixtures__/review-cc-changes/` — fixture inputs for manual verification:
  - `cc-changelog-sample.md`
  - `cc-dependencies-sample.md`
  - `youcoded-changelog-sample.md` (contains a baseline line)
  - `npm-time-sample.json`
  - `expected-output.md`
- **Modify:** `skills/release/SKILL.md`
  - Phase 1: new steps to read baseline, capture current CC version, fetch CC CHANGELOG, fetch npm `time`, load `cc-dependencies.md`. Everything prepared as named context variables.
  - Phase 2: new agent-dispatch section for `review-cc-changes`. Update "Dispatch all 9" → "Dispatch all 10". Add `Future_work` to the expected return format description.
  - Phase 3: new `CC FUTURE WORK` section in the unified report. New post-approval step that appends approved items to `docs/knowledge-debt.md` in the youcoded-dev workspace.
  - Phase 4 Step 2: CHANGELOG-generation template for youcoded gains the `**Claude Code CLI baseline:** vX.Y.Z` line. Normalize `CLAUDE_VERSION` via a small inline bash regex. Non-blocking warning when capture is empty.

### youcoded-dev workspace

- **Already modified:** `docs/superpowers/specs/2026-04-17-cc-changelog-diff-agent-design.md` (committed).
- **Written here:** `docs/superpowers/plans/2026-04-17-cc-changelog-diff-agent.md` (this file).
- **Runtime-appended-to by future releases:** `docs/knowledge-debt.md` (no edit required for this plan; path will be referenced by Phase 3).

---

## Testing Strategy

Classic TDD doesn't fit markdown-prompt subagents. Instead:

1. **Fixture-driven manual verification (Task 6).** Create a complete set of inputs that represent a realistic release scenario, plus an expected-output file. Run the agent via the `Agent` tool with the fixtures as context, compare actual vs expected by inspection. Iterate on the agent prompt until output matches.
2. **Dry-run the full release flow (Task 11).** After all changes are in place, simulate a release end-to-end on the current master of both repos without actually tagging/pushing. Confirm Phase 1 context collection, Phase 2 ten-agent dispatch, Phase 3 report rendering including `CC FUTURE WORK`, and Phase 4 CHANGELOG baseline injection all work.
3. **Normalization logic check (Task 4 Step 3).** The version-normalization regex is the one piece of logic worth testing in isolation; do it as a bash one-liner smoke test.

Commit after each task. Never roll the tasks into a single mega-commit.

---

## Task 1: Create `youcoded/docs/cc-dependencies.md`

**Files:**
- Create: `youcoded/docs/cc-dependencies.md`

Work in a new worktree of the `youcoded` repo.

- [ ] **Step 1: Create worktree for the youcoded changes**

```bash
cd ~/youcoded-dev/youcoded
git fetch origin && git pull origin master
git worktree add ../../.worktrees/cc-dependencies-doc -b cc-dependencies-doc
cd ../../.worktrees/cc-dependencies-doc
```

Expected: new worktree directory at `youcoded-dev/.worktrees/cc-dependencies-doc/`, checked out to branch `cc-dependencies-doc`.

- [ ] **Step 2: Write the dependency doc**

Create `docs/cc-dependencies.md` with this exact content:

```markdown
# Claude Code Dependencies

This doc tracks every place YouCoded couples to Claude Code's behavior. The `review-cc-changes` release agent reads it to map CC CHANGELOG entries to code that might break. Humans read it when adding CC-adjacent code.

## When to update

When you add code that parses CC output, consumes a CC file, depends on CLI behavior, or matches a CC text pattern, add an entry below. An omitted touchpoint silently downgrades the release agent to free-reasoning-only mode for that area — don't rely on the agent to notice a coupling that isn't documented here.

Each entry has three fields:

- **Files:** one or more code paths
- **Depends on:** plain-English description of the CC aspect this code relies on
- **Break symptom:** observable user-facing failure if CC changes this

## Touchpoints

### Transcript JSONL shape
- **Files:** `desktop/src/main/transcript-watcher.ts`, `desktop/src/renderer/state/chat-reducer.ts`
- **Depends on:** JSONL entries in `~/.claude/projects/<hash>/*.jsonl` with fields `type`, `message.role`, `message.content[]` (including `text`, `tool_use`, `tool_result`, `thinking` block shapes), `message.usage`, `requestId`, `stop_reason`, and per-turn heartbeats for extended-thinking models
- **Break symptom:** Transcript events stop dispatching; chat UI goes silent while CC still runs. Per-turn metadata (model, usage, requestId, stopReason) disappears from turn bubbles and attention banners.

### Per-turn metadata fields
- **Files:** `desktop/src/renderer/state/chat-reducer.ts` (`TRANSCRIPT_TURN_COMPLETE`, `TRANSCRIPT_ASSISTANT_TEXT` handlers)
- **Depends on:** `message.usage.{input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens}`, outer `requestId` (Anthropic `req_…`), `stop_reason` values (`end_turn`, `max_tokens`, `refusal`, `stop_sequence`, `pause_turn`), Anthropic model ID in `message.model`
- **Break symptom:** Token usage / request ID footers disappear; stop-reason banners mis-render; session-pill model reconciliation stops working.

### PTY spinner regex (attention-classifier)
- **Files:** `desktop/src/renderer/state/attention-classifier.ts` (`SPINNER_RE`)
- **Depends on:** CC thinking-spinner glyphs `[✻✽✢✳✶*⏺◉]` and suffix `(Ns · esc to interrupt)` (case-insensitive)
- **Break symptom:** `attentionState` misclassifies — AttentionBanner shows false positives or negatives; ThinkingIndicator visibility wrong.

### Other PTY attention patterns
- **Files:** `desktop/src/renderer/state/attention-classifier.ts` (regexes for awaiting-input, shell-idle, error, stuck)
- **Depends on:** CC's prompt-boundary phrases and idle markers rendered to the terminal buffer
- **Break symptom:** AttentionBanner states misfire; user sees wrong guidance during PTY-based interactions.

### Hook protocol
- **Files:** `app/src/main/assets/hook-relay.js` (Android), `desktop/src/main/hook-relay.ts` (desktop), `youcoded-core/core/hooks/hooks-manifest.json`
- **Depends on:** CC's hook event JSON shape (`SessionStart`, `PreToolUse`, `Notification`, etc. — fields `tool_name`, `tool_input`, `session_id`, etc.), CC's `settings.json` hooks schema accepted by the loader
- **Break symptom:** Hooks silently stop firing or fail with cryptic errors; write-guard / worktree-guard / statusline stop functioning.

### Plugin registry four-file format
- **Files:** `desktop/src/main/claude-code-registry.ts`, `app/src/main/.../skills/PluginInstaller.kt`
- **Depends on:** Exact file format of (a) `~/.claude/settings.json` `enabledPlugins` entry key shape `"<id>@<marketplace>": true`, (b) `~/.claude/plugins/installed_plugins.json` v2 entry schema with absolute `installPath`, (c) `~/.claude/plugins/known_marketplaces.json`, (d) `~/.claude/plugins/marketplaces/<marketplace>/.claude-plugin/marketplace.json`
- **Break symptom:** Installed plugins invisible to CC loader; skill marketplace installs report success but `/reload-plugins` shows "0 new plugins".

### Slash commands YouCoded references or intercepts
- **Files:** `desktop/src/renderer/components/SessionPill.tsx` (references `/model`), any component that suggests a slash command to the user
- **Depends on:** CC's command names stable across releases (`/model`, `/resume`, `/compact`, `/help`, etc.)
- **Break symptom:** Session-pill reconciliation mis-detects model drift; user-facing tips reference dead commands.

### Anthropic model ID convention
- **Files:** `desktop/src/renderer/state/chat-reducer.ts` (per-turn metadata), `desktop/src/renderer/components/SessionPill.tsx`
- **Depends on:** Dotted-hyphen model ID form (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) served by CC in transcript `message.model`
- **Break symptom:** Unknown model IDs render raw in session pill; display-name lookup fails silently.

### CLI invocation flags
- **Files:** `desktop/src/main/session-manager.ts`, `app/src/main/.../runtime/PtyBridge.kt`
- **Depends on:** `claude` CLI accepting the flags YouCoded passes at launch (notably `--resume <session-id>` and any default flags in the launch command)
- **Break symptom:** Session resume breaks; PTY spawns fail; new sessions launch in unexpected state.

### Permission flow messages
- **Files:** `desktop/src/main/permission-handler.ts` (if present under that name; the code path that dispatches `PERMISSION_REQUEST` and consumes `PERMISSION_RESPONSE`), `desktop/src/renderer/state/chat-reducer.ts`
- **Depends on:** CC's approval-request shape in transcript or hook-relay, matching the IPC message YouCoded constructs for `PERMISSION_REQUEST`
- **Break symptom:** Permission prompts don't appear; approvals never propagate back to CC; tool calls hang in `awaiting-approval`.

### JSONL transcript file location
- **Files:** `desktop/src/main/transcript-watcher.ts`
- **Depends on:** Transcript files written at `~/.claude/projects/<encoded-cwd-path>/*.jsonl` with CC's path-encoding scheme
- **Break symptom:** Transcript watcher watches the wrong directory; chat UI silent for all sessions.

### claude --version output format
- **Files:** `youcoded-admin/skills/release/SKILL.md` (Phase 4 Step 3 and Step 2 baseline-line injection)
- **Depends on:** `claude --version` output containing a parseable `\d+(\.\d+)+` substring
- **Break symptom:** Release skill's CC version capture fails; baseline line not written; next release's `review-cc-changes` agent exits with the "no baseline" notice.
```

- [ ] **Step 3: Commit**

```bash
git add docs/cc-dependencies.md
git commit -m "docs(cc-dependencies): add CC touchpoint spine doc

New doc listing every place YouCoded couples to Claude Code behavior —
transcript JSONL, PTY spinner regex, hook protocol, plugin registry
four-file format, model IDs, CLI flags, etc. Consumed by the upcoming
review-cc-changes release agent; maintained manually when adding
CC-adjacent code.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: commit lands on `cc-dependencies-doc` branch.

---

## Task 2: Add update-discipline note to `youcoded/docs/PITFALLS.md`

**Files:**
- Modify: `youcoded/docs/PITFALLS.md` — no existing YouCoded app PITFALLS.md; the canonical one is at `youcoded-dev/docs/PITFALLS.md`. The instruction still needs somewhere discoverable inside the `youcoded` repo. Create `youcoded/docs/PITFALLS.md` as a pointer doc if it doesn't exist.

Work continues in the same worktree as Task 1.

- [ ] **Step 1: Check whether `youcoded/docs/PITFALLS.md` exists**

```bash
cd ~/youcoded-dev/.worktrees/cc-dependencies-doc
ls docs/PITFALLS.md 2>/dev/null && echo "exists" || echo "missing"
```

Branch on the result: if it exists, append; if it's missing, create a minimal file that points at the workspace PITFALLS and includes the new discipline note.

- [ ] **Step 2a: If PITFALLS.md exists — append the discipline note**

Append this to the end of the existing `docs/PITFALLS.md`:

```markdown

## Claude Code coupling

When you add code that parses CC output, consumes a CC file, depends on CLI behavior, or matches a CC text pattern, add an entry to `docs/cc-dependencies.md`. The `review-cc-changes` release agent reads that doc to map CC CHANGELOG entries to code that might break — an omitted touchpoint silently downgrades the agent's coverage to free-reasoning-only mode for that area.
```

- [ ] **Step 2b: If PITFALLS.md is missing — create it**

Write `docs/PITFALLS.md` with:

```markdown
# YouCoded App Pitfalls

Canonical pitfalls for the full workspace live at `../../youcoded-dev/docs/PITFALLS.md`. This file holds app-repo-specific additions that don't belong in the workspace doc.

## Claude Code coupling

When you add code that parses CC output, consumes a CC file, depends on CLI behavior, or matches a CC text pattern, add an entry to `docs/cc-dependencies.md`. The `review-cc-changes` release agent reads that doc to map CC CHANGELOG entries to code that might break — an omitted touchpoint silently downgrades the agent's coverage to free-reasoning-only mode for that area.
```

- [ ] **Step 3: Commit**

```bash
git add docs/PITFALLS.md
git commit -m "docs(pitfalls): require cc-dependencies.md updates for CC coupling

Contributors adding CC-coupled code (output parsing, file format,
CLI behavior, text pattern matching) must add an entry to
docs/cc-dependencies.md. The review-cc-changes release agent relies
on this doc; omissions silently downgrade its coverage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Push the branch (don't merge yet — agent changes need to land first for a coordinated review)**

```bash
git push -u origin cc-dependencies-doc
```

Expected: branch pushed; no PR opened yet. The worktree stays in place until the matching `youcoded-admin` branch is also ready (Task 11 opens the PRs together).

---

## Task 3: Set up worktree for `youcoded-admin` changes

**Files:** (worktree setup — no file changes)

- [ ] **Step 1: Create worktree**

```bash
cd ~/youcoded-dev/youcoded-admin
git fetch origin && git pull origin master
git worktree add ../../.worktrees/cc-changelog-diff-agent -b cc-changelog-diff-agent
cd ../../.worktrees/cc-changelog-diff-agent
```

Expected: worktree at `youcoded-dev/.worktrees/cc-changelog-diff-agent/`, branch `cc-changelog-diff-agent`.

- [ ] **Step 2: Verify you can read the existing agent shape**

```bash
ls skills/release/agents/
cat skills/release/agents/review-docs.md | head -40
```

Expected: nine existing agent files listed; `review-docs.md` header visible with `# ... Review Agent` / `## Role` / `## Inputs` sections.

No commit in this task — it's setup only.

---

## Task 4: Create the `review-cc-changes` agent prompt

**Files:**
- Create: `skills/release/agents/review-cc-changes.md`

- [ ] **Step 1: Write the agent file**

Create `skills/release/agents/review-cc-changes.md` with exactly this content (matching the shape of `review-docs.md` — Role/Inputs/Process/Output/Severity/Guidelines):

````markdown
# Claude Code Changelog Diff Review Agent

Diff Claude Code's upstream CHANGELOG between the last YouCoded release's CC version and the current CC version, and flag entries that may break YouCoded, need verification before tag, or are worth recording for a future release.

## Role

You are a Claude Code changelog differ for YouCoded releases. Your job is to compare every entry in the Claude Code CHANGELOG published since the last YouCoded release against the YouCoded-side touchpoints documented in `youcoded/docs/cc-dependencies.md`, and classify each entry as blocker, warning, or future-work.

You are one of ten review agents dispatched in parallel during Phase 2 of the release skill. You receive pre-collected context (you do NOT fetch files yourself) and return a structured report. Your category is `cc-changes`.

## Inputs

You receive the following context in your prompt. Everything network-bound has already been fetched or normalized by Phase 1.

- **baseline_version**: Normalized bare semver string (no `v` prefix) read from the most recent `## v` entry in `youcoded/CHANGELOG.md`. May be `null` if no baseline exists (first release tracking CC, or write-path failed last release).
- **current_version**: Normalized bare semver string (no `v` prefix) extracted from the admin machine's `claude --version` output. May be `null` if capture failed.
- **cc_changelog_contents**: Full text of `anthropics/claude-code`'s `CHANGELOG.md` from the default branch. May be `null` if fetch failed.
- **npm_time_json**: Output of `npm view @anthropic-ai/claude-code time --json`, a map of version → ISO publish date. May be `null` if fetch failed.
- **cc_dependencies_contents**: Full text of `youcoded/docs/cc-dependencies.md`. May be `null` if the file is missing from the youcoded repo.
- **youcoded_changed_files**: List of files changed in the youcoded repo in this release window (already provided to other agents; used only for cross-reference if the agent wants to assess whether in-flight code has already addressed a CC change).
- **youcoded_core_changed_files**: Same, for youcoded-core.

## Process

Work through these steps in order.

### Step 1: Preflight

Check each input. Return an empty `Findings` array and an informational `Summary` if any of these conditions hold — **do not proceed to later steps**:

| Condition | Summary text | `Future_work` field |
|---|---|---|
| `baseline_version` is null | "No CC baseline in prior CHANGELOG; diff skipped this release (expected on first release after agent introduction)." | empty |
| `current_version` is null | "Current CC version not captured on admin machine; diff skipped. Install or expose `claude` CLI on the release machine." | empty |
| `baseline_version == current_version` | "CC version unchanged since last YouCoded release (vX.Y.Z); nothing to diff." | empty |
| `cc_changelog_contents` is null (both gh-api and raw.githubusercontent.com failed) | "CC CHANGELOG unreachable for vX → vY; manual review needed." | empty |

### Step 2: Slice CHANGELOG entries in range

Parse `cc_changelog_contents` as markdown. Each version entry begins with a line matching `^##\s+v?\d+(\.\d+)+` — capture the version (strip any `v` prefix). Extract entries where the captured version satisfies `baseline_version < version <= current_version` using semver ordering.

If the slice is empty, return a single informational finding noting "CC CHANGELOG shows no entries in (vA, vB]" and no Future_work items.

### Step 3: Cross-check against npm

If `npm_time_json` is available, compute the set of versions published to npm in the date window `(baseline_publish_date, current_publish_date]`. For each npm version not present in the CHANGELOG slice, add a `warn`-severity finding:

- `description`: `"CC v<X.Y.Z> published on <date> but has no CHANGELOG entry; manual review needed for this version."`
- `suggestion`: `"Read the release notes on github.com/anthropics/claude-code/releases/tag/v<X.Y.Z> and verify no YouCoded-relevant changes were made."`

If `npm_time_json` is null, skip this step silently (do not emit a warning about it).

### Step 4: Load dependency touchpoints

Parse `cc_dependencies_contents` by splitting on `^###\s+` headings. For each heading, extract the title and the three fields (**Files**, **Depends on**, **Break symptom**) into a touchpoint record.

If `cc_dependencies_contents` is null or unparseable, emit a single `warn`-severity finding noting free-reasoning-only mode for this release, and continue to Step 5 without the touchpoint list.

### Step 5: Classify each CHANGELOG entry

For each entry in the sliced range (excluding npm-gap entries already handled in Step 3), classify into exactly one bucket:

#### Bucket A — `block` severity finding

Trigger: the entry's described change contradicts a touchpoint's **Depends on** in a way that would trigger its **Break symptom**.

Example: touchpoint says "CC thinking-spinner glyphs `[✻✽✢✳✶*⏺◉]`"; entry says "Changed thinking spinner glyph to ◈". The new glyph isn't in the character class; `SPINNER_RE` will fail to match → `attentionState` misclassifies.

Emit: `severity: block`, with `file` set to the first path listed in the touchpoint's **Files** field, `description` quoting both the touchpoint coupling and the CHANGELOG text, `suggestion` naming the exact code location and the minimum change needed.

#### Bucket B — `warn` severity finding

Trigger: ANY of:
- The entry touches an area named in a touchpoint but without a clear breakage (example: "improved thinking heartbeat cadence" — might affect reducer handlers but not obviously).
- The entry doesn't match a touchpoint by name, but keywords from the entry grep-match files in `youcoded_changed_files` or `youcoded_core_changed_files` or obvious YouCoded code paths (you may reason about paths you know exist even if not in the changed-files list).
- The entry is a new model ID, new CLI flag, or user-visible tweak that is informational-but-worth-eyeballing-this-release (what the prior spec draft called "checklist-updates"). Example: "Added claude-opus-4-8 model" — not a break, but user should verify session-pill display before tag.

Emit: `severity: warn`, with `file` as the most likely-affected path, `description` quoting the CHANGELOG text and naming the suspected coupling, `suggestion` describing the verification step ("Open a session after upgrade; confirm session pill renders the new model ID correctly").

#### Bucket C — `Future_work` item

Trigger: the entry describes a new CC feature or capability that YouCoded doesn't use today but could benefit from surfacing or adopting in a future release. Example: "Added `/approve-next N` CLI flag" — YouCoded could build UI around this but doesn't need to this release.

Do NOT add to Findings. Instead, append to `Future_work` with:
- `title`: short imperative describing the opportunity ("Surface /approve-next in permission panel")
- `description`: what CC added, why it might be useful for YouCoded, rough effort estimate if obvious
- `changelog_entry`: the quoted CHANGELOG line

#### Bucket D — No-op

If the entry is purely internal to CC (dependency bumps, internal refactors, unrelated bug fixes to areas YouCoded never touches), ignore it. Do NOT add to Findings or Future_work. Do NOT emit "informational" noise — the user does not want to triage every dependency bump.

### Step 6: Compile Findings and Future_work

Review all findings and future-work items. For each:
1. Confirm it is a genuine match, not a false positive.
2. Confirm the severity matches the rules above (don't over-promote to `block` without concrete breakage).
3. Quote the CHANGELOG text literally so the user can verify your reading.

## Output Format

Return exactly this shape:

```
Category: cc-changes
Findings:
  - severity: block
    repo: youcoded
    file: desktop/src/renderer/state/attention-classifier.ts
    line: 42
    description: "CC v2.1.0 CHANGELOG: 'Changed thinking spinner glyph to ◈'. cc-dependencies.md touchpoint 'PTY spinner regex' names character class [✻✽✢✳✶*⏺◉]. SPINNER_RE will not match the new glyph."
    suggestion: "Add ◈ to the SPINNER_RE character class in attention-classifier.ts before tagging."
  - severity: warn
    repo: youcoded
    file: desktop/src/renderer/components/SessionPill.tsx
    line: null
    description: "CC v2.0.18 CHANGELOG: 'Added claude-opus-4-8 as default model'. Session pill display-name lookup may not have claude-opus-4-8 registered."
    suggestion: "After upgrade, open a session and verify the pill renders 'Opus 4.8' or a sensible fallback; add to MODEL_DISPLAY_NAMES if missing."
Future_work:
  - title: "Surface /approve-next in permission panel"
    description: "CC v2.1.0 added a /approve-next N flag that pre-authorizes the next N tool calls. YouCoded's permission panel could add a 'approve next 3' toggle. Small-medium UI work."
    changelog_entry: "v2.1.0: Added /approve-next N CLI flag to pre-authorize a batch of upcoming tool calls."
Summary: "1 blocker (spinner regex), 1 warning (new model ID), 1 future-work item (batch permission UI). CC v2.0.15 → v2.1.0, 6 CHANGELOG entries in range."
```

### Field Definitions

| Field | Type | Description |
|---|---|---|
| `Category` | string | Always `"cc-changes"` for this agent |
| `Findings` | array | List of finding objects, may be empty if no relevant changes |
| `Findings[].severity` | `"block"` or `"warn"` | See Severity Guide below |
| `Findings[].repo` | `"youcoded-core"` or `"youcoded"` | Which YouCoded repo the coupling lives in |
| `Findings[].file` | string | Relative path to the YouCoded file that would need attention |
| `Findings[].line` | integer or null | Line number if known, null otherwise |
| `Findings[].description` | string | What CC changed and how it intersects YouCoded code. Quote the CHANGELOG text. |
| `Findings[].suggestion` | string | Exact verification or fix step |
| `Future_work` | array | List of future-work items that should go to knowledge-debt.md after user approval |
| `Future_work[].title` | string | Short imperative describing the opportunity |
| `Future_work[].description` | string | What CC added, why it might be useful for YouCoded |
| `Future_work[].changelog_entry` | string | Quoted CHANGELOG line |
| `Summary` | string | One-line assessment including counts and the version range diffed |

### Severity Guide

| Situation | Severity |
|---|---|
| CHANGELOG entry directly contradicts a touchpoint **Depends on** and would trigger its **Break symptom** | `block` |
| CHANGELOG entry names something in a touchpoint area, but break is uncertain or requires verification | `warn` |
| npm version in range without CHANGELOG coverage | `warn` |
| New model ID / CLI flag / user-visible tweak that YouCoded should eyeball but likely handles | `warn` |
| New CC feature YouCoded could adopt in a future release | `Future_work` (not Findings) |
| Dependency bump, internal CC refactor, bug fix in area YouCoded never touches | No-op — omit entirely |

## Guidelines

- **Be specific**: Always quote the CHANGELOG text verbatim and name the exact touchpoint (or the exact grep result) that ties it to YouCoded code. Vague findings are not actionable.
- **Don't over-promote to block**: Only use `block` when you can describe a concrete broken behavior. If you're guessing, use `warn`.
- **Don't flood with noise**: Internal CC refactors, dependency bumps, and bug fixes in unrelated areas do NOT need findings or future-work entries. The user specifically does not want to triage every CC change — they want the ones that matter for YouCoded.
- **Quote literally**: When referencing CHANGELOG text, quote it. When referencing a touchpoint, name it by heading.
- **Empty is fine**: If the diff is in range but nothing intersects YouCoded, return an empty Findings array with a Summary like "3 CC entries in vA → vB; all internal CC work, no YouCoded relevance."
- **Non-blocking by design**: Even when network calls failed in Phase 1, your output should never block a release. Use warnings or informational findings, never `block`, for infrastructure failures.
````

- [ ] **Step 2: Verify the file shape matches the existing agents**

```bash
diff <(awk '/^## /{print $0}' skills/release/agents/review-docs.md) <(awk '/^## /{print $0}' skills/release/agents/review-cc-changes.md)
```

Expected: roughly similar top-level section list — both should have `## Role`, `## Inputs`, `## Process`, `## Output Format`, `## Guidelines`. Exact match not required (new agent has some structural differences, notably a separate `Future_work` field documented in Output Format).

- [ ] **Step 3: Commit**

```bash
git add skills/release/agents/review-cc-changes.md
git commit -m "feat(release): add review-cc-changes agent prompt

New tenth Phase-2 agent. Diffs Claude Code's upstream CHANGELOG
between the last YouCoded release's CC version and the current
CC version, cross-references entries against youcoded/docs/
cc-dependencies.md, classifies findings as block/warn, and routes
potential future opportunities to a Future_work field that Phase 3
appends to docs/knowledge-debt.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Create fixtures for manual agent verification

**Files:**
- Create: `skills/release/agents/__fixtures__/review-cc-changes/cc-changelog-sample.md`
- Create: `skills/release/agents/__fixtures__/review-cc-changes/cc-dependencies-sample.md`
- Create: `skills/release/agents/__fixtures__/review-cc-changes/youcoded-changelog-sample.md`
- Create: `skills/release/agents/__fixtures__/review-cc-changes/npm-time-sample.json`
- Create: `skills/release/agents/__fixtures__/review-cc-changes/expected-output.md`
- Create: `skills/release/agents/__fixtures__/review-cc-changes/README.md`

- [ ] **Step 1: Create the fixture directory**

```bash
mkdir -p skills/release/agents/__fixtures__/review-cc-changes
```

- [ ] **Step 2: Write `youcoded-changelog-sample.md`** (source of baseline)

```markdown
# Changelog

## [v2.3.2] - 2026-04-01

**Claude Code CLI baseline:** v2.0.15

### Added
- Prior release content, irrelevant for this fixture.
```

- [ ] **Step 3: Write `cc-changelog-sample.md`** (source of CC entries; covers all four classification buckets)

```markdown
# Changelog

## 2.1.0 - 2026-04-15

- Changed thinking spinner glyph from ✻ to ◈ in terminal output.
- Added `/approve-next N` CLI flag to pre-authorize a batch of upcoming tool calls.

## 2.0.18 - 2026-04-08

- Added `claude-opus-4-8` as the default model.
- Internal: bumped `ink` dependency to 5.2.

## 2.0.17 - 2026-04-05

- Fixed a memory leak in the transcript parser. Internal only.

## 2.0.15 - 2026-04-01

- Baseline release. (This entry should not appear in the slice.)
```

- [ ] **Step 4: Write `cc-dependencies-sample.md`** (minimal dependency doc with the spinner regex touchpoint)

```markdown
# Claude Code Dependencies

## Touchpoints

### PTY spinner regex
- **Files:** `desktop/src/renderer/state/attention-classifier.ts` (SPINNER_RE)
- **Depends on:** CC thinking-spinner glyphs `[✻✽✢✳✶*⏺◉]` and suffix `(Ns · esc to interrupt)` (case-insensitive)
- **Break symptom:** `attentionState` misclassifies; AttentionBanner shows false positives or negatives

### Anthropic model ID convention
- **Files:** `desktop/src/renderer/components/SessionPill.tsx`
- **Depends on:** Dotted-hyphen model ID form served by CC in transcript `message.model`
- **Break symptom:** Unknown model IDs render raw in session pill; display-name lookup fails silently.
```

- [ ] **Step 5: Write `npm-time-sample.json`**

```json
{
  "created": "2026-03-30T00:00:00.000Z",
  "modified": "2026-04-15T12:00:00.000Z",
  "2.0.15": "2026-04-01T00:00:00.000Z",
  "2.0.17": "2026-04-05T00:00:00.000Z",
  "2.0.18": "2026-04-08T00:00:00.000Z",
  "2.1.0":  "2026-04-15T12:00:00.000Z"
}
```

All versions in range have CHANGELOG entries, so npm cross-check should produce no warnings.

- [ ] **Step 6: Write `expected-output.md`** (what the agent should return when run against these fixtures)

````markdown
# Expected output

When run with the sample fixtures:

- `baseline_version = "2.0.15"` (parsed from youcoded-changelog-sample.md)
- `current_version = "2.1.0"`
- `cc_changelog_contents = <cc-changelog-sample.md>`
- `npm_time_json = <npm-time-sample.json>`
- `cc_dependencies_contents = <cc-dependencies-sample.md>`
- `youcoded_changed_files = []`
- `youcoded_core_changed_files = []`

The agent should return approximately:

```
Category: cc-changes
Findings:
  - severity: block
    repo: youcoded
    file: desktop/src/renderer/state/attention-classifier.ts
    line: null
    description: "CC v2.1.0 CHANGELOG: 'Changed thinking spinner glyph from ✻ to ◈ in terminal output.' cc-dependencies.md touchpoint 'PTY spinner regex' lists character class [✻✽✢✳✶*⏺◉] — ◈ is not included. SPINNER_RE will fail to match after upgrade."
    suggestion: "Add ◈ to the SPINNER_RE character class in attention-classifier.ts before tagging."
  - severity: warn
    repo: youcoded
    file: desktop/src/renderer/components/SessionPill.tsx
    line: null
    description: "CC v2.0.18 CHANGELOG: 'Added claude-opus-4-8 as the default model.' cc-dependencies.md touchpoint 'Anthropic model ID convention' covers pill display. New model ID may render raw if display-name lookup is missing an entry."
    suggestion: "After upgrade, open a session and verify the pill renders 'Opus 4.8' or a sensible fallback; add to MODEL_DISPLAY_NAMES if missing."
Future_work:
  - title: "Surface /approve-next N in permission panel"
    description: "CC v2.1.0 added a /approve-next N flag that pre-authorizes the next N tool calls. YouCoded's permission panel could add a 'approve next 3' toggle. Small-medium UI work."
    changelog_entry: "v2.1.0: Added /approve-next N CLI flag to pre-authorize a batch of upcoming tool calls."
Summary: "1 blocker (spinner regex), 1 warning (new model ID), 1 future-work item (batch permission UI). CC v2.0.15 → v2.1.0, 4 CHANGELOG entries in range (1 internal, ignored)."
```

**Tolerances:**
- Exact wording of description/suggestion may vary — match on intent, not prose.
- The v2.0.17 memory-leak fix should be a no-op (omitted entirely). If it appears as a warning or finding, the agent is too noisy.
- The v2.0.18 ink bump should be a no-op. If it appears, the agent is too noisy.
- The v2.0.15 baseline entry should NOT appear in findings (correct slice is `(baseline, current]`, exclusive of baseline).
- `Future_work` should contain exactly one item (the `/approve-next` flag).
````

- [ ] **Step 7: Write fixture `README.md`** explaining how to use the fixtures for manual verification

```markdown
# review-cc-changes fixtures

Manual verification inputs for the `review-cc-changes` agent.

## How to use

Dispatch the agent via the `Agent` tool with a prompt that includes the sample files as context variables, and compare the returned output to `expected-output.md`.

Example driver (run from the admin repo root):

```bash
# Read each fixture and construct the agent prompt
BASELINE=$(grep -oP '\*\*Claude Code CLI baseline:\*\*\s+v\K\S+' agents/__fixtures__/review-cc-changes/youcoded-changelog-sample.md | head -1)
CURRENT="2.1.0"
CC_CL=$(cat agents/__fixtures__/review-cc-changes/cc-changelog-sample.md)
NPM_TIME=$(cat agents/__fixtures__/review-cc-changes/npm-time-sample.json)
DEPS=$(cat agents/__fixtures__/review-cc-changes/cc-dependencies-sample.md)

echo "Dispatch the review-cc-changes agent with:"
echo "  baseline_version=$BASELINE"
echo "  current_version=$CURRENT"
echo "  cc_changelog_contents=<see cc-changelog-sample.md>"
echo "  npm_time_json=<see npm-time-sample.json>"
echo "  cc_dependencies_contents=<see cc-dependencies-sample.md>"
echo "  youcoded_changed_files=[]"
echo "  youcoded_core_changed_files=[]"
```

Then manually dispatch via the `Agent` tool and compare output. See `expected-output.md` for the expected shape.

## When to re-run

After any edit to `agents/review-cc-changes.md`, re-run against these fixtures. If the output drifts from `expected-output.md` in a way that indicates a regression, fix the agent prompt.
```

- [ ] **Step 8: Commit**

```bash
git add skills/release/agents/__fixtures__/
git commit -m "test(release): add fixtures for review-cc-changes manual verification

Fixture set covers all four classification buckets (block, warn,
future-work, no-op). Includes an expected-output.md with tolerance
notes and a README explaining the manual-dispatch verification flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Manually verify the agent prompt against the fixtures

No file changes; this task validates the agent before wiring it into SKILL.md.

- [ ] **Step 1: Dispatch the agent against the fixtures**

Use the `Agent` tool with `subagent_type: "general-purpose"`. Prompt: paste the full contents of `skills/release/agents/review-cc-changes.md`, followed by the fixture values (read each fixture file inline into the prompt):

```
[contents of review-cc-changes.md]

## Your inputs

baseline_version: "2.0.15"
current_version: "2.1.0"

cc_changelog_contents:
<<<
[paste cc-changelog-sample.md]
>>>

npm_time_json:
<<<
[paste npm-time-sample.json]
>>>

cc_dependencies_contents:
<<<
[paste cc-dependencies-sample.md]
>>>

youcoded_changed_files: []
youcoded_core_changed_files: []

Produce your Category/Findings/Future_work/Summary output.
```

- [ ] **Step 2: Compare the actual output to `expected-output.md`**

Match on intent, not prose (tolerances listed in expected-output.md):
- Exactly one `block`-severity finding about the spinner regex.
- Exactly one `warn`-severity finding about the new model ID.
- Exactly one `Future_work` item about `/approve-next`.
- The internal v2.0.17 memory-leak fix and v2.0.18 ink bump must NOT appear.
- The v2.0.15 baseline entry must NOT appear.

- [ ] **Step 3: If output drifts, revise the agent prompt and re-run**

Common issues to fix in the prompt:
- Over-reporting (v2.0.17 shows up → tighten "Bucket D — No-op" guidance).
- Under-reporting (spinner regex change missed → tighten Bucket A trigger wording).
- Prose verbosity (findings longer than 3-4 sentences → tighten "Be specific" guideline).

Iterate until output is within tolerances. Commit the revised prompt if changes were needed:

```bash
git add skills/release/agents/review-cc-changes.md
git commit -m "fix(release): tighten review-cc-changes prompt based on fixture run"
```

No commit if the first run passes.

---

## Task 7: Phase 1 — add CC-changelog context collection to SKILL.md

**Files:**
- Modify: `skills/release/SKILL.md` — Phase 1

- [ ] **Step 1: Locate Phase 1's "Step 8 — Summarize" section and insert new steps before it**

Read `skills/release/SKILL.md` lines 80-150 to orient. Phase 1 currently ends with "Step 8 — Summarize". Add new steps numbered 7a-7e immediately before Step 8 (renumber Step 8 if needed, or insert as 7a/7b/7c/7d/7e between Step 7 and Step 8 without renumbering — either is fine as long as they're added).

Insert this block before the existing `### Step 8 — Summarize`:

````markdown
### Step 7a — Capture current CC version

```bash
CLAUDE_VERSION_RAW=$(claude --version 2>/dev/null | head -1 || echo "")
# Extract bare semver from raw output (handles "2.1.0 (Claude Code)", "v2.1.0", or plain "2.1.0")
CLAUDE_VERSION_CURRENT=$(echo "$CLAUDE_VERSION_RAW" | grep -oP '\d+(\.\d+)+' | head -1)
```

If `CLAUDE_VERSION_CURRENT` is empty, set it to `null` for downstream agent input and continue. The review-cc-changes agent will short-circuit with a warning.

### Step 7b — Read CC baseline from prior youcoded CHANGELOG entry

```bash
CLAUDE_VERSION_BASELINE=$(grep -oP '\*\*Claude Code CLI baseline:\*\*\s+v\K\S+' ~/youcoded/CHANGELOG.md | head -1)
```

If nothing matches (first release after the agent's introduction, or the prior release failed the write-path), `CLAUDE_VERSION_BASELINE` is empty. Pass it as `null` to the agent.

### Step 7c — Fetch Claude Code's CHANGELOG

```bash
CC_CHANGELOG=$(gh api repos/anthropics/claude-code/contents/CHANGELOG.md -H "Accept: application/vnd.github.v3.raw" 2>/dev/null || \
  curl -sfL "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md" 2>/dev/null || echo "")
```

If both fetches fail, pass `null` for `cc_changelog_contents`. The agent will emit a "CC CHANGELOG unreachable" warning and skip the diff.

### Step 7d — Fetch npm publish time data

```bash
NPM_TIME_JSON=$(npm view @anthropic-ai/claude-code time --json 2>/dev/null || echo "")
```

If the fetch fails, pass `null`.

### Step 7e — Load CC dependency doc

```bash
CC_DEPENDENCIES=$(cat ~/youcoded/docs/cc-dependencies.md 2>/dev/null || echo "")
```

If the file is missing, pass `null`. The agent will run in free-reasoning-only mode with a soft warning.
````

- [ ] **Step 2: Verify the edits parse correctly**

```bash
grep -n "Step 7a\|Step 7b\|Step 7c\|Step 7d\|Step 7e\|Step 8 " skills/release/SKILL.md
```

Expected: five new step headings plus the existing Step 8 header.

- [ ] **Step 3: Commit**

```bash
git add skills/release/SKILL.md
git commit -m "feat(release): Phase 1 collects CC baseline + changelog context

Adds five new Step 7 sub-steps to Phase 1 of the release skill:
capture current CC version (normalized to bare semver), read the
baseline from the prior youcoded CHANGELOG entry, fetch Claude Code's
upstream CHANGELOG via gh api (with raw.githubusercontent.com fallback),
fetch npm publish time data, and load the cc-dependencies.md spine.
All five pass null on failure — the review-cc-changes agent handles
missing inputs without blocking the release.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Phase 2 — dispatch the tenth agent

**Files:**
- Modify: `skills/release/SKILL.md` — Phase 2

- [ ] **Step 1: Update the Phase 2 intro line**

Find the line that reads `Dispatch all 9 review agents simultaneously in a SINGLE message using the Agent tool.` Change `9` to `10`.

- [ ] **Step 2: Append the new agent dispatch section**

After the existing `### review-protocol-compat agent` block and before `### Expected return format from each agent`, insert:

````markdown
### review-cc-changes agent

- **Instructions:** `{SKILL_DIR}/agents/review-cc-changes.md`
- **Context:**
  - `baseline_version`: value of `$CLAUDE_VERSION_BASELINE` from Phase 1 Step 7b (pass as `null` if empty)
  - `current_version`: value of `$CLAUDE_VERSION_CURRENT` from Phase 1 Step 7a (pass as `null` if empty)
  - `cc_changelog_contents`: value of `$CC_CHANGELOG` from Step 7c (pass as `null` if empty)
  - `npm_time_json`: value of `$NPM_TIME_JSON` from Step 7d (pass as `null` if empty)
  - `cc_dependencies_contents`: value of `$CC_DEPENDENCIES` from Step 7e (pass as `null` if empty)
  - `youcoded_changed_files`: the same list passed to other youcoded-aware agents
  - `youcoded_core_changed_files`: the same list passed to other youcoded-core-aware agents
````

- [ ] **Step 3: Update the "Expected return format from each agent" section**

Find:

```
Category: (docs | platform | conflicts | depersonalization | mandates | update-compat | compliance | android-rules | protocol-compat)
Findings: [ { severity: block|warn, repo: youcoded-core|youcoded, file, line, description, suggestion } ]
Summary: one-line assessment
```

Replace with:

```
Category: (docs | platform | conflicts | depersonalization | mandates | update-compat | compliance | android-rules | protocol-compat | cc-changes)
Findings: [ { severity: block|warn, repo: youcoded-core|youcoded, file, line, description, suggestion } ]
Summary: one-line assessment
```

Find the immediately-following line `The platform agent also returns `Checklist_updates`.` and change it to:

```
The platform agent also returns `Checklist_updates`. The cc-changes agent also returns `Future_work` (see Phase 3 handling).
```

- [ ] **Step 4: Commit**

```bash
git add skills/release/SKILL.md
git commit -m "feat(release): Phase 2 dispatches review-cc-changes as tenth agent

Adds the new agent to Phase 2's parallel dispatch list. Passes the five
CC context variables collected in Phase 1 plus the shared changed-files
lists. Updates the expected return-format block to include cc-changes
as a valid Category and documents the new Future_work field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Phase 3 — render CC_FUTURE_WORK section, append to knowledge-debt.md

**Files:**
- Modify: `skills/release/SKILL.md` — Phase 3

- [ ] **Step 1: Extend the unified-report template with a CC FUTURE WORK section**

Find the current Phase 3 Step 1 report template — the block between `BLOCKERS (...)` and the final `═══` closing line, including the `PLATFORM CHECKLIST UPDATES` section. After the existing `PLATFORM CHECKLIST UPDATES` block, before the closing `═══` line, add:

```
CC FUTURE WORK ({count})
──────────────────────────────────────────────────
[F1] {title}
     {description}
     From CC CHANGELOG: {changelog_entry}
```

Update the footer counts line (around current line 244) from:

```
  {blockers} blockers · {warnings} warnings · {updates} checklist updates
```

to:

```
  {blockers} blockers · {warnings} warnings · {updates} checklist updates · {future_work} CC future-work
```

Also update the "If a section has zero items, show the header with count 0 and 'None.'" rule — it already covers the new section by inclusion.

- [ ] **Step 2: Add a Future_work approval + knowledge-debt.md append step**

Phase 3 currently has Step 3 (Present options) and Step 4 (Apply fixes). Between Step 4 and Step 5 (Proceed), insert a new step — Step 4b (or renumber if preferred):

````markdown
### Step 4b — Append approved CC future-work items to knowledge-debt.md

If the cc-changes agent returned any `Future_work` items, ask the user to triage each one: **keep / drop / edit**. Default is `keep` (user can confirm all with one line like `keep all`).

For each kept item, append to `~/youcoded-dev/docs/knowledge-debt.md` (create the file if missing, appending under an `## Open entries` section if the file already has one):

```markdown

## CC-drift: {title} (surfaced {YYYY-MM-DD}, from CC v{current_version})

{description}

CHANGELOG entry: {changelog_entry}
```

Use a HEREDOC append with `>>`, one item per invocation. After all items are appended, commit the update:

```bash
cd ~/youcoded-dev
git add docs/knowledge-debt.md
git commit -m "chore(knowledge-debt): add CC future-work items from v{VERSION} release"
```

Skip the commit entirely if no items were kept.
````

- [ ] **Step 3: Commit**

```bash
cd ~/youcoded-dev/.worktrees/cc-changelog-diff-agent
git add skills/release/SKILL.md
git commit -m "feat(release): Phase 3 renders CC future-work, appends to knowledge-debt.md

Adds a CC FUTURE WORK section to the unified release report, plus a
new Step 4b that triages Future_work items with the user and appends
kept ones to docs/knowledge-debt.md in the youcoded-dev workspace.
Entries use a 'CC-drift:' heading convention distinct from existing
audit-sourced entries.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Phase 4 Step 2 — inject CC baseline line into youcoded CHANGELOG

**Files:**
- Modify: `skills/release/SKILL.md` — Phase 4 Step 2 and Step 3

- [ ] **Step 1: Find the existing CHANGELOG-format template in Phase 4 Step 2**

Read Phase 4 Step 2. The existing template is:

```markdown
## [{VERSION}] - {YYYY-MM-DD}

### Added
...
```

- [ ] **Step 2: Modify the youcoded CHANGELOG template to inject the baseline line**

Immediately below the template block, add:

````markdown

**For the youcoded CHANGELOG only**, inject the current CC version as a header line below the version heading:

```markdown
## [{VERSION}] - {YYYY-MM-DD}

**Claude Code CLI baseline:** v{CLAUDE_VERSION_CURRENT}

### Added
...
```

If `$CLAUDE_VERSION_CURRENT` from Phase 1 Step 7a is empty, **omit** the baseline line entirely and add a soft warning to the final release summary: *"CC version not captured; next release's cc-changes agent will have no baseline."*

The youcoded-core CHANGELOG does NOT get this line — CC versioning applies to the release as a whole and youcoded is the app that integrates with CC.
````

- [ ] **Step 3: Verify Phase 4 Step 3 is still correct**

Phase 4 Step 3 currently reads:

```
### Step 3 — Capture Claude Code version

```bash
CLAUDE_VERSION=$(claude --version 2>/dev/null | head -1 || echo "")
```
```

This is now redundant (Phase 1 Step 7a already captured it, normalized, into `$CLAUDE_VERSION_CURRENT`). Replace Step 3 with a single line:

```markdown
### Step 3 — CC version already captured in Phase 1 Step 7a

The normalized `$CLAUDE_VERSION_CURRENT` is already available from Phase 1 Step 7a. Use it directly; no re-capture needed. The step is retained as a numbered placeholder for readers familiar with the prior flow.
```

(Alternatively: delete Step 3 entirely and renumber subsequent steps. Retaining a placeholder avoids renumbering churn in a large file.)

- [ ] **Step 4: Commit**

```bash
git add skills/release/SKILL.md
git commit -m "feat(release): Phase 4 injects CC baseline line into youcoded CHANGELOG

Each youcoded CHANGELOG entry now carries a '**Claude Code CLI baseline:**
vX.Y.Z' line directly under the version heading, sourced from the
normalized CLAUDE_VERSION_CURRENT captured in Phase 1 Step 7a. Next
release's review-cc-changes agent reads this line to establish the
baseline. The youcoded-core CHANGELOG is unchanged. Phase 4 Step 3
is now a placeholder note pointing at the Phase 1 capture.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Push the admin branch and open coordinated PRs

- [ ] **Step 1: Push the admin branch**

```bash
cd ~/youcoded-dev/.worktrees/cc-changelog-diff-agent
git push -u origin cc-changelog-diff-agent
```

- [ ] **Step 2: Confirm the youcoded branch is also pushed (from Task 2)**

```bash
cd ~/youcoded-dev/.worktrees/cc-dependencies-doc
git log origin/cc-dependencies-doc..HEAD 2>/dev/null
```

Expected: empty output (branch is up to date with its pushed head). If there are unpushed commits, push them now.

- [ ] **Step 3: Open the two PRs**

```bash
cd ~/youcoded-dev/.worktrees/cc-dependencies-doc
gh pr create --title "Add docs/cc-dependencies.md spine for CC coupling" --body "$(cat <<'EOF'
## Summary
- Add `docs/cc-dependencies.md` — one entry per CC touchpoint (files / depends-on / break-symptom).
- Add discipline note to `docs/PITFALLS.md` (or create if missing) requiring contributors to update the spine when adding CC-coupled code.

Paired with the `cc-changelog-diff-agent` PR in youcoded-admin — the new release agent reads this doc.

## Test plan
- [ ] Confirm `docs/cc-dependencies.md` contains all 11 touchpoints.
- [ ] Confirm PITFALLS.md has the update-discipline paragraph.
- [ ] Merge this PR before merging the youcoded-admin PR, since the admin PR's release skill references this file path.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

cd ~/youcoded-dev/.worktrees/cc-changelog-diff-agent
gh pr create --title "Add review-cc-changes agent to /release" --body "$(cat <<'EOF'
## Summary
- New tenth Phase-2 review agent in the `/release` skill: `review-cc-changes`.
- Phase 1 now collects CC version baseline, current version, upstream CHANGELOG, npm publish times, and the cc-dependencies.md spine.
- Phase 3 renders a `CC FUTURE WORK` section and appends approved items to `docs/knowledge-debt.md`.
- Phase 4 injects a `**Claude Code CLI baseline:** vX.Y.Z` line into each generated `youcoded/CHANGELOG.md` entry.
- Fixtures under `skills/release/agents/__fixtures__/review-cc-changes/` for manual verification.

Paired with the `cc-dependencies-doc` PR in youcoded — merge that one first.

## Test plan
- [ ] Merge the youcoded PR (`cc-dependencies-doc`) first.
- [ ] Run the manual fixture verification per `agents/__fixtures__/review-cc-changes/README.md`; confirm output matches `expected-output.md` within tolerances.
- [ ] Dry-run the full `/release` flow on current master of both repos (don't tag/push). Confirm: Phase 1 captures baseline + fetches CC CHANGELOG; Phase 2 dispatches ten agents; Phase 3 renders the CC FUTURE WORK section; Phase 4 would inject the baseline line into the generated youcoded CHANGELOG.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Note worktree cleanup sequence**

After both PRs merge to master (and the first real release lands, which is the earliest point the baseline-write path runs in production), clean up worktrees per `CLAUDE.md`:

```bash
git worktree remove ~/youcoded-dev/.worktrees/cc-dependencies-doc
git branch -D cc-dependencies-doc  # -D because --no-ff merges leave the tip non-ancestral

git worktree remove ~/youcoded-dev/.worktrees/cc-changelog-diff-agent
git branch -D cc-changelog-diff-agent
```

Do NOT run these cleanup commands as part of this plan — they run after merge.

---

## Self-Review

**Spec coverage:**
- Component 1 (baseline persistence) → Task 10.
- Component 2 (dependency doc) → Tasks 1 & 2.
- Component 3 (review agent) → Tasks 4, 5, 6.
- Output schema (block/warn + Future_work) → Task 4.
- Phase 1 context collection → Task 7.
- Phase 2 dispatch → Task 8.
- Phase 3 report + knowledge-debt append → Task 9.
- Failure modes (null inputs) → handled per-step in Tasks 4 and 7 (agent short-circuits; SKILL.md always passes `null` on failure).
- Rollout (first release has no baseline) → documented in agent preflight (Task 4 Step 1 table) and in the spec.
- Testing → Tasks 5 and 6 for agent verification; Task 11 test-plan for dry-run.

**Placeholder scan:** No `TBD`, no `implement later`, no "add appropriate error handling" phrases. Every step contains the actual text to paste or the exact command to run.

**Type / name consistency:**
- Context variable names (`$CLAUDE_VERSION_BASELINE`, `$CLAUDE_VERSION_CURRENT`, `$CC_CHANGELOG`, `$NPM_TIME_JSON`, `$CC_DEPENDENCIES`) — consistent across Tasks 7, 8, 10.
- Agent input names (`baseline_version`, `current_version`, `cc_changelog_contents`, `npm_time_json`, `cc_dependencies_contents`) — consistent between Task 4 (agent prompt) and Task 8 (dispatch context).
- Field names on output (`Category`, `Findings`, `Future_work`, `Summary`; `severity`, `repo`, `file`, `line`, `description`, `suggestion`) — consistent between Task 4, Task 5 (fixtures expected output), Task 8 (expected return format), Task 9 (rendering).
- Knowledge-debt heading format (`## CC-drift: {title} (surfaced {YYYY-MM-DD}, from CC v{current_version})`) — consistent between Task 9 and the spec.

**Scope:** Plan produces working, testable software in one pass. Three components, ten narrowly-scoped tasks plus setup and PR tasks. No sub-project decomposition needed.
