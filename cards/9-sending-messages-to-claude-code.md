---
id: 9
title: Messages to Claude Code: two unconfirmed glitches
stage: planning
priority: P3
tags: claude-code-integration, chat, needs-repro
branch: 9-sending-messages-to-claude-code
roadmap: claude-code-integration: Sending messages to Claude Code: 2 unproven faults.
created: 2026-10-15
summary: A sent message occasionally appears twice, and a typed number may be mistaken for an answer to Claude Code's rating question.
area: Chat
side: behind
---
Progress
Done: nothing recorded.
Next: check it still happens.
Blocked: nothing recorded.

Chats

From the old roadmap (claude-code-integration, status needs-verify, seen on all, last checked 2026-09-23)
Sending messages to Claude Code: 2 unproven faults. (a) "Very rarely a message I send appears twice in chat, more often with very long messages." One cause is fixed (a pasted tab); a second remains where Claude Code saved the message, never answered, then saved it again 7–49 s later, matching the app's 8-second "press Enter again" retry. Next: reproduce in a dev instance with the keystroke trace on. (b) Claude Code's "How is Claude doing this session? 1: Bad 2: Fine 3: Good" rating may swallow a leading digit of a chat message and send a rating nobody chose; unverified, it could not be triggered on demand (next: catch it live and send "1 thing").
