---
id: 93
title: Background freezes, memory growth and whole-file reads
stage: planning
priority: P1
tags: perf, chat, desktop, performance, needs-repro, bug
report: docs/active/plans/2026-09-16-simplification-phases.md
branch: 93-v1-3-1-blocker-blocked
roadmap: perf: **v1.3.1 blocker, blocked on simplification phase 5:** lefto
created: 2026-10-15
summary: Some spots still read whole files or keep data too long, causing background freezes and memory growth on huge chats; needed before 1.3.1.
area: Chat
side: behind
platform: Desktop only
vision: chat.converse
work: session/93-session-freezes, session/93-file-viewer-freezes, session/85-windows-131-regressions, session/crash-recommendations-deck, session/93-crash-reliability, session/93-app-fixes-merge
---
Progress
Done: Session-start hardening previously merged in youcoded#629 (bc9e43752); crash hardening in #654 (0a020c3f7). Viewer first-frame/draft/rename/stale-read fixes, including final watcher/action-delivery review corrections, exact background comparisons (#110), and complete off-thread search indexing including tags now merged in itsdestin/youcoded#665 as 254ff9983aa3657a937dfd65011beb3c6e6508c9. Final local verification: 5546 related tests passed, 36 skipped; 136 focused passed; all nine gates green. Remote CI passed four Linux test shards/four package formats plus Android JVM and debug/releaseTest APK jobs. App-only lifecycle records prepared on session/93-app-fixes-merge.
Next: Keep this broader card open. Recheck the original app-only JPEG freeze with current diagnostics when evidence is available; no causal attribution established. Continue separate evaluation/coverage work on #96 in preserved session/93-file-viewer-freezes. Release/installation remains separate from source integration.
Blocked: No blocker for merged app subtask. Original incident, broader blocking/memory issues and production effectiveness remain unresolved. Local full Android payload was blocked by apk-version tooling; remote APK CI subsequently passed, not device runtime.

Chats
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-app-fixes-merge: chat started
- 2026-10-21 session/93-app-fixes-merge: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-21 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-file-viewer-freezes: chat started
- 2026-10-20 session/93-crash-reliability: Completed crash-hardening subtask: youcoded#654 merged to remote master as 0a020c3f7fcfd121622aeef5bc3c3def36e97b9d. Production renderer recovery/reconnection, closed-native-session memory release, coordinated shutdown, per-window draft recovery and dead Office ownership cleanup. Full local desktop verification and Linux desktop/package plus Android JVM/debug/releaseTest APK CI passed. Not released or installed. Broader #93 items and the other session's search/file-viewer work remain open; #172 engine upgrade and #173 history exploration are deferred. Scoped plan and approved deck archived under docs/archive/{plans,design}/2026-10-19-crash-reliability*.
- 2026-10-20 session/93-crash-reliability: chat started
- 2026-10-19 session/93-crash-reliability: chat started
- 2026-10-19 session/93-crash-reliability: chat started
- 2026-10-19 session/crash-recommendations-deck: Crash deck Q-6: Destin asked to note search-index stalls on the roadmap and check for another session. Existing session/93-file-viewer-freezes already reports complete off-thread search indexing; do not duplicate it. Its implementation is not installed. October 19 crash investigation independently found synchronous indexing in the installed/source baseline; coordinate with that session before further search work.
- 2026-10-18 session/93-file-viewer-freezes: chat started
- 2026-10-18 session/93-file-viewer-freezes: chat started
- 2026-10-18 session/93-file-viewer-freezes: chat started
- 2026-10-18 session/93-file-viewer-freezes: chat started
- 2026-10-18 session/85-windows-131-regressions: Merged watcher responsiveness/ordering fixes in youcoded#632 (1e8797ec3). User reported OneDrive downloads freezing the app/computer; authenticated OneDrive hydration remains unverified and the unfinished cloud-download-consent work is not claimed implemented. See docs/archive/plans/2026-10-18-windows-131-regressions.md; this does not close the broader freeze items.
- 2026-10-18 session/93-file-viewer-freezes: Remaining audit-only leads: engine/rocm-prereqs.ts and models/gpu-detector.ts still use synchronous hardware subprocess probes; renderer/hooks/useInlineFilepathDetector.ts repeatedly scans earlier matches for overlap on large path lists. Neither was established as the image-opening freeze cause or fixed in this branch; retain for targeted reproduction, not a closed incident.
- 2026-10-18 session/93-file-viewer-freezes: chat started
- 2026-10-18 session/93-file-viewer-freezes: chat started
- 2026-10-18 session/93-file-viewer-freezes: chat started
- 2026-10-18 session/93-file-viewer-freezes: chat started
- 2026-10-18 session/93-session-freezes: chat started
- 2026-10-18 session/93-session-freezes: chat started

From the old roadmap (perf, status blocked, seen on desktop, last checked 2026-09-26)
**v1.3.1 blocker, blocked on simplification phase 5:** leftover whole-file reads and memory waste. Two small reads still take whole files; catalog fetches can repeat; per-session file tracking outlives its session; an unused whole-history parser can turn a 112 MB file into a 224 MB string. The Resume caches already shipped (open time 1.7 s down to 0.3 s). Replayed-turn type ambiguity (D11) stays in chat-data.

Merged in #95 "Background freezes and memory growth"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #14: Both work from the same report on blocking calls in the app's main process: 14 sorts them in a test, 95 fixes the ones that freeze windows.

Chats

From the old roadmap (perf, status confirmed, seen on desktop, last checked 2026-09-01)
Main process: freezes and resource growth that can hit every window (5 things). (a) Remaining blocking work in session/home, locked conversation writes, chat search indexing, git/sync transport, catalog reads, the project watcher and theme glass slider writes can interrupt every window (see docs/active/investigations/2026-09-24-main-blocking-calls-triage.md); (b) starring, tagging or renaming a chat triggers a later full search rebuild that may stall the app; (c) after 73 minutes with ~15 helpers changing files a dev instance reached ~2.8 GB and ran out of memory, not rechecked; (d) a file's git refresh can start up to three git processes per change; (e) the old ~250,000 file-watch count ran out of watches when a second instance opened, so remeasure on a fresh install. Update 2026-10-04 (read from code, not measured): with phone access on, memory kept for a phone that may not be connected is capped by count, not size; terminal text is ~4-8 MB per session and hook events (capped at 10,000, whole tool results) are roughly 10-150 MB for realistic long sessions. A plausible contributor for phone-access users only.

2026-10-18 release scope decision — deferred from 1.3.1 by Destin; see #29 for the current-build release scope and requirements that remain mandatory. This item stays open and is not marked fixed or shipped.
