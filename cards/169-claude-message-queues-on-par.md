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
Done: Filed approved queue planning; inspected native queue strip, composer, Context menu and host/driver behavior. Native messages can join after a tool batch; Stop retains submitted queue. Prepared and visually previewed four-question behavior deck. No queue code implemented.
Next: Answer docs/active/design/2026-10-19-claude-queues/claude-queues.questions.json: delivery timing, Stop, restart persistence and Clear. Then verify Claude capability for chosen timing and design against native surfaces. Coordinate with #11 and #62; uncommitted mods work stays in session11.
Blocked: Awaiting behavior decisions. Component deps have19 missing/outdated packages, irrelevant to questions but must be resolved before workbench build.

Chats
- 2026-10-19 session/169-claude-message-queues: chat started
