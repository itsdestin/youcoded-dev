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
work: session/sync-rethink-investigation, session/security-server-batch
---
Progress
Done: Computers stopped making GitHub backups of settings and service keys (2026-10-13, c2b786bf6); the phone app's copy went with the Android rebuild (2026-10-14, 5670e68b8). New password files no longer upload (2026-09-23, 1f618eeb3, PR youcoded#563). Device-impersonation gap (c): a server-side fix is built on branch session/security-server-batch (not merged) — each connection is tied to the first device identity it uses, and a second live connection cannot use an identity another connection holds.
Next: Destin reads the trade-off below before this deploys. Also still open: whether to accept the old password files already in history (history rewrite was declined 2026-09-23).
Blocked: nothing; the history rewrite is declined, not blocked.

Chats
- 2026-11-10 session/security-server-batch: Batch 5: lease identity tied to the connection (server only); trade-off written on the card
- 2026-10-18 session/google-connections-planning: Recovered parked connection-sync idea: Google/Outlook/iCloud connections remain per-device; user explicitly deferred syncing sign-ins because of risk (September 27: "i dont want to deal with the risk rn"). Not approved implementation and not a prerequisite for #155-159. Future design must examine credential transport/storage; paired-phone use of a host connection is distinct from copying credentials. Source: cceb33f0:docs/roadmap/sync.md and docs/active/design/2026-09-26-everyday-actions/proposal.md section 8. Preservation only.

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

What the 2026-11-10 fix for gap (c) does and does not do
- Closes: while your device is connected, another connection signed in to your account can no longer act as it (take, renew, release or force its session locks).
- Cost for honest users: after a connection drops without a clean goodbye (wifi switch, laptop wake, flaky phone data), the server may ignore that device's session-lock messages for up to 45 seconds (about 22 on average) while the dead connection still counts as alive. In that window opening a chat can take about 10 seconds longer, an explicit hand-off to that device is refused, and a chat opened then is not protected against being opened on a second device. A normal restart or sign-out has no delay.
- Still open: the identity is still whatever the app says it is. Someone holding your account sign-in can claim a device's identity while that device is offline, or claim it first and keep the real device's lock messages ignored. Before the fix they could impersonate it outright instead.
- A complete fix needs each install to prove who it is (a secret the server gives it once). That is an app change plus a server change, and only protects devices that have updated.

Open choice for Destin
   - Ship the server fix as built. Stops live impersonation now for every released version; costs the up-to-45-second window after an unclean reconnect.
   - Do not ship it; build the proof-based fix instead. No reconnect window and a real guarantee; nothing improves until an app release, and old versions stay exposed.
   - Ship it now and build the proof-based fix next. Best protection over time; the reconnect window stays until old versions are retired.
