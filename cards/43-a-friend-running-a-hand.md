---
id: 43
title: Games: a cheater can fake a win when you go offline
stage: planning
priority: P3
tags: games, security, bug
report: docs/active/investigations/2026-09-01-game-forfeit-unattested-record.md
branch: 43-a-friend-running-a-hand
roadmap: games: A friend running a hand-written client can post a forfeit "w
created: 2026-10-15
summary: A friend using a modified app can record a forfeit win against you the moment you disconnect, and can flood result messages.
area: Social
side: behind
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (games, status needs-verify, seen on all, last checked 2026-09-01)
A friend running a hand-written client can post a forfeit "win" against you the moment you go offline, and it lands on both records for good; the two head-to-head result messages also have no rate limit, so a loop of them can slow everyone's online/offline status.
