---
title: Claude Code Changelog Diff Agent
date: 2026-04-17
status: design
---

# Claude Code Changelog Diff Agent

## Goal

Add a new release-review agent that, during every YouCoded release, diffs Claude Code's changelog between the last release's CC version and the current CC version, and surfaces anything that might break YouCoded, be worth adding to this release, or worth filing for a future release.

## Non-goals

- Auto-creating GitHub issues. Future-work items land in `docs/knowledge-debt.md`; filing is manual.
- Backfilling CC versions for past YouCoded releases. Baseline starts from the first release that lands after this work.
- Replacing any existing review agent or changing Phase 1/3/4 structure of `/release`.
- Pinning `@anthropic-ai/claude-code` as an npm dependency. YouCoded continues to assume the user has CC installed globally.

## Overview

Three additions across two repos, held together by a CC version baseline that `/release` writes into each youcoded CHANGELOG entry:

1. **Baseline persistence** — `/release` writes `**Claude Code CLI baseline:** vX.Y.Z` into each generated `youcoded/CHANGELOG.md` entry during Phase 4.
2. **Dependency doc** — new `youcoded/docs/cc-dependencies.md` lists every known CC touchpoint in the codebase (files + what CC behavior they depend on + break symptom).
3. **Review agent** — new `youcoded-admin/skills/release/agents/review-cc-changes.md`, dispatched in parallel with the existing 9 agents in Phase 2. Reads baseline from CHANGELOG, fetches CC CHANGELOG + npm version list, cross-references against the dependency doc, returns structured findings.

Baseline and dependency doc live in `youcoded/` because that repo contains the app that integrates with CC. The admin-side agent reads both via the clones that `/release` already performs in Phase 1.

## Component 1: Baseline persistence

### Location & format

Write a single line directly under the version heading in `youcoded/CHANGELOG.md`:

```markdown
## v1.1.0 - 2026-04-17

**Claude Code CLI baseline:** v2.0.15

### Added
- ...
```

Only `youcoded/CHANGELOG.md`. Not `youcoded-core/CHANGELOG.md` — the CC version applies to the release as a whole, and youcoded is the app that integrates with CC.

### Write path

