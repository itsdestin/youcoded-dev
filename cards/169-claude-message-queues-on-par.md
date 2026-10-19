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
Done: Behavior deck submitted: deliver after current action batch; Stop current work only; restore waiting messages paused after restart; Clear keeps queue paused. Answers saved in docs/active/design/2026-10-19-claude-queues/claude-queues.questions.answers.json.
Next: Run bounded no-account real-CLI timing probe for native-style between-batch delivery; then design shared-renderer queue UI from native strip/composer/Context references. Do not substitute end-of-turn semantics silently. Keep Escape Stop and uncertain-delivery safety.
Blocked: Native-style mid-task delivery capability not yet proven; no backend/UI implementation approved. Uncommitted direct-control branch11 remains separate.

Chats
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
