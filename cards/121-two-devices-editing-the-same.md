---
id: 121
title: Sync conflicts and the Backup & Sync panel's wording
stage: planning
priority: P2
tags: sync, settings/sync, desktop, bug
report: docs/active/investigations/2026-09-01-sync-conflict-copy-resolver.md
branch: 121-two-devices-editing-the-same
roadmap: sync: Two devices editing the same file: no way in the app to see
created: 2026-10-15
summary: Two devices editing the same file or chat leave no way to find or choose between copies, and the Backup & Sync panel's wording is unclear.
area: Devices & sync
side: both
work: session/sync-safety-audit-20260908, session/sync-rethink-investigation
vision: sync.added.conflictcopy
---
Progress
Done: the Backup & Sync panel now has a 'Using the same conversation on two devices' section (SyncPanel.tsx:90) and the takeover dialog says 'couldn't confirm' (takeover-dialog-copy.ts:47). Sync safety (youcoded#563) stops sync from overwriting files.
Next: Choose the design for picking between conflicting copies — but sync is being rebuilt (cards #64, #241, #243), so decide there. Correction 2026-11-10: branch session/sync-safety-audit-20260908 holds no deck; its one extra commit is September code (a backup-target fix and unfinished conversation-heal safety). It is now backed up on GitHub and is probably superseded by the rebuild.
Blocked: the design decision with Destin; the restart-vanish and 'newest time' behaviour need a re-test.

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
