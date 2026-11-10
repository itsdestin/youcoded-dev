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
vision: social.friends.forfeit
---
Progress
Done: Checked 2026-11-09 against the live server code. The fake-win gap is still open: a friend with a modified app can still record a permanent win against you once you are offline (no proof of play required), and the two result messages have no rate limit. No app sends the forfeit message today, so only a hand-made client can trigger it. Fix options are written up in docs/active/investigations/2026-09-01-game-forfeit-unattested-record.md.
Next: Destin decides the fix (remove the forfeit message until a real client exists, or require the server to have seen the match start). The rate-limit fix is small and can be done alone.
Blocked: nothing recorded.

Chats

From the old roadmap (games, status needs-verify, seen on all, last checked 2026-09-01)
A friend running a hand-written client can post a forfeit "win" against you the moment you go offline, and it lands on both records for good; the two head-to-head result messages also have no rate limit, so a loop of them can slow everyone's online/offline status.
