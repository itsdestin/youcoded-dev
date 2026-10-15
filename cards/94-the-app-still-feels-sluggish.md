---
id: 94
title: The app still feels sluggish: chat-switch pauses and typing interruptions (4 things, work in progress)
stage: planning
priority: P1
tags: perf, performance
report: docs/active/investigations/2026-09-29-performance-status.md
branch: 94-the-app-still-feels-sluggish
roadmap: perf: The app still feels sluggish: chat-switch pauses and typing
created: 2026-10-15
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #102: 94's chat-switch pauses (item c) are the same slow session-switch clicks that 102 measures in detail.

Chats

From the old roadmap (perf, status confirmed, seen on all, last checked 2026-09-29)
The app still feels sluggish: chat-switch pauses and typing interruptions (4 things, work in progress). (a) Sluggish across sessions and over time; earlier fixes cut specific measured costs, not overall smoothness (report: docs/active/investigations/2026-09-01-ui-sluggishness-render-cost.md); (b) opening a long conversation in the background can interrupt typing in the chat you are using: cause reproduced, candidate fixes paused, not accepted; (c) switching chats or resizing sometimes pauses much longer than usual (208 ms, one 422 ms gap), cause not pinned down; (d) the first Find in a long loaded chat can take about a second. Keep complete-page publication and instant switch-to-content intact while fixing. The uncommitted experiments of the old stream-attribution session (Find, hidden-history rendering; not safe to apply over master) are preserved on branch `backup/performance-stream-attribution-wip` in both the app and workspace repos.
