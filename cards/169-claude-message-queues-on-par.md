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
Done: Four behavior choices approved and recorded. Free actual CLI2.1.303 timing probes verified: direct mods submit waits until idle/new turn; native PTY enqueue is absorbed after current tool batch in same turn, persisted once as genuine human queued_command and projected by existing parser. Parent independently reran evidence checker.
Next: Probe bounded batch-boundary handoff before UI promises: app retains editable messages; PostToolBatch held; PTY delivers one chosen head; verify native acceptance then release. Need prove one-per-batch ordering and safe failure/reentrancy. No fabricated user history or system-context substitution. Then design actual queue UI.
Blocked: Direct-only API does not satisfy approved native-style timing. Host-owned editable queue over native boundary delivery remains unproven. Original rejected PostToolBatch-submit case is retained as failure, not all-green coverage.

Chats
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
- 2026-10-19 session/169-claude-message-queues: chat started
