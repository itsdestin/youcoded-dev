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
work: session/sync-slim-history, session/sync-rethink-investigation, session/mesh-sync-design
---
Progress
Done: (1) Sync watches only files that can sync and stops watching big folders, so it no longer uses hundreds of thousands of file watches (shipped 2026-09-29, app PR #590). (2) A slow first download is no longer cut off after 5 minutes (shipped 2026-10-05, app PR #607). (3) Files that are too big are no longer uploaded, and the app now says so (shipped 2026-09-16, app PR #483).
Next: piece 1 — leave pictures and duplicate file copies out of the synced copy of Claude Code chats. The plan is written (on branch session/sync-slim-history) but no code has started. Piece 2 — a one-time fresh start of the GitHub history — comes after piece 1. Still open: old versions of conversations are kept forever; conversations over 50 MB do not reach other devices; a first download may show no progress (needs a check in the running app).
Blocked: Destin's go-ahead on piece 1. Left out of the files batch on 2026-11-11: sync is being redesigned (cards #64, #241, #243; design stage, nothing built yet), so this waits for that.

Chats
- 2026-11-09 session/sync-slim-history: Slim synced chats (pictures out of sync copies), plan in docs/active/plans/2026-11-02-slim-synced-chats.md

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
