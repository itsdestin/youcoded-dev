---
id: 53
title: Admin analytics, comments and service upkeep: 6 small faults
stage: planning
priority: P3
tags: marketplace, backend
branch: 53-admin-analytics-comments-and-service
roadmap: marketplace: Admin analytics, comments and service upkeep: 6 small faults
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (marketplace › backend, status confirmed, seen on all, last checked 2026-09-01)
Admin analytics, comments and service upkeep: 6 small faults. (a) The Regions list in admin analytics is empty; every device arrives with a blank region. (b) Destin's Android phone is still counted as a user; likely fix is a "Copy analytics ID" control in About. (c) You cannot delete your own marketplace comment. (d) You cannot report a marketplace comment; needs a reporting UI, admin queue and resolution flow (report: docs/active/investigations/2026-09-01-marketplace-report-a-comment.md). (e) The old `wecoded-marketplace-api...workers.dev` address must stay alive until no supported build uses it; switching it off once took down the games lobby, sync and accounts. (f) The "publish to marketplace" plugin cannot be changed by a normal pull request because its deliberate test keys trip the key scan, so its help-text update was dropped.
