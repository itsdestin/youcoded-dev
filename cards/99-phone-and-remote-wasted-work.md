---
id: 99
title: Phone watching a chat: wasted work, slow and garbled starts
stage: planning
priority: P3
tags: perf, performance, remote-access, standalone, remote, bug
branch: 99-phone-and-remote-wasted-work
roadmap: perf: Phone and remote: wasted work and slow starts (6 things).
created: 2026-10-15
summary: Phones watching a chat download more than they show, can flash white or reload whole chats, and joining late may garble the start.
area: Devices & sync
side: behind
platform: Phone and web
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status confirmed, seen on all, last checked 2026-08-07)
Phone and remote: wasted work and slow starts (6 things). (a) A phone receives events for every open computer session though it shows one; (b) first remote connect can show white before sign-in (report: docs/active/investigations/2026-09-01-remote-first-connect-dead-time.md); (c) reconnect re-sends and redraws full conversations; (d) Android reads an entire long conversation on open instead of the latest page; (e) marketplace refresh sends the whole ~1 MB catalog (report: docs/active/investigations/2026-09-01-marketplace-catalog-payload-size.md); (f) animation frame budgets are unchecked on real phones and remote browsers.

Merged in #120 "Phone joining late may see garbled start of a chat"
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (remote-access › standalone, status needs-verify, seen on remote, last checked 2026-10-04)
The copy of terminal text kept for phones can be cut in the middle of a formatting code, so a phone that joins late may replay a garbled start. This predates the 2026-10-04 terminal work; fixing it changes the offsets phones replay against, so it needs a phone check. Filed here because the fix is the phone protocol; the memory cost of that buffer is in perf
