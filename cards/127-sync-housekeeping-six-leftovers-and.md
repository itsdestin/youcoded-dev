---
id: 127
title: Sync: six leftover cleanups and rare edge cases
stage: planning
priority: P3
tags: sync, desktop, bug
branch: 127-sync-housekeeping-six-leftovers-and
roadmap: sync: Sync housekeeping: six leftovers and rare edge cases.
created: 2026-10-15
summary: Rare sync problems, like two projects named only by different capitals sharing files, or stray leftover files after a crash.
area: Devices & sync
side: behind
vision: sync.follow.safety
work: session/mesh-sync-design
---
Progress
Done: a project name that differs from another only by capital letters is now refused when created, and a second folder can no longer silently join an existing project's online copy (youcoded commits 844fc4999 and b26b4cc12, 2026-09-23). A folder that is too big to sync is no longer uploaded (youcoded PR #483, 2026-09-16). Crash leftovers from artifact saves are cleaned up after an hour (youcoded artifacts/cas-write.ts).
Next: stop the resume browser from reading the old frozen index file; ignore stray temporary files during sync (decided 2026-09-02, not built); check whether any name clashes from before 2026-09-23 still exist on Destin's device; make sure a dev copy of the app cannot write to the real app's sync folder by default.
Blocked: Left out of the files batch on 2026-11-11: sync is being redesigned (cards #64, #241, #243; design stage, nothing built yet), so this waits for that. Not verified: the 'could not complete' sync error still needs a real two-device reproduction.

See also #17: 127's item (d), a dev copy of the app syncing the same Personal folder as the real app, is one of the dev-instance-touches-the-real-app faults listed in 17.

Chats
- 2026-11-12 session/mesh-sync-design: Five existing sync problems found by the slim-chats plan (docs/active/plans/2026-11-02-slim-synced-chats.md, end of file), recorded here 2026-11-12 so they outlive that plan: (1) a remote branch deleted on GitHub is treated as offline, so the next sync quietly re-uploads everything; (2) a comment in git-transport.ts claims no conflict-copy explosion but the code contradicts it; (3) info/attributes is written only when a repository is created; (4) push has a fixed 5-minute timeout; (5) the 500 MB size notice measures the local repository, not GitHub.

From the old roadmap (sync, status confirmed, seen on desktop, last checked 2026-09-01)
Sync housekeeping: six leftovers and rare edge cases. (a) Two projects made before 2026-09-23 whose names differ only by capitals ("Notes", "notes") still share one online copy and mix files. (b) If the app crashes mid-sync, saved copies of files git doesn't manage stay in the hidden sync folder forever. (c) A conversation over the size limit here, plus a change to its older copy on another device, may fail every sync with "Sync merge could not complete" (reasoned, not reproduced). (d) A dev copy of the app syncs the same Personal folder as the real app and they race each other (once let six over-limit files into history; now blocked at upload). (e) The old frozen conversation index is still read by the resume browser as a fallback; delete it once unneeded. (f) Decided 2026-09-02: ignore stray `*.tmp` files everywhere (a crash can strand one and it rides to every device), which would also stop syncing a file a user genuinely named `.tmp`.

From the 2026-10-16 document sweep
- Destin confirms the GitHub row in Account > Connected accounts shows an in-app sign-in (Gate C). Source: docs/active/handoffs/2026-07-10-sync-completion-handoff.md
- Deferred manual step: compact the remote `.git` history. Source: docs/active/handoffs/2026-07-10-sync-completion-handoff.md
- The sync-spaces 120-second idle poll (now in sync-spaces/engine.ts) is free to pick up. Source: docs/active/handoffs/2026-07-10-review-followups.md
