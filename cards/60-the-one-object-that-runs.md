---
id: 60
title: Split up the oversized code (chat engine and app shell)
stage: planning
priority: P1
tags: native-harness, sessions, desktop, release-blocker, user-interface, performance, housekeeping
release: v1.3.1
report: docs/active/plans/2026-09-16-simplification-phases.md
branch: 60-the-one-object-that-runs
roadmap: native-harness: **v1.3.1 release blocker.** The one object that runs a nativ
created: 2026-10-15
summary: Two very large code files (the chat engine and the app shell) are hard to change safely and need splitting into parts.
area: Chat
side: behind
platform: Desktop only
paused: On hold since 2026-09-18 until other cleanup lands
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: yes — the old roadmap marked it blocked; see below.

Chats

From the old roadmap (native-harness › sessions, status blocked, seen on desktop, last checked 2026-09-18)
**v1.3.1 release blocker.** The one object that runs a native conversation is 4,756 lines because it also runs the helper agents (specialists), which have their own home, and hosts the shell sessions. Wanted: the helper block and the shells moved out along the seam the audit names, with registry, lifecycle and reserve/bind/release kept on one object (phase 5, D4). Nothing changes on screen. On hold since 2026-09-18 (Destin) until the session-host test split has merged and phase 4 of the one-core work is done

Merged in #144 "Finish the whole-app cleanup: two pieces left"
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (user-interface, status needs-verify, seen on all, last checked 2026-09-01)
Unfinished whole-UI cleanup (2 things). (a) Whole-UI review Phase F (P-17 and the marketplace rails) is the last phase still to decide and build; (b) the main app shell is still one ~4,650-line component with three planned extraction steps left (welcome screen and session hooks, memoised areas, event-bridge mount).
