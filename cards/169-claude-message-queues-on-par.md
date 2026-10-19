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
Done: Integrated queue passed full desktop verification before final GUI/review. Real GUI verified FIFO across batches, edit preserving attachments, cancel preventing delivery, Stop retaining queued intent. GUI found duplicate Clear identity race; deterministic RED/GREEN fix compiled. Final review found7 additional recovery/lifecycle gaps now assigned for fixes.
Next: Fix unknown-enqueue duplicate risk, durable edit transfer/reload, SendNow cleanup ordering, restored uncertain CheckDelivery, safe epoch/retirement lifecycle, Stop independent of bridge health, and refused-attachment cache cleanup. Then rerun fullverification and realGUI Clear/resume/restart/failure cases and package. Existing UI reused; no paidcalls.
Blocked: No testable queue package yet. Do not claim prior green full suite covers final-review failure cases; app source fixes in progress. User .4 test copy remains unaffected.

Chats
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
