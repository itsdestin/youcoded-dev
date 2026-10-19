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
Done: Storage/input preparation and standalone transport implemented; six actual-CLI cases and299 focused tests passed. Existing-UI/runtime wiring underway. Fresh transport review found3 additional races not covered by those cases; accepted and assigned with concrete RED regressions.
Next: Fix delayed admission ack past fence expiry, admitted-but-never-invoked recovery, and stale untouched-claim correlation. Finish Task3 positive host gates, shared queue IPC/strip/composer, lifecycle restore/Clear/Stop. Then independent app walkthrough, fullverify and test package.
Blocked: Final queue app acceptance blocked on transport review fixes and integration verification. User .4 test copy remains separate/unchanged; no paid calls or publication.

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
