---
id: 205
title: Phone access: the assistant's browser asks for approvals you can't see
stage: merged
work: session/user-notify
tags: remote-access, remote, bug
related: 87, 112
vision: chat.steer.websearch, sync.follow.remote
branch: 205-phone-access-the-assistant-s
created: 2026-10-26
why: Using YouCoded from my phone over remote access, I never saw the browser window or its approval prompts. The assistant's Reddit clicks waited, timed out, and then were refused as 'already declined' even after I said go — 'thats a youcoded issue we should fix.'
---
Progress
Done: Rebuilt on current code (session/phone-followups, commit 25ec51176): the assistant's browser approval card now reaches a phone, looks like the computer's card and can be answered there; tests and phone-width pictures pass. Not yet tried on a real phone.
Next: Real-phone check (checklist). Decide whether the phone's dot turns red and chimes for it (belongs with notify-user work).
Blocked: Red dot / chime waits on Destin's call.

Chats
