---
id: 2
title: Reopened chats: wrong labels and wrong times
stage: planning
priority: P1
tags: chat-data, desktop, chat, bug
release: v1.3.1
report: docs/active/plans/2026-09-16-simplification-phases.md
branch: 2-v1-3-1-release-blocker
roadmap: chat-data: v1.3.1 release blocker: the replayed-turn record's type is a
created: 2026-10-15
summary: Reopened chats can mislabel replayed turns and show the reopen time instead of when each message was sent; must be fixed before 1.3.1.
area: Chat
side: behind
platform: Desktop only
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: yes — the old roadmap marked it blocked; see below.

Chats

From the old roadmap (chat-data, status blocked, seen on desktop, last checked 2026-09-26)
v1.3.1 release blocker: the replayed-turn record's type is ambiguous (D11 in the simplification plan). The separately open smaller-read, catalog and cleanup costs belong to perf and stay blocked on phase 5. The 2026-09-26 Resume scan cache (youcoded#573) shipped and cut settled open from 1.7 to 0.3 s, but did not close this type issue.

Merged in #6 "Old messages show the reopen time, not when sent"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (chat-data, status decision, seen on all, last checked 2026-09-02)
Every replayed chat bubble is stamped with the moment you opened the session, not when it was said, so with timestamps on an old session reads as if it all happened "now", on any device. Needs TWO decisions, not one edit; see the report.
