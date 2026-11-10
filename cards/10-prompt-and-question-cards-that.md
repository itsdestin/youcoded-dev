---
id: 10
title: Question and approval cards that stick or vanish
stage: explore
priority: P3
tags: claude-code-integration, tool-cards, bug
branch: 10-prompt-and-question-cards-that
created: 2026-10-15
summary: Some cards keep saying "running" after a resume, and reloading the window can hide a question Claude Code is still waiting on.
area: Chat
side: both
vision: chat.steer.permissions
---
Progress
Done: Permission asks no longer expire quietly after five minutes; they are held for two hours (youcoded #562). A Claude Code trust-folder prompt no longer leaves the chat stuck on 'Initializing' (youcoded #564). Open permission asks come back when a window reloads or a phone reconnects (youcoded one-core R5-2, Oct 2026). Commands no longer stay 'Running' forever, including after reopening (youcoded #716, Nov 5). RETESTED 2026-11-10 in a dev copy, all passed: (a) resuming a Claude Code chat whose tool was cut off shows 'Ran a command', not Running; (c) a question card comes back after a window reload and can still be answered (Claude Code question, and a permission card on YouCoded's own engine); a remote browser that connects mid-question sees the card.
Next: Not closed because three parts were not staged: a PLAN question across a reload (only an ordinary question and a permission card were tried), the Android prompt path, and the buddy window's feed. Check those three, then close.
Blocked: Android and the buddy window need hands on the device/window.

Chats

From the old roadmap (claude-code-integration, status confirmed, seen on all, last checked 2026-07-17)
Prompt and question cards that stick or vanish: 3 faults. (a) After resuming a Claude Code session some tool cards still show as running; the native half shipped, Claude Code has no mid-turn idle signal to clear them. (b) Three more ways a prompt card can outlive its prompt (a remote client that connected mid-prompt, Android's prompt hook, the buddy window's feed). (c) Reloading the app window while a permission or plan question waits makes its card disappear: the terminal looks blank and chat looks idle while Claude Code still waits, now up to 2 hours.
