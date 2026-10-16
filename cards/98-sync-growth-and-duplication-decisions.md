---
id: 98
title: Sync: growth, very long chats and the first download
stage: planning
priority: P2
tags: perf, settings/sync, performance, sync, bug
branch: 98-sync-growth-and-duplication-decisions
roadmap: perf: Sync: growth and duplication decisions (3 things; the histor
created: 2026-10-15
summary: Sync: large projects may miss edits or duplicate history, very long chats stop syncing, and the first download shows nothing while it runs.
area: Devices & sync
side: behind
vision: sync.follow.safety, sync.added.longchats
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (perf, status needs-verify, seen on all, last checked 2026-09-16)
Sync: growth and duplication decisions (3 things; the history-size decision moved to sync). (a) Large synced projects use more file watches than needed; one watch per project risks missed edits and needs Linux, Mac and Windows tests; (b) synced code projects that keep Git history get a second hidden history; (c) a far-behind device on a slow connection may keep timing out its upload, not reproduced.

Merged in #122 "Very long conversations stop syncing to other devices"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (sync, status decision, seen on all, last checked 2026-09-16)
Very long conversations (over 50 MB) stop updating on your other devices. The device that has them keeps them, and the Sync panel now says so, but other devices never get the newest messages. Six of Destin's conversations (54–107 MB) hit this, 2026-09-16. Needs a way to sync long conversations in pieces. Destin 2026-10-05 triage (roadmap-triage-2026-10-05#23): postponed until after 1.3.1

Merged in #123 "Sync history grows forever; first download shows nothing"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (sync, status confirmed, seen on all, last checked 2026-10-05)
Personal sync history only grows, and a first download of it shows nothing (2 things). (a) Sync keeps every old version of every conversation forever: 2.6 GB online and 8 GB on the Z13 on 2026-10-05, more than the 5.6 GB of actual files (it was 1.7 GB and 2.5 GB in September). A new device, or a repair that has to start over, must download all of it first. Needs a choice of how much old history to keep, without losing any device's copy (report: docs/active/investigations/2026-09-01-transcript-storage-long-term.md). (b) While that first download runs, the Sync panel shows nothing about it; it can take an hour with no sign anything is happening.

From the 2026-10-16 document sweep
- Design a different long-term store for transcript bytes (today every transcript sits on every device). Source: docs/active/investigations/2026-09-01-transcript-storage-long-term.md
