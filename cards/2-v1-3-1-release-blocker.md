---
id: 2
title: Reopened chats: wrong labels and wrong times
stage: planning
priority: P1
tags: chat-data, desktop, chat, bug
report: docs/active/plans/2026-09-16-simplification-phases.md
branch: 2-v1-3-1-release-blocker
roadmap: chat-data: v1.3.1 release blocker: the replayed-turn record's type is a
created: 2026-10-15
summary: Some reopened chats can show reopen-time timestamps; replay typing still needs cleanup. Deferred from 1.3.1 by Destin.
area: Chat
side: behind
platform: Desktop only
vision: chat.converse.resume
---
Progress
Done: Release audit confirmed the remaining limitation; Destin explicitly deferred this item from 1.3.1. No implementation was shipped or marked fixed.
Next: Remain open for future scoped work; not a gate for the current 1.3.1 candidate.
Blocked: Not blocking 1.3.1 by explicit decision. Future product/design choices remain separate.

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
