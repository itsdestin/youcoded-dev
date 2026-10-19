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
Done: Completed eight real Haiku prompts on same branch/CLI2.1.303 with mods on versus kill switch off. Both arms fixed code, passed4 tests, wrote identical Unicode checklist, and recovered on follow-up. CLI estimate total $0.01226896, not verified billing. Built Linux test copy remains local/uncommitted.
Next: Before merge: preserve typed @file expansion (real regression); make Stop cancel running tools without background notification restarting work (real regression); bound closed-session/tombstone retention (10000 closed IDs retained in probe). Then expand parity tests for instructions/origin-sensitive hooks, ask/deny, queues, resume and remote reconnect; actual Android/Windows/macOS runtime coverage. User-reported initial Normal versus Auto chip also needs correction from authoritative startup state. Evidence: docs/active/investigations/2026-10-18-claude-controls-build/REAL-AB-REVIEW.md.
Blocked: Do not merge current mods build: real @file and running-tool cancellation parity fail. Real test allowance used:8 prompts, no automatic retries. No source fixes or publication authorized by this review.

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
