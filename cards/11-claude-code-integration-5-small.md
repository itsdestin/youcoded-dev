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
Done: The Claude direct controls and the message queue that waits for you now work in the app (app PR #657, merged 2026-10-20; tracked as card 169). 2026-11-11 (chat-engine batch, app branch session/chat-engine-batch, not merged): checked against code: (c) ALREADY FIXED 2026-10-13 (253c34c63, shared warning box); (d) ALREADY FIXED 2026-10-14 (Android ships Claude Code 2.1.300, old lock deleted). (b) built: when another program holds settings.json at launch, one background retry 5 s later waits up to 10 s; launch is not slowed; dev-copy tested (hooks part cannot run in a dev copy).
Next: Destin to approve wording before anything is built: (a) a notice when a broken settings.json is replaced; (b) optionally a notice when a change is still skipped after the retry. Note (b) also covers plugin hooks, prompt suggestions off, and the keep-chat-history setting. (e): startup and pop-up recordings are re-checked daily against the newest Claude Code; only the plan-menu and session-live-facts recordings (2.1.281) are stale; re-recording needs one signed-in short Haiku run (test-conpty/capture-plan-menu.mjs).
Blocked: Nothing blocks the shipped part. Needs a real Android, Windows and Mac run to confirm the rest.

See also #15: 11(e) and 15(h) both say the recorded Claude Code screens the tests replay go stale, so a reworded prompt in a newer Claude Code breaks the app without failing a test.

Chats
- 2026-10-19 session/11-claude-direct-controls: chat started
- 2026-10-18 session/11-claude-direct-controls: chat started

From the old roadmap (claude-code-integration, status confirmed, seen on all, last checked 2026-09-16)
Claude Code integration: 5 small faults. (a) If `~/.claude/settings.json` cannot be read at launch, the app moves it aside as a `.corrupt-<time>` backup and writes a fresh one, telling nobody; wanted an in-app notice with an open button. (b) A launch-time hook change is silently skipped when another writer holds the file's lock over 3 s, seen only on an overloaded Windows CI runner; leave it, raise the wait to ~10 s, or say so in the app. (c) Fast mode's "Billed Per Token" warning is a one-off box, not the shared warning box. (d) On Android, protection stopping a `claude` started in a chat from taking over that chat does nothing until Android's bundled Claude Code (2.1.112) is updated. (e) The recorded Claude Code screens the tests replay are from 2.1.281; a reworded prompt in a newer version would pass tests and break the real thing — re-record them.
