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
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
- 2026-11-10 session/246-long-paste-not-sent: chat started
