# ADR 008: Conventions Inversion — `~/.youcoded/` Native Home, Claude Code as Export Target

**Status:** Accepted
**Date:** 2026-07-09 (approved by Destin during platform-vision review)
**Context doc:** `docs/superpowers/specs/2026-07-09-platform-vision-roadmap.md` §3.4a

## Context

Today YouCoded's ecosystem state lives inside Claude Code's namespace: the four-file plugin registry under `~/.claude/plugins/`, `enabledPlugins` in settings.json, MCP entries reconciled into CC's config, CLAUDE.md as the instructions file. CC's packaging/registry layer has been the recurring source of jank (atomic four-file writes, registry drift, settings.json overwrites), and it couples YouCoded's platform to a directory another vendor reshapes at will.

## Decision

**Invert the ownership.** A YouCoded-native home — `~/.youcoded/` — becomes the source of truth for installed skills, MCP server configs, harness manifests, and agent manifests, with a single manifest/lockfile.

- **Content formats stay standard:** SKILL.md as the skill format, MCP as the tool protocol, **AGENTS.md as the primary project-instructions file** (CLAUDE.md read as fallback).
- **`ClaudeCodeRegistry` and the mcp-reconciler demote to export adapters:** they project installed items *into* `~/.claude` only so Claude Code sessions can see them. Single-writer discipline; CC quirks quarantined behind adapters.
- **Marketplace:** registry schema gains item types (skill / harness / agent) and a backend-compatibility field; one-time migration moves installs to the native home, leaving CC-visible exports in place. (Phase 3.)

Detailed home layout is specified in the Phase 0 foundations spec.

## Alternatives considered

- **Adopt CC conventions as YouCoded's cross-backend conventions** (the roadmap's original position) — rejected by Destin: builds the platform deeper into a vendor namespace whose registry layer is the documented pain source.
- **Fully bespoke formats** (custom skill format, custom instructions file) — rejected: SKILL.md/MCP/AGENTS.md are genuine cross-tool standards; bespoke formats would orphan the existing WeCoded catalog and community muscle memory.

## Consequences

- New writers target one clean home; the CC adapter is the only code that touches `~/.claude` registries.
- A one-time migration is owed to existing installs (Phase 3), tested against the existing four-file-registry fixtures.
- Sync/backup gains a clean target (`~/.youcoded/`) instead of cherry-picking paths out of `~/.claude`.
