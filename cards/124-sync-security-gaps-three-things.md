---
id: 124
title: Sync security: three gaps that could expose secrets
stage: planning
priority: P2
tags: sync, settings/sync, security, bug
branch: 124-sync-security-gaps-three-things
roadmap: sync: Sync security gaps: three things that could expose secrets o
created: 2026-10-15
summary: Old password files may stay in sync history, Android backups copy service keys, and one device could pose as another.
area: Devices & sync
side: behind
vision: sync.added.securitygaps
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (sync, status needs-verify, seen on all, last checked 2026-09-21)
Sync security gaps: three things that could expose secrets or let one device pose as another. (a) A project where an older app version uploaded a password file (like `.env`) keeps that copy online and in history; new edits stay on the device, but removing it means rewriting the project's history on every device (decided out of scope, 2026-09-23). (b) The Android app's GitHub backup copies `mcp.json` (which can hold service keys) and settings into the backup repository; the desktop app no longer has this backup. (c) The sync worker accepts whatever device id a lease message claims without checking the signed-in connection, so a client in your account could act as another of your devices (decided 2026-09-21 to file as a potential issue, not fix now; report: docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md).

Updated on the old roadmap after the move (master, merged in 2026-10-16)
Sync security gaps: three things that could expose secrets or let one device pose as another.
(a) A project where an older app version uploaded a password file (like `.env`) keeps that copy online and
in history; new edits stay on the device, but removing it means rewriting the project's history on every
device (decided out of scope, 2026-09-23). (b) The Android app's GitHub backup copies `mcp.json` (which can
hold service keys) and settings into the backup repository; the desktop app no longer has this backup.
2026-10-13, Destin (small-fixes-2#SF2-7): "the phone and pc should eventually function identically.
we will replace github backup on phone with pc-parity cross device sync". Computers stopped offering
it on 2026-10-13 (an old one shows "No longer supported"); the phone keeps it until then.
(c) The sync worker accepts whatever device id a lease message claims without checking the signed-in
connection, so a client in your account could act as another of your devices (decided 2026-09-21 to file
as a potential issue, not fix now; report: docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md).
`settings/sync` `all` `needs-verify` `P2` `checked 2026-09-21` `security`

From the 2026-10-16 document sweep
- Check that the sync security fixes cover the lease-identity gap (M2: lease identity is not authenticated). Source: docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md
