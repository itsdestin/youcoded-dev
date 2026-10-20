---
id: 169
title: Claude message queues on par with native sessions
stage: build
tags: claude-code-integration, chat-data, sessions, feature
vision: chat.converse.queue
branch: 169-claude-message-queues-on-par
created: 2026-10-19
why: I want to think through how we might build real message queuing on-par with native sessions now that we've changed how input works. YouCoded owns waiting messages; define editing/removal and Stop, Clear, and reconnect behavior. Coordinate with #11 integration and #62 native queue defects without duplicating their scope.
work: session/169-claude-message-queues
---
Progress
Done: Claude/native shared queue, direct controls integration, FIFO/edit/attachments/Stop/Clear persistence, rapid-send race fixes, exact delivery recovery, direct Dismiss restoring future queue cycles, idle-send flicker removal, tutorial-tip flicker repair. Final dismissal 552 focused tests; 30/30 actual sends after dismiss+restart; final tip repair required desktop verify green. Linux test .2 delivered (predates tip-only repair).
Next: Explicit commit/merge authorization, integrated upstream verification and final close-out; no feature expansion.
Blocked: Not merged: implementation remains uncommitted. Android/non-Linux runtime not verified. Additional slow-tool post-dismiss walkthrough unrun; deterministic batch tests and real burst recovery green. Do not interpret close-out base-tip ancestry as shipped implementation.

Chats
- 2026-10-20 session/169-claude-message-queues: chat started
- 2026-10-20 session/169-claude-message-queues: chat started
- 2026-10-20 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
