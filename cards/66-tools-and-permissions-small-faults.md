---
id: 66
title: Assistant tools and permissions: six small faults
stage: planning
priority: P3
tags: native-harness, tools, desktop
branch: 66-tools-and-permissions-small-faults
roadmap: native-harness: Tools and permissions: small faults and checks — 6 things.
created: 2026-10-15
summary: Small models stumble on edits, there's no Skip Permissions for local models, and huge pictures stall and leave copies behind.
area: Chat
side: both
platform: Desktop only
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (native-harness › tools, status confirmed, seen on desktop, last checked 2026-08-12)
Tools and permissions: small faults and checks — 6 things. (a) The assistant's standing instructions grew about five times on 2026-09-05; the effect on a small model is unmeasured (two runs inconclusive); needs repeated runs, and the compact local prompt and "keep going" looping are untested. (b) After the shell has moved folders, Read and Bash can open two different files for one relative name; Destin to decide whether to reject relative paths (needs more investigation; report: docs/active/investigations/2026-09-01-multi-model-cwd-contract.md). (c) Small local models loop on Edit "old_string not found" over smart quotes, trailing spaces and Unicode dashes; wanted: one normalisation pass, after measuring. (d) Nobody has read a PDF with the native agent in an installed build; the reader's extra files are unverified outside a dev instance. (e) Local and OpenRouter sessions have no "Skip Permissions"; the toggle is hidden and the chip stops at Full Auto (report: docs/active/investigations/2026-09-01-native-no-bypass-mode.md). (f) Pictures too big for the model (2026-10-07): shrinking a very tall one briefly takes about 0.6–1.2 GB of memory; the shrunk copies are never cleaned up — wanted: a sweep of the `image-cache` folder by size or age (each copy up to 10 MB, one per provider switch); after switching to a stricter model a shrunk picture becomes a note instead of being shrunk again; after sending a huge picture the desktop shows nothing for up to ~30 s — wanted: a "preparing" state; ChatGPT's exact rejection was never captured, so its wording is matched from a screenshot, and OpenAI's longest-edge limit (8192 px) is a guess — wanted: capture a real rejection for each; no host-level test covers the checkpoint's `image-oversized` fallback — wanted: seed a pre-gate history on a lax profile, publish, reopen with the real profile; a prepared picture the provider still rejects ends up with both a "downscaled" note and an "oversized" note in one message.
