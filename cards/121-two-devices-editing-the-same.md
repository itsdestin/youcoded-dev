---
id: 121
title: See and resolve sync conflicts between two devices
stage: explore
priority: P2
tags: sync, settings/sync, desktop
release: v1.3.3
report: docs/active/investigations/2026-09-01-sync-conflict-copy-resolver.md
branch: 121-two-devices-editing-the-same
roadmap: sync: Two devices editing the same file: no way in the app to see
created: 2026-10-15
summary: When two devices edit the same file or chat, the app gives no way to find the second copy or choose which to keep.
area: Devices & sync
side: both
work: session/sync-safety-audit-20260908
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (sync, status decision, seen on desktop, last checked 2026-09-23)
Two devices editing the same file: no way in the app to see or resolve the conflict. The only sign is one amber line in Backup & Sync that vanishes on restart and names no file; there is no way to find the "(from …)" copy or pick which version to keep, and the panel can show a green "All synced" beside that amber line (seen 2026-09-23). Destin (beta.9 dogfood 2026-07-24; 2026-09-23): "we need to add a better resolution mechanism/ui to the roadmap for split conversations with multiple copies" — conversation-specific resolution, not just a warning; design open. Destin 2026-10-05 triage (roadmap-triage-2026-10-05#22): postponed — "1.3.3"
