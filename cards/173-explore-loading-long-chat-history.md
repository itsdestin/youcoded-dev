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
Done: Overnight 2026-11-12: tried to re-measure with the speed lab, but the computer never got quiet (load 40-128 from other sessions), so no numbers and no changes.
Next: Re-run the lab on an idle machine (startup, history, workload, terminal, artifacts, scrollback phases). See speed REPORT notes.
Blocked: nothing hard; related experiments are paused (docs/active/plans/2026-09-29-history-rendering-and-stalls.md).

Chats
