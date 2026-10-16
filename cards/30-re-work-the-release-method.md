---
id: 30
title: Let small bug-fix releases ship on their own
stage: planning
priority: P2
tags: dev-workspace, release
branch: 30-re-work-the-release-method
roadmap: dev-workspace: Re-work the release method: releases tag master directly, so
created: 2026-10-15
summary: Every release ships everything on master, so a quick fix can't go out while a bigger update is still unfinished.
area: Behind the scenes
side: behind
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (dev-workspace › release, status confirmed, seen on n/a, last checked 2026-09-03)
Re-work the release method: releases tag master directly, so each ships all ~3,200 commits since v1.2.4 and bug-fix minors cannot go out alone. Goal: cut `release/vX.Y.x` branches off the last tag and cherry-pick fixes, so a minor ships while the next major is blocked. Caveats: a "goes in the minor?" decision per fix, and one-tag-both-platforms means an Android versionCode bump and paired Android build. A 1.3 blocker since 2026-09-03; off 1.3.1 in Destin's triage 2026-09-23
