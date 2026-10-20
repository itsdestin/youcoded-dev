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
Done: Direct-control foundation, conservative legacy @file handling and owner-approved Escape Stop were integrated with Claude queues in app PR #657 (a00cb691604c4013d50f1b15f96011bb1d37a27c), following real Haiku A/B and no-cost Stop checks. #169 adds durable queue/recovery, direct Dismiss, edit/reload safety and burst fixes; it is merged/closed. Final integrated desktop verification, Android JVM/APK CI and Linux packaging checks passed. Original source11 checkout and separate test copies were preserved, not authoritative evidence of unmerged product code.
Next: Retain the original five-fault scope and broader direct-control follow-ups: initial Auto-mode display, instructions/provenance/ask-deny parity, control-bridge lifecycle and native first-run/structured media work coordinated with #12; actual Android-device/Windows/macOS runtime acceptance. #169 queue functionality is completed, not an outstanding integration task.
Blocked: No merge blocker for the direct-control/queue foundation: it landed in #657. No release or production-app update was performed. Retained .4/.2 test copies are older snapshots; do not infer current implementation or running-window state from them. Broader #11 work remains open.

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
