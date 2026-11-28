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
Next: FIRST, when the desktop PC is reachable again (ssh destin@100.79.40.94 stopped answering during a #226 test on 2026-11-12): remove the test folder ~/yc-test-226 and any test llama-server on port 9990 there. Never touch the real app, ~/.youcoded or port 9920 on it.
Blocked: nothing.

Chats
