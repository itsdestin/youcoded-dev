---
id: 146
title: Reload returns to the wrong chat
stage: planning
priority: P3
tags: user-interface
report: docs/archive/investigations/2026-10-04-performance-gap-review.md
branch: 146-after-the-window-reloads-it
roadmap: user-interface: After the window reloads it returns to the first session ins
created: 2026-10-15
summary: After the window reloads it jumps to the first chat, so a message typed next can go to the wrong conversation.
area: Chat
side: both
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (user-interface, status needs-verify, seen on all, last checked 2026-10-05)
After the window reloads it returns to the first session instead of the one you were on. Seen 2026-10-05 in the performance rig's reload test (a chat message typed after the reload went to the wrong session); not caused by the performance work
