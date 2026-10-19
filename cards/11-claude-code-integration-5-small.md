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
Done: Eight real Haiku A/B prompts completed. @file routing now fixed conservatively before direct dispatch;4 red regressions then16 control tests green, fresh review clean, full desktop verification and Linux .3 build passed. Stop independently rechecked without paid calls in two 2x2 cross-over runs: direct abort allowed subprocess completion/follow-on Write4/4; Escape0/4. Running user .2 copy untouched.
Next: Resolve running-tool Stop semantics before merge (consider retaining deliberate legacy Escape pending safe structured cancellation). Keep bounded closed-session retirement, initial Normal-versus-Auto display, instructions/provenance/ask-deny/queue/resume/reconnect parity and actual Android/Windows/macOS runtime verification as follow-ups. Native first-run cards, structured read-only live facts and media/interaction exploration remain on #12. Evidence: docs/active/investigations/2026-10-18-claude-controls-build/STOP-RECHECK.md and REAL-AB-REVIEW.md.
Blocked: Do not merge unchanged: running-tool Stop regression confirmed independently of model variability and prompt transport. Source uncommitted; no merge/push/release authorization. Further real-model tests need approval; latest recheck was entirely local/fake API.

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
