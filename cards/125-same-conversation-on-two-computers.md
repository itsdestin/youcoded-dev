---
id: 125
title: Same chat open on two computers: four warning gaps
stage: planning
priority: P3
tags: sync
report: docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md
branch: 125-same-conversation-on-two-computers
roadmap: sync: Same conversation on two computers: four gaps in warnings an
created: 2026-10-15
summary: Opening or taking over a chat another computer is using can happen with no warning, and both may keep writing to it.
area: Devices & sync
side: both
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (sync, status confirmed, seen on all, last checked 2026-09-01)
Same conversation on two computers: four gaps in warnings and takeover. (a) With the SyncHub down, force-taking-over a session leaves the original holder running as if nothing happened, and the two installs keep rewriting each other's lease file (dev repro 2026-07-23; report: docs/active/investigations/2026-09-01-lease-loss-undetected-in-file-fallback.md). (b) You can open a conversation your other machine is actively working in with no warning (Destin, 2026-09-03); with the hub unreachable the app stays silent, and the repro was a dev profile, so confirm in the installed app first. (c) A device that slept past its 300 s lease can wake still writing a conversation another device took, with no warning; the "yield and take back over" step was not built. (d) Unverified: a conversation resumed on another computer may miss the latest helper messages (deferred by Destin 2026-09-23; report: docs/active/investigations/2026-09-23-handoff-message-freshness.md).
