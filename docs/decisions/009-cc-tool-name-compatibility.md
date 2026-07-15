# ADR 009: Native Harness Uses Claude Code-Compatible Tool Names and Shapes

**Status:** Accepted
**Date:** 2026-07-09 (approved by Destin during platform-vision review)
**Context doc:** `docs/active/specs/2026-07-09-platform-vision-roadmap.md` §3.3–3.4

## Context

YouCoded's renderer has substantial investment keyed to Claude Code's tool vocabulary: `ToolCard`/`ToolBody` views render per tool name + input shape (`Read`, `Write`, `Edit` with `structuredPatch`, `Bash`, `Glob`, `Grep`, `TodoWrite`…), and the Artifact Tracker keys off `TRANSCRIPT_TOOL_USE` events for `Write`/`Edit`/`MultiEdit` with `file_path` args.

## Decision

The native harness's built-in tools use the **same names and input/result shapes** as their Claude Code counterparts wherever a counterpart exists. Consequences flow automatically: every polished tool view renders native sessions unchanged, and artifact tracking works without modification. New native-only tools may use new names and get new views.

This is a *renderer-contract* choice, not a CC coupling: the shapes are defined by YouCoded's own `transcript-event` protocol and ToolCard fixtures, which we own. If CC later changes a tool shape, the CC transcript-watcher adapts (as today) — the native harness does not have to follow.

## Alternatives considered

- **Fresh tool vocabulary** — rejected: forfeits every existing tool view and the artifact tracker for zero benefit; users would see two names for the same concept across backends.
- **A translation table in the renderer** — rejected: two vocabularies with a mapping is strictly more state than one vocabulary.

## Consequences

- ToolCard sandbox fixtures (`run-sandbox.sh`) validate native tool rendering before any live loop exists.
- Tool *semantics* must actually match the names (an `Edit` that doesn't produce `structuredPatch` would silently degrade the diff view) — pinned by fixtures.
