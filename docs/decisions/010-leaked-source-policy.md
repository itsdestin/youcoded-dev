# ADR 010: Leaked Claude Code Source — Ideas Only, Never Code

**Status:** Accepted
**Date:** 2026-07-09 (settled with Destin during platform-vision review)
**Context doc:** `docs/superpowers/specs/2026-07-09-platform-vision-roadmap.md` §3.3

## Context

A leaked copy of Claude Code's source circulates publicly. It plausibly contains useful detail about harness/tool-loop design. YouCoded is a publicly distributed open-source app whose headline sign-in (Claude Pro/Max) depends on Anthropic goodwill.

## Decision

**No leaked code, prompts, or tool-description text ever enters any YouCoded repo.** Copyright exposure includes non-literal copying — distinctive structure and especially the system-prompt/tool-description strings embedded in that source.

- Destin may personally review the leak for feature/design *ideas* and relay them in his own words; ideas are not copyrightable.
- Claude-side design work draws exclusively on legitimate sources: opencode (MIT), Anthropic's published Agent SDK docs and engineering blog, public CC prompt/loop teardowns, the CC changelog, and the clean-room behavioral knowledge already documented in `youcoded/docs/cc-dependencies.md`.
- The Phase 0 "harness design ideas" research pass over those public sources is the sanctioned substitute.

## Consequences

- Slightly slower access to a few implementation details; near-total coverage via public sources in practice.
- A clean provenance story for every line in the native harness.
