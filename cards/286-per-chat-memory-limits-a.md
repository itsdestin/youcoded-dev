---
id: 286
title: Per-chat memory limits: a runaway chat stops only itself, not the whole computer
stage: explore
tags: desktop, performance, crash, reliability
related: 93
vision: chat.converse.multi
branch: 286-per-chat-memory-limits-a
created: 2026-11-27
why: the youcoded app and my whole ass desktop crashed AGAIN ... we should add per-chat memory limits as a youcoded card
---
Progress
Done: nothing yet.
Next: Plan it. Background: on 2026-11-18 and twice on 2026-11-27, one chat ran a test that kept launching copies of itself (about 1,000 programs a second) until all 121 GB of memory was full, and the whole desktop froze. Every chat, the app and the desktop share one memory pool, and Linux's emergency brake never fired. Idea: start each chat's programs inside its own fenced box with a memory cap and a process-count cap (Linux: a systemd scope per chat with MemoryMax and TasksMax; Windows: Job Objects; Mac: weaker options). When a box trips, only that chat stops, and it shows a plain message whose wording and look Destin approves first. Full incident in ~/system/machines/z13/issues.md (the 2026-11-18 out-of-memory entry).
Blocked: nothing.

Chats
