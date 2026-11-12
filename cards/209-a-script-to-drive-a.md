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
Done: Landed on master 2026-11-10 (workspace PR #356): scripts/shoot/dev-chat.mjs - start a chat in a folder, set the mode, say a message with real key presses, click a button by its label, take a picture. It refuses anything but a test copy started by the launcher, refuses when two are running unless told which, and refuses to type into a box that already holds a draft. 21 tests against a stand-in page.
Next: NOT yet tried against a real test window (none was opened overnight, because a test copy shares your real chat history - see #17). First real run must confirm: the chat appears and folder trust is clicked, the mode chip changes, a very long message sends once, a permission button is found by label.
Blocked: a first real run.

Chats
