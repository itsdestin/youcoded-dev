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
Done: Host queue/state/storage and file-instruction formatter implemented; parent reran58 foundation tests successfully. Lifecycle review fixes address stale aliases and long-lived capacity. Single-module native admission and explicit file-read paths proven with fake API. Standalone edit-transfer coordinator built; real-host lost-cancel regression exposed one settlement fix now assigned.
Next: Complete authenticated Claude delivery adapter/plugin/worker integration, including retirement retry and idempotent checkout cancellation, then wire existing native queue controls and atomic attachment-preserving composer refill. Run real-app fake-API walkthrough and full checks; package separate test build.
Blocked: No user decision needed. Transport integration and final UI wiring/tests still underway; no testable queue build yet. No paid calls or production app changes.

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
