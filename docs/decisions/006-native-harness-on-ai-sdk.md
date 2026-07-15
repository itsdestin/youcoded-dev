# ADR 006: First-Party Agent Harness Built on the Vercel AI SDK

**Status:** Accepted
**Date:** 2026-07-09 (approved by Destin during platform-vision review)
**Context doc:** `docs/active/specs/2026-07-09-platform-vision-roadmap.md`

## Context

YouCoded needs non-Claude sessions to be first-class: full chat UI, tools, permissions, artifacts. Three ways to get an agent loop: (1) embed an existing agent CLI (the `feat/opencode-mvp` approach — built, unmerged, rejected), (2) use a vendor harness library (Claude Agent SDK — Claude-only), (3) build our own loop on a model-normalization library.

## Decision

Build a first-party harness in the Electron main process on the **Vercel AI SDK** (v6 now; migrate to v7 via codemod once it settles). The AI SDK is the normalization layer only — one typed stream (text / reasoning / tool-call / tool-result parts) across Anthropic, OpenAI, Google, OpenRouter, and any OpenAI-compatible endpoint including local llama.cpp. The loop, tools, permissions, context assembly, compaction, and persistence are YouCoded code. opencode (MIT, itself AI-SDK-based) is the design reference, never an embedded dependency.

All AI SDK usage is wrapped behind YouCoded's own `HarnessSession` interface so the SDK is replaceable.

## Alternatives considered

- **Embed opencode** — built on `feat/opencode-mvp`; rejected: dependency on another product's daemon, roadmap, and permission model; Destin disliked the result.
- **Claude Agent SDK** — Anthropic's harness-as-library; rejected as the multi-model loop: Claude-only by design. Remains a candidate for a future Claude-via-API provider, separate from the CC PTY integration.
- **Hand-rolled provider layer** — rejected: re-implementing five vendors' streaming/tool-call dialects is pure plumbing cost (~3–4 weeks) with no differentiation.

## Consequences

- YouCoded owns the loop — harness presets and a user-facing harness builder become product surface (and marketplace items).
- Claude Code stays a PTY-wrapped backend, unchanged; the transcript-event seam isolates the two stacks.
- We accept Vercel's release churn, contained by the `HarnessSession` wrapper.
