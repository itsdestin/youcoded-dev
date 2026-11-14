---
id: 264
title: Local chats: rough edges left after the engine fixes
stage: explore
tags: local-models, native-harness, desktop, bug
related: 226
branch: 264-local-chats-rough-edges-left
created: 2026-11-14
why: Found by the independent review of #226 (2026-11-12) and left unfixed: several local chats open at app start are read ahead one after another, keeping the chip busy for minutes; a stuck read-ahead blocks the others (no time limit); a chat whose single newest message is too big to fit is still a dead end; a cut-off summary is retried once unchanged; text that looks like a tool call inside a real summary can make it look like junk; in an over-full chat tool results drop to 2,000 characters (the saved file covers it). Also not yet watched in a running app: re-read on return and the faster-writing safety net.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
