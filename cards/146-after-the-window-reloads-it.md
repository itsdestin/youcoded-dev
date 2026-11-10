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
Done: FIXED on branch session/release-safety (app repo), NOT merged yet (2026-11-10). After a reload, a desktop window reopens the chat it was showing; each window remembers its own; if that chat is gone it opens the first chat as before. Phones are unchanged. Tested in a dev copy: three chats and reload on the last and the middle one, a message typed after reload went to the right chat, two reloads in a row, a closed chat, no chats at all, two windows, and a full quit and relaunch. All passed, no errors. Reviewed twice; full desktop checks pass.
Next: Destin: merge decision for session/release-safety. Side effect fixed on the workspace branch of the same name: the screenshot tool reuses one tab, so it now clears that tab's memory between screens.
Blocked: Waiting for Destin's word to merge.

Chats

From the old roadmap (user-interface, status needs-verify, seen on all, last checked 2026-10-05)
After the window reloads it returns to the first session instead of the one you were on. Seen 2026-10-05 in the performance rig's reload test (a chat message typed after the reload went to the wrong session); not caused by the performance work
