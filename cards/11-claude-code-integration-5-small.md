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
Done: Real Haiku A/B and repeated no-cost Stop cross-over complete. @file routing fixed; owner-approved Escape Stop restored for UI/phone with old-client host guard.99 scoped tests and fresh review passed. Final combined verify.sh --full passed every gate including screens/journeys; Linux test build1.3.1-cc-controls.4 built and preserved separately.
Next: Updated test build: /home/destin/YouCoded-Test-Builds/claude-direct-controls-escape-20261019. Open .2 window untouched. Keep Escape Stop. Follow-ups: bounded closed-session retirement, initial Auto-mode display, instructions/provenance/ask-deny/queue/resume/reconnect parity, actual Android/Windows/macOS runtime verification; native first-run menus and structured facts/media on #12. Review incoming master changes before any authorized integration.
Blocked: No remaining failure in final desktop verification. Source uncommitted/unmerged; no commit/merge/push/release authorization. User must choose when to replace/reopen the currently running older test copy.

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
