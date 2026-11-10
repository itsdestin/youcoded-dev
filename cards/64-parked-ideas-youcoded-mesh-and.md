---
id: 64
title: Ideas: YouCoded Mesh and Cloud
stage: explore
work: session/mesh-sync-design
priority: P3
tags: native-harness, sessions, feature
needs: 61
branch: 64-parked-ideas-youcoded-mesh-and
created: 2026-10-15
summary: Let your devices share requests and scheduled jobs automatically, with an optional paid cloud fallback when all are offline.
area: Devices & sync
side: both
vision: sync.mesh.handoff, sync.mesh.cloud, agents.background.device
---
Progress
Done: Design interview with Destin on how chats follow you across devices, 2026-11-06 to 2026-11-09. Three question decks (rounds 1 and 2 answered; round 3 saved, not yet submitted), a written explainer, and a draft spec. No app code changed. Record: branch session/mesh-sync-design (youcoded-dev, pushed), folder docs/active/design/2026-11-07-mesh-sync/README.md.
Next: Destin submits or finishes round 3 deck; then decide the open questions the explainer lists. Build waits until he approves the design.
Blocked: Automatic device choice for scheduled jobs may depend on card 61 (Agents & Automations). Not confirmed in the spec.

See also #119: Reaching your computer through a YouCoded account without Tailscale (119) is part of the same long-term Mesh and Cloud idea as 64.

Chats

From the old roadmap (native-harness › sessions, status parked, seen on all, last checked 2026-09-08)
Parked ideas: YouCoded Mesh and Cloud — 2 things (v1.4, not a release promise). (a) "YouCoded Mesh" (Destin, 2026-09-08) picks a suitable device of yours for remote requests and scheduled duties without you managing which one; needs suitability, permissions and no duplicate runs designed. (b) "YouCoded Cloud" runs an automation when none of your devices is online, as an optional, possibly paid fallback after Mesh; needs consent, spending limits and privacy designed.

Updated on the old roadmap after the move (master, merged in 2026-10-16)
Parked ideas: YouCoded Mesh and Cloud — 2 things (v1.4, not a release promise).
(a) "YouCoded Mesh" (Destin, 2026-09-08) picks a suitable device of yours for remote requests
and scheduled duties without you managing which one; needs suitability, permissions and no
duplicate runs designed.
(b) "YouCoded Cloud" runs an automation when none of your devices is online, as an optional,
possibly paid fallback after Mesh; needs consent, spending limits and privacy designed.
`all` `parked` `P3` `checked 2026-09-08` `v1.4`

