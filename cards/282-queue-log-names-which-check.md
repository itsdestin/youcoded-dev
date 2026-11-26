---
id: 282
title: Queue log names which check refused (question vs screen) instead of just input-not-safe
stage: explore
tags: claude-code-integration, dev-workspace
related: 278
branch: 282-queue-log-names-which-check
created: 2026-11-19
why: #278 investigation: 'input-not-safe' in desktop.log could mean an open question or a pop-up; telling them apart took a reproduction run of about an hour, chasing the idle tidy-up as a false lead. queueInputBlock now gives the reason; the transport's declined() log could carry it
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
