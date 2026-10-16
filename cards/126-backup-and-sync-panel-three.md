---
id: 126
title: Backup & Sync panel: three wording and status gaps
stage: planning
priority: P3
tags: sync, settings/sync, desktop
branch: 126-backup-and-sync-panel-three
roadmap: sync: Backup & Sync panel: three wording and status gaps.
created: 2026-10-15
summary: The Sync panel can say "just synced" when some spaces are failing, and some toggles and messages are misleading.
area: Settings
side: screens
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (sync, status needs-verify, seen on desktop, last checked 2026-09-01)
Backup & Sync panel: three wording and status gaps. (a) "Last synced" shows the NEWEST time across spaces, so one healthy space and two that cannot reach GitHub still read "just synced"; needs a call on newest vs oldest or per-space rows. (b) The (i) popup says nothing about two devices having the same conversation open, and the takeover dialog says "didn't answer" when it really "couldn't confirm the handoff" (Destin asked, 2026-09-21; decided: no hub-down warning, a 2–3 sentence paragraph in the popup, keep the first confirmation short). (c) From the PR #126 redesign: the "additional backups" master toggle has no real saved state, and the main toggle reads OFF while "Waiting on GitHub" (undecided).