Modify the CHANGELOG-generation step of `/release` Phase 4 (where youcoded's entry is built from reviewed diff context). The release skill already captures CC version via `CLAUDE_VERSION=$(claude --version 2>/dev/null | head -1 || echo "")`.

Normalize before writing: strip trailing suffix (e.g., `(Claude Code)`), strip whitespace, extract the first `\d+(\.\d+)+` match, then prepend `v`. Store as `vX.Y.Z`. This keeps the persisted form stable regardless of CC's `--version` cosmetic changes.

If the capture is empty or no version pattern can be extracted, skip the line entirely and add a release-summary warning: *"CC version not captured; next release's diff will have no baseline."* Non-blocking.

### Read path (next release)

The agent reads `youcoded/CHANGELOG.md` and matches the first `## v` heading after the top of file. Within that entry, it extracts the baseline via regex:

```
\*\*Claude Code CLI baseline:\*\*\s+v(\S+)
```

First match wins. If missing, unparseable, or absent, the agent treats the baseline as unknown and exits clean with an info notice (see Failure Modes).

## Component 2: Dependency doc

### Location

`youcoded/docs/cc-dependencies.md`. Committed to the `youcoded` repo.

### Purpose

- Serves as the spine the agent uses to map CC CHANGELOG entries to YouCoded code that might break.
- Serves as living documentation for humans adding CC-adjacent code.

### Structure

Short preamble describing what the doc is for and when to update it, followed by a flat list of touchpoint sections. Each touchpoint has exactly three fields:

- **Files:** one or more code paths
- **Depends on:** a plain-English description of the CC aspect this code relies on
- **Break symptom:** observable user-facing failure if CC changes this

Example:

```markdown
### PTY spinner regex
- **Files:** `desktop/src/renderer/state/attention-classifier.ts` (SPINNER_RE)
- **Depends on:** CC thinking-spinner glyphs `[✻✽✢✳✶*⏺◉]` and suffix `(Ns · esc to interrupt)`
- **Break symptom:** `attentionState` misclassifies; AttentionBanner shows false positives or negatives
```

### Initial touchpoints (v1 of the doc)

1. Transcript JSONL shape (transcript-watcher + reducer)
2. Per-turn metadata fields (`stopReason`, `model`, `usage.*`, outer `requestId`)
3. PTY spinner regex (`attention-classifier.ts` SPINNER_RE)
4. Other PTY attention patterns (awaiting-input, shell-idle, error, stuck)
5. Hook protocol (`hook-relay.js`, settings.json hooks schema)
6. Plugin registry four-file format (`enabledPlugins`, `installed_plugins.json`, `known_marketplaces.json`, `marketplace.json`)
7. Slash commands YouCoded intercepts or references (e.g., `/model` for session-pill reconciliation)
8. Anthropic model ID convention (`claude-opus-4-7` style)
9. CLI invocation flags (how desktop and Android launch `claude`, including `--resume`)
10. Permission flow messages (CC's approval-request shape → `PERMISSION_REQUEST` dispatch)
11. JSONL transcript file location (`~/.claude/projects/<encoded-path>/*.jsonl`)

Implementation will grep the codebase for any additional touchpoints missed by this list; a non-trivial addition is expected.

### Update discipline

Add a line to `docs/PITFALLS.md` (under the Cross-Platform section):

> When adding code that parses CC output, consumes a CC file, or depends on CLI behavior, add an entry to `youcoded/docs/cc-dependencies.md`. The `review-cc-changes` release agent reads this doc to map CC CHANGELOG entries to potentially impacted code — omissions silently downgrade findings to free-reasoning-only mode.

## Component 3: review-cc-changes agent

### Location

`youcoded-admin/skills/release/agents/review-cc-changes.md`. Same directory and schema as the existing nine agents.

### Dispatch

Phase 2, in parallel with the existing nine. No cross-agent dependencies. Network-bound failures (GitHub, npm) fail gracefully without blocking the other nine.

### Input context (provided by Phase 1)

- Baseline CC version (parsed from `youcoded/CHANGELOG.md`)
- Current CC version (from `claude --version`)
- Absolute paths to `youcoded/` and `youcoded-core/` clones

### Processing steps

1. **Preflight & version normalization.**
   - Normalize the baseline (already stored as `vX.Y.Z`, strip the `v`), the current version (parse from `claude --version` using the same regex as the write path), and upstream CHANGELOG/npm versions (strip any `v` prefix) to bare semver strings for all comparisons.
   - If baseline is missing, unparseable, or equal to current after normalization, emit a single info notice and exit clean. Non-blocking.

2. **Fetch CC CHANGELOG.**
   - Primary: `gh api repos/anthropics/claude-code/contents/CHANGELOG.md` (base64-decoded) on the default branch.
   - Fallback: `raw.githubusercontent.com/anthropics/claude-code/<default-branch>/CHANGELOG.md`.
   - Slice entries in the range `(baseline, current]` — exclusive of baseline, inclusive of current.

3. **Fetch npm version list.**
   - `npm view @anthropic-ai/claude-code time --json` gives a map of `{ version: iso-date }`.
   - Cross-check: any npm version within the date window of `(baseline, current]` that is absent from CHANGELOG → emit a warning *"CC vX.Y.Z shipped without CHANGELOG coverage; manual review needed."*

4. **Load dependency doc.**
   - Read `youcoded/docs/cc-dependencies.md`. Parse each `### <Touchpoint>` section into `{ title, files[], dependsOn, breakSymptom }`.
   - If missing, emit a soft warning and proceed in free-reasoning-only mode.

5. **Classify each CHANGELOG entry.**
   - **Blocker:** the entry contradicts a touchpoint's **Depends on** in a way that would trigger its **Break symptom**. (Example: touchpoint says "spinner glyph is ✻"; entry says "changed spinner glyph to ◈".)
   - **Warning:** the entry likely touches a dependency-doc area or keywords from the entry grep-match files in `youcoded/` or `youcoded-core/`, but certainty is low; user should verify before tag.
   - **Checklist-update:** the entry is informational (new feature that doesn't couple to YouCoded, user-facing tweak, new model ID that YouCoded's pill reconciliation already handles) and worth remembering as "verified-against v<current>" evidence.
   - **Future-work:** the entry describes something worth considering in a later release (new CC feature YouCoded could surface, new CLI flag worth adopting, deprecation on a distant horizon).

6. **Return structured findings** (see Output schema).

### Output schema

Matches the existing nine agents' return shape. JSON object with four arrays:

```json
{
  "blockers": [
    {
      "title": "Spinner regex in attention-classifier.ts won't match new glyph",
      "detail": "CC v2.1.0 changelog: 'Changed thinking spinner glyph to ◈'. SPINNER_RE character class does not include ◈. Fix regex before tag.",
      "files": ["youcoded/desktop/src/renderer/state/attention-classifier.ts"],
      "changelog_entry": "v2.1.0: Changed thinking spinner glyph to ◈"
    }
  ],
  "warnings":        [ { "title", "detail", "files", "changelog_entry" } ],
  "checklistUpdates":[ { "title", "detail" } ],
  "futureWork":      [ { "title", "detail", "changelog_entry" } ]
}
```

### Phase 3 integration

Phase 3 already presents unified blockers/warnings/checklist-updates from the nine agents. No schema change for those three buckets — the tenth agent's output merges in.

**New:** `futureWork` items surface as a separate sub-section in the Phase 3 report titled *"CC drift for future work (no action this release)."* After the user acknowledges (yes / edit / drop), approved items are appended to `docs/knowledge-debt.md` under:

```markdown
## CC-drift: <item title> (surfaced 2026-04-17, from CC v2.1.0)

<detail>

Changelog entry: <quoted excerpt>
```

The session-start hook's existing staleness surface (described in CLAUDE.md under "Keeping Documentation Accurate") will raise these in future sessions automatically — no new hook needed.

## Failure modes

All agent-side failures are non-blocking. The agent always returns a valid (possibly empty) findings object so Phase 3 continues.

| Condition | Behavior |
|---|---|
| No baseline in CHANGELOG | Info notice, empty findings, exit clean |
| Baseline == current | Info notice, empty findings, exit clean |
| Current CC version empty (`claude --version` failed on admin machine) | Warning in findings, empty blockers/warnings, exit clean |
| CC CHANGELOG unreachable (GitHub + raw both fail) | Single warning "CC CHANGELOG unreachable for vX → vY; manual review needed" in findings; exit clean |
| npm fetch fails | Proceed with CHANGELOG only; no additional warning beyond CHANGELOG-derived ones |
| Dependency doc missing | Soft warning "docs/cc-dependencies.md not found; free-reasoning-only"; continue in free-reasoning mode |
| Dependency doc unparseable (e.g., shape changed) | Same as missing — soft warning, free-reasoning-only |
| Any unexpected error | Single warning with error summary; exit clean |

Infrastructure failure never blocks a release via this agent.

## Scope interactions

### Phase 4 CHANGELOG generation

The existing "Build CHANGELOGs" step in `/release` Phase 4 is already responsible for writing `youcoded/CHANGELOG.md`. This spec adds exactly one line to the template under the version heading. No changes to `youcoded-core/CHANGELOG.md` generation.

### platform-checklist.json

The existing `data/platform-checklist.json` under the release skill accumulates platform findings across releases. `checklistUpdates` from this agent append to it with the same shape as other agents' checklist updates. No schema change.

### knowledge-debt.md

`futureWork` items append to this file, which already exists and is already surfaced by the session-start hook. A single new heading convention (`## CC-drift: ...`) distinguishes these entries.

## Rollout

1. First release after this work lands has no baseline in the prior youcoded CHANGELOG entry. Agent exits clean with the expected info notice.
2. That release *writes* a baseline.
3. Second release after this work lands is the first where the agent produces a real diff.

Expected and documented.

## Testing

- **Unit-level:** the regex for baseline extraction, the version-range slicing of CHANGELOG.md, and the dependency doc parser are pure functions. Write Vitest tests for each with fixture inputs. Place fixtures under `youcoded-admin/skills/release/agents/__fixtures__/review-cc-changes/`.
- **Integration:** a single fixture simulating a full agent run — fixture CHANGELOG, fixture dependency doc, fixture npm response — asserts expected findings JSON. Stub `gh`/`npm` shell calls via a small command mock.
- **Live check:** run the agent manually against the current working tree and the last real CC version you can identify. Inspect findings and confirm they look reasonable.
- **Release-time:** the agent runs in every real release; regressions are caught in context.

## Open questions

- **CHANGELOG file case / path.** Confirm the file is literally `CHANGELOG.md` at repo root on the default branch. If it's elsewhere (e.g., `docs/CHANGELOG.md`), update the fetch path during implementation.
- **gh CLI presence on release machine.** `gh` is almost certainly available (Phase 1 already uses it), but verify before relying on it. If absent, fall back to `raw.githubusercontent.com` directly.
- **`claude --version` exact output format.** The write-path normalization regex assumes the line contains `\d+(\.\d+)+`. Confirm during implementation and add any necessary trimming.

## Future extensions (explicitly out of scope for this spec)

- Auto-creating GitHub issues from `futureWork` items.
- Running this agent on a schedule (nightly) rather than only at release time.
- Extending beyond CC to diff other external tools (rclone, Node, Gradle, etc.) the same way.
- A CI check that blocks PRs adding CC-coupled code without a corresponding `cc-dependencies.md` entry.
