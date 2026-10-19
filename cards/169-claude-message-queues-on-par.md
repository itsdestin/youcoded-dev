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
Done: Q5 Other owner proposed ordinary file paths plus read-this-entire-file instructions. No-cost real-CLI tests passed for text and image: same-turn instruction delivery then actual Read content. One supported plugin module also proved native versioned lease admission and revoked-Enter rejection; accepted persists once, revoked never enters history. Foundation integration/dependency isolation and baseline verification repairs completed green.
Next: Implement pure durable host queue/state/store with tests (in progress), then native admission/delivery adapter and provider-neutral wiring into existing native queue strip. Keep approved batch timing, Stop current only, restore paused and Clear keep paused. No separate UI. Apply accepted design-review protocol refinements.
Blocked: No new product choice pending. File path instructions rely on tool reading, not guaranteed preloading or model compliance. Queue service/transport/UI wiring not yet complete; no testable queue build yet.

Chats
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
