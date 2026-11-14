---
id: 173
title: Explore loading long chat history in smaller pieces
stage: explore
priority: P3
tags: desktop, chat, performance
related: 93
branch: 173-explore-loading-long-chat-history
created: 2026-10-19
why: Destin: maybe just add that one as a roadmap exploration thing (crash deck Q-5). Explore bounding displayed chat and helper-history data in memory while keeping all saved messages reloadable. This must not change model inputs, outputs, context, or durable conversation history. Tradeoff: scrolling back to unloaded messages may briefly load them again. Exploration only; no implementation approved.
---
Progress
Done: Measured with the scrollback phase: six long chats (7000/5000 entries) scrolled to the top: memory 1.55 GB -> 1.85 GB (+300 MB: 65 heap, 190 page), only 12-18 MB freed on switching away. Each older page gets slower to add: 200 ms at 1260 entries, 760 ms at 5460.
Next: Decide if freeing old pages is worth it (+300 MB is modest); page cost growth is the better target.
Blocked: nothing hard; related experiments are paused (docs/active/plans/2026-09-29-history-rendering-and-stalls.md).

Chats
