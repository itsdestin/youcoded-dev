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
Done: Part of the goal already exists on master. Long chats load older messages a page at a time as you scroll up (youcoded 09de033e, 2026-08-27; 329de8c20, 2026-09-07), and messages far off screen draw as blank placeholders (desktop/src/renderer/hooks/use-entry-folding.ts). Not done: removing messages from memory. That version was tried and rejected on review on 2026-08-28, because removed messages could not be reloaded for the session.
Next: Decide with Destin whether the rest is still wanted, once the paused screen-speed work on card 93 is settled.
Blocked: nothing hard; related experiments are paused (docs/active/plans/2026-09-29-history-rendering-and-stalls.md).

Chats
