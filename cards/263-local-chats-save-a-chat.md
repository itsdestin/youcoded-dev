---
id: 263
title: Local chats: save a chat's place to disk so coming back is instant
stage: explore
tags: local-models, performance, desktop
related: 226
branch: 263-local-chats-save-a-chat
created: 2026-11-14
why: Destin 2026-11-13: 'i'd like to look at this for sure'. Measured on the Z13: a 27,500-token chat restored in half a second instead of a 54-second re-read and survived an engine restart, at 3 GB on disk. But Qwen3.8-27B reported success and re-read everything (its memory is not fully saved), so it must be limited to models proven to work, checked after every restore, and disk use capped. Next: test the 9B and 35B (USB drive). Details: youcoded/docs/engine-dependencies.md, slot save/restore.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
