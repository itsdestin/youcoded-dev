---
status: draft
---

# Native live status and early session names

## Problem

A native agentic turn may make many model requests and tool calls before it emits its single final `turn-complete` event. The status bar currently exposes native cost, input/output tokens, cache figures, and context only from that final event. Consequently, a working native session has no status figures until its whole task ends. The session namer also treats only `turn-complete` as a reply, so a new session can retain its fallback title for an unhelpfully long time.

Basic automatic names also preserve full file paths from opening requests, which makes session lists noisy without helping identify the work.

## Goals

1. Show accurate native status figures as model requests complete during an active turn.
2. Keep final totals correct: final turn completion must replace, not add to, temporary in-progress values.
3. Give a new conversation its Basic automatic name as soon as the opening user message is known when automatic naming is enabled.
4. In AI naming mode, use the Basic name as a temporary automatic name until the existing AI review produces a replacement.
5. Replace path-like references in Basic names with their filename, retaining useful file identity without directory noise.

## Non-goals

- Do not estimate usage before a provider reports it.
- Do not show token-by-token streaming estimates; updates happen after each real model request completes.
- Do not change the existing reply-based AI review schedule.
- Do not change manually chosen titles or rewrite existing AI-generated titles.
- Do not change the visible status-bar layout.

## Design

### Per-request usage progress

The native harness emits a live-only progress event after each completed model request in an active root turn. Its payload carries the cumulative, authoritative usage for the turn so far, including cost, input/output tokens, cached reads/writes, context length, and context occupancy when available. Pricing/model/context use the snapshots taken when the turn began, so changing a session's model during a long turn cannot reprice earlier requests.

The event is display-only: it is not persisted in session transcripts, included in serialized chat snapshots, or reconstructed from history pages. The renderer stores it as a separate ephemeral in-progress usage value for that session. While a turn is active, the shared status derivation reads that value for the status bar and `/usage` snapshot. Completion, interrupt, and error clear the transient value; only final/interrupt/error usage contributes to durable session totals. If a window attaches while a turn is active, it receives the host's current in-memory snapshot through the existing live-state transfer path. If the host is confirmed idle or has been destroyed, stale progress is cleared.

The event is scoped to the emitting session. Each open native session therefore maintains independent figures, and session switches select the corresponding state. App and Buddy transcript event switches handle the live event in parity; history paging explicitly ignores it.

No value is drawn until the first completed model request reports real usage. Existing status relevance rules remain intact: missing values stay hidden, free/unpriced treatment remains accurate, and context means remaining context everywhere it is displayed.

### Early automatic title

When the session namer receives the first user message, it immediately derives the existing `basicNameFrom` value.

- With naming **off**, it does not write a title.
- With naming **basic**, it writes that Basic title immediately, without waiting for a completed assistant reply.
- With naming **AI**, it writes the same Basic title immediately as an automatic placeholder. The existing first completed-reply AI review may replace it; later review cadence remains unchanged.
- A manual title remains authoritative. An immediate Basic title and a later AI result both refuse to replace it.

The immediate Basic write must be idempotent across repeated/replayed user-message events and must not increment the completed-reply naming counter.

### Path-aware Basic names

Before Basic naming removes conversational filler and chooses its short phrase, it reduces every path-like token to its basename:

- `/home/destin/youcoded-dev/CLAUDE.md` → `CLAUDE.md`
- `desktop/src/renderer/components/StatusBar.tsx` → `StatusBar.tsx`
- `.\app\src\main\Thing.kt` → `Thing.kt`

This applies only to Basic-derived names, including AI mode’s temporary Basic title. The original user message remains unchanged for transcript, AI naming prompt, and all other features. A bare filename is not modified.

## Error handling

Automatic status and naming are best effort. A failed title persistence or missing conversation identity leaves the existing fallback title intact and must not interrupt the native session. A malformed or missing usage progress payload is ignored rather than rendered as zero.

## Test plan

- Harness/reducer tests prove a model-request progress event makes figures available before `turn-complete`, uses turn-start pricing, stays isolated per session, is not persisted or replayed, transfers to a late-attaching live window, and clears on completion/interrupt/error/confirmed idle.
- Status and usage snapshot tests prove both surfaces select the same in-progress usage and preserve existing hiding/relevance behavior; App and Buddy event parity is guarded.
- Session namer tests prove Basic and AI modes publish a Basic title on the first user message; off mode and manual titles are unchanged; the AI review can later replace the placeholder.
- Naming-core tests prove POSIX, relative, and Windows-style paths reduce to filenames while bare filenames and unrelated prose remain unchanged.
