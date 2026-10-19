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
work: session/93-session-freezes, session/93-file-viewer-freezes, session/85-windows-131-regressions, session/crash-recommendations-deck, session/93-crash-reliability
---
Progress
Done: Session-start hardening merged in itsdestin/youcoded#629 (bc9e43752), with desktop and Android CI passing. Includes off-thread skill/context discovery, bounded worker retirement, reliable timer-only stall detection, severe-detail reservation, and content-free setup/keychain timings. Reviewed locally: 3475 tests passed, 37 skipped; 36 Android shell tests and 17 report tests passed. Implementation record: docs/archive/plans/2026-10-17-session-freezes.md. Current additional work (session/93-file-viewer-freezes): implemented and independently reviewed file-viewer first-frame/draft/stale-read fixes, exact off-thread comparisons (also #110), and complete off-thread search indexing including tags. Required desktop verification passed: 5306 tests passed, 36 skipped, with types/lint/knip/invariants/screens/journeys green. Synthetic Electron ASAR indexing heartbeat gap fell from 435.1 ms to 29.8 ms; both Node and browser worker packaging probes passed. 36 Android JVM tests passed; full APK packaging remains unverified. Implementation is local, uncommitted and not installed.
Next: Workspace report/close-out PR itsdestin/youcoded-dev#267 is awaiting CI. Original 27-second production incident remains unconfirmed; use improved diagnostics after the next app release. Broader card items stay open. Current additional work awaits owner review and separately authorized publication/release. Recheck the original app-only image-opening freeze with current diagnostics; no causal attribution was established.
Blocked: No implementation blocker. Source merged, not a new app release; production effectiveness remains unverified. Current additional work has no implementation blocker; original incident remains unconfirmed and the installed app is unchanged. Android runtime packaging needs apk-version tooling.

Chats
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
