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
Done: Durable queue/store, input formatter and standalone production transport implemented.299 focused tests plus types/lint/compile passed; six disconnected actual-CLI transport cases passed and parent independently checked evidence/hashes. Retirement retry and lost cancellation reply fixed. Parent edit coordinator now captures sendEpoch once and retains it across retries; state/edit integration tests green.
Next: Task3 in progress: lazy per-instance runtime binding, authoritative input-safe gate, queue IPC/shared snapshots, and existing native queue strip/composer wiring. Then parent isolated app walkthrough for FIFO/edit/remove/files/SendNow/Stop/Clear/restart, fullverification and Linux test package.
Blocked: No user decision needed. No actual end-to-end queue app build yet; standalone transport proof is not final app acceptance. No paid calls, production changes or publication.

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
