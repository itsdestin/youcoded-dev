---
id: 125
title: Same chat on two computers: warnings and takeover ideas
stage: planning
priority: P3
tags: sync, bug
report: docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md
branch: 125-same-conversation-on-two-computers
roadmap: sync: Same conversation on two computers: four gaps in warnings an
created: 2026-10-15
summary: A chat open on two computers can be taken over with no warning and both may keep writing; parked ideas for handing it over cleanly.
area: Devices & sync
side: both
vision: sync.added.takeover
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (sync, status confirmed, seen on all, last checked 2026-09-01)
Same conversation on two computers: four gaps in warnings and takeover. (a) With the SyncHub down, force-taking-over a session leaves the original holder running as if nothing happened, and the two installs keep rewriting each other's lease file (dev repro 2026-07-23; report: docs/active/investigations/2026-09-01-lease-loss-undetected-in-file-fallback.md). (b) You can open a conversation your other machine is actively working in with no warning (Destin, 2026-09-03); with the hub unreachable the app stays silent, and the repro was a dev profile, so confirm in the installed app first. (c) A device that slept past its 300 s lease can wake still writing a conversation another device took, with no warning; the "yield and take back over" step was not built. (d) Unverified: a conversation resumed on another computer may miss the latest helper messages (deferred by Destin 2026-09-23; report: docs/active/investigations/2026-09-23-handoff-message-freshness.md).

Merged in #129 "Sync: four parked ideas"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (sync, status parked, seen on all, last checked 2026-07-03)
Parked ideas: sync (four things). (a) Same-machine takeover without the hub: two installs sharing `~/YouCoded` cannot deliver a takeover request when the SyncHub is down; a file-based request signal would fix it. (b) Restore-from-backup redesign (removed earlier), rethought around local models, accounts and platform. (c) YouCoded Cloud sync: zero-setup sync with no GitHub, likely a paid tier, end-to-end encrypted, below the existing transport contract. (d) A synced per-device SystemState file (hardware, OS, tool versions, local models) the assistant can query ("can my laptop run this model"), with an optional Settings dashboard.
