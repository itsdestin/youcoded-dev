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
work: session/security-server-batch
---
Progress
Done: Rate limit built on branch session/security-server-batch (not merged): each account may send 30 game-result messages per 5 minutes; extra ones are ignored without disconnecting anyone. Honest play sends one per match. The fake-win gap is still open (re-checked 2026-11-10): no app sends the forfeit message, so only a hand-made client can use it.
Next: Destin chooses how to stop fake forfeit wins (options below).
Blocked: nothing recorded.

Chats
- 2026-11-10 session/security-server-batch: Batch 5: rate limit on game-result messages built; forfeit choice left for Destin

From the old roadmap (games, status needs-verify, seen on all, last checked 2026-09-01)
A friend running a hand-written client can post a forfeit "win" against you the moment you go offline, and it lands on both records for good; the two head-to-head result messages also have no rate limit, so a loop of them can slow everyone's online/offline status.

Open choice for Destin (2026-11-10): fake forfeit wins
Today a friend with a modified app can record a permanent forfeit win against you once you are offline; nothing proves a match took place. No released app sends this message.
   - Switch the forfeit message off on the server until the app has a real forfeit feature. Closes the hole completely and is a few lines; honest players lose nothing today because no app uses it. When forfeits are built later it must be switched back on with proof attached.
   - Keep it, but only accept a forfeit when the server itself saw that match start and saw the opponent leave during it. Forfeits are ready for the day the app sends them; more server work now, for a feature nobody can use yet, and it needs careful testing.
   - Leave as is. No work; the fake win stays possible, now only slower to spam.
Recommended: the first. It removes the risk at almost no cost and takes nothing away from anyone.
