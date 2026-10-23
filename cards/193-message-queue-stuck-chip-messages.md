---
id: 193
title: Message queue: stuck chip messages, attachment wording, recovery, instant bubble, terminal-view stall, emoji terminal widths
stage: polish
tags: claude-code-integration, chat-data, sessions, bug
related: 169
branch: 193-message-queue-stuck-chip-messages
finish: Destin runs docs/active/handoffs/2026-10-22-queue-fixes-test-checklist.md in a dev window and the branch merges.
created: 2026-10-23
why: Destin, 2026-10-22: messages stuck on 'unconfirmed' with the text in the terminal box; 'read this whole file' applied to pasted images; no way to recover from unconfirmed; a gap between Send and the message appearing; the queue stops after switching to terminal view; a family emoji garbled the terminal and blocked sending.
work: session/queue-delivery-fixes
---
Progress
Done: Six fixes built and reviewed twice (plan + regressions); real-CLI smoke 9/9 incl. a dropped-joiner mode; 28 width probes match Claude Code 2.1.309; verify.sh green.
Next: Destin runs the dev-window checklist (item 3: Claude opens attached non-image files with only an 'Attached:' line — unproven with real Claude). Rare edge left open: an instant queue bubble whose send is accepted but never recorded stays 'sending'.
Blocked: nothing.

Chats
- 2026-10-23 session/queue-delivery-fixes: built all six fixes in youcoded + workspace branches session/queue-delivery-fixes; verify.sh green; real-CLI smoke 9/9
