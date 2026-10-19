---
id: 169
title: Claude message queues on par with native sessions
stage: planning
tags: claude-code-integration, chat-data, sessions, feature
vision: chat.converse.queue
branch: 169-claude-message-queues-on-par
created: 2026-10-19
why: I want to think through how we might build real message queuing on-par with native sessions now that we've changed how input works. YouCoded owns waiting messages; define editing/removal and Stop, Clear, and reconnect behavior. Coordinate with #11 integration and #62 native queue defects without duplicating their scope.
work: session/169-claude-message-queues
---
Progress
Done: Prepared implementation plan and fresh design review. Safely imported tested direct-control foundation into169, preserved source11, independently copied matching deps; types and677 focused tests passed. No queue service implemented yet. Actual-worker long Unicode succeeded only after exact composer verification; file-bearing batch delivery did not pass equivalent checks.
Next: Answer single Q5 scope reopener: allow attachments/@file messages to wait until idle in first test build, preserving FIFO/edit/remove, or require full input parity first. Then revise delivery protocol/state machine per accepted C1-C3/I1-I5 design findings and implement shared native-UI backend. Baseline verification failure repairs are separately assigned.
Blocked: Await Q5 answer at docs/active/design/2026-10-19-claude-queues/claude-queues.input-scope.json. Cannot silently weaken approved batch timing for files or claim current short-line proof covers general input. No testable queue build yet.

Chats
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
