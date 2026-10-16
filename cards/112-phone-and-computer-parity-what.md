---
id: 112
title: Phone and computer parity: four gaps left
stage: planning
priority: P2
tags: remote-access, one-core, remote
branch: 112-phone-and-computer-parity-what
roadmap: remote-access: Phone and computer parity: what is still missing after one-c
created: 2026-10-15
summary: Using YouCoded from a phone still lacks some things the computer has: file uploads, the game lobby, and some buttons that lag.
area: Devices & sync
side: both
platform: Phone and web
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #1: 112's remaining item (a), Android joining the shared phone protocol, is phases A2 to A4 of the Android rebuild in 1.

Chats

From the old roadmap (remote-access › one-core, status confirmed, seen on remote, last checked 2026-09-11)
Phone and computer parity: what is still missing after one-core (youcoded#604), four things. (a) Remote protocol: versioned API and event record delivered; Android joining the same protocol (A2–A4), and documenting the API, remain (blocked; sequence with the Android runtime work). (b) Native sessions work from a phone now. Destin (2026-09-11: "native sessions should work fine in remote access, no? remote access should be identical to the desktop?") still has to decide whether a phone may add or change provider keys. (c) Buttons wait for the computer before changing (Destin: "i [want] all buttons to feel as close to instantaneous as possible"): Stop, permission answer, Close, idle native send and mode chip are now instant; a native send into a busy chat, AskUserQuestion answers and keyboard Esc stop still wait. (d) Still missing over remote: the game lobby stays empty, files cannot be uploaded or edited from a phone, other unopened namespaces — each a one-line switch, Destin's call (report: docs/active/investigations/2026-09-01-remote-unbridged-channels.md).
