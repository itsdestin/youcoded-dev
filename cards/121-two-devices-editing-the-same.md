---
id: 121
title: Sync conflicts and the Backup & Sync panel's wording
stage: planning
priority: P2
tags: sync, settings/sync, desktop, bug
release: v1.3.3
report: docs/active/investigations/2026-09-01-sync-conflict-copy-resolver.md
branch: 121-two-devices-editing-the-same
roadmap: sync: Two devices editing the same file: no way in the app to see
created: 2026-10-15
summary: Two devices editing the same file or chat leave no way to find or choose between copies, and the Backup & Sync panel's wording is unclear.
area: Devices & sync
side: both
work: session/sync-safety-audit-20260908
vision: sync.added.conflictcopy
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (sync, status decision, seen on desktop, last checked 2026-09-23)
Two devices editing the same file: no way in the app to see or resolve the conflict. The only sign is one amber line in Backup & Sync that vanishes on restart and names no file; there is no way to find the "(from …)" copy or pick which version to keep, and the panel can show a green "All synced" beside that amber line (seen 2026-09-23). Destin (beta.9 dogfood 2026-07-24; 2026-09-23): "we need to add a better resolution mechanism/ui to the roadmap for split conversations with multiple copies" — conversation-specific resolution, not just a warning; design open. Destin 2026-10-05 triage (roadmap-triage-2026-10-05#22): postponed — "1.3.3"

Merged in #126 "Backup & Sync panel: three wording and status gaps"
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (sync, status needs-verify, seen on desktop, last checked 2026-09-01)
Backup & Sync panel: three wording and status gaps. (a) "Last synced" shows the NEWEST time across spaces, so one healthy space and two that cannot reach GitHub still read "just synced"; needs a call on newest vs oldest or per-space rows. (b) The (i) popup says nothing about two devices having the same conversation open, and the takeover dialog says "didn't answer" when it really "couldn't confirm the handoff" (Destin asked, 2026-09-21; decided: no hub-down warning, a 2–3 sentence paragraph in the popup, keep the first confirmation short). (c) From the PR #126 redesign: the "additional backups" master toggle has no real saved state, and the main toggle reads OFF while "Waiting on GitHub" (undecided).
