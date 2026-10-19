---
id: 66
title: Assistant tools and permissions: faults and unclear "Always allow"
stage: planning
priority: P1
tags: native-harness, tools, desktop, permissions, tool-cards, release-blocker, bug
branch: 66-tools-and-permissions-small-faults
roadmap: native-harness: Tools and permissions: small faults and checks — 6 things.
created: 2026-10-15
summary: Small models stumble on edits, local models lack Skip Permissions, huge pictures stall, and "Always allow" doesn't say why it didn't cover a command.
area: Chat
side: both
platform: Desktop only
vision: chat.steer.permissions, chat.converse.native
work: session/66-passwordless-admin
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats
- 2026-10-19 session/66-passwordless-admin: chat started
- 2026-10-19 session/66-passwordless-admin: chat started

From the old roadmap (native-harness › tools, status confirmed, seen on desktop, last checked 2026-08-12)
Tools and permissions: small faults and checks — 6 things. (a) The assistant's standing instructions grew about five times on 2026-09-05; the effect on a small model is unmeasured (two runs inconclusive); needs repeated runs, and the compact local prompt and "keep going" looping are untested. (b) After the shell has moved folders, Read and Bash can open two different files for one relative name; Destin to decide whether to reject relative paths (needs more investigation; report: docs/active/investigations/2026-09-01-multi-model-cwd-contract.md). (c) Small local models loop on Edit "old_string not found" over smart quotes, trailing spaces and Unicode dashes; wanted: one normalisation pass, after measuring. (d) Nobody has read a PDF with the native agent in an installed build; the reader's extra files are unverified outside a dev instance. (e) Local and OpenRouter sessions have no "Skip Permissions"; the toggle is hidden and the chip stops at Full Auto (report: docs/active/investigations/2026-09-01-native-no-bypass-mode.md). (f) Pictures too big for the model (2026-10-07): shrinking a very tall one briefly takes about 0.6–1.2 GB of memory; the shrunk copies are never cleaned up — wanted: a sweep of the `image-cache` folder by size or age (each copy up to 10 MB, one per provider switch); after switching to a stricter model a shrunk picture becomes a note instead of being shrunk again; after sending a huge picture the desktop shows nothing for up to ~30 s — wanted: a "preparing" state; ChatGPT's exact rejection was never captured, so its wording is matched from a screenshot, and OpenAI's longest-edge limit (8192 px) is a guess — wanted: capture a real rejection for each; no host-level test covers the checkpoint's `image-oversized` fallback — wanted: seed a pre-gate history on a lax profile, publish, reopen with the real profile; a prepared picture the provider still rejects ends up with both a "downscaled" note and an "oversized" note in one message.

Merged in #68 "Explain why an "Always allow" didn't cover a command"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (native-harness › permissions, status confirmed, seen on desktop, last checked 2026-09-23)
**v1.3.1 release blocker.** After picking a wide "Always allow" (any `npm run`, pushing to one branch), a later command that looks covered still raises the permission card with no reason — it reads as the app forgetting the approval. Re-checked 2026-09-23: the menu now states its limits up front, but the card raised later still gives no reason

From the 2026-10-16 document sweep
- Bare Grep/Glob should not start from a huge non-git home folder; default to the project root (the 180-second deadline already shipped, #562). Sources: docs/active/specs/2026-08-17-search-scope-and-timeout-design.md, docs/active/plans/2026-08-17-search-scope-timeout-chunk-a.md
- An `rm` command analyzer, and retiring the stale `PermissionOverrides` categories. Source: docs/active/investigations/2026-08-09-native-skip-permissions.md
- Decide whether the native permission clocks (root ask: no timeout; helper ask: 5 minutes) should match the 2-hour Claude Code policy. Source: docs/archive/specs/2026-07-30-permission-ask-timeout-design.md
