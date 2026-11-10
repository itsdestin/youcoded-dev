---
id: 246
title: Long pasted message is typed into Claude Code but never sent; shows Unconfirmed
stage: explore
tags: claude-code-integration, chat-data, sessions, bug
related: 193, 224
branch: 246-long-pasted-message-is-typed
finish: A long pasted message sends by itself like a short one, with no Unconfirmed strip and no manual Enter in the terminal.
created: 2026-11-10
why: Destin, 2026-11-10: 'this send failed or broke our queue fro some reason?' and 'i had to dismiss and manually press enter in the terminal for it to send. it definitely broke'. He sent one long message (three pasted reports, about 170 lines) to a Claude Code chat. The chat view showed an Unconfirmed strip ('This may not have reached Claude Code'). In the terminal view the text sat in Claude Code's input box, collapsed to '[...Truncated text #1 +169 lines...]', and was not submitted until he pressed Enter by hand. ~/.claude/desktop.log at 2026-11-10T21:06:56Z: ClaudeQueue 'Native delivery classification' entered:false kind:revoked detail 'cleanupLength=1036; trimEqual=false' beforeAdmission:true composerSafe:false. Likely, not proven: Claude Code collapses a long paste, so the box text no longer equals what the app sent, and the app withholds Enter.
work: session/246-long-paste-not-sent
---
Progress
Done: Fix A built on app branch session/246-long-paste-not-sent (c82fd37a0): the queue accepts Claude Code's exact shortened box (first 500 + marker + last 500, built from our own text) and Enter submits the whole text. Unit tests (5 new, seen red with the fix off), offline real-CLI queue smoke (all modes, short and 170-line), verify.sh all green. Real dev-app sessions on Claude Code 2.1.322: idle 10,377; exactly 10,000 and 10,001; while writing; mid-task between tool steps; picture attached; @file mention; 50,000; two long queued back to back; Stop then send; short message; own draft in Claude Code's box (waited, then sent); phone-sized remote browser; permission card up (send held in chat box, sent after). All arrived whole, none Unconfirmed.
Next: Destin reviews; open question: Dismiss on an Unconfirmed row did not refill the chat box in the 2026-11-10 dev reproduction (unexplained, separate).
Blocked: nothing.

Chats
- 2026-11-10 session/246-long-paste-not-sent: chat started
