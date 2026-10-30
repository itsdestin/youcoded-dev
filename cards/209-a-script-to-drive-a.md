---
id: 209
title: A script to drive a real dev window's Claude Code chat for testing
stage: explore
tags: dev-workspace, tests
related: 7
branch: 209-a-script-to-drive-a
created: 2026-10-30
why: Testing card #207 in a real dev window took ~25 calls of ad hoc CDP scripts: create a chat (window.claude.session.create), trust the folder, switch the mode chip from the profile's default AUTO to NORMAL (auto mode never shows permission cards), send a message, click card buttons, screenshot. Long messages sent with session.sendInput stuck in Claude Code's box; a synthetic Enter or send-button click after setting the textarea did not send (card #7 has the details). explore.mjs only drives the workbench's fake backend. A scripts/ helper (start chat, set mode, say, click button by label, shot) would make this a few calls.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
