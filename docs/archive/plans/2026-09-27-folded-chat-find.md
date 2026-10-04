---
title: Folded-chat Find — exact rendered-text index
status: superseded
date: 2026-09-27
---

# Folded Chat Find Implementation Plan

> For agentic workers: use subagent-driven-development and TDD, then independent review.

**Goal:** Remove the measured ~2s Find-open freeze without losing matches in loaded-but-folded rows or changing the bar's layout.

**Architecture:** Capture ordered accepted DOM text-node values before folding a loaded row. Search those snapshots in document order; materialize DOM ranges only for mounted rows and explicitly reveal the selected folded row. Preserve a live-DOM path for non-row content. The artifact finder continues using its existing path.

**Evidence:** `scratch/perf-lab/find-gpu-shakedown.json`:1020 loaded/1015 folded,1982ms open,1570ms long task with real Radeon acceleration. Software reproduction1925ms. Diagnostics currently used the timestamp experiment build; that rejected experiment has now been removed from source and its patch retained. Capture a fresh unchanged-app baseline before timing the Find candidate.

## Approved scope revision — message content only

Destin answered the pending choice: **“no reasoning/tool details, just all message content including offscreen messages.”** This supersedes the original all-rendered-text scope below. Search user-authored message bodies and assistant text reply segments, including loaded rows folded offscreen; exclude reasoning, tool inputs/results, card controls, timestamps, session-context banners and other non-message chrome. Keep the previously stated loaded-history boundary; this change does not silently promise searching pages not loaded from disk.

The prior rendered-row snapshots are no longer authoritative: their contents include excluded card text and depend on disclosure state. Build the search corpus from message bodies, using markdown-to-searchable-text semantics consistent with visible message text; retain targeted reveal/pinning. Do not preserve an unused generic capture/index architecture merely because it was built. Preserve useful tests/patch evidence if superseding this session's groundwork.

## Constraints

Preserve case-insensitive matching, loaded-history scope, chronological ordering, wraparound, highlighting, navigation and close behavior. No visible layout/copy change. Missing/stale message data must never produce a definitive partial count/false zero. Do not unfold everything or move the same stall to first typing. Index retention is bounded by loaded messages and cleared on lifecycle removal. No per-token scans/parses of historical message bodies. No commits/pushes or live-app access. The original tasks below record the first design; Task3 must implement the scope revision, not index reasoning/tool/non-row text.

### Revised Task 3 acceptance

- Search plain user message content and assistant `text` segments only; never assistant `reasoning` or `tool-group` segments, tool responses, injected specialist/tool cards or metadata. Markdown syntax/URL destinations must not create invisible matches; code block content and visible link labels remain message content.
- Opening Find keeps offscreen rows folded. Query hits carry stable row/message coordinates. Navigating reveals/pins only the selected row, then validates/constructs highlights inside message-only DOM regions, not reasoning/tool controls.
- Keep the artifact document finder default path unchanged. Shared Find bar may accept a narrow chat adapter without changing layout.
- Tests must include a query that occurs only in reasoning/tool details (no result), one only in a folded user/assistant message (result and correct reveal), markdown text and code, streaming updates, row removal, close/unmount cleanup and unrelated-row render budgets.
- First implement and measure a correct prototype. If the renderer cannot faithfully locate a source hit, report it rather than silently count un-navigable matches. A source-index optimization must include its first-query work and retained-memory cost in the measurement.

## Task 1: Exact text-index core and capture contract

Files: new small module under `desktop/src/renderer/components/` for the chat rendered-text index; tests in `desktop/tests/` named for that module. Extract/share the existing TreeWalker matching logic only if necessary, leaving artifact semantics unchanged.

- [ ] Red tests: case-insensitive, no cross-node matches, multiple occurrences, whitespace exclusion, order, stale/missing entry refuses final count, removal and cleanup.
- [ ] Implement snapshots as immutable arrays of node values with row identity/revision; store stable occurrence coordinates rather than detached DOM Ranges.
- [ ] Prove bounded snapshot replacement (not append on every update) and incremental invalidation; no whole-history work per streamed word.

## Task 2: Folding integration and targeted reveal

Files: `hooks/use-entry-folding.ts`, its existing tests, `components/ChatTimelineRow.tsx` if necessary.

- [ ] Red tests: capture happens while body still exists before fold; targeted reveal removes only requested row; selected search row remains mounted while its Range is in use; releasing search selection returns ordinary folding behavior; cleanup releases records.
- [ ] Capture DOM text only where folding already has a mounted body; invalidate changed rendered content and relevant input revisions without breaking row memoization.
- [ ] Provide a narrow targeted reveal API. Preserve height and scroll geometry and first-frame switch behavior.

## Task 3: Chat finder adapter

Files: `components/ContentFindBar.tsx`, `components/ChatView.tsx`, existing content-find/ChatView tests.

- [ ] Red integration test: many loaded folded rows remain folded when Find opens; a term in a folded row is included and navigation reveals just that row; artifact default path remains unchanged.
- [ ] Keep folding enabled during Find. Optional adapter routes chat search to indexed snapshots; include live non-row regions in the same document ordering.
- [ ] On selection, await committed row DOM, validate node/offset/query then create real Range. Stale content triggers refresh, never highlights an unrelated node.
- [ ] Pending work uses the existing blank counter, not a fabricated0/0; hold navigation until exact result set is complete. If missing snapshots require perceptible long waits/new wording, report the design limitation rather than silently expanding UX.
- [ ] Test mutations, streaming, settings-affecting text, close/unmount, no implicit older-history page requests, and unrelated row memo preservation.

## Task 4: Measurement and acceptance

- [ ] Mandatory desktop `verify.sh`, fresh code review, and corrected tests for material findings.
- [ ] Capture repeated unchanged baseline first (separate build path/owned fixture), then candidate under the same renderer/viewport/corpus. Avoid concurrent work while sampling.
- [ ] Extend Find diagnostic to verify full match completeness/navigation, not only nonzero result; ensure actual initial corpus and subsequent page loading are recorded.
- [ ] Measure Find open, first query, navigation, loaded/folded counts, long tasks, page-load/index cost and retained memory. A fast open that moves work to typing or page loading is not automatically a win.
- [ ] Real-GPU and software are separate result lanes. Inspect screenshots; changes in appearance require the prescribed approval, not a silent keep.

## Design review

Focused read-only review recommended this shape over parsed-markdown caching (still mounts DOM/layout) and incremental unfolding (moves cost, retains full DOM). Exact rendered text and non-row search scope are load-bearing. This is an implementation experiment within the approved measured first batch, not a claim the design is already proven.
