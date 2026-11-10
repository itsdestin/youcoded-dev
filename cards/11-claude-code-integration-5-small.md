---
id: 11
title: Claude Code connection: five small faults
stage: planning
priority: P3
tags: claude-code-integration, regression, bug
branch: 11-claude-code-integration-5-small
created: 2026-10-15
summary: A broken settings file is replaced without telling you, one warning looks different from the rest, and Android needs a newer Claude Code.
area: Chat
side: both
vision: chat.converse.cloud
work: session/11-claude-direct-controls
---
Progress
Done: The Claude direct controls and the message queue that waits for you now work in the app (app PR #657, merged 2026-10-20; tracked as card 169).
Next: Fix or verify the open items from the original five: (a) a broken settings file is backed up and replaced with no message to you; (b) a settings change can be skipped with no message when another program is busy with the file; (e) the saved test recordings of Claude Code are old (version 2.1.281), so a newer Claude Code could break the app without tests failing. Check (c) and (d), which look already fixed. The wider direct-control follow-ups move to card 12 or a new card.
Blocked: Nothing blocks the shipped part. Needs a real Android, Windows and Mac run to confirm the rest.

See also #15: 11(e) and 15(h) both say the recorded Claude Code screens the tests replay go stale, so a reworded prompt in a newer Claude Code breaks the app without failing a test.

Chats
- 2026-10-19 session/11-claude-direct-controls: chat started
- 2026-10-18 session/11-claude-direct-controls: chat started

From the old roadmap (claude-code-integration, status confirmed, seen on all, last checked 2026-09-16)
Claude Code integration: 5 small faults. (a) If `~/.claude/settings.json` cannot be read at launch, the app moves it aside as a `.corrupt-<time>` backup and writes a fresh one, telling nobody; wanted an in-app notice with an open button. (b) A launch-time hook change is silently skipped when another writer holds the file's lock over 3 s, seen only on an overloaded Windows CI runner; leave it, raise the wait to ~10 s, or say so in the app. (c) Fast mode's "Billed Per Token" warning is a one-off box, not the shared warning box. (d) On Android, protection stopping a `claude` started in a chat from taking over that chat does nothing until Android's bundled Claude Code (2.1.112) is updated. (e) The recorded Claude Code screens the tests replay are from 2.1.281; a reworded prompt in a newer version would pass tests and break the real thing — re-record them.
