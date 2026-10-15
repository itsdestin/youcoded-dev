---
id: 127
title: Sync housekeeping: six leftovers and rare edge cases
stage: planning
priority: P3
tags: sync, desktop
branch: 127-sync-housekeeping-six-leftovers-and
roadmap: sync: Sync housekeeping: six leftovers and rare edge cases.
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #17: 127's item (d), a dev copy of the app syncing the same Personal folder as the real app, is one of the dev-instance-touches-the-real-app faults listed in 17.

Chats

From the old roadmap (sync, status confirmed, seen on desktop, last checked 2026-09-01)
Sync housekeeping: six leftovers and rare edge cases. (a) Two projects made before 2026-09-23 whose names differ only by capitals ("Notes", "notes") still share one online copy and mix files. (b) If the app crashes mid-sync, saved copies of files git doesn't manage stay in the hidden sync folder forever. (c) A conversation over the size limit here, plus a change to its older copy on another device, may fail every sync with "Sync merge could not complete" (reasoned, not reproduced). (d) A dev copy of the app syncs the same Personal folder as the real app and they race each other (once let six over-limit files into history; now blocked at upload). (e) The old frozen conversation index is still read by the resume browser as a fallback; delete it once unneeded. (f) Decided 2026-09-02: ignore stray `*.tmp` files everywhere (a crash can strand one and it rides to every device), which would also stop syncing a file a user genuinely named `.tmp`.
