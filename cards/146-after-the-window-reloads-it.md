---
id: 146
title: Reload returns to the wrong chat
stage: planning
priority: P3
tags: user-interface, bug
report: docs/archive/investigations/2026-10-04-performance-gap-review.md
branch: 146-after-the-window-reloads-it
roadmap: user-interface: After the window reloads it returns to the first session ins
created: 2026-10-15
summary: After the window reloads it jumps to the first chat, so a message typed next can go to the wrong conversation.
area: Chat
side: both
vision: chat.converse.multi
---
Progress
Done: The cause is found in the code. When the app window reloads, it opens the oldest chat that is still open, not the chat you were on. Nothing on the desktop saves which chat was on screen (phones already remember theirs). Not fixed on master as of 2026-11-08.
Next: Decide whether to fix it (remember the chat on screen across a reload, desktop only). Then re-test on a dev copy of the app, not the installed one, to confirm what the user sees.
Blocked: Nothing recorded. The live behaviour needs a re-test on the dev instance.

Chats

From the old roadmap (user-interface, status needs-verify, seen on all, last checked 2026-10-05)
After the window reloads it returns to the first session instead of the one you were on. Seen 2026-10-05 in the performance rig's reload test (a chat message typed after the reload went to the wrong session); not caused by the performance work
