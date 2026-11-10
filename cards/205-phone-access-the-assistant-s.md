---
id: 205
title: Phone access: the assistant's browser asks for approvals you can't see
stage: explore
work: session/user-notify
tags: remote-access, remote, bug
related: 87, 112
vision: chat.steer.websearch, sync.follow.remote
branch: 205-phone-access-the-assistant-s
created: 2026-10-26
why: Using YouCoded from my phone over remote access, I never saw the browser window or its approval prompts. The assistant's Reddit clicks waited, timed out, and then were refused as 'already declined' even after I said go — 'thats a youcoded issue we should fix.'
---
Progress
Done: A phone-side approval card and a phone answer button were written on a side branch (session/user-notify, commit 4bb81c6b4, 2026-10-26). They are not on the main app yet.
Next: decide whether to finish that branch (it is far behind and has conflicts) or rebuild the fix on current code, then test on a real phone.
Blocked: the side branch has merge conflicts with the current app, and no real-phone test has been done.

Chats
