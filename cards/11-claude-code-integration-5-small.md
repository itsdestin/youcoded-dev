---
id: 11
title: Claude Code connection: five small faults
stage: planning
priority: P3
tags: claude-code-integration, regression, bug
branch: 11-claude-code-integration-5-small
roadmap: claude-code-integration: Claude Code integration: 5 small faults.
created: 2026-10-15
summary: A broken settings file is replaced without telling you, one warning looks different from the rest, and Android needs a newer Claude Code.
area: Chat
side: both
vision: chat.converse.cloud
work: session/11-claude-direct-controls
---
Progress
Done: Real Haiku comparison and controlled Stop recheck completed. @file routing fixed and fully verified. Owner chose to keep Escape Stop: current UI now sends one ESC, host declines old clients mods-Stop before dispatch; scoped desktop/phone routing tests passed and fresh review found no Important issues. Final combined full check/build running.
Next: Keep Escape Stop; do not pursue coordinated mods cancellation now. Retain bounded closed-session retirement, initial Normal-versus-Auto display, instructions/provenance/ask-deny/queue/resume/reconnect parity and Android/Windows/macOS runtime verification as follow-ups. Native first-run cards and structured live-facts/media exploration remain on #12. Source is uncommitted/unmerged; running .2 test copy is not overwritten.
Blocked: Await final combined verification/build; no commit/merge/push/release authorization. Existing .2 test copy still has original behavior until explicitly updated/reopened.

See also #15: 11(e) and 15(h) both say the recorded Claude Code screens the tests replay go stale, so a reworded prompt in a newer Claude Code breaks the app without failing a test.

Chats
- 2026-10-19 session/11-claude-direct-controls: chat started
- 2026-10-19 session/11-claude-direct-controls: chat started
- 2026-10-19 session/11-claude-direct-controls: chat started
- 2026-10-18 session/11-claude-direct-controls: chat started
- 2026-10-18 session/11-claude-direct-controls: chat started
- 2026-10-18 session/11-claude-direct-controls: chat started

From the old roadmap (claude-code-integration, status confirmed, seen on all, last checked 2026-09-16)
Claude Code integration: 5 small faults. (a) If `~/.claude/settings.json` cannot be read at launch, the app moves it aside as a `.corrupt-<time>` backup and writes a fresh one, telling nobody; wanted an in-app notice with an open button. (b) A launch-time hook change is silently skipped when another writer holds the file's lock over 3 s, seen only on an overloaded Windows CI runner; leave it, raise the wait to ~10 s, or say so in the app. (c) Fast mode's "Billed Per Token" warning is a one-off box, not the shared warning box. (d) On Android, protection stopping a `claude` started in a chat from taking over that chat does nothing until Android's bundled Claude Code (2.1.112) is updated. (e) The recorded Claude Code screens the tests replay are from 2.1.281; a reworded prompt in a newer version would pass tests and break the real thing — re-record them.
