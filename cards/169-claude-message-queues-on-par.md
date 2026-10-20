---
id: 169
title: Claude message queues on par with native sessions
stage: merged
tags: claude-code-integration, chat-data, sessions, feature
vision: chat.converse.queue
branch: 169-claude-message-queues-on-par
created: 2026-10-19
why: I want to think through how we might build real message queuing on-par with native sessions now that we've changed how input works. YouCoded owns waiting messages; define editing/removal and Stop, Clear, and reconnect behavior. Coordinate with #11 integration and #62 native queue defects without duplicating their scope.
work: session/169-claude-message-queues
---
Progress
Done: Merged app PR #657 at a00cb691604c4013d50f1b15f96011bb1d37a27c and workspace archive PR #283 at f27fd4af85f150856ee866b6932a18349f419332. Integrated desktop verify: 8614 tests, all gates; screenshot tools 58/58; Android JVM36/36; required CI Android APKs and four Linux packages green. Direct dismissal/restart real burst30/30; tutorial flicker fixed. Branches/worktrees removed after remote ancestry and evidence backup verification.
Next: None for this completed item. Broader direct-control/native-queue follow-ups remain under existing #11/#12/#62.
Blocked: No merge blocker. No release or installed-app update. Windows/macOS/device runtime not exercised. Optional slow-tool post-dismiss walkthrough unrun; deterministic batch and actual rapid-recovery checks passed. Test .2 predates final tip fix and upstream integration.

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
