---
status: active
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

The native harness uses the existing display-only `assistant-thinking` event (no new transcript type) after each completed root model request that reports real usage. Its `usageProgress` field carries cumulative **provider-measured** turn usage: cost when calculable, input/output tokens, cached reads/writes, context length, and measured context occupancy when available. Usage-silent steps do not contribute their output-character estimates to live totals (the final ledger retains its existing fallback). Missing provider usage is not manufactured as zero or an estimated occupancy; after a usage-silent step, known-priced but incomplete live cost stays absent rather than being labelled unpriced. Pricing/model/context and the free flag use snapshots taken when the turn began, including on the final event, so changing a session's model during a long turn cannot reprice earlier requests. Provider-reported cost is included only when every counted request reported it.

The progress field is display-only: payload-less `assistant-thinking` is already dropped by `SessionStore`, and progress is not included in serialized chat snapshots or reconstructed from history pages. The renderer stores a separate ephemeral in-progress usage value per session. One shared selector chooses it before completed-turn usage for context in both the status bar and `/usage`. Their session token, cache and cost figures use durable totals plus the current cumulative in-progress turn, replacing rather than stacking progress events; after terminal usage is counted, only durable totals remain. Completion, interrupt, and error clear it; only terminal usage contributes to durable session totals. A late-attaching desktop window receives the host's current in-memory snapshot through the existing live-state transfer path **after** replay; an older snapshot cannot overwrite a newer live event. Confirmed idle or destroyed host clears stale progress. Remote browsers receive new live events; reconnect hydration does not serialize transient progress and shows the last completed usage until another model request finishes.

App and Buddy handle the heartbeat field in parity; history paging ignores it. An interrupted step may publish progress just before its interrupt, which immediately clears the snapshot.

No value is drawn until the first completed model request reports real usage. Existing status relevance rules remain intact: missing values stay hidden, free/unpriced treatment remains accurate, and context means remaining context everywhere it is displayed.

### Early automatic title

When the session namer receives the first user message, it immediately derives the existing `basicNameFrom` value.

- With naming **off**, it does not write a title.
- With naming **basic**, it writes that Basic title immediately, without waiting for a completed assistant reply.
- With naming **AI**, it writes the same Basic title immediately as an automatic placeholder. The existing first completed-reply AI review may replace it; later review cadence remains unchanged.
- A manual title remains authoritative. An immediate Basic title and a later AI result both refuse to replace it.

The initial sidecar write is an atomic set-if-unnamed under the naming store's lock: it must not replace manual or automatic ownership. Legacy titles live in a separate conversation store; check before the write and again afterward, rolling back only this placeholder if a legacy title appeared. Repeated/replayed user-message events produce at most one sidecar write and publication among concurrent namers. A rename or switch to Off while the write waits cannot be undone by a stale completion. Local title projections are ordered per conversation and revalidated before publishing; sidecar and conversation-store writes in different processes are not a single transaction. It must not increment the completed-reply naming counter. Subsequent AI reviews retain their existing automatic-to-automatic replacement policy.

### Path-aware Basic names

Before Basic naming removes conversational filler and chooses its short phrase, it reduces every path-like token to its basename:

- `/home/destin/youcoded-dev/CLAUDE.md` → `CLAUDE.md`
- `desktop/src/renderer/components/StatusBar.tsx` → `StatusBar.tsx`
- `.\app\src\main\Thing.kt` → `Thing.kt`

This applies to Basic-derived names, including AI mode’s temporary Basic title. The Resume Browser's first-message fallback retains its existing 60-character excerpt policy, but shortens path tokens before truncation. The original user message remains unchanged for transcript, AI naming prompt, and all other features. URLs, bare filenames and punctuation around paths remain intact; a trailing separator is not treated as a filename.

## Error handling

Automatic status and naming are best effort. A failed title persistence or missing conversation identity leaves the existing fallback title intact and must not interrupt the native session. A malformed or missing usage progress payload is ignored rather than rendered as zero.

## Test plan

- Harness/reducer tests prove a model-request progress event makes figures available before `turn-complete`, uses turn-start pricing, stays isolated per session, is not persisted or replayed, transfers to a late-attaching live window, and clears on completion/interrupt/error/confirmed idle.
- Status and usage snapshot tests prove In/Out/Cached/Cost appear after the first completed model request *before the first turn completes*, increase after a second request, and do not double-count on terminal completion; both surfaces preserve existing hiding/relevance behavior and App/Buddy parity.
- Session namer tests prove Basic and AI modes publish a Basic title on the first user message; off mode and manual titles are unchanged; the AI review can later replace the placeholder.
- Naming-core tests prove POSIX, relative, and Windows-style paths reduce to filenames while bare filenames and unrelated prose remain unchanged.
